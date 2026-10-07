/** Real keyless plan review and live process rendering through the shipped Web composition. */
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { acknowledgeReloadConnectionLoss, captureStableAria, compareOrRefreshGolden, launchWebScaffold,
  readPersistedEvents, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, launchTestChromium, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

const MODE = webSnapshotMode()
const PACKAGE = fileURLToPath(new URL('../../../packages/experimental/rich-inline/package.json', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./rich-inline.overlay.yml', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/rich-inline-workflow/plan-form.expected.md', import.meta.url))
const ORIGINAL = '# Original plan\n\nInspect the implementation.'
const REVISED = '# Reviewed plan\n\nAdd a focused regression before implementation.'
const RESULT = { key: 'reviewed', html: '<h1>Reviewed plan completed</h1>', css: '', js: '',
  fallbackText: 'Reviewed plan completed', stateSchemaVersion: 1 }

class WorkflowAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      const call = { type: 'tool-call' as const, id: ToolCallId('rich-workflow-plan'), name: 'exit_plan_mode', arguments: JSON.stringify({ plan: ORIGINAL }) }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'The plan is ready for review.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'The plan is ready for review.' } }
      yield { type: 'block-start', index: 1, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 1, id: call.id, name: call.name, argumentsDelta: call.arguments }
      yield { type: 'block-end', index: 1, block: call }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (this.requests.length !== 2) throw new Error('unexpected repeated workflow request')
    const text = '```rich-html\n' + JSON.stringify(RESULT) + '\n```'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe.skipIf(MODE === 'record')('rich-inline editable plan workflow', () => {
  let scaffold: WebScaffold, browser: Browser, page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const adapter = new WorkflowAdapter()
  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY, extraInstallAnchors: [PACKAGE], toolsMode: 'native' })
    scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter(['rich-workflow-keyless'], adapter), 'rich workflow test adapter')
    await scaffold.ctx.agentDefaultModel.saveSelection({ provider: 'rich-workflow-keyless', model: 'rich-workflow-scripted' })
    browser = await launchTestChromium()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)
  afterAll(async () => { await browser?.close(); await scaffold?.close() })

  it('preserves edits across refresh and returns the exact approved plan once', async () => {
    onTestFailed(() => saveFailureShot(page, 'rich-inline-workflow'))
    const settled = scaffold.whenTurnSettled(60_000)
    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, '/plan Prepare a small implementation plan.')
    await input.press('Enter')
    const form = page.locator('[data-rich-question]')
    try { await form.waitFor({ timeout: 30_000 }) }
    catch (error) { throw new Error(`${String(error)}; requests=${adapter.requests.length}; pageErrors=${JSON.stringify(tripwire.pageErrors)}; text=${await page.locator('body').innerText()}`) }
    expect(await form.getByLabel('Plan to carry out').inputValue()).toBe(ORIGINAL)
    const process = page.locator('[data-turn-process]').first()
    await process.waitFor()
    expect(await process.getAttribute('aria-expanded')).toBe('false')
    expect(await process.innerText()).toContain('The plan is ready for review.')
    expect(await page.locator('[data-turn-process-member][hidden]').count()).toBeGreaterThan(0)
    const snapshot = await captureStableAria(page, '[data-rich-question]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    await form.getByLabel('Plan to carry out').fill(REVISED)
    const warnings = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warnings)
    await form.waitFor({ timeout: 30_000 })
    expect(await form.getByLabel('Plan to carry out').inputValue()).toBe(REVISED)
    await saveFailureShot(page, 'rich-inline-plan-review')
    await form.getByRole('button', { name: 'Submit and carry out', exact: true }).click()
    const sessionId = await settled
    expect(adapter.requests).toHaveLength(2)
    const result = adapter.requests[1]?.messages.filter(message => message.role === 'tool')
      .flatMap(message => message.content).flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
    expect(result).toContain(REVISED)
    const events = await readPersistedEvents(scaffold, sessionId)
    expect(events.filter(event => event.type === 'tool/call' && event.data.name === 'exit_plan_mode')).toHaveLength(1)
    const approved = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === 'rich-workflow-plan')
    expect(approved?.data).toBeDefined()
    const recorded = approved?.type === 'tool/result' ? approved.data.message.content
      .flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') : ''
    expect(recorded).toContain(REVISED)
    expect(approved?.type === 'tool/result' ? approved.data.meta : undefined).toMatchObject({ planMode: { approved: true, plan: REVISED } })
    await page.getByText(RESULT.fallbackText, { exact: true }).waitFor()
    await page.locator('[data-plan-card]').getByText('Reviewed plan', { exact: true }).click()
    const preview = page.locator('[data-plan-preview]')
    await preview.getByRole('heading', { name: 'Reviewed plan', exact: true }).waitFor()
    await preview.getByText('Add a focused regression before implementation.', { exact: true }).waitFor()
    const secondReloadWarnings = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, secondReloadWarnings)
    await preview.getByRole('heading', { name: 'Reviewed plan', exact: true }).waitFor()
    await preview.getByText('Add a focused regression before implementation.', { exact: true }).waitFor()
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)
})

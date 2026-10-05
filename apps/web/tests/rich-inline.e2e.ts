/** Real keyless Agent/Host/Remote pipeline and Web text fallback; no native container is mocked. */
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { RichInvokeRequest, RichMountValue, RichReceipt, RichSnapshot, RichActionStatus, RichBlockId, RichFileGrant } from '@deepseek-ai/dsh-experimental-rich-inline/types'
import { acknowledgeReloadConnectionLoss, captureStableAria, compareOrRefreshGolden, launchWebScaffold, readPersistedEvents, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'
import { initialRichContent, submittedRichFields, updatedRichContent } from './fixtures/rich-inline-content.ts'

const PACKAGE = fileURLToPath(new URL('../../../packages/experimental/rich-inline/package.json', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./rich-inline.overlay.yml', import.meta.url))
const WEB_EXPECTED = fileURLToPath(new URL('./expected/rich-inline/web-fallback.expected.md', import.meta.url))
const PROVIDER = 'rich-inline-keyless-test'
const MODEL = 'rich-inline-scripted'
const PROMPT = 'Prepare my trip checklist as an inline interactive block.'
const MODE = webSnapshotMode()

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** Invoke the real generated Remote using this scaffold's authenticated HTTP carrier. */
async function remote<T>(target: WebScaffold, method: string, request: object): Promise<T> {
  const response = await target.hostFetch(`/api/richInline/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `rich-test-${randomUUID()}`, method: `richInline/${method}`, payload: { args: { request } } }),
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { result: RpcResult<T> }
  if (!body.result.ok) throw new Error(`${body.result.error.code}: ${body.result.error.message}`)
  return body.result.value
}

function textChunks(text: string): StreamChunk[] {
  return [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'usage', usage: { inputTokens: 16, outputTokens: 8 } },
    { type: 'finish', reason: { kind: 'stop' } }]
}

function toolChunks(name: string, args: object, step: number): StreamChunk[] {
  const id = ToolCallId(`rich-test-call-${step}`), argumentsJson = JSON.stringify(args)
  return [{ type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 16, outputTokens: 8 } }, { type: 'finish', reason: { kind: 'tool-calls' } }]
}

/** Deterministic model calls still pass through the shipped Agent loop and real tool execution. */
class RichAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  blockId: RichBlockId | undefined
  private pausedResolve!: () => void
  private continueResolve!: () => void
  private actionResolve!: () => void
  readonly partialMarker = new Promise<void>((resolve) => { this.pausedResolve = resolve })
  private readonly continuation = new Promise<void>((resolve) => { this.continueResolve = resolve })
  private readonly actionContinuation = new Promise<void>((resolve) => { this.actionResolve = resolve })
  release(): void { this.continueResolve(); this.actionResolve() }
  finishMarker(): void { this.continueResolve() }
  finishAction(): void { this.actionResolve() }
  override async listModels(provider: string) { return [{ provider, id: MODEL, name: MODEL }] }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const call = this.requests.length
    if (call === 1) { yield* toolChunks('rich_inline_publish', initialRichContent, call); return }
    if (call === 2) {
      const toolText = options.messages.filter(message => message.role === 'tool').flatMap(message => message.content)
        .flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      const marker = /```rich-inline\n(\{"blockId":"[^"]+"\})\n```/u.exec(toolText)
      if (marker?.[1] === undefined) throw new Error('real publish tool did not provide a rich marker')
      this.blockId = (JSON.parse(marker[1]) as { blockId: RichBlockId }).blockId
      const reply = `Checklist follows.\n\n${marker[0]}\n\nOrdinary chat prose remains below it.`
      const cut = reply.indexOf('```', reply.indexOf('```') + 3)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: reply.slice(0, cut) }
      this.pausedResolve()
      await this.continuation
      options.signal?.throwIfAborted()
      yield { type: 'text-delta', index: 0, text: reply.slice(cut) }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if (call === 3) {
      const userText = options.messages.filter(message => message.role === 'user').flatMap(message => message.content)
        .flatMap(block => block.type === 'text' ? [block.text] : []).findLast(text => text.startsWith('Interactive input '))
      if (userText === undefined) throw new Error('submitted rich action did not reach this Agent session')
      const action = JSON.parse(userText.slice('Interactive input '.length)) as { actionId: string; inputTrust: string; values: object }
      expect(action.inputTrust).toBe('untrusted-rich-ui')
      expect(action.values).toMatchObject(submittedRichFields)
      // LLM projection deliberately replaces durable file blocks with read-only handle text.
      expect(options.messages.filter(message => message.role === 'user').flatMap(message => message.content)
        .some(block => block.type === 'text' && block.text.startsWith('[File "trip-notes.txt" ('))).toBe(true)
      await this.actionContinuation
      options.signal?.throwIfAborted()
      yield* toolChunks('rich_inline_complete', { actionId: action.actionId, state: 'completed', values: updatedRichContent.values }, call)
      return
    }
    if (call === 4) { yield* toolChunks('rich_inline_publish', { ...updatedRichContent, blockId: this.blockId }, call); return }
    if (call === 5) { yield* textChunks('Trip updated in the original message.'); return }
    throw new Error(`unexpected model call ${call}; the test never delegates to a paid model`)
  }
}

describe.skipIf(MODE === 'record')('rich-inline: real keyless Host pipeline and Web fallback', () => {
  let scaffold: WebScaffold, browser: Browser, page: Page, tripwire: ReturnType<typeof watchConsole>
  let sessionId: SessionId, foreignSessionId: SessionId, messageId: MessageId, mount: RichMountValue
  const adapter = new RichAdapter()
  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY, extraInstallAnchors: [PACKAGE], toolsMode: 'native' })
    scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter([PROVIDER], adapter), 'rich-inline deterministic test model')
    await scaffold.ctx.agentDefaultModel.saveSelection({ provider: PROVIDER, model: MODEL })
    const executablePath = process.env.DSH_TEST_CHROMIUM_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    const startupErrors: string[] = []
    page.on('console', (entry) => { if (entry.type() === 'error') startupErrors.push(entry.text()) })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try { await page.waitForSelector('[class*="frame"]', { timeout: 30_000 }) }
    catch (error) {
      await saveFailureShot(page, 'rich-inline-startup')
      throw new Error(`rich-inline Web startup failed: ${String(error)}; pageErrors=${JSON.stringify(tripwire.pageErrors)}; consoleErrors=${JSON.stringify(startupErrors.slice(-8))}; visible=${await page.locator('body').innerText()}`)
    }
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)
  afterAll(async () => { adapter.release(); await browser?.close(); await scaffold?.close() })

  it('commits a settled marker into the message and leaves partial generated scripts inert', async () => {
    onTestFailed(() => saveFailureShot(page, 'rich-inline-publish'))
    const settled = scaffold.whenTurnSettled(30_000)
    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, PROMPT)
    await input.press('Enter')
    await adapter.partialMarker
    await page.getByText('Checklist follows.').waitFor({ timeout: 10_000 })
    expect(await page.locator('[data-rich-inline-block]').count()).toBe(0)
    expect(await page.evaluate((): unknown => Reflect.get(globalThis, '__richGeneratedScriptExecuted'))).toBeUndefined()
    adapter.finishMarker()
    sessionId = await settled
    const events = await readPersistedEvents(scaffold, sessionId)
    const assistant = events.find(event => event.type === 'assistant/message'
      && event.data.message.content.some(part => part.type === 'text' && part.text.includes('```rich-inline')))
    if (assistant?.type !== 'assistant/message' || adapter.blockId === undefined) throw new Error('settled rich marker was not persisted')
    messageId = assistant.data.message.id
    mount = await remote<RichMountValue>(scaffold, 'mount', { sessionId, messageId, blockId: adapter.blockId })
    expect(mount.snapshot.manifest.html).toBe(initialRichContent.html)
    expect(mount.snapshot.manifest.js).toBe(initialRichContent.js)
    expect(mount.snapshot.scope).toMatchObject({ sessionId, messageId, blockId: adapter.blockId, renderRevision: 1 })
    await page.getByText(initialRichContent.fallbackText, { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('Ordinary chat prose remains below it.').waitFor({ timeout: 10_000 })
    expect(await page.locator('[data-rich-inline-block] iframe, [data-rich-inline-block] webview').count()).toBe(0)
  }, 60_000)

  it('persists a draft, rejects stale CAS, accepts the last keystroke once, and records explicit Agent completion', async () => {
    // This exercises the real upload receipt and grant services, not the native picker UI.
    const uploadedResponse = await scaffold.hostFetch(`/api/session/uploadFileBinary?sessionId=${encodeURIComponent(sessionId)}&name=trip-notes.txt`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'Offline trip notes: bring an umbrella.',
    })
    const uploaded = await uploadedResponse.json() as RpcResult<{ receiptId: string }>
    if (!uploaded.ok) throw new Error(`test attachment upload failed: ${uploaded.error.message}`)
    const grant = await remote<RichFileGrant>(scaffold, 'registerFile', { mountId: mount.mountId, receiptId: uploaded.value.receiptId })
    expect(grant).not.toHaveProperty('path')
    expect(grant.sha256).toMatch(/^[a-f0-9]{64}$/u)
    const fields = { ...submittedRichFields, lastKey: 'y', attachment: { type: 'asset', ref: { ...grant } } }
    const draft = { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields, dirty: ['destination', 'lastKey'] }
    const saved = await remote<RichReceipt>(scaffold, 'saveDraft', { mountId: mount.mountId, draft })
    expect(saved.accepted).toBe(true)
    const conflict = await remote<RichReceipt>(scaffold, 'saveDraft', { mountId: mount.mountId, draft })
    expect(conflict).toMatchObject({ accepted: false, code: 'DRAFT_CONFLICT' })
    foreignSessionId = (await scaffold.ctx.sessionController.create({ cwd: scaffold.workspaceCwd })).sessionId
    const request: RichInvokeRequest = { mountId: mount.mountId, actionId: `action-${randomUUID()}` as RichInvokeRequest['actionId'],
      actionName: 'submit', targetActionId: null, expectedDataRevision: mount.snapshot.dataRevision,
      values: { ...fields, lastKey: 'z' }, draft: { ...draft, baseRevision: saved.draftRevision, fields: { ...fields, lastKey: 'z' } }, fileGrants: [grant.grantId] }
    await expect(remote(scaffold, 'invoke', { ...request, mountId: `mount-${randomUUID()}` })).rejects.toThrow(/STALE_MOUNT/u)
    await expect(remote(scaffold, 'invoke', { ...request, fileGrants: [] })).rejects.toThrow(/UNAUTHORIZED_ASSET/u)
    const settled = scaffold.whenTurnSettled(30_000)
    const accepted = await remote<RichReceipt>(scaffold, 'invoke', request)
    expect(accepted).toMatchObject({ accepted: true, code: 'ACCEPTED', state: 'accepted' })
    const repeated = await remote<RichReceipt>(scaffold, 'invoke', request)
    expect(repeated).toEqual(accepted)
    // Generated Remote decoding removes unknown object fields; a payload selector cannot change the mount-derived owner.
    expect(await remote<RichReceipt>(scaffold, 'invoke', { ...request, sessionId: foreignSessionId })).toEqual(accepted)
    const pending = await remote<RichActionStatus>(scaffold, 'status', { mountId: mount.mountId, actionId: request.actionId })
    expect(pending.terminal).toBe(false)
    const conflictId = await remote<RichReceipt>(scaffold, 'invoke', { ...request, values: { ...request.values, lastKey: 'changed' } })
    expect(conflictId).toMatchObject({ accepted: false, code: 'ACTION_ID_CONFLICT' })
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByText(initialRichContent.fallbackText, { exact: true }).waitFor({ timeout: 15_000 })
    mount = await remote<RichMountValue>(scaffold, 'mount', { sessionId, messageId, blockId: adapter.blockId })
    expect(mount.snapshot.draft.fields.lastKey).toBe('z')
    expect((await remote<RichActionStatus>(scaffold, 'status', { mountId: mount.mountId, actionId: request.actionId })).terminal).toBe(false)
    adapter.finishAction()
    expect(await settled).toBe(sessionId)
    mount = await remote<RichMountValue>(scaffold, 'mount', { sessionId, messageId, blockId: adapter.blockId })
    const status = await remote<RichActionStatus>(scaffold, 'status', { mountId: mount.mountId, actionId: request.actionId })
    expect(status).toMatchObject({ state: 'completed', terminal: true, values: updatedRichContent.values })
    expect(mount.snapshot.draft.fields.lastKey).toBe('z')
    await expect.poll(async () => {
      mount = await remote<RichMountValue>(scaffold, 'mount', { sessionId, messageId, blockId: adapter.blockId })
      return mount.snapshot.manifest.renderRevision
    }).toBe(2)
    expect(mount.snapshot.values).toEqual(updatedRichContent.values)
    expect(adapter.requests).toHaveLength(5)
    const events = await readPersistedEvents(scaffold, sessionId)
    const richInputs = events.filter(event => event.type === 'user/message'
      && event.data.content.some(part => part.type === 'text' && part.text.startsWith('Interactive input ')))
    expect(richInputs).toHaveLength(1)
    const inputEvent = richInputs[0]
    const uploadedFile = inputEvent?.type === 'user/message' ? inputEvent.data.content.find(part => part.type === 'file') : undefined
    if (uploadedFile?.type !== 'file') throw new Error('accepted grant did not become a durable Agent file attachment')
    expect(uploadedFile.attachment).toMatchObject({ name: 'trip-notes.txt', bytes: grant.sizeBytes, attachmentId: `sha256:${grant.sha256}` })
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(2)
    const foreignEvents = await readPersistedEvents(scaffold, foreignSessionId)
    expect(foreignEvents.filter(event => event.type === 'user/message' || event.type === 'turn/start')).toHaveLength(0)
    await page.getByText(updatedRichContent.fallbackText, { exact: true }).waitFor({ timeout: 15_000 })
  }, 60_000)

  it('restores the original block after refresh and rejects foreign owners and disposed lifetimes', async () => {
    const warnings = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warnings)
    await page.getByText(updatedRichContent.fallbackText, { exact: true }).waitFor({ timeout: 15_000 })
    const restored = await remote<RichMountValue>(scaffold, 'mount', { sessionId, messageId, blockId: adapter.blockId })
    expect(restored.mountId).not.toBe(mount.mountId)
    expect(restored.snapshot.draft.fields.lastKey).toBe('z')
    expect(restored.snapshot.actions.filter(action => action.state === 'completed')).toHaveLength(1)
    await expect(remote(scaffold, 'mount', { sessionId: foreignSessionId, messageId, blockId: adapter.blockId })).rejects.toThrow()
    await remote<null>(scaffold, 'dispose', { mountId: restored.mountId })
    await expect(remote<RichSnapshot>(scaffold, 'snapshot', { mountId: restored.mountId })).rejects.toThrow(/STALE_MOUNT/u)
    expect(adapter.requests).toHaveLength(5)
    expect(tripwire.pageErrors).toEqual([])
    await compareOrRefreshGolden(WEB_EXPECTED,
      await captureStableAria(page, '[data-rich-inline-block]', scaffold.workspaceCwd), MODE)
  }, 60_000)
})

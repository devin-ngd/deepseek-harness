/** Keyless mode isolation through the shipped Web Loader, session API, persistence and Agent loop. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import { compareOrRefreshGolden, launchWebScaffold, readPersistedEvents, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const PROVIDER = 'rich-mode-keyless'
const MODEL = 'rich-mode-scripted'
const ANCHOR = fileURLToPath(new URL('../../../packages/experimental/rich-inline/package.json', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/rich-inline-mode/mode-contract.expected.json', import.meta.url))
const markdown = '# Coding result\n\n```ts\nconst value = 1\n```\n\n' + 'Ordinary coding explanations remain Markdown. '.repeat(20)
const publication = { key: 'mode', html: '<h2>MODE_OK</h2><button>Count</button>', css: '', js: '', fallbackText: 'MODE_OK', stateSchemaVersion: 1 }

class ModeAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.requests.push(options)
    const rich = options.messages.some(message => message.content.some(part => part.type === 'text' && part.text.includes('Rich inline output is enabled.')))
    const text = rich ? '```rich-html\n' + JSON.stringify(publication) + '\n```' : markdown
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe.skipIf(MODE === 'record')('rich-inline selected mode and project default', () => {
  let scaffold: WebScaffold, root: string, project: string, ordinary: string
  let browser: Browser, page: Page
  const adapter = new ModeAdapter()
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-rich-mode-'))
    project = join(root, 'project')
    ordinary = join(root, 'ordinary')
    await mkdir(project)
    await mkdir(ordinary)
    project = realpathSync(project)
    ordinary = realpathSync(ordinary)
    const standard = await readFile(new URL('../../../packages/bundle/web-app/presets/standard.patch.yml', import.meta.url), 'utf8')
    const lumina = standard.replace('    - id: preset-standard', '    - id: preset-lumina')
      .replace('        id: standard', '        id: lumina\n        name: Lumina')
    const overlay = join(root, 'scope.patch.yml')
    await writeFile(overlay, lumina + '\n- insert:\n    - id: rich-inline\n      name: "@deepseek-ai/dsh-experimental-rich-inline"\n      config:\n        activePresets: [lumina]\n        projectDefaults:\n          - path: ' + JSON.stringify(project) + '\n            preset: lumina\n')
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay, extraInstallAnchors: [ANCHOR], toolsMode: 'native' })
    scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter([PROVIDER], adapter), 'rich-mode test adapter')
    await scaffold.ctx.agentDefaultModel.saveSelection({ provider: PROVIDER, model: MODEL })
    await scaffold.ctx.workspaceRegistry.create(ordinary)
    await scaffold.ctx.workspaceRegistry.create(project)
    const executablePath = process.env.DSH_TEST_CHROMIUM_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  })
  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    if (root !== undefined) {
      expect(root.startsWith(join(tmpdir(), 'dsh-rich-mode-'))).toBe(true)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves Standard code output and logs Lumina for the default project and manual selection elsewhere', async () => {
    onTestFailed(async () => {
      await saveFailureShot(page, 'rich-inline-mode')
      console.error(await page.getByRole('tree').ariaSnapshot())
    })
    const ctx = scaffold.ctx
    const ordinaryWorkspace = await ctx.workspaceRegistry.resolveByPath(ordinary)
    const projectWorkspace = await ctx.workspaceRegistry.resolveByPath(project)
    if (ordinaryWorkspace === undefined || projectWorkspace === undefined) throw new Error('Missing fixture workspace')
    const ordinarySession = await ctx.sessionController.create({ workspaceId: ordinaryWorkspace.id })
    const projectSession = await ctx.sessionController.create({ workspaceId: projectWorkspace.id })
    const otherSession = await ctx.sessionController.create({ workspaceId: ordinaryWorkspace.id })
    const otherAgent = ctx.agents.get(otherSession.sessionId)!
    await ctx.agentPresets.select(otherAgent, 'lumina')
    const summary = []
    for (const [label, session] of [['standard', ordinarySession], ['project-default', projectSession], ['manual-lumina', otherSession]] as const) {
      const agent = ctx.agents.get(session.sessionId)!
      const assembly = await ctx.systemPrompt.assemble(assembleContextFor(agent))
      const count = adapter.requests.length
      await ctx.sessionController.prompt({ sessionId: agent.id, requestId: brandString<SessionRequestId>(`mode-${label}`), mode: 'queue', content: [{ type: 'text', text: 'Explain a simple coding result.' }] }, new AbortController().signal)
      await vi.waitFor(() => { expect(agent.status).toBe('idle'); expect(adapter.requests.length).toBeGreaterThan(count) })
      const events = await readPersistedEvents(scaffold, agent.id)
      const answer = events.findLast(event => event.type === 'assistant/message')
      if (answer?.type !== 'assistant/message') throw new Error('Missing persisted answer')
      const text = answer.data.message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('')
      summary.push({ label, mode: ctx.agentPresets.composedPreset(agent.ctx),
        richGuidance: assembly.sections.some(section => section.name === 'rich-inline:authoring' && section.text.length > 0),
        copyGuidance: adapter.requests.slice(count).flatMap(request => request.messages.flatMap(message => message.content
          .flatMap(part => part.type === 'text' ? part.text.split('\n').filter(line => line.startsWith('Mark reusable text with data-rich-copy')) : []))),
        richContext: assembly.contexts.some(context => context.name === 'rich-inline:output-format' && context.text.length > 0),
        richTools: assembly.tools.filter(tool => tool.name.startsWith('rich_inline_')).map(tool => tool.name).sort(),
        response: text.includes('```rich-html') ? 'rich-html' : 'markdown', requests: adapter.requests.length - count,
        recordedSelection: events.filter(event => event.type === 'agent-preset/selected').map(event => event.data.agentPreset) })
      expect(text).toBe(label === 'standard' ? markdown : '```rich-html\n' + JSON.stringify(publication) + '\n```')
      expect(adapter.requests.length - count).toBe(1)
      await ctx.sessionController.rename({ sessionId: agent.id, title: `Mode ${label}` })
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      const workspace = page.getByRole('treeitem', { name: label === 'project-default' ? /^project(?: |$)/ : /^ordinary(?: |$)/ })
      if (await workspace.getAttribute('aria-expanded') === 'false') await workspace.click()
      await page.getByRole('treeitem', { name: new RegExp(`^Mode ${label}`) }).click()
      if (label === 'standard') {
        await page.getByRole('heading', { name: 'Coding result' }).waitFor()
        expect(await page.locator('[data-rich-inline-block]').count()).toBe(0)
      } else {
        await page.getByText('MODE_OK', { exact: true }).waitFor()
        expect(await page.locator('[data-rich-inline-block]').count()).toBe(1)
      }
    }
    await compareOrRefreshGolden(EXPECTED, JSON.stringify(summary, null, 2), MODE)
  })
})

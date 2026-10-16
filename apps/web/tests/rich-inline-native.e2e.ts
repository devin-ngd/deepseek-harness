/** Real Harness chat, Loader overlay, durable Host and Electron guests; only the model is deterministic. */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import { expect, it } from 'vitest'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { RichBlockId, RichMountValue, RichSnapshot, RichReceipt, RichInvokeRequest } from '@deepseek-ai/dsh-experimental-rich-inline/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { formExample, chartExample, animationExample, independentExample } from '../../../packages/experimental/rich-inline/examples/content.ts'
import { themeExamples } from '../../../packages/experimental/rich-inline/examples/theme.ts'
import { launchWebScaffold, readPersistedEvents } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import { connectFreshWorkspace, writeComposerDraft } from './support.ts'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const provider = 'rich-native-deterministic'
const model = 'rich-native-scripted'
const samples = [{ ...formExample, html: formExample.html.replace('<h2>', '<h2 id="copy-title" data-rich-copy style="padding-right:36px">') }, chartExample, animationExample, independentExample('Independent A'), independentExample('Independent B')]
const streamCode = { ...formExample, key: 'stream-report', html: '<h1 id="stream-title">AI news — deterministic acceptance sample</h1>'
  + formExample.html + '<section><p>Second streamed section</p><span id="moving">●</span></section>',
css: formExample.css + 'section+section{margin-top:12px}@keyframes travel{to{transform:translateX(80px)}}#moving{display:inline-block;color:var(--rich-accent);animation:travel 1s linear infinite alternate}',
js: 'document.body.dataset.scriptRuns="1";' + formExample.js }
const streamReply = '```rich-html\n' + JSON.stringify(streamCode) + '\n```\n\n```rich-html\n'
  + JSON.stringify({ ...chartExample, key: 'stream-chart' }) + '\n```'
const correctedCode = { key: 'format-corrected', html: '<section id="corrected" class="rich-card"><h2>Searchable documents</h2><label>Search<input id="search" placeholder="Filter by title"></label><ul class="rich-list"><li>Alpha notes</li><li>Beta report</li></ul></section>',
  css: '#corrected label{margin-bottom:14px}',
  js: 'document.getElementById("search").oninput=e=>document.querySelectorAll("li").forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(e.target.value.toLowerCase()));',
  fallbackText: 'Alpha notes; Beta report', stateSchemaVersion: 1 }
const correctedReply = '```rich-html\n' + JSON.stringify(correctedCode) + '\n```'
const themeReply = themeExamples.map(sample => '```rich-html\n' + JSON.stringify(sample) + '\n```').join('\n\n')
interface ActionInput { actionId: string; blockId: RichBlockId; values: Record<string, string> }

function* tool(name: string, args: object, call: number): Generator<StreamChunk> {
  const id = ToolCallId(`rich-native-${call}`)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
function* text(value: string): Generator<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: value }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: value } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
class AcceptanceModel extends LlmAdapter {
  calls = 0
  formatCorrections = 0
  readonly submitted: ActionInput[] = []
  private publishIndex = 0
  private initialReply = false
  private schemaUpdate = false
  private stage = 0
  private action: (typeof this.submitted)[number] | undefined
  readonly handled = new Set<string>()
  readonly repaired = new Set<string>()
  readonly promptedSessions = new Set<string>()
  readonly userInputs: string[] = []
  private extraAnimationStage = 0
  private releaseSlow: (() => void) | undefined
  private releasePreview: (() => void) | undefined
  private releaseFinish: (() => void) | undefined
  previewStage = 0
  cancelledStage = false
  finishPreview(): void { this.releasePreview?.() }
  finishStream(): void { this.releaseFinish?.() }
  release(): void { this.releaseSlow?.() }
  override async listModels(provider: string) { return [{ provider, id: model, name: model }] }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const call = ++this.calls
    if (options.purpose === undefined) {
      const instructions = options.messages.filter(message => message.role === 'system').flatMap(message => message.content)
        .flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
      expect(instructions).toContain('Rich inline rendering is enabled for this project')
      expect(instructions).toContain('You author code; the plugin validates')
      expect(instructions).toContain('final reply consists of its marker(s)')
      expect(instructions).toContain('Built-in appearance: the user selects one of several dark themes')
      expect(instructions).toContain('Do not copy the base sheet into answers')
      const formatCorrection = options.messages.findLast(message => message.role === 'user')?.source?.kind === 'rich-inline-format'
      if (formatCorrection) expect(options.tools ?? []).toEqual([])
      else expect(options.tools?.some(schema => schema.name === 'rich_inline_publish')).toBe(true)
      this.promptedSessions.add(String(options.sessionId))
    }
    if (options.messages.findLast(message => message.role === 'user')?.source?.kind === 'rich-inline-format') {
      this.formatCorrections++
      yield* text(correctedReply)
      return
    }
    if (this.publishIndex < samples.length) {
      const index = this.publishIndex++
      // Deliberate syntax failure: the separate SDK must still deliver renderer diagnostics.
      yield* tool('rich_inline_publish', index === 2 ? { ...animationExample, js: 'const animation = ;' } : samples[index]!, call)
      return
    }
    if (!this.initialReply) {
      this.initialReply = true
      const markers = options.messages.filter(message => message.role === 'tool').flatMap(message => message.content)
        .flatMap(part => part.type === 'text' ? [...part.text.matchAll(/```rich-inline\n\{"blockId":"[^"]+"\}\n```/gu)].map(match => match[0]) : [])
      expect(markers).toHaveLength(samples.length)
      yield* text(markers.join('\n\n'))
      return
    }
    const latest = options.messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')?.content
      .findLast(part => part.type === 'text' && !part.text.startsWith('[File "'))
    if (latest?.type === 'text') this.userInputs.push(latest.text.slice(0, 1000))
    if (latest?.type === 'text' && latest.text === '展示统一暗色主题样例。') {
      yield* text(themeReply)
      return
    }
    if (latest?.type === 'text' && latest.text === '帮我整理这些资料，不要用 Markdown，只生成 HTML 网页。') {
      yield* text('# Documents\n' + '- Markdown item\n'.repeat(50))
      return
    }
    if (latest?.type === 'text' && latest.text === '生成一个内容后取消。') {
      const hostile = { ...streamCode, key: 'cancelled', html: '<h2 id="cancel-preview">Cancellation preview</h2><script>window.evilRan=true</script>'
        + '<img src="https://invalid.example/blocked.png" onerror="window.evilRan=true"><button onclick="window.evilRan=true">Blocked button</button>' }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '```rich-html\n' + JSON.stringify(hostile) + '\n```' }
      this.cancelledStage = true
      await new Promise<void>((resolve, reject) => {
        if (options.signal?.aborted) { reject(new Error('Acceptance stream cancelled')); return }
        const abort = () => { reject(new Error('Acceptance stream cancelled')) }
        options.signal?.addEventListener('abort', abort, { once: true })
        this.releaseFinish = () => { options.signal?.removeEventListener('abort', abort); resolve() }
      })
      options.signal?.throwIfAborted()
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if (latest?.type === 'text' && latest.text === '帮我整理国庆期间的AI要闻。') {
      const raw = JSON.stringify(streamCode), first = raw.indexOf('</h1>') + '</h1>'.length
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '```rich-html\n' + raw.slice(0, first) }
      this.previewStage = 1
      await new Promise<void>((resolve) => { this.releasePreview = resolve })
      const rest = streamReply.slice('```rich-html\n'.length + first)
      for (let i = 0; i < rest.length; i += 71) yield { type: 'text-delta', index: 0, text: rest.slice(i, i + 71) }
      this.previewStage = 2
      await new Promise<void>((resolve) => { this.releaseFinish = resolve })
      yield { type: 'block-end', index: 0, block: { type: 'text', text: streamReply } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if (latest?.type === 'text' && latest.text.startsWith('Render feedback ')) {
      const feedback = JSON.parse(latest.text.slice('Render feedback '.length)) as { blockId: string; renderRevision: number; diagnostic: string }
      if (!/SyntaxError|Unexpected token/.test(feedback.diagnostic)) { yield* text('The deliberately failing test document could not be repaired.'); return }
      if (!this.repaired.has(feedback.blockId)) {
        this.repaired.add(feedback.blockId)
        const { values: _values, ...code } = animationExample
        yield* tool('rich_inline_publish', { ...code, blockId: feedback.blockId, expectedRenderRevision: feedback.renderRevision }, call)
      } else yield* text('')
      return
    }
    if (latest?.type === 'text' && latest.text.includes('做一个会动的小球动画。')) {
      if (this.extraAnimationStage++ === 0) { yield* tool('rich_inline_publish', animationExample, call); return }
      const marker = options.messages.filter(message => message.role === 'tool').flatMap(message => message.content)
        .flatMap(part => part.type === 'text' ? [...part.text.matchAll(/```rich-inline\n\{"blockId":"[^"]+"\}\n```/gu)].map(match => match[0]) : []).at(-1)
      expect(marker).toBeDefined()
      yield* text(marker!)
      return
    }
    if (this.action !== undefined && this.stage === 1) {
      this.stage = 2
      yield* tool('rich_inline_publish', { ...formExample, blockId: this.action.blockId,
        html: formExample.html.replace('Trip form', 'Updated trip form'), values: { result: this.action.values.destination ?? this.action.values.note } }, call)
      return
    }
    if (this.action !== undefined && this.stage === 2) { this.action = undefined; this.stage = 0; yield* text('Updated the original interactive message.'); return }
    const latestUserText = options.messages.filter(message => message.role === 'user').flatMap(message => message.content)
      .findLast(part => part.type === 'text')
    if (!this.schemaUpdate && latestUserText?.type === 'text' && latestUserText.text === 'Change the input schema.') {
      this.schemaUpdate = true
      yield* tool('rich_inline_publish', { ...formExample, blockId: this.submitted[0]!.blockId,
        stateSchemaVersion: 2, html: formExample.html.replace('Trip form', 'Migrated trip form') }, call)
      return
    }
    const last = options.messages.filter(message => message.role === 'user').flatMap(message => message.content)
      .findLast(part => part.type === 'text' && part.text.startsWith('Interactive input '))
    if (last?.type === 'text') {
      const action = JSON.parse(last.text.slice('Interactive input '.length)) as ActionInput
      if (!this.handled.has(action.actionId)) {
        this.handled.add(action.actionId); this.submitted.push(action); this.action = action
        if (action.values.destination === 'slow') await new Promise<void>((resolve) => { this.releaseSlow = resolve })
        options.signal?.throwIfAborted()
        this.stage = 1
        yield* tool('rich_inline_complete', { actionId: action.actionId, state: 'completed', values: { result: action.values.destination ?? action.values.note } }, call)
        return
      }
    }
    yield* text('Ordinary chat still works.')
  }
}
async function remote<T>(scaffold: WebScaffold, method: string, request: object): Promise<T> {
  const response = await scaffold.hostFetch(`/api/richInline/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `native-${randomUUID()}`, method: `richInline/${method}`, payload: { args: { request } } }) })
  const { result: value } = await response.json() as { result: { ok: boolean; value: T; error?: { message: string } } }
  if (!value.ok) throw new Error(value.error?.message ?? 'Remote failure')
  return value.value
}

async function runNativeChat(copyOnly: boolean): Promise<void> {
  const evidence = process.env.DSH_RICH_EVIDENCE_DIR ?? join('D:\\Temp', `dsh-rich-chat-${Date.now()}`)
  const output = copyOnly ? join(evidence, 'copy') : evidence
  await mkdir(output, { recursive: true })
  const world = { workspaceCwd: join(output, 'world', 'workspace'), persistenceRoot: join(output, 'world', 'sessions') }
  for (const directory of Object.values(world)) await mkdir(directory, { recursive: true })
  const boot = () => launchWebScaffold({ extraOverlayPath: join(root, 'apps/web/tests/rich-inline.overlay.yml'),
    extraInstallAnchors: [join(root, 'packages/experimental/rich-inline/package.json')], toolsMode: 'native',
    persistentWorld: world, harnessHome: join(output, 'world', 'home') })
  const require = createRequire(new URL('../../desktop/package.json', import.meta.url))
  const electron = require('electron') as string
  const builder = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm/node_modules')] })) as {
    build(options: {
      entryPoints: string[]
      outfile: string
      bundle: boolean
      platform: 'node'
      format: 'esm' | 'cjs'
      target: string
      external: string[]
      logLevel: 'warning'
    }): Promise<unknown>
  }
  for (const [entry, file, format] of [
    ['apps/desktop/tests/fixtures/rich-chat-runner.ts', 'rich-chat-runner.mjs', 'esm'],
    ['apps/desktop/tests/fixtures/rich-chat-preload.ts', 'rich-chat-preload.cjs', 'cjs'],
    ['apps/desktop/src/preload-rich.ts', 'preload-rich.cjs', 'cjs'],
  ] as const) await builder.build({ entryPoints: [join(root, entry)], outfile: join(output, file), bundle: true, platform: 'node', format,
    target: 'es2024', external: ['electron'], logLevel: 'warning' })
  let scaffold: WebScaffold | undefined, application: ElectronApplication | undefined, page: Page | undefined
  const adapter = new AcceptanceModel()
  const checks: string[] = []
  const errors: string[] = []
  let passed = false
  try {
    scaffold = await boot()
    scaffold.ctx.effect(() => scaffold!.ctx.llm.registerAdapter([provider], adapter), 'rich native deterministic model')
    await scaffold.ctx.agentDefaultModel.saveSelection({ provider, model })
    await writeFile(join(output, 'launch.json'), JSON.stringify({ url: scaffold.authenticatedUrl }))
    const launch = async (): Promise<void> => {
      application = await _electron.launch({ executablePath: electron, args: [join(output, 'rich-chat-runner.mjs'), `--rich-chat-output=${output}`],
        cwd: root, env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
          value !== undefined && !/KEY|SECRET|TOKEN|PASSWORD|ELECTRON_RUN_AS_NODE/i.test(key))) as Record<string, string> })
      await application.evaluate(({ ipcMain }) => {
        ipcMain.on('dsh-desktop:rich-from-guest', (event, value: unknown) => {
          if (typeof value !== 'object' || value === null || !('packet' in value)
            || typeof value.packet !== 'object' || value.packet === null) return
          const state = globalThis as typeof globalThis & { richTestPackets?: Record<number, Record<string, unknown>> }
          state.richTestPackets ??= {}
          state.richTestPackets[event.sender.id] = value.packet as Record<string, unknown>
        })
      })
      page = await application.firstWindow()
      page.on('pageerror', (error) => { errors.push(error.message) })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    }
    await launch()
    const screenshot = async (name: string): Promise<void> => {
      await page!.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
      }))
      const png = await application!.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
      await writeFile(join(output, `${name}.png`), Buffer.from(png, 'base64'))
    }
    const block = (index: number) => page!.locator('[data-rich-inline-block]').nth(index)
    const guest = async <T>(index: number, source: string): Promise<T> => {
      const lease = await block(index).locator('webview').getAttribute('partition')
      return application!.evaluate(async ({ webContents }, args): Promise<unknown> => {
        const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${args.lease}/`))
        if (target === undefined) throw new Error('Native guest not found')
        const value: unknown = await target.executeJavaScript(args.source)
        return value
      }, { lease, source }) as Promise<T>
    }
    const input = async (index: number, selector: string, value: string): Promise<void> => {
      await block(index).scrollIntoViewIfNeeded()
      const lease = await block(index).locator('webview').getAttribute('partition')
      await application!.evaluate(async ({ webContents }, args) => {
        const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${args.lease}/`))!
        await target.executeJavaScript(`document.querySelector(${JSON.stringify(args.selector)}).focus();document.querySelector(${JSON.stringify(args.selector)}).select()`)
        await target.insertText(args.value)
        await target.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      }, { lease, selector, value })
      expect(await guest(index, `document.querySelector(${JSON.stringify(selector)}).value`)).toBe(value)
    }
    const click = async (index: number, selector: string): Promise<void> => {
      await block(index).scrollIntoViewIfNeeded()
      const lease = await block(index).locator('webview').getAttribute('partition')
      await application!.evaluate(async ({ webContents }, args) => {
        const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${args.lease}/`))!
        const position = await target.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(args.selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`) as { x: number; y: number }
        target.sendInputEvent({ type: 'mouseDown', ...position, button: 'left', clickCount: 1 })
        target.sendInputEvent({ type: 'mouseUp', ...position, button: 'left', clickCount: 1 })
      }, { lease, selector })
    }
    await connectFreshWorkspace(page!, scaffold.workspaceCwd)
    let settled = scaffold.whenTurnSettled(30_000)
    const composer = page!.locator('[data-composer-input]').first()
    await composer.fill('做一个表单、一个可筛选图表、一个动画和两个独立输入块。')
    await expect.poll(() => composer.textContent()).toBe('做一个表单、一个可筛选图表、一个动画和两个独立输入块。')
    await composer.press('Enter')
    const sessionId: SessionId = await settled
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count(), { timeout: 20_000 }).toBe(5)
    await expect.poll(() => guest(0, '!!rich.getState()')).toBe(true)
    await expect.poll(() => guest(2, 'document.getAnimations().length'), { timeout: 20_000 }).toBe(1)
    expect(adapter.repaired.size).toBe(1)
    const initialMessages = await readPersistedEvents(scaffold, sessionId)
    const visualReply = initialMessages.find(event => event.type === 'assistant/message' && event.data.message.content.some(part => part.type === 'text' && part.text.includes('```rich-inline')))
    expect(visualReply?.type === 'assistant/message' && visualReply.data.message.content.filter(part => part.type === 'text')
      .every(part => part.text.replace(/```rich-inline\n\{"blockId":"[^"]+"\}\n```/gu, '').trim() === '')).toBe(true)
    checks.push('Plain user request receives default authoring instructions and a final reply of inline markers only')
    checks.push('Real native syntax error routes once to the Agent and automatically repairs the same message block')
    checks.push('Real Loader opt-in composition renders five generic HTML/CSS/JS documents inside assistant messages')
    await click(0, '[name=destination]')
    const focusLease = await block(0).locator('webview').getAttribute('partition')
    await application!.evaluate(({ webContents }, lease) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
      target.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
      target.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    }, focusLease)
    expect(await guest(0, 'document.activeElement.name')).toBe('budget')
    await application!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(780, 820) })
    await expect.poll(() => guest<boolean>(0, 'document.documentElement.scrollWidth <= innerWidth')).toBe(true)
    const measuredHeight = await block(0).locator('webview').evaluate(element => element.getBoundingClientRect().height)
    expect(measuredHeight).toBeGreaterThan(200)
    await application!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1280, 900) })
    checks.push('Native Tab focus, narrow-window layout, content height and chat scrolling remain usable')
    await block(0).scrollIntoViewIfNeeded(); await screenshot('01-form')
    const callsBeforeCopy = adapter.calls
    const copyLease = await block(0).locator('webview').getAttribute('partition')
    await application!.evaluate(async ({ webContents, clipboard, ClipboardItem }, lease) => {
      const previous = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item =>
        new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const))))))
      try {
        const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
        const position = await target.executeJavaScript('(()=>{const r=document.getElementById("copy-title").getBoundingClientRect();return {x:Math.round(r.right-18),y:Math.round(r.top+18)}})()') as { x: number; y: number }
        await clipboard.writeText('native-chat-copy-sentinel')
        target.sendInputEvent({ type: 'mouseMove', ...position })
        await target.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
        target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
        const deadline = Date.now() + 5000
        while (await clipboard.readText() !== 'Trip form') {
          if (Date.now() >= deadline) throw new Error('chat copy did not write the selected title')
          await new Promise<void>(resolve => setTimeout(resolve, 20))
        }
      } finally {
        if (previous.length > 0) await clipboard.write(previous)
        else clipboard.clear()
      }
    }, copyLease)
    expect(adapter.calls).toBe(callsBeforeCopy)
    checks.push('Model-authored region copies through the real Client and native clipboard without an Agent request')
    await screenshot('01-copy-region')
    if (copyOnly) { passed = true; return }
    const initialCalls = adapter.calls
    await guest(1, 'document.querySelector("select").value="travel";document.querySelector("select").dispatchEvent(new Event("change"))')
    expect(await guest(1, 'document.querySelector("output").textContent')).toBe('1 categories')
    await block(1).evaluate((element) => { element.scrollIntoView({ block: 'start' }) }); await screenshot('02-local-chart')
    await click(2, 'button')
    await expect.poll(() => guest(2, 'document.querySelector("output").textContent')).toBe('Step 2')
    expect(await guest(2, 'document.getElementById("dot").getAnimations().length')).toBe(1)
    await block(2).scrollIntoViewIfNeeded()
    const firstFrame = await guest<number>(2, 'document.querySelector("#dot").getBoundingClientRect().x')
    await screenshot('08-animation-frame-a')
    const secondFrame = await guest<number>(2, `new Promise(resolve=>{const start=performance.now();function observe(){const x=document.querySelector("#dot").getBoundingClientRect().x;if(Math.abs(x-${firstFrame})>10||performance.now()-start>1200)resolve(x);else requestAnimationFrame(observe)}observe()})`)
    expect(Math.abs(secondFrame - firstFrame)).toBeGreaterThan(5)
    await screenshot('09-animation-frame-b')
    await writeFile(join(output, 'animation-frames.json'), JSON.stringify({ firstFrame, secondFrame, deltaPixels: Math.abs(secondFrame - firstFrame) }))
    expect(adapter.calls).toBe(initialCalls)
    checks.push('SVG filtering, animation and multi-step local interaction cause no model requests')
    await input(3, 'input', 'Draft A'); await input(4, 'input', 'Draft B')
    await click(3, '#count')
    expect(await guest(3, 'document.querySelector("output").textContent')).toBe('1')
    expect(await guest(4, 'document.querySelector("output").textContent')).toBe('0')
    expect(await guest(3, 'document.querySelector("input").value')).toBe('Draft A')
    expect(await guest(4, 'document.querySelector("input").value')).toBe('Draft B')
    await block(3).evaluate((element) => { element.scrollIntoView({ block: 'start' }) }); await screenshot('04-independent-blocks')
    const scopes = await Promise.all([0, 1, 2, 3, 4].map(index => guest<RichSnapshot['scope']>(index, 'rich.getState().scope')))
    const mounts: RichMountValue[] = []
    for (const scope of scopes) mounts.push(await remote(scaffold, 'mount', scope))
    await block(0).locator('input[type=file]').setInputFiles({ name: 'acceptance-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Only this controlled attachment is granted.') })
    await expect.poll(() => guest<number>(0, 'rich.getState().files.length')).toBe(1)
    settled = scaffold.whenTurnSettled(30_000)
    await input(0, '[name=destination]', 'last-character-Z')
    await click(0, '[type=submit]'); await click(0, '[type=submit]')
    await settled
    expect(adapter.submitted).toHaveLength(1)
    expect(adapter.submitted[0]!.values.destination).toBe('last-character-Z')
    await expect.poll(async () => (await remote<RichSnapshot>(scaffold!, 'snapshot', { sessionId, mountId: mounts[0]!.mountId })).actions.at(-1)?.state).toBe('completed')
    const requestSnapshot = await remote<RichSnapshot>(scaffold, 'snapshot', { sessionId, mountId: mounts[0]!.mountId })
    expect(requestSnapshot.manifest.renderRevision).toBe(1)
    expect(requestSnapshot.pendingManifest?.renderRevision).toBe(2)
    await input(0, '[name=destination]', 'unsubmitted newest draft')
    await block(0).getByRole('button', { name: 'Apply new version' }).click()
    await expect.poll(() => guest(0, 'document.querySelector("h2").textContent'), { timeout: 10_000 }).toBe('Updated trip form')
    expect(await guest(0, 'document.querySelector("input").value')).toBe('unsubmitted newest draft')
    await expect(remote(scaffold, 'snapshot', { sessionId, mountId: mounts[0]!.mountId })).rejects.toThrow('STALE_MOUNT')
    await block(0).scrollIntoViewIfNeeded(); await screenshot('03-agent-update')
    checks.push('Last keystroke accepted once, Agent completion distinguished from receipt, same message updated, new draft preserved, old mounts revoked')
    const callsAfterAction = adapter.calls
    await page!.reload({ waitUntil: 'load' })
    await expect.poll(() => guest(3, 'document.querySelector("input").value'), { timeout: 20_000 }).toBe('Draft A')
    await expect.poll(() => guest(4, 'document.querySelector("input").value'), { timeout: 20_000 }).toBe('Draft B')
    await expect.poll(() => guest(0, 'document.querySelector("input").value'), { timeout: 20_000 }).toBe('unsubmitted newest draft')
    expect(adapter.calls).toBe(callsAfterAction)
    checks.push('Refresh restores independent durable drafts and does not replay completed actions')
    await application!.close()
    await scaffold.close()
    scaffold = await boot()
    scaffold.ctx.effect(() => scaffold!.ctx.llm.registerAdapter([provider], adapter), 'restored rich deterministic model')
    await writeFile(join(output, 'launch.json'), JSON.stringify({ url: scaffold.authenticatedUrl }))
    await launch()
    await page!.getByText(/^做一个表单、一个可筛选图表/).first().click()
    await expect.poll(() => guest(0, 'document.querySelector("input").value'), { timeout: 20_000 }).toBe('unsubmitted newest draft')
    expect(adapter.calls).toBe(callsAfterAction)
    checks.push('Electron and Host restart and historical message remount do not replay business actions')
    const security = await guest<Record<string, unknown>>(1, '({node:typeof require,process:typeof process,host:typeof dshDesktop,parent:parent===window,frames:frames.length,storage:localStorage.getItem("hostSecret"),rtc:typeof RTCPeerConnection})')
    expect(security).toMatchObject({ node: 'undefined', process: 'undefined', host: 'undefined', parent: true, frames: 0, storage: null, rtc: 'undefined' })
    const processInfo = await application!.evaluate(({ webContents }) => webContents.getAllWebContents().filter(contents => contents.getType() === 'webview')
      .map((contents) => {
        const prefs = (contents as typeof contents & { getLastWebPreferences(): Electron.WebPreferences }).getLastWebPreferences()
        return { pid: contents.getOSProcessId(), sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation,
          webSecurity: prefs.webSecurity, nodeIntegration: prefs.nodeIntegration }
      }))
    expect(new Set(processInfo.map(info => info.pid)).size).toBe(5)
    expect(processInfo.every(info => info.sandbox && info.contextIsolation && info.webSecurity && !info.nodeIntegration)).toBe(true)
    checks.push('Actual guests use distinct native processes, sandbox, contextIsolation, webSecurity and no Node or Host API')
    await guest(3, 'localStorage.setItem("only-block-A","private")')
    expect(await guest(4, 'localStorage.getItem("only-block-A")')).toBeNull()
    const forgedLease = await block(1).locator('webview').getAttribute('partition')
    const observed = await application!.evaluate(({ webContents }, lease) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
      const state = globalThis as typeof globalThis & { richTestPackets?: Record<number, Record<string, unknown>> }
      return state.richTestPackets![target.id]!
    }, forgedLease)
    // Resize packets can race the observation; bounded consecutive guesses exercise the actual guest bridge.
    await guest(1, `window.forgedReceipt=null;window.addEventListener('rich:receipt',e=>{if(e.detail.requestId.startsWith('forged-auth-'))forgedReceipt=e.detail});for(let n=1;n<=8;n++)richGuest.send({protocol:'lumina-rich/1',mountId:${JSON.stringify(observed.mountId)},renderRevision:1,packetId:'forged-auth-'+n,seq:${Number(observed.seq)}+n,type:'action.invoke',payload:{actionId:'forged-action',actionName:'submit',targetActionId:null,expectedDataRevision:rich.getState().dataRevision,values:{},fileGrants:[],draft:{baseRevision:0,stateSchemaVersion:1,fields:{},dirty:[]},confirmed:true,userGesture:true}})`)
    await expect.poll(() => guest<string>(1, 'forgedReceipt?.error')).toContain('INVALID_ACTION')
    expect(adapter.calls).toBe(callsAfterAction)
    await block(1).getByRole('button', { name: 'Close interactive content' }).click()
    await block(1).getByRole('button', { name: 'Reload interactive content' }).click()
    await expect.poll(() => guest(1, '!!rich.getState()')).toBe(true)
    await guest(4, 'rich.setDraft({note:"界".repeat(50000)})')
    await block(4).getByRole('alert').waitFor({ state: 'visible' })
    expect(await guest(4, 'rich.getDraft().note.length')).toBe(50000)
    await input(4, 'input', 'Draft B')
    await block(4).getByRole('alert').waitFor({ state: 'hidden' })
    expect(adapter.calls).toBe(callsAfterAction)
    checks.push('Cross-block storage is isolated; forged confirmed/userGesture is rejected before Agent dispatch; oversized draft stays editable with trusted warning')
    await guest(2, 'setTimeout(()=>{throw new Error("intentional content failure")},0)')
    await block(2).getByRole('alert').waitFor({ state: 'visible' })
    await block(2).getByRole('button', { name: 'Reload interactive content' }).click()
    await expect.poll(() => guest(2, 'document.querySelector("output").textContent')).toBe('Step 1')
    const loopLease = await block(2).locator('webview').getAttribute('partition')
    await application!.evaluate(({ webContents }, lease) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
      void target.executeJavaScript('setTimeout(()=>{while(true){}},0)')
    }, loopLease)
    await block(2).getByRole('button', { name: 'Close interactive content' }).click({ timeout: 5000 })
    await expect.poll(() => block(2).locator('webview').count()).toBe(0)
    expect(await guest(4, 'document.querySelector("input").value')).toBe('Draft B')
    await block(2).getByRole('button', { name: 'Reload interactive content' }).click()
    await expect.poll(() => guest(2, '!!rich.getState()')).toBe(true)
    checks.push('Runtime exception and infinite loop leave chat usable; trusted controls terminate and recover content')
    settled = scaffold.whenTurnSettled(30_000)
    await input(0, '[name=destination]', 'slow'); await click(0, '[type=submit]')
    await expect.poll(() => adapter.submitted.length).toBe(2)
    await block(0).getByRole('button', { name: 'Request cancellation' }).waitFor({ state: 'visible' })
    await block(0).getByRole('button', { name: 'Request cancellation' }).click()
    await block(0).getByText('Cancellation requested; awaiting outcome', { exact: true }).waitFor()
    adapter.release(); await settled
    const active = await remote<RichMountValue>(scaffold, 'mount', scopes[0]!)
    await expect.poll(async () => (await remote<RichSnapshot>(scaffold!, 'snapshot', { sessionId, mountId: active.mountId }))
      .actions.find(action => action.actionId === adapter.submitted[1]!.actionId)).toMatchObject({ state: 'completed', lateAfterCancel: true })
    await expect.poll(() => scaffold!.ctx.agents.get(sessionId)?.status).toBe('idle')
    checks.push('Cancellation is an intent; a late known result is retained and labelled without promising rollback')
    const repeatSnapshot = await remote<RichSnapshot>(scaffold, 'snapshot', { sessionId, mountId: active.mountId })
    const retryRequest: RichInvokeRequest = { sessionId, mountId: active.mountId, actionId: `accept-${randomUUID()}` as RichInvokeRequest['actionId'], actionName: 'submit', targetActionId: null,
      expectedDataRevision: repeatSnapshot.dataRevision, values: { destination: 'retry' }, fileGrants: [],
      draft: { baseRevision: repeatSnapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { destination: 'retry' }, dirty: ['destination'] } }
    settled = scaffold.whenTurnSettled(30_000)
    const receipt = await remote<RichReceipt>(scaffold, 'invoke', retryRequest)
    expect(receipt).toMatchObject({ accepted: true, state: 'accepted' })
    expect(await remote(scaffold, 'invoke', retryRequest)).toEqual(receipt)
    expect(await remote(scaffold, 'invoke', { ...retryRequest, values: { destination: 'conflicting' } })).toMatchObject({ accepted: false, code: 'ACTION_ID_CONFLICT' })
    await settled
    await expect.poll(() => adapter.submitted.length).toBe(3)
    await expect.poll(() => scaffold!.ctx.agents.get(sessionId)?.status).toBe('idle')
    checks.push('Network retry returns original accepted receipt; conflicting payload under one action ID is refused')
    const events = await readPersistedEvents(scaffold, sessionId)
    await writeFile(join(output, 'session-events.json'), JSON.stringify(events, null, 2))
    const interactive = events.filter(event => event.type === 'user/message' && event.data.content.some(part => part.type === 'text' && part.text.startsWith('Interactive input ')))
    expect(interactive).toHaveLength(3)
    expect(interactive[0]?.type === 'user/message' && interactive[0].data.content.some(part => part.type === 'file' && part.attachment.name === 'acceptance-notes.txt')).toBe(true)
    const foreign = await remote<RichMountValue>(scaffold, 'mount', scopes[3]!)
    await expect(remote(scaffold, 'invoke', { ...retryRequest, actionId: `foreign-${randomUUID()}`, mountId: foreign.mountId,
      expectedDataRevision: foreign.snapshot.dataRevision, draft: { baseRevision: foreign.snapshot.draft.draftRevision,
        stateSchemaVersion: 1, fields: {}, dirty: [] }, fileGrants: active.snapshot.files.map(file => file.grantId) })).rejects.toThrow()
    checks.push('Trusted Host upload reaches the Agent as a durable attachment; another block cannot reuse its grant')
    settled = scaffold.whenTurnSettled(30_000)
    await writeComposerDraft(page!, page!.locator('[data-composer-input]').first(), 'Ordinary regression.')
    await page!.locator('[data-composer-input]').first().press('Enter'); await settled
    await page!.getByText('Ordinary chat still works.', { exact: true }).waitFor({ state: 'visible' })
    expect(errors).toEqual([])
    await screenshot('05-final-chat')
    checks.push('Ordinary chat continues with the opt-in plugin enabled and no page errors')
    await input(0, '[name=destination]', 'archive this draft')
    settled = scaffold.whenTurnSettled(30_000)
    await writeComposerDraft(page!, page!.locator('[data-composer-input]').first(), 'Change the input schema.')
    await page!.locator('[data-composer-input]').first().press('Enter'); await settled
    await expect.poll(() => guest(0, 'rich.getState()?.pendingManifest?.stateSchemaVersion')).toBe(2)
    await block(0).getByRole('button', { name: 'Apply new version' }).click()
    await block(0).getByRole('button', { name: 'Keep current content' }).click()
    expect(await guest(0, 'document.querySelector("input").value')).toBe('archive this draft')
    await block(0).getByRole('button', { name: 'Apply new version' }).click()
    await block(0).getByRole('button', { name: 'Archive draft and update' }).click()
    await expect.poll(() => guest(0, 'rich.getState()?.manifest.stateSchemaVersion')).toBe(2)
    await block(0).getByText('Archived drafts (copy to restore)', { exact: true }).click()
    await expect.poll(() => block(0).locator('pre').textContent()).toContain('archive this draft')
    await block(0).scrollIntoViewIfNeeded(); await screenshot('07-archived-draft')
    checks.push('Incompatible Agent update requires trusted confirmation; keeping preserves input and applying archives a readable recoverable draft')
    const fork = await scaffold.ctx.sessionController.fork({ sessionId })
    const forked = await remote<RichMountValue>(scaffold, 'mount', { ...scopes[0]!, sessionId: fork.sessionId })
    expect(forked.snapshot).toMatchObject({ readOnly: true, actions: [], files: [], draft: { fields: {}, dirty: [] } })
    await expect(remote(scaffold, 'invoke', { ...retryRequest, sessionId: fork.sessionId, mountId: forked.mountId })).rejects.toThrow('FORK_READ_ONLY')
    expect(await remote(scaffold, 'reportRender', { sessionId: fork.sessionId, mountId: forked.mountId, state: 'failed', message: 'Untrusted inherited error' })).toEqual({ code: 'FORK_READ_ONLY', repairQueued: false })
    expect(adapter.submitted).toHaveLength(3)
    checks.push('Real Session fork inherits its own publication prefix as read-only, without parent drafts, grants or action replay')
    await page!.getByRole('button', { name: 'New session', exact: true }).last().click()
    settled = scaffold.whenTurnSettled(30_000)
    const freshInput = page!.locator('[data-composer-input][data-placeholder="Describe what you want to build, / commands, @ files or sessions"]')
    await freshInput.waitFor({ timeout: 15_000 })
    await freshInput.fill('做一个会动的小球动画。')
    await expect.poll(() => freshInput.textContent()).toBe('做一个会动的小球动画。')
    await freshInput.press('Enter')
    const secondSession = await settled
    expect(secondSession).not.toBe(sessionId)
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(1)
    await expect.poll(() => guest(0, 'document.getAnimations().length')).toBe(1)
    await expect.poll(() => guest(0, 'document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true)
    expect(adapter.promptedSessions.size).toBeGreaterThanOrEqual(2)
    await screenshot('10-second-session-animation-only')
    checks.push('Another fresh session automatically receives authoring instructions and renders a plain animation request inline')
    await page!.locator('[data-composer-input]').first().fill('帮我整理国庆期间的AI要闻。')
    await expect.poll(() => page!.locator('[data-composer-input]').first().textContent()).toBe('帮我整理国庆期间的AI要闻。')
    settled = scaffold.whenTurnSettled(30_000)
    await page!.locator('[data-composer-input]').first().press('Enter')
    await expect.poll(() => adapter.previewStage).toBe(1)
    await expect.poll(() => page!.locator('[data-rich-inline-preview] webview').count()).toBe(1)
    const previewGuest = async (index: number, source: string) => {
      const lease = await page!.locator('[data-rich-inline-preview] webview').nth(index).getAttribute('partition')
      return application!.evaluate(async ({ webContents }, args) => {
        const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${args.lease}/`))
        if (target === undefined) throw new Error('Preview guest not found')
        return target.executeJavaScript(args.source) as Promise<unknown>
      }, { lease, source })
    }
    await expect.poll(() => previewGuest(0, 'document.querySelector("#stream-title")?.textContent')).toContain('deterministic acceptance')
    await previewGuest(0, 'window.stableTitle=document.querySelector("#stream-title")')
    expect(await previewGuest(0, 'typeof rich')).toBe('undefined')
    expect(await previewGuest(0, 'document.body.inert')).toBe(true)
    expect(await previewGuest(0, 'getComputedStyle(document.documentElement).colorScheme')).toBe('dark')
    expect(await previewGuest(0, 'getComputedStyle(document.documentElement).getPropertyValue("--rich-bg").trim()')).toBe('#070b14')
    await screenshot('11-stream-first-preview')
    adapter.finishPreview()
    await expect.poll(() => adapter.previewStage).toBe(2)
    await expect.poll(() => page!.locator('[data-rich-inline-preview] webview').count()).toBe(2)
    await expect.poll(() => previewGuest(0, '!!document.querySelector("#moving")')).toBe(true)
    expect(await previewGuest(0, 'window.stableTitle===document.querySelector("#stream-title")')).toBe(true)
    expect(await previewGuest(0, 'document.body.dataset.scriptRuns??null')).toBeNull()
    expect(await previewGuest(0, 'typeof rich')).toBe('undefined')
    await expect.poll(() => page!.locator('[data-rich-inline-preview] webview').first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(300)
    await expect.poll(() => previewGuest(1, '!!document.querySelector("svg")')).toBe(true)
    await page!.locator('[data-rich-inline-preview]').last().scrollIntoViewIfNeeded()
    await screenshot('12-stream-complete-readonly')
    const callsBeforeCommit = adapter.calls
    adapter.finishStream(); await settled
    await expect.poll(() => page!.locator('[data-rich-inline-preview]').count()).toBe(0)
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(3)
    await expect.poll(() => guest(1, 'document.body.dataset.scriptRuns')).toBe('1')
    await expect.poll(() => guest(1, '!!rich.getState()')).toBe(true)
    expect(adapter.calls).toBe(callsBeforeCommit)
    const beforeFilter = adapter.calls
    await guest(2, 'document.querySelector("select").value="travel";document.querySelector("select").dispatchEvent(new Event("change"))')
    expect(await guest(2, 'document.querySelector("output").textContent')).toBe('1 categories')
    expect(adapter.calls).toBe(beforeFilter)
    const inlineEvent = (await readPersistedEvents(scaffold, secondSession)).findLast(event => event.type === 'assistant/message'
      && event.data.message.content.some(part => part.type === 'text' && part.text === streamReply))
    expect(inlineEvent?.type).toBe('assistant/message')
    if (inlineEvent?.type !== 'assistant/message') throw new Error('Settled rich-html message missing')
    await expect(JSON.stringify(inlineEvent.data.message.content, null, 2)).toMatchFileSnapshot('./expected/rich-inline-stream/native-code-result.txt')
    const request = { sessionId: secondSession, messageId: inlineEvent.data.message.id,
      blockId: authoredBlockId(inlineEvent.data.message.id, streamCode.key) }
    const mountedInline = await remote<RichMountValue>(scaffold, 'mount', request)
    const childInline = await scaffold.ctx.sessionController.fork({ sessionId: secondSession })
    expect((await remote<RichMountValue>(scaffold, 'mount', { ...request, sessionId: childInline.sessionId })).snapshot.readOnly).toBe(true)
    const conditional = await remote<{ revision: string; snapshot: RichSnapshot | null }>(scaffold, 'snapshotIfChanged', { sessionId: secondSession, mountId: mountedInline.mountId, revision: null })
    expect((await remote<{ snapshot: RichSnapshot | null }>(scaffold, 'snapshotIfChanged', { sessionId: secondSession, mountId: mountedInline.mountId, revision: conditional.revision })).snapshot).toBeNull()
    await input(1, '[name=destination]', 'stream draft preserved')
    await expect.poll(() => guest(1, 'rich.getState()?.draft.fields.destination')).toBe('stream draft preserved')
    await page!.reload(); await page!.waitForSelector('[class*="frame"]')
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(3)
    await expect.poll(() => guest(1, 'document.querySelector("[name=destination]")?.value')).toBe('stream draft preserved')
    await expect.poll(() => guest(2, '!!document.querySelector("svg")')).toBe(true)
    await block(1).evaluate((element) => { element.scrollIntoView({ block: 'start' }) })
    await expect.poll(() => guest(1, 'document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true)
    await guest(1, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
    await page!.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
    }))
    expect(adapter.calls).toBe(beforeFilter)
    await screenshot('13-code-only-news-final')
    checks.push('Natural news request receives rich-html default policy; two native previews preserve completed DOM siblings')
    checks.push('Complete streamed JS remains inert until durable settlement; preview has no business SDK or action channel')
    checks.push('Final code-only output enables live animation, independent chart filtering, draft recovery and read-only fork without an extra model call')
    checks.push('Conditional polling returns null for unchanged state instead of retransmitting HTML/CSS/JS')
    await page!.locator('[data-composer-input]').first().fill('生成一个内容后取消。')
    await expect.poll(() => page!.locator('[data-composer-input]').first().textContent()).toBe('生成一个内容后取消。')
    settled = scaffold.whenTurnSettled(30_000)
    await page!.locator('[data-composer-input]').first().press('Enter')
    await expect.poll(() => adapter.cancelledStage).toBe(true)
    await expect.poll(() => page!.locator('[data-rich-inline-preview] webview').count()).toBe(1)
    await expect.poll(() => previewGuest(0, '!!document.querySelector("#cancel-preview")')).toBe(true)
    expect(await previewGuest(0, 'window.evilRan??null')).toBeNull()
    expect(await previewGuest(0, 'document.querySelectorAll("[data-rich-content-root] script,[onerror],[onclick]").length')).toBe(0)
    const previewCalls = adapter.calls
    await previewGuest(0, 'richGuest.send({type:"action.invoke",confirmed:true,userGesture:true,values:{unauthorized:true}})')
    expect(adapter.calls).toBe(previewCalls)
    const previewSection = page!.locator('[data-rich-inline-preview]').first()
    for (const width of [240, 200]) {
      await previewSection.evaluate((section, value) => { (section as HTMLElement).style.width = `${value}px` }, width)
      if (width === 240) await screenshot('22-narrow-preview-header')
      const layout = await previewSection.evaluate((section) => {
        const header = section.firstElementChild!
        const box = header.getBoundingClientRect()
        const title = header.firstElementChild!.getBoundingClientRect()
        const state = header.querySelector('[role=status]')!.getBoundingClientRect()
        const tools = [...header.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        return { width: section.clientWidth, height: box.height, overflow: header.scrollWidth - header.clientWidth,
          toolsVisible: tools.length > 0 && tools.every(tool => tool.left >= box.left && tool.right <= box.right && tool.width >= 28),
          toolsBesideTitle: tools.every(tool => Math.abs(tool.top + tool.height / 2 - title.top - title.height / 2) < 2),
          stateBelow: tools.every(tool => state.top >= tool.bottom - 1) }
      })
      expect(layout, `preview header at ${width}px`).toMatchObject({ width, overflow: 0, toolsVisible: true, toolsBesideTitle: true, stateBelow: true })
      expect(layout.height, `preview header height at ${width}px`).toBeLessThan(140)
    }
    await previewSection.evaluate((section) => { (section as HTMLElement).style.width = '' })
    await page!.getByRole('button', { name: 'Stop generating', exact: true }).click()
    await settled
    expect(await page!.locator('[data-rich-inline-block] webview').count()).toBe(3)
    const interrupted = (await readPersistedEvents(scaffold, secondSession)).findLast(event => event.type === 'assistant/message' && event.data.interrupted === true)
    if (interrupted?.type === 'assistant/message') await expect(remote(scaffold, 'mount', { sessionId: secondSession,
      messageId: interrupted.data.message.id, blockId: authoredBlockId(interrupted.data.message.id, 'cancelled') })).rejects.toThrow()
    await page!.locator('[data-rich-inline-preview]').getByRole('button', { name: 'Close interactive content', exact: true }).click()
    await expect.poll(() => page!.locator('[data-rich-inline-preview] webview').count()).toBe(0)
    await screenshot('14-cancelled-preview-source-preserved')
    checks.push('Native malicious preview strips executable tags/handlers; cancellation refuses publication and trusted close terminates its lease')
    const beforeCorrection = adapter.calls
    settled = scaffold.whenTurnSettled(30_000)
    await page!.locator('[data-composer-input]').first().fill('帮我整理这些资料，不要用 Markdown，只生成 HTML 网页。')
    await page!.locator('[data-composer-input]').first().press('Enter')
    await settled
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(5)
    expect(adapter.calls - beforeCorrection).toBe(2)
    expect(adapter.formatCorrections).toBe(1)
    expect(await page!.getByText('The model returned Markdown. This is a compatibility view; an interactive webpage was not generated.', { exact: true }).count()).toBe(1)
    await expect.poll(() => guest(4, '!!document.querySelector("#corrected")')).toBe(true)
    await guest(4, 'document.querySelector("#search").value="Beta";document.querySelector("#search").dispatchEvent(new Event("input"))')
    expect(await guest(4, 'document.querySelectorAll("li:not([hidden])").length')).toBe(1)
    expect(adapter.calls - beforeCorrection).toBe(2)
    const correctionEvents = await readPersistedEvents(scaffold, secondSession)
    expect(correctionEvents.filter(event => event.type === 'user/message' && event.data.source.kind === 'rich-inline-format')).toHaveLength(1)
    const corrected = correctionEvents.findLast(event => event.type === 'assistant/message')
    if (corrected?.type !== 'assistant/message') throw new Error('Corrected HTML message missing')
    await expect(JSON.stringify(corrected.data.message.content, null, 2)).toMatchFileSnapshot('./expected/rich-inline-stream/format-corrected-result.txt')
    await block(4).scrollIntoViewIfNeeded(); await screenshot('15-format-correction-styled-search')
    await page!.reload(); await page!.waitForSelector('[class*="frame"]')
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(5)
    expect(adapter.calls - beforeCorrection).toBe(2)
    checks.push('A model that initially ignores HTML format receives one logged, tool-free correction; corrected native webpage filters locally and history reload never repeats the correction')
    settled = scaffold.whenTurnSettled(30_000)
    await page!.locator('[data-composer-input]').first().fill('展示统一暗色主题样例。')
    await page!.locator('[data-composer-input]').first().press('Enter')
    await settled
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(9)
    await expect.poll(() => guest(5, '!!document.querySelector(".rich-answer")')).toBe(true)
    await expect.poll(() => guest(8, '!!rich.getState()')).toBe(true)
    const themeEvents = await readPersistedEvents(scaffold, secondSession)
    const themeMessage = themeEvents.findLast(event => event.type === 'assistant/message')
    if (themeMessage?.type !== 'assistant/message') throw new Error('Themed message missing')
    await expect(JSON.stringify(themeMessage.data.message.content, null, 2)).toMatchFileSnapshot('./expected/rich-inline-theme/native-code-result.txt')
    const themeMeasurements = await guest<Record<string, string | number>>(5, '(()=>{const s=getComputedStyle(document.body),answer=getComputedStyle(document.querySelector(\'.rich-answer\'));return {mode:getComputedStyle(document.documentElement).colorScheme,background:s.backgroundColor,text:s.color,font:s.fontSize,lineHeight:s.lineHeight,answerBackground:answer.backgroundColor,answerBorder:answer.borderTopWidth,cssBytes:new TextEncoder().encode(document.querySelector(\'head > style:last-of-type\').textContent).byteLength};})()')
    expect(themeMeasurements).toMatchObject({ mode: 'dark', background: 'rgb(7, 11, 20)', text: 'rgb(214, 226, 243)', font: '14px', lineHeight: '23.1px', answerBackground: 'rgba(0, 0, 0, 0)', answerBorder: '0px' })
    expect(await guest(5, '(()=>{const pre=document.createElement("pre"),block=document.createElement("code"),inline=document.createElement("code");pre.append(block);document.body.append(pre,inline);const sizes=[pre,block,inline].map(element=>getComputedStyle(element).fontSize);pre.remove();inline.remove();return sizes})()'))
      .toEqual(['12.5px', '12.5px', '12.6px'])
    expect(await block(5).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(7, 11, 20)')
    expect(await block(5).getByRole('button', { name: 'Close interactive content', exact: true }).evaluate(button => getComputedStyle(button).color)).toBe('rgb(132, 148, 176)')
    for (const [index, name] of [[5, '16-theme-answer'], [6, '17-theme-comparison'], [7, '18-theme-form'], [8, '19-theme-chart']] as const) {
      await expect.poll(() => guest(index, 'document.documentElement.scrollHeight <= innerHeight')).toBe(true)
      await block(index).evaluate((element) => { element.scrollIntoView({ block: 'start', behavior: 'instant' }) })
      await screenshot(name)
    }
    const themeCalls = adapter.calls
    await click(5, 'summary')
    expect(await guest(5, 'document.querySelector("details").open')).toBe(true)
    await input(7, '[name=task]', '完成主题验收')
    await click(7, 'button[type=submit]')
    expect(await guest(7, 'document.querySelector("#plan").textContent')).toContain('完成主题验收 · 25 分钟')
    await application!.evaluate(({ webContents }, lease) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
      target.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); target.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    }, await block(7).locator('webview').getAttribute('partition'))
    expect(await guest(7, 'document.activeElement.type')).toBe('reset')
    expect(await guest(7, 'getComputedStyle(document.activeElement).outlineWidth')).toBe('2px')
    const contrast = await guest<Record<string, number>>(7, `(()=>{
      const context=document.createElement('canvas').getContext('2d');
      const luminance=color=>{context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3).map(n=>{const c=n/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0)};
      const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
      const body=getComputedStyle(document.body),muted=getComputedStyle(document.querySelector('.rich-muted')),primary=getComputedStyle(document.querySelector('.rich-primary')),input=getComputedStyle(document.querySelector('input[name=task]'));
      return {text:ratio(body.color,body.backgroundColor),muted:ratio(muted.color,body.backgroundColor),primary:ratio(primary.color,primary.backgroundColor),controlBorder:ratio(input.borderColor,input.backgroundColor)};
    })()`)
    await writeFile(join(output, 'theme-contrast.json'), JSON.stringify(contrast, null, 2))
    for (const name of ['text', 'muted', 'primary']) expect(contrast[name], `Contrast of ${name}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast.controlBorder).toBeGreaterThanOrEqual(3)
    await block(7).evaluate((element) => { element.scrollIntoView({ block: 'start', behavior: 'instant' }) }); await screenshot('20-theme-form-result')
    await click(8, '#chart-large')
    expect(await guest(8, 'document.querySelectorAll(".bar:not([hidden])").length')).toBe(2)
    expect(await guest(8, 'document.querySelector("#chart-total").textContent')).toBe('2')
    await click(8, '#chart-motion')
    expect(await guest(8, 'getComputedStyle(document.querySelector("#theme-pulse")).animationPlayState')).toBe('paused')
    expect(adapter.calls).toBe(themeCalls)
    expect(await guest(5, 'document.querySelectorAll("input").length')).toBe(0)
    await application!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(620, 860) })
    await expect.poll(() => guest(6, 'document.documentElement.scrollWidth <= innerWidth')).toBe(true)
    expect(await guest(6, 'document.querySelector(".rich-table-wrap").scrollWidth > document.querySelector(".rich-table-wrap").clientWidth')).toBe(true)
    expect(await guest(7, 'getComputedStyle(document.querySelector(".rich-form")).gridTemplateColumns.split(" ").length')).toBe(1)
    await block(6).evaluate((element) => { element.scrollIntoView({ block: 'start', behavior: 'instant' }) }); await screenshot('21-theme-narrow-table')
    await application!.evaluate(async ({ webContents }, lease) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`dsh-app://${lease}/`))!
      const attached = target.debugger.isAttached()
      if (!attached) target.debugger.attach('1.3')
      try { await target.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }) }
      finally { if (!attached) target.debugger.detach() }
    }, await block(8).locator('webview').getAttribute('partition'))
    expect(await guest(8, 'getComputedStyle(document.querySelector("#theme-pulse")).animationDuration')).toBe('1e-05s')
    await application!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1280, 900) })
    await guest(5, 'document.documentElement.style.setProperty("--rich-accent", "#79d9ca")')
    expect(await guest(5, 'getComputedStyle(document.querySelector(".rich-steps > li"), "::before").color')).toBe('rgb(121, 217, 202)')
    expect(await guest(6, 'getComputedStyle(document.documentElement).getPropertyValue("--rich-accent").trim()')).toBe('#3dd0ff')
    await writeFile(join(output, 'theme-measurements.json'), JSON.stringify({ ...themeMeasurements, contrast, keyboardFocusRing: true, trustedToolbarReadable: true, sampleCount: themeExamples.length, modelCallsBeforeLocal: themeCalls, modelCallsAfterLocal: adapter.calls, narrowTableScroll: true, reducedMotion: true, perBlockOverride: true }, null, 2))
    checks.push('Built-in cyber CSS styles ordinary code-only answers, comparisons, forms and charts without duplicated CSS; previews and final guests share the same profile theme')
    checks.push('Themed local form, details, filters and animation controls remain independent and cause no model call; narrow layouts scroll only the wide table and reduced-motion media stops animation')
    await page!.reload(); await page!.waitForSelector('[class*="frame"]')
    await expect.poll(() => page!.locator('[data-rich-inline-block] webview').count()).toBe(9)
    await expect.poll(() => guest(5, 'getComputedStyle(document.body).backgroundColor')).toBe('rgb(7, 11, 20)')
    expect(adapter.calls).toBe(themeCalls)
    checks.push('History reload reapplies the theme without rewriting authored CSS or replaying model/business actions')
    if (process.env.DSH_RICH_HOLD_UI === '1') {
      await block(3).evaluate((element) => { element.scrollIntoView({ block: 'start' }) })
      await new Promise<void>((resolve) => { setTimeout(resolve, 30_000) })
      await screenshot('06-ui-inspection')
    }
    passed = true
  } finally {
    adapter.release()
    adapter.finishPreview(); adapter.finishStream()
    if (application !== undefined) {
      if (!passed) {
        try { await page?.screenshot({ path: join(output, 'failure.png') }) } catch (error) { errors.push(String(error)) }
      }
      await application.close()
    }
    await writeFile(join(output, 'native-chat-results.json'), JSON.stringify({ passed, model: 'deterministic substitute; no paid API calls', checks, errors, modelCalls: adapter.calls, formatCorrections: adapter.formatCorrections, submissions: adapter.submitted, renderRepairs: adapter.repaired.size, promptedSessions: adapter.promptedSessions.size, userInputs: adapter.userInputs }, null, 2))
    // The ephemeral loopback authentication URL is not part of retained delivery evidence.
    await writeFile(join(output, 'launch.json'), JSON.stringify({ url: 'redacted after run' }))
    await scaffold?.close()
  }
}

it.skipIf(process.platform !== 'win32')('copies a selected region in the actual Electron chat without invoking the Agent',
  async () => { await runNativeChat(true) }, 60_000)

it.skipIf(process.platform !== 'win32')('accepts rich content in the actual Electron chat and preserves isolated interaction lifetimes',
  async () => { await runNativeChat(false) }, 180_000)

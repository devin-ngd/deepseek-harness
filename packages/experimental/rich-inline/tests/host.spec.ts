/** Host logic with real tool registry and JSON ledger; Session transport is a controlled unit double. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RichInline from '../src/host/index.ts'
import type { Config } from '../src/host/index.ts'
import type { RichAppearance } from '../src/shared/theme.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import type { RichActionId, RichBlockId, RichInvokeRequest } from '../src/shared/types.ts'
import type { RichSessionRecord } from '../src/host/ledger.ts'
import { richMarkerIds } from '../src/shared/validate.ts'
import { RICH_MAX_CONTENT_BYTES, RICH_MAX_INPUT_BYTES } from '../src/shared/limits.ts'
import { authoredBlockId } from '../src/shared/authored.ts'
import { legacyContent } from '../src/host/legacy.ts'
import type { SessionPromptRequest } from '@deepseek-ai/dsh-api-session-controller/types'

const resources: { ctx: Context; root: string; remove: boolean }[] = []
afterEach(async () => {
  for (const owned of resources.splice(0).reverse()) {
    await owned.ctx.fiber.dispose()
    if (owned.remove) {
      expect(owned.root.startsWith(join(tmpdir(), 'dsh-rich-host-'))).toBe(true)
      await rm(owned.root, { recursive: true, force: true })
    }
  }
})
/** Profile YAML before schema resolution turns `theme` into a live reference. */
type ProfileConfig = Omit<Config, 'theme'> & { theme: RichAppearance['theme'] }
const limits: ProfileConfig = { maxContentBytes: 2_097_152, maxInputBytes: 131_072, maxFileBytes: 10_485_760,
  maxBlocksPerSession: 128, maxActionsPerSession: 2_000, dispatchRetryDelayMs: 20, maxDispatchAttempts: 3, maxAutoRepairAttempts: 2,
  maxFormatRepairAttempts: 1, theme: 'cyber', accent: 'blue' }

async function harness(root?: string, seed: readonly SessionEvent[] = [], config: Partial<ProfileConfig> = {},
  options: { live?: boolean; preset?: string } = {}) {
  const dir = root ?? await mkdtemp(join(tmpdir(), 'dsh-rich-host-'))
  const ctx = new Context()
  if (options.preset !== undefined) ctx.provide('agentPresets', { composedPreset: () => options.preset } as never)
  resources.push({ ctx, root: dir, remove: root === undefined })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: dir })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const session = ctx.sessions.create(SessionId('session-rich-unit'), { seed })
  const pending: UserMessage[] = []
  const nextStep: UserMessage[] = []
  for (const event of seed) {
    if (event.type === 'agent/inbox/spliced') pending.splice(event.data.start, event.data.removedCount ?? 0, ...event.data.inserted)
  }
  const unsupported = (): never => { throw new Error('unit harness does not implement this inbox mutation') }
  const agent: Agent = { id: session.id, ctx, session, options: {}, status: 'idle',
    inbox: { nextTurn: pending, nextStep, clear: () => { pending.length = 0; nextStep.length = 0 },
      append: unsupported, prepend: unsupported, replace: unsupported, splice: unsupported,
      remove: (id) => { const index = pending.findIndex(message => message.id === id); if (index < 0) return false; pending.splice(index, 1); session.append('agent/inbox/spliced', { target: 'next-turn', start: index, removedCount: 1, inserted: [], outcome: 'canceled' }); return true } },
    followup: (message) => { pending.push(message); session.append('agent/inbox/spliced', { target: 'next-turn', start: pending.length - 1, inserted: [message] }) },
    steer: (message) => { nextStep.push(message); session.append('agent/inbox/spliced', { target: 'next-step', start: nextStep.length - 1, inserted: [message] }) },
    inject: unsupported, send: unsupported, cancel: unsupported,
    whenIdle: () => Promise.resolve(), runMaintenance: task => task(new AbortController().signal),
  }
  await ctx.agents.register(agent)
  const prompts: SessionPromptRequest[] = []
  const resolved = vi.fn(async () => ({ agent }))
  const prompt = vi.fn(async (request: SessionPromptRequest) => {
    if (!pending.some(message => message.source.kind === 'user' && 'rpcId' in message.source && message.source.rpcId === request.requestId)) {
      prompts.push(request)
      agent.followup(createUserMessage({ content: [{ type: 'text', text: request.content.filter(part => part.type === 'text').map(part => part.text).join('') }], source: { kind: 'user', rpcId: request.requestId } }))
    }
    return { accepted: true }
  })
  ctx.provide('sessionController', { resolveAgent: resolved, inspect: async () => ({ meta: session.header, inheritedEventCount: 0, events: session.snapshotEvents() }), prompt } as never)
  const flush = vi.fn(async () => {})
  ctx.provide('sessionPersistence', { flush } as never)
  ctx.provide('typert', {} as never)
  ctx.provide('attachments', {} as never)
  ctx.provide('fileUploads', {} as never)
  // A Loader entry lets a test edit the profile configuration the way the Plugins page theme picker does.
  const live = options.live === true ? await liveConfig(ctx, RichInline, { ...limits, ...config }) : undefined
  const owner = live?.fiber ?? await ctx.plugin(RichInline, { ...limits, ...config })
  const host = ctx.richInline
  const tool = async (name: string, args: Record<string, unknown>) => {
    const callId = ToolCallId(`unit-${randomUUID()}`)
    session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
    const result = await ctx.tools.execute({ agent, callId, name, arguments: args, signal: new AbortController().signal })
    session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
      ...result.meta === undefined ? {} : { meta: result.meta } }, { surfaceOp: 'append' })
    return result
  }
  const publish = async (blockId?: RichBlockId, values: Record<string, unknown> = {}, stateSchemaVersion = 1) => {
    const result = await tool('rich_inline_publish', { html: '<div id="any"><form><input name="last"><button>Submit</button></form></div>',
      css: '#any{display:grid;animation:pulse 1s}', js: 'window.rich.bindForm(document.querySelector("form"))', fallbackText: 'Arbitrary form fallback', stateSchemaVersion, values,
      ...blockId === undefined ? {} : { blockId } })
    expect(result.isError).toBe(false)
    const text = result.content.find(part => part.type === 'text')
    if (text?.type !== 'text') throw new Error('publish did not return its marker')
    const id = richMarkerIds(text.text)[0]
    if (id === undefined) throw new Error('marker missing')
    return id
  }
  const bind = async (id: RichBlockId) => {
    const message = createAssistantMessage({ content: [{ type: 'text', text: `Before\n\`\`\`rich-inline\n${JSON.stringify({ blockId: id })}\n\`\`\`\nAfter` }], source: { provider: 'unit', model: 'unit' } })
    session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
    return host.mount({ sessionId: session.id, messageId: message.id, blockId: id })
  }
  const claim = async () => {
    await vi.waitFor(() =>{  expect(pending.length).toBeGreaterThan(0) })
    const message = pending.shift()!
    session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
    session.append('turn/start', { turn: 1 })
    session.append('user/message', message, { surfaceOp: 'append' })
    return message
  }
  return { ctx, dir, session, agent, host, prompts, prompt, resolved, flush, owner, live, tool, publish, bind, claim }
}

function intent(mounted: Awaited<ReturnType<RichInline['mount']>>, actionId = brandString<RichActionId>(`action-${randomUUID()}`)): RichInvokeRequest {
  return { mountId: mounted.mountId, actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: mounted.snapshot.dataRevision,
    values: { text: 'last-key' }, fileGrants: [], draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { text: 'last-key' }, dirty: ['text'] } }
}

describe('bounded final format correction', () => {
  it('logs one correction, removes tools, denies forged tool execution, and never retries on historical mounting', async () => {
    const h = await harness()
    let executions = 0
    h.ctx.tools.register(defineTool({ name: 'business_operation', description: 'Count executions', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => { executions++; return 'Executed' } }))
    h.session.append('turn/start', { turn: 1 })
    h.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '整理桌面文件' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const markdown = '# Desktop files\n' + '- A file\n'.repeat(70)
    const answer = createAssistantMessage({ content: [{ type: 'text', text: markdown }], source: { provider: 'unit', model: 'unit' } })
    h.session.append('assistant/message', { turn: 1, step: 1, message: answer, stream: [] }, { surfaceOp: 'append' })
    const stop = () => h.ctx.serial('agent/turn-stopping', { agent: h.agent, turn: 1, signal: new AbortController().signal })
    await stop()
    expect(h.agent.inbox.nextStep).toHaveLength(1)
    const correction = h.agent.inbox.nextStep[0]!
    expect(correction.source).toMatchObject({ kind: 'rich-inline-format' })
    expect(correction.content).toMatchSnapshot('logged format correction')
    expect((await h.ctx.systemPrompt.assemble({ agent: h.agent })).tools).toEqual([])
    const forged = await h.tool('business_operation', {})
    expect(forged.isError).toBe(true)
    expect(executions).toBe(0)
    const human = createUserMessage({ content: [{ type: 'text', text: 'Start a different task.' }], source: { kind: 'user' } })
    h.ctx.emit('agent/inbox/inserted', { agent: h.agent, message: human })
    expect((await h.tool('business_operation', {})).isError).toBe(true)
    expect(executions).toBe(0)
    h.session.append('user/message', correction, { surfaceOp: 'append' })
    await stop()
    expect(h.agent.inbox.nextStep).toHaveLength(1)
    await h.host.mount({ sessionId: h.session.id, messageId: answer.id, blockId: authoredBlockId(answer.id, 'legacy') })
    expect(h.agent.inbox.nextStep).toHaveLength(1)
    h.ctx.emit('agent/inbox/claimed', { agent: h.agent, message: human, turn: 1 })
    expect((await h.ctx.systemPrompt.assemble({ agent: h.agent })).tools.some(tool => tool.name === 'business_operation')).toBe(true)
    expect((await h.tool('business_operation', {})).isError).toBe(true)
    h.session.append('user/message', human, { surfaceOp: 'append' })
    expect((await h.tool('business_operation', {})).isError).not.toBe(true)
    expect(executions).toBe(1)
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect((await h.ctx.systemPrompt.assemble({ agent: h.agent })).tools.some(tool => tool.name === 'business_operation')).toBe(true)
    expect((await h.tool('business_operation', {})).isError).not.toBe(true)
    expect(executions).toBe(2)
    h.ctx.emit('agent/inbox/claimed', { agent: h.agent, message: correction, turn: 2 })
    expect((await h.ctx.systemPrompt.assemble({ agent: h.agent })).tools).toEqual([])
    expect((await h.tool('business_operation', {})).isError).toBe(true)
    expect(executions).toBe(2)
    await h.owner.dispose()
    expect((await h.tool('business_operation', {})).isError).not.toBe(true)
    expect(executions).toBe(3)
  })
})

describe('code-only assistant messages', () => {
  const code = { key: 'news', html: '<h1>News</h1>', css: '', js: '', fallbackText: 'News', stateSchemaVersion: 1 }
  it('commits once from settled source and recovers without replaying actions', async () => {
    const h = await harness()
    const message = createAssistantMessage({ content: [{ type: 'text', text: `\`\`\`rich-html\n${JSON.stringify(code)}\n\`\`\`` }], source: { provider: 'unit', model: 'unit' } })
    const request = { sessionId: h.session.id, messageId: message.id, blockId: authoredBlockId(message.id, code.key) }
    await expect(h.host.mount(request)).rejects.toThrow('settled')
    h.session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
    const first = await h.host.mount(request)
    h.host.dispose({ mountId: first.mountId })
    const second = await h.host.mount(request)
    expect(second.snapshot.manifest).toEqual(first.snapshot.manifest)
    expect(second.snapshot.actions).toEqual([])
    expect(h.prompts).toEqual([])
    const poll = await h.host.snapshotIfChanged({ mountId: second.mountId, revision: null })
    expect(poll.snapshot).not.toBeNull()
    expect((await h.host.snapshotIfChanged({ mountId: second.mountId, revision: poll.revision })).snapshot).toBeNull()
    await h.host.saveDraft({ mountId: second.mountId, draft: { baseRevision: 0, stateSchemaVersion: 1, fields: { note: 'last key' }, dirty: ['note'] } })
    expect((await h.host.snapshotIfChanged({ mountId: second.mountId, revision: poll.revision })).snapshot?.draft.fields).toEqual({ note: 'last key' })
  })
  it.each(['invalid', 'duplicate', 'interrupted'])('refuses %s publication without creating authority', async (kind) => {
    const h = await harness()
    const fence = `\`\`\`rich-html\n${JSON.stringify(code)}\n\`\`\``
    const text = kind === 'invalid' ? fence.replace('"news"', '"../bad"') : kind === 'duplicate' ? `${fence}\n${fence}` : fence
    const message = createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'unit', model: 'unit' } })
    h.session.append('assistant/message', { turn: 1, step: 1, message, stream: [],
      ...(kind === 'interrupted' ? { interrupted: true as const } : {}) }, { surfaceOp: 'append' })
    await expect(h.host.mount({ sessionId: h.session.id, messageId: message.id,
      blockId: authoredBlockId(message.id, code.key) })).rejects.toThrow()
    expect(h.prompts).toEqual([])
  })
  it('presents old reports as HTML and honors an explicit Markdown request', async () => {
    const escaped = legacyContent('# Report\n<script>window.ran=true</script>\n\n[bad](javascript:alert(1))')
    expect(escaped.js).toBe('')
    expect(escaped.html).not.toContain('<script>')
    expect(escaped.html).not.toContain('href="javascript:')
    expect(legacyContent('| Item | Impact |\n| --- | --- |\n| Release | **High** |').html)
      .toContain('<thead><tr><th>Item</th><th>Impact</th></tr></thead><tbody><tr><td>Release</td><td><strong>High</strong></td></tr></tbody>')
    const h = await harness()
    const text = '# News report\n' + '- Original fact\n'.repeat(70)
    const message = createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'unit', model: 'unit' } })
    h.session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
    const value = await h.host.mount({ sessionId: h.session.id, messageId: message.id, blockId: authoredBlockId(message.id, 'legacy') })
    expect(value.snapshot.manifest.html).toContain('<h1>News report</h1>')
    expect(value.snapshot.manifest.fallbackText).toBe(text)
    expect(h.prompts).toEqual([])
    h.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '用 Markdown 输出' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const explicit = createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'unit', model: 'unit' } })
    h.session.append('assistant/message', { turn: 2, step: 1, message: explicit, stream: [] }, { surfaceOp: 'append' })
    await expect(h.host.mount({ sessionId: h.session.id, messageId: explicit.id, blockId: authoredBlockId(explicit.id, 'legacy') })).rejects.toThrow('PLAIN_TEXT_REQUESTED')
  })
})

function publicationAtBytes(bytes: number, blockId?: RichBlockId) {
  const prefix = '<div aria-label="中文">'
  const suffix = '</div>'
  const base = { html: prefix + suffix, css: '', js: '', fallbackText: 'Complete UTF-8 content', stateSchemaVersion: 1, values: {},
    ...blockId === undefined ? {} : { blockId } }
  const padding = bytes - Buffer.byteLength(JSON.stringify(base))
  if (padding < 0) throw new Error('publication budget below its required fields')
  const html = prefix + '界'.repeat(Math.floor(padding / 3)) + 'a'.repeat(padding % 3) + suffix
  return { ...base, html }
}

describe('RichInline Host', () => {
  it('keeps standard coding output unchanged while Lumina exposes rich tools and checks final formatting', async () => {
    const h = await harness(undefined, [], { activePresets: ['lumina'] }, { preset: 'standard' })
    const standard = await h.ctx.systemPrompt.assemble({ agent: h.agent })
    expect(standard.sections.filter(section => section.text.length > 0).some(section => section.name === 'rich-inline:authoring')).toBe(false)
    expect(standard.contexts.some(context => context.name === 'rich-inline:output-format' && context.text.length > 0)).toBe(false)
    expect(standard.tools.some(tool => tool.name.startsWith('rich_inline_'))).toBe(false)
    expect((await h.tool('rich_inline_publish', { html: '<p>x</p>', css: '', js: '', fallbackText: 'x', stateSchemaVersion: 1 })).isError).toBe(true)
    h.session.append('turn/start', { turn: 1 })
    const markdown = '# Coding result\n' + 'Keep ordinary source code and Markdown.\n'.repeat(10)
    h.session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: markdown }], source: { provider: 'unit', model: 'unit' } }), stream: [] }, { surfaceOp: 'append' })
    await h.ctx.serial('agent/turn-stopping', { agent: h.agent, turn: 1, signal: new AbortController().signal })
    expect(h.agent.inbox.nextStep).toHaveLength(0)
    const lumina = await harness(undefined, [], { activePresets: ['lumina'] }, { preset: 'lumina' })
    const active = await lumina.ctx.systemPrompt.assemble({ agent: lumina.agent })
    expect(active.sections.find(section => section.name === 'rich-inline:authoring')?.text).toContain('You author code')
    expect(active.tools.some(tool => tool.name === 'rich_inline_publish')).toBe(true)
    await expect(lumina.publish()).resolves.toBeDefined()
    lumina.session.append('turn/start', { turn: 1 })
    lumina.session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: markdown }], source: { provider: 'unit', model: 'unit' } }), stream: [] }, { surfaceOp: 'append' })
    await lumina.ctx.serial('agent/turn-stopping', { agent: lumina.agent, turn: 1, signal: new AbortController().signal })
    expect(lumina.agent.inbox.nextStep).toHaveLength(1)
  })
  it('contributes the default authoring contract to existing and new scopes and removes it on disable', async () => {
    const h = await harness()
    for (const scope of [h.ctx, h.ctx.extend({ sessionId: 'another-session' })]) {
      const assembly = await h.ctx.systemPrompt.assemble({ scope })
      const guidance = assembly.sections.find(section => section.name === 'rich-inline:authoring')
      expect(guidance?.text).toContain('without asking the user to name a tool')
      expect(guidance?.text).toContain('final reply consists of its marker(s)')
      expect(guidance?.text).toContain('You author code; the plugin')
      expect(guidance?.text).toContain('Minimal format example')
      expect(assembly.contexts.find(context => context.name === 'rich-inline:output-format')?.text).toContain('code-only')
      expect(guidance?.text).toContain('Built-in appearance: the user selects one of several dark themes')
      expect(guidance?.text).toContain('--rich-accent-2')
      expect(guidance?.text).toContain('do not wrap the whole result in another bordered, shadowed or padded outer card')
      expect(guidance?.text).not.toContain('Active built-in appearance')
      expect(assembly.contexts.find(context => context.name === 'rich-inline:output-format')?.text)
        .toContain('Active built-in appearance: cyber (deep-space console')
      expect(assembly.contexts.find(context => context.name === 'rich-inline:output-format')?.text).toContain('accent #3dd0ff')
      expect(h.host.appearance()).toEqual({ theme: 'cyber', accent: 'blue' })
    }
    await h.owner.dispose()
    expect((await h.ctx.systemPrompt.assemble()).sections.some(section => section.name === 'rich-inline:authoring')).toBe(false)
    expect((await h.ctx.systemPrompt.assemble()).contexts.some(context => context.name === 'rich-inline:output-format')).toBe(false)
  })

  it('validates profile appearance and can disable the base sheet without disabling rich output', () => {
    expect(RichInline.Config({}).theme.get()).toBe('cyber')
    expect(RichInline.Config({}).accent).toBe('auto')
    for (const theme of ['aurora', 'neon', 'terminal', 'ember', 'dark', 'none'] as const) {
      expect(RichInline.Config({ theme, accent: 'violet' }).theme.get()).toBe(theme)
    }
    expect(RichInline.Config({ theme: 'none', accent: 'teal' }).accent).toBe('teal')
    // @ts-expect-error -- Profile YAML can contain an unsupported theme; the schema rejects it at load.
    expect(() => RichInline.Config({ theme: 'light' })).toThrow()
    // @ts-expect-error -- Profile YAML can contain an arbitrary accent string; the schema rejects it at load.
    expect(() => RichInline.Config({ accent: 'url(https://invalid.example)' })).toThrow()
  })

  it('logs the same profile appearance that the Client reads without creating an action', async () => {
    const h = await harness(undefined, [], { theme: 'none', accent: 'violet' })
    const assembly = await h.ctx.systemPrompt.assemble()
    expect(h.host.appearance()).toEqual({ theme: 'none', accent: 'violet' })
    const context = assembly.contexts.find(item => item.name === 'rich-inline:output-format')?.text
    expect(context).toContain('Built-in appearance is disabled')
    expect(context).not.toContain('Active built-in appearance')
    expect(h.prompts).toHaveLength(0)
  })

  it('names the graphite character and profile accent for the dark theme', async () => {
    const h = await harness(undefined, [], { theme: 'dark', accent: 'teal' })
    const assembly = await h.ctx.systemPrompt.assemble()
    expect(h.host.appearance()).toEqual({ theme: 'dark', accent: 'teal' })
    const context = assembly.contexts.find(item => item.name === 'rich-inline:output-format')?.text
    expect(context).toContain('Active built-in appearance: graphite (calm gray surfaces')
    expect(context).toContain('accent #5cd4c0')
  })

  it('switches the theme live from profile settings without restarting or changing the cached system prompt', async () => {
    const h = await harness(undefined, [], {}, { live: true })
    const host = h.host
    const { mountId } = await h.bind(await h.publish())
    const before = await h.ctx.systemPrompt.assemble()
    const section = before.sections.find(item => item.name === 'rich-inline:authoring')?.text
    await h.live!.update({ theme: 'aurora' })
    expect(host.appearance()).toEqual({ theme: 'aurora', accent: 'blue' })
    // A restarted Host would have dropped this in-memory mount.
    expect((await host.snapshot({ mountId })).scope.renderRevision).toBe(1)
    const after = await h.ctx.systemPrompt.assemble()
    expect(after.sections.find(item => item.name === 'rich-inline:authoring')?.text).toBe(section)
    expect(after.contexts.find(item => item.name === 'rich-inline:output-format')?.text).toContain('Active built-in appearance: aurora (polar night')
  })

  it('hides the generated settings page because the Client contributes its own theme row', async () => {
    const h = await harness()
    const release = vi.fn()
    const configure = vi.fn((_policy: { auto?: boolean }, _owner: unknown) => release)
    h.ctx.provide('settings', { configure } as never)
    await vi.waitFor(() => { expect(configure).toHaveBeenCalledOnce() })
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    // Identity only: printing a Fiber walks Context proxies.
    expect(Object.is(configure.mock.calls[0]?.[1], h.owner)).toBe(true)
    await h.owner.dispose()
    expect(release).toHaveBeenCalledOnce()
  })

  it('deduplicates bounded render repairs without business completion, authority, or replay on reopening', async () => {
    const h = await harness()
    const id = await h.publish(undefined, { confirmed: 'keep' })
    const first = await h.bind(id)
    await h.host.saveDraft({ mountId: first.mountId, draft: { baseRevision: 0, stateSchemaVersion: 1, fields: { last: 'unsent' }, dirty: ['last'] } })
    const report = { mountId: first.mountId, state: 'failed' as const, message: 'ReferenceError: undefinedChart' }
    expect(await h.host.reportRender(report)).toEqual({ code: 'RENDER_REPAIR_QUEUED', repairQueued: true })
    expect(await h.host.reportRender({ ...report, message: 'changed diagnostic' })).toEqual({ code: 'RENDER_ALREADY_REPORTED', repairQueued: false })
    await vi.waitFor(() => { expect(h.prompts).toHaveLength(1) })
    const feedback = h.prompts[0]!.content.find(part => part.type === 'text')
    expect(feedback?.type === 'text' && feedback.text.includes('untrusted-render-diagnostic')).toBe(true)
    expect((await h.host.snapshot({ mountId: first.mountId })).actions).toHaveLength(0)
    await expect(h.host.reportRender({ ...report, confirmed: true } as never)).rejects.toThrow('INVALID_RENDER_REPORT')
    const repaired = await h.tool('rich_inline_publish', { blockId: id, expectedRenderRevision: 1,
      html: '<div>Repaired</div>', css: '', js: '', fallbackText: 'Repaired', stateSchemaVersion: 1 })
    expect(repaired.isError).toBe(false)
    const stale = await h.tool('rich_inline_publish', { blockId: id, expectedRenderRevision: 1,
      html: '<div>Stale</div>', css: '', js: '', fallbackText: 'Stale', stateSchemaVersion: 1 })
    expect(stale.isError).toBe(true)
    await h.host.applyUpdate({ mountId: first.mountId, discardDraft: false })
    await expect(h.host.reportRender(report)).rejects.toThrow('STALE_MOUNT')
    const second = await h.host.mount({ sessionId: h.session.id, messageId: first.snapshot.scope.messageId, blockId: id })
    expect(second.snapshot.values).toEqual({ confirmed: 'keep' })
    expect(second.snapshot.draft.fields).toEqual({ last: 'unsent' })
    await h.host.reportRender({ mountId: second.mountId, state: 'rendered', message: '' })
    expect(await h.host.reportRender({ mountId: second.mountId, state: 'failed', message: 'Later error' })).toMatchObject({ repairQueued: true })
    await vi.waitFor(() => { expect(h.prompts).toHaveLength(2) })
    await h.publish(id)
    await h.host.applyUpdate({ mountId: second.mountId, discardDraft: false })
    const third = await h.host.mount({ sessionId: h.session.id, messageId: first.snapshot.scope.messageId, blockId: id })
    await h.host.reportRender({ mountId: third.mountId, state: 'rendered', message: '' })
    expect(await h.host.reportRender({ mountId: third.mountId, state: 'failed', message: 'Again' })).toEqual({ code: 'RENDER_REPAIR_LIMIT', repairQueued: false })
    const seed = h.session.snapshotEvents()
    await h.owner.dispose()
    await h.ctx.fiber.dispose()
    const reopened = await harness(h.dir, seed)
    const restored = await reopened.host.mount({ sessionId: reopened.session.id, messageId: first.snapshot.scope.messageId, blockId: id })
    expect(await reopened.host.reportRender({ mountId: restored.mountId, state: 'failed', message: 'Again' })).toMatchObject({ repairQueued: false })
    expect(reopened.prompts).toHaveLength(0)
  })
  it('caps deployment budgets at 2 MiB content and 128 KiB input without changing defaults', () => {
    expect(RichInline.Config(limits)).toMatchObject({ maxContentBytes: RICH_MAX_CONTENT_BYTES, maxInputBytes: RICH_MAX_INPUT_BYTES })
    expect(() => RichInline.Config({ ...limits, maxContentBytes: RICH_MAX_CONTENT_BYTES + 1 })).toThrow()
    expect(() => RichInline.Config({ ...limits, maxInputBytes: RICH_MAX_INPUT_BYTES + 1 })).toThrow()
    expect(RichInline.Config({ ...limits, maxContentBytes: 1_024, maxInputBytes: 512 }))
      .toMatchObject({ maxContentBytes: 1_024, maxInputBytes: 512 })
  })
  it('publishes exactly 2 MiB JSON UTF-8 and rejects one additional byte before touching the old ledger', async () => {
    const h = await harness()
    const first = await h.publish()
    const request = publicationAtBytes(RICH_MAX_CONTENT_BYTES, first)
    expect(Buffer.byteLength(JSON.stringify(request))).toBe(RICH_MAX_CONTENT_BYTES)
    expect(JSON.stringify(request).length).toBeLessThan(RICH_MAX_CONTENT_BYTES)
    expect((await h.tool('rich_inline_publish', request)).isError).toBe(false)
    const m = await h.bind(first)
    const before = await readFile(join(h.dir, 'rich_inline.json'))
    const over = { ...request, html: request.html + 'a' }
    expect(Buffer.byteLength(JSON.stringify(over))).toBe(RICH_MAX_CONTENT_BYTES + 1)
    const rejected = await h.tool('rich_inline_publish', over)
    expect(rejected.isError).toBe(true)
    expect(rejected.content.some(part => part.type === 'text' && part.text.includes('BLOCK_PUBLICATION_TOO_LARGE'))).toBe(true)
    expect(await readFile(join(h.dir, 'rich_inline.json'))).toEqual(before)
    expect((await h.host.snapshot({ mountId: m.mountId })).manifest.html).toBe(request.html)
  }, 15_000)
  it('stores and reopens HTML above the 128 KiB input budget byte-identically via a genuine tool marker', async () => {
    const h = await harness()
    const request = publicationAtBytes(400_000)
    expect(Buffer.byteLength(request.html)).toBeGreaterThan(RICH_MAX_INPUT_BYTES)
    const published = await h.tool('rich_inline_publish', request)
    expect(published.isError).toBe(false)
    const text = published.content.find(part => part.type === 'text')
    if (text?.type !== 'text') throw new Error('missing publication marker')
    const blockId = richMarkerIds(text.text)[0]
    if (blockId === undefined) throw new Error('missing block identity')
    const m = await h.bind(blockId)
    expect(Buffer.from(m.snapshot.manifest.html)).toEqual(Buffer.from(request.html))
    const seed = h.session.snapshotEvents()
    await h.owner.dispose()
    await h.ctx.fiber.dispose()
    const reopened = await harness(h.dir, seed)
    const restored = await reopened.host.mount({ sessionId: reopened.session.id, messageId: m.snapshot.scope.messageId, blockId })
    expect(Buffer.from(restored.snapshot.manifest.html)).toEqual(Buffer.from(request.html))
    expect(restored.snapshot.manifest.contentHash).toBe(m.snapshot.manifest.contentHash)
  })
  it('admits exact 128 KiB JSON UTF-8 input and refuses its one-byte-over variant without creating an action', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const base = { ...intent(m), values: { payload: '' } }
    const padding = RICH_MAX_INPUT_BYTES - Buffer.byteLength(JSON.stringify(base))
    const request = { ...base, values: { payload: '界'.repeat(Math.floor(padding / 3)) + 'a'.repeat(padding % 3) } }
    const before = await readFile(join(h.dir, 'rich_inline.json'))
    expect(Buffer.byteLength(JSON.stringify(request))).toBe(RICH_MAX_INPUT_BYTES)
    const over = { ...request, values: { payload: request.values.payload + 'a' } }
    expect(Buffer.byteLength(JSON.stringify(over))).toBe(RICH_MAX_INPUT_BYTES + 1)
    await expect(h.host.invoke(over)).rejects.toThrow('INVALID_ACTION')
    expect(await readFile(join(h.dir, 'rich_inline.json'))).toEqual(before)
    expect((await h.host.snapshot({ mountId: m.mountId })).actions).toEqual([])
    expect(await h.host.invoke(request)).toMatchObject({ accepted: true, state: 'accepted' })
    await vi.waitFor(() =>{  expect(h.prompts).toHaveLength(1) })
  })
  it('commits last-keystroke draft, immutable receipt, and outbox together before returning accepted', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    const first = await h.host.invoke(request)
    const disk = JSON.parse(await readFile(join(h.dir, 'rich_inline.json'), 'utf8')) as { tables: { sessions: Record<string, RichSessionRecord> } }
    const aggregate = disk.tables.sessions[h.session.id]
    expect(aggregate!.blocks[m.snapshot.scope.blockId]!.draft.fields).toEqual({ text: 'last-key' })
    expect(aggregate!.actions[request.actionId]!.receipt).toEqual(first)
    expect(first).toMatchObject({ accepted: true, state: 'accepted' })
    expect(await h.host.invoke(request)).toEqual(first)
    await vi.waitFor(() =>{  expect(h.prompts).toHaveLength(1) })
    expect(h.flush).toHaveBeenCalled()
    expect((await h.host.snapshot({ mountId: m.mountId })).actions[0]?.terminal).toBe(false)
  })
  it('returns original receipt after draft and data advance; changed retry payload conflicts', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    const first = await h.host.invoke(request)
    await h.claim()
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).state).toBe('running')
    })
    await h.tool('rich_inline_complete', { actionId: request.actionId, state: 'completed', values: { result: 'done' } })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).state).toBe('completed')
    })
    expect(await h.host.invoke(request)).toEqual(first)
    expect(await h.host.invoke({ ...request, values: { text: 'different' } })).toMatchObject({ accepted: false, code: 'ACTION_ID_CONFLICT' })
    expect((await h.host.snapshot({ mountId: m.mountId })).values).toEqual({ result: 'done' })
  })
  it('preserves dirty draft and defers full replacement until the host explicitly applies it', async () => {
    const h = await harness()
    const id = await h.publish()
    const m = await h.bind(id)
    expect(await h.host.saveDraft({ mountId: m.mountId, draft: { baseRevision: 0, stateSchemaVersion: 1, fields: { text: 'editing' }, dirty: ['text'] } })).toMatchObject({ accepted: true })
    expect(await h.host.saveDraft({ mountId: m.mountId, draft: { baseRevision: 0, stateSchemaVersion: 1, fields: { text: 'another-tab' }, dirty: ['text'] } })).toMatchObject({ code: 'DRAFT_CONFLICT' })
    await h.publish(id, { server: 'new-data' }, 2)
    const waiting = await h.host.snapshot({ mountId: m.mountId })
    expect(waiting.manifest.renderRevision).toBe(1)
    expect(waiting.pendingManifest?.renderRevision).toBe(2)
    expect(waiting.draft.fields).toEqual({ text: 'editing' })
    await expect(h.host.applyUpdate({ mountId: m.mountId, discardDraft: false })).rejects.toThrow('DIRTY_DRAFT')
    const applied = await h.host.applyUpdate({ mountId: m.mountId, discardDraft: true })
    expect(applied.archivedDrafts[0]?.fields).toEqual({ text: 'editing' })
    expect(applied.draft.fields).toEqual({})
    expect(() => h.host.snapshot({ mountId: m.mountId })).toThrow('STALE_MOUNT')
    expect(applied.manifest.renderRevision).toBe(2)
  })
  it('stages mounted replacements before a debounced draft arrives and keeps compatible edits on application', async () => {
    const h = await harness()
    const id = await h.publish()
    const m = await h.bind(id)
    await h.publish(id, { server: 'updated' })
    expect((await h.host.snapshot({ mountId: m.mountId })).pendingManifest?.renderRevision).toBe(2)
    await h.host.saveDraft({ mountId: m.mountId, draft: { baseRevision: 0, stateSchemaVersion: 1, fields: { text: 'last keystroke' }, dirty: ['text'] } })
    const applied = await h.host.applyUpdate({ mountId: m.mountId, discardDraft: false })
    expect(applied.draft).toMatchObject({ fields: { text: 'last keystroke' }, dirty: ['text'] })
    expect(applied.manifest.renderRevision).toBe(2)
    expect(() => h.host.snapshot({ mountId: m.mountId })).toThrow('STALE_MOUNT')
  })
  it('keeps a late old-render/data result on its action without overwriting the newer block', async () => {
    const h = await harness()
    const id = await h.publish()
    const m = await h.bind(id)
    const request = intent(m)
    await h.host.invoke(request)
    await h.claim()
    await h.host.snapshot({ mountId: m.mountId })
    await h.publish(id, { fresh: 'authoritative' })
    const next = await h.host.mount({ sessionId: h.session.id, messageId: m.snapshot.scope.messageId, blockId: id })
    expect(await h.host.invoke({ ...request, mountId: next.mountId })).toMatchObject({ accepted: true, state: 'accepted' })
    await h.tool('rich_inline_complete', { actionId: request.actionId, state: 'completed', values: { stale: 'late-result' } })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: next.mountId, actionId: request.actionId })).terminal).toBe(true)
    })
    expect((await h.host.snapshot({ mountId: next.mountId })).values).toEqual({ fresh: 'authoritative' })
    expect((await h.host.status({ mountId: next.mountId, actionId: request.actionId })).values).toEqual({ stale: 'late-result' })
  })
  it('keeps newer data and dirty input when a result arrives before a pending render is applied', async () => {
    const h = await harness()
    const id = await h.publish()
    const m = await h.bind(id)
    const request = intent(m)
    await h.host.invoke(request)
    await h.claim()
    const current = await h.host.snapshot({ mountId: m.mountId })
    await h.host.saveDraft({ mountId: m.mountId, draft: { baseRevision: current.draft.draftRevision, stateSchemaVersion: 1, fields: { text: 'new edit' }, dirty: ['text'] } })
    await h.publish(id, { newer: 'data' })
    await h.tool('rich_inline_complete', { actionId: request.actionId, state: 'completed', values: { old: 'result' } })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).terminal).toBe(true)
    })
    const next = await h.host.snapshot({ mountId: m.mountId })
    expect(next.manifest.renderRevision).toBe(1)
    expect(next.pendingManifest?.renderRevision).toBe(2)
    expect(next.values).toEqual({ newer: 'data' })
    expect(next.draft.fields).toEqual({ text: 'new edit' })
  })
  it('records progress only from a successful exact-session tool result and rejects terminal progress', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    await h.host.invoke(request)
    await h.claim()
    await h.host.snapshot({ mountId: m.mountId })
    expect((await h.tool('rich_inline_progress', { actionId: request.actionId, done: 2, total: 3, label: 'two complete' })).isError).toBe(false)
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).progress?.done).toBe(2)
    })
    expect((await h.tool('rich_inline_progress', { actionId: request.actionId, done: 4, total: 3, label: 'invalid' })).isError).toBe(true)
    await h.tool('rich_inline_complete', { actionId: request.actionId, state: 'completed' })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).terminal).toBe(true)
    })
    expect((await h.tool('rich_inline_progress', { actionId: request.actionId, done: 3, total: 3, label: 'late' })).isError).toBe(true)
    expect((await h.tool('rich_inline_progress', { actionId: 'foreign-action', done: 1, total: 1, label: 'foreign' })).isError).toBe(true)
  })
  it('cancels its queued prompt independently of BUSY without cancelling the whole Agent', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    await h.host.invoke(request)
    await vi.waitFor(() =>{  expect(h.prompts).toHaveLength(1) })
    const cancellation = await h.host.invoke({ ...request, actionId: brandString<RichActionId>(`cancel-${randomUUID()}`), actionName: 'cancel', targetActionId: request.actionId, values: {}, draft: request.draft })
    expect(cancellation.accepted).toBe(true)
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).state).toBe('cancelled')
    })
    expect(h.prompts).toHaveLength(1)
  })
  it('records a running cancellation and its late terminal result without changing authority', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish(undefined, { original: 'data' }))
    const request = intent(m)
    await h.host.invoke(request)
    await h.claim()
    await h.host.snapshot({ mountId: m.mountId })
    await h.host.invoke({ ...request, actionId: brandString<RichActionId>(`cancel-${randomUUID()}`), actionName: 'cancel', targetActionId: request.actionId, values: {} })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).state).toBe('cancel_requested')
    })
    await h.tool('rich_inline_complete', { actionId: request.actionId, state: 'completed', values: { late: 'cannot undo work' } })
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: m.mountId, actionId: request.actionId })).terminal).toBe(true)
    })
    expect(await h.host.status({ mountId: m.mountId, actionId: request.actionId })).toMatchObject({ state: 'completed', lateAfterCancel: true })
    expect((await h.host.snapshot({ mountId: m.mountId })).values).toEqual({ original: 'data' })
  })
  it('retries its durable outbox with the original RPC identity and bounds permanent failures', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    h.prompt.mockRejectedValueOnce(new Error('temporary transport failure')).mockRejectedValueOnce(new Error('temporary transport failure'))
    await h.host.invoke(request)
    await vi.waitFor(() =>{  expect(h.prompts).toHaveLength(1) })
    expect(h.prompt).toHaveBeenCalledTimes(3)
    expect(new Set(h.prompt.mock.calls.map(([value]) => value.requestId)).size).toBe(1)
    const other = await h.bind(await h.publish())
    const failed = intent(other)
    h.prompt.mockRejectedValue(new Error('permanent transport failure'))
    await h.host.invoke(failed)
    await vi.waitFor(async () => {
      expect((await h.host.status({ mountId: other.mountId, actionId: failed.actionId })).state).toBe('outcome_unknown')
    })
    expect(h.prompt).toHaveBeenCalledTimes(6)
    const disk = JSON.parse(await readFile(join(h.dir, 'rich_inline.json'), 'utf8')) as { tables: { sessions: Record<string, RichSessionRecord> } }
    expect(disk.tables.sessions[h.session.id]!.actions[failed.actionId]).toMatchObject({ outbox: false, dispatchAttempts: 3 })
  })
  it('reopens actual ledger bytes with preserved inputs and proactively restores pending work', async () => {
    const h = await harness()
    const m = await h.bind(await h.publish())
    const request = intent(m)
    await h.host.invoke(request)
    await vi.waitFor(() =>{  expect(h.prompts).toHaveLength(1) })
    const seed = h.session.snapshotEvents()
    await h.owner.dispose()
    await h.ctx.fiber.dispose()
    const reopened = await harness(h.dir, seed)
    const restored = await reopened.host.mount({ sessionId: reopened.session.id,
      messageId: m.snapshot.scope.messageId, blockId: m.snapshot.scope.blockId })
    expect(restored.mountId).not.toBe(m.mountId)
    expect(restored.snapshot.draft.fields).toEqual({ text: 'last-key' })
    expect(restored.snapshot.actions[0]?.actionId).toBe(request.actionId)
    expect(reopened.resolved).toHaveBeenCalled()
    expect(reopened.prompts).toHaveLength(0)
  })
  it('refuses malformed authoritative storage instead of treating its actions as absent', async () => {
    const h = await harness()
    await h.bind(await h.publish())
    await h.owner.dispose()
    await h.ctx.fiber.dispose()
    await writeFile(join(h.dir, 'rich_inline.json'), '{bad-json', 'utf8')
    const ctx = new Context()
    resources.push({ ctx, root: h.dir, remove: false })
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: h.dir })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    const { richLedgerSpec } = await import('../src/host/ledger.ts')
    await expect(ctx.storage.domain.open(richLedgerSpec)).rejects.toThrow('valid JSON')
  })
})

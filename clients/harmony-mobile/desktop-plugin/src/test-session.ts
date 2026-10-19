/** Explicit test preset for one new ordinary Session. The product and pairing entries never import this module. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { LlmAdapter, LlmError, OfflineReplayCounter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { id, type SessionId } from '../../src/protocol.ts'

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/)
const settings = z.object({ enabled: z.literal(true), profileId: identifier, presetId: identifier, presetName: z.string().min(1).max(128), provider: identifier, model: identifier,
  responseLimit: z.number().int().min(1).max(3), ttlMs: z.number().int().positive().max(1800000), paceMs: z.number().int().nonnegative().max(1000), maxTokens: z.number().int().positive(), contextWindow: z.number().int().positive() }).strict()
type Settings = z.infer<typeof settings>
/** Stable failure for a closed, exhausted, foreign or invalid synthetic request; never retries another provider. */
export class MobileTestError extends LlmError {
  /** @param code - exact rejected test operation. */
  constructor(code: 'scope' | 'closed' | 'exhausted' | 'submission' | 'session-used' | 'tool' | 'rich-disabled') { super(code === 'rich-disabled' ? 'Enable this test preset in rich-inline activePresets before running the link check.' : 'Mobile link test refused: ' + code, 'HARMONY_TEST_' + code.toUpperCase().replaceAll('-', '_')) }
}
/** Default-disabled entry registering a non-default test preset and a local status command. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile/test-session'

function textChunks(text: string): StreamChunk[] {
  return [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: text.slice(0, 24) }, { type: 'text-delta', index: 0, text: text.slice(24) }, { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }]
}
const content = { key: 'phone-form', html: '<form><label>Title<input name="title"></label><label>Count<input name="count" type="number"></label><button>Submit</button></form>', css: 'form{display:grid;gap:12px}button,input{min-height:44px}', js: 'window.rich.bindForm(document.querySelector("form"))', fallbackText: 'Synthetic mobile link form', stateSchemaVersion: 1, values: {} }
const submission = z.object({ protocol: z.literal('lumina-rich/1'), actionId: identifier, actionName: z.literal('submit'), inputTrust: z.literal('untrusted-rich-ui'), values: z.object({ title: z.string().max(128), count: z.string().regex(/^\d{1,4}$/) }).strict() }).passthrough()

/** Safety state retained by the exact Agent's effects, including after the declaring test entry is removed. */
class TestRun {
  calls = 0
  closed = false
  readonly deadline: number
  constructor(readonly agent: Agent, readonly policy: Settings) { this.deadline = Date.now() + policy.ttlMs }
  check(): void { if (this.closed || Date.now() >= this.deadline) throw new MobileTestError('closed') }
  guard(options: GenerateOptions): void {
    this.check()
    if (options.sessionId !== this.agent.id || options.provider !== this.policy.provider || options.model !== this.policy.model || options.purpose !== undefined) throw new MobileTestError('scope')
    if (this.calls >= this.policy.responseLimit) throw new MobileTestError('exhausted')
    if (options.messages.some(message => message.content.some(block => block.type === 'image' || block.type === 'file'))) throw new MobileTestError('scope')
  }
  chunks(options: GenerateOptions): StreamChunk[] {
    this.guard(options)
    const slot = this.calls++
    if (slot === 0) return textChunks('```rich-html\n' + JSON.stringify(content) + '\n```')
    if (slot === 1) {
      const text = options.messages.filter(message => message.role === 'user').flatMap(message => message.content).findLast(block => block.type === 'text' && block.text.startsWith('Interactive input '))
      if (text?.type !== 'text') throw new MobileTestError('submission')
      let parsed: z.infer<typeof submission>
      try { parsed = submission.parse(JSON.parse(text.text.slice('Interactive input '.length))) } catch (error) { void error; throw new MobileTestError('submission') }
      return [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('mobile-link-test-complete'), name: 'rich_inline_complete', arguments: JSON.stringify({ actionId: parsed.actionId, state: 'completed', values: parsed.values }) } }, { type: 'finish', reason: { kind: 'tool-calls' } }]
    }
    return textChunks('Synthetic mobile form completed in the selected desktop Session.')
  }
  install(): void {
    const agent = this.agent, policy = this.policy
    // These refusals belong to the Agent lifetime. Removing the test entry closes them; it never exposes the Agent's original live route.
    agent.ctx.on('agent/pre-step', async (_payload, next) => { this.check(); return next() }, { prepend: true })
    agent.ctx.on('agent/request', async (_payload, next) => { await next(); this.check(); if (this.calls >= policy.responseLimit) throw new MobileTestError('exhausted'); return { provider: policy.provider, model: policy.model, maxTokens: policy.maxTokens } }, { prepend: true })
    agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => { const value = await next(); this.check(); const tools = value.tools.filter(tool => tool.name === 'rich_inline_complete'); if (tools.length !== 1) throw new MobileTestError('rich-disabled'); return { ...value, variables: { ...value.variables, provider: policy.provider, model: policy.model }, tools } }, { prepend: true })
    agent.ctx.on('llm/stream', (options, next) => { if (options.sessionId === agent.id) this.guard(options); return next() }, { prepend: true })
    agent.ctx.on('tools/pre-execute', async (exec, next) => { this.check(); if (exec.name !== 'rich_inline_complete') throw new MobileTestError('tool'); return next() }, { prepend: true })
    agent.ctx.tools.presentAs('native')
  }
  async close(): Promise<void> { this.closed = true; this.agent.cancel({ kind: 'hook', reason: 'Mobile link test entry closed; this test Session remains blocked.' }); await this.agent.whenIdle() }
}

class TestAdapter extends LlmAdapter {
  override readonly offlineReplayCounter: OfflineReplayCounter
  run: TestRun | undefined
  constructor(private readonly policy: Settings) { super(); this.offlineReplayCounter = new OfflineReplayCounter([{ provider: policy.provider, model: policy.model }], policy.responseLimit) }
  override providerInfo(provider: string) { return { id: provider, name: 'Mobile link test (fixed, no provider IO)' } }
  override listModels(provider: string) { return Promise.resolve([{ id: this.policy.model, name: 'Synthetic mobile link check', context: { contextWindow: this.policy.contextWindow }, provider }]) }
  override resolveModel(provider: string, model: string) { if (provider !== this.policy.provider || model !== this.policy.model) throw new MobileTestError('scope'); return Promise.resolve({ provider, id: model, name: 'Synthetic mobile link check', context: { contextWindow: this.policy.contextWindow } }) }
  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const run = this.run; if (run === undefined) throw new MobileTestError('scope')
    const chunks = run.chunks(options)
    for (const chunk of chunks) {
      options.signal?.throwIfAborted(); run.check()
      if (this.policy.paceMs > 0) await new Promise<void>((accept, reject) => { const stop = (): void => { clearTimeout(timer); reject(options.signal?.reason) }; const timer = setTimeout(() => { options.signal?.removeEventListener('abort', stop); accept() }, this.policy.paceMs); options.signal?.addEventListener('abort', stop, { once: true }); if (options.signal?.aborted) stop() })
      yield chunk
    }
  }
}

/** @param ctx - existing normal Host; only a new ordinary Session explicitly selecting the supplied preset is admitted. @param request - explicit local test policy; disabled loading has no effects. @returns after registering the non-default preset, finite adapter and status command; no Session, model call, credential or network is created. */
export async function apply(ctx: Context, request: unknown = { enabled: false }): Promise<void> {
  if (z.object({ enabled: z.literal(false).optional() }).strict().safeParse(request).success) return
  const policy = settings.parse(request)
  const required = ['llm', 'agents', 'agentPresets', 'sessionController', 'commands', 'connection', 'profileContext', 'tools', 'systemPrompt'] as const
  for (const service of required) if (ctx.get(service) === undefined) throw new Error('mobile link test requires service: ' + service)
  if (ctx.profileContext.name !== policy.profileId) throw new MobileTestError('scope')
  await ctx.inject([...required], async inner => {
    const adapter = new TestAdapter(policy)
    let created: Promise<{ sessionId: SessionId }> | undefined
    inner.effect(() => inner.llm.registerAdapter([policy.provider], adapter))
    const removePreset = await inner.agentPresets.register({ id: policy.presetId, name: policy.presetName, description: 'One new Session; finite synthetic responses; no real model or host tools.', plugins: [] })
    inner.effect(() => removePreset)
    const fresh = new WeakSet<Agent>()
    const bind = (agent: Agent): void => {
      if (adapter.run?.agent === agent) return
      const used = agent.session.snapshotEvents().some(event => event.type === 'turn/start' || event.type === 'user/message' || event.type === 'request/header' || event.type === 'model/selection' || event.type === 'agent/inbox/spliced' && event.data.inserted.length > 0)
      const run = new TestRun(agent, policy)
      if (adapter.run !== undefined || !fresh.has(agent) || used || !inner.agents.roots().includes(agent)) { run.closed = true; run.install(); throw new MobileTestError('session-used') }
      try { run.install() } catch (error) { run.closed = true; throw error }
      adapter.run = run
    }
    inner.on('agent/created', ({ agent, source }) => {
      if (source === 'startup') fresh.add(agent)
      if (inner.agentPresets.composedPreset(agent.ctx) === policy.presetId) bind(agent)
      return undefined
    }, { prepend: true })
    inner.on('agent-preset/selected', (sessionId, selected) => {
      const agent = inner.agents.get(sessionId)
      if (agent === undefined) return
      if (selected === policy.presetId) bind(agent)
      else if (adapter.run?.agent === agent) { adapter.run.closed = true; agent.cancel({ kind: 'hook', reason: 'The synthetic test preset was deselected; this test Session remains blocked.' }) }
    })
    inner.on('llm/stream', (options, next) => {
      if (options.provider === policy.provider || options.sessionId === adapter.run?.agent.id) {
        if (adapter.run === undefined) throw new MobileTestError('scope')
        adapter.run.guard(options)
      }
      return next()
    }, { prepend: true })
    inner.effect(() => inner.commands.register({ name: 'harmony-test', description: 'Create or inspect the dedicated synthetic mobile link Session', input: { hint: 'new | status' }, recordInput: false, handler: async invocation => {
      if (inner.invocation?.peer !== undefined && inner.invocation.peer !== inner.connection.browserPeer || inner.agents.get(invocation.agent.id) !== invocation.agent || !inner.agents.roots().includes(invocation.agent)) return { kind: 'error', text: 'Use the local desktop root conversation.' }
      const operation = invocation.rawInput.trim()
      if (operation === 'new') {
        if (created === undefined && adapter.run !== undefined) return { kind: 'error', text: 'This entry already owns a test Session; its response budget cannot reset.' }
        const cwd = invocation.agent.session.header.cwd
        if (cwd === undefined) return { kind: 'error', text: 'Choose an ordinary desktop conversation with a working directory before creating the test Session.' }
        created ??= inner.sessionController.create({ sessionId: id<'SessionId'>(randomUUID()), cwd, agentPreset: policy.presetId })
        const result = await created
        return { kind: 'success', text: JSON.stringify({ profileId: policy.profileId, sessionId: result.sessionId, presetId: policy.presetId, next: 'Open this Session, then run /harmony-test status and /harmony-pair status.' }) }
      }
      if (operation !== '' && operation !== 'status' || invocation.agent !== adapter.run?.agent) return { kind: 'error', text: 'Use new once, or select the dedicated test Session and use status.' }
      return { kind: 'success', text: JSON.stringify({ profileId: policy.profileId, presetId: policy.presetId, sessionId: id<'SessionId'>(invocation.agent.id), provider: policy.provider, model: policy.model, responses: adapter.run.calls, responseLimit: policy.responseLimit, expiresAt: adapter.run.deadline, closed: adapter.run.closed || Date.now() >= adapter.run.deadline, realProviderCalls: 0 }) }
    } }))
    inner.effect(() => () => adapter.run?.close())
  })
}

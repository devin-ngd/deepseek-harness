/** Empty prompt admission over the real AgentLoop and the Session Remote owner. */
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmError, resolveRetryPolicy, type RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import type { SessionPromptRequest, SessionRequestId } from '../src/types.ts'
import { createSessionTestRemote } from './test-remote.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import * as LlmRetry from '../../../llm/llm-retry/src/index.ts'

async function setup(script?: ConstructorParameters<typeof MockAdapter>[0], retryPolicy?: RetryPolicyConfig) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const fail = (): never => { throw new LlmError('busy', 'SERVER') }
  const adapter = new MockAdapter(script ?? [fail, fail, textResponse('done')])
  if (retryPolicy !== undefined) {
    const policy = resolveRetryPolicy(retryPolicy, 'foreground test provider')
    adapter.providerRetryPolicy = () => policy
    await ctx.plugin(LlmRetry)
  }
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const remote = await createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/workspace' })
  const agent = await ctx.agentLoop.create(brandString<SessionId>('empty-prompt'), { provider: 'mock', model: 'mock' })
  const request = (id: string, mode: SessionPromptRequest['mode'] = 'queue'): SessionPromptRequest => ({
    sessionId: agent.id, requestId: id as SessionRequestId, content: [], mode,
  })
  return { ctx, remote, agent, adapter, request }
}

it('bounds an explicit RPC prompt and manually continues with its original context', async () => {
  const fail = (): never => { throw new LlmError('busy', 'RATE_LIMIT', { status: 429 }) }
  const { ctx, remote, agent, adapter, request } = await setup([...Array.from({ length: 6 }, () => fail), textResponse('done')], {
    mode: 'normal', maxRetries: 30, backoff: { initialDelayMs: 1_000, maxDelayMs: 30_000, jitterRatio: 0 },
  })
  vi.useFakeTimers()
  try {
    const first = Promise.withResolvers<undefined>()
    const dispose = ctx.on('session/event', (session, event) => {
      if (session === agent.session && event.type === 'llm/retry') { dispose(); first.resolve(undefined) }
    })
    expect((await remote.prompt({ sessionId: agent.id, requestId: 'foreground-e2e' as SessionRequestId,
      mode: 'queue', content: [{ type: 'text', text: 'original task' }], interaction: 'foreground' })).ok).toBe(true)
    await first.promise; await vi.advanceTimersByTimeAsync(45_000); await agent.whenIdle()
    expect(adapter.requests).toHaveLength(6)
    expect(agent.session.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'RATE_LIMIT' } } } })
    expect(ctx.sessionProjections.snapshot(agent.session).values.conversationContinuation).not.toBeNull()
    expect((await remote.prompt({ ...request('continue-e2e'), interaction: 'foreground' })).ok).toBe(true)
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(7)
    expect(JSON.stringify(adapter.requests[6]!.messages)).toContain('original task')
    expect(agent.session.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  } finally { vi.useRealTimers() }
})

it('continues a failed partial response without replaying an already completed tool call', async () => {
  const { ctx, remote, agent, adapter, request } = await setup([
    toolCallResponse('effect-1', 'record_effect', {}),
    [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'discarded partial' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'discarded partial' } },
      { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'busy' } } },
    ],
    textResponse('done'),
  ])
  let effects = 0
  ctx.tools.register({
    name: 'record_effect', description: 'Record a fixture effect.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : '' }] },
    async execute() { effects++; return 'recorded' },
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(effects).toBe(1)
  expect((await remote.prompt(request('continue-after-tool'))).ok).toBe(true)
  await agent.whenIdle()
  expect(effects).toBe(1)
  expect(adapter.requests).toHaveLength(3)
  const history = adapter.requests[2]!.messages
  expect(history.some(message => message.role === 'tool' && message.toolCallId === 'effect-1')).toBe(true)
  expect(JSON.stringify(history)).not.toContain('discarded partial')
})

it('does not continue automatically or offer continuation after user cancellation with partial output', async () => {
  const { ctx, remote, agent, adapter, request } = await setup(['hang'])
  const partial = Promise.withResolvers<undefined>()
  ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
    if (subject === agent && frame.type === 'chunk' && frame.chunk.type === 'text-delta') partial.resolve(undefined)
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await partial.promise
  agent.cancel({ kind: 'user' })
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(1)
  expect(agent.session.snapshotEvents().some(event => event.type === 'assistant/message' && event.data.interrupted === true)).toBe(true)
  expect((await remote.prompt(request('continue-after-cancel'))).ok).toBe(false)
  expect(adapter.requests).toHaveLength(1)
})

it('persists explicit foreground intent from the prompt RPC on the admitted message', async () => {
  const { remote, agent } = await setup()
  const result = await remote.prompt({ sessionId: agent.id, requestId: 'foreground-input' as SessionRequestId,
    mode: 'queue', content: [{ type: 'text', text: 'original task' }], interaction: 'foreground' })
  expect(result.ok).toBe(true)
  await agent.whenIdle()
  expect(agent.session.snapshotEvents().find(event => event.type === 'user/message')).toMatchObject({
    data: { source: { kind: 'user', rpcId: 'foreground-input', interaction: 'foreground' } },
  })
  expect(agent.session.snapshotEvents().some(event => event.type === 'agent/inbox/spliced'
    && event.data.inserted.some(message => 'interaction' in message.source && message.source.interaction === 'foreground'))).toBe(true)
})

it('retains explicit foreground intent on a manual continuation', async () => {
  const { remote, agent, request } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect((await remote.prompt({ ...request('foreground-continue'), interaction: 'foreground' })).ok).toBe(true)
  await agent.whenIdle()
  expect(agent.session.snapshotEvents().find(event => event.type === 'user/message' && event.data.source.kind === 'retry')).toMatchObject({
    data: { source: { kind: 'retry', rpcId: 'foreground-continue', interaction: 'foreground' } },
  })
})

it('records empty retry user messages without duplicate requests', async () => {
  const { remote, agent, adapter, request } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const first = request('continue-1')
  expect((await remote.prompt(first)).ok).toBe(true)
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(2)
  expect((await remote.prompt(first)).ok).toBe(true)
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(2)
  expect((await remote.prompt(request('continue-2'))).ok).toBe(true)
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(3)
  const events = agent.session.snapshotEvents()
  const messages = events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user' ? [event.data] : [])
  expect(messages).toHaveLength(1)
  const retries = events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'retry' ? [event.data] : [])
  expect(retries).toHaveLength(2)
  expect(retries).toMatchObject([
    { content: [], source: { kind: 'retry', rpcId: 'continue-1' } },
    { content: [], source: { kind: 'retry', rpcId: 'continue-2' } },
  ])
  const controls = events.flatMap(event => event.type === 'agent/inbox/spliced' ? event.data.inserted : [])
    .filter(message => message.source.kind === 'retry')
  expect(retries.map(retry => retry.id)).toEqual(controls.map(control => control.id))
  expect(adapter.requests[1]!.messages.filter(message => message.role === 'user').map(message => message.content))
    .toEqual([[{ type: 'text', text: 'original task' }], []])
  expect(adapter.requests[2]!.messages.filter(message => message.role === 'user').map(message => message.content))
    .toEqual([[{ type: 'text', text: 'original task' }], [], []])
  expect(events.flatMap(event => event.type === 'turn/end' ? [event.data.reason.kind] : [])).toEqual(['error', 'error', 'completed'])
  expect(events.filter(event => event.type === 'turn/start')).toHaveLength(3)
  expect((await remote.prompt(request('after-completion'))).ok).toBe(false)
})

it('refuses empty fresh sessions, steering, queued human input and maintenance without waking work', async () => {
  const { remote, agent, adapter, request } = await setup()
  expect((await remote.prompt(request('empty-fresh'))).ok).toBe(false)
  expect(adapter.requests).toHaveLength(0)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect((await remote.prompt(request('empty-steer', 'steer'))).ok).toBe(false)
  const pending = createUserMessage({ content: [{ type: 'text', text: 'queued' }], source: { kind: 'user' } })
  agent.inbox.append('next-turn', pending)
  expect((await remote.prompt(request('empty-queued'))).ok).toBe(false)
  agent.inbox.clear()
  agent.inject(pending)
  expect((await remote.prompt(request('empty-steering'))).ok).toBe(false)
  agent.inbox.clear()
  await agent.runMaintenance(async () => {
    expect((await remote.prompt(request('empty-maintenance'))).ok).toBe(false)
  })
  expect(adapter.requests).toHaveLength(1)
})

it('consumes injected context with the empty prompt', async () => {
  const { ctx, remote, agent, adapter, request } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  agent.inject(createUserMessage({ content: [{ type: 'text', text: 'approval context' }], source: { kind: 'user-approval' } }))
  agent.model.select({ provider: 'mock', model: 'changed' })
  expect((await remote.prompt(request('empty-context'))).ok).toBe(true)
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(2)
  expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('approval context')
  expect(adapter.requests[1]!.model).toBe('changed')
  expect(agent.inbox.nextStep).toHaveLength(0)
  expect(ctx.sessionProjections.snapshot(agent.session).values.conversationContinuation).not.toBeNull()
})

it('deduplicates empty continuation after claim and before user-message admission', async () => {
  const { ctx, remote, agent, adapter, request } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'original task' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const claimed = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  ctx.on('agent/pre-step', async ({ messages }, next) => {
    if (messages.some(message => message.source.kind === 'retry')) {
      claimed.resolve(undefined)
      await release.promise
    }
    return next()
  })
  const continuation = request('continue-once')
  expect((await remote.prompt(continuation)).ok).toBe(true)
  await claimed.promise
  expect(agent.inbox.nextTurn).toEqual([])
  expect(agent.session.snapshotEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'retry')).toBe(false)
  expect((await remote.prompt(continuation)).ok).toBe(true)
  release.resolve(undefined)
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(2)
  expect(agent.session.snapshotEvents().flatMap(event => event.type === 'agent/inbox/spliced' ? event.data.inserted : [])
    .filter(message => message.source.kind === 'retry')).toHaveLength(1)
})

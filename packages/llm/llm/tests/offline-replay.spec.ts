/** Counted replay dispatch with zero live adapters, including failure and revocation. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmAdapter, LlmRuntime, OfflineReplayCounter } from '../src/index.ts'
import type { ConfigureCall, GenerateOptions, StreamChunk } from '../src/index.ts'

class LocalAdapter extends LlmAdapter {
  readonly invoked = vi.fn()
  override readonly offlineReplayCounter: OfflineReplayCounter | undefined = undefined
  constructor(counter?: OfflineReplayCounter) { super(); if (counter !== undefined) this.offlineReplayCounter = counter }
  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.invoked()
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
const route = { provider: 'replay', model: 'fixed' }
const options: GenerateOptions = { ...route, messages: [], maxTokens: 10 }

describe('offline replay dispatch', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('keeps configured controls and one-shot preparation behind the replay route check', async () => {
    vi.stubEnv('DSH_SNAPSHOT_REPLAY_ONLY', '1')
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const adapter = new LocalAdapter(new OfflineReplayCounter([route], 1))
    llm.registerAdapter(['replay'], adapter)
    const configure = vi.fn<ConfigureCall>(() => ({ maxTokens: 12 }))
    try {
      await expect(llm.prepareCall({ ...route, model: 'other' }, undefined, configure)).rejects.toThrow('unavailable')
      expect(configure).not.toHaveBeenCalled()
      const prepared = await llm.prepareCall({ ...route, maxTokens: 10 }, undefined, configure)
      expect(configure).toHaveBeenCalledTimes(1)
      expect(configure.mock.calls[0]?.[0]).toEqual({ maxTokens: 10 })
      expect(prepared.config).toMatchObject({ ...route, maxTokens: 12 })
      const request = { ...options, ...prepared.config }
      for await (const _chunk of prepared.stream(request)) { /* The counted adapter performs no I/O. */ }
      expect(() => prepared.stream(request)).toThrow('only be dispatched once')
      expect(adapter.invoked).toHaveBeenCalledTimes(1)
      expect(llm.getOfflineReplayCounts()).toEqual({
        realCalls: 0, replay: [{ expectedCalls: 1, calls: 1, blockedCalls: 1, realCalls: 0 }],
      })
    } finally { await ctx.root.fiber.dispose() }
  })

  it('requires replay from creation for root, title and subtask runtimes even after releasing an owner', async () => {
    vi.stubEnv('DSH_SNAPSHOT_REPLAY_ONLY', '1')
    for (const _purpose of ['root', 'title', 'subtask']) {
      const ctx = new Context()
      const llm = new LlmRuntime(ctx)
      const live = new LocalAdapter()
      const prepare = vi.spyOn(live, 'prepareCall')
      const metadata = vi.spyOn(live, 'resolveModel')
      llm.registerAdapter(['replay'], live)
      llm.requireOfflineReplay()()
      try {
        expect(() => llm.stream(options)).toThrow('counter are required')
        await expect(llm.prepareCall(route)).rejects.toThrow('non-replay adapter')
        await expect(llm.resolveModelInfo(route.provider, route.model)).rejects.toThrow('non-replay adapter')
        expect(prepare).not.toHaveBeenCalled()
        expect(metadata).not.toHaveBeenCalled()
        expect(live.invoked).not.toHaveBeenCalled()
        expect(llm.getOfflineReplayCounts()).toEqual({ realCalls: 0, replay: [] })
      } finally { await ctx.root.fiber.dispose() }
    }
  })

  it('keeps replay failure and exhaustion local with no real fallback', async () => {
    vi.stubEnv('DSH_SNAPSHOT_REPLAY_ONLY', '1')
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const replay = new LocalAdapter(new OfflineReplayCounter([route], 1))
    const live = new LocalAdapter()
    llm.registerAdapter(['replay'], replay)
    llm.registerAdapter(['live'], live)
    vi.spyOn(replay, 'stream').mockImplementation(async function* () { throw new Error('script failure') })
    try {
      const chunks: StreamChunk[] = []
      for await (const chunk of llm.stream(options)) chunks.push(chunk)
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
      expect(() => llm.stream(options)).toThrow('budget is exhausted')
      expect(() => llm.stream({ ...options, provider: 'live' })).toThrow('counter are required')
      expect(live.invoked).not.toHaveBeenCalled()
      expect(llm.getOfflineReplayCounts()).toEqual({ realCalls: 0,
        replay: [{ calls: 1, expectedCalls: 1, blockedCalls: 1, realCalls: 0 }] })
    } finally { await ctx.root.fiber.dispose() }
  })
  it('admits the exact budget and refuses an extra call before middleware or a live adapter', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const counter = new OfflineReplayCounter([route], 2)
    const local = new LocalAdapter(counter)
    const live = new LocalAdapter()
    const middleware = vi.fn((_options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => next())
    ctx.on('llm/stream', middleware)
    llm.registerAdapter(['replay'], local)
    llm.registerAdapter(['live'], live)
    llm.requireOfflineReplay()
    try {
      for (let index = 0; index < 2; index++) for await (const _chunk of llm.stream(options)) { /* Consume the local scripted stream. */ }
      expect(local.invoked).toHaveBeenCalledTimes(2)
      expect(middleware).toHaveBeenCalledTimes(2)
      expect(() => llm.stream(options)).toThrow('budget is exhausted')
      expect(() => llm.stream({ ...options, provider: 'live' })).toThrow('counter are required')
      expect(live.invoked).not.toHaveBeenCalled()
      expect(middleware).toHaveBeenCalledTimes(2)
      llm.assertZeroRealCalls()
      expect(counter.snapshot()).toEqual({ calls: 2, expectedCalls: 2, blockedCalls: 1, realCalls: 0 })
      expect(() => { counter.assertConsumed() }).toThrow('cleanly')
    } finally { await ctx.root.fiber.dispose() }
  })

  it('fails on a missing counter, unknown route, wrong model and revoked registration', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const local = new LocalAdapter(new OfflineReplayCounter([route], 1))
    const metadata = vi.spyOn(local, 'resolveModel')
    const release = llm.registerAdapter(['replay'], local)
    const live = new LocalAdapter()
    llm.registerAdapter(['live'], live)
    llm.requireOfflineReplay()
    try {
      expect(() => llm.assertOfflineReplayReady('missing', 'fixed')).toThrow('counter are required')
      expect(() => llm.assertOfflineReplayReady('live', 'fixed')).toThrow('counter are required')
      await expect(llm.resolveModelInfo('replay', 'other')).rejects.toThrow('unavailable')
      expect(metadata).not.toHaveBeenCalled()
      expect(() => llm.stream({ ...options, model: 'other' })).toThrow('unavailable')
      release()
      expect(() => llm.stream(options)).toThrow('counter are required')
      expect(local.invoked).not.toHaveBeenCalled()
      expect(live.invoked).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { await ctx.root.fiber.dispose() }
  })

  it('releases the offline requirement idempotently and detects earlier non-replay dispatch', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const local = new LocalAdapter()
    llm.registerAdapter(['replay'], local)
    const release = llm.requireOfflineReplay()
    release()
    release()
    try {
      for await (const _chunk of llm.stream(options)) { /* This fake adapter performs no I/O. */ }
      expect(local.invoked).toHaveBeenCalledTimes(1)
      expect(() => { llm.assertZeroRealCalls() }).toThrow('real adapter dispatches')
      expect(llm.getOfflineReplayCounts()).toEqual({ realCalls: 1, replay: [] })
    } finally { await ctx.root.fiber.dispose() }
  })
})

describe('offline counter inputs', () => {
  it('rejects absent or duplicate routes and absent call budgets', () => {
    for (const budget of [0, -1, 1.2, NaN, Infinity]) expect(() => new OfflineReplayCounter([route], budget)).toThrow('positive')
    expect(() => new OfflineReplayCounter([], 1)).toThrow('non-empty')
    expect(() => new OfflineReplayCounter([route, route], 1)).toThrow('unique')
    expect(() => new OfflineReplayCounter([{ ...route, provider: '' }], 1)).toThrow('explicit')
    expect(() => new OfflineReplayCounter([{ ...route, model: ' ' }], 1)).toThrow('explicit')
    expect(() => { new OfflineReplayCounter([route], 1).assertConsumed() }).toThrow('cleanly')
  })
})

/** In-memory SDK route checks; no transport startup, agent loop, provider or process. */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { LlmAdapter, LlmRuntime, OfflineReplayCounter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { JsonRpcTransportPeer } from '@deepseek-ai/dsh-sdk-protocol'
import { describe, expect, it, vi } from 'vitest'
import { HarnessSdkJsonRpcServer } from '../src/server.ts'
import { Config } from '../src/index.ts'

class LocalAdapter extends LlmAdapter {
  override readonly offlineReplayCounter: OfflineReplayCounter | undefined = undefined
  readonly dispatched = vi.fn()
  constructor(counter?: OfflineReplayCounter) { super(); if (counter !== undefined) this.offlineReplayCounter = counter }
  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.dispatched()
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
const transport: JsonRpcTransportPeer = {
  notify() { /* In-memory route validation produces no notifications. */ },
  async request() { throw new Error('a mock SDK server must not make a peer request') },
}

describe('ordinary SDK initialize with injected adapters', () => {
  it.each([undefined, false])('reuses a local adapter with offlineReplay %s', async (offlineReplay: boolean | undefined) => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const agents = new AgentRegistry(ctx)
    const create = vi.spyOn(agents, 'create').mockRejectedValue(new Error('must not create a Session'))
    const adapter = new LocalAdapter()
    llm.registerAdapter(['local'], adapter)
    const plugin = vi.spyOn(ctx, 'plugin').mockRejectedValue(new Error('must not mount a provider'))
    const server = new HarnessSdkJsonRpcServer(ctx, transport, offlineReplay === undefined ? {} : { offlineReplay })
    try {
      await expect(server.initialize({ cwd: process.cwd(), provider: 'local', model: 'fixed' })).resolves.toHaveProperty('serverInfo.name')
      expect(plugin).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(adapter.dispatched).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { await server.shutdown(); await ctx.root.fiber.dispose() }
  })

  it('retains the ordinary official-route fallback using an injected plugin mount', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const adapter = new LocalAdapter()
    const mounted = ctx.plugin({ name: 'sdk-fallback-mock', apply() { /* No application services are mounted. */ } })
    const fallback = await mounted
    const disposed = vi.spyOn(fallback, 'dispose')
    const plugin = vi.spyOn(ctx, 'plugin').mockImplementation(() => {
      llm.registerAdapter(['deepseek-official'], adapter)
      return mounted
    })
    const server = new HarnessSdkJsonRpcServer(ctx, transport)
    try {
      await expect(server.initialize({ cwd: process.cwd(), provider: 'deepseek-official', model: 'fixed' }))
        .resolves.toHaveProperty('serverInfo.name')
      expect(plugin).toHaveBeenCalledTimes(1)
      expect(adapter.dispatched).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
      await server.shutdown()
      expect(disposed).toHaveBeenCalledTimes(1)
    } finally { await server.shutdown(); await ctx.root.fiber.dispose() }
  })
})

describe('offline SDK initialize', () => {
  it('requires an explicit boolean deployment switch', () => {
    expect(Config({})).toHaveProperty('offlineReplay', false)
    expect(Config({ offlineReplay: true })).toHaveProperty('offlineReplay', true)
    expect(() => { Reflect.apply(Config, undefined, [{ offlineReplay: 'true' }]) }).toThrow()
  })

  it.each(['deepseek-official', 'glm', 'missing'])('refuses %s before dynamic plugin loading or Session creation', async (provider: string) => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const agents = new AgentRegistry(ctx)
    const create = vi.spyOn(agents, 'create').mockRejectedValue(new Error('must not create a Session'))
    const plugin = vi.spyOn(ctx, 'plugin').mockRejectedValue(new Error('must not mount a real adapter'))
    const server = new HarnessSdkJsonRpcServer(ctx, transport, { offlineReplay: true })
    try {
      await expect(server.initialize({ cwd: process.cwd(), provider, model: 'fixed' })).rejects.toThrow('counter are required')
      expect(plugin).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { await server.shutdown(); await ctx.root.fiber.dispose() }
  })

  it('refuses an installed adapter without a counter before model lookup', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const adapter = new LocalAdapter()
    const lookup = vi.spyOn(adapter, 'resolveModel')
    llm.registerAdapter(['deepseek-official'], adapter)
    const plugin = vi.spyOn(ctx, 'plugin').mockRejectedValue(new Error('must not mount a real adapter'))
    const server = new HarnessSdkJsonRpcServer(ctx, transport, { offlineReplay: true })
    try {
      await expect(server.initialize({ cwd: process.cwd(), provider: 'deepseek-official', model: 'fixed' })).rejects.toThrow('counter are required')
      expect(lookup).not.toHaveBeenCalled()
      expect(plugin).not.toHaveBeenCalled()
      expect(adapter.dispatched).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { await server.shutdown(); await ctx.root.fiber.dispose() }
  })

  it('accepts only a counted exact replay route, without dispatch or Session creation', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const agents = new AgentRegistry(ctx)
    const create = vi.spyOn(agents, 'create').mockRejectedValue(new Error('must not create a Session'))
    const adapter = new LocalAdapter(new OfflineReplayCounter([{ provider: 'replay', model: 'fixed' }], 1))
    llm.registerAdapter(['replay'], adapter)
    const plugin = vi.spyOn(ctx, 'plugin').mockRejectedValue(new Error('must not mount a real adapter'))
    const server = new HarnessSdkJsonRpcServer(ctx, transport, { offlineReplay: true })
    try {
      await expect(server.initialize({ cwd: process.cwd(), provider: 'replay', model: 'fixed' })).resolves.toHaveProperty('serverInfo.name')
      expect(create).not.toHaveBeenCalled()
      expect(plugin).not.toHaveBeenCalled()
      expect(adapter.dispatched).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
      for await (const _chunk of llm.stream({ provider: 'replay', model: 'fixed', messages: [], maxTokens: 10 })) { /* Consume one mock-only response. */ }
    } finally { await server.shutdown(); await ctx.root.fiber.dispose() }
  })

  it('rejects shutdown when a ready replay never consumed its required call', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const adapter = new LocalAdapter(new OfflineReplayCounter([{ provider: 'replay', model: 'fixed' }], 1))
    llm.registerAdapter(['replay'], adapter)
    const server = new HarnessSdkJsonRpcServer(ctx, transport, { offlineReplay: true })
    try {
      await server.initialize({ cwd: process.cwd(), provider: 'replay', model: 'fixed' })
      await expect(server.shutdown()).rejects.toThrow('did not consume its exact call budget')
      expect(adapter.dispatched).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { await ctx.root.fiber.dispose() }
  })
})

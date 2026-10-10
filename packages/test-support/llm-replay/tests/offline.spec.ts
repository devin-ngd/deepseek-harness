/** Real replay library with fake transport-free LLM calls and isolated request extensions. */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import DeepSeekLlmApiExtensionRegistry from '@deepseek-ai/dsh-deepseek-llm-api-extensions'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { apply, installLlmReplay } from '../src/index.ts'

const original = readFileSync(fileURLToPath(new URL('./fixtures/offline-four.v4.jsonl', import.meta.url)), 'utf8')
const directory = fileURLToPath(new URL('../../../../.tmp/', import.meta.url))
function fixture(provider = 'deepseek-official'): { file: string; remove: () => void } {
  mkdirSync(directory, { recursive: true })
  const file = directory + 'offline-replay-' + randomUUID() + '.jsonl'
  writeFileSync(file, original.replaceAll('rich-inline-replay', provider).replaceAll('rich-inline-fixed', 'fixed'))
  return { file, remove: () => unlinkSync(file) }
}

describe('offline replay installation', () => {
  it('replays exactly four responses with zero real dispatches and zero upload-extension calls', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const extensions = new DeepSeekLlmApiExtensionRegistry(ctx)
    const upload = vi.spyOn(extensions, 'prepare').mockImplementation(async () => { throw new Error('must never prepare event upload') })
    const input = fixture()
    try {
      const handle = installLlmReplay(ctx, { file: input.file, offline: true, providers: [{ id: 'deepseek-official', models: [{ id: 'fixed', defaultMaxTokens: 10 }] }] })
      const options: GenerateOptions = { provider: 'deepseek-official', model: 'fixed', maxTokens: 10, messages: [] }
      const observe = vi.fn()
      ctx.on('llm-replay/request', observe)
      for (let index = 0; index < 4; index++) for await (const _chunk of llm.stream(options)) { /* Consume only local recorded chunks. */ }
      expect(observe).toHaveBeenCalledTimes(4)
      expect(observe.mock.calls[0]![0]).toMatchObject(options)
      handle.assertConsumed()
      llm.assertOfflineReplayConsumed()
      llm.assertZeroRealCalls()
      expect(upload).not.toHaveBeenCalled()
      handle.dispose()
      expect(() => llm.assertOfflineReplayReady('deepseek-official', 'fixed')).toThrow('counter are required')
    } finally { input.remove(); await ctx.root.fiber.dispose() }
  })

  it('refuses an additional invocation before extensions and keeps the failed count visible', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const extensions = new DeepSeekLlmApiExtensionRegistry(ctx)
    const upload = vi.spyOn(extensions, 'prepare')
    const input = fixture()
    try {
      const handle = installLlmReplay(ctx, { file: input.file, offline: true, providers: [{ id: 'deepseek-official', models: [{ id: 'fixed', defaultMaxTokens: 10 }] }] })
      const options: GenerateOptions = { provider: 'deepseek-official', model: 'fixed', maxTokens: 10, messages: [] }
      for (let index = 0; index < 4; index++) for await (const _chunk of llm.stream(options)) { /* Consume the finite local script. */ }
      expect(() => llm.stream(options)).toThrow('exhausted')
      expect(() => { handle.assertConsumed() }).toThrow('cleanly')
      expect(upload).not.toHaveBeenCalled()
      llm.assertZeroRealCalls()
    } finally { input.remove(); await ctx.root.fiber.dispose() }
  })

  it('fails before registering a route when providers, budget, or the input file is missing', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const input = fixture()
    try {
      expect(() => installLlmReplay(ctx, { file: input.file, offline: true })).toThrow('routes')
      expect(() => installLlmReplay(ctx, { file: input.file + '.missing', offline: true })).toThrow()
      expect(() => { apply(ctx, { offline: true, file: '' }) }).toThrow('fixture path')
      expect(llm.listProviders()).toEqual([])
      llm.assertZeroRealCalls()
    } finally { input.remove(); await ctx.root.fiber.dispose() }
  })

  it('refuses completion when all stream handles were counted but never read', async () => {
    const ctx = new Context()
    const llm = new LlmRuntime(ctx)
    const input = fixture()
    try {
      installLlmReplay(ctx, { file: input.file, offline: true, providers: [{ id: 'deepseek-official', models: [{ id: 'fixed', defaultMaxTokens: 10 }] }] })
      for (let index = 0; index < 4; index++) {
        llm.stream({ provider: 'deepseek-official', model: 'fixed', maxTokens: 10, messages: [] })
      }
      expect(() => { llm.assertOfflineReplayConsumed() }).toThrow('never bound')
      llm.assertZeroRealCalls()
    } finally { input.remove(); await ctx.root.fiber.dispose() }
  })
})

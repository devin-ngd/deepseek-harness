/** Temporary normal profiles exercise the deployed test entry; sentinel adapters perform no provider or network IO. */
import { it, expect, vi } from 'vitest'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import * as TestEntry from '../desktop-plugin/src/test-session.ts'
import * as Product from '../desktop-plugin/src/product.ts'
import { invokeProfile } from '../desktop-plugin/src/transport.ts'
import { deviceRemotePolicy } from '../desktop-plugin/src/device-policy.ts'
import { id } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { deviceGrantOperations } from '../src/pairing-protocol.ts'
import { loadProfileServices } from './profile-services.ts'

const sessionId = id<'SessionId'>('normal-controls-target'), existingId = id<'SessionId'>('existing-unrelated'), desktopId = id<'mobile-desktop'>('normal-controls-desktop'), deviceId = id<'mobile-device'>('normal-controls-phone')
const policy = { enabled: true, profileId: 'normal-controls', presetId: 'harmony-mobile-link-test', presetName: 'Mobile link test (synthetic)', provider: 'harmony-link-test', model: 'fixed-three', responseLimit: 3, ttlMs: 60000, paceMs: 1, maxTokens: 4096, contextWindow: 100000 }
class Sentinel extends LlmAdapter {
  calls = 0
  resolves = 0
  override resolveModel(provider: string, model: string) { this.resolves++; return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100000 } }) }
  async *stream(_options: GenerateOptions): AsyncGenerator<StreamChunk> { this.calls++; yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text: 'Unrelated sentinel response.' }; yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Unrelated sentinel response.' } }; yield { type: 'finish', reason: { kind: 'stop' } } }
}
async function setup(label: string, previous?: string, richDisabled = false) {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (parent === undefined) throw new Error('isolated controls profile required')
  const world = previous ?? join(parent, label); if (previous === undefined) await mkdir(world)
  const config = (await readFile(new URL('./cordis.yml', import.meta.url), 'utf8')).replace('provider: rich-inline-replay', 'provider: sentinel').replace('model: rich-inline-fixed', 'model: sentinel').replace('activePresets: []', richDisabled ? 'activePresets: [standard]' : 'activePresets: []')
  const ctx = await loadProfileServices(world, config)
  ctx.provide('profileContext', { name: 'normal-controls', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, installAnchor: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Presets, { default: 'standard' }); await ctx.agentPresets.register({ id: 'standard', plugins: [] }); await ctx.plugin(Gateway)
  const sentinel = new Sentinel(); ctx.effect(() => ctx.llm.registerAdapter(['sentinel'], sentinel))
  let request = 0
  const send = (target: typeof sessionId, text: string) => ctx.sessionController.prompt({ sessionId: target, requestId: id<'session-request-id'>('sentinel-' + ++request), mode: 'queue', content: [{ type: 'text', text }] }, new AbortController().signal)
  return { ctx, world, sentinel, send }
}
async function consume(source: AsyncIterable<StreamChunk>) { const chunks: StreamChunk[] = []; for await (const chunk of source) chunks.push(chunk); return chunks }

it('disabled test entry acquires nothing; explicit test policy rejects wrong profile, excessive budget and duplicate routes', async () => {
  const f = await setup('test-entry-disabled')
  try {
    const before = await f.ctx.agentPresets.list(); await f.ctx.plugin(TestEntry, {}); expect(await f.ctx.agentPresets.list()).toEqual(before)
    await expect(f.ctx.plugin(TestEntry, { ...policy, profileId: 'wrong' })).rejects.toMatchObject({ code: 'HARMONY_TEST_SCOPE' })
    await expect(f.ctx.plugin(TestEntry, { ...policy, responseLimit: 4 })).rejects.toThrow()
    await expect(f.ctx.plugin(TestEntry, { ...policy, provider: 'sentinel' })).rejects.toThrow()
    expect(f.sentinel.calls).toBe(0)
  } finally { await f.ctx.fiber.dispose() }
})

it('normal product task and rich action consume exactly three fixed responses while an existing Session retains its own route', async () => {
  const f = await setup('test-entry-product'); let plugin: Awaited<ReturnType<typeof f.ctx.plugin>> | undefined
  try {
    await f.ctx.sessionController.create({ sessionId: existingId, cwd: f.world })
    await f.send(existingId, 'Prior unrelated work.'); await f.ctx.agents.get(existingId)!.whenIdle()
    const previousResolves = f.sentinel.resolves
    const saveDefault = vi.spyOn(f.ctx.agentDefaultModel, 'saveSelection'), requireOffline = vi.spyOn(f.ctx.llm, 'requireOfflineReplay')
    plugin = f.ctx.plugin(TestEntry, policy); await plugin
    await f.ctx.sessionController.create({ sessionId, cwd: f.world, agentPreset: policy.presetId })
    const peer = f.ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId, deviceId, epoch: 1 }, interactions: 'none' })
    const grant = { desktopId, profileId: id<'mobile-profile'>('normal-controls'), deviceId, epoch: 1, sessions: [sessionId], operations: deviceGrantOperations, expiresAt: Date.now() + 60000, revoked: false }
    f.ctx.provide('harmonyAuthenticatedDevices', { current: candidate => candidate === peer ? grant : undefined, onRevoke: () => () => {} })
    f.ctx.effect(() => () => peer.dispose()); f.ctx.effect(() => f.ctx.remoteAccess.registerPolicy('harmony-device', deviceRemotePolicy(principal => principal === peer.principal ? grant : undefined, Date.now)))
    await f.ctx.plugin(Product, { enabled: true, desktopId, profileId: 'normal-controls', sessionId, journalMode: 'create' })
    let command = 0
    const request = (operation: string, payload: unknown) => invokeProfile(f.ctx, peer, { method: 'request', argument: { version: PROFILE_RPC_CODEC, packet: JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1, commandId: 'test-' + ++command, expiresAt: Date.now() + 30000, operation, payload }) } }, new AbortController().signal)
    const prompt = vi.spyOn(f.ctx.sessionController, 'prompt'), task = { sessionId, requestId: 'first-link-task', text: 'Show the synthetic mobile link form.' }
    const frames: string[] = []; f.ctx.on('agent/assistant-stream', ({ agent, frame }) => { if (agent.id === sessionId) frames.push(JSON.stringify(frame)) })
    await request('task.submit', task); await f.ctx.agents.get(sessionId)!.whenIdle(); await request('task.submit', task); expect(prompt).toHaveBeenCalledTimes(1)
    const events = f.ctx.sessions.get(sessionId)!.snapshotEvents(), message = events.find(event => event.type === 'assistant/message')
    if (message?.type !== 'assistant/message') throw new Error('synthetic form was not published: ' + JSON.stringify(events))
    const blockId = authoredBlockId(message.data.message.id, 'phone-form')
    const mounted = z.object({ mountId: z.string(), snapshot: z.object({ dataRevision: z.number(), draft: z.object({ draftRevision: z.number() }) }) }).parse(await request('rich.mount', { sessionId, messageId: message.data.message.id, blockId, guestProtocol: 'lumina-rich/1' }))
    const values = { title: 'Mobile checked', count: '7' }, actionId = id<'rich-inline-action'>('first-link-action')
    const intent = { mountId: mounted.mountId, actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: mounted.snapshot.dataRevision, values, fileGrants: [], draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: values, dirty: ['title', 'count'] } }
    const accepted = await request('rich.invoke', intent); expect(await request('rich.invoke', intent)).toEqual(accepted)
    await vi.waitFor(async () => expect(await request('rich.status', { mountId: mounted.mountId, actionId })).toMatchObject({ state: 'completed', values })); await f.ctx.agents.get(sessionId)!.whenIdle()
    const headers = f.ctx.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'request/context')
    expect(f.ctx.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(3); for (const header of headers) expect(header.data).toMatchObject({ provider: policy.provider, model: policy.model })
    expect(frames.filter(frame => frame.includes('text-delta')).length).toBeGreaterThan(1)
    expect(f.sentinel.calls).toBe(1); expect(f.sentinel.resolves).toBe(previousResolves); expect(saveDefault).not.toHaveBeenCalled(); expect(requireOffline).not.toHaveBeenCalled()
    await f.send(existingId, 'Original route remains available.'); await f.ctx.agents.get(existingId)!.whenIdle(); expect(f.sentinel.calls).toBe(2)
    const target = f.ctx.agents.get(sessionId)!, status = await f.ctx.commands.execute(target, '/harmony-test', [], new AbortController().signal)
    expect(status?.result).toMatchObject({ kind: 'success' })
    const fixedRequests = z.object({ responses: z.number() }).parse(JSON.parse(status!.result.text!)).responses
    const duplicateTaskDispatches = f.ctx.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user' && 'rpcId' in event.data.source && event.data.source.rpcId === task.requestId).length
    const output = { profileId: 'normal-controls', preset: policy.presetId, fixedRequests, duplicateTaskDispatches, richState: 'completed', values, unrelatedProviderDispatches: f.sentinel.calls, globalDefaultSaved: saveDefault.mock.calls.length, globalOfflinePolicyChanged: requireOffline.mock.calls.length }
    expect(output).toEqual(JSON.parse(await readFile(new URL('../tests/fixtures/normal-controls.expected.json', import.meta.url), 'utf8')))
    await plugin.dispose(); plugin = undefined
    await expect(Promise.resolve().then(() => consume(f.ctx.llm.stream({ provider: 'sentinel', model: 'sentinel', sessionId, messages: [], purpose: 'compaction' })))).rejects.toMatchObject({ code: 'HARMONY_TEST_CLOSED' })
    expect(f.sentinel.calls).toBe(2)
    await f.send(sessionId, 'Must remain blocked after unload.'); await target.whenIdle(); expect(f.sentinel.calls).toBe(2)
  } finally { await plugin?.dispose(); await f.ctx.fiber.dispose() }
})

it('second test Session, foreign model calls, excess responses and cold reuse fail without provider fallback or budget reset', async () => {
  const f = await setup('test-entry-refusals')
  try {
    await f.ctx.plugin(TestEntry, { ...policy, responseLimit: 1 })
    await f.ctx.sessionController.create({ sessionId, cwd: f.world })
    await f.ctx.agentPresets.select(f.ctx.agents.get(sessionId)!, policy.presetId)
    await expect(f.ctx.sessionController.create({ sessionId: id<'SessionId'>('second-target'), cwd: f.world, agentPreset: policy.presetId })).rejects.toThrow()
    await expect(Promise.resolve().then(() => consume(f.ctx.llm.stream({ provider: 'sentinel', model: 'sentinel', sessionId, messages: [] })))).rejects.toMatchObject({ code: 'HARMONY_TEST_SCOPE' })
    await f.send(sessionId, 'Consume the only fixed response.'); await f.ctx.agents.get(sessionId)!.whenIdle()
    await f.send(sessionId, 'No paid fallback after exhaustion.'); await f.ctx.agents.get(sessionId)!.whenIdle(); expect(f.sentinel.calls).toBe(0)
    expect(JSON.stringify(f.ctx.sessions.get(sessionId)!.snapshotEvents())).toContain('HARMONY_TEST_EXHAUSTED')
    await f.ctx.sessionPersistence.flush()
  } finally { await f.ctx.fiber.dispose() }
  const reopened = await setup('unused', f.world)
  try { await reopened.ctx.plugin(TestEntry, { ...policy, responseLimit: 1 }); await expect(reopened.send(sessionId, 'No cold reset.')).rejects.toThrow(); expect(reopened.sentinel.calls).toBe(0) }
  finally { await reopened.ctx.fiber.dispose() }
})

it('missing rich authoring and an expired test lifetime stop before consuming a response or reaching another provider', async () => {
  for (const disabled of [true, false]) {
    const f = await setup(disabled ? 'test-rich-disabled' : 'test-expired', undefined, disabled)
    try {
      await f.ctx.plugin(TestEntry, { ...policy, ttlMs: 1000 })
      await f.ctx.sessionController.create({ sessionId, cwd: f.world, agentPreset: policy.presetId })
      if (!disabled) { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 1001) }
      await f.send(sessionId, 'Must fail before dispatch.'); await f.ctx.agents.get(sessionId)!.whenIdle()
      const result = await f.ctx.commands.execute(f.ctx.agents.get(sessionId)!, '/harmony-test', [], new AbortController().signal)
      expect(JSON.parse(result!.result.text!)).toMatchObject({ responses: 0 })
      expect(JSON.stringify(f.ctx.sessions.get(sessionId)!.snapshotEvents())).toContain(disabled ? 'HARMONY_TEST_RICH_DISABLED' : 'HARMONY_TEST_CLOSED')
      expect(f.sentinel.calls).toBe(0)
    } finally { vi.useRealTimers(); await f.ctx.fiber.dispose() }
  }
})

it('the explicit local new command creates one fresh test Session and repeated commands return its original identity', async () => {
  const f = await setup('test-new-command')
  try {
    await f.ctx.sessionController.create({ sessionId: existingId, cwd: f.world })
    await f.ctx.plugin(TestEntry, policy)
    const run = () => f.ctx.commands.execute(f.ctx.agents.get(existingId)!, '/harmony-test new', [], new AbortController().signal)
    const first = await run(), second = await run()
    expect(first?.result.kind).toBe('success'); expect(second?.result).toEqual(first?.result)
    const created = z.object({ sessionId: z.string().transform(value => id<'SessionId'>(value)) }).parse(JSON.parse(first!.result.text!))
    expect(created.sessionId).not.toBe(existingId); expect(f.ctx.agents.roots()).toHaveLength(2)
    const agent = f.ctx.agents.get(created.sessionId)!
    expect(f.ctx.agentPresets.composedPreset(agent.ctx)).toBe(policy.presetId)
    const status = await f.ctx.commands.execute(agent, '/harmony-test status', [], new AbortController().signal)
    expect(JSON.parse(status!.result.text!)).toMatchObject({ responses: 0, provider: policy.provider, model: policy.model })
    expect(f.sentinel.calls).toBe(0)
  } finally { await f.ctx.fiber.dispose() }
})

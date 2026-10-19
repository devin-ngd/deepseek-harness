/** Fixed real DSH services verify rich projection and bounded read recovery; no native networking is activated. */
import { access, writeFile } from 'node:fs/promises'
import { CommandEpochClock } from '../src/command-clock.ts'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { mobilePublications } from '../integration/mobile-publication.ts'
import { NetworkPhone } from '../src/network-phone.ts'
import { PhoneCore } from '../src/phone-core.ts'
import type { NativeProvider } from '../src/phone-core.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import type { PhoneView } from '../src/semantic-phone.ts'
import { id } from '../src/protocol.ts'
import { object } from '../src/domain.ts'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

it('bounded reads span actual source offload, draft/action/cancel, full recovery and real service reopen without redispatch', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (!parent) throw new Error('Owned offline launcher required')
  const world = join(parent, 'phase15-recovery'), publications = mobilePublications.map((value, index) => index === 0 ? { ...value, html: value.html + '<!-- fixed source selection -->'.repeat(180) } : value)
  let lab = await nativeReplayLab(world, 'create', { port: 0, clockAuthority:ownerCommandClock,grantTtlMs: 180000, followSegmentMs: 80, publications })
  const transports: NetworkPhone[] = []
  const transport = () => { const value = new NetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl: lab.carrier.url, maxFrameBytes: 1048576, maxReadChunkBytes: 1048576, requestTimeoutMs: 1000, maxInFlight: 4 }, fetch); transports.push(value); return value }
  let active = transport(), reads = 0, sequence = 0, failure: unknown
  const provider: NativeProvider = { request: (command, signal) => active.request(command, signal), follow: (command, resume, signal) => { reads++; return active.follow(command, resume, signal) }, close: async () => { for (const value of transports) await value.close() } }
  const model = new SemanticPhone({ desktopId: id<'mobile-desktop'>('phase11-desktop'), deviceId: id<'mobile-device'>('phase11-phone'), sessionId: lab.sessionId }, { maxBytes: 1048576, maxEvents: 512, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 512)
  const core = new PhoneCore(provider, model, { follow: { mode: 'bounded', maxSegments: 512, maxFailures: 30, retryDelayMs: 50 }, clock: Date.now, grantEpoch: 1, ttlMs: 60000, maxMounts: 4, maxIntents: 128, nextCommandId: () => id<'mobile-command'>('phase15-' + ++sequence) })
  const life = new AbortController(), views: PhoneView[] = []
  const following = (async () => { try { for await (const view of core.follow(life.signal)) views.push(view) } catch (error) { if (!life.signal.aborted) failure = error } })()
  async function until(check: () => boolean | Promise<boolean>) { for (let at = 0; at < 2000; at++) { if (failure !== undefined) throw failure; if (await check()) return; await delay(5) } throw new Error('Phase15 bounded wait failed') }
  const firstPrompt = vi.spyOn(lab.ctx.sessionController, 'prompt'), firstUpload = vi.spyOn(lab.ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
  try {
    await until(() => model.view.connection === 'connected' && reads >= 2)
    expect(lab.carrier.metrics.gatewayErrors).toBe(0)
    const accepted = await core.submit('phase15-task', 'Fixed bounded recovery task')
    await until(() => model.view.task === 'completed' && model.view.messages.some(row => row.rich.length > 0))
    expect(await core.submit('phase15-task', 'Fixed bounded recovery task')).toEqual(accepted)
    expect(firstPrompt).toHaveBeenCalledTimes(1); expect(views.some(view => view.liveText.length > 0)).toBe(true)
    const reference = model.view.messages.flatMap(row => row.rich)[0]!, mount = await core.mount(reference), fields = { title: 'Final mobile input', count: '7' }
    await core.request('rich.saveDraft', { mountId: mount.mountId, draft: { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields, dirty: Object.keys(fields) } })
    const draft = object(object(await core.request('rich.snapshot', { mountId: mount.mountId })).draft)
    const intent = { mountId: mount.mountId, actionId: 'phase3-action', actionName: 'submit', targetActionId: null, expectedDataRevision: mount.snapshot.dataRevision, values: fields, fileGrants: [], draft: { baseRevision: draft.draftRevision, stateSchemaVersion: 1, fields, dirty: Object.keys(fields) } }
    const receipt = await core.request('rich.invoke', intent)
    await until(async () => object(await core.request('rich.status', { mountId: mount.mountId, actionId: 'phase3-action' })).state === 'completed')
    expect(await core.request('rich.invoke', intent)).toEqual(receipt)
    await until(() => model.cache() !== null && object(model.cache()).events instanceof Array && (object(model.cache()).events as readonly { type?: string }[]).some(event => event.type === 'rich-inline/source-offload'))
    expect(model.view.readOnly).toBe(false)
    const latest = object(await core.request('rich.snapshot', { mountId: mount.mountId }))
    expect(latest.dataRevision).toBe(2); expect(object(latest.draft).fields).toEqual(fields)
    const restored = new SemanticPhone(model.owner, model.limits, 512); restored.restore(model.cache())
    expect(restored.view.readOnly).toBe(true); expect(restored.view.messages).toEqual(model.view.messages)
    await core.submit('phase15-cancel', 'Fixed cancellable task')
    await until(async () => { try { await access(lab.replay.readyFile); return true } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; return false } })
    await core.cancel(); await until(() => model.view.task === 'cancelled')
    lab.replay.handle.assertConsumed(); lab.ctx.llm.assertOfflineReplayConsumed(); lab.ctx.llm.assertZeroRealCalls()
    expect(firstUpload).not.toHaveBeenCalled(); expect(firstPrompt).toHaveBeenCalledTimes(3)
    const firstInstance = model.resume.instance, firstMetrics = { ...lab.carrier.metrics }, originalMessages = model.view.messages
    await lab.close()
    lab = await nativeReplayLab(world, 'reopen', { port: 0, clockAuthority:ownerCommandClock,grantTtlMs: 180000, followSegmentMs: 80, publications }); active = transport()
    const reopenedPrompt = vi.spyOn(lab.ctx.sessionController, 'prompt'), reopenedUpload = vi.spyOn(lab.ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
    await until(() => model.resume.instance === lab.instance)
    expect(model.resume.instance).not.toBe(firstInstance); expect(model.view.messages).toEqual(originalMessages); expect(model.view.readOnly).toBe(false)
    expect(object(await core.receipt('phase15-task')).accepted).toBe(true)
    expect(await core.submit('phase15-task', 'Fixed bounded recovery task')).toEqual(accepted)
    await expect(core.request('rich.snapshot', { mountId: mount.mountId })).rejects.toMatchObject({ code: 'stale-mount' })
    expect(await core.request('rich.dispose', { mountId: mount.mountId })).toEqual({ disposed: true })
    const fresh = await core.mount(reference), status = object(await core.request('rich.status', { mountId: fresh.mountId, actionId: 'phase3-action' }))
    expect(status.state).toBe('completed'); expect(fresh.snapshot.draft.fields).toEqual(fields); expect(fresh.snapshot.dataRevision).toBe(2)
    expect(reopenedPrompt).not.toHaveBeenCalled(); expect(reopenedUpload).not.toHaveBeenCalled(); expect(lab.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0); lab.ctx.llm.assertZeroRealCalls()
    life.abort(); await following; await core.close(); await lab.close()
    expect(lab.carrier.metrics.active).toBe(0)
    await writeFile(new URL('../evidence/phase15-services.json', import.meta.url), JSON.stringify({ passed: true, world, layer: 'actual DSH replay services and ephemeral loopback fetch; no emulator/native activation', reads, commands: sequence, firstInstance, reopenedInstance: model.resume.instance, firstMetrics, finalMetrics: lab.carrier.metrics, fixedResponses: 4, promptCalls: 3, reopenPromptCalls: 0, sourceOffloadAccepted: true, draftRestored: true, actionRestored: true, cancellationObserved: true, duplicateTaskRedispatch: 0, staleLeaseForwarded: 0, realModelCalls: 0, uploadCalls: 0, listenersClosed: true, nativeHttpQualified: false, arkWebQualified: false }, null, 2) + '\n')
  } finally { life.abort(); await following; await core.close(); await lab.close() }
}, 45000)

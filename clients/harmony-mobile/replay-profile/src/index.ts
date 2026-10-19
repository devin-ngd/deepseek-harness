import { restartFixture } from './restart-fixture.ts'
/** Source-derived dsh application plugin for one fixed offline mobile journey; creates no network listener or real grant. */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import '@deepseek-ai/dsh-cmdline'
import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { sourceComposition } from '../../integration/source-composition.ts'
import { installFourResponses, realReplayPorts, RealFollowPump } from '../../integration/replay-host.ts'
import { RestrictedDesktopAdapter } from '../../src/desktop-adapter.ts'
import { MockDeviceRegistry } from '../../src/link-protocol.ts'
import { MockOutboundRelay } from '../../src/relay.ts'
import { MockPhoneClient } from '../../src/phone.ts'
import { id } from '../../src/protocol.ts'
import { deviceGrantOperations } from '../../src/pairing-protocol.ts'
import { openMobileJournal } from '../../integration/durable-journal.ts'
import { authoredBlockId } from '../../../../packages/experimental/rich-inline/src/shared/authored.ts'
import { fieldJourney } from './field.ts'

/** Only the public dsh profile lifecycle may start this fixed application. */
export const inject = ['cmdlineArgs', 'appReady', 'appExit', 'profileContext']
function failureMessages(error: unknown): string[] { if (error instanceof AggregateError) return error.errors.flatMap(failureMessages); if (error instanceof Error) return [error.message, ...('cause' in error ? failureMessages(error.cause) : [])]; return ['unclassified'] }
/** @param host - dsh-owned selected isolated profile; never the installed desktop. @returns after registering the startup and teardown effects. */
export function apply(host: Context): void {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1' || !['fixed-four-v1', 'paired-four-v1', 'restart-four-v1'].includes(process.env.DSH_HARMONY_OFFLINE_PROFILE ?? '') || host.profileContext.name !== 'harmony-mobile-replay' || host.cmdlineArgs?.get().length !== 0 || host.appReady === undefined || host.appExit === undefined) throw new Error('fixed offline profile launch required')
  const lifetime = new AbortController()
  let running: Promise<void> | undefined
  host.effect(() => host.appReady!.onReady(() => {
    const selected = process.env.DSH_HARMONY_OFFLINE_PROFILE === 'restart-four-v1' ? restartFixture(host, lifetime.signal) : process.env.DSH_HARMONY_OFFLINE_PROFILE === 'paired-four-v1' ? fieldJourney(host, lifetime.signal) : journey(host.profileContext.home, lifetime.signal)
    running = selected.then(() => host.appExit!(0), async error => { await writeFile(join(host.profileContext.home, 'failure.json'), JSON.stringify({ code: 'fixed-offline-journey-failed', messages: failureMessages(error), stack: error instanceof Error ? error.stack : undefined }, null, 2) + '\n'); host.logger('harmony-replay').error('fixed offline journey failed; isolated state retained'); host.appExit!(1) })
  }))
  host.effect(() => async () => { lifetime.abort(); await running })
}

async function until(check: () => Promise<boolean>, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 15000
  while (!await check()) { signal.throwIfAborted(); if (Date.now() >= deadline) throw new Error('fixed replay deadline'); await new Promise<void>(resolve => setTimeout(resolve, 10)) }
}

/** @param home - launcher-owned fresh home. @param signal - profile lifecycle. @returns after the four-response journey and complete resource cleanup. */
export async function journey(home: string, signal: AbortSignal): Promise<void> {
  const world = join(home, 'world'); await mkdir(world)
  const fixture = await readFile(new URL('../assets/offline-four.v4.jsonl', import.meta.url), 'utf8'), config = await readFile(new URL('../assets/cordis.yml', import.meta.url), 'utf8')
  const ctx = await sourceComposition(world, { fixture, config })
  let pump: RealFollowPump | undefined, adapter: RestrictedDesktopAdapter | undefined, relay: MockOutboundRelay | undefined
  let uploads = 0
  const prepare = ctx.deepseekLlmApiExtensions.prepare
  ctx.deepseekLlmApiExtensions.prepare = async () => { uploads++; throw new Error('UPLOAD_DISABLED') }
  try {
    const replay = await installFourResponses(ctx, world, undefined, fixture), sessionId = id<'SessionId'>('harmony-mobile-field-replay-session'), desktopId = id<'mobile-desktop'>('fixed-replay-desktop'), deviceId = id<'mobile-device'>('fixed-replay-phone'), clock = Date.now
    await ctx.sessionController.create({ sessionId, cwd: world })
    const registry = new MockDeviceRegistry('mock', clock)
    registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations: deviceGrantOperations, expiresAt: clock() + 60000, revoked: false })
    relay = new MockOutboundRelay('mock', registry, { clock, eventTtlMs: 60000, maxEventBytes: 1048576, maxEventsPerSession: 1024, maxSessions: 1 })
    const mobile = await openMobileJournal(ctx, 128, { mode: 'create', root: join(world, 'state') })
    try {
      adapter = new RestrictedDesktopAdapter(desktopId, realReplayPorts(ctx), registry, { clock, maxPacketBytes: 1048576, maxCachedCommands: 128, maxCommandTtlMs: 60000, maxMountedBlocks: 4 }, mobile.journal)
      relay.attachDesktop(adapter)
      const phone = new MockPhoneClient(relay, { desktopId, deviceId, epoch: 1 }, 30000, 4)
      pump = new RealFollowPump(ctx, sessionId, relay); await pump.opened
      await phone.sync(sessionId)
      const task = { sessionId, requestId: 'fixed-task', text: 'Show the fixed replay mobile forms.' }
      assert.deepEqual(await phone.request('task.submit', task), await phone.request('task.submit', task))
      await ctx.agents.get(sessionId)!.whenIdle(); await phone.sync(sessionId)
      const event = ctx.sessions.get(sessionId)!.snapshotEvents().find(event => event.type === 'assistant/message')
      if (event?.type !== 'assistant/message') throw new Error('fixed assistant publication missing')
      const scope = { sessionId, messageId: event.data.message.id, blockId: authoredBlockId(event.data.message.id, 'phone-form'), guestProtocol: 'lumina-rich/1' as const }
      const mounted = await phone.request('rich.mount', scope)
      if (mounted === null || typeof mounted !== 'object' || !('mountId' in mounted) || !('snapshot' in mounted)) throw new Error('fixed mount result missing')
      const intent = { mountId: mounted.mountId, actionId: id<'rich-inline-action'>(randomUUID()), actionName: 'submit', targetActionId: null, expectedDataRevision: mounted.snapshot.dataRevision, values: { title: 'Final mobile input', count: '7' }, fileGrants: [], draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { title: 'Final mobile input', count: '7' }, dirty: ['title', 'count'] } }
      assert.deepEqual(await phone.request('rich.invoke', intent), await phone.request('rich.invoke', intent))
      await until(async () => { const status = await phone.request('rich.status', { mountId: mounted.mountId, actionId: intent.actionId }); return status !== null && typeof status === 'object' && 'state' in status && status.state === 'completed' }, signal)
      await ctx.agents.get(sessionId)!.whenIdle(); await phone.sync(sessionId)
      await phone.request('rich.dispose', { mountId: mounted.mountId }); const reopened = await phone.request('rich.mount', scope)
      if (reopened === null || typeof reopened !== 'object' || !('mountId' in reopened)) throw new Error('fixed historical mount missing')
      const historical = await phone.request('rich.status', { mountId: reopened.mountId, actionId: intent.actionId })
      assert.ok(historical !== null && typeof historical === 'object' && 'state' in historical && historical.state === 'completed')
      await phone.request('task.submit', { sessionId, requestId: 'fixed-cancel', text: 'Hold the fourth fixed response until cancellation.' })
      await until(() => access(replay.readyFile).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false }), signal)
      await phone.request('session.cancel', { sessionId }); await ctx.agents.get(sessionId)!.whenIdle()
      replay.handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed(); ctx.llm.assertZeroRealCalls(); assert.equal(uploads, 0); await ctx.sessionPersistence.flush()
      const events = ctx.sessions.get(sessionId)!.snapshotEvents(), original = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user' && 'rpcId' in event.data.source && event.data.source.rpcId === task.requestId).length
      assert.equal(original, 1)
      await writeFile(join(home, 'result.json'), JSON.stringify({ schema: 'harmony-source-replay-profile/1', profile: 'harmony-mobile-replay', blankHome: true, realServices: true, desktopDispatches: original, replayCalls: 4, realModels: 0, uploads, liveStreamFrames: pump.seen.filter(frame => frame.type === 'assistant-stream').length, richCompleted: true, historicalStatus: true, cancellation: true, grants: 'synthetic fixture only', networkListeners: 0, phoneOrArkWebQualified: false }, null, 2) + '\n')
      replay.handle.dispose()
    } finally { const released = await Promise.allSettled([Promise.resolve().then(() => pump?.close()), Promise.resolve().then(() => adapter?.close()), Promise.resolve().then(() => relay?.close()), mobile.close()]); if (released.some(result => result.status === 'rejected')) throw new Error('fixed replay cleanup failed') }
  } finally { ctx.deepseekLlmApiExtensions.prepare = prepare; await ctx.fiber.dispose() }
}

/** Closed two-process recovery fixture; all identities are synthetic and every provider remains fixed replay. */
import type { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { z } from 'zod'
import type { JsonlHandleStorage } from '../../../../packages/session/session-persistence-jsonl/src/storage.ts'
import { serveBrowserFixture } from './browser-fixture.ts'
import { FieldWorldOwner } from './field-world.ts'
import { sourceComposition } from '../../integration/source-composition.ts'
import { installFourResponses, fixedReplayPosition } from '../../integration/replay-host.ts'
import { ProfileDesktopExecutor, profileServicePorts } from '../../desktop-plugin/src/ports.ts'
import { openProfileJournal } from '../../desktop-plugin/src/journal.ts'
import { MOBILE_LINK_PROTOCOL, MockDeviceRegistry, type MobileOperation } from '../../src/link-protocol.ts'
import type { AdmissionJournal } from '../../src/admission-journal.ts'
import { id } from '../../src/protocol.ts'
import { fieldSession, fieldProfile } from '../../src/first-use-protocol.ts'
import { deviceGrantOperations } from '../../src/pairing-protocol.ts'
import { authoredBlockId } from '../../../../packages/experimental/rich-inline/src/shared/authored.ts'

const schema = z.object({ schema: z.literal('harmony-restart-fixture/1'), fixture: z.literal('public-fixed-replay-only'), phase: z.enum(['write', 'read']), point: z.enum(['before-claim', 'after-claim', 'before-flush', 'flush-failed', 'after-ack', 'after-canonical', 'completed', 'rich-reopen', 'browser-reopen']), world: z.string().refine(isAbsolute), checkpointWaitMs: z.number().int().min(1000).max(30000) }).strict()
/** @param persistence - actual JSONL service in this source-only recovery fixture. @returns whether the provider-local batch fault port is available without exporting its implementation class. */
function hasBatchFaultPort(persistence: Context['sessionPersistence']): persistence is Context['sessionPersistence'] & Pick<JsonlHandleStorage, 'persistBatch'> {
  return persistence.name === 'session-persistence-jsonl' && 'persistBatch' in persistence && typeof persistence.persistBatch === 'function'
}
/** @param host - exact guarded dsh profile Context. @param signal - profile cleanup lifetime. @returns after a synthetic checkpoint or cold result, with no key, grant, upload or listener activation. */
export async function restartFixture(host: Context, signal: AbortSignal): Promise<void> {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1' || process.env.DSH_HARMONY_OFFLINE_PROFILE !== 'restart-four-v1') throw new Error('restart fixture guard required')
  const home = host.profileContext.home, config = schema.parse(JSON.parse(await readFile(join(home, 'restart-fixture.json'), 'utf8'))), fixture = await readFile(new URL('../assets/offline-four.v4.jsonl', import.meta.url), 'utf8'), sourceConfig = await readFile(new URL('../assets/cordis.yml', import.meta.url), 'utf8')
  const desktopId = id<'mobile-desktop'>('restart-fixture-desktop'), deviceId = id<'mobile-device'>('restart-fixture-phone'), sessionId = id<'SessionId'>(fieldSession), requestId = id<'session-request-id'>('restart-original-task')
  await FieldWorldOwner.use({ path: config.world, mode: config.phase === 'write' ? 'create' : 'reopen', desktopId, identityAlias: 'fixture-desktop', assetsSha256: createHash('sha256').update(fixture + '\0' + sourceConfig).digest('hex'), maxAdmissionRecords: 128, lockWaitMs: 2000 }, async owner => { const ctx = await sourceComposition(owner.root, { fixture, config: sourceConfig })
  let executor: ProfileDesktopExecutor | undefined, state: Awaited<ReturnType<typeof openProfileJournal>> | undefined, promptCalls = 0, originalTaskPrompts = 0, commandIndex = 0, activationRefused = false, holdWrites = false, blockedWrites = 0, releaseWrites!: () => void
  const writeGate = new Promise<void>(accept => { releaseWrites = accept }), persistence = ctx.sessionPersistence
  if (config.phase === 'write' && ['before-flush', 'flush-failed'].includes(config.point)) {
    if (!hasBatchFaultPort(persistence)) throw new Error('closed fixture requires actual JSONL batch port')
    const persistBatch = persistence.persistBatch.bind(persistence)
    persistence.persistBatch = async (...batch) => { if (holdWrites) { blockedWrites++; await writeGate }; return persistBatch(...batch) }
  }
  let consumed = 0
  if (config.phase === 'read') { try { consumed = await fixedReplayPosition(ctx, sessionId) } catch (error) { if (config.point !== 'after-ack') throw error; activationRefused = true } }
  const replay = await installFourResponses(ctx, owner.root, undefined, fixture, consumed)
  ctx.deepseekLlmApiExtensions.prepare = async () => { throw new Error('UPLOAD_DISABLED') }
  async function summary() {
    const inspection = await ctx.sessionController.inspect(sessionId), counts = ctx.llm.getOfflineReplayCounts(), handle = await ctx.sessionPersistence.open(sessionId, 'read')
    try {
      const durable = await handle.read(), original = (message: { readonly source: unknown }) => { const source = message.source; return source !== null && typeof source === 'object' && 'kind' in source && source.kind === 'user' && 'rpcId' in source && source.rpcId === requestId }
      ctx.llm.assertZeroRealCalls()
      return { pid: process.pid, phase: config.phase, point: config.point, promptCalls, originalTaskPrompts, blockedWrites, originalMessages: inspection.events.filter(event => event.type === 'user/message' && original(event.data)).length, durableOriginalMessages: durable.events.filter(event => event.type === 'user/message' && original(event.data)).length, durableOriginalInbox: durable.events.filter(event => event.type === 'agent/inbox/spliced' && event.data.inserted.some(original)).length, assistantMessages: inspection.events.filter(event => event.type === 'assistant/message').length, replayCalls: counts.replay.reduce((sum, row) => sum + row.calls, 0), replayPosition: consumed, replayRemaining: replay.remaining, expectedReplayBudget: 4, activationRefused, realModels: counts.realCalls, networkListeners: 0 }
    } finally { await handle.close() }
  }
  async function checkpoint() {
    if (holdWrites) { const until = Date.now() + 3000; while (blockedWrites === 0) { if (Date.now() >= until) throw new Error('background writer did not reach fixed gate'); await new Promise<void>(accept => setTimeout(accept, 25)) }; await new Promise<void>(accept => setTimeout(accept, 250)) }
    await writeFileAtomic(join(home, 'checkpoint.json'), JSON.stringify(await summary(), null, 2) + '\n', {mode:0o600,dirMode:0o700})
    await new Promise<void>((accept, reject) => { const abort = () => { clearTimeout(timer); accept() }, timer = setTimeout(() => { signal.removeEventListener('abort', abort); reject(new Error('synthetic checkpoint deadline')) }, config.checkpointWaitMs); signal.addEventListener('abort', abort, { once: true }) })
  }
  try {
    if (!activationRefused) await owner.prepareSession(ctx)
    if (config.phase === 'write' && ['before-flush', 'flush-failed'].includes(config.point)) {
      holdWrites = true
      ctx.sessionPersistence.flush = async () => { if (config.point === 'before-flush') await checkpoint(); throw new Error('synthetic durability barrier unavailable') }
    }
    state = await openProfileJournal(ctx, 128, { mode: 'reopen', desktopId, profileId: id<'mobile-profile'>(fieldProfile) })
    const registry = new MockDeviceRegistry('mock', Date.now); registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations: deviceGrantOperations, expiresAt: Date.now() + 60000, revoked: false })
    const ports = profileServicePorts(ctx), prompt = ports.session.prompt
    const services = { ...ports, session: { ...ports.session, prompt: async (...args: Parameters<typeof prompt>) => { promptCalls++; if (args[0].requestId === requestId) originalTaskPrompts++; const result = await prompt(...args); if (config.phase === 'write' && config.point === 'after-canonical') { await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush(); await checkpoint() }; return result } } }
    const journal: AdmissionJournal = { get: (...args) => state!.journal.get(...args), accept: record => state!.journal.accept(record), claim: async record => { if (config.phase === 'write' && config.point === 'before-claim') await checkpoint(); const claim = await state!.journal.claim(record); if (config.phase === 'write' && config.point === 'after-claim') await checkpoint(); return claim } }
    executor = new ProfileDesktopExecutor(desktopId, services, registry, { clock: Date.now, maxPacketBytes: 1048576, maxCachedCommands: 128, maxCommandTtlMs: 60000, maxMountedBlocks: 4 }, journal)
    const request = (operation: MobileOperation, payload: Readonly<Record<string, unknown>>) => executor!.handle(JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1, commandId: 'restart-' + config.phase + '-' + commandIndex++, expiresAt: Date.now() + 30000, operation, payload }))
    const task = { sessionId, requestId, text: 'Fixed two-process recovery task.' }
    async function finishFourResponses() {
      await request('task.submit', { sessionId, requestId: 'restart-cancel', text: 'Hold the final fixed response for cancellation.' })
      const until = Date.now() + 10000; while (true) { try { await readFile(replay.readyFile); break } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }; if (Date.now() >= until) throw new Error('fixed cancellation deadline'); await new Promise<void>(accept => setTimeout(accept, 10)) }
      await request('session.cancel', { sessionId }); await ctx.agents.get(sessionId)!.whenIdle(); replay.handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed()
    }
    if (config.phase === 'write') {
      if (config.point === 'flush-failed') { try { await request('task.submit', task); throw new Error('failed flush accepted') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'unknown-outcome') throw error }; const receipt = await request('task.receipt', { sessionId, requestId }); if (receipt === null || typeof receipt !== 'object' || !('state' in receipt) || receipt.state !== 'unknown') throw new Error('failed flush receipt must remain unknown'); await checkpoint() }
      await request('task.submit', task)
      if (config.point === 'after-ack') await checkpoint()
      await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush(); await checkpoint()
    } else {
      const receiptBefore = await request('task.receipt', { sessionId, requestId }), duplicate = await request('task.submit', task)
      await ctx.agents.get(sessionId)?.whenIdle(); await ctx.sessionPersistence.flush()
      const inspection = await ctx.sessionController.inspect(sessionId), publication = inspection.events.find(event => event.type === 'assistant/message')
      let historicalRich = false, richCompleted = false, richDuplicate = false, cancellation = false, browserEvidence: Awaited<ReturnType<typeof serveBrowserFixture>> | undefined
      if (publication?.type === 'assistant/message' && !activationRefused) {
        const mount = await request('rich.mount', { sessionId, messageId: publication.data.message.id, blockId: authoredBlockId(publication.data.message.id, 'phone-form'), guestProtocol: 'lumina-rich/1' })
        historicalRich = mount !== null && typeof mount === 'object' && 'snapshot' in mount
        if (config.point === 'browser-reopen') {
          if (mount === null || typeof mount !== 'object' || !('mountId' in mount)) throw new Error('original browser mount unavailable')
          browserEvidence = await serveBrowserFixture(ctx, home, sessionId, mount, request, signal, config.checkpointWaitMs); richCompleted = browserEvidence.richCompleted; richDuplicate = browserEvidence.richDuplicate; await finishFourResponses(); cancellation = true
        }
        if (config.point === 'rich-reopen') {
          if (!historicalRich || mount === null || typeof mount !== 'object' || !('mountId' in mount) || !('snapshot' in mount)) throw new Error('cold rich mount unavailable')
          const intent = { mountId: mount.mountId, actionId: id<'rich-inline-action'>(randomUUID()), actionName: 'submit', targetActionId: null, expectedDataRevision: mount.snapshot.dataRevision, values: { title: 'Final mobile input', count: '7' }, fileGrants: [], draft: { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { title: 'Final mobile input', count: '7' }, dirty: ['title', 'count'] } }
          richDuplicate = JSON.stringify(await request('rich.invoke', intent)) === JSON.stringify(await request('rich.invoke', intent))
          const deadline = Date.now() + 10000
          while (!richCompleted) { const status = await request('rich.status', { mountId: mount.mountId, actionId: intent.actionId }); richCompleted = status !== null && typeof status === 'object' && 'state' in status && status.state === 'completed'; if (!richCompleted) { if (Date.now() >= deadline) throw new Error('cold rich completion deadline'); await new Promise<void>(accept => setTimeout(accept, 10)) } }
          await ctx.agents.get(sessionId)!.whenIdle()
          await finishFourResponses(); cancellation = true
        }
      }
      await ctx.sessionPersistence.flush(); await writeFileAtomic(join(home, 'result.json'), JSON.stringify({ ...await summary(), receiptBefore, duplicate, historicalRich, richCompleted, richDuplicate, cancellation, browserEvidence, journalRecordState: (await state.journal.get(sessionId, requestId))?.state ?? 'absent', identityGenerated: false, uploads: 0 }, null, 2) + '\n', {mode:0o600,dirMode:0o700})
    }
  } finally { holdWrites = false; releaseWrites(); await executor?.close(); await state?.close(); replay.handle.dispose(); await ctx.fiber.dispose() }
  })
}

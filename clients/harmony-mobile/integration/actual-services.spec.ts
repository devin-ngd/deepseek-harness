/** Real source-mode Loader smoke; not an application launch, network or device test. */
import { join } from 'node:path'
import { mkdir, access, readFile, readdir, writeFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { route, sourceComposition } from './source-composition.ts'
import { installFourResponses, realReplayPorts, RealFollowPump } from './replay-host.ts'
import { RestrictedDesktopAdapter } from '../src/desktop-adapter.ts'
import { MockOutboundRelay } from '../src/relay.ts'
import { MockPhoneClient } from '../src/phone.ts'
import { MockDeviceRegistry } from '../src/link-protocol.ts'
import { canonical, id } from '../src/protocol.ts'
import { openMobileJournal } from './durable-journal.ts'

it('activates actual SessionController, RichInline and JSONL persistence behind offline guards', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated integration launcher required')
  const world = join(parent, 'probe'); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world)
  try {
    expect(ctx.llm.getOfflineReplayCounts().realCalls).toBe(0)
    expect(ctx.connection.requestRejection({ headers: {} })).toBe(403)
  } finally { await ctx.fiber.dispose() }
})

it('mobile protocol uses real Session/Rich services for streamed task, action completion, duplicate rejection and cancellation', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated integration launcher required')
  const world = join(parent, 'real-link'); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world)
  let adapter: RestrictedDesktopAdapter | undefined, relay: MockOutboundRelay | undefined, pump: RealFollowPump | undefined
  try {
    const upload = vi.spyOn(ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
    const replay = await installFourResponses(ctx, world), requests: string[] = []
    ctx.on('llm-replay/request', options => { requests.push(JSON.stringify(options.messages)) })
    const { SessionId } = await import('@deepseek-ai/dsh-session')
    const sessionId = SessionId('phase3-session'), foreignId = SessionId('phase3-foreign')
    await ctx.sessionController.create({ sessionId, cwd: world })
    await ctx.sessionController.create({ sessionId: foreignId, cwd: world })
    const desktopId = id<'mobile-desktop'>('phase3-desktop'), deviceId = id<'mobile-device'>('phase3-phone'), clock = () => Date.now()
    const registry = new MockDeviceRegistry('mock', clock)
    const operations = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.snapshot', 'rich.dispose', 'approval.list'] as const
    registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations, expiresAt: clock() + 60000, revoked: false })
    relay = new MockOutboundRelay('mock', registry, { clock, eventTtlMs: 60000, maxEventBytes: 1048576, maxEventsPerSession: 1024, maxSessions: 2 })
    const mobileState = await openMobileJournal(ctx, 128, { mode: 'create', root: join(world, 'state') })
    let failFirstAcceptanceWrite = true
    const acceptanceFaultJournal = { ...mobileState.journal, accept: async (record: Parameters<typeof mobileState.journal.accept>[0]) => {
      if (failFirstAcceptanceWrite) { failFirstAcceptanceWrite = false; throw new Error('FIXED_ACCEPTANCE_WRITE_FAILURE') }
      await mobileState.journal.accept(record)
    } }
    adapter = new RestrictedDesktopAdapter(desktopId, realReplayPorts(ctx), registry, { clock, maxPacketBytes: 1048576, maxCachedCommands: 128, maxCommandTtlMs: 60000, maxMountedBlocks: 4 }, acceptanceFaultJournal)
    relay.attachDesktop(adapter)
    const phone = new MockPhoneClient(relay, { desktopId, deviceId, epoch: 1 }, 30000, 4)
    pump = new RealFollowPump(ctx, sessionId, relay); await pump.opened
    await phone.sync(sessionId)
    const task = { sessionId, requestId: 'phase3-request', text: 'Show the fixed replay mobile forms.' }
    const uncertain = await Promise.allSettled([phone.request('task.submit', task), phone.request('task.submit', task)])
    for (const result of uncertain) { expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason.code).toBe('unknown-outcome') }
    expect(await mobileState.journal.get(sessionId, id<'session-request-id'>(task.requestId))).toMatchObject({ state: 'submitting' })
    const earlyReceipt = await phone.request('task.receipt', { sessionId, requestId: task.requestId })
    expect(earlyReceipt).toHaveProperty('state')
    await ctx.agents.get(sessionId)!.whenIdle()
    expect(await phone.request('task.receipt', { sessionId, requestId: task.requestId })).toMatchObject({ accepted: true, state: 'accepted' })
    const receipts = await Promise.all([phone.request('task.submit', task), phone.request('task.submit', task)])
    expect(receipts[0]).toEqual(receipts[1])
    await ctx.agents.get(sessionId)!.whenIdle()
    const view = await phone.sync(sessionId)
    expect(view.events.some(event => event.type === 'assistant/message')).toBe(true)
    expect(pump.seen.some(frame => frame.type === 'assistant-stream' && frame.frame.type === 'chunk')).toBe(true)
    expect(requests).toHaveLength(1)
    await expect(phone.request('task.submit', { ...task, text: 'Conflicting request body' })).rejects.toMatchObject({ code: 'id-conflict' })
    await expect(phone.request('task.submit', { ...task, sessionId: foreignId })).rejects.toMatchObject({ code: 'scope-denied' })
    const event = ctx.sessions.get(sessionId)!.snapshotEvents().find(event => event.type === 'assistant/message')
    if (event?.type !== 'assistant/message') throw new Error('Real assistant message missing')
    const { authoredBlockId } = await import('../../../packages/experimental/rich-inline/src/shared/authored.ts')
    const scope = { sessionId, messageId: event.data.message.id, blockId: authoredBlockId(event.data.message.id, 'phone-form'), guestProtocol: 'lumina-rich/1' }
    const mounted = await phone.request('rich.mount', scope)
    if (mounted === null || typeof mounted !== 'object' || !('mountId' in mounted) || !('snapshot' in mounted)) throw new Error('Mount missing')
    const intent = { mountId: mounted.mountId, actionId: 'phase3-action', actionName: 'submit', targetActionId: null,
      expectedDataRevision: mounted.snapshot.dataRevision, values: { title: 'Final mobile input', count: '7' }, fileGrants: [],
      draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { title: 'Final mobile input', count: '7' }, dirty: ['title', 'count'] } }
    phone.setForeground(false)
    relay.detachDesktop(); relay.attachDesktop(adapter)
    phone.setForeground(true); await phone.sync(sessionId)
    const actionReceipts = await Promise.all([phone.request('rich.invoke', intent), phone.request('rich.invoke', intent)])
    expect(actionReceipts[0]).toEqual(actionReceipts[1])
    await vi.waitFor(async () => {
      expect(await phone.request('rich.status', { mountId: mounted.mountId, actionId: intent.actionId })).toMatchObject({ state: 'completed', terminal: true, values: intent.values })
    })
    await ctx.agents.get(sessionId)!.whenIdle()
    expect(requests).toHaveLength(3)
    expect(requests[1]).toContain('phase3-action'); expect(requests[1]).toContain('Final mobile input')
    const other = await phone.request('rich.mount', { ...scope, blockId: authoredBlockId(event.data.message.id, 'other-form') })
    if (other === null || typeof other !== 'object' || !('mountId' in other)) throw new Error('Second mount missing')
    expect(await phone.request('rich.invoke', { ...intent, mountId: other.mountId })).toMatchObject({ accepted: false, code: 'ACTION_ID_CONFLICT' })
    await expect(ctx.richInline.mount({ ...scope, sessionId: foreignId })).rejects.toThrow('settled assistant')
    await phone.request('rich.dispose', { mountId: mounted.mountId })
    const reopened = await phone.request('rich.mount', scope)
    if (reopened === null || typeof reopened !== 'object' || !('mountId' in reopened)) throw new Error('Reopen missing')
    expect(await phone.request('rich.invoke', { ...intent, mountId: reopened.mountId })).toEqual(actionReceipts[0])
    expect(requests).toHaveLength(3)
    await phone.request('task.submit', { sessionId, requestId: 'phase3-cancel', text: 'Hold the fourth fixed response until cancellation.' })
    await vi.waitFor(async () => { await expect(access(replay.readyFile)).resolves.toBeUndefined() })
    expect(await phone.request('session.cancel', { sessionId })).toEqual({ accepted: true })
    await ctx.agents.get(sessionId)!.whenIdle()
    await phone.sync(sessionId)
    replay.handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed(); ctx.llm.assertZeroRealCalls()
    expect(upload).not.toHaveBeenCalled()
    await ctx.sessionPersistence.flush()
    const cursor = phone.projection(sessionId).cursor
    await mobileState.saveCheckpoint({ desktopId, deviceId, sessionId, sessionFormatVersion: 4, lastDurableSeq: cursor })
    const uncertainTask = { sessionId, requestId: 'phase3-predispatch-crash', text: 'Never dispatch this uncertain persisted intent.' }
    await mobileState.journal.claim({ desktopId, deviceId, sessionId, requestId: id<'session-request-id'>(uncertainTask.requestId), state: 'submitting',
      fingerprint: canonical({ sessionId, requestId: uncertainTask.requestId, mode: 'queue', content: [{ type: 'text', text: uncertainTask.text }] }) })
    const sessionDirectories = await readdir(join(world, 'sessions'))
    if (sessionDirectories.length !== 1) throw new Error('Expected one isolated Session persistence directory')
    await writeFile(new URL('../evidence/phase3-session.v4.jsonl', import.meta.url), await readFile(join(world, 'sessions', sessionDirectories[0]!, sessionId, 'session.v4.jsonl')))
    for (const [source, target] of [['rich_inline.json', 'phase3-rich-ledger.json'], ['harmony_mobile_lab.json', 'phase3-mobile-journal.json']] as const) {
      await writeFile(new URL('../evidence/' + target, import.meta.url), await readFile(join(world, 'state', source)))
    }
    await writeFile(new URL('../evidence/phase3-link.json', import.meta.url), JSON.stringify({
      layer: 'real source-mode Loader/SessionController/RichInline, memory phone relay, synthetic renderer',
      sourceWorld: world, counts: ctx.llm.getOfflineReplayCounts(), modelRequests: requests.length,
      liveFrames: pump.seen.filter(frame => frame.type === 'assistant-stream').length,
      finalCursor: phone.projection(sessionId).cursor, originalSessionId: sessionId, foreignSessionModelCalls: 0,
      taskDeduplicated: true, earlyReceiptAfterAcceptanceWriteFailure: earlyReceipt, acceptanceWriteFailureReconciledWithoutPrompt: true,
      actionDeduplicatedAcrossMounts: true, crossBlockConflict: true, crossSessionRejected: true,
      canceledFourthReplay: true, uploadExtensionCalls: upload.mock.calls.length, networkListeners: 0,
      arkTsCompiled: false, arkWebQualified: false, nativeDeviceQualified: false,
    }, null, 2) + '\n')
    const beforeGuardProbe = ctx.llm.getOfflineReplayCounts()
    expect(() => ctx.llm.stream({ provider: route.provider, model: route.model, maxTokens: 16, messages: [] })).toThrow('exhausted')
    expect(() => ctx.llm.assertOfflineReplayConsumed()).toThrow()
    ctx.llm.assertZeroRealCalls(); expect(upload).not.toHaveBeenCalled()
    await writeFile(new URL('../evidence/phase3-guard.json', import.meta.url), JSON.stringify({
      beforeFifthCallProbe: beforeGuardProbe, afterFifthCallProbe: ctx.llm.getOfflineReplayCounts(),
      fifthCallRefused: true, exactCountGuardReportsRefusal: true, uploadExtensionCalls: upload.mock.calls.length,
    }, null, 2) + '\n')
    await pump.close(); pump = undefined
    await adapter.close(); adapter = undefined
    relay.close(); relay = undefined
    await mobileState.close(); await ctx.fiber.dispose()

    // Fresh service owners read the same isolated files. This is a logical restart, not an OS hard-kill test.
    const restored = await sourceComposition(world)
    let restoredAdapter: RestrictedDesktopAdapter | undefined, restoredRelay: MockOutboundRelay | undefined
    try {
      const restoredReplay = await installFourResponses(restored, world)
      const restoredState = await openMobileJournal(restored, 128, { mode: 'reopen', root: join(world, 'state') })
      expect(restoredState.checkpoint(desktopId, sessionId)?.lastDurableSeq).toBe(cursor)
      const originalPrompt = vi.spyOn(restored.sessionController, 'prompt')
      restoredAdapter = new RestrictedDesktopAdapter(desktopId, realReplayPorts(restored), registry,
        { clock, maxPacketBytes: 1048576, maxCachedCommands: 128, maxCommandTtlMs: 60000, maxMountedBlocks: 4 }, restoredState.journal)
      restoredRelay = new MockOutboundRelay('mock', registry,
        { clock, eventTtlMs: 60000, maxEventBytes: 1048576, maxEventsPerSession: 1024, maxSessions: 2 })
      restoredRelay.attachDesktop(restoredAdapter)
      const restoredPhone = new MockPhoneClient(restoredRelay, { desktopId, deviceId, epoch: 1 }, 30000, 4)
      expect(await restoredPhone.request('task.submit', task)).toEqual(receipts[0])
      expect(await restoredPhone.request('task.submit', uncertainTask)).toMatchObject({ accepted: false, state: 'unknown' })
      expect(await restoredPhone.request('task.receipt', { sessionId, requestId: uncertainTask.requestId })).toMatchObject({ accepted: false, state: 'unknown' })
      expect((await restoredPhone.sync(sessionId)).cursor).toBe(cursor)
      const restoredMount = await restoredPhone.request('rich.mount', scope)
      if (restoredMount === null || typeof restoredMount !== 'object' || !('mountId' in restoredMount)) throw new Error('Restored mount missing')
      expect(await restoredPhone.request('rich.status', { mountId: restoredMount.mountId, actionId: intent.actionId })).toMatchObject({ state: 'completed', terminal: true, values: intent.values })
      expect(await restoredPhone.request('rich.invoke', { ...intent, mountId: restoredMount.mountId })).toEqual(actionReceipts[0])
      expect(originalPrompt).not.toHaveBeenCalled()
      expect(restored.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0)
      restored.llm.assertZeroRealCalls()
      // Read-only recovery consumes no response slots; the upstream exact-count guard must report that explicitly.
      expect(() => restoredReplay.handle.assertConsumed()).toThrow()
      expect(() => restored.llm.assertOfflineReplayConsumed()).toThrow()
      await writeFile(new URL('../evidence/phase3-reopen.json', import.meta.url), JSON.stringify({
        layer: 'fresh real service contexts, persisted JSON/JSONL, logical restart; no OS process kill',
        verifiedCursor: cursor, restoredCursor: restoredPhone.projection(sessionId).cursor,
        taskPromptCallsOnRestore: originalPrompt.mock.calls.length, completedActionPreserved: true, persistedUncertainIntentNeverDispatched: true,
        counts: restored.llm.getOfflineReplayCounts(), readOnlyRecoveryExactCountRefusalObserved: true,
        grantSource: 'original volatile fixture registry retained by test; no persisted credential',
      }, null, 2) + '\n')
      await restoredAdapter.close(); restoredAdapter = undefined
      restoredRelay.close(); restoredRelay = undefined
      await restoredState.close()
    } finally { await restoredAdapter?.close(); restoredRelay?.close(); await restored.fiber.dispose() }
  } finally { await pump?.close(); await adapter?.close(); relay?.close(); await ctx.fiber.dispose() }
}, 20000)

/** Canonical admission durability uses actual guarded services and synthetic journals, without identities or network. */
import { it, expect, vi } from 'vitest'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { sourceComposition } from './source-composition.ts'
import { installFourResponses } from './replay-host.ts'
import { profileServicePorts, ProfileDesktopExecutor } from '../desktop-plugin/src/ports.ts'
import { openProfileJournal } from '../desktop-plugin/src/journal.ts'
import { MOBILE_LINK_PROTOCOL, MockDeviceRegistry } from '../src/link-protocol.ts'
import { deviceGrantOperations } from '../src/pairing-protocol.ts'
import { id } from '../src/protocol.ts'

it('a failed canonical barrier keeps submitting and receipt unknown; successful reconciliation persists before accepting and never prompts twice', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (!parent) throw new Error('isolated world required')
  const world = join(parent, 'durable-admission'); await mkdir(world); const ctx = await sourceComposition(world), replay = await installFourResponses(ctx, world)
  const sessionId = id<'SessionId'>('durable-admission-session'), desktopId = id<'mobile-desktop'>('durable-desktop'), deviceId = id<'mobile-device'>('durable-phone'), requestId = id<'session-request-id'>('durable-task')
  await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionPersistence.flush()
  const state = await openProfileJournal(ctx, 16, { mode: 'create', desktopId, profileId: id<'mobile-profile'>('durable-profile') }), registry = new MockDeviceRegistry('mock', Date.now)
  registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations: deviceGrantOperations, expiresAt: Date.now() + 60000, revoked: false })
  const executor = new ProfileDesktopExecutor(desktopId, profileServicePorts(ctx), registry, { clock: Date.now, maxPacketBytes: 1048576, maxCachedCommands: 16, maxCommandTtlMs: 30000, maxMountedBlocks: 4 }, state.journal), prompt = vi.spyOn(ctx.sessionController, 'prompt'), flush = vi.spyOn(ctx.sessionPersistence, 'flush').mockRejectedValue(new Error('synthetic durability failure')), accept = vi.spyOn(state.journal, 'accept')
  let command = 0
  const request = (operation: 'task.submit' | 'task.receipt') => executor.handle(JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1, commandId: 'durable-' + command++, expiresAt: Date.now() + 20000, operation, payload: { sessionId, requestId, ...(operation === 'task.submit' ? { text: 'Synthetic durability task.' } : {}) } }))
  try {
    await expect(request('task.submit')).rejects.toMatchObject({ code: 'unknown-outcome' }); await ctx.agents.get(sessionId)!.whenIdle()
    expect((await state.journal.get(sessionId, requestId))?.state).toBe('submitting'); expect(accept).not.toHaveBeenCalled()
    expect(await request('task.receipt')).toMatchObject({ accepted: false, state: 'unknown' }); expect(await request('task.submit')).toMatchObject({ accepted: false, state: 'unknown' }); expect(prompt).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled()
    flush.mockRestore(); expect(await request('task.receipt')).toMatchObject({ accepted: true, state: 'accepted' }); expect(accept).toHaveBeenCalledTimes(1)
    expect(await request('task.submit')).toMatchObject({ accepted: true }); expect(prompt).toHaveBeenCalledTimes(1); ctx.llm.assertZeroRealCalls()
  } finally { flush.mockRestore(); prompt.mockRestore(); accept.mockRestore(); await executor.close(); await state.close(); replay.handle.dispose(); await ctx.fiber.dispose() }
})

it('a concurrent receipt cannot turn a later unflushed prompt into accepted evidence', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (!parent) throw new Error('isolated world required')
  const world = join(parent, 'concurrent-receipt'); await mkdir(world); const ctx = await sourceComposition(world), replay = await installFourResponses(ctx, world), sessionId = id<'SessionId'>('concurrent-receipt-session'), requestId = id<'session-request-id'>('later-prompt')
  await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionPersistence.flush()
  const inspect = ctx.sessionController.inspect.bind(ctx.sessionController), flush = ctx.sessionPersistence.flush.bind(ctx.sessionPersistence)
  let releaseRead!: () => void, readStarted!: () => void, releaseFlush!: () => void
  const readGate = new Promise<void>(accept => { releaseRead = accept }), reading = new Promise<void>(accept => { readStarted = accept }), flushGate = new Promise<void>(accept => { releaseFlush = accept })
  const readSpy = vi.spyOn(ctx.sessionController, 'inspect').mockImplementationOnce(async (...args: Parameters<typeof inspect>) => { const captured = await inspect(...args); readStarted(); await readGate; return captured }), flushSpy = vi.spyOn(ctx.sessionPersistence, 'flush').mockImplementation(async () => { await flushGate; return flush() }), ports = profileServicePorts(ctx)
  let settled = false, submission: ReturnType<typeof ports.session.prompt> | undefined
  try {
    const receipt = ports.session.findPromptReceipt(sessionId, requestId); await reading
    submission = ports.session.prompt({ sessionId, requestId, mode: 'queue', content: [{ type: 'text', text: 'Synthetic concurrent admission.' }] }, new AbortController().signal).then(result => { settled = true; return result })
    await vi.waitFor(() => expect(flushSpy).toHaveBeenCalledTimes(1)); releaseRead(); expect(await receipt).toBe('absent'); expect(settled).toBe(false)
    releaseFlush(); await submission; await ctx.agents.get(sessionId)!.whenIdle(); expect(await ports.session.findPromptReceipt(sessionId, requestId)).toBe('accepted'); ctx.llm.assertZeroRealCalls()
  } finally { releaseRead(); releaseFlush(); await submission; readSpy.mockRestore(); flushSpy.mockRestore(); replay.handle.dispose(); await ctx.fiber.dispose() }
})

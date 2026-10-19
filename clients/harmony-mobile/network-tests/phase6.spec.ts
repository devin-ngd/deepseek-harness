/** Real read-only DSH API qualification through the existing restricted BFF; all projects/images are created in this test's world. */
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { SessionId } from '@deepseek-ai/dsh-session'
import { sourceComposition } from '../integration/source-composition.ts'
import { installFourResponses, realReplayPorts, RealFollowPump } from '../integration/replay-host.ts'
import { realReadPorts } from '../integration/read-services.ts'
import { openMobileJournal } from '../integration/durable-journal.ts'
import { MobileBff, FollowJournal } from '../integration/mobile-bff.ts'
import { startLoopbackBff } from '../integration/loopback-bff.ts'
import { RestrictedDesktopAdapter } from '../src/desktop-adapter.ts'
import { RestrictedReads } from '../src/read-adapter.ts'
import { MockDeviceRegistry } from '../src/link-protocol.ts'
import { NetworkPhone } from '../src/network-phone.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { PhoneCore } from '../src/phone-core.ts'
import { PhoneLibrary } from '../src/phone-library.ts'
import { id } from '../src/protocol.ts'

it('scoped real Workspace/Session pagination and synthetic image bytes traverse actual loopback BFF without model or upload calls', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (parent === undefined) throw new Error('Owned unified launcher required')
  const world = join(parent, 'phase6-read-only'); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world)
  let carrier: Awaited<ReturnType<typeof startLoopbackBff>> | undefined, pump: RealFollowPump | undefined, adapter: RestrictedDesktopAdapter | undefined, transport: NetworkPhone | undefined
  try {
    await ctx.plugin(Gateway); await installFourResponses(ctx, world)
    const upload = vi.spyOn(ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
    const prompt = vi.spyOn(ctx.sessionController, 'prompt')
    const projects = []
    for (let index = 0; index < 3; index++) { const path = join(world, 'project-' + index); await mkdir(path); projects.push(await ctx.workspaceRegistry.create(path, 'Synthetic project ' + index)) }
    const sessions = [SessionId('read-session-0'), SessionId('read-session-1'), SessionId('read-session-2'), SessionId('read-foreign')]
    for (const [index, sessionId] of sessions.entries()) await ctx.sessionController.create({ sessionId, workspaceId: projects[index === 3 ? 2 : index % 2]!.id })
    const sessionId = sessions[0]!, session = ctx.sessions.get(sessionId)!
    // Same fixed 1x1 PNG bytes used by the maintained attachment-local tests; no photo or raster generator is involved.
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC', 'base64')
    const ref = await ctx.attachments.saveImage({ data: bytes, mediaType: 'image/png', name: 'synthetic.png' })
    for (let index = 0; index < 100; index++) session.append('user/message', { id: id<'MessageId'>('read-history-' + index), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic ' + index }, ...(index === 99 ? [{ type: 'image' as const, attachment: ref }] : [])] }, { surfaceOp: 'append' })
    await ctx.sessionPersistence.flush()
    const desktopId = id<'mobile-desktop'>('phase6-desktop'), deviceId = id<'mobile-device'>('phase6-phone'), clock = () => Date.now(), registry = new MockDeviceRegistry('mock', clock)
    registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: sessions.slice(0, 3), operations: ['session.sync', 'read.projects', 'read.sessions', 'read.history', 'image.open', 'image.read', 'image.close'], expiresAt: clock() + 60000, revoked: false })
    const limits = { maxSourceItems: 500, maxPageItems: 4, maxSnapshots: 8, maxSnapshotBytes: 1048576, snapshotTtlMs: 60000, maxHistoryEvents: 256, maxImageBytes: 65536, maxImageDimension: 512, maxImagePixels: 262144, maxImageHandles: 2, imageTtlMs: 60000, maxImageChunkBytes: 4096, maxInFlight: 4 }
    const reads = new RestrictedReads(realReadPorts(ctx), registry, limits, clock, randomUUID), state = await openMobileJournal(ctx, 128, { mode: 'create', root: join(world, 'state') })
    adapter = new RestrictedDesktopAdapter(desktopId, realReplayPorts(ctx), registry, { clock, maxCommandTtlMs: 30000, maxPacketBytes: 1048576, maxCachedCommands: 128, maxMountedBlocks: 2 }, state.journal, reads)
    const journal = new FollowJournal(sessionId, { maxFrames: 1024, ttlMs: 60000, clock, maxBytes: 4194304, maxFrameBytes: 1048576 })
    pump = new RealFollowPump(ctx, sessionId, journal); await pump.opened
    await ctx.plugin(MobileBff, { adapter, registry, journal, desktopId, deviceId, instance: id<'mobile-wire-instance'>(randomUUID()) })
    carrier = await startLoopbackBff(ctx, { enabled: true, host: '127.0.0.1', port: 0, maxRequestBytes: 1048576, maxFrameBytes: 1048576, writeHighWaterMark: 1, drainTimeoutMs: 1000, requestTimeoutMs: 15000, followSegmentMs: 5000, maxConnections: 8, maxActiveRequests: 4 }); if (!carrier.enabled) throw new Error('Disabled fixture')
    transport = new NetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl: carrier.url, maxFrameBytes: 1048576, maxReadChunkBytes: 1048576, requestTimeoutMs: 15000, maxInFlight: 4 }, fetch)
    const model = new SemanticPhone({ desktopId, deviceId, sessionId }, { maxBytes: 1048576, maxEvents: 512, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 256)
    let sequence = 0; const core = new PhoneCore(transport, model, { follow: { mode: 'once' }, clock, grantEpoch: 1, ttlMs: 30000, maxMounts: 2, maxIntents: 16, nextCommandId: () => id<'mobile-command'>('read-' + ++sequence) }), library = new PhoneLibrary(core, model, limits, clock, 1, 60000)
    const life = new AbortController(), follow = core.follow(life.signal)[Symbol.asyncIterator](); await follow.next(); life.abort(); await expect(follow.return?.()).resolves.toEqual({ done: true, value: undefined })
    const initialMessages = model.view.messages.length; expect(initialMessages).toBeLessThan(100)
    const first = await library.page('projects', 'projects', null, 1), second = await library.page('projects', 'projects', first.next, 1)
    expect(second.items).toHaveLength(2); expect(JSON.stringify(second)).not.toMatch(/[A-Za-z]:[\\/]/)
    const list = await library.page('sessions', projects[0]!.id, null, 1); expect(list.next).not.toBeNull(); const completed = await library.page('sessions', projects[0]!.id, list.next, 1)
    expect(completed.items).toHaveLength(2); expect(JSON.stringify(completed)).not.toContain('read-foreign')
    const cursor = model.view.cursor, resume = model.resume
    while (model.view.hasMore) await library.history(4)
    expect(model.view.messages).toHaveLength(100); expect(model.view.cursor).toBe(cursor); expect(model.resume).toEqual(resume)
    const message = model.view.messages.at(-1)!, image = await library.image(message, ref.attachmentId)
    expect(image.state).toBe('ready'); if (image.state !== 'ready') throw new Error('Image fixture failed')
    expect(Buffer.from(image.dataUrl.split(',')[1]!, 'base64')).toEqual(Buffer.from((await ctx.attachments.readImage(ref)).data)); expect([image.width, image.height]).toEqual([1, 1]); expect(reads.counts.handles).toBe(0)
    await expect(core.request('read.history', { sessionId: sessions[3], throughSeq: cursor, beforeSeq: 10, maxMessages: 4 })).rejects.toThrow('scope-denied')
    expect(prompt).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); ctx.llm.assertZeroRealCalls(); expect(ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0)
    await core.close(); await carrier.close(); await pump.close(); pump = undefined; await adapter.close(); adapter = undefined; journal.close(); await state.close()
    expect(reads.counts).toEqual({ snapshots: 0, handles: 0, active: 0 })
    await writeFile(new URL('../evidence/phase6-network.json', import.meta.url), JSON.stringify({ layer: 'actual source services and Gateway over ephemeral loopback; same-process phone read consumer', passed: true, projects: second.items.length, projectSessions: completed.items.length, initialMessages, historyMessages: model.view.messages.length, stableCursor: cursor, image: { bytes: ref.bytes, width: image.width, height: image.height }, modelRequests: 0, realModelCalls: 0, uploadCalls: 0, replayBudget: 4, readOnlyContextDoesNotConsumeReplay: true, listenerClosed: true, metrics: carrier.metrics, resourceCounts: reads.counts, arkTsCompiled: false, arkWebQualified: false, deviceQualified: false }, null, 2) + '\n')
  } finally { await transport?.close(); if (carrier?.enabled) await carrier.close(); await pump?.close(); await adapter?.close(); await ctx.fiber.dispose() }
}, 30000)

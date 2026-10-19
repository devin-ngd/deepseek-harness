/** Two real OS test processes connected only on ephemeral loopback; no product application or WAN service is launched. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { SessionId } from '@deepseek-ai/dsh-session'
import { sourceComposition } from '../integration/source-composition.ts'
import { installFourResponses, realReplayPorts, RealFollowPump } from '../integration/replay-host.ts'
import { FollowJournal, MobileBff } from '../integration/mobile-bff.ts'
import { startLoopbackBff } from '../integration/loopback-bff.ts'
import { openMobileJournal } from '../integration/durable-journal.ts'
import { MockDeviceRegistry } from '../src/link-protocol.ts'
import { RestrictedDesktopAdapter } from '../src/desktop-adapter.ts'
import { id } from '../src/protocol.ts'
import { jsonPayload } from '../src/wire.ts'

it('separate phone process connects to actual BFF Gateway and Session/Rich services with four fixed responses', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated network launcher required')
  const world = join(parent, 'actual-bff'); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world)
  let adapter: RestrictedDesktopAdapter | undefined, pump: RealFollowPump | undefined
  let carrier: Awaited<ReturnType<typeof startLoopbackBff>> | undefined
  let journal: FollowJournal | undefined
  try {
    await ctx.plugin(Gateway)
    const replay = await installFourResponses(ctx, world)
    const upload = vi.spyOn(ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
    const requests: string[] = []; ctx.on('llm-replay/request', request => { requests.push(JSON.stringify(request.messages)) })
    const sessionId = SessionId('phase4-session'), foreignId = SessionId('phase4-foreign')
    await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionController.create({ sessionId: foreignId, cwd: world })
    const desktopId = id<'mobile-desktop'>('phase4-desktop'), deviceId = id<'mobile-device'>('phase4-phone'), clock = () => Date.now()
    const registry = new MockDeviceRegistry('mock', clock)
    registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations: ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose', 'approval.list'], expiresAt: clock() + 60000, revoked: false })
    const state = await openMobileJournal(ctx, 256, { mode: 'create', root: join(world, 'state') })
    adapter = new RestrictedDesktopAdapter(desktopId, realReplayPorts(ctx), registry, { clock, maxPacketBytes: 1048576, maxCachedCommands: 256, maxCommandTtlMs: 60000, maxMountedBlocks: 4 }, state.journal)
    journal = new FollowJournal(sessionId, { clock, ttlMs: 60000, maxFrames: 256, maxBytes: 4194304, maxFrameBytes: 1048576 })
    pump = new RealFollowPump(ctx, sessionId, journal); await pump.opened
    const instance = id<'mobile-wire-instance'>('phase4-' + randomUUID())
    await ctx.plugin(MobileBff, { adapter, registry, journal, desktopId, deviceId, instance })
    expect(await startLoopbackBff(ctx, { enabled: false })).toEqual({ enabled: false })
    carrier = await startLoopbackBff(ctx, { enabled: true, host: '127.0.0.1', port: 0, maxRequestBytes: 1048576, maxFrameBytes: 1048576,
      writeHighWaterMark: 1, drainTimeoutMs: 1000, requestTimeoutMs: 15000, followSegmentMs: 5000, maxConnections: 16, maxActiveRequests: 4 })
    if (!carrier.enabled) throw new Error('Explicit fixture carrier did not activate')
    const phoneReport = join(world, 'phone-report.json')
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', fileURLToPath(new URL('./phone-child.test.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec,
        TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_HARMONY_PHONE_URL: carrier.url, DSH_HARMONY_PHONE_REPORT: phoneReport, DSH_HARMONY_CANCEL_READY: replay.readyFile },
    })
    let stdout = '', stderr = '', timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 20000)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); if (stdout.length > 65536) child.kill() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); if (stderr.length > 65536) child.kill() })
    const exited = await new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }))
    }).finally(() => clearTimeout(timer))
    await writeFile(new URL('../evidence/phase4-phone-output.txt', import.meta.url), (stdout + stderr).trimEnd() + '\n')
    expect({ ...exited, timedOut }, stdout + stderr).toEqual({ code: 0, signal: null, timedOut: false })
    const phone = jsonPayload(JSON.parse(await readFile(phoneReport, 'utf8')))
    if (phone === null || typeof phone !== 'object' || Array.isArray(phone) || typeof phone.processId !== 'number') throw new Error('Invalid phone process report')
    expect(phone.processId).not.toBe(process.pid)
    expect(phone.processId).toBe(child.pid)
    await ctx.agents.get(sessionId)!.whenIdle()
    replay.handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed(); ctx.llm.assertZeroRealCalls()
    expect(upload).not.toHaveBeenCalled(); expect(requests).toHaveLength(4)
    expect(requests[1]).toContain('Final mobile input')
    expect(carrier.metrics.drainWaits).toBeGreaterThan(0)
    await carrier.close(); await pump.close(); pump = undefined
    await adapter.close(); adapter = undefined; journal.close(); await state.close(); await ctx.sessionPersistence.flush()
    expect(carrier.metrics.active).toBe(0)
    await writeFile(new URL('../evidence/phase4-network.json', import.meta.url), JSON.stringify({
      layer: 'actual Gateway/SessionController/RichInline in Vitest process; distinct Node phone test process; ephemeral loopback HTTP/NDJSON',
      serverProcessId: process.pid, phone, listener: carrier.url, listenerClosed: true, metrics: carrier.metrics, counts: ctx.llm.getOfflineReplayCounts(),
      uploadExtensionCalls: upload.mock.calls.length, modelRequests: requests.length, foreignSessionModelCalls: 0,
      generation: instance, sourceWorld: world, rendererExecuted: false, sdkProcessQualified: false, supportedDshProfileQualified: false,
      arkTsCompiled: false, arkWebQualified: false, wanQualified: false, nativeDeviceQualified: false,
    }, null, 2) + '\n')
  } finally { if (carrier?.enabled) await carrier.close(); await pump?.close(); await adapter?.close(); journal?.close(); await ctx.fiber.dispose() }
}, 25000)

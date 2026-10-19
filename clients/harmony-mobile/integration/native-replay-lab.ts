/** Actual DSH service owners for the phase11 native byte consumer; all state is test-owned and dispatch remains replay-only. */
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { SessionId } from '@deepseek-ai/dsh-session'
import { sourceComposition } from './source-composition.ts'
import { installFourResponses, realReplayPorts, RealFollowPump } from './replay-host.ts'
import { mobilePublications } from './mobile-publication.ts'
import { openMobileJournal } from './durable-journal.ts'
import { FollowJournal, MobileBff } from './mobile-bff.ts'
import { startLoopbackBff } from './loopback-bff.ts'
import { MockDeviceRegistry } from '../src/link-protocol.ts'
import { RestrictedDesktopAdapter } from '../src/desktop-adapter.ts'
import { id } from '../src/protocol.ts'
import type { NativeFollowFaults } from './native-follow-faults.ts'
import { CommandAudit } from './command-audit.ts'
import type { CommandEpochClock } from '../src/command-clock.ts'

/** @param world - isolated writable test directory. @param mode - exclusive creation or same-state recovery. @param policy - test grant, publications and process-owned clock retained across service generations. @returns service owner, loopback BFF and awaited cleanup; it never replaces the clock on reopen. */
export async function nativeReplayLab(world: string, mode: 'create' | 'reopen', policy: { readonly port: number; readonly grantTtlMs: number; readonly followSegmentMs: number; readonly clockAuthority: CommandEpochClock; readonly publications: readonly typeof mobilePublications[number][]; readonly faults?: NativeFollowFaults }) {
  if (!Number.isSafeInteger(policy.port) || policy.port < 0 || policy.port > 65535 || !Number.isSafeInteger(policy.grantTtlMs) || policy.grantTtlMs < 1 || policy.grantTtlMs > 1800000) throw new Error('Replay lab policy invalid')
  await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world)
  let adapter: RestrictedDesktopAdapter | undefined, pump: RealFollowPump | undefined, journal: FollowJournal | undefined
  let state: Awaited<ReturnType<typeof openMobileJournal>> | undefined, carrier: Awaited<ReturnType<typeof startLoopbackBff>> | undefined
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    const failures: unknown[] = []
    for (const operation of [
      async () => { if (carrier?.enabled) await carrier.close() },
      async () => { await pump?.close() },
      async () => { await adapter?.close() },
      async () => { journal?.close() },
      async () => { await state?.close() },
      async () => { await ctx.sessionPersistence.flush() },
      async () => { await ctx.fiber.dispose() },
    ]) { try { await operation() } catch (error) { failures.push(error) } }
    if (failures.length) throw new AggregateError(failures, 'Phase11 service cleanup failed')
  }
  try {
    await ctx.plugin(Gateway)
    const replay = await installFourResponses(ctx, world, policy.publications)
    const sessionId = SessionId('phase11-session')
    if (mode === 'create') {
      const project = join(world, 'synthetic-project'); await mkdir(project)
      const workspace = await ctx.workspaceRegistry.create(project, 'Phase11 synthetic project')
      await ctx.sessionController.create({ sessionId, workspaceId: workspace.id })
    }
    const desktopId = id<'mobile-desktop'>('phase11-desktop'), deviceId = id<'mobile-device'>('phase11-phone')
    const clockAuthority = policy.clockAuthority, clock = () => clockAuthority.now()
    const registry = new MockDeviceRegistry('mock', clock)
    registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sessionId], operations: ['task.submit','task.receipt','session.cancel','session.sync','rich.mount','rich.saveDraft','rich.invoke','rich.snapshot','rich.status','rich.dispose','approval.list'], expiresAt: clock()+policy.grantTtlMs, revoked:false })
    state = await openMobileJournal(ctx,256,{mode,root:join(world,'state')})
    adapter = new RestrictedDesktopAdapter(desktopId,realReplayPorts(ctx),registry,{clock,maxPacketBytes:1048576,maxCachedCommands:256,maxCommandTtlMs:60000,maxMountedBlocks:4},state.journal)
    journal = new FollowJournal(sessionId,{clock,ttlMs:60000,maxFrames:1024,maxBytes:8388608,maxFrameBytes:1048576})
    pump = new RealFollowPump(ctx,sessionId,journal); await pump.opened
    const instance = id<'mobile-wire-instance'>('phase11-'+randomUUID())
    const audit = new CommandAudit(2048, 'desktop monotonic epoch')
    await ctx.plugin(MobileBff,{adapter,registry,journal,desktopId,deviceId,instance,audit})
    carrier = await startLoopbackBff(ctx,{enabled:true,host:'127.0.0.1',port:policy.port,maxRequestBytes:1048576,maxFrameBytes:1048576,writeHighWaterMark:1,drainTimeoutMs:1000,requestTimeoutMs:60000,followSegmentMs:policy.followSegmentMs,maxConnections:16,maxActiveRequests:4},policy.faults,audit)
    if (!carrier.enabled) throw new Error('Explicit isolated carrier required')
    return {ctx,replay,carrier,sessionId,instance,pump,audit,clockAuthority,saveCheckpoint:state.saveCheckpoint,close}
  } catch (error) {
    try { await close() } catch (cleanupError) { throw new AggregateError([error,cleanupError],'Phase11 activation and cleanup failed') }
    throw error
  }
}

/** Default-disabled private profile bundle; exports only authenticated metadata/request/follow and opens no network listener. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { PeerScope, InvocationDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-typert-registry'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { ProfilePeerAdmission } from './admission.ts'
import { profileServicePorts, ProfileDesktopExecutor } from './ports.ts'
import { openProfileJournal } from './journal.ts'
import { MobileBffCore, FollowJournal } from '../../integration/mobile-bff.ts'
import { parseCommand, text, LinkError, MOBILE_LINK_PROTOCOL } from '../../src/link-protocol.ts'
import type { MobileOperation, LinkConfig, DeviceId } from '../../src/link-protocol.ts'
import { jsonPayload, parseResume, parseWireItem } from '../../src/wire.ts'
import type { WireItem } from '../../src/wire.ts'
import { profileRpcCodec, PROFILE_RPC_CODEC } from '../../src/profile-rpc-codec.ts'
import type { ProfileRpcArgument } from '../../src/profile-rpc-codec.ts'
import { id } from '../../src/protocol.ts'
import type { SessionId, DesktopId } from '../../src/protocol.ts'
import type { JsonValue } from '../../src/upstream.ts'
import type { MobileProfileId } from '../../src/profile-capabilities.ts'
import type {} from './relay-lifecycle.ts'
import type {} from '@deepseek-ai/dsh-workspace'

/** Installable private bundle name and its own independent version. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile'
/** Profile bundle revision; matching this is not proof of an installed desktop's service compatibility. */
export const version = '0.0.0-normal-controls.1'
/** Deployment policy; defaults are resolved by this Config before any activation. */
export interface Options {
  readonly enabled?: boolean; readonly desktopId?: string; readonly profileId?: string
  readonly sessionId?: string
  readonly relayEnabled?: boolean
  readonly journalMode?: 'create' | 'reopen'
  readonly maxPacketBytes?: number; readonly maxEnvelopeBytes?: number; readonly commandTtlMs?: number; readonly maxCachedCommands?: number
  readonly maxMountedBlocks?: number; readonly maxAdmissionRecords?: number; readonly followTtlMs?: number; readonly maxFollowFrames?: number; readonly maxFollowBytes?: number; readonly maxSessions?: number; readonly maxPeers?: number
}
/** Explicit resolved activation spec. */
export interface Spec {
  readonly enabled: boolean; readonly desktopId: DesktopId | null; readonly profileId: MobileProfileId | null
  readonly sessionId: SessionId | null
  readonly relayEnabled: boolean
  readonly journalMode: 'create' | 'reopen'
  readonly limits: LinkConfig; readonly maxEnvelopeBytes: number; readonly maxAdmissionRecords: number
  readonly followTtlMs: number; readonly maxFollowFrames: number; readonly maxFollowBytes: number; readonly maxSessions: number; readonly maxPeers: number
}
/** Validated defaults; no field grants access, selects a model or opens a transport. */
export const Config = z.object({ enabled: z.boolean().default(false), relayEnabled: z.boolean().default(false), desktopId: z.string(), profileId: z.string(), sessionId: z.string().min(1).max(256),
  journalMode: z.union(['create', 'reopen']).default('reopen'),
  maxPacketBytes: z.number().min(1).max(1048576).default(1048576), maxEnvelopeBytes: z.number().min(1).default(2097152), commandTtlMs: z.number().min(1).default(60000),
  maxCachedCommands: z.number().min(1).default(256), maxMountedBlocks: z.number().min(1).default(8), maxAdmissionRecords: z.number().min(1).default(1024),
  followTtlMs: z.number().min(1).default(60000), maxFollowFrames: z.number().min(1).default(1024), maxFollowBytes: z.number().min(1).default(4194304), maxSessions: z.number().min(1).default(16), maxPeers: z.number().min(1).default(16) })
/** @param request - parser/config input. @param clock - explicit host clock. @returns complete validated spec; enabled requests require both owner identities, and optional sessionId restricts the original grant. */
export function resolveOptions(request: Options, clock: () => number): Spec {
  const value = Config(request)
  for (const field of ['maxPacketBytes', 'maxEnvelopeBytes', 'commandTtlMs', 'maxCachedCommands', 'maxMountedBlocks', 'maxAdmissionRecords', 'followTtlMs', 'maxFollowFrames', 'maxFollowBytes', 'maxSessions', 'maxPeers'] as const) if (!Number.isSafeInteger(value[field])) throw new LinkError('invalid-packet')
  if (value.enabled && (value.desktopId === undefined || value.profileId === undefined)) throw new LinkError('invalid-packet')
  return { enabled: value.enabled, relayEnabled: value.relayEnabled, journalMode: value.journalMode, desktopId: value.desktopId === undefined ? null : id<'mobile-desktop'>(value.desktopId), profileId: value.profileId === undefined ? null : id<'mobile-profile'>(value.profileId),
    sessionId: value.sessionId === undefined ? null : id<'SessionId'>(value.sessionId),
    limits: { clock, maxPacketBytes: value.maxPacketBytes, maxCommandTtlMs: value.commandTtlMs, maxCachedCommands: value.maxCachedCommands, maxMountedBlocks: value.maxMountedBlocks },
    maxEnvelopeBytes: value.maxEnvelopeBytes, maxAdmissionRecords: value.maxAdmissionRecords, followTtlMs: value.followTtlMs, maxFollowFrames: value.maxFollowFrames, maxFollowBytes: value.maxFollowBytes, maxSessions: value.maxSessions, maxPeers: value.maxPeers }
}
const operations: readonly MobileOperation[] = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose']
interface Runtime { readonly deviceId: DeviceId; readonly sessionId: SessionId; readonly executor: ProfileDesktopExecutor; readonly authorizer: ReturnType<ProfilePeerAdmission['bind']>; readonly journal: FollowJournal; readonly core: MobileBffCore; readonly controller: AbortController; readonly pump: Promise<void>; readonly ready: Promise<void>; readonly outcome: { failure?: unknown } }

/** Same-profile Remote service; each request uses ctx.invocation.peer and no caller-provided peer/cookie can replace it. */
export class HarmonyDesktop extends TypertRemoteService {
  private readonly admission: ProfilePeerAdmission
  private readonly peers = new Map<PeerScope, Map<SessionId, Runtime>>()
  private readonly peerExecutors = new Map<PeerScope, ProfileDesktopExecutor>()
  private readonly generation = id<'mobile-wire-instance'>('profile-' + randomUUID())
  private closed = false
  private shuttingDown: Promise<void> | null = null
  private readonly stopRevoke: () => void
  /** @param ctx - enabled existing desktop profile. @param spec - validated explicit policy. @param state - existing StorageDomain intent writer. */
  constructor(ctx: Context, private readonly spec: Spec, private readonly state: Awaited<ReturnType<typeof openProfileJournal>>) {
    super(ctx, 'harmonyDesktop', { namespace: 'harmonyDesktop' })
    if (spec.desktopId === null || spec.profileId === null) throw new LinkError('invalid-packet')
    this.admission = new ProfilePeerAdmission(ctx.harmonyAuthenticatedDevices, ctx.connection.browserPeer, spec.desktopId, spec.limits.clock, spec.sessionId === null ? undefined : spec.profileId)
    this.stopRevoke = ctx.effect(() => ctx.harmonyAuthenticatedDevices.onRevoke(async deviceId => {
      // oxlint-disable-next-line unicorn/no-useless-spread -- The revocation pass owns only peers present when notification begins.
      for (const [peer, sessions] of [...this.peers]) {
        const matching = [...sessions.values()].some(runtime => runtime.deviceId === deviceId)
        if (matching) await this.closePeer(peer)
      }
    }))
    ctx.effect(() => () => this.close())
    const argument = profileRpcCodec(spec.maxEnvelopeBytes).descriptor
    const json: TypertCodec = { mode: 'strict', typeSymbol: 'JsonValue', create: () => ({ parse: jsonPayload }) }
    const resume: TypertCodec = { mode: 'strict', typeSymbol: 'WireResume', create: () => ({ parse: parseResume }) }
    const frame: TypertCodec = { mode: 'strict', typeSymbol: 'WireItem', create: () => ({ parse: parseWireItem }) }
    const session: TypertCodec = { mode: 'strict', typeSymbol: 'SessionId', create: () => ({ parse: value => id<'SessionId'>(text(value)) }) }
    const sessionParameter = { name: 'sessionId', wire: 'sessionId', source: 'json' as const, codec: session }
    const descriptor = (method: string, parameters: InvocationDescriptor['parameters'], result: TypertCodec, stream: boolean): InvocationDescriptor => ({
      id: name + '/host/' + method, service: 'harmonyDesktop', namespace: 'harmonyDesktop', method, invocation: { kind: 'direct' }, parameters, result,
      ...(stream ? { mode: 'stream' as const } : {}), ...(method === 'metadata' ? {} : { cancellation: { parameter: 'signal' as const } }),
    })
    const descriptors = [descriptor('metadata', [], json, false), descriptor('request', [{ name: 'argument', wire: 'argument', source: 'json', codec: argument }, sessionParameter], json, false),
      descriptor('follow', [{ name: 'argument', wire: 'argument', source: 'json', codec: argument }, { name: 'resume', wire: 'resume', source: 'json', codec: resume }, sessionParameter], frame, true)]
    ctx.effect(() => ctx.typert.register({ package: name, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: descriptors }))
  }
  private peer(): PeerScope {
    if (this.closed) throw new LinkError('closed')
    const invocation = this.ctx.invocation
    if (invocation === undefined) throw new LinkError('scope-denied')
    this.admission.scope(invocation.peer); return invocation.peer
  }
  private selected(sessionId: SessionId): SessionId {
    if (this.spec.sessionId !== null && sessionId !== this.spec.sessionId) throw new LinkError('scope-denied')
    return sessionId
  }
  /** @param peer - verified carrier identity. @param candidate - untrusted profile wrapper. @returns authorized Session named by the command or its existing peer-owned mount; no runtime or mount is created. */
  sessionFor(peer: PeerScope, candidate: unknown): SessionId {
    const argument = profileRpcCodec(this.spec.maxEnvelopeBytes).schema.parse(candidate)
    const command = parseCommand(argument.packet, this.spec.limits), authorizer = this.admission.bind(peer)
    authorizer.authorize(command)
    if ('sessionId' in command.payload) {
      const sessionId = this.selected(id<'SessionId'>(text(command.payload.sessionId))); authorizer.authorize(command, sessionId); return sessionId
    }
    const owners = [...this.peers.get(peer)?.values() ?? []].filter(runtime => runtime.executor.ownsMount(command.payload.mountId))
    if (owners.length !== 1) throw new LinkError('stale-mount')
    const sessionId = this.selected(owners[0]!.sessionId); authorizer.authorize(command, sessionId); return sessionId
  }
  /** @returns authenticated device's allowed Session identifiers, filtered project labels and supported revisions; no desktop path or approval capability is disclosed. */
  @Remote
  metadata(): JsonValue {
    const grant = this.admission.scope(this.peer())
    const sessions = grant.sessions.filter(sessionId => this.spec.sessionId === null || sessionId === this.spec.sessionId)
    if (this.spec.sessionId !== null && sessions.length === 0) throw new LinkError('scope-denied')
    const projects = this.ctx.workspaceRegistry.list().map(workspace => ({ projectId: workspace.id, title: workspace.title, sessionIds: workspace.sessionIds.filter(sessionId => sessions.includes(sessionId)) })).filter(project => project.sessionIds.length > 0)
    const catalog = { projects, sessions: sessions.map(sessionId => ({ sessionId, projectId: projects.find(project => project.sessionIds.includes(sessionId))?.projectId ?? null, title: sessionId })) }
    return jsonPayload({ package: name, version, codec: PROFILE_RPC_CODEC, enabled: true, desktopId: grant.desktopId, profileId: this.spec.profileId,
      generation: this.generation, mode: 'desktop-profile', catalog, protocols: { command: MOBILE_LINK_PROTOCOL, wire: 'dsh-mobile-wire/1', richGuest: 'lumina-rich/1' },
      capabilities: { 'session.prompt': 'profile-ports/1', 'session.receipt': 'profile-ports/1', 'session.cancel': 'profile-ports/1', 'session.follow': 'profile-ports/1', 'rich.inline': 'profile-ports/1' }, sessions })
  }
  private async runtime(peer: PeerScope, packet: string): Promise<Runtime> {
    const command = parseCommand(packet, this.spec.limits), authorizer = this.admission.bind(peer)
    if (!operations.includes(command.operation)) throw new LinkError('read-disabled')
    authorizer.authorize(command)
    const sessionId = 'sessionId' in command.payload ? id<'SessionId'>(text(command.payload.sessionId)) : undefined
    let sessions = this.peers.get(peer)
    if (sessions === undefined) { if (this.peers.size >= this.spec.maxPeers) throw new LinkError('queue-full'); sessions = new Map(); this.peers.set(peer, sessions) }
    if (sessionId === undefined) {
      // A mount operation is tried only against this peer's own session executors.
      const owners = [...sessions.values()].filter(runtime => runtime.executor.ownsMount(command.payload.mountId))
      if (owners.length !== 1) throw new LinkError('stale-mount')
      authorizer.authorize(command, owners[0]!.sessionId); return owners[0]!
    }
    authorizer.authorize(command, sessionId)
    const existing = sessions.get(sessionId)
    if (existing !== undefined) { await existing.ready; if (existing.outcome.failure !== undefined) throw existing.outcome.failure; return existing }
    if (sessions.size >= this.spec.maxSessions) throw new LinkError('queue-full')
    if (this.spec.desktopId === null) throw new LinkError('invalid-packet')
    let executor = this.peerExecutors.get(peer)
    if (executor === undefined) { executor = new ProfileDesktopExecutor(this.spec.desktopId, profileServicePorts(this.ctx), authorizer, this.spec.limits, this.state.journal); this.peerExecutors.set(peer, executor) }
    const journal = new FollowJournal(sessionId, { clock: this.spec.limits.clock, ttlMs: this.spec.followTtlMs, maxFrames: this.spec.maxFollowFrames, maxBytes: this.spec.maxFollowBytes, maxFrameBytes: this.spec.limits.maxPacketBytes })
    const core = new MobileBffCore({ adapter: executor, registry: authorizer, journal, desktopId: command.desktopId, deviceId: command.deviceId, instance: id<'mobile-wire-instance'>('profile-peer-' + randomUUID()), mode: 'desktop-profile' })
    const controller = new AbortController(), opened = Promise.withResolvers<void>(), outcome: Runtime['outcome'] = {}
    let didOpen = false
    const pump = (async () => {
      try {
        for await (const frame of this.ctx.sessionController.follow({ address: { kind: 'session', sessionId }, assistantStream: true }, controller.signal)) {
          if (frame.type === 'snapshot') { didOpen = true; opened.resolve() } else journal.publish(sessionId, frame)
        }
        if (!controller.signal.aborted) throw new Error('harmony canonical follow ended')
      } catch (error) {
        if (!didOpen) opened.reject(error)
        if (!controller.signal.aborted) { outcome.failure = error; journal.close() }
      }
    })()
    const runtime: Runtime = { deviceId: command.deviceId, sessionId, executor, authorizer, journal, core, controller, pump, ready: opened.promise, outcome }
    sessions.set(sessionId, runtime)
    try { await opened.promise; authorizer.authorize(command, sessionId); return runtime }
    catch (error) { await this.closePeer(peer); throw error }
  }
  /** @param argument - strict versioned command argument. @param sessionId - carrier-resolved Session checked again against command ownership. @param signal - wait lifetime; it never cancels an accepted task. @returns original canonical request result. */
  @Remote({ resources: { session: (_argument: ProfileRpcArgument, sessionId: SessionId) => sessionId } })
  async request(argument: ProfileRpcArgument, sessionId: SessionId, signal: AbortSignal): Promise<JsonValue> {
    const peer = this.peer(); if (this.sessionFor(peer, argument) !== sessionId) throw new LinkError('scope-denied')
    const runtime = await this.runtime(peer, argument.packet); return runtime.core.request(argument.packet, signal)
  }
  /** @param argument - strict session.sync argument. @param resume - independent relay hint. @param sessionId - carrier-resolved Session checked against the command. @param signal - subscriber lifetime. @returns authorized profile frames; reset/reconnect never re-dispatches a task. */
  @Remote({ mode: 'stream', resources: { session: (_argument: ProfileRpcArgument, _resume: unknown, sessionId: SessionId) => sessionId } })
  async *follow(argument: ProfileRpcArgument, resume: unknown, sessionId: SessionId, signal: AbortSignal): AsyncIterable<WireItem> {
    const peer = this.peer(); if (this.sessionFor(peer, argument) !== sessionId) throw new LinkError('scope-denied')
    const runtime = await this.runtime(peer, argument.packet); yield* runtime.core.follow(argument.packet, resume, signal)
  }
  private async closePeer(peer: PeerScope): Promise<void> {
    const sessions = this.peers.get(peer); if (sessions === undefined) return
    for (const runtime of sessions.values()) { runtime.controller.abort(); runtime.journal.close() }
    const results = await Promise.allSettled([...sessions.values()].map(runtime => runtime.pump).concat(this.peerExecutors.get(peer)?.close() ?? []))
    const failure = results.find(result => result.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason
    this.peers.delete(peer)
    this.peerExecutors.delete(peer)
  }
  /** Close listeners/followers/executors before the storage writer; accepted desktop work stays with its original Agent. */
  close(): Promise<void> {
    this.closed = true; this.stopRevoke()
    if (this.shuttingDown !== null) return this.shuttingDown
    // oxlint-disable-next-line unicorn/no-useless-spread -- Teardown snapshots peer ownership before awaiting disposers.
    const attempt = (async () => { for (const peer of [...this.peers.keys()]) await this.closePeer(peer); await this.state.close() })()
    this.shuttingDown = attempt
    void attempt.catch(error => { void error; this.shuttingDown = null })
    return attempt
  }
}
declare module '@deepseek-ai/cordis' { interface Context { harmonyDesktop: HarmonyDesktop } }
/** @param ctx - existing desktop profile owner. @param request - optional deployment configuration. @returns after explicit enabled composition; default disabled performs no service/storage/descriptor registration. */
export async function apply(ctx: Context, request: Options = {}): Promise<void> {
  const spec = resolveOptions(request, Date.now)
  if (!spec.enabled) return
  if (spec.relayEnabled && ctx.get('harmonyRelayLifecycle') === undefined) throw new Error('harmony activation requires service: harmonyRelayLifecycle')
  const required = ['connection', 'remoteAccess', 'typert', 'typertGateway', 'sessionController', 'sessionPersistence', 'richInline', 'agents', 'workspaceRegistry', 'storageDomain', 'harmonyAuthenticatedDevices'] as const
  for (const key of required) if (ctx.get(key) === undefined) throw new Error('harmony activation requires service: ' + key)
  await ctx.inject([...required], async inner => {
    if (spec.desktopId === null || spec.profileId === null) throw new LinkError('invalid-packet')
    if (spec.sessionId !== null) await inner.sessionController.inspect(spec.sessionId)
    const state = await openProfileJournal(inner, spec.maxAdmissionRecords, { mode: spec.journalMode, desktopId: spec.desktopId, profileId: spec.profileId })
    try { new HarmonyDesktop(inner, spec, state); if (spec.relayEnabled) { const stop = await inner.harmonyRelayLifecycle.mount(inner); inner.effect(() => stop) } } catch (error) { await state.close(); throw error }
  })
}

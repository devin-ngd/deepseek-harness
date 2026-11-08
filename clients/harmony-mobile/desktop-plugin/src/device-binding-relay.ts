/** Device-binding encrypted carrier over the existing relay/control implementation; no public listener or model is owned here. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PairedRelayEndpoint, validatePairedRelayPolicy, type PairedRelayPolicy, type PairedRelayPorts } from '../../src/paired-relay.ts'
import type { EndpointRelayTrust } from '../../src/relay-control-client.ts'
import type { EncryptedRelayConnection } from '../../integration/e2e-socket.ts'
import type { DeviceTransportBinding } from '../../integration/device-auth.ts'
import type { LinkConfig } from '../../src/link-protocol.ts'
import { fields } from '../../src/link-protocol.ts'
import { jsonPayload } from '../../src/wire.ts'
import type { JsonValue } from '../../src/upstream.ts'
import { carrierRequest } from '../../src/device-carrier-protocol.ts'
import { deviceConnectionTicketSchema, deviceRelayPairId, type DeviceBinding, type DeviceConnectionTicket } from '../../src/device-binding-protocol.ts'
import { profileRpcCodec } from '../../src/profile-rpc-codec.ts'
import { DeviceBoundProfileChannel, type DeviceBindingProfileProvider } from './device-binding-profile.ts'
import type { DeviceBindingOwner } from './device-binding.ts'
import type { DeviceSessionRoute } from '../../src/mobile-device-product.ts'
import type { DesktopRelayLifecycle } from './relay-lifecycle.ts'
import { verifyDeviceRoute, type DeviceRoute } from '../../src/device-route-protocol.ts'
import { nodeE2EPrimitives } from '../../integration/p256-channel.ts'
import { deviceCommandStep } from './device-command-step.ts'
import { SessionWindowTooLarge } from './session-window.ts'
import { WorkspaceError } from './workspace-channel.ts'
import type { WorkspacePageChunkTrace, WorkspaceWireHost, WorkspaceWireTrace } from './workspace-wire.ts'
import { isWorkspaceSessionPage } from './workspace-page-diagnostic.ts'
import { workspaceRequestSchema, type WorkspaceRequest } from '../../src/workspace-protocol.ts'
import { workspaceDiagnosticFailure, workspaceDiagnosticOperation } from '../../src/workspace-diagnostic.ts'

/** A separate desktop-local grant provider; old device registrations never create this capability. */
export interface DeviceWorkspaceProvider {
  open(transport: DeviceTransportBinding, ticket: DeviceConnectionTicket): Promise<WorkspaceWireHost>
}

/** Authenticated connection and the earliest deadline of its room and ticket. */
export interface WorkspaceGrantLease { readonly transport: DeviceTransportBinding; readonly expiresAt: number }

/** Local routing lease and original crypto ports. `traceWorkspaceRequests` enables content-free timing on Host stdout. */
export type DeviceBindingRelayPlan = { readonly desktopId: string; isRouteCurrent(): Promise<boolean>; readonly trust: EndpointRelayTrust; readonly policy: PairedRelayPolicy; readonly limits: LinkConfig; readonly workspace?: DeviceWorkspaceProvider; readonly traceWorkspaceRequests?: boolean; openPorts(): PairedRelayPorts } & ({ readonly route: DeviceRoute; readonly paired?: never } | { readonly paired: DeviceBinding; readonly route?: never })
const routeSchema = z.object({ desktopId: z.string().min(1).max(256), profileId: z.literal('desktop'), sessionId: z.string().min(1).max(256) }).strict()
type WorkspaceStage = 'received' | 'result-ready' | 'sending' | 'socket-submitted'
interface WorkspaceTrace { readonly seq: number; readonly started: number; operation: string; stage: WorkspaceStage }
interface DeviceReply {
  readonly value: JsonValue
  assertCurrent?(): void
}
/** Versioned device carrier installs only in an already enabled desktop profile. */
export class DeviceBindingDesktopRelay implements DesktopRelayLifecycle {
  private ended: 'closed' | 'failed' | undefined
  private grantLease: WorkspaceGrantLease | undefined
  /** @returns actual terminal channel state, independently of the mounted plugin lifetime. */
  get terminalState(): 'closed' | 'failed' | undefined { return this.ended }
  /** @returns the verified connection's workspace deadline, if that connection is current. */
  get workspaceLease(): WorkspaceGrantLease | undefined {
    const lease = this.grantLease
    return lease !== undefined && !lease.transport.signal.aborted && lease.expiresAt > Date.now() ? lease : undefined
  }
  /** @param owner - original persistent registration owner. @param provider - verified non-operator peer factory. @param plan - locally approved existing relay route and budgets. */
  constructor(private readonly owner: DeviceBindingOwner, private readonly provider: DeviceBindingProfileProvider, private readonly plan: DeviceBindingRelayPlan) {}
  /** @param ctx - same desktop profile's canonical executor. @returns awaited resource cleanup; persistent binding survives disconnect, while ticket leases are retired. */
  async mount(ctx: Context): Promise<() => Promise<void>> {
    if (ctx.get('profileContext')?.name !== 'desktop' || this.plan.trust.role !== 'desktop') throw new Error('device relay profile denied')
    validatePairedRelayPolicy(this.plan.policy)
    const route = this.plan.route === undefined ? undefined : await verifyDeviceRoute(this.plan.route, nodeE2EPrimitives, undefined, Date.now())
    const registration = this.plan.route === undefined ? this.plan.paired : this.plan.route.offer.binding
    const expiresAt = this.plan.trust.expiresAt
    const context = route === undefined ? undefined : { routeId: route.offer.routeId, routeEpoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt }
    if (registration.revoked || this.plan.desktopId !== registration.desktopId || this.plan.trust.pairId !== (route === undefined ? deviceRelayPairId(registration) : route.offer.routeId) || this.plan.trust.epoch !== (route?.offer.routeEpoch ?? registration.epoch) || route !== undefined && expiresAt !== route.offer.expiresAt || this.plan.trust.audience !== registration.audience || this.plan.trust.credentialId !== registration.desktopCredentialId || !await this.plan.isRouteCurrent()) throw new Error('device relay saved pairing denied')
    const ports = this.plan.openPorts(), lifetime = new AbortController(), work = new Map<string, { controller: AbortController; done: Promise<void> }>(), pending = new Set<Promise<void>>()
    let endpoint: PairedRelayEndpoint | undefined, connection: EncryptedRelayConnection | undefined, binding: DeviceTransportBinding | undefined, channel: DeviceBoundProfileChannel | undefined, proofPending = false, closing: Promise<void> | undefined, failed = false, stopRoute = () => {}
    let ticket: DeviceConnectionTicket | undefined
    let roomExpiresAt = 0
    let workspace: Promise<WorkspaceWireHost> | undefined
    let workspaceSequence = 0
    const logTrace = (format: string, ...fields: (string | number)[]) => {
      try { console.info('DSH_WORKSPACE_TRACE at=%s ' + format, new Date().toISOString(), ...fields) }
      catch (error) { void error; console.warn('DSH_WORKSPACE_TRACE_LOG_FAILURE') }
    }
    const closeWorkspace = async () => {
      const current = workspace; workspace = undefined
      if (current !== undefined) {
        const result = await Promise.allSettled([current])
        const opened = result[0]
        if (opened?.status === 'fulfilled') await opened.value.close()
      }
    }
    const assertRoute = async () => { if (lifetime.signal.aborted || expiresAt <= Date.now() || !await this.plan.isRouteCurrent()) throw new Error('device route retired') }
    const track = (task: Promise<void>) => { pending.add(task); void task.catch(error => { void error; failed = true; endpoint?.close() }).finally(() => pending.delete(task)) }
    const close = () => {
      if (closing !== undefined) return closing
      stopRoute()
      for (const action of [() => lifetime.abort(), ...[...work.values()].map(item => () => item.controller.abort()), () => endpoint?.close(), () => ports.control.terminate()]) { try { action() } catch (error) { void error; failed = true } }
      closing = (async () => { const results = await Promise.allSettled([...pending, ...[...work.values()].map(item => item.done), closeWorkspace(), Promise.resolve().then(() => channel?.close()), Promise.resolve().then(() => endpoint?.settled())]); if (failed || results.some(result => result.status === 'rejected')) throw new Error('device relay cleanup failed') })()
      return closing
    }
    const routeTimer = setTimeout(() => { void close().catch(error => { void error; failed = true }) }, expiresAt - Date.now()); stopRoute = () => clearTimeout(routeTimer)
    const argument = (value: unknown) => profileRpcCodec(this.plan.limits.maxPacketBytes).schema.parse(value)
    const request = async (candidate: unknown, signal: AbortSignal,
      onWorkspace?: (argument: WorkspaceRequest) => WorkspaceWireTrace | undefined): Promise<DeviceReply> => {
      const data = candidate !== null && typeof candidate === 'object' && 'method' in candidate ? candidate : null
      if (data === null || channel === undefined || binding === undefined) throw new Error('device carrier unavailable')
      if (data.method === 'metadata') {
        const value = fields(candidate, ['method', 'argument']); if (value.argument !== null) throw new Error('device metadata denied')
        return { value: jsonPayload({ desktopId: this.plan.desktopId, profileId: 'desktop', sessions: await channel.catalog(), projects: await channel.projects() }) }
      }
      if (data.method === 'manage') { const value = fields(candidate, ['method', 'action']); return { value: jsonPayload(await channel.manage(value.action)) } }
      if (data.method === 'creation-options') { fields(candidate, ['method']); return { value: jsonPayload(await channel.creationOptions()) } }
      if (data.method === 'workspace') {
        const value = fields(candidate, ['method', 'argument']), original = binding, receipt = ticket
        const argument = workspaceRequestSchema.parse(value.argument)
        const trace = onWorkspace?.(argument)
        if (this.plan.workspace === undefined || receipt === undefined) throw new Error('device workspace not granted')
        const admitted = await this.owner.connectionLifetime(original, receipt)
        if (signal.aborted || admitted.aborted || binding !== original) throw new WorkspaceError('workspace-closed')
        if (argument.operation === 'close') { await closeWorkspace(); return { value: null } }
        // Concurrent resource requests share the same admitted workspace generation.
        let opening = workspace ??= this.plan.workspace.open(original, receipt)
        let selected: WorkspaceWireHost
        try { selected = await opening }
        catch (error) { if (workspace === opening) workspace = undefined; throw error }
        if (selected.closed && argument.operation === 'bootstrap' && workspace === opening) {
          opening = this.plan.workspace.open(original, receipt); workspace = opening
          try { selected = await opening }
          catch (error) { if (workspace === opening) workspace = undefined; throw error }
        }
        if (workspace !== opening || binding !== original || original.signal.aborted) { await selected.close(); throw new Error('device workspace retired') }
        const result = await selected.request(argument, signal, trace)
        await this.owner.connectionLifetime(original, receipt)
        return { value: result, assertCurrent() {
          if (workspace !== opening || binding !== original) throw new WorkspaceError('workspace-closed')
          selected.assertCurrent(signal)
        } }
      }
      if (data.method === 'select') { const value = fields(candidate, ['method', 'route']), route = routeSchema.parse(value.route); await channel.select(route); return { value: jsonPayload({ selected: route }) } }
      if (data.method === 'request') { const value = fields(candidate, ['method', 'route', 'argument']), route = routeSchema.parse(value.route); return { value: jsonPayload(await channel.request(route, argument(value.argument), signal)) } }
      throw new Error('device carrier method denied')
    }
    try {
      endpoint = new PairedRelayEndpoint(this.plan.trust, this.plan.policy, ports, async value => {
        await assertRoute()
        if (binding === undefined || binding.signal.aborted || connection === undefined) throw new Error('device carrier binding unavailable')
        const outgoing = connection, requestBinding = binding
        if (channel === undefined) {
          const packet = fields(value, ['kind', 'value']); if (packet.kind !== 'device-binding-proof' || !proofPending) throw new Error('device binding proof required')
          proofPending = false; const original = binding, authorized = deviceConnectionTicketSchema.parse(await this.owner.authenticate(original, packet.value, expiresAt)); if (authorized.desktopId !== this.plan.desktopId || authorized.bindingId !== registration.bindingId || authorized.epoch !== registration.epoch) throw new Error('device relay registration mismatch')
          if (binding !== original || original.signal.aborted || lifetime.signal.aborted) return
          ticket = authorized
          channel = new DeviceBoundProfileChannel(ctx, this.owner, this.provider, original, authorized, this.plan.limits)
          const ticketLifetime = await this.owner.connectionLifetime(original, authorized)
          ticketLifetime.addEventListener('abort', () => endpoint?.close(), { once: true })
          if (binding !== original || original.signal.aborted || ticketLifetime.aborted || lifetime.signal.aborted) return
          this.grantLease = { transport: original, expiresAt: Math.min(authorized.expiresAt, roomExpiresAt) }
          await outgoing.send(jsonPayload({ kind: 'device-binding-authorized', value: authorized })); return
        }
        const packet = carrierRequest(value)
        if (packet.kind === 'stop') { work.get(packet.id)?.controller.abort(); return }
        if (work.has(packet.id) || work.size >= this.plan.policy.maxProofs) throw new Error('device carrier request capacity')
        const controller = new AbortController(), signal = AbortSignal.any([controller.signal, lifetime.signal, binding.signal]), current = channel, item = { controller, done: Promise.resolve() }
        const trace: WorkspaceTrace | undefined = this.plan.traceWorkspaceRequests === true && packet.kind === 'request' && packet.value !== null && typeof packet.value === 'object'
          && 'method' in packet.value && packet.value.method === 'workspace'
          ? { seq: ++workspaceSequence, started: performance.now(), operation: 'invalid-request', stage: 'received' } : undefined
        let chunk: WorkspacePageChunkTrace | undefined
        const mark = (stage: WorkspaceStage) => {
          if (trace === undefined) return
          trace.stage = stage
          logTrace('Workspace RPC seq=%d operation=%s stage=%s elapsedMs=%d', trace.seq, trace.operation, stage, Math.round(performance.now() - trace.started))
          if (chunk !== undefined && (stage === 'result-ready' || stage === 'socket-submitted')) {
            logTrace('Workspace page-chunk pageSeq=%d seq=%d offset=%d bytes=%d done=%s stage=%s',
              chunk.pageSequence, trace.seq, chunk.offset, chunk.bytes, String(chunk.done), stage)
          }
        }
        const endTrace = (outcome: 'failed' | 'cancelled', failure: string) => {
          if (trace === undefined) return
          logTrace('Workspace RPC seq=%d operation=%s stage=%s elapsedMs=%d outcome=%s failure=%s', trace.seq, trace.operation, trace.stage, Math.round(performance.now() - trace.started), outcome, failure)
        }
        item.done = (async () => {
          try {
            if (packet.kind === 'request') {
              const result = await request(packet.value, signal, trace === undefined ? undefined : argument => {
                const paging = isWorkspaceSessionPage(argument)
                trace.operation = paging ? 'session-page' : workspaceDiagnosticOperation(argument)
                mark('received')
                if (paging) return { kind: 'page', sequence: trace.seq, observe: page => logTrace(
                  'Workspace page seq=%d outcome=%s status=%d bytes=%d records=%s hasMore=%s',
                  trace.seq, page.outcome, page.status, page.bytes, page.records ?? 'unavailable', String(page.hasMore ?? 'unavailable')) }
                if (argument.operation === 'read') return { kind: 'chunk', observe: diagnostic => { chunk = diagnostic } }
              })
              mark('result-ready')
              await assertRoute()
              if (!signal.aborted && current === channel) {
                result.assertCurrent?.()
                mark('sending')
                await outgoing.send(jsonPayload({ kind: 'result', id: packet.id, value: result.value }))
                mark('socket-submitted')
              } else endTrace('cancelled', 'cancelled')
            }
            else {
              const value = fields(packet.value, ['route', 'argument', 'resume']), route: DeviceSessionRoute = routeSchema.parse(value.route)
              for await (const frame of current.follow(route, argument(value.argument), value.resume, signal)) { await assertRoute(); if (signal.aborted || current !== channel) return; await outgoing.send(jsonPayload({ kind: 'frame', id: packet.id, value: frame })) }
              if (!signal.aborted) await outgoing.send({ kind: 'end', id: packet.id })
            }
          } catch (error) {
            endTrace(signal.aborted ? 'cancelled' : 'failed', error instanceof WorkspaceError ? error.code : workspaceDiagnosticFailure(error))
            if (!signal.aborted && !lifetime.signal.aborted && !requestBinding.signal.aborted) {
              const method = packet.kind === 'request' && packet.value !== null && typeof packet.value === 'object' && !Array.isArray(packet.value)
                && typeof packet.value.method === 'string' && ['metadata', 'creation-options', 'select', 'manage', 'workspace', 'request'].includes(packet.value.method) ? packet.value.method : 'follow'
              ctx.logger('harmony-device').warn('Device %s failed: %s', method, error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 240) : 'non-Error failure')
              let code = 'unknown-outcome'
              if (error instanceof SessionWindowTooLarge) code = error.code
              if (method === 'workspace' && error instanceof WorkspaceError && error.code === 'workspace-grant-required') code = error.code
              await outgoing.send({ kind: 'error', id: packet.id, code })
            }
          }
          finally { work.delete(packet.id) }
        })()
        work.set(packet.id, item); track(item.done)
      }, (next, encrypted, roomDeadline) => {
        binding = next; connection = encrypted; proofPending = true; roomExpiresAt = roomDeadline
        track((async () => { await assertRoute(); const challenge = await this.owner.challenge(next, context); if (!next.signal.aborted && binding === next) await encrypted.send(jsonPayload({ kind: 'device-binding-challenge', value: challenge })) })())
        next.signal.addEventListener('abort', () => { for (const item of work.values()) item.controller.abort(); track(closeWorkspace()); track(Promise.resolve().then(() => channel?.close())); channel = undefined; ticket = undefined; binding = undefined; connection = undefined; proofPending = false; this.grantLease = undefined }, { once: true })
      }, state => { if (this.ended !== 'failed') this.ended = state; binding = undefined; connection = undefined; proofPending = false; this.grantLease = undefined }, lifetime.signal,
      this.plan.traceWorkspaceRequests === true ? stage => logTrace('Workspace carrier encrypted stage=%s', stage) : undefined)
      return close
    } catch (error) { return deviceCommandStep('relay-mount', () => { throw error }, [close]) }
  }
}

/** Device-bound profile adapter reuses the existing Gateway/session/rich executor; no raw Host API is exported. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from './index.ts'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type {} from '@deepseek-ai/dsh-app-boot'
import { id } from '../../src/protocol.ts'
import { deviceGrantOperations } from '../../src/pairing-protocol.ts'
import { deviceConnectionTicketSchema, type DeviceConnectionTicket } from '../../src/device-binding-protocol.ts'
import { PROFILE_RPC_CODEC, type ProfileRpcArgument } from '../../src/profile-rpc-codec.ts'
import { parseCommand, LinkError, type DeviceId, type LinkConfig } from '../../src/link-protocol.ts'
import type { DeviceTransportBinding } from '../../integration/device-auth.ts'
import type { AuthenticatedDeviceProvider, AuthenticatedDeviceScope } from './admission.ts'
import { deviceRemotePolicy } from './device-policy.ts'
import { invokeProfile, followProfile } from './transport.ts'
import type { DeviceBindingOwner, DeviceBindingSessionPorts, DeviceSessionRow } from './device-binding.ts'
import type { DeviceSessionRoute } from '../../src/mobile-device-product.ts'

/** @param ctx - actual desktop profile, never an arbitrary profile path. @returns dynamic normal visible catalogue without resuming an Agent or starting a model. */
export function deviceProfileSessionPorts(ctx: Context): DeviceBindingSessionPorts {
  if (ctx.get('profileContext')?.name !== 'desktop') throw new Error('device binding requires desktop profile')
  return { list: async signal => {
    if (ctx.get('profileContext')?.name !== 'desktop') throw new Error('device binding profile changed')
    const value = await ctx.sessionController.list({}, signal)
    return value.items.map(row => ({ profileId: 'desktop' as const, sessionId: row.sessionId, title: typeof row.projections?.values.title === 'string' ? row.projections.values.title : row.sessionId, projectId: null }))
  } }
}
interface PeerBinding { readonly scope: AuthenticatedDeviceScope; readonly lifetime: AbortSignal; readonly stop: () => void }
/** Host-owned verified peers are minted only after the new owner verifies the original channel and ticket. */
export class DeviceBindingProfileProvider implements AuthenticatedDeviceProvider {
  private readonly peers = new Map<PeerScope, PeerBinding>()
  private readonly listeners = new Set<(deviceId: DeviceId) => Promise<void>>()
  private readonly pending = new Set<Promise<void>>()
  private readonly stopPolicy: () => void
  private closed = false
  /** @param ctx - original desktop Context with independent Connection/Gateway. @param clock - trusted ticket clock. */
  constructor(private readonly ctx: Context, private readonly clock: () => number) {
    if (ctx.get('profileContext')?.name !== 'desktop' || ctx.get('harmonyAuthenticatedDevices') !== undefined) throw new Error('device binding profile provider denied')
    this.stopPolicy = ctx.remoteAccess.registerPolicy('harmony-device', deviceRemotePolicy(principal => {
      for (const peer of this.peers.keys()) if (peer.principal === principal) return this.current(peer)
      return undefined
    }, clock))
    ctx.provide('harmonyAuthenticatedDevices', this); ctx.effect(() => () => this.close())
  }
  /** @param peer - exact original verified object. @returns only the selected named Session lease; dynamic catalogue access is separately revalidated by the device owner. */
  current(peer: PeerScope): AuthenticatedDeviceScope | undefined {
    const value = this.peers.get(peer)
    if (this.closed || peer.signal.aborted || value === undefined || value.lifetime.aborted || value.scope.expiresAt <= this.clock() || this.ctx.get('profileContext')?.name !== 'desktop') return undefined
    return structuredClone(value.scope)
  }
  /** @param callback - existing executor's mount/subscription cleanup. @returns caller-owned disposer. */
  onRevoke(callback: (deviceId: DeviceId) => Promise<void>): () => void { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  /** @param owner - already confirmed device registration owner. @param transport - exact encrypted channel. @param ticket - original short receipt. @param route - dynamic current Session selection. @returns a verified non-operator peer with only the original mobile service actions. */
  async open(owner: DeviceBindingOwner, transport: DeviceTransportBinding, ticket: DeviceConnectionTicket, route: DeviceSessionRoute): Promise<PeerScope> {
    if (this.closed || route.desktopId !== ticket.desktopId || route.profileId !== 'desktop') throw new LinkError('scope-denied')
    return owner.run(transport, ticket, route.profileId, route.sessionId, 'session.sync', async () => {
      const lifetime = await owner.connectionLifetime(transport, ticket)
      const peer = this.ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>(ticket.desktopId), deviceId: id<'mobile-device'>(ticket.deviceId), epoch: ticket.epoch }, interactions: 'none' })
      const expired = () => { const operation = this.retire(peer); this.pending.add(operation); void operation.catch(error => { void error; this.ctx.logger('harmony-device').error('device peer cleanup failed') }).finally(() => this.pending.delete(operation)) }
      lifetime.addEventListener('abort', expired, { once: true })
      this.peers.set(peer, { lifetime, stop: () => lifetime.removeEventListener('abort', expired), scope: { desktopId: id<'mobile-desktop'>(ticket.desktopId), profileId: id<'mobile-profile'>('desktop'), deviceId: id<'mobile-device'>(ticket.deviceId), epoch: ticket.epoch, sessions: [id<'SessionId'>(route.sessionId)], operations: [...ticket.operations], expiresAt: ticket.expiresAt, revoked: false } })
      if (lifetime.aborted || this.closed) { await this.retire(peer); throw new LinkError('revoked') }
      return peer
    })
  }
  /** @param peer - exact view-owned peer to retire before another Session is selected. @returns after old follower/rich and Peer cleanup; accepted desktop tasks are preserved. */
  async retire(peer: PeerScope): Promise<void> {
    const value = this.peers.get(peer); if (value === undefined) return
    this.peers.delete(peer); value.stop()
    const results = await Promise.allSettled([...this.listeners].map(callback => callback(value.scope.deviceId)).concat(peer.dispose()))
    if (results.some(result => result.status === 'rejected')) throw new Error('device profile peer cleanup failed')
  }
  /** Close only these verified peer lifetimes and policy; persistent binding is retained. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.stopPolicy(); const results = await Promise.allSettled([...this.peers.keys()].map(peer => this.retire(peer)).concat([...this.pending])); this.listeners.clear(); if (results.some(result => result.status === 'rejected')) throw new Error('device profile provider close failed') }
}
/** One native view's fixed-route channel into the original metadata/request/follow implementation. */
export class DeviceBoundProfileChannel {
  private peer: PeerScope | undefined
  private route: DeviceSessionRoute | undefined
  private tail: Promise<void> = Promise.resolve()
  private closed = false
  private readonly ticket: DeviceConnectionTicket
  /** @param ctx - desktop service Context. @param owner - original registration owner. @param provider - independent verified peer provider. @param transport - exact authenticated encrypted object. @param ticket - receipt from that object's proof. @param limits - original mobile envelope limits. */
  constructor(private readonly ctx: Context, private readonly owner: DeviceBindingOwner, private readonly provider: DeviceBindingProfileProvider, private readonly transport: DeviceTransportBinding, ticket: unknown, private readonly limits: LinkConfig) { this.ticket = deviceConnectionTicketSchema.parse(ticket) }
  /** @returns dynamic current visible rows; no selected Session or desktop foreground window affects them. */
  catalog(): Promise<readonly DeviceSessionRow[]> { if (this.closed) return Promise.reject(new LinkError('closed')); return this.owner.catalog(this.transport, this.ticket) }
  /** @param route - exact native desktop/profile/Session route. @returns after old Peer and rich/follow owners retire; no pairing or persistent grant is created. */
  select(route: DeviceSessionRoute): Promise<void> {
    const operation = this.tail.then(async () => {
      if (this.closed) throw new LinkError('closed')
      if (this.route?.sessionId === route.sessionId && this.route.profileId === route.profileId && this.route.desktopId === route.desktopId && this.peer !== undefined && this.provider.current(this.peer) !== undefined) return
      const old = this.peer; this.peer = undefined; this.route = undefined; if (old !== undefined) await this.provider.retire(old)
      const peer = await this.provider.open(this.owner, this.transport, this.ticket, route)
      if (this.closed) { await this.provider.retire(peer); throw new LinkError('closed') }
      this.peer = peer; this.route = { ...route }
    })
    this.tail = operation.then(() => {}, () => {}); return operation
  }
  private command(route: DeviceSessionRoute, argument: ProfileRpcArgument) {
    if (this.closed || argument.version !== PROFILE_RPC_CODEC || this.peer === undefined || this.route?.sessionId !== route.sessionId || this.route.desktopId !== route.desktopId || route.profileId !== 'desktop') throw new LinkError('scope-denied')
    const command = parseCommand(argument.packet, this.limits)
    if (!deviceGrantOperations.some(operation => operation === command.operation) || command.desktopId !== this.ticket.desktopId || command.deviceId !== this.ticket.deviceId || command.grantEpoch !== this.ticket.epoch || 'sessionId' in command.payload && command.payload.sessionId !== route.sessionId) throw new LinkError('scope-denied')
    return { peer: this.peer, command }
  }
  /** @param route - immutable owner selected by the native view. @param argument - original strict mobile command envelope. @param signal - request wait lifetime. @returns original canonical result, with no retry or general Gateway access. */
  async request(route: DeviceSessionRoute, argument: ProfileRpcArgument, signal: AbortSignal): Promise<unknown> {
    const { peer, command } = this.command(route, argument)
    return this.owner.run(this.transport, this.ticket, route.profileId, route.sessionId, command.operation as typeof deviceGrantOperations[number], async lifetime => {
      const result = await invokeProfile(this.ctx, peer, { method: 'request', argument }, AbortSignal.any([signal, lifetime, peer.signal]))
      if (peer !== this.peer) throw new LinkError('scope-denied'); return result
    })
  }
  /** @param route - immutable native selection. @param argument - original session.sync command. @param resume - original wire cursor. @param signal - native follower lifetime. @returns canonical frames; revoked, invisible or retired owners cannot deliver late frames. */
  async *follow(route: DeviceSessionRoute, argument: ProfileRpcArgument, resume: unknown, signal: AbortSignal): AsyncIterable<unknown> {
    const { peer, command } = this.command(route, argument)
    if (command.operation !== 'session.sync') throw new LinkError('scope-denied')
    const lifetime = await this.owner.connectionLifetime(this.transport, this.ticket)
    const stream = await this.owner.run(this.transport, this.ticket, route.profileId, route.sessionId, 'session.sync', () => followProfile(this.ctx, peer, { argument, resume }, AbortSignal.any([signal, lifetime, peer.signal])))
    for await (const frame of stream) { if (peer !== this.peer || signal.aborted || peer.signal.aborted) return; yield await this.owner.run(this.transport, this.ticket, route.profileId, route.sessionId, 'session.sync', async () => frame) }
  }
  /** Close only this view's current peer and its rich/subscription owners, preserving identity, binding and accepted tasks. */
  async close(): Promise<void> { this.closed = true; await this.tail; const peer = this.peer; this.peer = undefined; this.route = undefined; if (peer !== undefined) await this.provider.retire(peer) }
}

/** Desktop-local finite grants for a trusted standard workspace, separate from the narrow device registration. */
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope, PrincipalMap } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteAccessAction, RemoteAccessBinding } from '@deepseek-ai/dsh-api-remote-access'
import type { CleanupScheduler } from '../../integration/connection-lifetime.ts'
import type { DeviceTransportBinding } from '../../integration/device-auth.ts'
import type { DeviceBinding, DeviceConnectionTicket } from '../../src/device-binding-protocol.ts'
import { id } from '../../src/protocol.ts'
import type { DesktopId } from '../../src/protocol.ts'
import type { DeviceId } from '../../src/link-protocol.ts'
import type { DeviceBindingOwner } from './device-binding.ts'
import { WorkspaceChannel, WorkspaceError, type WorkspaceLimits } from './workspace-channel.ts'
import { WorkspaceWireHost, type WorkspaceWireLimits } from './workspace-wire.ts'
import type { DeviceWorkspaceProvider, WorkspaceGrantLease } from './device-binding-relay.ts'
import { WorkspaceShell, type WorkspaceShellLimits } from './workspace-shell.ts'
import { deviceWorkspaceOrigin } from '../../src/workspace-origin.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** A locally approved workspace retains device identity and never becomes the desktop owner. */
    'harmony-workspace': { readonly kind: 'harmony-workspace'; readonly desktopId: DesktopId; readonly deviceId: DeviceId; readonly epoch: number }
  }
}
interface Grant {
  readonly record: DeviceBinding
  readonly controller: AbortController
  readonly expiresAt: number
  readonly stop: () => void
  readonly lease?: WorkspaceGrantLease
}
interface WorkspacePeer {
  readonly grant: Grant
  readonly wire: WorkspaceWireHost
  bindings: readonly RemoteAccessBinding[]
  revision: string
}
/** Explicit capacities for an opt-in workspace; omission from deployment keeps the workspace unavailable. */
export interface DeviceWorkspaceLimits {
  readonly ttlMs: number
  readonly channel: Omit<WorkspaceLimits, 'origin'>
  readonly wire: WorkspaceWireLimits
  readonly shell?: { readonly distIndex: string; readonly limits: WorkspaceShellLimits }
}

/** The local command owns consent; only this provider can mint the independently authorized workspace Peers. */
export class DeviceWorkspaceAccess implements DeviceWorkspaceProvider {
  private grant: Grant | undefined
  private readonly peers = new Map<PeerScope, WorkspacePeer>()
  private readonly stopPolicy: () => void
  private closed = false
  private decisions = 0

  /** @param ctx - original desktop Context. @param authority - exact local consent capability. @param owner - original registration verifier. @param limits - opt-in finite capacities. @param clock - trusted expiry clock. @param scheduler - local grant expiry owner. */
  constructor(private readonly ctx: Context, private readonly authority: object, private readonly owner: DeviceBindingOwner,
    private readonly limits: DeviceWorkspaceLimits, private readonly clock: () => number, private readonly scheduler: CleanupScheduler) {
    if (ctx.get('profileContext')?.name !== 'desktop' || !Number.isSafeInteger(limits.ttlMs) || limits.ttlMs <= 0 || limits.ttlMs > 1800000) throw new WorkspaceError('workspace-denied')
    this.stopPolicy = ctx.remoteAccess.registerPolicy('harmony-workspace', { bindings: principal => {
      for (const [peer, value] of this.peers) {
        if (peer.principal === principal && this.active(value.grant) && !peer.signal.aborted) return value.bindings
      }
      return []
    } })
  }

  private active(grant: Grant): boolean {
    return !this.closed && this.grant === grant && !grant.controller.signal.aborted && grant.expiresAt > this.clock()
      && grant.lease?.transport.signal.aborted !== true && this.ctx.get('profileContext')?.name === 'desktop'
  }
  private local(authority: object): void { if (this.closed || authority !== this.authority) throw new WorkspaceError('workspace-denied') }

  /** @param authority - desktop-local confirmed intent. @param signal - optional command lifetime. Cancellation before issuance creates no grant. @param lease - current authenticated connection, when known at approval. @returns the grant deadline, capped by the supplied connection lease. */
  async allow(authority: object, signal?: AbortSignal, lease?: WorkspaceGrantLease): Promise<number> {
    this.local(authority)
    signal?.throwIfAborted()
    if (lease !== undefined && (lease.transport.signal.aborted || lease.expiresAt <= this.clock())) throw new WorkspaceError('workspace-grant-required')
    await this.revoke(authority)
    const generation = ++this.decisions
    const record = await this.owner.publicRecord(authority)
    signal?.throwIfAborted()
    this.local(authority)
    if (record === null || record.revoked || generation !== this.decisions) throw new WorkspaceError('workspace-denied')
    const now = this.clock(), expiresAt = Math.min(now + this.limits.ttlMs, lease?.expiresAt ?? Number.MAX_SAFE_INTEGER)
    if (expiresAt <= now || lease?.transport.signal.aborted) throw new WorkspaceError('workspace-grant-required')
    const controller = new AbortController()
    const retire = () => {
      // Revocation denies synchronously; close() retains stream cleanup failures for local teardown.
      controller.abort()
      if (this.grant?.controller === controller) void this.revoke(authority).catch(error => { void error; this.ctx.logger('harmony-workspace').error('Workspace cleanup failed') })
    }
    const stopExpiry = this.scheduler.after(expiresAt - now, retire)
    const stop = () => { stopExpiry(); lease?.transport.signal.removeEventListener('abort', retire) }
    this.grant = { record, expiresAt, controller, stop, ...(lease === undefined ? {} : { lease }) }
    lease?.transport.signal.addEventListener('abort', retire, { once: true })
    return expiresAt
  }

  /** @param authority - local settings/status capability. @returns public readiness and expiry without a bearer grant. */
  status(authority: object): { readonly enabled: boolean; readonly expiresAt: number | null } {
    this.local(authority)
    const value = this.grant
    if (value === undefined || !this.active(value)) return { enabled: false, expiresAt: null }
    return { enabled: true, expiresAt: value.expiresAt }
  }

  private async bindings(transport: DeviceTransportBinding, ticket: DeviceConnectionTicket): Promise<{ bindings: readonly RemoteAccessBinding[]; revision: string }> {
    const sessions = await this.owner.catalog(transport, ticket), projects = await this.owner.projects(transport, ticket)
    // Archive Manager's legacy registry methods include global catalogue reads and cascading deletion.
    const actions = this.ctx.typert.local.list()
      .filter(row => row.namespace !== 'workspaceRegistry' || !row.id.startsWith('@michengai/dsh-archive-manager#'))
      .map<RemoteAccessAction>(row => `${row.namespace}/${row.method}`)
    for (const pkg of this.ctx.typert.listPackages()) for (const event of pkg.model.events) actions.push(`event:${event.name}`)
    const unique = [...new Set(actions)].sort()
    const bindings: RemoteAccessBinding[] = [
      { role: { name: 'harmony:workspace', resource: 'global', actions: unique }, resource: { kind: 'global' } },
      ...sessions.map(row => ({ role: { name: 'harmony:workspace-session', resource: 'session' as const, actions: unique },
        resource: { kind: 'session' as const, id: id<'SessionId'>(row.sessionId) } })),
      ...projects.map(row => ({ role: { name: 'harmony:workspace-project', resource: 'workspace' as const, actions: unique },
        resource: { kind: 'workspace' as const, id: id<'WorkspaceId'>(row.projectId) } })),
    ]
    return { bindings, revision: JSON.stringify([sessions.map(row => row.sessionId), projects.map(row => row.projectId), unique]) }
  }

  /** @param transport - exact original encrypted device object. @param ticket - its original current receipt. @returns a generation-owned standard workspace under the independent local grant. An absent or expired grant rejects before creating a Peer. */
  async open(transport: DeviceTransportBinding, ticket: DeviceConnectionTicket): Promise<WorkspaceWireHost> {
    const grant = this.grant
    if (grant === undefined || !this.active(grant)) throw new WorkspaceError('workspace-grant-required')
    if (grant.lease !== undefined && grant.lease.transport !== transport) throw new WorkspaceError('workspace-grant-required')
    if (grant.record.bindingId !== ticket.bindingId || grant.record.epoch !== ticket.epoch
      || grant.record.deviceId !== ticket.deviceId || grant.record.desktopId !== ticket.desktopId || grant.record.credentialId !== ticket.credentialId) throw new WorkspaceError('workspace-denied')
    const deviceLifetime = await this.owner.connectionLifetime(transport, ticket)
    const signal = AbortSignal.any([grant.controller.signal, deviceLifetime, transport.signal])
    const initial = await this.bindings(transport, ticket)
    const shell = this.limits.shell === undefined ? undefined : await WorkspaceShell.open(this.limits.shell.distIndex, this.limits.shell.limits)
    if (!this.active(grant) || signal.aborted) throw new WorkspaceError('workspace-closed')
    const principal: PrincipalMap['harmony-workspace'] = { kind: 'harmony-workspace', desktopId: id<'mobile-desktop'>(ticket.desktopId), deviceId: id<'mobile-device'>(ticket.deviceId), epoch: ticket.epoch }
    const peer = this.ctx.connection.createPeer({ principal, interactions: 'answer' })
    let channel: WorkspaceChannel | undefined
    try {
      let queuedRefresh: Promise<void> | undefined, lastRefresh = Promise.resolve()
      const currentPeer = () => {
        const current = this.peers.get(peer)
        if (current === undefined || !this.active(grant) || signal.aborted) throw new WorkspaceError('workspace-closed')
        return current
      }
      const refreshScope = async () => {
        // Only callers already waiting share this read. A later request needs a new snapshot.
        queuedRefresh = undefined
        currentPeer()
        const next = await this.bindings(transport, ticket), current = currentPeer()
        const changed = current.revision !== next.revision
        current.bindings = next.bindings; current.revision = next.revision
        if (changed) this.ctx.remoteAccess.invalidate(principal)
      }
      const selected = new WorkspaceChannel(this.ctx, { peer, signal,
        assertCurrent: () => { if (!this.active(grant)) throw new WorkspaceError('workspace-closed') },
        refresh: () => {
          if (queuedRefresh !== undefined) return queuedRefresh
          queuedRefresh = lastRefresh.then(refreshScope, refreshScope)
          lastRefresh = queuedRefresh
          return queuedRefresh
        },
      }, { ...this.limits.channel, origin: deviceWorkspaceOrigin(grant.record.desktopCredentialId) }, shell)
      channel = selected
      const wire = new WorkspaceWireHost({ signal: selected.signal, assertCurrent: () => selected.assertCurrent(),
        bootstrap: () => selected.bootstrap(), manifest: signal => selected.manifest(signal), fetch: input => selected.fetch(input),
        open: (endpoint, payload, lifetime, uplink) => selected.open(endpoint, payload, lifetime, uplink), failure: error => selected.failure(error),
        close: async () => { selected.close(); this.peers.delete(peer); await peer.dispose() },
      }, this.limits.wire)
      this.peers.set(peer, { grant, wire, ...initial })
      if (!this.active(grant) || signal.aborted) { await wire.close(); throw new WorkspaceError('workspace-closed') }
      return wire
    } catch (error) { channel?.close(); this.peers.delete(peer); await peer.dispose(); throw error }
  }

  /** @param authority - desktop-local stop intent. @returns after denying all operations and draining workspace Peers, preserving pairing and accepted tasks. */
  async revoke(authority: object): Promise<void> {
    this.local(authority)
    this.decisions++
    const grant = this.grant; this.grant = undefined
    grant?.stop(); grant?.controller.abort()
    const results = await Promise.allSettled([...this.peers.values()].map(value => value.wire.close()))
    if (results.some(result => result.status === 'rejected')) throw new WorkspaceError('workspace-closed')
  }
  /** @returns after consumers release, then withdraw the independent policy. */
  async close(): Promise<void> {
    if (this.closed) return
    try { await this.revoke(this.authority) }
    finally { this.closed = true; this.stopPolicy() }
  }
}

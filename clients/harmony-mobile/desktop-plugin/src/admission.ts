/** Production command admission consumes host-authenticated Peer identity; it creates no credentials, pairing or persistent grant. */
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type { DesktopCommandAuthorizer } from '../../src/desktop-adapter.ts'
import type { MobileCommand, MobileOperation, DeviceId } from '../../src/link-protocol.ts'
import { LinkError } from '../../src/link-protocol.ts'
import type { DesktopId, SessionId } from '../../src/protocol.ts'
import type { MobileProfileId } from '../../src/profile-capabilities.ts'

/** Current host policy for one already-authenticated peer; JSON callers cannot supply this object to the service. */
export interface AuthenticatedDeviceScope {
  readonly desktopId: DesktopId
  /** Required by the single-Session product entry; legacy generic providers may omit it. */
  readonly profileId?: MobileProfileId
  readonly deviceId: DeviceId
  readonly epoch: number
  readonly sessions: readonly SessionId[]
  readonly operations: readonly MobileOperation[]
  readonly expiresAt: number
  readonly revoked: boolean
}
/** Host-only transport/authentication capability. Implementers verify the channel before returning scope and own revocation. */
export interface AuthenticatedDeviceProvider {
  /** @param peer - exact Gateway invocation peer object. @returns current host policy, or undefined for an unpaired/unknown peer; never resolve by JSON id/cookie claims. */
  current(peer: PeerScope): AuthenticatedDeviceScope | undefined
  /** @param callback - cleanup owner for revoked device identity. @returns subscription disposer owned by the caller's Context effect. */
  onRevoke(callback: (deviceId: DeviceId) => Promise<void>): () => void
}
/** Strict production admission; the operator always remains outside device authorization. */
export class ProfilePeerAdmission {
  /** @param provider - independent authenticated channel owner, absent until separately provisioned. @param operator - actual Connection operator singleton. @param desktopId - configured execution owner. @param clock - epoch-millisecond host clock. @param profileId - single-Session entry's selected profile; absent only for legacy generic admission. */
  constructor(private readonly provider: AuthenticatedDeviceProvider, private readonly operator: PeerScope, readonly desktopId: DesktopId, private readonly clock: () => number, private readonly profileId?: MobileProfileId) {}
  /** @param peer - exact current invocation peer. @returns current detached device scope; failures authorize no operation. */
  scope(peer: PeerScope): AuthenticatedDeviceScope {
    if (peer === this.operator || peer.principal.kind !== 'harmony-device' || peer.signal.aborted) throw new LinkError('scope-denied')
    const grant = this.provider.current(peer)
    if (grant === undefined || grant.desktopId !== this.desktopId || this.profileId !== undefined && grant.profileId !== this.profileId) throw new LinkError('scope-denied')
    if (grant.revoked) throw new LinkError('revoked')
    if (grant.expiresAt <= this.clock()) throw new LinkError('grant-expired')
    return structuredClone(grant)
  }
  /** @param peer - already-authenticated invocation identity. @returns peer-bound command authorizer; it re-reads scope before every dispatch/delivery and retains no grant snapshot. */
  bind(peer: PeerScope): DesktopCommandAuthorizer {
    const deviceId = this.scope(peer).deviceId
    return { authorize: (command: MobileCommand, sessionId?: SessionId) => {
      const grant = this.scope(peer)
      if (grant.deviceId !== deviceId || command.deviceId !== grant.deviceId || command.desktopId !== grant.desktopId || command.grantEpoch !== grant.epoch
        || !grant.operations.includes(command.operation) || sessionId !== undefined && !grant.sessions.includes(sessionId)) throw new LinkError('scope-denied')
    }, onRevoke: callback => this.provider.onRevoke(async revoked => { if (revoked === deviceId) await callback(revoked) }) }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Trusted transport owner; not provided automatically by this plugin and not Remote-exported. */
    harmonyAuthenticatedDevices: AuthenticatedDeviceProvider
  }
}

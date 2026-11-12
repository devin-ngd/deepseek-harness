/** Reuse the complete existing PhoneCore/semantic/rich owner for a selected Session under a verified new device ticket. */
import { MobileProduct, type MobileProductPolicy, type MobileProductView } from './mobile-product.ts'
import type { DeviceBinding, DeviceConnectionTicket, DeviceRouteContext } from './device-binding-protocol.ts'
import type { DeviceBindingClient } from './device-binding-client.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import type { DeviceProductRpc } from './device-product-rpc.ts'
import type { DeviceSessionRow } from './device-session-directory.ts'
import type { DeviceSessionHistory } from './device-history-cache.ts'
import { jsonPayload } from './wire.ts'
import type { DeviceSessionRoute, DeviceSessionSelection } from './mobile-device-product.ts'
import type { JsonValue } from './upstream.ts'
import { canonicalPublicTrust, productTrustSchema } from './public-trust-protocol.ts'

/** Transient compatibility projection stays in memory: it is never a persistent grant, a device registration, or an authentication message. */
export class DevicePhoneSession implements DeviceSessionSelection {
  private readonly authority = {}
  private readonly inner: MobileProduct
  private closed = false
  private historyPending = false
  private readonly historyLifetime = new AbortController()
  /** @param route - exact device/profile/Session selection acknowledged by the desktop. @param row - validated directory entry for that Session. @param registration - confirmed new device format, never a legacy record. @param ticket - verified original-channel receipt. @param cryptoBinding - exact native crypto object. @param proof - original HUKS verifier. @param nativeAuthority - exact proof client owner. @param policy - existing product/domain/rich limits. @param rpc - fixed encrypted carrier multiplexer. @param scheduler - existing native timers. @param clock - native expiry clock. @param publish - sanitized existing MobileProduct view callback. */
  constructor(readonly route: DeviceSessionRoute, row: DeviceSessionRow, registration: DeviceBinding, ticket: DeviceConnectionTicket, cryptoBinding: DeviceTransportBinding, proof: DeviceBindingClient, nativeAuthority: object, policy: MobileProductPolicy, private readonly rpc: DeviceProductRpc, scheduler: CleanupScheduler, clock: () => number, publish: (view: MobileProductView) => void, expectedRoute?: DeviceRouteContext, private readonly history?: DeviceSessionHistory) {
    if (route.desktopId !== registration.desktopId || route.profileId !== 'desktop' || ticket.bindingId !== registration.bindingId || ticket.profileId !== route.profileId) throw new Error('device phone Session route denied')
    const record = { schema: 'harmony-product-public-trust/1' as const, revoked: false, identityAlias: registration.identityAlias, desktopPublicSpki: registration.desktopPublicSpki,
      paired: { pairId: registration.bindingId, epoch: ticket.epoch, audience: registration.audience, credentialId: registration.credentialId, desktopCredentialId: registration.desktopCredentialId, expiresAt: ticket.expiresAt,
        grant: { protocol: 'dsh-mobile-device-auth/1' as const, desktopId: ticket.desktopId, profileId: 'desktop', deviceId: ticket.deviceId, credentialId: ticket.credentialId, epoch: ticket.epoch, sessions: [route.sessionId], operations: [...ticket.operations], expiresAt: ticket.expiresAt, revoked: false as const } } }
    const raw = canonicalPublicTrust(productTrustSchema.parse(record))
    this.inner = new MobileProduct(this.authority, policy, { storage: { read: async () => raw, write: async () => { throw new Error('device Session projection cannot be persisted') }, close: async () => {} }, scheduler, clock,
      verifyTrust: async (_record, document, previous) => { if (previous !== undefined || canonicalPublicTrust(document) !== raw) throw new Error('device Session projection changed'); await proof.ticket(nativeAuthority, cryptoBinding, ticket, expectedRoute) },
      connect: async (_record, status, received) => { await proof.ticket(nativeAuthority, cryptoBinding, ticket, expectedRoute); const view = rpc.view(route, row, received, history); status('authorized'); return view },
    }, publish)
  }
  /** Start only the original selected Session stream; no prompt/model operation is submitted. */
  async start(): Promise<void> { if (this.closed) throw new Error('device Session closed'); await this.inner.boot(); await this.inner.connect(this.authority); await this.inner.refresh(this.authority); await this.inner.select(this.authority, this.route.sessionId) }
  /** Fetch at most one older page per gesture, cancelled when this Session retires. */
  async loadOlder(): Promise<boolean> {
    if (this.closed || this.historyPending) throw new Error('device Session history unavailable')
    this.historyPending = true
    try {
      let fetched: { beforeSeq: number; throughSeq: number; value: JsonValue } | undefined
      const loaded = await this.inner.loadOlder(this.authority, async (beforeSeq, throughSeq) => {
        const cached = this.history?.older(beforeSeq, throughSeq)
        if (cached !== undefined) return cached
        const value = jsonPayload(await this.rpc.call({ method: 'history', route: this.route, argument: { beforeSeq, throughSeq } }, this.historyLifetime.signal))
        fetched = { beforeSeq, throughSeq, value }
        return value
      })
      if (loaded && this.history !== undefined) {
        if (fetched === undefined) console.info('DSH_DEVICE_HISTORY=older-hit')
        else {
          this.history.remember(fetched.beforeSeq, fetched.throughSeq, fetched.value)
          console.info('DSH_DEVICE_HISTORY=older-transfer')
        }
      }
      return loaded
    } finally { this.historyPending = false }
  }
  /** @param requestId - original native intent id. @param text - user-authored task. @returns the existing canonical receipt; no synthetic response or retry is introduced. */
  submit(requestId: string, text: string): Promise<JsonValue> { return this.inner.submit(this.authority, requestId, text) }
  /** @param requestId - original intent id. @returns read-only canonical reconciliation. */
  receipt(requestId: string): Promise<JsonValue> { return this.inner.receipt(this.authority, requestId) }
  /** Explicit native task cancellation retains the existing canonical semantics. */
  cancel(): Promise<void> { return this.inner.cancel(this.authority) }
  /** @param raw - original scoped rich guest request. @returns result from the unchanged rich-inline owner and validators. */
  richRequest(raw: string): Promise<string> { return this.inner.richRequest(raw) }
  /** @returns after an existing inline snapshot is refreshed without replacing the selected Session. */
  async refreshMountedRich(): Promise<void> {
    if (!this.closed) await this.inner.refreshMountedRich(this.authority)
  }
  /** Dispose original follow/rich lifetimes and the borrowed connection; accepted work and shared binding remain. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.historyLifetime.abort(); await this.inner.close() }
}

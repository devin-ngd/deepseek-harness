/** Durable original-identity routing decisions; neither network nor a device binding write is performed. */
import { z } from 'zod'
import type { DeviceBindingStorage } from '../desktop-plugin/src/device-binding.ts'
import type { DeviceBinding } from './device-binding-protocol.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import { deviceRouteOfferSchema, deviceRouteSchema, deviceRouteOfferBytes, deviceRouteReplyBytes, verifyDeviceRoute, verifyDeviceRouteOffer, type DeviceRoute, type DeviceRouteOffer } from './device-route-protocol.ts'

const ledger = z.object({ schema: z.literal('harmony-device-route-ledger/1'), offers: z.array(deviceRouteOfferSchema).max(64), routes: z.array(deviceRouteSchema).max(64), retired: z.array(z.string()).max(64) }).strict()
/** Consumes only one dedicated public CAS namespace and the existing signer. */
export class DeviceRouteOwner {
  private closed = false
  private blocked = false
  private tail: Promise<void> = Promise.resolve()
  constructor(private readonly authority: object, private readonly role: 'desktop' | 'phone', private readonly binding: () => Promise<DeviceBinding>, private readonly storage: DeviceBindingStorage, private readonly signer: P256IdentitySigner, private readonly primitives: E2EPrimitives, private readonly clock: () => number, private readonly source?: { id(): string; nonce(): string }) {}
  private local(authority: object): void { if (this.closed || this.blocked || authority !== this.authority) throw new Error('device route owner unavailable') }
  private serialized<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => {}, () => {}); return result }
  private async read() {
    const raw = await this.storage.read()
    if (raw !== null && new TextEncoder().encode(raw).length > 524288) throw new Error('device route history capacity')
    const value = raw === null ? ledger.parse({ schema: 'harmony-device-route-ledger/1', offers: [], routes: [], retired: [] }) : ledger.parse(JSON.parse(raw))
    const ids = value.offers.map(item => item.routeId)
    if (new Set(ids).size !== ids.length || new Set(value.offers.map(item => item.nonce)).size !== ids.length || new Set(value.routes.map(item => item.offer.routeId)).size !== value.routes.length || new Set(value.retired).size !== value.retired.length || value.retired.some(id => !ids.includes(id))) throw new Error('device route history denied')
    for (const offer of value.offers) { await verifyDeviceRouteOffer(offer, this.primitives); if ((this.role === 'desktop' ? offer.binding.desktopPublicSpki : offer.binding.phonePublicSpki) !== this.signer.publicSpki) throw new Error('device route original identity denied') }
    for (const route of value.routes) { await verifyDeviceRoute(route, this.primitives); if (!value.offers.some(offer => JSON.stringify(offer) === JSON.stringify(route.offer))) throw new Error('device route offer history denied') }
    return { raw, value }
  }
  private async write(previous: string | null, value: z.infer<typeof ledger>): Promise<void> {
    const raw = JSON.stringify(ledger.parse(value)); if (new TextEncoder().encode(raw).length > 524288) throw new Error('device route history capacity')
    try { await this.storage.compareAndSet(previous, raw) } catch (error) { this.blocked = true; throw new Error('device route persistence outcome unknown', { cause: error }) }
  }
  private async activeBinding(): Promise<DeviceBinding> { const binding = await this.binding(); if (binding.revoked || binding.profileId !== 'desktop' || (this.role === 'desktop' ? binding.desktopPublicSpki : binding.phonePublicSpki) !== this.signer.publicSpki) throw new Error('device route binding revoked or foreign'); return binding }
  private availableSlot(value: z.infer<typeof ledger>): void { if (value.offers.length >= 64 || value.offers.some(item => !value.retired.includes(item.routeId) && item.expiresAt > this.clock())) throw new Error('device route active window or capacity') }
  /** Full read-only audit before native marker recovery; every record must name this exact original binding. */
  async auditRecovery(authority: object, requiredRetired: readonly string[] = []): Promise<{ offers: number; routes: number; retired: number }> { this.local(authority); const binding = await this.activeBinding(), { value } = await this.read(); if (requiredRetired.some(id => !value.retired.includes(id))) throw new Error('device recovery revocation anchor missing'); for (const offer of value.offers) { if (JSON.stringify(offer.binding) !== JSON.stringify(binding)) throw new Error('device route recovery binding mismatch'); if (!value.retired.includes(offer.routeId) && offer.expiresAt > this.clock()) throw new Error('device route recovery active window denied') }; return { offers: value.offers.length, routes: value.routes.length, retired: value.retired.length } }
  /** Public comparison does not sign, persist or acquire transport. */
  async inspectOffer(authority: object, candidate: unknown): Promise<DeviceRouteOffer> { this.local(authority); return verifyDeviceRouteOffer(candidate, this.primitives, await this.activeBinding(), this.clock()) }
  /** Persist a pending desktop offer before disclosure; concurrent windows and nonce/id reuse refuse. */
  offer(authority: object, ttlMs: number): Promise<DeviceRouteOffer> {
    this.local(authority); return this.serialized(async () => {
      this.local(authority); if (this.role !== 'desktop' || this.source === undefined || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 1800000) throw new Error('device route offer denied')
      const binding = await this.activeBinding(), { raw, value } = await this.read(); this.availableSlot(value)
      const now = this.clock(), unsigned = { schema: 'harmony-device-route-offer/1' as const, binding, routeId: this.source.id(), routeEpoch: 1 as const, nonce: this.source.nonce(), issuedAt: now, expiresAt: now + ttlMs }
      if (value.offers.some(item => item.routeId === unsigned.routeId || item.nonce === unsigned.nonce)) throw new Error('device route replay')
      const offer = deviceRouteOfferSchema.parse({ ...unsigned, signature: this.primitives.encode(await this.signer.sign(deviceRouteOfferBytes(unsigned))) })
      this.local(authority); await verifyDeviceRouteOffer(offer, this.primitives, await this.activeBinding(), this.clock()); await this.write(raw, { ...value, offers: [...value.offers, offer] }); return offer
    })
  }
  /** Original phone signs one current, explicitly approved window, retaining the replay history before returning. */
  acceptOffer(authority: object, candidate: unknown, approved: boolean): Promise<DeviceRoute> {
    this.local(authority); return this.serialized(async () => {
      if (this.role !== 'phone' || !approved) throw new Error('device route phone approval required')
      const binding = await this.activeBinding(), offer = await verifyDeviceRouteOffer(candidate, this.primitives, binding, this.clock()), { raw, value } = await this.read(); this.availableSlot(value)
      if (value.offers.some(item => item.routeId === offer.routeId || item.nonce === offer.nonce)) throw new Error('device route replay')
      const route = deviceRouteSchema.parse({ schema: 'harmony-device-route/1', offer, signature: this.primitives.encode(await this.signer.sign(deviceRouteReplyBytes(offer))) })
      this.local(authority); await verifyDeviceRoute(route, this.primitives, await this.activeBinding(), this.clock()); await this.write(raw, { ...value, offers: [...value.offers, offer], routes: [...value.routes, route] }); return route
    })
  }
  /** Confirm the exact persisted offer; an identical known result is idempotent, retired routes never reactivate. */
  confirm(authority: object, candidate: unknown): Promise<DeviceRoute> {
    this.local(authority); return this.serialized(async () => {
      if (this.role !== 'desktop') throw new Error('device route desktop confirmation required')
      const route = await verifyDeviceRoute(candidate, this.primitives, await this.activeBinding(), this.clock()), { raw, value } = await this.read()
      if (value.retired.includes(route.offer.routeId) || !value.offers.some(offer => JSON.stringify(offer) === JSON.stringify(route.offer))) throw new Error('device route pending offer absent')
      const old = value.routes.find(item => item.offer.routeId === route.offer.routeId)
      if (old !== undefined) { if (JSON.stringify(old) !== JSON.stringify(route)) throw new Error('device route conflicting confirmation'); return old }
      this.local(authority); await this.write(raw, { ...value, routes: [...value.routes, route] }); return route
    })
  }
  /** A cold process may recover this still-finite window, but every connection still requires fresh proofs and consent. */
  async current(authority: object): Promise<DeviceRoute | null> {
    this.local(authority); const binding = await this.activeBinding(), { value } = await this.read(), routes = value.routes.filter(route => !value.retired.includes(route.offer.routeId) && route.offer.expiresAt > this.clock())
    if (routes.length > 1) throw new Error('device route concurrent history denied')
    const route = routes[0]; return route === undefined ? null : verifyDeviceRoute(route, this.primitives, binding, this.clock())
  }
  /** Persist terminal local retirement without modifying the binding; relay durable revocation remains explicit. */
  retire(authority: object): Promise<readonly string[]> {
    this.local(authority); return this.serialized(async () => { const { raw, value } = await this.read(), ids = value.offers.filter(item => !value.retired.includes(item.routeId)).map(item => item.routeId); if (ids.length) await this.write(raw, { ...value, retired: [...value.retired, ...ids] }); return ids })
  }
  /** Stop this owner without deleting history or changing any remote record. */
  async close(): Promise<void> { this.closed = true; await this.tail }
}

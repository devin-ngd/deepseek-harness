/** Native-owned original-phone proofs for persistent device binding; no key generation, network or renderer API. */
import type { P256IdentitySigner, E2EPrimitives } from './e2e-channel.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { DeviceBindingStorage } from '../desktop-plugin/src/device-binding.ts'
import type { DeviceRouteContext } from './device-binding-protocol.ts'
import { MAX_DEVICE_ENROLLMENT_TTL_MS, deviceBindingSchema, deviceBindingOfferSchema, deviceConnectionChallengeSchema, deviceConnectionTicketSchema, deviceBindingBytes, deviceBindingOfferBytes, deviceBindingReplyBytes, deviceConnectionChallengeBytes, deviceConnectionProofBytes, deviceConnectionTicketBytes, type DeviceBinding, type DeviceConnectionTicket } from './device-binding-protocol.ts'

/** Public native deployment pins and capacities, supplied by the app owner. */
export interface DeviceBindingClientPolicy { readonly desktopId: string; readonly profileId: 'desktop'; readonly deviceId: string; readonly identityAlias: string; readonly desktopCredentialId: string; readonly audience: string; readonly maxPublicBytes: number; readonly maxProofs: number; readonly maxChallengeTtlMs: number }
/** App-private public record and native signer remain outside the rich guest's capability set. */
export class DeviceBindingClient {
  private closed = false
  private blocked = false
  private readonly used = new Set<string>()
  /** @param authority - exact native UI capability. @param policy - original compared desktop and phone selection. @param storage - dedicated public registration namespace, retaining prior records. @param signer - original HUKS signer, never initialized here. @param primitives - existing maintained native/Node crypto backend. @param clock - trusted native expiry clock. */
  constructor(private readonly authority: object, private readonly policy: DeviceBindingClientPolicy, private readonly storage: DeviceBindingStorage, private readonly signer: P256IdentitySigner, private readonly primitives: E2EPrimitives, private readonly clock: () => number) {
    if (policy.profileId !== 'desktop' || ![policy.maxPublicBytes, policy.maxProofs, policy.maxChallengeTtlMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('native device binding policy denied')
  }
  private local(authority: object): void { if (this.closed || this.blocked || authority !== this.authority) throw new Error('native device binding denied') }
  private raw(value: string): void { if (new TextEncoder().encode(value).length > this.policy.maxPublicBytes) throw new Error('native device binding capacity') }
  private once(id: string): void { if (this.used.has(id) || this.used.size >= this.policy.maxProofs) throw new Error('native device proof replay or capacity'); this.used.add(id) }
  private async identity(value: Omit<DeviceBinding, 'signature'>): Promise<void> {
    if (value.revoked || value.desktopId !== this.policy.desktopId || value.profileId !== 'desktop' || value.deviceId !== this.policy.deviceId || value.identityAlias !== this.policy.identityAlias || value.audience !== this.policy.audience || value.phonePublicSpki !== this.signer.publicSpki || value.desktopCredentialId !== this.policy.desktopCredentialId || await this.primitives.credentialId(value.desktopPublicSpki) !== value.desktopCredentialId || await this.primitives.credentialId(this.signer.publicSpki) !== value.credentialId) throw new Error('native original device identity denied')
  }
  /** @param authority - native fingerprint decision owner. @param raw - strict public device offer. @param compared - explicit original-device fingerprint decision. @returns fixed-domain signed reply only; no public record or ticket is stored. */
  async inspectOffer(authority: object, raw: string) {
    this.local(authority); this.raw(raw)
    const offer = deviceBindingOfferSchema.parse(JSON.parse(raw)), { signature, ...unsigned } = offer
    await this.identity(offer.registration)
    if (offer.expiresAt <= this.clock() || offer.expiresAt - this.clock() > MAX_DEVICE_ENROLLMENT_TTL_MS || !await this.primitives.verify(offer.registration.desktopPublicSpki, deviceBindingOfferBytes(unsigned), this.primitives.decode(signature))) throw new Error('native device offer denied')
    this.local(authority); return offer
  }
  /** @param authority - native comparison owner. @param raw - strict device offer. @param compared - explicit fingerprint decision. @returns original-phone proof without creating or replacing any identity. */
  async signOffer(authority: object, raw: string, compared: boolean): Promise<string> {
    this.local(authority); if (!compared) throw new Error('native device comparison required')
    const offer = await this.inspectOffer(authority, raw)
    this.local(authority); this.once(offer.challengeId)
    const proof = await this.signer.sign(deviceBindingReplyBytes(offer)); this.local(authority)
    if (offer.expiresAt <= this.clock()) throw new Error('native device offer expired')
    return JSON.stringify({ schema: 'harmony-device-binding-reply/1', offer, signature: this.primitives.encode(proof) })
  }
  private async parse(raw: string): Promise<DeviceBinding> {
    this.raw(raw); const value = deviceBindingSchema.parse(JSON.parse(raw)), { signature, ...unsigned } = value
    await this.identity(value)
    if (!await this.primitives.verify(value.desktopPublicSpki, deviceBindingBytes(unsigned), this.primitives.decode(signature))) throw new Error('native device receipt signature denied')
    return value
  }
  /** @param authority - native comparison owner. @param raw - signed confirmed device receipt. @param compared - local fingerprint/scope confirmation. @returns after atomic public-only storage; existing different/legacy/revoked records are never replaced. */
  async accept(authority: object, raw: string, compared: boolean): Promise<void> {
    this.local(authority); if (!compared) throw new Error('native device comparison required')
    const value = await this.parse(raw), previous = await this.storage.read(); this.local(authority)
    if (previous !== null) { const old = await this.parse(previous); if (JSON.stringify(old) !== JSON.stringify(value)) throw new Error('native device registration replacement denied'); return }
    try { await this.storage.compareAndSet(null, JSON.stringify(value)) } catch (error) { void error; this.blocked = true; throw new Error('native device storage outcome unknown') }
    this.local(authority)
  }
  /** @param authority - native product owner. @returns original persistent registration; reading it does not authorize a connection or restore an old ticket. */
  async load(authority: object): Promise<DeviceBinding> { this.local(authority); const raw = await this.storage.read(); this.local(authority); if (raw === null) throw new Error('native device not bound'); const value = await this.parse(raw); this.local(authority); return value }
  /** @param authority - trusted native connection owner. @param transport - exact fresh mutually authenticated encrypted channel. @param raw - desktop's signed challenge. @returns original-phone channel proof; replay/foreign profile/changed identity/expired challenge refuse. */
  async connectionProof(authority: object, transport: DeviceTransportBinding, raw: string, route?: DeviceRouteContext): Promise<{ readonly challengeId: string; readonly signature: string }> {
    this.local(authority); this.raw(raw); const registration = await this.load(authority), challenge = deviceConnectionChallengeSchema.parse(JSON.parse(raw)), { signature, ...unsigned } = challenge
    if (JSON.stringify(challenge.route) !== JSON.stringify(route)) throw new Error('native device route challenge mismatch')
    const current = () => { this.local(authority); transport.signal.throwIfAborted(); if (transport.remoteCredentialId !== registration.desktopCredentialId || challenge.channelBindingId !== transport.id || challenge.bindingId !== registration.bindingId || challenge.desktopId !== registration.desktopId || challenge.profileId !== registration.profileId || challenge.deviceId !== registration.deviceId || challenge.credentialId !== registration.credentialId || challenge.epoch !== registration.epoch || challenge.expiresAt <= this.clock() || challenge.expiresAt - this.clock() > this.policy.maxChallengeTtlMs) throw new Error('native device channel denied') }
    current(); if (!await this.primitives.verify(registration.desktopPublicSpki, deviceConnectionChallengeBytes(unsigned), this.primitives.decode(signature))) throw new Error('native device challenge signature denied')
    current(); this.once(challenge.challengeId); const proof = await this.signer.sign(deviceConnectionProofBytes(challenge)); current(); return { challengeId: challenge.challengeId, signature: this.primitives.encode(proof) }
  }
  /** @param authority - native connection owner. @param transport - exact authenticated channel. @param candidate - signed short-lived receipt from that channel; issuedAt bounds its signed duration, not local activation time. @returns detached receipt without persisting it; local expiry and route expiry still apply, and the server enforces its own deadline on every request. */
  async ticket(authority: object, transport: DeviceTransportBinding, candidate: unknown, route?: DeviceRouteContext): Promise<DeviceConnectionTicket> {
    const registration = await this.load(authority), value = deviceConnectionTicketSchema.parse(candidate), { signature, ...unsigned } = value
    if (JSON.stringify(value.route) !== JSON.stringify(route) || route !== undefined && value.expiresAt > route.expiresAt) throw new Error('native device route ticket mismatch')
    if (value.bindingId !== registration.bindingId || value.desktopId !== registration.desktopId || value.profileId !== registration.profileId || value.deviceId !== registration.deviceId || value.credentialId !== registration.credentialId || value.epoch !== registration.epoch || value.channelBindingId !== transport.id || transport.remoteCredentialId !== registration.desktopCredentialId || value.expiresAt <= this.clock() || value.operations.some(operation => !registration.operations.includes(operation)) || !await this.primitives.verify(registration.desktopPublicSpki, deviceConnectionTicketBytes(unsigned), this.primitives.decode(signature))) throw new Error('native device ticket denied')
    this.local(authority); transport.signal.throwIfAborted(); if (value.expiresAt <= this.clock()) throw new Error('native device ticket expired'); return value
  }
  /** @param authority - explicit native local revoke decision. @returns after sticky public denial; desktop durable revocation is a separate required acknowledgement. */
  async revokeLocal(authority: object): Promise<void> { this.local(authority); this.blocked = true; const raw = await this.storage.read(); if (raw === null) throw new Error('native device not bound'); await this.storage.compareAndSet(raw, JSON.stringify({ schema: 'harmony-device-local-revocation/1', registration: deviceBindingSchema.parse(JSON.parse(raw)) })) }
  /** Stop native signing; neither an identity nor a registration is deleted. */
  close(): void { this.closed = true; this.used.clear() }
}

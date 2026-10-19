/** Trusted phone pairing owner. Only native confirmation can select pins; no guest bridge, key creation, automatic reconnect or host dispatch is provided. */
import type { DeviceTransportBinding, DeviceCredentialId, DeviceChallengeId } from '../integration/device-auth.ts'
import type { P256IdentitySigner, E2EPrimitives } from './e2e-channel.ts'
import type { DesktopId, SessionId } from './protocol.ts'
import type { MobileProfileId } from './profile-capabilities.ts'
import type { DeviceId } from './link-protocol.ts'
import { enrollmentChallengeSchema, deviceChallengeSchema, readOnlyGrantSchema, enrollmentProofBytes, deviceChallengeBytes, type EnrollmentChallenge, type ReadOnlyPairingGrant } from './pairing-protocol.ts'
/** Full native display facts; the accepted result must be this exact local object, never a remote boolean. */
export interface PhonePairingOffer {
  readonly ticket: EnrollmentChallenge; readonly desktopPublicSpki: string
  readonly desktopFingerprint: DeviceCredentialId; readonly phoneFingerprint: DeviceCredentialId
  readonly sessions: readonly SessionId[]; readonly operations: readonly ('session.sync' | 'task.receipt')[]; readonly grantTtlMs: number
}
/** Typed native surface owns expiry, withdrawal and comparison. Pending calls reject on close; caller never maps arbitrary JSON to a receipt. */
export interface NativePairingConfirmation {
  /** @param offer - exact public ticket/identity/scope facts to show. @returns same object only after complete fingerprint comparison and explicit local approval; undefined denies. */
  request(offer: PhonePairingOffer): Promise<PhonePairingOffer | undefined>
  /** @returns nothing; cancels pending UI and clears local comparison state. */
  close(): void
}
/** Content-free failure; there is no cookie/token/unsigned fallback. */
export class PhonePairingError extends Error {
  /** @param code - stable failure category. */
  constructor(readonly code: 'denied' | 'stale' | 'identity' | 'scope' | 'closed' | 'cleanup-failed') { super(code); this.name = 'PhonePairingError' }
}
/** One native-approved ticket and one verified connection; this class is not exported to rich guests. */
export class PhonePairingOwner {
  private phase: 'unconfirmed' | 'confirming' | 'approved' | 'await-grant' | 'granted' | 'closed' = 'unconfirmed'
  private offer: PhonePairingOffer | undefined
  private binding: DeviceTransportBinding | undefined
  private grant: ReadOnlyPairingGrant | undefined
  private readonly usedChallenges = new Set<string>()
  private cleanupFailed = false
  private readonly stopLifetime: () => void
  private stopBinding: () => void = () => {}
  /** @param authority - exact native owner. @param signer - explicit existing key port, verified separately before real use. @param primitives - shared maintained crypto/codec backend. @param confirmation - native-only UI owner. @param clock - injected local clock. @param maxChallenges - explicit single-use signing budget. @param lifetime - approved owner lifetime; closing never deletes a persistent key. */
  constructor(private readonly authority: object, private readonly signer: P256IdentitySigner, private readonly primitives: E2EPrimitives, private readonly confirmation: NativePairingConfirmation, private readonly clock: () => number, private readonly maxChallenges: number, lifetime: AbortSignal) {
    if (!Number.isSafeInteger(maxChallenges) || maxChallenges <= 0) throw new PhonePairingError('scope')
    const close = () => this.close(); lifetime.addEventListener('abort', close, { once: true }); this.stopLifetime = () => lifetime.removeEventListener('abort', close); if (lifetime.aborted) this.close()
  }
  private check(authority: object): void { if (authority !== this.authority) throw new PhonePairingError('denied'); if (this.phase === 'closed') throw new PhonePairingError('closed') }
  /** @param authority - local native capability. @param candidate - public bootstrap facts delivered through a user-selected local pairing input, not an unpinned relay hello. @returns selected pins only after exact native receipt; key signing/connection has not happened yet. */
  async prepare(authority: object, candidate: { readonly ticket: unknown; readonly desktopPublicSpki: string; readonly desktopId: DesktopId; readonly profileId: MobileProfileId; readonly deviceId: DeviceId; readonly sessions: readonly SessionId[]; readonly operations: readonly ('session.sync' | 'task.receipt')[]; readonly grantTtlMs: number }): Promise<PhonePairingOffer> {
    this.check(authority); if (this.phase !== 'unconfirmed') throw new PhonePairingError('stale')
    const ticket = enrollmentChallengeSchema.parse(candidate.ticket)
    if (ticket.desktopId !== candidate.desktopId || ticket.profileId !== candidate.profileId || ticket.deviceId !== candidate.deviceId || ticket.publicSpki !== this.signer.publicSpki || ticket.expiresAt <= this.clock()
      || candidate.sessions.length === 0 || new Set(candidate.sessions).size !== candidate.sessions.length || candidate.sessions.some(value => value === '*') || candidate.operations.length === 0 || new Set(candidate.operations).size !== candidate.operations.length
      || !Number.isSafeInteger(candidate.grantTtlMs) || candidate.grantTtlMs <= 0) throw new PhonePairingError('scope')
    this.phase = 'confirming'
    const phoneFingerprint = await this.primitives.credentialId(this.signer.publicSpki), desktopFingerprint = await this.primitives.credentialId(candidate.desktopPublicSpki)
    this.check(authority); if (ticket.credentialId !== phoneFingerprint || ticket.expiresAt <= this.clock()) throw new PhonePairingError('identity')
    const offer: PhonePairingOffer = Object.freeze({ ticket: Object.freeze(ticket), desktopPublicSpki: candidate.desktopPublicSpki, desktopFingerprint, phoneFingerprint, sessions: Object.freeze([...candidate.sessions]), operations: Object.freeze([...candidate.operations]), grantTtlMs: candidate.grantTtlMs })
    this.phase = 'confirming'; this.offer = offer
    let accepted: PhonePairingOffer | undefined
    try { accepted = await this.confirmation.request(offer) } catch (error) { void error; this.close(); throw new PhonePairingError('denied') }
    this.check(authority)
    if (accepted !== offer || this.offer !== offer || this.clock() >= ticket.expiresAt) { this.close(); throw new PhonePairingError('denied') }
    this.phase = 'approved'; return offer
  }
  /** @param authority - local native owner. @param offer - exact receipt previously selected by native UI. @returns nothing; the composition must check the live receipt immediately before creating a signer-backed connection. */
  authorizeConnection(authority: object, offer: PhonePairingOffer): void {
    this.check(authority); if (this.phase !== 'approved' || this.offer !== offer || this.binding !== undefined || offer.ticket.expiresAt <= this.clock()) throw new PhonePairingError('stale')
  }
  /** @param authority - local native owner. @param binding - host-only mutually authenticated E2E binding. @returns nothing; no JSON id substitutes for this exact lifetime. */
  attach(authority: object, binding: DeviceTransportBinding): void {
    this.check(authority); if (this.phase !== 'approved' || this.offer === undefined || this.binding !== undefined || binding.signal.aborted || binding.remoteCredentialId !== this.offer.desktopFingerprint) throw new PhonePairingError('identity')
    this.binding = binding; const close = () => this.close(); binding.signal.addEventListener('abort', close, { once: true }); this.stopBinding = () => binding.signal.removeEventListener('abort', close)
  }
  /** @param authority - local native owner. @param candidate - ticket received inside the now-pinned channel. @returns single-use enrollment proof only for the exactly confirmed ticket. */
  async enrollment(authority: object, candidate: unknown): Promise<{ readonly challenge: EnrollmentChallenge; readonly signature: string }> {
    this.check(authority); const ticket = enrollmentChallengeSchema.parse(candidate), offer = this.offer
    if (this.phase !== 'approved' || offer === undefined || this.binding === undefined || this.binding.signal.aborted || JSON.stringify(ticket) !== JSON.stringify(offer.ticket) || ticket.expiresAt <= this.clock()) throw new PhonePairingError('stale')
    this.phase = 'await-grant'
    const signature = await this.signer.sign(enrollmentProofBytes(ticket)); this.check(authority)
    if (this.binding.signal.aborted || ticket.expiresAt <= this.clock()) throw new PhonePairingError('stale')
    return { challenge: ticket, signature: this.primitives.encode(signature) }
  }
  /** @param authority - local native owner. @param candidate - scoped grant acknowledgement inside the authenticated channel. @returns nothing; a mismatched/late/write/approval scope cannot enable proof signing. */
  acceptGrant(authority: object, candidate: unknown): void {
    this.check(authority); const grant = readOnlyGrantSchema.parse(candidate), offer = this.offer
    if (this.phase !== 'await-grant' || offer === undefined || this.binding?.signal.aborted !== false || grant.desktopId !== offer.ticket.desktopId || grant.profileId !== offer.ticket.profileId || grant.deviceId !== offer.ticket.deviceId || grant.credentialId !== offer.phoneFingerprint
      || JSON.stringify(grant.sessions) !== JSON.stringify(offer.sessions) || JSON.stringify(grant.operations) !== JSON.stringify(offer.operations) || grant.expiresAt <= this.clock() || grant.expiresAt > this.clock() + offer.grantTtlMs) throw new PhonePairingError('scope')
    this.grant = grant; this.phase = 'granted'
  }
  /** @param authority - local native owner. @param candidate - bounded phase34 proof challenge inside the exact pinned connection. @returns one proof for the same device/key/epoch/audience/binding; arbitrary host signing is unavailable. */
  async deviceProof(authority: object, candidate: unknown): Promise<{ readonly challengeId: DeviceChallengeId; readonly signature: string }> {
    this.check(authority); const challenge = deviceChallengeSchema.parse(candidate), grant = this.grant, binding = this.binding
    if (this.phase !== 'granted' || grant === undefined || binding === undefined || binding.signal.aborted || grant.expiresAt <= this.clock() || challenge.expiresAt <= this.clock() || challenge.expiresAt > grant.expiresAt || challenge.channelBindingId !== binding.id
      || challenge.desktopId !== grant.desktopId || challenge.profileId !== grant.profileId || challenge.deviceId !== grant.deviceId || challenge.credentialId !== grant.credentialId || challenge.epoch !== grant.epoch || this.usedChallenges.has(challenge.challengeId) || this.usedChallenges.size >= this.maxChallenges) throw new PhonePairingError('scope')
    this.usedChallenges.add(challenge.challengeId)
    const signature = await this.signer.sign(deviceChallengeBytes(challenge)); this.check(authority)
    if (binding.signal.aborted || grant.expiresAt <= this.clock() || challenge.expiresAt <= this.clock()) throw new PhonePairingError('stale')
    return { challengeId: challenge.challengeId, signature: this.primitives.encode(signature) }
  }
  /** @returns nothing; deny synchronously, clear receipt/grant references and cancel native UI. No persistent key deletion or task cancellation occurs. */
  close(): void { if (this.phase === 'closed') return; this.phase = 'closed'; this.offer = undefined; this.binding = undefined; this.grant = undefined; this.usedChallenges.clear(); this.stopLifetime(); this.stopBinding(); try { this.confirmation.close() } catch (error) { void error; this.cleanupFailed = true } }
  /** @returns whether all locally owned UI cleanup completed; no native hardware claim is implied. */
  cleanupSucceeded(): boolean { return !this.cleanupFailed }
}

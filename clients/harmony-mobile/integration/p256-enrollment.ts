/** Single-use enrollment proof verifier for the unactivated device owner; only public pins and pending challenges are retained in memory. */
import { z } from 'zod'
import type { DeviceProofVerifier, DeviceChallenge, DeviceCredentialId } from './device-auth.ts'
import type { DeviceId } from '../src/link-protocol.ts'
import type { DesktopId } from '../src/protocol.ts'
import type { MobileProfileId } from '../src/profile-capabilities.ts'
import { E2EError, p256CredentialId, verifyP256 } from './p256-channel.ts'
import { enrollmentChallengeSchema as schema, enrollmentProofBytes, deviceChallengeBytes } from '../src/pairing-protocol.ts'
import type { EnrollmentChallengeId, EnrollmentChallenge } from '../src/pairing-protocol.ts'
export type { EnrollmentChallengeId, EnrollmentChallenge } from '../src/pairing-protocol.ts'
/** @param challenge - complete owner-issued enrollment fields. @returns fixed-order domain-separated signing input. */
export function enrollmentBytes(challenge: EnrollmentChallenge): Buffer { return Buffer.from(enrollmentProofBytes(challenge)) }
/** @param challenge - exact grant/channel/epoch challenge from phase34. @returns domain-separated signature input without custom JSON canonicalization. */
export function deviceProofBytes(challenge: DeviceChallenge): Buffer { return Buffer.from(deviceChallengeBytes(challenge)) }
/** Required explicit test/future deployment inputs; actual entropy and enrollment access need separate approval. */
export interface EnrollmentOptions {
  readonly desktopId: DesktopId; readonly profileId: MobileProfileId; readonly localAuthority: object; readonly clock: () => number
  readonly challengeTtlMs: number; readonly pinTtlMs: number; readonly maxIssues: number; readonly maxProofBytes: number
  readonly identities: { challenge(): EnrollmentChallengeId; nonce(): Uint8Array }
}
/** Real ECDSA verifier with an explicit local enrollment capability. A valid signature alone never grants a Session operation. */
export class P256EnrollmentVerifier implements DeviceProofVerifier {
  private readonly pending = new Map<string, EnrollmentChallenge>()
  private readonly issued = new Set<string>()
  private readonly verified = new Map<string, EnrollmentChallenge>()
  private closed = false
  private readonly pins = new Map<DeviceCredentialId, { readonly publicSpki: string; readonly deviceId: DeviceId; readonly expiresAt: number }>()
  /** @param options - desktop/profile owner and bounded lifecycle; no ambient secrets, keys or network are read. */
  constructor(private readonly options: EnrollmentOptions) { for (const value of [options.challengeTtlMs, options.pinTtlMs, options.maxIssues, options.maxProofBytes]) if (!Number.isSafeInteger(value) || value <= 0) throw new E2EError('invalid') }
  /** @param authority - exact local enrollment controller. @param device - proposed public device identity. @param publicSpki - public key whose fingerprint must be checked in the human pairing flow. @returns short single-use proof challenge, not an execution grant. */
  issue(authority: object, device: DeviceId, publicSpki: string): EnrollmentChallenge {
    if (this.closed) throw new E2EError('closed')
    if (authority !== this.options.localAuthority) throw new E2EError('invalid')
    if (this.issued.size >= this.options.maxIssues) throw new E2EError('capacity')
    const credentialId = p256CredentialId(publicSpki), challengeId = this.options.identities.challenge(), nonce = this.options.identities.nonce()
    if (challengeId.length < 1 || challengeId.length > 256 || this.issued.has(challengeId) || nonce.length !== 32) throw new E2EError('invalid')
    const challenge: EnrollmentChallenge = { protocol: 'dsh-mobile-enrollment/1', challengeId, desktopId: this.options.desktopId, profileId: this.options.profileId, deviceId: device, credentialId, publicSpki, nonce: Buffer.from(nonce).toString('base64url'), expiresAt: this.options.clock() + this.options.challengeTtlMs }
    this.pending.set(challengeId, challenge); this.issued.add(challengeId); return { ...challenge }
  }
  /** @param candidate - phase34 enrollment request with signed challenge JSON. @param signal - local confirmation lifetime. @returns only verified key possession; phase34 still requires explicit human confirmation. */
  async enrollment(candidate: Parameters<DeviceProofVerifier['enrollment']>[0], signal: AbortSignal): ReturnType<DeviceProofVerifier['enrollment']> {
    if (this.closed) return false
    signal.throwIfAborted()
    if (Buffer.byteLength(candidate.proof) > this.options.maxProofBytes) return false
    let raw: unknown
    try { raw = JSON.parse(candidate.proof) } catch (error) { void error; return false }
    const proof = z.object({ challenge: schema, signature: z.string() }).strict().safeParse(raw)
    if (!proof.success) return false
    const challenge = this.pending.get(proof.data.challenge.challengeId); this.pending.delete(proof.data.challenge.challengeId)
    if (challenge === undefined || challenge.expiresAt <= this.options.clock() || JSON.stringify(challenge) !== JSON.stringify(proof.data.challenge)
      || candidate.desktopId !== challenge.desktopId || candidate.profileId !== challenge.profileId || candidate.deviceId !== challenge.deviceId || candidate.credentialId !== challenge.credentialId
      || !verifyP256(challenge.publicSpki, enrollmentBytes(challenge), proof.data.signature)) return false
    this.verified.set(candidate.proof, challenge); return { confirmationExpiresAt: challenge.expiresAt }
  }
  /** @param authority - exact local fingerprint-confirmation owner. @param candidate - same signed offer/proof fields. @returns single-use pin activation after current, unexpired local confirmation. */
  confirmEnrollment(authority: object, candidate: Parameters<DeviceProofVerifier['enrollment']>[0]): boolean {
    if (authority !== this.options.localAuthority || this.closed) return false
    const challenge = this.verified.get(candidate.proof); this.verified.delete(candidate.proof)
    if (challenge === undefined || challenge.expiresAt <= this.options.clock() || candidate.desktopId !== challenge.desktopId || candidate.profileId !== challenge.profileId || candidate.deviceId !== challenge.deviceId || candidate.credentialId !== challenge.credentialId) return false
    this.pins.set(candidate.credentialId, { publicSpki: challenge.publicSpki, deviceId: candidate.deviceId, expiresAt: this.options.clock() + this.options.pinTtlMs }); return true
  }
  /** @param challenge - current single-use phase34 transport/epoch proof. @param signature - DER ECDSA signature. @param signal - handshake lifetime. @returns verification by a previously enrolled public pin, never a key supplied in this request. */
  async challenge(challenge: DeviceChallenge, signature: string, signal: AbortSignal): Promise<boolean> {
    if (this.closed) return false
    signal.throwIfAborted(); const pin = this.pins.get(challenge.credentialId)
    return pin !== undefined && pin.expiresAt > this.options.clock() && challenge.expiresAt > this.options.clock() && pin.deviceId === challenge.deviceId
      && challenge.desktopId === this.options.desktopId && challenge.profileId === this.options.profileId && verifyP256(pin.publicSpki, deviceProofBytes(challenge), signature)
  }
  /** @param device - revoked owner. Remove only public pins/pending tickets; execution denial remains owned by phase34. */
  revoke(device: DeviceId): void { for (const [id, pin] of this.pins) if (pin.deviceId === device) this.pins.delete(id); for (const [id, challenge] of this.pending) if (challenge.deviceId === device) this.pending.delete(id); for (const [proof, challenge] of this.verified) if (challenge.deviceId === device) this.verified.delete(proof) }
  /** Remove expired public tickets and pins; issued-id replay tracking remains bounded by maxIssues until terminal close. */
  sweep(): void { const now = this.options.clock(); for (const [id, pin] of this.pins) if (pin.expiresAt <= now) this.pins.delete(id); for (const [id, challenge] of this.pending) if (challenge.expiresAt <= now) this.pending.delete(id); for (const [proof, challenge] of this.verified) if (challenge.expiresAt <= now) this.verified.delete(proof) }
  /** Release pending proof/pin state; no credential or access persistence is created. */
  close(): void { this.closed = true; this.pending.clear(); this.verified.clear(); this.pins.clear(); this.issued.clear() }
}

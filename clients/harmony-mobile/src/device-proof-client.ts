/** Trusted reconnect proof signer for an already confirmed local grant. Reuses existing phase34/37 wire parser and bytes; no relay result or remote JSON creates a grant. */
import type { DeviceTransportBinding, DeviceChallengeId, DeviceCredentialId } from '../integration/device-auth.ts'
import type { P256IdentitySigner, E2EPrimitives } from './e2e-channel.ts'
import { pairedGrantSchema, deviceChallengeSchema, deviceChallengeBytes } from './pairing-protocol.ts'
import type { z } from 'zod'
/** A local paired record may outlive one data connection; revocation and expiry remain independent. */
export class DeviceProofClient {
  private readonly grant: z.infer<typeof pairedGrantSchema>
  private readonly used = new Set<DeviceChallengeId>()
  /** @param authority - exact local pairing-record owner. @param localGrant - locally committed phase37 acknowledgement, not broker JSON. @param desktopCredential - previously compared desktop identity. @param signer - existing native/Node identity key. @param primitives - shared maintained backend. @param clock - expiry clock. @param maxProofs - explicit lifetime signing budget. @param lifetime - local grant policy lifetime/revocation. */
  constructor(private readonly authority: object, localGrant: unknown, private readonly desktopCredential: DeviceCredentialId, private readonly signer: P256IdentitySigner, private readonly primitives: E2EPrimitives, private readonly clock: () => number, private readonly maxProofs: number, private readonly lifetime: AbortSignal) { this.grant = pairedGrantSchema.parse(localGrant); if (!Number.isSafeInteger(maxProofs) || maxProofs <= 0) throw new Error('invalid device proof budget') }
  /** @param authority - exact native owner. @param binding - newly mutually authenticated E2E object. @param candidate - desktop challenge inside that channel. @returns one scoped connection proof; signing a broker message, foreign binding or changed scope is forbidden. */
  async proof(authority: object, binding: DeviceTransportBinding, candidate: unknown): Promise<{ readonly challengeId: DeviceChallengeId; readonly signature: string }> {
    const challenge = deviceChallengeSchema.parse(candidate), grant = this.grant
    const current = () => { if (authority !== this.authority || this.lifetime.aborted || binding.signal.aborted || binding.remoteCredentialId !== this.desktopCredential || grant.expiresAt <= this.clock() || challenge.expiresAt <= this.clock()) throw new Error('device proof denied') }
    current(); if (challenge.channelBindingId !== binding.id || challenge.desktopId !== grant.desktopId || challenge.profileId !== grant.profileId || challenge.deviceId !== grant.deviceId || challenge.credentialId !== grant.credentialId || challenge.epoch !== grant.epoch || challenge.expiresAt > grant.expiresAt || this.used.has(challenge.challengeId) || this.used.size >= this.maxProofs) throw new Error('device proof denied')
    this.used.add(challenge.challengeId); if (await this.primitives.credentialId(this.signer.publicSpki) !== grant.credentialId) throw new Error('device proof denied'); current()
    const signature = await this.signer.sign(deviceChallengeBytes(challenge)); current(); return { challengeId: challenge.challengeId, signature: this.primitives.encode(signature) }
  }
}

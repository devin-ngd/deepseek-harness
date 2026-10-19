/** Shared bounded pairing fields/signing bytes. No Node, key generation, network, persistence or grant creation enters this module. */
import { z } from 'zod'
import { id } from './protocol.ts'
import { transcriptBytes } from './e2e-channel.ts'
const identifier = z.string().min(1).max(256)
/** Owned enrollment nonce identifier, independent of Session authority. */
export type EnrollmentChallengeId = ReturnType<typeof id<'harmony-enrollment-challenge'>>
/** One canonical ticket parser shared by the desktop verifier and trusted phone runtime. */
export const enrollmentChallengeSchema = z.object({ protocol: z.literal('dsh-mobile-enrollment/1'), challengeId: identifier.transform(value => id<'harmony-enrollment-challenge'>(value)), desktopId: identifier.transform(value => id<'mobile-desktop'>(value)), profileId: identifier.transform(value => id<'mobile-profile'>(value)), deviceId: identifier.transform(value => id<'mobile-device'>(value)), credentialId: identifier.transform(value => id<'harmony-device-credential'>(value)), publicSpki: z.string().min(1).max(342), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresAt: z.number().int().nonnegative() }).strict()
/** Complete enrollment fields; caller compares identity and validity against a locally selected offer. */
export type EnrollmentChallenge = z.infer<typeof enrollmentChallengeSchema>
/** @param challenge - exact owner-issued fields. @returns fixed-order domain-separated signing bytes shared by native and Node backends. */
export function enrollmentProofBytes(challenge: EnrollmentChallenge): Uint8Array { return transcriptBytes([challenge.protocol, challenge.challengeId, challenge.desktopId, challenge.profileId, challenge.deviceId, challenge.credentialId, challenge.publicSpki, challenge.nonce, challenge.expiresAt]) }
/** Existing phase34 connection proof fields, parsed before the phone signer is consulted. */
export const deviceChallengeSchema = z.object({ protocol: z.literal('dsh-mobile-device-auth/1'), challengeId: identifier.transform(value => id<'harmony-device-challenge'>(value)), desktopId: identifier.transform(value => id<'mobile-desktop'>(value)), profileId: identifier.transform(value => id<'mobile-profile'>(value)), deviceId: identifier.transform(value => id<'mobile-device'>(value)), credentialId: identifier.transform(value => id<'harmony-device-credential'>(value)), epoch: z.number().int().positive(), expiresAt: z.number().int().nonnegative(), channelBindingId: identifier.transform(value => id<'harmony-device-channel'>(value)) }).strict()
/** @param challenge - complete verified audience/epoch/binding fields. @returns existing fixed-order phase34 signing input. */
export function deviceChallengeBytes(challenge: z.infer<typeof deviceChallengeSchema>): Uint8Array { return transcriptBytes(['dsh-mobile-p256-proof/1', challenge.protocol, challenge.challengeId, challenge.desktopId, challenge.profileId, challenge.deviceId, challenge.credentialId, challenge.epoch, challenge.expiresAt, challenge.channelBindingId]) }
/** Initial scope is strictly read-only; approvals and task/rich writes are outside this unactivated pairing flow. */
export const deviceGrantOperations = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'] as const
/** Locally confirmed scope is validated on both endpoints; parsing never grants or widens any operation. */
export const pairedGrantSchema = z.object({ protocol: z.literal('dsh-mobile-device-auth/1'), desktopId: identifier.transform(value => id<'mobile-desktop'>(value)), profileId: identifier.transform(value => id<'mobile-profile'>(value)), deviceId: identifier.transform(value => id<'mobile-device'>(value)), credentialId: identifier.transform(value => id<'harmony-device-credential'>(value)), epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), sessions: z.array(identifier.transform(value => id<'SessionId'>(value))).min(1).max(16).refine(value => !value.some(session => session === '*') && new Set(value).size === value.length), operations: z.array(z.enum(deviceGrantOperations)).min(1).max(deviceGrantOperations.length).refine(value => new Set(value).size === value.length), expiresAt: z.number().int().nonnegative(), revoked: z.literal(false) }).strict()
/** Initial enrollment remains limited to the original read-only defaults. */
export const readOnlyGrantSchema = pairedGrantSchema.extend({ operations: z.array(z.enum(['session.sync', 'task.receipt'])).min(1).max(2) })
/** Scoped acknowledgement is received inside a pinned E2E channel, never a relay readiness message. */
export type ReadOnlyPairingGrant = z.infer<typeof readOnlyGrantSchema>

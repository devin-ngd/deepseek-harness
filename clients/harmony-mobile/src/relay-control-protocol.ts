/** Portable signed room-control fields. These authorize routing only, never DSH Sessions, actions, tasks or approvals. */
import { id } from './protocol.ts'
import { transcriptBytes } from './signing-bytes.ts'
import type { DeviceCredentialId } from '../integration/device-auth.ts'
import type { E2ERole, RelayRoomId } from './e2e-channel.ts'
/** Independent protocol domain prevents an enrollment/device/E2E signature from becoming a room request. */
export const RELAY_CONTROL_PROTOCOL = 'harmony-relay-control/1'
/** Exact control upgrade route, separate from opaque data frames. */
export const RELAY_CONTROL_PATH = '/harmony/relay/control/v1'
/** Control WS subprotocol contains challenge/proof/role-local room receipts only. */
export const RELAY_CONTROL_SUBPROTOCOL = 'harmony-relay-control-v1'
/** Opaque routing pair, round and proof identities convey no desktop grant. */
export type RelayPairId = ReturnType<typeof id<'harmony-relay-pair'>>
/** New connection generation shared by both roles. */
export type RelayRoundId = ReturnType<typeof id<'harmony-relay-round'>>
/** Single-use room proof identifier. */
export type RelayProofId = ReturnType<typeof id<'harmony-relay-proof'>>
/** Server-created fields are checked against locally approved identity/audience before signing. */
export interface RelayChallenge { readonly protocol: typeof RELAY_CONTROL_PROTOCOL; readonly kind: 'challenge'; readonly pairId: RelayPairId; readonly round: RelayRoundId; readonly role: E2ERole; readonly epoch: number; readonly credentialId: DeviceCredentialId; readonly audience: string; readonly challengeId: RelayProofId; readonly nonce: string; readonly expiresAt: number }
/** Each role receives only its own short-lived capability over TLS. */
export interface RelayRoomReceipt { readonly protocol: typeof RELAY_CONTROL_PROTOCOL; readonly kind: 'room'; readonly pairId: RelayPairId; readonly round: RelayRoundId; readonly role: E2ERole; readonly epoch: number; readonly room: RelayRoomId; readonly token: string; readonly expiresAt: number }
function record(candidate: unknown, keys: readonly string[]): Record<string, unknown> { if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).length !== keys.length || !keys.every(key => Object.hasOwn(candidate, key))) throw new Error('invalid relay control'); return candidate as Record<string, unknown> }
function text(value: unknown): string { if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error('invalid relay control'); return value }
function natural(value: unknown, min = 1): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error('invalid relay control'); return value }
function common(value: Record<string, unknown>): Pick<RelayChallenge, 'protocol' | 'pairId' | 'round' | 'role' | 'epoch'> { if (value.protocol !== RELAY_CONTROL_PROTOCOL || value.role !== 'phone' && value.role !== 'desktop') throw new Error('invalid relay control'); return { protocol: RELAY_CONTROL_PROTOCOL, pairId: id<'harmony-relay-pair'>(text(value.pairId)), round: id<'harmony-relay-round'>(text(value.round)), role: value.role, epoch: natural(value.epoch) } }
/** @param candidate - untrusted control challenge JSON. @returns canonical fields before any signer call. */
export function relayChallenge(candidate: unknown): RelayChallenge { const value = record(candidate, ['protocol', 'kind', 'pairId', 'round', 'role', 'epoch', 'credentialId', 'audience', 'challengeId', 'nonce', 'expiresAt']), base = common(value), credentialId = text(value.credentialId), nonce = text(value.nonce); if (value.kind !== 'challenge' || !/^p256-sha256-[a-f0-9]{64}$/.test(credentialId) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) throw new Error('invalid relay control'); return { ...base, kind: 'challenge', credentialId: id<'harmony-device-credential'>(credentialId), audience: text(value.audience), challengeId: id<'harmony-relay-proof'>(text(value.challengeId)), nonce, expiresAt: natural(value.expiresAt) } }
/** @param candidate - untrusted role-local receipt. @returns exact room fields; it confers no Session authority. */
export function relayReceipt(candidate: unknown): RelayRoomReceipt { const value = record(candidate, ['protocol', 'kind', 'pairId', 'round', 'role', 'epoch', 'room', 'token', 'expiresAt']), base = common(value), room = text(value.room), token = text(value.token); if (value.kind !== 'room' || !/^[A-Za-z0-9_-]{16,128}$/.test(room) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('invalid relay control'); return { ...base, kind: 'room', room: id<'harmony-relay-room'>(room), token, expiresAt: natural(value.expiresAt) } }
/** @param challenge - canonical fields selected for one role and generation. @returns existing shared fixed-tuple encoding with a new signature domain. */
export function relayProofBytes(challenge: RelayChallenge): Uint8Array { return transcriptBytes([RELAY_CONTROL_PROTOCOL, 'request-room', challenge.pairId, challenge.round, challenge.role, challenge.epoch, challenge.credentialId, challenge.audience, challenge.challengeId, challenge.nonce, challenge.expiresAt]) }
/** @param candidate - one control proof. @returns exact canonical challenge and bounded signature; unknown commands cannot invoke a signer or mutate trust. */
export function relayProof(candidate: unknown): { readonly challenge: RelayChallenge; readonly signature: string } { const value = record(candidate, ['challenge', 'signature']), signature = text(value.signature); if (!/^[A-Za-z0-9_-]{1,107}$/.test(signature)) throw new Error('invalid relay control'); return { challenge: relayChallenge(value.challenge), signature } }

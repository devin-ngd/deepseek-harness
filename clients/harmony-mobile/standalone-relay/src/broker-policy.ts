/** Explicit public pair trust and issuance limits. Config includes no private key, bearer token or DSH Session fields. */
import { p256CredentialId } from '../../integration/p256-public.ts'
import { id } from '../../src/protocol.ts'
import type { RelayPairId } from '../../src/relay-control-protocol.ts'
/** Approved operator/first-pairing public registration. Epoch must increase when removing or replacing either endpoint. */
export interface RelayPairTrust { readonly pairId: RelayPairId; readonly desktopPublicSpki: string; readonly phonePublicSpki: string; readonly epoch: number; readonly expiresAt: number; readonly revoked: boolean }
/** Explicit bounds apply before unauthenticated frames allocate a room or signature attempts allocate unlimited state. */
export interface BrokerPolicy { readonly enabled: true; readonly pairs: readonly RelayPairTrust[]; readonly maxPairs: number; readonly challengeTtlMs: number; readonly roomTtlMs: number; readonly maxChallengesPerConnection: number; readonly maxRoomIssuesPerWindow: number; readonly issueWindowMs: number; readonly maxOwnerRoomIssues: number; readonly maxControlPayloadBytes: number; readonly maxControlQueuedBytes: number }
/** Disabled control route preserves the default-empty standalone relay. */
export interface DisabledBroker { readonly enabled: false }
/** @param candidate - untrusted static public configuration. @returns validated pins and budgets; absent config explicitly resolves to disabled. */
export function resolveBrokerPolicy(candidate: unknown): BrokerPolicy | DisabledBroker {
  if (candidate === undefined) return { enabled: false }
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate) || !('enabled' in candidate) || typeof candidate.enabled !== 'boolean') throw new Error('invalid broker policy')
  if (!candidate.enabled) { if (Object.keys(candidate).length !== 1) throw new Error('invalid broker policy'); return { enabled: false } }
  const fields = ['enabled', 'pairs', 'maxPairs', 'challengeTtlMs', 'roomTtlMs', 'maxChallengesPerConnection', 'maxRoomIssuesPerWindow', 'issueWindowMs', 'maxOwnerRoomIssues', 'maxControlPayloadBytes', 'maxControlQueuedBytes']
  if (Object.keys(candidate).length !== fields.length || !fields.every(key => Object.hasOwn(candidate, key))) throw new Error('invalid broker policy')
  const num = (key: string) => { const value: unknown = Reflect.get(candidate, key); if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 0x7fffffff) throw new Error('invalid broker policy'); return value }
  const maxPairs = num('maxPairs'), raw: unknown = Reflect.get(candidate, 'pairs'); if (!Array.isArray(raw) || raw.length === 0 || raw.length > maxPairs) throw new Error('invalid broker policy')
  const pairs = raw.map((entry: unknown): RelayPairTrust => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== 6 || !['pairId', 'desktopPublicSpki', 'phonePublicSpki', 'epoch', 'expiresAt', 'revoked'].every(key => Object.hasOwn(entry, key))) throw new Error('invalid public pair')
    const pairId: unknown = Reflect.get(entry, 'pairId'), desktopPublicSpki: unknown = Reflect.get(entry, 'desktopPublicSpki'), phonePublicSpki: unknown = Reflect.get(entry, 'phonePublicSpki'), epoch: unknown = Reflect.get(entry, 'epoch'), expiresAt: unknown = Reflect.get(entry, 'expiresAt'), revoked: unknown = Reflect.get(entry, 'revoked')
    if (typeof pairId !== 'string' || typeof desktopPublicSpki !== 'string' || typeof phonePublicSpki !== 'string' || typeof revoked !== 'boolean' || typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch <= 0 || !revoked && epoch >= Number.MAX_SAFE_INTEGER || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0 || p256CredentialId(desktopPublicSpki) === p256CredentialId(phonePublicSpki)) throw new Error('invalid public pair')
    return Object.freeze({ pairId: id<'harmony-relay-pair'>(pairId), desktopPublicSpki, phonePublicSpki, epoch, expiresAt, revoked })
  }); if (new Set(pairs.map(pair => pair.pairId)).size !== pairs.length) throw new Error('duplicate public pair')
  const policy: BrokerPolicy = { enabled: true, pairs: Object.freeze(pairs), maxPairs, challengeTtlMs: num('challengeTtlMs'), roomTtlMs: num('roomTtlMs'), maxChallengesPerConnection: num('maxChallengesPerConnection'), maxRoomIssuesPerWindow: num('maxRoomIssuesPerWindow'), issueWindowMs: num('issueWindowMs'), maxOwnerRoomIssues: num('maxOwnerRoomIssues'), maxControlPayloadBytes: num('maxControlPayloadBytes'), maxControlQueuedBytes: num('maxControlQueuedBytes') }
  if (policy.maxControlQueuedBytes < policy.maxControlPayloadBytes) throw new Error('invalid broker policy'); return policy
}

/** Explicit app-private scope catalogue; entries describe saved records and never grant access. */
import { z } from 'zod'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { canonical, id } from './protocol.ts'
import { parsePublicTrustDocument, publicTrustRecord } from './public-trust-protocol.ts'
const text = z.string().min(1).max(256)
const descriptor = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/).transform(value => id<'mobile-trust-scope'>(value)), desktopId: text.transform(value => id<'mobile-desktop'>(value)), profileId: text.transform(value => id<'mobile-profile'>(value)), sessions: z.array(text.transform(value => id<'SessionId'>(value))).min(1) }).strict()
const catalog = z.object({ schema: z.literal('harmony-product-scopes/1'), scopes: z.array(descriptor).refine(values => new Set(values.map(value => value.key)).size === values.length) }).strict()
/** User-visible saved scope descriptor; key excludes grant epoch/expiry so only valid same-scope successors share a file. */
export type TrustScopeDescriptor = z.infer<typeof descriptor>
/** @param raw - existing validated public generation. @param maxBytes - configured public IO capacity. @returns stable file selector bound to identity, host, profile, Session and operation scope; no IO occurs. */
export function trustScope(raw: string, maxBytes: number): TrustScopeDescriptor {
  const value = publicTrustRecord(parsePublicTrustDocument(raw, maxBytes)), grant = value.paired.grant
  const identity = [value.identityAlias, value.desktopPublicSpki, value.paired.credentialId, value.paired.desktopCredentialId, value.paired.audience, grant.desktopId, grant.profileId, grant.deviceId, [...grant.sessions].sort(), [...grant.operations].sort()]
  return { key: id<'mobile-trust-scope'>(bytesToHex(sha256(new TextEncoder().encode(canonical(identity))))), desktopId: grant.desktopId, profileId: grant.profileId, sessions: [...grant.sessions] }
}
/** @param raw - selected catalogue or absent initial state. @param maxBytes - configured capacity. @returns strict saved descriptors; corrupt or duplicate entries never become an empty list. */
export function readTrustScopes(raw: string | null, maxBytes: number): TrustScopeDescriptor[] { if (raw === null) return []; if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('scope catalogue capacity'); return catalog.parse(JSON.parse(raw)).scopes }
/** @param raw - original catalogue. @param document - explicitly confirmed public generation. @param maxBytes - configured shared capacity. @returns new bounded catalogue preserving every earlier scope; it never replaces a saved document or records active authority. */
export function addTrustScope(raw: string | null, document: string, maxBytes: number): string {
  const scopes = readTrustScopes(raw, maxBytes), selected = trustScope(document, maxBytes), existing = scopes.find(item => item.key === selected.key)
  if (existing !== undefined && canonical(existing) !== canonical(selected)) throw new Error('scope descriptor conflict')
  const result = JSON.stringify({ schema: 'harmony-product-scopes/1', scopes: existing === undefined ? [...scopes, selected] : scopes })
  if (new TextEncoder().encode(result).length > maxBytes) throw new Error('scope catalogue capacity')
  return result
}

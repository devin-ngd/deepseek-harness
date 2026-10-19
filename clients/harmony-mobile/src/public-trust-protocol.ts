/** Public pairing generations and desktop-signed successor receipts; parsing never authorizes a device. */
import { z } from 'zod'
import { pairedGrantSchema } from './pairing-protocol.ts'
import { transcriptBytes } from './e2e-channel.ts'
const identifier = z.string().min(1).max(256), digest = z.string().regex(/^[a-f0-9]{64}$/), signature = z.string().regex(/^[A-Za-z0-9_-]{1,192}$/)
/** Legacy public acknowledgement remains readable and is retained unchanged inside successor history. */
export const productTrustSchema = z.object({ schema: z.literal('harmony-product-public-trust/1'), revoked: z.boolean(), desktopPublicSpki: z.string().regex(/^[A-Za-z0-9_-]{1,342}$/), identityAlias: identifier, paired: z.object({ pairId: identifier, epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), audience: z.string().regex(/^[a-z0-9.-]+$/), credentialId: identifier, desktopCredentialId: identifier, expiresAt: z.number().int().nonnegative(), grant: pairedGrantSchema }).strict() }).strict()
const receipt = z.object({ previousDigest: digest, revokedEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 2), signature }).strict()
const historyEntry = z.object({ record: productTrustSchema, receipt: receipt.nullable(), localRevoked: z.boolean() }).strict()
/** The signed history and new acknowledgement preserve predecessors; local revocation only strengthens denial. */
export const publicTrustRenewalSchema = z.object({ schema: z.literal('harmony-product-public-trust/2'), revoked: z.boolean(), record: productTrustSchema, history: z.array(historyEntry).min(1), previousDigest: digest, revokedEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 2), signature }).strict()
/** Validated original acknowledgement projected to the existing carrier. */
export type ProductTrustRecord = z.infer<typeof productTrustSchema>
/** Signed successor document; its local revoked flag cannot authorize anything. */
export type PublicTrustRenewal = z.infer<typeof publicTrustRenewalSchema>
/** Current app-private public document, including supported legacy generations. */
export type PublicTrustDocument = ProductTrustRecord | PublicTrustRenewal
const document = z.discriminatedUnion('schema', [productTrustSchema, publicTrustRenewalSchema])
/** @param raw - selected app-private public JSON. @param maxBytes - resolved storage capacity. @returns a strict document without interpreting expiry as permission. */
export function parsePublicTrustDocument(raw: string, maxBytes: number): PublicTrustDocument { if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('public trust capacity'); return document.parse(JSON.parse(raw)) }
/** @param value - parsed public document. @returns current carrier acknowledgement with sticky local revocation applied. */
export function publicTrustRecord(value: PublicTrustDocument): ProductTrustRecord { switch (value.schema) { case 'harmony-product-public-trust/1': return value; case 'harmony-product-public-trust/2': return { ...value.record, revoked: value.revoked || value.record.revoked }; default: return assertNever(value) } }
function assertNever(value: never): never { throw new Error('unsupported public trust generation: ' + String(value)) }
/** @param value - parsed predecessor. @returns its complete public generations and receipts for a successor, without dropping a local tombstone. */
export function successorHistory(value: PublicTrustDocument): PublicTrustRenewal['history'] { switch (value.schema) { case 'harmony-product-public-trust/1': return [{ record: value, receipt: null, localRevoked: value.revoked }]; case 'harmony-product-public-trust/2': return [...value.history, { record: value.record, receipt: { previousDigest: value.previousDigest, revokedEpoch: value.revokedEpoch, signature: value.signature }, localRevoked: value.revoked }]; default: return assertNever(value) } }
/** @param value - strict unsigned successor. @returns domain-separated bytes covering the new scope, complete prior records and desktop revocation floor. */
export function publicTrustRenewalBytes(value: Omit<PublicTrustRenewal, 'signature'>): Uint8Array { return transcriptBytes(['harmony-public-renewal/1', value.schema, JSON.stringify(value.record), JSON.stringify(value.history), value.previousDigest, value.revokedEpoch]) }
/** @param value - parsed document. @returns deterministic JSON used for predecessor hashing; original generations remain represented in full. */
export function canonicalPublicTrust(value: PublicTrustDocument): string { return JSON.stringify(document.parse(value)) }
/** Content-free refusal; a failed history check never permits replacing the saved document. */
export class PublicTrustHistoryError extends Error {
  /** @param code - failed history obligation, without keys or record contents. */
  constructor(readonly code: 'history' | 'anchor' | 'revoked' | 'epoch' | 'identity' | 'pair-reused' | 'expiry' | 'signature' | 'digest') { super('public trust successor denied: ' + code); this.name = 'PublicTrustHistoryError' }
}
function sameIdentity(old: ProductTrustRecord, current: ProductTrustRecord): boolean {
  const a = old.paired, b = current.paired
  return old.identityAlias === current.identityAlias && old.desktopPublicSpki === current.desktopPublicSpki && a.audience === b.audience
    && a.credentialId === b.credentialId && a.desktopCredentialId === b.desktopCredentialId && a.grant.desktopId === b.grant.desktopId
    && a.grant.profileId === b.grant.profileId && a.grant.deviceId === b.grant.deviceId && a.grant.credentialId === b.grant.credentialId
    && a.epoch === b.epoch && JSON.stringify(a.grant.sessions) === JSON.stringify(b.grant.sessions) && JSON.stringify(a.grant.operations) === JSON.stringify(b.grant.operations)
}
/** Reconstruct every retained document without dropping its signed prefix or local denial. */
function generations(value: PublicTrustDocument): PublicTrustDocument[] {
  if (value.schema === 'harmony-product-public-trust/1') { if (value.revoked) throw new PublicTrustHistoryError('revoked'); return [value] }
  const result: PublicTrustDocument[] = [], pairs = new Set<string>()
  for (const [index, entry] of value.history.entries()) {
    if (entry.localRevoked || entry.record.revoked) throw new PublicTrustHistoryError('revoked')
    if (index === 0) { if (entry.receipt !== null) throw new PublicTrustHistoryError('history'); result.push(entry.record) }
    else { if (entry.receipt === null) throw new PublicTrustHistoryError('history'); result.push({ schema: 'harmony-product-public-trust/2', revoked: entry.localRevoked, record: entry.record, history: value.history.slice(0, index), ...entry.receipt }) }
  }
  result.push(value)
  for (const [index, current] of result.entries()) {
    const record = publicTrustRecord(current)
    if (record.revoked) throw new PublicTrustHistoryError('revoked')
    if (pairs.has(record.paired.pairId)) throw new PublicTrustHistoryError('pair-reused')
    pairs.add(record.paired.pairId)
    if (index === 0) continue
    const previous = result[index - 1]!, old = publicTrustRecord(previous)
    if (current.schema !== 'harmony-product-public-trust/2' || JSON.stringify(current.history) !== JSON.stringify(successorHistory(previous))) throw new PublicTrustHistoryError('history')
    if (!sameIdentity(old, record)) throw new PublicTrustHistoryError('identity')
    if (current.revokedEpoch !== old.paired.grant.epoch + 1 || record.paired.grant.epoch !== current.revokedEpoch + 1) throw new PublicTrustHistoryError('epoch')
  }
  return result
}
function assertAnchor(chain: readonly PublicTrustDocument[], previous: PublicTrustDocument): void {
  if (publicTrustRecord(previous).revoked) throw new PublicTrustHistoryError('revoked')
  const anchor = canonicalPublicTrust(previous)
  if (!chain.slice(0, -1).some(value => canonicalPublicTrust(value) === anchor)) throw new PublicTrustHistoryError('anchor')
}
/** Platform verification input covers one signed generation and its exact complete predecessor. */
export interface PublicTrustVerificationInput { readonly bytes: readonly number[]; readonly signature: string; readonly previousCanonical: string; readonly previousDigest: string }
/** @param value - strict public document. @param previous - saved anchor when replacing a generation; absent for checking a saved document. @returns every signature/digest input, including pre-anchor receipts; callers must verify all inputs before writing or using trust. */
export function publicTrustVerificationInputs(value: PublicTrustDocument, previous?: PublicTrustDocument): readonly PublicTrustVerificationInput[] {
  const chain = generations(value)
  if (previous !== undefined) assertAnchor(chain, previous)
  return chain.slice(1).map((current, index) => {
    if (current.schema !== 'harmony-product-public-trust/2') throw new PublicTrustHistoryError('history')
    return { bytes: Array.from(publicTrustRenewalBytes(current)), signature: current.signature, previousCanonical: canonicalPublicTrust(chain[index]!), previousDigest: current.previousDigest }
  })
}
/** @param previous - exact saved complete document. @param next - final signed successor with every intermediate generation retained. @param now - local expiry clock. @returns after matching the saved anchor, consecutive grant/revocation epochs, fixed identity/scope, unique pairs, expired intermediates and a fresh final grant; all verification inputs must also pass before writing. */
export function assertPublicTrustSuccessor(previous: PublicTrustDocument, next: PublicTrustRenewal, now: number): void {
  const chain = generations(next); assertAnchor(chain, previous)
  for (const [index, value] of chain.entries()) {
    const record = publicTrustRecord(value), expired = Math.min(record.paired.expiresAt, record.paired.grant.expiresAt) <= now
    if (index === chain.length - 1 ? expired : !expired) throw new PublicTrustHistoryError('expiry')
  }
}

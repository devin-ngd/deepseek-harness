/** One-use native readiness evidence precedes the finite desktop connection budget; it never grants access or changes expiry. */
import { z } from 'zod'
import { readFile, lstat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import type { ProductTrustRecord } from '../../src/product-trust.ts'
import { id } from '../../src/protocol.ts'
const digest = z.string().regex(/^[a-f0-9]{64}$/)
/** Strict temporary file produced only after the original native UI acknowledges the final public record. */
export const phoneConnectReadySchema = z.object({ schema: z.literal('harmony-phone-connect-ready/1'), observedAt: z.number().int().nonnegative(), pairId: z.string().min(1).max(256).transform(value => id<'harmony-relay-pair'>(value)), grantEpoch: z.number().int().positive(), expiresAt: z.number().int().positive(), documentSha256: digest, planSha256: digest, targetRef: z.string().min(1).max(128), bundle: z.string().min(1).max(256), phonePid: z.number().int().positive(), state: z.literal('paired-connect-ready') }).strict()
/** Locally configured evidence file and freshness limit; no remote or guest can select these fields. */
export const connectReadyPolicySchema = z.object({ path: z.string().min(1).max(4096).refine(isAbsolute), planSha256: digest, targetRef: z.string().min(1).max(128), bundle: z.string().min(1).max(256), maxAgeMs: z.number().int().positive().max(300000) }).strict()
/** Local comparison inputs derived from the final signed document already committed by the original authorization owner. */
export interface ConnectReadyExpectation { readonly paired: ProductTrustRecord['paired']; readonly documentSha256: string; readonly policy: z.infer<typeof connectReadyPolicySchema> }
/** @param candidate - untrusted readiness-file JSON. @param expected - exact committed final record and local operator policy. @param now - owner clock. @returns canonical evidence after stale, wrong-generation, scope and expired records are refused; no expiry or retry limit changes. */
export function reviewPhoneConnectReady(candidate: unknown, expected: ConnectReadyExpectation, now: number): z.infer<typeof phoneConnectReadySchema> {
  const value = phoneConnectReadySchema.parse(candidate), policy = connectReadyPolicySchema.parse(expected.policy), paired = expected.paired
  if (value.observedAt > now || now - value.observedAt > policy.maxAgeMs || value.expiresAt <= now || paired.grant.revoked || paired.grant.expiresAt <= now || value.pairId !== paired.pairId || value.grantEpoch !== paired.grant.epoch || value.expiresAt !== paired.grant.expiresAt || value.expiresAt !== paired.expiresAt || value.documentSha256 !== expected.documentSha256 || value.planSha256 !== policy.planSha256 || value.targetRef !== policy.targetRef || value.bundle !== policy.bundle) throw new Error('phone connection readiness denied')
  return value
}
/** @param policy - selected local temporary readiness path. @param record - committed final carrier record. @param document - exact final public document, including signed history. @param clock - owner time. @returns after exclusive consumption, before any relay plugin/dial; repeated use, links, missing/stale data and expiry fail closed. */
export async function consumePhoneConnectReady(policy: z.infer<typeof connectReadyPolicySchema>, record: ProductTrustRecord, document: unknown, clock: () => number): Promise<void> {
  const path = resolve(policy.path), parent = dirname(path)
  for (let current = parent; ; current = dirname(current)) { if ((await lstat(current)).isSymbolicLink()) throw new Error('phone readiness path denied'); if (dirname(current) === current) break }
  const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 8192) throw new Error('phone readiness file denied')
  const raw = await readFile(path); if (raw.length > 8192) throw new Error('phone readiness capacity')
  const documentSha256 = createHash('sha256').update(JSON.stringify(document)).digest('hex'), value = reviewPhoneConnectReady(JSON.parse(raw.toString('utf8')), { paired: record.paired, documentSha256, policy }, clock())
  await writeFile(join(parent, 'phone-ready-consumed.json'), JSON.stringify({ at: clock(), observedAt: value.observedAt, documentSha256, planSha256: value.planSha256, pairId: value.pairId, grantEpoch: value.grantEpoch }) + '\n', { flag: 'wx', mode: 0o600 })
  reviewPhoneConnectReady(value, { paired: record.paired, documentSha256, policy }, clock())
}

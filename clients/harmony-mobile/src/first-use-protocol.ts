/** Signed public first-use exchange for one locally selected profile/Session; carries no private keys or relay join capabilities. */
import { z } from 'zod'
import { enrollmentChallengeSchema, enrollmentProofBytes, deviceGrantOperations } from './pairing-protocol.ts'
import { transcriptBytes } from './e2e-channel.ts'
/** Legacy replay fixture selection; production policy supplies its own profile. */
export const fieldProfile = 'harmony-mobile-replay'
/** Legacy replay fixture Session; production policy supplies its own Session. */
export const fieldSession = 'harmony-mobile-field-replay-session'
const publicSpki = z.string().regex(/^[A-Za-z0-9_-]{1,342}$/)
const identifier = z.string().min(1).max(256)
/** Strict desktop-signed public enrollment offer; every field participates in the signature. */
export const firstUseOfferSchema = z.object({ schema: z.literal('harmony-first-use/1'), identityAlias: z.string().regex(/^[a-z][a-z0-9-]{0,126}$/), desktopPublicSpki: publicSpki,
  audience: z.string().max(253).regex(/^[a-z0-9.-]+$/).refine(host => !host.endsWith('.invalid')), pairId: identifier, ticket: enrollmentChallengeSchema,
  sessions: z.tuple([identifier.refine(value => value !== '*')]), operations: z.array(z.enum(deviceGrantOperations)).length(deviceGrantOperations.length).refine(value => value.every((operation, index) => operation === deviceGrantOperations[index])),
  grantTtlMs: z.number().int().positive().max(1800000), signature: z.string().regex(/^[A-Za-z0-9_-]{1,192}$/) }).strict()
/** Validated first-use public exchange. */
export type FirstUseOffer = z.infer<typeof firstUseOfferSchema>
/** Phone response binds the signed offer to the exact enrollment proof; desktop approval is still required. */
export const firstUseReplySchema = z.object({ schema: z.literal('harmony-first-use-reply/1'), offer: firstUseOfferSchema, proof: z.object({ challenge: enrollmentChallengeSchema, signature: z.string().regex(/^[A-Za-z0-9_-]{1,192}$/) }).strict() }).strict()
/** @param offer - strict unsigned fields. @returns domain-separated bytes covering identity, audience, ticket and the complete limited grant request. */
export function firstUseOfferBytes(offer: Omit<FirstUseOffer, 'signature'>): Uint8Array { return transcriptBytes([offer.schema, offer.identityAlias, offer.desktopPublicSpki, offer.audience, offer.pairId, new TextDecoder().decode(enrollmentProofBytes(offer.ticket)), ...offer.sessions, ...offer.operations, offer.grantTtlMs]) }
/** Fixed validation checkpoints contain no caller input or key material. */
export type FirstUseParseStage = 'shared-parse-json' | 'shared-validate-offer' | 'shared-check-expiry'
/** @param raw - native locally pasted public offer. @param maxBytes - explicit local capacity. @param now - selected native clock. @param report - optional trusted observer of fixed validation checkpoints; observer errors stop parsing. @returns parsed current offer; no signing or IO occurs. */
export function parseFirstUseOffer(raw: string, maxBytes: number, now: number, report?: (stage: FirstUseParseStage) => void): FirstUseOffer { if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('first-use capacity'); report?.('shared-parse-json'); const value = JSON.parse(raw); report?.('shared-validate-offer'); const offer = firstUseOfferSchema.parse(value); report?.('shared-check-expiry'); if (offer.ticket.expiresAt <= now) throw new Error('first-use expired'); return offer }

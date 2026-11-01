/** Versioned device registration and short connection tickets; legacy Session grants never parse as registrations. */
import { z } from 'zod'
import { deviceGrantOperations } from './device-operations.ts'
import { transcriptBytes } from './signing-bytes.ts'

/** Fixed protocol ceiling for enrollment offers; independent from per-connection challenge budgets. */
export const MAX_DEVICE_ENROLLMENT_TTL_MS = 600000
const identifier = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const fingerprint = z.string().regex(/^p256-sha256-[a-f0-9]{64}$/)
const publicSpki = z.string().regex(/^[A-Za-z0-9_-]{1,342}$/)
const signature = z.string().regex(/^[A-Za-z0-9_-]{1,192}$/)
const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1)
const operations = z.array(z.enum(deviceGrantOperations)).min(1).max(deviceGrantOperations.length).refine(values => new Set(values).size === values.length)
/** A device policy selects current and future visible Sessions in desktop; no Session ids or wildcard Host API occur here. */
export const deviceSessionScopeSchema = z.object({ kind: z.literal('all-visible-sessions'), profileId: z.literal('desktop') }).strict()
const registrationBody = z.object({ schema: z.literal('harmony-device-binding/1'), bindingId: identifier, desktopId: identifier, profileId: z.literal('desktop'), deviceId: identifier,
  identityAlias: z.string().regex(/^[a-z][a-z0-9-]{0,126}$/), desktopPublicSpki: publicSpki, phonePublicSpki: publicSpki, desktopCredentialId: fingerprint, credentialId: fingerprint,
  audience: z.string().max(253).regex(/^[a-z0-9.-]+$/).refine(value => !value.endsWith('.invalid')), scope: deviceSessionScopeSchema, operations,
  epoch: natural.refine(value => value > 0), createdAt: natural, revoked: z.boolean() }).strict()
/** Signed persistent public registration, independent of connection expiry and existing single-Session records. */
export const deviceBindingSchema = registrationBody.extend({ signature }).strict()
/** Public registration awaiting original-phone possession and desktop-local consent. */
export const deviceBindingOfferSchema = z.object({ schema: z.literal('harmony-device-binding-offer/1'), registration: registrationBody, challengeId: identifier, nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresAt: natural, signature }).strict()
/** Signed phone response; exact offer bytes and signature are bound together. */
export const deviceBindingReplySchema = z.object({ schema: z.literal('harmony-device-binding-reply/1'), offer: deviceBindingOfferSchema, signature }).strict()
export const deviceRouteContextSchema = z.object({ routeId: identifier, routeEpoch: z.literal(1), expiresAt: natural }).strict()
export type DeviceRouteContext = z.infer<typeof deviceRouteContextSchema>
const connectionBody = z.object({ schema: z.literal('harmony-device-connection-challenge/1'), bindingId: identifier, desktopId: identifier, profileId: z.literal('desktop'), deviceId: identifier,
  credentialId: fingerprint, epoch: natural.refine(value => value > 0), challengeId: identifier, nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), channelBindingId: identifier, expiresAt: natural, route: deviceRouteContextSchema.optional() }).strict()
/** Fresh proof request sent only within the existing authenticated encrypted channel. */
export const deviceConnectionChallengeSchema = connectionBody.extend({ signature }).strict()
const ticketBody = z.object({ schema: z.literal('harmony-device-ticket/1'), ticketId: identifier, bindingId: identifier, desktopId: identifier, profileId: z.literal('desktop'), deviceId: identifier,
  credentialId: fingerprint, epoch: natural.refine(value => value > 0), channelBindingId: identifier, scope: deviceSessionScopeSchema, operations, issuedAt: natural, expiresAt: natural, route: deviceRouteContextSchema.optional() }).strict()
/** Short-lived, channel-bound public receipt; possession of this JSON is never sufficient for admission. */
export const deviceConnectionTicketSchema = ticketBody.extend({ signature }).strict().refine(value => value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 1800000)
/** Public persistent device record. */
export type DeviceBinding = z.infer<typeof deviceBindingSchema>
/** Public pending registration. */
export type DeviceBindingOffer = z.infer<typeof deviceBindingOfferSchema>
/** Public fresh connection challenge. */
export type DeviceConnectionChallenge = z.infer<typeof deviceConnectionChallengeSchema>
/** One short-lived connection receipt. */
export type DeviceConnectionTicket = z.infer<typeof deviceConnectionTicketSchema>
/** @param value - reviewed unsigned registration. @returns fixed-version signing bytes. */
export function deviceBindingBytes(value: Omit<DeviceBinding, 'signature'>): Uint8Array { return transcriptBytes(['harmony-device-binding/1', JSON.stringify(registrationBody.parse(value))]) }
/** @param value - reviewed unsigned offer. @returns bytes binding the registration, nonce and expiry. */
export function deviceBindingOfferBytes(value: Omit<DeviceBindingOffer, 'signature'>): Uint8Array { const { registration, challengeId, nonce, expiresAt } = deviceBindingOfferSchema.omit({ signature: true }).parse(value); return transcriptBytes(['harmony-device-binding-offer/1', JSON.stringify(registration), challengeId, nonce, expiresAt]) }
/** @param offer - complete desktop-signed offer. @returns phone proof bytes, including the original desktop signature. */
export function deviceBindingReplyBytes(offer: DeviceBindingOffer): Uint8Array { return transcriptBytes(['harmony-device-binding-reply/1', JSON.stringify(deviceBindingOfferSchema.parse(offer))]) }
/** @param value - reviewed unsigned connection challenge. @returns fresh proof request bytes. */
export function deviceConnectionChallengeBytes(value: Omit<DeviceConnectionChallenge, 'signature'>): Uint8Array { return transcriptBytes(['harmony-device-connection-challenge/1', JSON.stringify(connectionBody.parse(value))]) }
/** @param challenge - exact signed challenge from this encrypted channel. @returns original-phone proof bytes. */
export function deviceConnectionProofBytes(challenge: DeviceConnectionChallenge): Uint8Array { return transcriptBytes(['harmony-device-connection-proof/1', JSON.stringify(deviceConnectionChallengeSchema.parse(challenge))]) }
/** @param value - reviewed unsigned ticket. @returns channel/profile/scope-bound signing bytes. */
export function deviceConnectionTicketBytes(value: Omit<DeviceConnectionTicket, 'signature'>): Uint8Array { return transcriptBytes(['harmony-device-ticket/1', JSON.stringify(ticketBody.parse(value))]) }

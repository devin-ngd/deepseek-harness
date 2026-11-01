/** Finite relay windows signed by both original binding identities; no device authority is created here. */
import { z } from 'zod'
import { transcriptBytes } from './signing-bytes.ts'
import { deviceBindingSchema, deviceBindingBytes, type DeviceBinding } from './device-binding-protocol.ts'
/** Public verification ports only; browser schema consumers never depend on transport or Session types. */
export interface DeviceRouteVerifier { decode(value: string): Uint8Array; credentialId(publicSpki: string): Promise<string>; verify(publicSpki: string, message: Uint8Array, signature: Uint8Array): Promise<boolean> }

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const signature = z.string().regex(/^[A-Za-z0-9_-]{1,192}$/)
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1)
const body = z.object({ schema: z.literal('harmony-device-route-offer/1'), binding: deviceBindingSchema, routeId: identifier, routeEpoch: z.literal(1), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), issuedAt: time, expiresAt: time }).strict()
export const deviceRouteOfferSchema = body.extend({ signature }).strict().refine(value => !value.binding.revoked && value.routeId !== value.binding.bindingId && value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 1800000)
export const deviceRouteSchema = z.object({ schema: z.literal('harmony-device-route/1'), offer: deviceRouteOfferSchema, signature }).strict()
export type DeviceRouteOffer = z.infer<typeof deviceRouteOfferSchema>
export type DeviceRoute = z.infer<typeof deviceRouteSchema>
/** Desktop signature covers the persistent signed binding, independent route, nonce, scope and finite expiry. */
export function deviceRouteOfferBytes(value: Omit<DeviceRouteOffer, 'signature'>): Uint8Array { return transcriptBytes(['harmony-device-route-offer/1', JSON.stringify(body.parse(value))]) }
/** Phone possession is a separate domain and includes the desktop's complete signed offer. */
export function deviceRouteReplyBytes(offer: DeviceRouteOffer): Uint8Array { return transcriptBytes(['harmony-device-route/1', JSON.stringify(deviceRouteOfferSchema.parse(offer))]) }
/** Verify original binding and offer; current time is checked only for an active operation, not retained history. */
export async function verifyDeviceRouteOffer(candidate: unknown, primitives: DeviceRouteVerifier, expected?: DeviceBinding, now?: number): Promise<DeviceRouteOffer> {
  const value = deviceRouteOfferSchema.parse(candidate), { signature: bindingSignature, ...binding } = value.binding, { signature: offerSignature, ...offer } = value
  if (expected !== undefined && JSON.stringify(value.binding) !== JSON.stringify(deviceBindingSchema.parse(expected)) || now !== undefined && (value.issuedAt > now || value.expiresAt <= now)) throw new Error('device route selection or lifetime denied')
  if (await primitives.credentialId(binding.desktopPublicSpki) !== binding.desktopCredentialId || await primitives.credentialId(binding.phonePublicSpki) !== binding.credentialId
    || !await primitives.verify(binding.desktopPublicSpki, deviceBindingBytes(binding), primitives.decode(bindingSignature))
    || !await primitives.verify(binding.desktopPublicSpki, deviceRouteOfferBytes(offer), primitives.decode(offerSignature))) throw new Error('device route original signature denied')
  return value
}
/** Both signatures are required before public registration or any transport acquisition. */
export async function verifyDeviceRoute(candidate: unknown, primitives: DeviceRouteVerifier, expected?: DeviceBinding, now?: number): Promise<DeviceRoute> {
  const value = deviceRouteSchema.parse(candidate), offer = await verifyDeviceRouteOffer(value.offer, primitives, expected, now)
  if (!await primitives.verify(offer.binding.phonePublicSpki, deviceRouteReplyBytes(offer), primitives.decode(value.signature))) throw new Error('device route phone signature denied')
  return value
}

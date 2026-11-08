/** Native rich reservations are separate from workspace Host RPC and expose no device or Session selector. */
import { z } from 'zod'
const text = z.string().min(1).max(256)
const copy = z.object({ text: z.string().max(1024), image: z.string().max(1024), copied: z.string().max(1024), failed: z.string().max(1024),
  menu: z.object({ plain: z.string().max(1024), markdown: z.string().max(1024), copyLink: z.string().max(1024), openLink: z.string().max(1024), more: z.string().max(1024), selectAll: z.string().max(1024), openFailed: z.string().max(1024) }).strict().optional() }).strict()
/** Capacities fixed by native configuration, never by generated content. */
export const workspaceRichPolicySchema = z.object({ maxGuests: z.number().int().positive(), maxQueuedPackets: z.number().int().positive(), maxQueuedBytes: z.number().int().positive(), documentBytes: z.number().int().positive(), sdkBytes: z.number().int().positive(),
  guestPacketBytes: z.number().int().positive(), hostPacketBytes: z.number().int().positive(), closeTimeoutMs: z.number().int().positive() }).strict()
/** Committed content accepted from the standard plugin controller; it never names a URL or native preload. */
export const workspaceRichContentSchema = z.object({ mountId: text, mountNonce: text, html: z.string(), css: z.string(), js: z.string(), sdk: z.string().optional(), copy: copy.optional() }).strict()
/** Native accepts committed bytes and opaque reservations; the scoped rich SDK remains the only guest interface. */
export const workspaceRichRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('acquire'), request: workspaceRichContentSchema }).strict(),
  z.object({ operation: z.literal('open'), lease: text }).strict(),
  z.object({ operation: z.literal('send'), lease: text, packet: z.record(z.string(), z.json()) }).strict(),
  z.object({ operation: z.literal('release'), lease: text }).strict(),
  z.object({ operation: z.literal('ack'), lease: text, id: z.string().regex(/^[0-9]{1,16}$/) }).strict(),
])
/** Carrier-native request; it is never forwarded as an arbitrary Host API. */
export type WorkspaceRichRequest = z.infer<typeof workspaceRichRequestSchema>
/** Validated public rendering capacities. */
export type WorkspaceRichPolicy = z.infer<typeof workspaceRichPolicySchema>
/** Native-selected owner messages include control notifications that generated packets cannot send. */
export const workspaceRichOwnerPacketSchema = z.record(z.string(), z.json())
/** Native lease metadata consumed by the unchanged standard Rich controller. */
export const workspaceRichReservationSchema = z.object({ lease: text, partition: text, src: z.string().max(8192) }).strict()
/** First native-only message to a new app-owned rich document. */
export const workspaceRichDocumentInitSchema = z.object({ protocol: z.literal('harmony-workspace-rich/1'), lease: text, limits: workspaceRichPolicySchema, request: workspaceRichContentSchema }).strict()
/** @param raw - bounded trusted-workspace request. @param policyJson - native-owned limits. @returns strictly normalized native request JSON. */
export function workspaceRichRequest(raw: string, policyJson: string): string {
  const policy = workspaceRichPolicySchema.parse(JSON.parse(policyJson)), request = workspaceRichRequestSchema.parse(JSON.parse(raw)), size = (value: string) => new TextEncoder().encode(value).byteLength
  if (request.operation === 'acquire') {
    const value = request.request
    if (size(value.sdk ?? '') > policy.sdkBytes || [value.html, value.css, value.js, value.sdk ?? ''].reduce((sum, item) => sum + size(item), 0) > policy.documentBytes) throw new Error('native rich document capacity')
  } else if (request.operation === 'send' && size(JSON.stringify(request.packet)) > policy.hostPacketBytes) throw new Error('native rich packet capacity')
  return JSON.stringify(request)
}
/** @param raw - untrusted guest packet. @param maxBytes - native guest-to-owner capacity. @returns JSON object for the standard controller to validate against its exact mount. */
export function workspaceRichPacket(raw: string, maxBytes: number): string {
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('native rich packet capacity')
  const packet = z.record(z.string(), z.json()).parse(JSON.parse(raw))
  if (typeof packet.type !== 'string' || packet.type.startsWith('native.')) throw new Error('native rich guest message denied')
  return JSON.stringify(packet)
}
/** @param raw - generated-document envelope from the private native port. @param maxBytes - guest packet budget. @returns native-document correlation and normalized guest JSON. */
export function workspaceRichGuestMessage(raw: string, maxBytes: number): string {
  if (new TextEncoder().encode(raw).byteLength > maxBytes * 2 + 256) throw new Error('native rich envelope capacity')
  const envelope = z.object({ kind: z.literal('rich.packet'), id: z.string().regex(/^[0-9]{1,16}$/), packet: z.string() }).strict().parse(JSON.parse(raw))
  return JSON.stringify({ id: envelope.id, packet: workspaceRichPacket(envelope.packet, maxBytes) })
}

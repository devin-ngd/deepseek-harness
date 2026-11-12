/** Fixed encrypted carrier vocabulary. The phone never receives Peer, Gateway, operator or private signer handles. */
import { z } from 'zod'
import { fields, text } from './link-protocol.ts'
import { jsonPayload } from './wire.ts'
import type { JsonValue } from './upstream.ts'
/** Older history ends before the first retained event, pinned to the current live cut. */
export const deviceHistoryCursorSchema = z.object({
  beforeSeq: z.number().int().positive(), throughSeq: z.number().int().nonnegative(),
}).strict().refine(value => value.beforeSeq <= value.throughSeq + 1)
/** SHA-256 of the opening cut and serialized durable records, in unpadded base64url. */
export const deviceHistoryHashSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/** @param candidate - encrypted follow arguments. @returns the original route, command and resume, with an optional history-cache offer. */
export function deviceFollowRequest(candidate: unknown) {
  const offered = candidate !== null && typeof candidate === 'object' && 'historyHash' in candidate
  const value = fields(candidate, offered ? ['route', 'argument', 'resume', 'historyHash'] : ['route', 'argument', 'resume'])
  return { route: value.route, argument: value.argument, resume: value.resume,
    ...(offered ? { historyHash: deviceHistoryHashSchema.nullable().parse(value.historyHash) } : {}) }
}

/** @param value - JSON carrier frame. @returns the durable opening records for a reset, or undefined for live events. */
export function deviceOpeningHistory(value: JsonValue) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !('kind' in value) || value.kind !== 'reset') return undefined
  const payload = value.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || !('type' in payload) || payload.type !== 'snapshot'
    || !Array.isArray(payload.records) || typeof payload.cursor !== 'number' || !Number.isSafeInteger(payload.cursor) || payload.cursor < -1) throw new Error('device history snapshot denied')
  return { frame: value, payload, records: payload.records, cursor: payload.cursor }
}
/** Existing in-process profile methods remain fixed; follow is the only stream operation. */
export type CarrierRequest = { readonly kind: 'request'; readonly id: string; readonly value: JsonValue } | { readonly kind: 'follow'; readonly id: string; readonly value: JsonValue } | { readonly kind: 'stop'; readonly id: string }
/** @param candidate - decrypted device request. @returns bounded fixed carrier request; caller-selected service, namespace, peer or cookie fields reject. */
export function carrierRequest(candidate: unknown): CarrierRequest { const stop = candidate !== null && typeof candidate === 'object' && 'kind' in candidate && candidate.kind === 'stop', value = fields(candidate, stop ? ['kind', 'id'] : ['kind', 'id', 'value']), requestId = text(value.id); if (value.kind === 'stop') return { kind: 'stop', id: requestId }; if (value.kind === 'request' || value.kind === 'follow') return { kind: value.kind, id: requestId, value: jsonPayload(value.value) }; throw new Error('carrier request denied') }

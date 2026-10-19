/** Fixed encrypted carrier vocabulary. The phone never receives Peer, Gateway, operator or private signer handles. */
import { fields, text } from './link-protocol.ts'
import { jsonPayload } from './wire.ts'
import type { JsonValue } from './upstream.ts'
/** Existing in-process profile methods remain fixed; follow is the only stream operation. */
export type CarrierRequest = { readonly kind: 'request'; readonly id: string; readonly value: JsonValue } | { readonly kind: 'follow'; readonly id: string; readonly value: JsonValue } | { readonly kind: 'stop'; readonly id: string }
/** @param candidate - decrypted device request. @returns bounded fixed carrier request; caller-selected service, namespace, peer or cookie fields reject. */
export function carrierRequest(candidate: unknown): CarrierRequest { const stop = candidate !== null && typeof candidate === 'object' && 'kind' in candidate && candidate.kind === 'stop', value = fields(candidate, stop ? ['kind', 'id'] : ['kind', 'id', 'value']), requestId = text(value.id); if (value.kind === 'stop') return { kind: 'stop', id: requestId }; if (value.kind === 'request' || value.kind === 'follow') return { kind: value.kind, id: requestId, value: jsonPayload(value.value) }; throw new Error('carrier request denied') }

/** Bounded NDJSON framing and owner-bound stream cursors; payloads remain JSON until a domain decoder accepts them. */
import { fields, natural, text } from './link-protocol.ts'
import { canonical, id } from './protocol.ts'
import type { DesktopId, SessionId } from './protocol.ts'
import type { DeviceId, CommandId } from './link-protocol.ts'
import type { Branded, JsonValue } from './upstream.ts'
import { isRichJson as boundedJson } from './upstream.ts'
import { isWireCursor } from './wire-fields.ts'

function relayCursor(value: unknown): number {
  if (typeof value === 'number' && isWireCursor(value)) return value
  return natural(value)
}

/** Mobile wire generation identifier, independently of Session version and rich render revision. */
export type WireInstance = Branded<'mobile-wire-instance'>
/** Resume hint only; the server decides whether retained frames or a new snapshot can satisfy it. */
export interface WireResume { readonly instance: WireInstance | null; readonly relayCursor: number }
/** Raw domain payload with explicit generation, routing and transport sequence. */
export interface WireItem {
  readonly protocol: 'dsh-mobile-wire/1'
  readonly mode: 'fixed-replay' | 'desktop-profile'
  readonly kind: 'reset' | 'event'
  readonly desktopId: DesktopId
  readonly deviceId: DeviceId
  readonly sessionId: SessionId
  readonly instance: WireInstance
  readonly relayCursor: number
  readonly payload: JsonValue
}
/** Complete unary response; domain values are deliberately not asserted to canonical service types. */
export type WireReply = { readonly commandId: CommandId; readonly ok: true; readonly value: JsonValue }
  | { readonly commandId: CommandId; readonly ok: false; readonly code: string }
/** Transport failures are independent of whether a desktop task was accepted or completed. */
export class TransportError extends Error {
  /** @param code - stable local or remote error identity. @param options - diagnostic cause retained locally. */
  constructor(readonly code: string, options?: ErrorOptions) { super(code, options); this.name = 'TransportError' }
}
/** @param candidate - untrusted resume hint. @returns validated independent transport cursor. */
export function parseResume(candidate: unknown): WireResume {
  const value = fields(candidate, ['instance', 'relayCursor'])
  if (value.instance === null && value.relayCursor !== -1) throw new TransportError('invalid-frame')
  return { instance: value.instance === null ? null : id<'mobile-wire-instance'>(text(value.instance)),
    relayCursor: relayCursor(value.relayCursor) }
}
/** @param candidate - untrusted stream item. @returns bounded JSON with explicit wire fields. */
export function parseWireItem(candidate: unknown): WireItem {
  const value = fields(candidate, ['protocol', 'mode', 'kind', 'desktopId', 'deviceId', 'sessionId', 'instance', 'relayCursor', 'payload'])
  if (value.protocol !== 'dsh-mobile-wire/1' || value.mode !== 'fixed-replay' && value.mode !== 'desktop-profile' || value.kind !== 'reset' && value.kind !== 'event') throw new TransportError('protocol-mismatch')
  // fields() validates lossless JSON recursively; the payload remains opaque to this transport.
  const payload = value.payload
  if (payload === undefined) throw new TransportError('invalid-frame')
  return { protocol: 'dsh-mobile-wire/1', mode: value.mode, kind: value.kind,
    desktopId: id<'mobile-desktop'>(text(value.desktopId)), deviceId: id<'mobile-device'>(text(value.deviceId)),
    sessionId: id<'SessionId'>(text(value.sessionId)), instance: id<'mobile-wire-instance'>(text(value.instance)),
    relayCursor: relayCursor(value.relayCursor), payload: jsonPayload(payload) }
}
/** @param candidate - parsed JSON value. @returns bounded payload, without promoting it to a domain type. */
export function jsonPayload(candidate: unknown): JsonValue {
  // Wrapping uses the same canonical bounded JSON validator as other mobile envelopes.
  const value = fields({ payload: candidate }, ['payload'])
  const checked = value.payload
  if (checked === undefined) throw new TransportError('invalid-frame')
  // JSON validation narrows through the exported upstream predicate rather than a type assertion.
  if (!boundedJson(checked)) throw new TransportError('invalid-frame')
  return checked
}
/** @param candidate - untrusted unary frame. @param commandId - expected in-flight command. @returns exact response or remote failure. */
export function parseWireReply(candidate: unknown, commandId: CommandId): WireReply {
  if (candidate === null || typeof candidate !== 'object' || !('ok' in candidate)) throw new TransportError('invalid-frame')
  const value = fields(candidate, candidate.ok === true ? ['protocol', 'mode', 'commandId', 'ok', 'value'] : ['protocol', 'mode', 'commandId', 'ok', 'code'])
  if (value.protocol !== 'dsh-mobile-wire/1' || value.mode !== 'fixed-replay' || value.commandId !== commandId) throw new TransportError('scope-denied')
  if (value.ok === true) return { commandId, ok: true, value: jsonPayload(value.value) }
  if (value.ok !== false) throw new TransportError('invalid-frame')
  return { commandId, ok: false, code: text(value.code) }
}
/** Incremental UTF-8 decoder; a consumer must drain each push iterable before supplying another chunk. */
export class NdjsonDecoder {
  private readonly bytes: number[] = []
  private readonly decoder = new TextDecoder('utf-8', { fatal: true })
  /** @param maxFrameBytes - positive bound including the newline; coalesced frames do not bypass it. */
  constructor(private readonly maxFrameBytes: number) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 2) throw new TransportError('invalid-config')
  }
  /** @param chunk - next network bytes. @returns complete lines one at a time, with no unbounded frame queue. */
  *push(chunk: Uint8Array): Iterable<string> {
    for (const byte of chunk) {
      if (this.bytes.length + 1 > this.maxFrameBytes) throw new TransportError('frame-too-large')
      if (byte === 10) {
        let value: string
        try { value = this.decoder.decode(Uint8Array.from(this.bytes)) } catch (error) { throw new TransportError('invalid-utf8', { cause: error }) }
        this.bytes.length = 0
        if (value.length === 0 || value.endsWith('\r')) throw new TransportError('invalid-frame')
        yield value
      } else this.bytes.push(byte)
    }
  }
  /** End of body requires a complete final line; interrupted JSON is never accepted. */
  finish(): void { if (this.bytes.length !== 0) throw new TransportError('truncated-frame') }
}
/** Scope and gap checking for raw wire payloads; this class does not provide the semantic Session projection. */
export class WireCursor {
  private current: WireResume = { instance: null, relayCursor: -1 }
  private baseline = -1
  private readonly remembered = new Map<number, string>()
  /** @param owner - native-selected routing identity. @param maxRemembered - positive duplicate fingerprint cap. */
  constructor(readonly owner: Pick<WireItem, 'desktopId' | 'deviceId' | 'sessionId'>, private readonly maxRemembered: number) {
    if (!Number.isSafeInteger(maxRemembered) || maxRemembered < 1) throw new TransportError('invalid-config')
  }
  /** @returns detached hint; changing it never authorizes dispatch. */
  get resume(): WireResume { return { ...this.current } }
  /** @returns independent staged cursor; callers commit it only after domain admission succeeds. */
  fork(): WireCursor {
    const next = new WireCursor(this.owner, this.maxRemembered)
    next.current = { ...this.current }; next.baseline = this.baseline
    for (const [cursor, hash] of this.remembered) next.remembered.set(cursor, hash)
    return next
  }
  /** @param item - validated frame. @returns true when a payload advances or resets the raw mirror; exact duplicates return false. */
  apply(item: WireItem): boolean {
    if (item.desktopId !== this.owner.desktopId || item.deviceId !== this.owner.deviceId || item.sessionId !== this.owner.sessionId) throw new TransportError('scope-denied')
    if (item.kind === 'reset') {
      this.current = { instance: item.instance, relayCursor: item.relayCursor }; this.baseline = item.relayCursor; this.remembered.clear(); return true
    }
    if (this.current.instance === null || this.current.instance !== item.instance) throw new TransportError('reset-required')
    const fingerprint = canonical(item), old = this.remembered.get(item.relayCursor)
    if (old !== undefined) { if (old !== fingerprint) throw new TransportError('cursor-conflict'); return false }
    if (item.relayCursor <= this.baseline) return false
    if (item.relayCursor !== this.current.relayCursor + 1) throw new TransportError('cursor-gap')
    this.remembered.set(item.relayCursor, fingerprint)
    if (this.remembered.size > this.maxRemembered) this.remembered.delete(this.remembered.keys().next().value!)
    this.current = { instance: item.instance, relayCursor: item.relayCursor }; return true
  }
}

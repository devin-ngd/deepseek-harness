/** Host-side fixture gate for the canonical guest SDK. This is not an ArkWeb isolation proof. */
import { canonical, MobileError } from './protocol.ts'
import type { MockDesktop } from './mock.ts'
import { isRichJson, parseActionRequest, parseInvokeRequest, parseSaveDraftRequest } from './upstream.ts'

/** One isolated frame/port identity selected by trusted renderer code. */
export interface BridgeBinding {
  readonly source: object
  readonly sessionId: string
  readonly mountId: string
  readonly renderRevision: number
  readonly packetBytes: number
  readonly maxPackets: number
}

/** Detached protocol fields admitted from a bound frame or ArkWeb port. */
export interface GuestPacket {
  readonly packetId: string
  readonly seq: number
  readonly type: string
  readonly payload: Record<string, unknown>
}

/** @param raw - bounded JSON. @param source - actual carrier identity. @param binding - native-owned scope. @returns admitted guest packet shared by both mock transports. */
export function parseGuestPacket(raw: string, source: object, binding: BridgeBinding): GuestPacket {
  if (source !== binding.source) throw new MobileError('scope-mismatch')
  if (new TextEncoder().encode(raw).byteLength > binding.packetBytes) throw new MobileError('invalid-request')
  let packet: unknown
  try { packet = JSON.parse(raw) } catch (error) { throw new MobileError('invalid-request', { cause: error }) }
  if (!isRichJson(packet) || packet === null || typeof packet !== 'object' || Array.isArray(packet)) throw new MobileError('invalid-request')
  const allowed = ['protocol', 'mountId', 'renderRevision', 'packetId', 'seq', 'type', 'payload']
  if (Object.keys(packet).length !== allowed.length || Object.keys(packet).some(key => !allowed.includes(key))
    || packet.protocol !== 'lumina-rich/1' || packet.mountId !== binding.mountId || packet.renderRevision !== binding.renderRevision
    || typeof packet.packetId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(packet.packetId)
    || typeof packet.seq !== 'number' || !Number.isSafeInteger(packet.seq) || packet.seq < 1 || typeof packet.type !== 'string'
    || packet.payload === null || typeof packet.payload !== 'object' || Array.isArray(packet.payload)
    || Object.hasOwn(packet.payload, 'mountId') || Object.hasOwn(packet.payload, 'sessionId')) throw new MobileError('invalid-request')
  return { packetId: packet.packetId, seq: packet.seq, type: packet.type, payload: packet.payload }
}

/** Validates scope, packet order and method allowlist before routing untrusted JSON. */
export class GuestGate {
  private seq = 0
  private closed = false
  private readonly replies = new Map<string, { readonly packet: string; readonly result: unknown }>()
  constructor(private readonly desktop: MockDesktop, private readonly binding: BridgeBinding) {}

  /**
   * Route an untrusted message from the exact bound frame/port identity.
   * @param raw - UTF-8 bounded JSON packet.
   * @param source - actual event source, never a field provided by generated code.
   * @returns a fixture reply; rejects unsupported routing and host operations before mutation.
   */
  receive(raw: string, source: object): unknown {
    if (this.closed) throw new MobileError('stale-lease')
    const packet = parseGuestPacket(raw, source, this.binding)
    const fingerprint = canonical(packet)
    const prior = this.replies.get(packet.packetId)
    if (prior !== undefined) {
      if (prior.packet !== fingerprint) throw new MobileError('id-conflict')
      return structuredClone(prior.result)
    }
    if (packet.seq !== this.seq + 1) throw new MobileError('sequence-gap')
    if (this.replies.size >= this.binding.maxPackets) { this.close(); throw new MobileError('forbidden') }
    let result: unknown
    const payload = { ...packet.payload, sessionId: this.binding.sessionId, mountId: this.binding.mountId }
    switch (packet.type) {
      case 'ready':
      case 'resize':
      case 'render.result':
      case 'content.error':
      case 'input.error':
      case 'update.ready':
        // Fixture diagnostics cannot queue repair prompts or grant an authorization.
        result = { observed: true }; break
      case 'draft.save': {
        const request = parseSaveDraftRequest(payload)
        if (request === null) throw new MobileError('invalid-request')
        result = this.desktop.saveDraft(request); break
      }
      case 'action.invoke': {
        const request = parseInvokeRequest(payload)
        if (request === null) throw new MobileError('invalid-request')
        result = this.desktop.invoke(request); break
      }
      case 'action.status': {
        const request = parseActionRequest(payload)
        if (request === null) throw new MobileError('invalid-request')
        result = this.desktop.status(request.mountId, request.actionId); break
      }
      default: throw new MobileError('forbidden')
    }
    this.seq = packet.seq
    this.replies.set(packet.packetId, { packet: fingerprint, result: structuredClone(result) })
    return structuredClone(result)
  }

  /** Revoke before disposing the adapter mount; subsequent messages cannot mutate state. */
  close(): void { this.closed = true; this.replies.clear(); this.desktop.dispose(this.binding.mountId) }
}

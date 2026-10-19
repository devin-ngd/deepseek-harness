/** Canonical guest-to-phone routing over the synthetic relay; generated JS receives no native client or session selector. */
import { parseGuestPacket } from './bridge.ts'
import type { BridgeBinding } from './bridge.ts'
import { canonical, MobileError } from './protocol.ts'
import type { MobileOperation } from './link-protocol.ts'
import { parseActionRequest, parseInvokeRequest, parseSaveDraftRequest } from './upstream.ts'

/** Trusted request owner shared by memory fixtures and decoded network clients; never exposed to generated HTML. */
export interface GuestRequestOwner { request(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): Promise<unknown> }

/** Async scoped guest carrier shares the packet parser and original rich-inline validators. */
export class RelayGuestGate {
  private sequence = 0
  private closed = false
  private tail: Promise<unknown> = Promise.resolve()
  private readonly replies = new Map<string, { readonly fingerprint: string; readonly result: Promise<unknown> }>()

  /** @param phone - trusted native fixture client, never passed into guest JS. @param binding - carrier-owned mount and publication revision. */
  constructor(private readonly phone: GuestRequestOwner, private readonly binding: BridgeBinding) {}

  /** @param raw - untrusted JSON packet. @param source - actual bound carrier. @returns serialized operation result; identical packet retries join one request. */
  receive(raw: string, source: object): Promise<unknown> {
    if (this.closed) return Promise.reject(new MobileError('stale-lease'))
    let packet: ReturnType<typeof parseGuestPacket>
    try { packet = parseGuestPacket(raw, source, this.binding) } catch (error) { return Promise.reject(error) }
    const fingerprint = canonical(packet), old = this.replies.get(packet.packetId)
    if (old !== undefined) return old.fingerprint === fingerprint ? old.result : Promise.reject(new MobileError('id-conflict'))
    if (packet.seq !== this.sequence + 1) return Promise.reject(new MobileError('sequence-gap'))
    if (this.replies.size >= this.binding.maxPackets) return Promise.reject(new MobileError('forbidden'))
    const payload = { ...packet.payload, sessionId: this.binding.sessionId, mountId: this.binding.mountId }
    let operation: MobileOperation | null, request: Readonly<Record<string, unknown>>
    switch (packet.type) {
      case 'ready': case 'resize': case 'render.result': case 'content.error': case 'input.error': case 'update.ready':
        operation = null; request = {}; break
      case 'draft.save': {
        const parsed = parseSaveDraftRequest(payload)
        if (parsed === null) return Promise.reject(new MobileError('invalid-request'))
        operation = 'rich.saveDraft'; request = { mountId: parsed.mountId, draft: parsed.draft }; break
      }
      case 'action.invoke': {
        const parsed = parseInvokeRequest(payload)
        if (parsed === null) return Promise.reject(new MobileError('invalid-request'))
        operation = 'rich.invoke'; request = { mountId: parsed.mountId, draft: parsed.draft, actionId: parsed.actionId, actionName: parsed.actionName, targetActionId: parsed.targetActionId, expectedDataRevision: parsed.expectedDataRevision, values: parsed.values, fileGrants: parsed.fileGrants }; break
      }
      case 'action.status': {
        const parsed = parseActionRequest(payload)
        if (parsed === null) return Promise.reject(new MobileError('invalid-request'))
        operation = 'rich.status'; request = { mountId: parsed.mountId, actionId: parsed.actionId }; break
      }
      default: return Promise.reject(new MobileError('forbidden'))
    }
    this.sequence = packet.seq
    const dispatch = (): Promise<unknown> => {
      if (this.closed) return Promise.reject(new MobileError('stale-lease'))
      return operation === null ? Promise.resolve({ observed: true }) : this.phone.request(operation, request)
    }
    const result = this.tail.then(dispatch)
    // A caller receives each rejection; later status queries remain usable after a failed write.
    this.tail = result.then(() => undefined, () => undefined)
    this.replies.set(packet.packetId, { fingerprint, result })
    return result
  }
  /** Revoke local routing before awaiting in-flight requests and host disposal; never cancels durable actions. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.tail
    this.replies.clear()
    await this.phone.request('rich.dispose', { mountId: this.binding.mountId })
  }
}

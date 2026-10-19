/** App-owned MessagePort RPC; generated rich realms never receive this port or its request methods. */
import type { JsonValue, Branded } from './upstream.ts'
import { jsonPayload, TransportError } from './wire.ts'
import { object, integer, string } from './domain.ts'
import { id } from './protocol.ts'

/** Correlation for one app-native call; unrelated to desktop admission identity. */
export type NativeCallId = Branded<'mobile-native-call'>
/** Methods supplied by the app owner; HTTP activation remains native-owned and approvals have no RPC method. */
export type NativeIoMethod = 'fixture.bytes' | 'cache.read' | 'cache.write' | 'cache.clear' | 'http.begin' | 'http.read' | 'http.close'
/** Explicit limits for the private application port. */
export interface NativePortPolicy { readonly generation: number; readonly maxBytes: number; readonly maxPending: number; readonly timeoutMs: number }
/** Narrow IO face consumed by the shared core, never by a guest. */
export interface NativeIo { request(method: NativeIoMethod, value: JsonValue): Promise<JsonValue>; close(): Promise<void> }
/** Native-owned UI command after JSON admission. */
export interface NativeUiCommand { readonly id: NativeCallId; readonly method: 'connect.demo' | 'submit' | 'cancel' | 'disconnect' | 'cache.save' | 'cache.restore' | 'close'; readonly payload: JsonValue }

/** @param raw - serialized native packet. @param policy - current app generation and bounds. @returns an allowlisted UI command; guest/approval/network packets are rejected. */
export function nativeUiCommand(raw: string, policy: NativePortPolicy): NativeUiCommand {
  if (new TextEncoder().encode(raw).length > policy.maxBytes) throw new TransportError('native-packet-too-large')
  const value = object(jsonPayload(JSON.parse(raw)))
  if (Object.keys(value).some(key => !['protocol', 'kind', 'id', 'generation', 'method', 'payload'].includes(key))
    || value.protocol !== 'dsh-native-host/1' || value.kind !== 'ui' || value.generation !== policy.generation) throw new TransportError('native-packet-invalid')
  const method = string(value.method, 32)
  if (!['connect.demo', 'submit', 'cancel', 'disconnect', 'cache.save', 'cache.restore', 'close'].includes(method)) throw new TransportError('native-method-denied')
  return { id: id<'mobile-native-call'>(string(value.id, 128)), method: method as NativeUiCommand['method'], payload: jsonPayload(value.payload) }
}

/** Private carrier owns deadlines and rejection on teardown; no retry or task dispatch occurs here. */
export class NativePortClient implements NativeIo {
  private readonly pending = new Map<string, { accept: (value: JsonValue) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private counter = 0
  private closed = false
  private listener: (event: MessageEvent) => void
  /** @param port - transferred only into the app-owned document. @param policy - explicit generation, byte, concurrency and deadline caps. */
  constructor(private readonly port: MessagePort, readonly policy: NativePortPolicy) {
    for (const value of Object.values(policy)) integer(value, 1)
    this.listener = event => this.receive(event.data)
    port.addEventListener('message', this.listener); port.start()
  }
  private receive(raw: unknown): void {
    if (this.closed || typeof raw !== 'string' || new TextEncoder().encode(raw).length > this.policy.maxBytes) return
    let value: Record<string, JsonValue>
    try { value = object(jsonPayload(JSON.parse(raw))) } catch (error) { void error; return } // Invalid packets cannot select or resolve an outstanding call.
    if (Object.keys(value).some(key => !['protocol', 'kind', 'id', 'generation', 'ok', 'value', 'code'].includes(key))
      || value.protocol !== 'dsh-native-host/1' || value.kind !== 'io.reply' || value.generation !== this.policy.generation || typeof value.id !== 'string' || typeof value.ok !== 'boolean') return
    const pending = this.pending.get(value.id); if (pending === undefined) return
    if (value.ok && value.value === undefined || !value.ok && typeof value.code !== 'string') return
    clearTimeout(pending.timer); this.pending.delete(value.id)
    if (value.ok) pending.accept(value.value!)
    else pending.reject(new TransportError(string(value.code, 64)))
  }
  /** @param method - fixed app IO selector. @param value - bounded parameters; credentials and URL selection are unavailable. @returns one reply; unknown outcomes reject without retry. */
  request(method: NativeIoMethod, value: JsonValue): Promise<JsonValue> {
    if (this.closed) return Promise.reject(new TransportError('closed'))
    if (this.pending.size >= this.policy.maxPending) return Promise.reject(new TransportError('native-busy'))
    const call = 'native-io-' + ++this.counter, raw = JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'io', id: call, generation: this.policy.generation, method, payload: value })
    if (new TextEncoder().encode(raw).length > this.policy.maxBytes) return Promise.reject(new TransportError('native-packet-too-large'))
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { this.pending.delete(call); reject(new TransportError('native-timeout')) }, this.policy.timeoutMs)
      this.pending.set(call, { accept, reject, timer })
      try { this.port.postMessage(raw) } catch (error) { clearTimeout(timer); this.pending.delete(call); reject(new TransportError('native-port-lost', { cause: error })) }
    })
  }
  /** @param value - native UI view/result packet. No guest has this publishing method. */
  publish(value: JsonValue): void {
    if (this.closed) throw new TransportError('closed')
    const raw = JSON.stringify(value)
    if (new TextEncoder().encode(raw).length > this.policy.maxBytes) throw new TransportError('native-packet-too-large')
    this.port.postMessage(raw)
  }
  /** Revoke routing before rejecting owned waits and closing the port. */
  async close(): Promise<void> {
    this.closed = true; this.port.removeEventListener('message', this.listener)
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new TransportError('closed')) }
    this.pending.clear(); this.port.close()
  }
}

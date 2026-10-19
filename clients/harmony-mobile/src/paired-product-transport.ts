/** Fixed paired carrier projected as the existing PhoneCore provider. No guest receives this factory or correlation map. */
import { ConnectionSupervisor, type ConnectionRecoveryPolicy } from './connection-supervisor.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import type { NativeProvider } from './phone-core.ts'
import type { MobileCommand } from './link-protocol.ts'
import { fields } from './link-protocol.ts'
import { PROFILE_RPC_CODEC } from './profile-rpc-codec.ts'
import { jsonPayload, parseWireItem, TransportError, type WireItem, type WireResume } from './wire.ts'
import type { JsonValue } from './upstream.ts'
/** Native owns each connection's keys/socket handles; API names are the existing fixed carrier only. */
export interface ProductConnection { request(id: string, packet: string): Promise<void>; follow(id: string, packet: string): Promise<void>; stop(id: string): Promise<void>; close(): Promise<void> }
/** Transport resource policy is resolved before pairing or IO. */
export interface ProductTransportPolicy { readonly maxPending: number; readonly maxQueuedFrames: number; readonly maxPacketBytes: number; readonly timeoutMs: number; readonly recovery: ConnectionRecoveryPolicy }
interface Wait { receive(value: JsonValue, end: boolean): void; fail(error: Error): void }
/** One supervisor retains no executable command for reconnect. Reads use the PhoneCore's last admitted cursor. */
export class PairedProductTransport implements NativeProvider {
  private connection: ProductConnection | undefined
  private authorized = false
  private closed = false
  private counter = 0
  private failed = false
  private readonly pending = new Map<string, Wait>()
  private readonly ready = new Set<() => void>()
  private readonly supervisor: ConnectionSupervisor
  private report(state: string): void { try { this.status(state) } catch (error) { void error; this.failed = true } }
  private stop(action: () => void): void { try { action() } catch (error) { void error; this.failed = true } }
  private failAll(error: Error): void { for (const wait of this.pending.values()) this.stop(() => wait.fail(error)); this.pending.clear() }
  /** @param policy - explicit transport limits. @param expiresAt - local trust/grant minimum deadline. @param clock - native clock. @param scheduler - native timers. @param factory - exact locally paired IO; no endpoint JSON selector. @param status - trusted native UI connection state. @param lifetime - local revoke/foreground lifetime. */
  constructor(private readonly policy: ProductTransportPolicy, expiresAt: number, clock: () => number, private readonly scheduler: CleanupScheduler, factory: (status: (state: string) => void, received: (packet: string) => void) => Promise<ProductConnection>, private readonly status: (state: string) => void, lifetime: AbortSignal) {
    if (![policy.maxPending, policy.maxQueuedFrames, policy.maxPacketBytes, policy.timeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('invalid product transport policy')
    this.supervisor = new ConnectionSupervisor(policy.recovery, expiresAt, clock, scheduler, async ended => {
      let current: ProductConnection | undefined
      const lost = () => { this.authorized = false; this.failAll(new TransportError('transport-lost')); this.report('disconnected') }
      try { current = await factory(state => { if (this.closed) return; if (state === 'authorized') { this.authorized = true; this.report('connected'); for (const wake of this.ready) this.stop(wake) } else if (state === 'control-closed' || state === 'connection-failed') { lost(); ended() } else if (state === 'disconnected') lost() }, packet => this.receive(packet)); this.connection = current; const owned = current; return { close: async () => { lost(); if (this.connection === owned) this.connection = undefined; await owned.close() } } } catch (error) { lost(); await current?.close(); throw error }
    }, state => { if (state !== 'connecting') this.authorized = false; this.report(state); for (const wake of this.ready) this.stop(wake) }, lifetime)
  }
  /** @returns after initial transport acquisition, not authorization. */
  start(): Promise<void> { return this.supervisor.start() }
  private receive(raw: string): void {
    if (this.closed || !this.authorized) return
    try { if (new TextEncoder().encode(raw).length > this.policy.maxPacketBytes) throw new Error('capacity'); const candidate: unknown = JSON.parse(raw); if (candidate === null || typeof candidate !== 'object' || !('kind' in candidate)) throw new Error('kind'); const packet = fields(candidate, candidate.kind === 'result' || candidate.kind === 'frame' ? ['kind', 'id', 'value'] : candidate.kind === 'error' ? ['kind', 'id', 'code'] : ['kind', 'id']); if (typeof packet.id !== 'string') throw new Error('id'); const wait = this.pending.get(packet.id); if (wait === undefined) return; if (packet.kind === 'result' || packet.kind === 'frame') wait.receive(jsonPayload(packet.value), packet.kind === 'result'); else if (packet.kind === 'end') wait.receive(null, true); else if (packet.kind === 'error') wait.fail(new TransportError('unknown-outcome')); else throw new Error('kind') }
    catch (error) { void error; this.failAll(new TransportError('transport-lost')); void this.close().catch(closeError => { void closeError }) }
  }
  private async connected(signal?: AbortSignal): Promise<ProductConnection> {
    if (this.closed || signal?.aborted) throw new TransportError('closed')
    if (!this.authorized) { if (this.ready.size >= this.policy.maxPending) throw new TransportError('queue-full'); await new Promise<void>((resolve, reject) => { let cancel = () => {}; const wake = () => { if (!this.authorized && !this.closed) return; cleanup(); this.authorized ? resolve() : reject(new TransportError('closed')) }, abort = () => { cleanup(); reject(new TransportError('cancelled')) }, cleanup = () => { this.stop(cancel); this.ready.delete(wake); signal?.removeEventListener('abort', abort) }; this.ready.add(wake); signal?.addEventListener('abort', abort, { once: true }); try { cancel = this.scheduler.after(this.policy.timeoutMs, () => { cleanup(); reject(new TransportError('timeout')) }); if (signal?.aborted) abort(); else wake() } catch (error) { cleanup(); reject(error) } }) }
    if (this.connection === undefined || !this.authorized) throw new TransportError('transport-lost'); return this.connection
  }
  private argument(command: MobileCommand): string { return JSON.stringify({ method: 'request', argument: { version: PROFILE_RPC_CODEC, packet: JSON.stringify(command) } }) }
  /** @returns scoped metadata after the same original grant proof; no arbitrary method is selectable. */
  metadata(signal?: AbortSignal): Promise<JsonValue> { return this.unary(JSON.stringify({ method: 'metadata', argument: null }), signal) }
  request(command: MobileCommand, signal?: AbortSignal): Promise<JsonValue> { return this.unary(this.argument(command), signal) }
  private async unary(packet: string, signal?: AbortSignal): Promise<JsonValue> {
    if (new TextEncoder().encode(packet).length > this.policy.maxPacketBytes) throw new TransportError('queue-full')
    const connection = await this.connected(signal); if (this.pending.size >= this.policy.maxPending) throw new TransportError('queue-full'); const id = 'product-request-' + ++this.counter
    return new Promise<JsonValue>((resolve, reject) => { let cancel = () => {}; const cleanup = () => { this.stop(cancel); this.pending.delete(id); signal?.removeEventListener('abort', abort) }, abort = () => { cleanup(); reject(new TransportError('cancelled')); void connection.stop(id).catch(error => { void error }) }; this.pending.set(id, { receive: value => { cleanup(); resolve(value) }, fail: error => { cleanup(); reject(error) } }); signal?.addEventListener('abort', abort, { once: true }); try { cancel = this.scheduler.after(this.policy.timeoutMs, () => { cleanup(); reject(new TransportError('timeout')); void connection.stop(id).catch(error => { void error }) }); if (signal?.aborted) abort(); else void connection.request(id, packet).catch(error => { cleanup(); reject(error) }) } catch (error) { cleanup(); reject(error) } })
  }
  async *follow(command: MobileCommand, resume: WireResume, signal?: AbortSignal): AsyncIterable<WireItem> {
    const connection = await this.connected(signal); if (this.pending.size >= this.policy.maxPending) throw new TransportError('queue-full'); const id = 'product-follow-' + ++this.counter, queue: WireItem[] = []; let complete = false, failure: Error | undefined, wake = () => {}, cancel = () => {}
    const fail = (error: Error) => { failure = error; complete = true; wake() }, abort = () => { complete = true; wake() }
    this.pending.set(id, { receive: (value, end) => { if (end) complete = true; else { if (queue.length >= this.policy.maxQueuedFrames) { fail(new TransportError('queue-full')); return }; queue.push(parseWireItem(value)) }; wake() }, fail }); signal?.addEventListener('abort', abort, { once: true })
    try { cancel = this.scheduler.after(this.policy.timeoutMs, () => fail(new TransportError('timeout'))); if (signal?.aborted) return; await connection.follow(id, JSON.stringify({ argument: { version: PROFILE_RPC_CODEC, packet: JSON.stringify(command) }, resume })); while (!signal?.aborted) { if (queue.length > 0) { yield queue.shift()!; continue }; if (complete) break; await new Promise<void>(resolve => { wake = resolve }) }; if (failure !== undefined && !signal?.aborted) throw failure }
    finally { complete = true; try { cancel() } finally { this.pending.delete(id); signal?.removeEventListener('abort', abort); queue.length = 0 }; try { await connection.stop(id) } catch (error) { if (failure === undefined && !signal?.aborted) throw new TransportError('transport-lost', { cause: error }) } }
  }
  /** @returns after all waiters and platform connection generations retire; accepted work is never cancelled. */
  async close(): Promise<void> { if (!this.closed) { this.closed = true; this.authorized = false; this.failAll(new TransportError('closed')); for (const wake of this.ready) this.stop(wake) }; const results = await Promise.allSettled([this.supervisor.close()]); if (this.failed || results.some(result => result.status === 'rejected')) throw new Error('product transport cleanup failed') }
}

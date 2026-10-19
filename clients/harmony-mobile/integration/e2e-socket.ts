/** Shared encrypted connection owner. It accepts a maintained WSS port or a memory fake; no reconnect, grant, task or key generation is automatic. */
import { P256SecureChannel, type P256IdentitySigner } from '../src/e2e-channel.ts'
import type { JsonValue } from '../src/upstream.ts'
import type { RelaySocket } from './relay-core.ts'
import type { DeviceTransportBinding } from './device-auth.ts'
import { bindConnectionLifetime, type CleanupScheduler } from './connection-lifetime.ts'
import { E2EError } from '../src/e2e-error.ts'
/** Fixed handshake facts contain no packet bytes, identities, keys or capabilities. */
export type E2EDiagnostic = 'relay-ready' | 'peer-hello' | 'keys-derived' | 'finished-sent' | 'peer-verified' | 'frame-budget-rejected' | 'handshake-deadline' | 'closed' | `failure-${'ready' | 'hello' | 'finished' | 'data'}:${E2EError['code'] | 'format' | 'unexpected'}`
/** One serialized decrypt queue with explicit byte budget and a fixed handshake phase. */
export class EncryptedRelayConnection {
  private phase: 'ready' | 'hello' | 'finished' | 'data' | 'closed' = 'ready'
  private pending = 0
  private tail: Promise<void> = Promise.resolve()
  private readonly stops: (() => void)[] = []
  private readonly stopDeadline: () => void
  private cleanupFailed = false
  /** @param socket - owned WSS or fake carrier. @param crypto - fresh pinned channel per connection. @param signer - trusted identity signer; never a rich guest object. @param maxQueuedBytes - explicit byte budget including pending async crypto. @param delivery - host-only authenticated plaintext consumer. @param connected - host-only callback after both identity proofs. @param diagnostic - optional fixed handshake facts; omission emits nothing, and sink failures produce only a fixed fallback diagnostic. */
  constructor(private readonly socket: RelaySocket, private readonly crypto: P256SecureChannel, private readonly signer: P256IdentitySigner, maxQueuedBytes: number, private readonly delivery: (value: JsonValue) => Promise<void>, private readonly connected: (binding: DeviceTransportBinding) => void, scheduler: CleanupScheduler, handshakeMs: number, lifetime: AbortSignal, private readonly diagnostic?: (stage: E2EDiagnostic) => void) {
    if (!Number.isSafeInteger(maxQueuedBytes) || maxQueuedBytes <= 0) throw new Error('invalid encrypted queue limit')
    if (!Number.isSafeInteger(handshakeMs) || handshakeMs <= 0) throw new Error('invalid handshake deadline')
    this.stopDeadline = scheduler.after(handshakeMs, () => { this.observe('handshake-deadline'); this.close() })
    this.stops.push(socket.onEnd(() => this.close()), socket.onFrame((bytes, binary) => {
      if (this.phase === 'closed') return
      if (bytes.byteLength === 0 || this.pending + bytes.byteLength > maxQueuedBytes) { this.observe('frame-budget-rejected'); this.close(); return }
      this.pending += bytes.byteLength
      const copy = Uint8Array.from(bytes)
      this.tail = this.tail.then(async () => {
        if (this.phase === 'closed') return
        const text = new TextDecoder('utf-8', { fatal: true }).decode(copy)
        if (!binary) {
          if (this.phase !== 'ready' || text !== '{"relay":"ready","v":1}') throw new E2EError('invalid')
          this.observe('relay-ready'); this.phase = 'hello'; this.transmit(this.crypto.hello()); return
        }
        switch (this.phase) {
          case 'hello': this.observe('peer-hello'); await this.crypto.receiveHello(JSON.parse(text)); if (this.closed()) return; this.observe('keys-derived'); this.phase = 'finished'; this.transmit(await this.crypto.finish(this.signer)); this.observe('finished-sent'); break
          case 'finished': await this.crypto.acceptFinished(text); if (this.closed()) return; this.phase = 'data'; this.stopDeadline(); this.observe('peer-verified'); this.connected(this.crypto.binding()); break
          case 'data': { const value = await this.crypto.open(text); if (!this.closed()) await this.delivery(value); break }
          case 'ready': throw new E2EError('not-ready')
          default: return
        }
      }).catch(error => { const phase = this.phase; if (phase !== 'closed') this.observe(`failure-${phase}:${error instanceof E2EError ? error.code : error instanceof SyntaxError ? 'format' : 'unexpected'}`); this.close() }).finally(() => { this.pending -= copy.byteLength; copy.fill(0) })
    }))
    this.stops.push(bindConnectionLifetime(lifetime, () => this.close()))
  }
  private closed(): boolean { return this.phase === 'closed' }
  private observe(stage: E2EDiagnostic): void { if (this.diagnostic === undefined) return; try { this.diagnostic(stage) } catch (error) { void error; console.warn('DSH_E2E_DIAGNOSTIC_FAILURE') } }
  private transmit(value: object): void { if (this.closed()) return; const bytes = new TextEncoder().encode(JSON.stringify(value)); this.socket.send(bytes) }
  /** @param value - canonical authenticated application payload, containing original command identities. @returns after bounded send; receipt remains owned by desktop journal. No retry is attempted. */
  async send(value: JsonValue): Promise<void> { if (this.phase !== 'data') throw new Error('encrypted connection not ready'); try { const frame = await this.crypto.seal(value); if (this.closed()) throw new Error('encrypted connection closed'); this.transmit(frame) } catch (error) { this.close(); throw error } }
  /** @returns nothing; crypto binding aborts before socket closure, and late async results are discarded. */
  close(): void { if (this.closed()) return; this.phase = 'closed'; for (const release of [this.stopDeadline, ...this.stops, () => this.crypto.close(), () => this.socket.terminate()]) { try { release() } catch (error) { void error; this.cleanupFailed = true } }; this.observe('closed') }
  /** @returns after the currently queued asynchronous work settles; shutdown itself denies immediately. */
  async settled(): Promise<void> { await this.tail; if (this.cleanupFailed) throw new Error('encrypted connection cleanup failed') }
}

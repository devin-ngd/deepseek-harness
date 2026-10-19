/** Finite control connection recovery. It owns only transport generations, never application retries. */
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
/** Each foreground activation has a finite connection budget and an approved trust deadline. */
export interface ConnectionRecoveryPolicy { readonly maxAttempts: number; readonly retryDelayMs: number }
/** Acquired connection must release all keys, listeners and queues before replacement. */
export interface OwnedConnection { close(): Promise<void> }
/** @param policy - explicit deployment bounds. @returns after inert validation. */
export function validateRecoveryPolicy(policy: ConnectionRecoveryPolicy): void { if (![policy.maxAttempts, policy.retryDelayMs].every(value => Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff)) throw new Error('invalid connection recovery policy') }
/** Local trust/foreground lifetime ends recovery; a lost accepted command remains unknown. */
export class ConnectionSupervisor {
  private closed = false
  private started = false
  private attempts = 0
  private generation = 0
  private current: OwnedConnection | undefined
  private tail = Promise.resolve()
  private retryStop: () => void = () => {}
  private expiryStop: () => void = () => {}
  private stopLifetime: () => void = () => {}
  private closing: Promise<void> | undefined
  private failed = false
  private readonly resources = new Set<OwnedConnection>()
  private emit(value: 'connecting' | 'recovering' | 'blocked' | 'closed'): void { try { this.state(value) } catch (error) { void error; this.failed = true } }
  private async release(connection: OwnedConnection): Promise<void> { try { await connection.close(); this.resources.delete(connection) } catch (error) { void error; this.failed = true; throw new Error('connection cleanup failed') } }
  /** @param policy - finite retry limits. @param expiresAt - locally confirmed trust expiry. @param clock - trusted time. @param scheduler - owned timer port. @param open - fresh transport factory, no app request replay. @param state - content-free UI status. @param lifetime - foreground/local revocation lifetime. */
  constructor(private readonly policy: ConnectionRecoveryPolicy, private readonly expiresAt: number, private readonly clock: () => number, private readonly scheduler: CleanupScheduler, private readonly open: (ended: () => void) => Promise<OwnedConnection>, private readonly state: (value: 'connecting' | 'recovering' | 'blocked' | 'closed') => void, private readonly lifetime: AbortSignal) { validateRecoveryPolicy(policy); if (!Number.isSafeInteger(expiresAt)) throw new Error('invalid recovery expiry') }
  /** @returns after initial acquisition; authorization remains the paired owner's separate state. */
  async start(): Promise<void> {
    if (this.started || this.closed || this.lifetime.aborted || this.expiresAt <= this.clock()) throw new Error('connection activation denied'); this.started = true
    const aborted = () => { void this.close().catch(error => { void error; this.failed = true }) }; this.lifetime.addEventListener('abort', aborted, { once: true }); this.stopLifetime = () => this.lifetime.removeEventListener('abort', aborted)
    try { this.expiryStop = this.scheduler.after(this.expiresAt - this.clock(), aborted); await this.acquire() } catch (error) { void error; await this.close(); throw new Error('connection activation failed') }
  }
  private acquire(): Promise<void> {
    const generation = ++this.generation; let ended = false
    this.tail = this.tail.then(async () => {
      if (this.closed || this.lifetime.aborted || this.expiresAt <= this.clock()) return
      if (++this.attempts > this.policy.maxAttempts) { this.emit('blocked'); return }
      this.emit(this.attempts === 1 ? 'connecting' : 'recovering'); if (this.failed) throw new Error('connection observer failed')
      const finish = () => { if (ended) return; ended = true; if (!this.closed && generation === this.generation) this.recover(generation) }
      try { const connection = await this.open(finish); this.resources.add(connection); if (this.closed || ended || generation !== this.generation) { await this.release(connection); return }; this.current = connection }
      catch (error) { void error; finish() }
    }); return this.tail
  }
  private recover(generation: number): void {
    this.tail = this.tail.then(async () => {
      if (this.closed || generation !== this.generation) return; const old = this.current; if (old !== undefined) await this.release(old); this.current = undefined
      if (this.closed || this.failed) return; if (this.attempts >= this.policy.maxAttempts || this.expiresAt <= this.clock()) { this.emit('blocked'); return }
      this.emit('recovering'); if (this.failed) throw new Error('connection observer failed'); this.retryStop = this.scheduler.after(this.policy.retryDelayMs, () => { if (!this.closed) void this.acquire().catch(error => { void error; this.failed = true; this.emit('blocked'); void this.close().catch(closeError => { void closeError }) }) })
    }).catch(error => { void error; this.failed = true; this.emit('blocked'); queueMicrotask(() => { void this.close().catch(closeError => { void closeError }) }) })
  }
  /** @returns after late acquisition and current teardown; timer/listener errors remain terminal. */
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.closed = true; this.generation++; for (const action of [this.retryStop, this.expiryStop, this.stopLifetime]) { try { action() } catch (error) { void error; this.failed = true } }; this.emit('closed'); this.closing = (async () => { const tail = await Promise.allSettled([this.tail]); const cleanup = await Promise.allSettled([...this.resources].map(connection => this.release(connection))); this.current = undefined; if (this.failed || [...tail, ...cleanup].some(result => result.status === 'rejected')) throw new Error('connection cleanup failed') })(); return this.closing }
}

/** Reconnect a saved device without replaying messages or changing its pairing. */
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'

/** Platform-owned connection actions; disconnect must cancel an in-flight connection attempt. */
export interface AutomaticConnectionPort {
  available(): boolean
  connected(): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  failed(): void
}

/** One foreground/app lifetime owns one retry timer and one connection attempt. */
export class AutomaticConnection {
  private wanted = false
  private pending: Promise<void> | undefined
  private stopTimer: () => void = () => {}
  private stopping: Promise<void> | undefined
  private generation = 0
  constructor(private readonly port: AutomaticConnectionPort, private readonly scheduler: CleanupScheduler, private readonly retryDelayMs: number) {
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs <= 0 || retryDelayMs > 0x7fffffff) throw new Error('invalid reconnect interval')
  }
  private schedule(): void {
    this.stopTimer()
    if (this.wanted) this.stopTimer = this.scheduler.after(this.retryDelayMs, () => { void this.attempt().catch(error => { void error; this.port.failed() }) })
  }
  private attempt(): Promise<void> {
    if (this.pending !== undefined) return this.pending
    if (!this.wanted || !this.port.available() || this.port.connected()) { this.schedule(); return Promise.resolve() }
    const operation = Promise.resolve().then(async () => { if (this.wanted) await this.port.connect() }).finally(() => { if (this.pending === operation) this.pending = undefined; this.schedule() })
    this.pending = operation
    return operation
  }
  /** @returns after the immediate saved-device attempt; transient failures still retain the retry timer. */
  start(): Promise<void> { const generation = ++this.generation; this.wanted = true; return this.stopping === undefined ? this.attempt() : this.stopping.then(() => generation === this.generation && this.wanted ? this.attempt() : undefined) }
  /** @returns after cancellation and release; a manual stop never schedules another attempt. */
  stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping
    this.generation++; this.wanted = false; this.stopTimer()
    const pending = this.pending
    this.stopping = (async () => {
      const results = await Promise.allSettled([Promise.resolve().then(() => this.port.disconnect()), pending])
      if (pending !== undefined) await this.port.disconnect()
      if (results[0]?.status === 'rejected') throw results[0].reason
    })().finally(() => { this.stopping = undefined })
    return this.stopping
  }
}

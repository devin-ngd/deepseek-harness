/** A committed field grant aborts local UI waits at its exact expiry so the existing finally owner revokes and closes resources. */
export interface GrantDeadlineScheduler { after(ms: number, callback: () => void): () => void }
/** Owns only the grant timer; it cannot issue or extend authorization. */
export class GrantDeadline {
  readonly signal: AbortSignal
  private readonly stop: () => void
  private closed = false
  /** @param expiresAt - committed grant deadline. @param parent - original dsh cancellation. @param clock - real host time. @param scheduler - owned cancellable timer. */
  constructor(expiresAt: number, parent: AbortSignal, clock: () => number, scheduler: GrantDeadlineScheduler) {
    const remaining = expiresAt - clock(); if (!Number.isSafeInteger(expiresAt) || remaining <= 0 || parent.aborted) throw new Error('field grant deadline unavailable')
    const expiry = new AbortController(); this.signal = AbortSignal.any([parent, expiry.signal]); this.stop = scheduler.after(remaining, () => { if (!this.closed) expiry.abort() })
  }
  /** @returns after cancelling the owned timer; repeated close never revokes or creates a grant. */
  close(): void { if (this.closed) return; this.closed = true; this.stop() }
}

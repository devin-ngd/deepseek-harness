/** Explicitly mounted cleanup lifetimes. Transport loss never cancels or resubmits desktop-owned work. */
/** Injectable scheduler; tests use a fake queue and open no timers or listeners. */
export interface CleanupScheduler { after(delayMs: number, callback: () => void): () => void }
/** @param signal - authorized lease lifetime. @param cleanup - synchronous denial/key erasure/socket close. @returns disposer; an already aborted lease runs cleanup immediately. */
export function bindConnectionLifetime(signal: AbortSignal, cleanup: () => void): () => void {
  let stopped = false
  const run = () => { if (stopped) return; stopped = true; signal.removeEventListener('abort', run); cleanup() }
  if (signal.aborted) run(); else signal.addEventListener('abort', run, { once: true })
  return () => { stopped = true; signal.removeEventListener('abort', run) }
}
/** @param scheduler - owned fake or platform timer. @param intervalMs - explicit polling bound. @param sweep - policy expiry cleanup. @param failClosed - immediate denial and all-resource cleanup when sweeping fails. @returns async disposer waiting for any in-flight sweep; one task at a time. */
export function mountExpiryCleanup(scheduler: CleanupScheduler, intervalMs: number, sweep: () => Promise<void>, failClosed: () => Promise<void>): () => Promise<void> {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new Error('invalid cleanup interval')
  let stopped = false, failure: Error | undefined, cancel: () => void = () => {}, pending = Promise.resolve()
  const schedule = () => { if (!stopped) cancel = scheduler.after(intervalMs, () => {
    pending = (async () => {
      try { await sweep() }
      catch (error) {
        void error; /* Policy failures may include private details; expose only cleanup status. */ stopped = true
        try { await failClosed() } catch (cleanupError) { void cleanupError; failure = new Error('expiry cleanup failed') }
        failure ??= new Error('expiry sweep failed')
      }
      schedule()
    })()
  }) }
  schedule()
  return async () => { stopped = true; cancel(); await pending; if (failure !== undefined) throw failure }
}

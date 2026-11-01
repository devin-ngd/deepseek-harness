// @ts-check
/** Bounded UI dispatch and owned local stop; route revocation remains a separate window-owner responsibility. */
import { prepareConnectionStart } from './prepared-connection-start.mjs'

/** @typedef {{ready(): boolean, submit(): Promise<void>, cancel(): void, close(): Promise<void>}} UiAdapter */
/** @typedef {{desktop: string, phone: string}} CleanupState */
/** @typedef {{reason: string | null, dispatch: import('./prepared-connection-start.mjs').DispatchResult | null, cleanup: CleanupState | 'not-requested'}} UiStartResult */

/**
 * Wire two prepared UI adapters to the existing final-action coordinator.
 * @param {object} options - Explicit caller-owned deadlines and cancellation.
 * @param {{ready(): boolean, submit(): Promise<void>, cancel(): void, close(): Promise<void>}} options.desktop - Prepared desktop UI adapter.
 * @param {{ready(): boolean, submit(): Promise<void>, cancel(): void, close(): Promise<void>}} options.phone - Prepared phone UI adapter.
 * @param {() => number} options.clock - Same monotonic clock used by both adapters.
 * @param {{after(ms: number, callback: () => void): () => void}} options.scheduler - Owned expiry callbacks.
 * @param {number} options.actionDeadline - Final-action acknowledgment cutoff.
 * @param {number} options.cleanupDeadline - Later cutoff for reporting local cleanup, before window expiry.
 * @param {number} options.maxDispatchSkewMs - Local invocation interval budget.
 * @param {number} options.challengeTtlMs - Unchanged relay challenge TTL.
 * @param {AbortSignal} options.signal - Cancels preparation tickets and starts normal local stopping.
 * @returns {{start(): Promise<UiStartResult>, stop(): Promise<CleanupState>, settled(): Promise<CleanupState>}} Single-use owner. Desktop acknowledgment includes fresh panel verification when using the reviewed adapter; it does not establish connectivity. stop() requests local stopping; settled() only waits for an already requested stop and rejects otherwise. Pending cleanup is retained and never reported stopped early.
 */
export function createUiConnectionStart({ desktop, phone, clock, scheduler, actionDeadline, cleanupDeadline, maxDispatchSkewMs, challengeTtlMs, signal }) {
  if (!Number.isFinite(cleanupDeadline) || cleanupDeadline <= actionDeadline) throw Error('invalid UI cleanup deadline')
  const controller = new AbortController()
  /** @type {Array<['desktop' | 'phone', UiAdapter]>} */
  const adapters = [['desktop', desktop], ['phone', phone]]
  const commit = prepareConnectionStart({ desktop, phone, clock, deadline: actionDeadline, maxDispatchSkewMs, challengeTtlMs, signal: controller.signal })
  let started = false, stopActionTimer = () => {}
  /** @type {string | null} */
  let reason = null
  /** @type {Promise<CleanupState> | undefined} */
  let cleanup
  /** @type {PromiseWithResolvers<void>} */
  const interruption = Promise.withResolvers()
  const states = { desktop: 'pending', phone: 'pending' }
  const stopWork = () => {
    if (cleanup) return cleanup
    controller.abort(); stopActionTimer(); signal.removeEventListener('abort', cancelled)
    for (const [, adapter] of adapters) adapter.cancel()
    cleanup = Promise.all(adapters.map(async ([role, adapter]) => {
      try { await adapter.close(); states[role] = 'stopped' }
      catch (error) { void error; states[role] = 'failed' }
    })).then(() => ({ ...states }))
    return cleanup
  }
  /** @param {string} cause */
  const cancel = cause => { reason ??= cause; interruption.resolve(); stopWork() }
  const cancelled = () => cancel('cancelled')
  const boundedStop = async () => {
    const work = stopWork()
    if (!Number.isFinite(clock()) || clock() >= cleanupDeadline) return { ...states }
    let stopTimer = () => {}
    const deadline = new Promise(resolve => { stopTimer = scheduler.after(cleanupDeadline - clock(), () => resolve(undefined)) })
    try { await Promise.race([work, deadline]); return { ...states } } finally { stopTimer() }
  }
  signal.addEventListener('abort', cancelled, { once: true })
  if (signal.aborted) cancelled()
  return {
    async start() {
      if (started) throw Error('UI start already consumed')
      started = true
      if (reason !== null) return { reason, dispatch: null, cleanup: await boundedStop() }
      stopActionTimer = scheduler.after(Math.max(0, actionDeadline - clock()), () => cancel('action-timeout'))
      const work = commit().then(dispatch => ({ dispatch }), error => { void error; return { dispatch: null } })
      const result = await Promise.race([work, interruption.promise.then(() => ({ dispatch: null }))])
      if (reason === null && !Number.isFinite(clock())) cancel('invalid-clock')
      if (reason === null && clock() >= actionDeadline) cancel('action-timeout')
      stopActionTimer()
      if (reason === null) reason = result.dispatch?.reason ?? (result.dispatch === null ? 'action-outcome-unknown' : null)
      if (reason !== null) return { reason, dispatch: result.dispatch, cleanup: await boundedStop() }
      return { reason: null, dispatch: result.dispatch, cleanup: 'not-requested' }
    },
    async stop() { cancel('stopped'); return boundedStop() },
    async settled() { if (cleanup === undefined) throw Error('UI local stop has not been requested'); return cleanup },
  }
}

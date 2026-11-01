/** Final-action dispatch only. Caller-owned adapters retain all product confirmations, observation and cleanup. */

/** @typedef {'acknowledged' | 'unknown' | 'not-issued'} ActionOutcome */
/** @typedef {{desktop: ActionOutcome, phone: ActionOutcome, reason: string | null, dispatchSkewMs: number | null}} DispatchResult */

/**
 * Reserve one pair of already prepared final submissions; construction performs no IO.
 * `ready` checks are synchronous, side-effect-free checks of the reviewed local selection. `submit` issues its
 * final action immediately and returns its bounded action acknowledgment, not a handshake/room wait.
 * Callers must retain each adapter until its acknowledgment and normal cleanup have settled, including failures.
 * No authorization, identity, route, network port, retry or automatic cleanup is created by this helper.
 * @param {object} options - Local operation policy and caller-owned adapters.
 * @param {{ready(): boolean, submit(): Promise<void>}} options.desktop - Final desktop confirmation submission.
 * @param {{ready(): boolean, submit(): Promise<void>}} options.phone - Final phone connect submission, with consent already prepared.
 * @param {() => number} options.clock - Monotonic clock for the dispatch budget.
 * @param {number} options.deadline - Last allowed final-action time on that clock, before the route cleanup cutoff.
 * @param {number} options.maxDispatchSkewMs - Maximum separation between local submissions; below the configured challenge TTL.
 * @param {number} options.challengeTtlMs - Existing relay challenge TTL; never changed by this operation.
 * @param {AbortSignal} options.signal - Caller cancellation; never authorizes another attempt.
 * @returns {() => Promise<DispatchResult>} Single-use commit; acknowledgments do not establish connectivity or cleanup. A synchronous submission error blocks the second action; an asynchronous error leaves issued actions uncertain. Adapter checks may throw before dispatch.
 */
export function prepareConnectionStart({ desktop, phone, clock, deadline, maxDispatchSkewMs, challengeTtlMs, signal }) {
  if (!Number.isFinite(deadline) || ![maxDispatchSkewMs, challengeTtlMs].every(Number.isSafeInteger) || maxDispatchSkewMs < 1 || maxDispatchSkewMs >= challengeTtlMs) throw new Error('invalid connection start budget')
  let consumed = false
  return async () => {
    if (consumed) throw new Error('connection start already consumed')
    consumed = true
    /** @param {string} reason @returns {DispatchResult} */
    const refused = reason => ({ desktop: 'not-issued', phone: 'not-issued', reason, dispatchSkewMs: null })
    if (signal.aborted) return refused('cancelled')
    if (!desktop.ready() || !phone.ready()) return refused('not-ready')
    if (signal.aborted) return refused('cancelled')
    const startedAt = clock()
    if (!Number.isFinite(startedAt)) return refused('invalid-clock')
    if (startedAt >= deadline) return refused('expired')
    let synchronousFailure = false
    /** @param {{submit(): Promise<void>}} adapter @returns {Promise<ActionOutcome>} */
    const submit = adapter => {
      try { return Promise.resolve(adapter.submit()).then(() => 'acknowledged', error => { void error; return 'unknown' }) }
      catch (error) { void error; synchronousFailure = true; return Promise.resolve('unknown') }
    }
    const desktopAck = submit(desktop), nextAt = clock(), dispatchSkewMs = nextAt - startedAt
    const blocked = synchronousFailure ? 'action-outcome-unknown' : signal.aborted ? 'cancelled' : !Number.isFinite(nextAt) ? 'invalid-clock' : nextAt >= deadline ? 'expired' : dispatchSkewMs < 0 || dispatchSkewMs >= maxDispatchSkewMs ? 'dispatch-budget-exceeded' : null
    /** @type {Promise<ActionOutcome>} */
    const phoneAck = blocked === null ? submit(phone) : Promise.resolve('not-issued')
    const [desktopResult, phoneResult] = await Promise.all([desktopAck, phoneAck])
    const reason = blocked ?? (desktopResult === 'unknown' || phoneResult === 'unknown' ? 'action-outcome-unknown' : signal.aborted ? 'cancelled' : null)
    return { desktop: desktopResult, phone: phoneResult, reason, dispatchSkewMs }
  }
}

/** Fixed serial reservations for one finite MVP window; import and planning never open a connection. */
export class MvpWindowBudgetError extends Error {
  constructor(code, phase) { super(code); this.name = 'MvpWindowBudgetError'; this.code = code; this.phase = phase }
}

/**
 * Reserve bounded preparation and connection, concurrent messages/observation, and cleanup before route side effects.
 * @param {object} options - Timestamps use epoch milliseconds and durations use milliseconds; callers supply each actual expiry and recheck after preparation.
 * @param {number} options.now - Current epoch timestamp.
 * @param {{authorization: number, route: number, relay: number}} options.expiresAt - Independent cutoffs with their existing safety margins already applied.
 * @param {{prepare: number, connect: number, messages: number, observe: number, cleanup: number}} options.durations - Messages and connected sampling share one owner and run concurrently. Preparation may be zero at final admission.
 * @returns {Readonly<{startAt: number, hardExpiresAt: number, cleanupBy: number, totalReservedMs: number}>} Fixed local cutoff; rejects unless the entire remaining workflow fits strictly before every expiry.
 */
export function planConcurrentMvpWindow({ now, expiresAt, durations }) {
  if (!Number.isSafeInteger(now) || ![expiresAt.authorization, expiresAt.route, expiresAt.relay].every(Number.isSafeInteger) || !Number.isSafeInteger(durations.prepare) || durations.prepare < 0 || ![durations.connect, durations.messages, durations.observe, durations.cleanup].every(value => Number.isSafeInteger(value) && value > 0) || durations.observe <= 180000) throw new MvpWindowBudgetError('invalid-budget', 'plan')
  const hardExpiresAt = Math.min(expiresAt.authorization, expiresAt.route, expiresAt.relay)
  const workMs = durations.prepare + durations.connect + Math.max(durations.messages, durations.observe)
  const totalReservedMs = workMs + durations.cleanup
  if (!Number.isSafeInteger(totalReservedMs) || !Number.isSafeInteger(now + totalReservedMs)) throw new MvpWindowBudgetError('invalid-budget', 'plan')
  if (now + totalReservedMs >= hardExpiresAt) throw new MvpWindowBudgetError('insufficient-time', 'plan')
  return Object.freeze({ startAt: now, hardExpiresAt, cleanupBy: now + workMs, totalReservedMs })
}

/** @typedef {'connect' | 'reply' | 'stop' | 'observe' | 'cleanup'} MvpPhase */
/** @typedef {{connect: number, reply: number, stop: number, observe: number, cleanup: number}} MvpPhaseTimes */
/** @typedef {Readonly<{startAt: number, hardExpiresAt: number, hardExpiresAtEpoch: number, observationMs: number, maxObservationGapMs: number, deadlines: Readonly<MvpPhaseTimes>, durations: Readonly<MvpPhaseTimes>}>} MvpWindowPlan */

/**
 * Reserve connection, first reply, second generation/stop, a full observation interval, and cleanup.
 * @param {object} options - Signed expiry values use epoch milliseconds; phase deadlines use the shared monotonic clock. Durations are explicit milliseconds.
 * @param {() => number} options.clock - Shared monotonic clock.
 * @param {() => number} [options.epochClock] - Epoch clock, default Date.now; conversion is captured conservatively once and later checks still honor actual wall-clock expiry.
 * @param {{authorization: number, route: number, relay: number}} options.expiresAt - Actual independent expiry limits, including the relay service's earlier shutdown if configured.
 * @param {MvpPhaseTimes} options.durations - Serial phase reservations, including observation sampling margin and cleanup verification.
 * @param {number} [options.observationMs] - At least three minutes; defaults to the requested 180000 ms.
 * @param {number} options.maxObservationGapMs - Largest accepted interval between fresh connected samples.
 * @returns {{plan: MvpWindowPlan, clock: () => number, check(phase: MvpPhase): number}} Frozen deadlines never move; checks throw before dependent work. Planning rejects less than three minutes of observation or insufficient shared time. The observation phase must include sampling margin beyond observationMs.
 */
export function createMvpWindowBudget({ clock, epochClock = Date.now, expiresAt, durations, observationMs = 180000, maxObservationGapMs }) {
  const phases = ['connect', 'reply', 'stop', 'observe', 'cleanup']
  if (typeof clock !== 'function' || typeof epochClock !== 'function' || ![expiresAt.authorization, expiresAt.route, expiresAt.relay].every(Number.isFinite) || !phases.every(p => Number.isSafeInteger(durations[p]) && durations[p] > 0) || !Number.isSafeInteger(observationMs) || observationMs < 180000 || durations.observe <= observationMs || !Number.isSafeInteger(maxObservationGapMs) || maxObservationGapMs <= 0 || maxObservationGapMs >= observationMs) throw new MvpWindowBudgetError('invalid-budget', 'plan')
  let last = clock(), lastEpoch = epochClock()
  if (!Number.isFinite(last) || !Number.isFinite(lastEpoch)) throw new MvpWindowBudgetError('invalid-clock', 'plan')
  const startAt = last, hardExpiresAtEpoch = Math.min(expiresAt.authorization, expiresAt.route, expiresAt.relay), hardExpiresAt = startAt + hardExpiresAtEpoch - lastEpoch, deadlines = {}
  let at = startAt
  for (const phase of phases) { at += durations[phase]; if (!Number.isFinite(at) || Math.abs(at) > Number.MAX_SAFE_INTEGER) throw new MvpWindowBudgetError('invalid-budget', 'plan'); deadlines[phase] = at }
  if (at >= hardExpiresAt) throw new MvpWindowBudgetError('insufficient-time', 'plan')
  const plan = Object.freeze({ startAt, hardExpiresAt, hardExpiresAtEpoch, observationMs, maxObservationGapMs, deadlines: Object.freeze(deadlines), durations: Object.freeze({ ...durations }) })
  return Object.freeze({ plan, clock, check(phase) {
    if (!phases.includes(phase)) throw new MvpWindowBudgetError('invalid-phase', phase)
    const now = clock(), epoch = epochClock()
    if (!Number.isFinite(now) || now < last || !Number.isFinite(epoch) || epoch < lastEpoch) throw new MvpWindowBudgetError('invalid-clock', phase)
    last = now; lastEpoch = epoch
    if (epoch >= hardExpiresAtEpoch || now >= plan.deadlines[phase]) throw new MvpWindowBudgetError('deadline', phase)
    return now
  } })
}

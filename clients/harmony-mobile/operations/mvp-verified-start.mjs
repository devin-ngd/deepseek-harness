// @ts-check
/** Compose the reviewed connection owner with the two-message flow; no IO runs at import. */
import { createMvpMessageFlow, MvpFlowError } from './mvp-message-flow.mjs'
import { MvpWindowBudgetError } from './mvp-window-budget.mjs'

/**
 * @param {ReturnType<import('./connection-ui-start.mjs').createUiConnectionStart>} connection - Single-use UI owner whose desktop adapter verifies the current panel after clicking.
 * @param {{run(): Promise<object>}} messages - Prepared two-message flow, which also requires a connected phone.
 * @returns {Promise<{connection: import('./connection-ui-start.mjs').UiStartResult, messages: object | null}>} Message work is never invoked after an unverified start. Success retains the connection for the caller's timed observation; the caller owns stop/settled and independent route cleanup on every outcome, including message failure.
 */
export async function startVerifiedMvpMessages(connection, messages) {
  const result = await connection.start()
  if (result.reason !== null) return { connection: result, messages: null }
  return { connection: result, messages: await messages.run() }
}

/**
 * @param {ReturnType<import('./connection-ui-adapters.mjs').createDesktopUiAdapter>} desktop - Caller-owned adapter with the current normal confirmation already reviewed.
 * @param {ReturnType<import('./connection-ui-adapters.mjs').createPhoneUiAdapter>} phone - Caller-owned phone adapter with consent prepared.
 * @param {() => ReturnType<import('./connection-ui-start.mjs').createUiConnectionStart>} createConnection - Synchronous factory with fresh deadlines; must retain the owner for cleanup before returning it.
 * @param {{run(): Promise<object>}} messages - One prepared message flow.
 * @returns {Promise<{connection: import('./connection-ui-start.mjs').UiStartResult, messages: object | null}>} Prepare both adapters and start in the same call, with no operator wait between readiness and dispatch. The caller owns both adapters on preparation failure and the retained connection owner thereafter; stop/settled and independent relay cleanup remain mandatory on every outcome.
 */
export async function prepareAndStartVerifiedMvpMessages(desktop, phone, createConnection, messages) {
  await Promise.all([desktop.prepare(), phone.prepare()])
  return startVerifiedMvpMessages(createConnection(), messages)
}

/**
 * Own window preparation, budget admission, normal confirmation, two messages, three-minute observations, and awaited cleanup.
 * @param {object} options - Original adapters and bounded preparation ports. Launching this promise does not grant admission; only this driver invokes prepareConnection after the budget checks pass.
 * @param {ReturnType<import('./connection-ui-adapters.mjs').createDesktopUiAdapter>} options.desktop - Original desktop adapter.
 * @param {ReturnType<import('./connection-ui-adapters.mjs').createPhoneUiAdapter>} options.phone - Original phone adapter.
 * @param {(budget: ReturnType<import('./mvp-window-budget.mjs').createMvpWindowBudget>) => ReturnType<import('./connection-ui-start.mjs').createUiConnectionStart>} options.createConnection - Fresh owner, created only after confirmation and both adapter preparations settle; uses the admitted fixed deadlines.
 * @param {Parameters<typeof createMvpMessageFlow>[0] & {clock: () => number, signal: AbortSignal}} options.messageOptions - One phone UI operator, journal and exact target.
 * @param {(context: {signal: AbortSignal}) => Promise<ReturnType<import('./mvp-window-budget.mjs').createMvpWindowBudget>>} options.prepareWindow - Complete slow runtime and input preparation before creating a finite route, then settle route/public-field preparation and construct the fixed budget from actual remaining expiries. Never open connection confirmation, connect or send messages here. Cleanup owns any partial window even if this port rejects during budget construction.
 * @param {(context: {budget: ReturnType<import('./mvp-window-budget.mjs').createMvpWindowBudget>, signal: AbortSignal}) => Promise<void>} options.prepareConnection - Open and prepare the normal confirmation only after admission; never submit it. Its elapsed time consumes the connection reservation. Both preparations must settle before cleanup; cancellation does not abandon a late port.
 * @param {number} options.maxObservationReads - Positive finite observation cap, at least two.
 * @param {(context: {connection: ReturnType<import('./connection-ui-start.mjs').createUiConnectionStart> | undefined, desktop: ReturnType<import('./connection-ui-adapters.mjs').createDesktopUiAdapter>, phone: ReturnType<import('./connection-ui-adapters.mjs').createPhoneUiAdapter>, failure: object | null, messages: object | null, deadline: number | undefined}) => Promise<void>} options.cleanup - Independent accepted-task, adapter and remote cleanup owner; rejects unless verified. A missing deadline means budget construction failed, so the already armed window owner supplies its independent finite cutoff.
 * @returns {Promise<object>} Separate admission, verification and cleanup outcomes. Cleanup always runs and is awaited, including window preparation or budget failure. cleanupLate is null when no budget was constructed; it does not claim cleanup was on time. No confirmation or message work may run outside this invocation.
 */
export async function runBudgetedMvpVerification({ desktop, phone, createConnection, messageOptions, prepareWindow, prepareConnection, maxObservationReads, cleanup }) {
  /** @type {ReturnType<import('./mvp-window-budget.mjs').createMvpWindowBudget> | undefined} */
  let budget
  let connection, start = null, messages = null, stability = null, failure = null, cleanupFailure = null, admitted = false, phase = 'prepare-window'
  /** @type {boolean | null} */
  let cleanupLate = null
  try {
    if (!Number.isSafeInteger(maxObservationReads) || maxObservationReads < 2 || typeof cleanup !== 'function') throw new MvpWindowBudgetError('invalid-budget', 'plan')
    messageOptions.signal.throwIfAborted()
    budget = await prepareWindow({ signal: messageOptions.signal })
    cleanupLate = false
    messageOptions.signal.throwIfAborted()
    budget.check('connect')
    if (messageOptions.clock !== budget.clock) throw new MvpWindowBudgetError('invalid-budget', 'plan')
    const flow = createMvpMessageFlow({ ...messageOptions, budget, deadline: budget.plan.deadlines.stop })
    admitted = true; phase = 'prepare-connection'
    await prepareConnection({ budget, signal: messageOptions.signal })
    messageOptions.signal.throwIfAborted()
    budget.check('connect')
    phase = 'prepare-adapters'
    const prepared = await Promise.allSettled([desktop.prepare(), phone.prepare()])
    const failedPreparation = prepared.find(value => value.status === 'rejected')
    if (failedPreparation?.status === 'rejected') throw failedPreparation.reason
    budget.check('connect')
    messageOptions.signal.throwIfAborted()
    phase = 'verify'
    connection = createConnection(budget)
    const result = await startVerifiedMvpMessages(connection, flow)
    start = result.connection; messages = result.messages
    if (start.reason !== null) failure = { code: start.reason, phase: 'connect' }
    else stability = await flow.observeConnection(maxObservationReads)
  } catch (error) {
    failure = { code: error instanceof MvpFlowError || error instanceof MvpWindowBudgetError ? error.code : messageOptions.signal.aborted ? 'cancelled' : 'verification-failed', ...(error instanceof MvpFlowError ? { effects: error.effects } : {}), phase: error instanceof MvpWindowBudgetError || error instanceof MvpFlowError ? error.phase : phase }
  } finally {
    try { budget?.check('cleanup') } catch (error) { void error; cleanupLate = true }
    try { await cleanup({ connection, desktop, phone, failure, messages, deadline: budget?.plan.deadlines.cleanup }) } catch (error) { void error; cleanupFailure = 'cleanup-unverified' }
    try { budget?.check('cleanup') } catch (error) { void error; cleanupLate = true }
  }
  return { passed: admitted && failure === null && cleanupFailure === null && cleanupLate === false, admitted, start, messages, stability, failure, cleanupFailure, cleanupLate }
}

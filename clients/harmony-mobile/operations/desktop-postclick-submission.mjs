// @ts-check
/** Execute a reviewed desktop click and its bounded read-only verification in one host call. */
import { desktopSubmissionState, DesktopSubmissionError } from './desktop-connection-observation.mjs'

/** @typedef {import('./desktop-connection-observation.mjs').DesktopState} DesktopState */
/** @typedef {{schema: 'dsh-desktop-submission/1', click: 'not-issued' | 'unknown' | 'acknowledged', states: DesktopState[], failure: string | null}} SubmissionReceipt */

/**
 * Run inside the host that owns the supported Computer Use client, after visual confirmation review.
 * @param {object} options - No application discovery, consent, route or connection retry is performed.
 * @param {{click(input: object): Promise<void>, activate_window(input: object): Promise<void>, get_window_state(input: object): Promise<DesktopState>}} options.sky - Original supported window2 client.
 * @param {{window: {app: string, id: number}, element_index: number}} options.input - Exact button from the reviewed observation; clicked once.
 * @param {{profileId: string, sessionId: string}} options.session - Exact expected Session.
 * @param {import('./desktop-connection-observation.mjs').DesktopLabels} options.labels - Current panel labels.
 * @param {number} options.maxObservations - Positive bound on fresh post-click captures.
 * @param {(signal: AbortSignal) => Promise<void>} options.pause - Owned cancellable pacing between pending frames.
 * @param {AbortSignal} options.signal - Local cancellation; in-flight actions remain awaited.
 * @param {() => number} options.clock - Same clock as deadline, checked before and after awaited work.
 * @param {number} options.deadline - Existing action cutoff; never extended here.
 * @returns {Promise<string>} JSON receipt without screenshot bytes. Click acknowledgment and verification failure remain separate; callers still own stopping and must validate the receipt.
 */
export function submitDesktopAndObserve({ sky, input, session, labels, maxObservations, pause, signal, clock, deadline }) {
  if (!Number.isSafeInteger(maxObservations) || maxObservations <= 0 || !Number.isFinite(deadline)) throw Error('invalid desktop submission budget')
  /** @type {SubmissionReceipt} */
  const receipt = { schema: 'dsh-desktop-submission/1', click: 'not-issued', states: [], failure: null }
  let last = -Infinity
  const check = () => {
    signal.throwIfAborted()
    const now = clock()
    if (!Number.isFinite(now) || now < last) throw new DesktopSubmissionError('desktop-submission-clock-invalid')
    last = now
    if (now >= deadline) throw new DesktopSubmissionError('desktop-submission-deadline')
  }
  check(); receipt.click = 'unknown'
  const clicked = sky.click(input)
  return clicked.then(async () => {
    receipt.click = 'acknowledged'; check()
    for (let n = 0; n < maxObservations; n++) {
      await sky.activate_window({ window: input.window }); check()
      const state = await sky.get_window_state({ window: input.window, include_screenshot: true, include_text: true }); check()
      if (state.window?.app !== input.window.app || state.window?.id !== input.window.id) throw new DesktopSubmissionError('desktop-window-changed')
      receipt.states.push({ window: state.window, accessibility: state.accessibility })
      if (desktopSubmissionState(state, session, labels) === 'verified') return JSON.stringify(receipt)
      if (n + 1 < maxObservations) { await pause(signal); check() }
    }
    throw new DesktopSubmissionError('desktop-submission-unverified')
  }).catch(error => {
    receipt.failure = error instanceof DesktopSubmissionError ? error.code : signal.aborted ? 'cancelled' : receipt.click === 'unknown' ? 'desktop-click-unknown' : 'desktop-observation-failed'
    return JSON.stringify(receipt)
  })
}

/** @param {unknown} value @returns {value is Record<string, unknown>} Whether a parsed JSON value is an object record. */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Validate a host receipt at the process boundary; the adapter independently checks each current panel.
 * @param {string} raw - Serialized host result, never a success boolean.
 * @param {number} maxObservations - Original capture limit.
 * @returns {SubmissionReceipt} Validated acknowledgment, observed fields and independent failure.
 */
export function readDesktopSubmissionReceipt(raw, maxObservations) {
  /** @type {unknown} */
  let value
  try { value = JSON.parse(raw) } catch (error) { throw new DesktopSubmissionError('desktop-receipt-invalid', error) }
  if (!record(value) || value.schema !== 'dsh-desktop-submission/1' || !Array.isArray(value.states) || value.states.length > maxObservations || (value.failure !== null && typeof value.failure !== 'string')) throw new DesktopSubmissionError('desktop-receipt-invalid')
  const click = value.click
  if (click !== 'not-issued' && click !== 'unknown' && click !== 'acknowledged') throw new DesktopSubmissionError('desktop-receipt-invalid')
  if (click !== 'acknowledged' && value.states.length !== 0) throw new DesktopSubmissionError('desktop-receipt-invalid')
  /** @type {unknown[]} */
  const rawStates = value.states
  const states = rawStates.map(state => {
    if (!record(state) || !record(state.window) || typeof state.window.app !== 'string' || !Number.isSafeInteger(state.window.id) || typeof state.window.id !== 'number') throw new DesktopSubmissionError('desktop-receipt-invalid')
    const accessibility = state.accessibility
    if (accessibility !== undefined && accessibility !== null && (!record(accessibility) || typeof accessibility.tree !== 'string')) throw new DesktopSubmissionError('desktop-receipt-invalid')
    return { window: { app: state.window.app, id: state.window.id }, accessibility: record(accessibility) ? { tree: String(accessibility.tree) } : null }
  })
  return { schema: 'dsh-desktop-submission/1', click, states, failure: value.failure }
}

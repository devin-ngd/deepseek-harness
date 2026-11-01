// @ts-check
/** Read current window2 accessibility output; transcript messages and click acknowledgments are not transport evidence. */

/** @typedef {{buttonRole: string, editRole: string, headingRole: string, publicResult: string, pendingHeading: string, submitAnswer: string}} DesktopLabels */
/** @typedef {{window: {app: string, id: number}, accessibility?: {tree?: string} | null}} DesktopState */

/** A failed UI observation never authorizes another final click. */
export class DesktopSubmissionError extends Error {
  /** @param {string} code - Stable local diagnostic. @param {unknown} [cause] - Original local failure, omitted from display text. */
  constructor(code, cause) { super(code, { cause }); this.name = 'DesktopSubmissionError'; this.code = code }
}

/** @param {string} value */
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {DesktopState} state - Fresh, already owner-checked window2 observation.
 * @param {{elementIndex?: number, elementText?: string}} decision - Button reviewed in this exact observation.
 * @param {DesktopLabels} labels - Current window2 role names and localized panel labels.
 * @returns {{window: {app: string, id: number}, element_index: number}} Exact accessible button; coordinates are never a fallback.
 */
export function desktopActionTarget(state, decision, labels) {
  const index = decision.elementIndex
  if (index === undefined || !Number.isSafeInteger(index) || index < 0 || !decision.elementText) throw new DesktopSubmissionError('desktop-button-unavailable')
  const pattern = new RegExp('^\\s*' + index + ' ' + escape(labels.buttonRole) + '(?: \\(([^)]*)\\))? ' + escape(decision.elementText) + '$')
  const found = (state.accessibility?.tree ?? '').split('\n').map(line => pattern.exec(line)).filter(match => match !== null)
  if (found.length !== 1 || /(?:^|, )disabled(?:,|$)/.test(found[0][1] ?? '')) throw new DesktopSubmissionError('desktop-button-unavailable')
  return { window: state.window, element_index: index }
}

/**
 * @param {DesktopState} state - New observation after the owned click returned.
 * @param {{profileId: string, sessionId: string}} expected - Reviewed current Session, never a historical transcript row.
 * @param {DesktopLabels} labels - Exact labels from the current UI language.
 * @returns {'confirmation-pending'|'result-missing'|'not-started'|'verified'} Only a current panel result for this Session without a pending confirmation can verify submission; this does not establish connectivity.
 */
export function desktopSubmissionState(state, expected, labels) {
  const lines = (state.accessibility?.tree ?? '').split('\n')
  const pending = new RegExp('^\\s*\\d+ ' + escape(labels.headingRole) + ' ' + escape(labels.pendingHeading) + '$')
  if (lines.some(line => pending.test(line))) return 'confirmation-pending'
  const panel = new RegExp('^\\s*\\d+ ' + escape(labels.editRole) + '(?: \\([^)]*\\))? ' + escape(labels.publicResult) + ' Value: (.*)$')
  const found = lines.map(line => panel.exec(line)).filter(match => match !== null)
  if (found.length === 0) return 'result-missing'
  if (found.length !== 1) throw new DesktopSubmissionError('desktop-result-ambiguous')
  let value
  try { value = JSON.parse(found[0][1]) } catch (error) { throw new DesktopSubmissionError('desktop-result-invalid', error) }
  if (value === null || typeof value !== 'object' || typeof value.profileId !== 'string' || typeof value.sessionId !== 'string' || typeof value.state !== 'string') throw new DesktopSubmissionError('desktop-result-invalid')
  if (value.profileId !== expected.profileId || value.sessionId !== expected.sessionId) throw new DesktopSubmissionError('desktop-session-changed')
  return value.state === 'transport-started' ? 'verified' : 'not-started'
}

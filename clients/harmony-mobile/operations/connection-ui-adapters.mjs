// @ts-check
/** One-shot UI submissions. Reviewed observations stay local; no driver runs at import or construction. */
import { assessLayout, assertOwnedLayout, controlPoint, targetReference } from '../scripts/connection-deployment-lib.mjs'
import { desktopActionTarget, desktopSubmissionState, DesktopSubmissionError } from './desktop-connection-observation.mjs'
import { readDesktopSubmissionReceipt } from './desktop-postclick-submission.mjs'

/** @typedef {{app: string, id: number}} TargetWindow */
/** @typedef {{window: TargetWindow, screenshots: Array<{id: string, width?: number, height?: number}>, accessibility?: {tree?: string} | null}} DesktopObservation */
/** @typedef {{kind: string, allowSelected?: boolean, elementIndex?: number, elementText?: string, bindingPreserved?: boolean, pendingConfirmation?: boolean}} DesktopDecision */

/**
 * Own an observed final action until the original driver and fresh stop verification settle.
 * @param {object} options - Adapter-local dependencies.
 * @param {() => number} options.clock - Monotonic clock.
 * @param {number} options.readyTtlMs - Maximum observation age.
 * @param {(signal: AbortSignal) => Promise<{submit(): Promise<void>, observedAt: number}>} options.prepare - Capture time and reviewed action; never connect.
 * @param {() => Promise<void>} options.stop - Fresh UI stop and verification, independent of submission cancellation.
 * @returns {{prepare(): Promise<void>, ready(): boolean, submit(): Promise<void>, cancel(): void, close(): Promise<void>}} Single-use adapter; close rejection means cleanup is unverified.
 */
function ownedAdapter({ clock, readyTtlMs, prepare, stop }) {
  if (!Number.isSafeInteger(readyTtlMs) || readyTtlMs <= 0) throw Error('invalid UI readiness lifetime')
  const controller = new AbortController()
  let consumed = false, started = false, observedAt = NaN
  /** @type {(() => Promise<void>) | undefined} */
  let action
  /** @type {Promise<void>} */
  let pending = Promise.resolve()
  /** @type {Promise<void> | undefined} */
  let closing
  /** @param {() => Promise<void>} run @param {boolean} [propagate] */
  const track = (run, propagate = false) => {
    /** @type {PromiseWithResolvers<void>} */
    const owned = Promise.withResolvers()
    pending = owned.promise
    try { Promise.resolve(run()).then(owned.resolve, owned.reject) } catch (error) {
      owned.reject(error)
      if (propagate) {
        // The synchronous caller sees this failure; close() still owns the rejected completion.
        void owned.promise.catch(failure => { void failure })
        throw error
      }
    }
    return pending
  }
  const ready = () => !controller.signal.aborted && !consumed && action !== undefined && Number.isFinite(clock()) && clock() >= observedAt && clock() - observedAt < readyTtlMs
  return {
    async prepare() {
      if (started || controller.signal.aborted) throw Error('UI preparation already consumed')
      started = true
      // Cleanup also waits for observation/review work that ignores cancellation.
      await track(async () => { const reviewed = await prepare(controller.signal); controller.signal.throwIfAborted(); action = reviewed.submit; observedAt = reviewed.observedAt })
    },
    ready,
    submit() {
      if (!ready() || action === undefined) throw Error('UI final action is not ready')
      consumed = true
      // Calling the driver here, before returning, lets the coordinator dispatch the other endpoint immediately.
      return track(action, true)
    },
    cancel() { controller.abort() },
    close() {
      controller.abort()
      closing ??= (async () => {
        try { await pending } catch (error) { void error; /* A failed or aborted action may still have changed UI state. */ }
        await stop()
      })()
      return closing
    },
  }
}

/**
 * Bind the supported window2 Computer Use API to an already selected DSH window.
 * @param {object} options - Caller retains authorization and visual review in node_repl.
 * @param {{get_window_state(input: object): Promise<DesktopObservation>, click(input: object): Promise<void>}} options.sky - Existing Computer Use client; never launched here.
 * @param {(input: {window: TargetWindow, element_index: number}, signal: AbortSignal) => Promise<string>} options.submitAndObserve - Required single host call that clicks once and completes bounded current-panel observations before returning a serialized receipt. Caller retains the existing action cutoff and cancellation; no separate post-click request or success boolean is accepted.
 * @param {{app: string, id: number}} options.window - Actual returned target Window, not a fabricated handle.
 * @param {(state: DesktopObservation, purpose: 'connect' | 'stop') => Promise<DesktopDecision>} options.review - Review exact current Session and normal confirmation; returns the observed target or verified stopped state.
 * @param {() => number} options.clock - Monotonic clock.
 * @param {number} options.readyTtlMs - Reviewed observation lifetime.
 * @param {number} options.maxStopActions - Bound on normal dismiss/stop actions, each using a new observation.
 * @param {number} options.maxSubmitObservations - Bound on fresh post-click observations, without repeating the click.
 * @param {{profileId: string, sessionId: string}} options.session - Exact reviewed Session.
 * @param {import('./desktop-connection-observation.mjs').DesktopLabels} options.labels - Window2 role names and localized panel labels.
 * @returns {ReturnType<typeof ownedAdapter> & {submissionEvidence(): {click: string, verification: string, observations: number, failure: string | null}}} Desktop adapter; submit includes current-panel verification, not a handshake wait. Cleanup retains pending clicks and observations. Evidence snapshots separate click acknowledgment from verified submission.
 */
export function createDesktopUiAdapter({ sky, submitAndObserve, window, review, clock, readyTtlMs, maxStopActions, maxSubmitObservations, session, labels }) {
  if (typeof submitAndObserve !== 'function' || ![maxStopActions, maxSubmitObservations].every(value => Number.isSafeInteger(value) && value > 0)) throw Error('invalid desktop submission port or observation budget')
  /** @type {{click: string, verification: string, observations: number, failure: string | null}} */
  const evidence = { click: 'not-issued', verification: 'unverified', observations: 0, failure: null }
  const capture = async () => {
    const state = await sky.get_window_state({ window, include_screenshot: true, include_text: true })
    const observedAt = clock()
    if (state.window?.app !== window.app || state.window?.id !== window.id) throw new DesktopSubmissionError('desktop-window-changed')
    return { state, observedAt }
  }
  /** @param {'connect' | 'stop'} purpose */
  const observe = async purpose => {
    const { state, observedAt } = await capture()
    const decision = await review(state, purpose)
    return { state, decision, observedAt }
  }
  /** @param {{state: DesktopObservation, decision: DesktopDecision}} observed */
  const target = ({ state, decision }) => {
    return desktopActionTarget(state, decision, labels)
  }
  const adapter = ownedAdapter({ clock, readyTtlMs,
    prepare: async signal => {
      const observed = await observe('connect'); signal.throwIfAborted()
      if (observed.decision.kind !== 'submit-confirmation' || observed.decision.allowSelected !== true || observed.decision.elementText !== labels.submitAnswer) throw new DesktopSubmissionError('desktop-confirmation-not-prepared')
      const input = target(observed)
      return { observedAt: observed.observedAt, submit() {
        signal.throwIfAborted(); evidence.click = 'unknown'
        let submitted
        try { submitted = submitAndObserve(input, signal) } catch (error) { evidence.failure = 'desktop-click-unknown'; throw error }
        return submitted.then(raw => {
          const receipt = readDesktopSubmissionReceipt(raw, maxSubmitObservations)
          evidence.click = receipt.click; evidence.observations = receipt.states.length
          signal.throwIfAborted()
          for (const state of receipt.states) {
            if (state.window.app !== window.app || state.window.id !== window.id) throw new DesktopSubmissionError('desktop-window-changed')
            evidence.verification = desktopSubmissionState(state, session, labels)
          }
          if (receipt.failure !== null) throw new DesktopSubmissionError(receipt.failure)
          if (receipt.click !== 'acknowledged' || evidence.verification !== 'verified') throw new DesktopSubmissionError('desktop-submission-unverified')
        }).catch(error => {
          evidence.failure = error instanceof DesktopSubmissionError ? error.code : signal.aborted ? 'cancelled' : evidence.click === 'unknown' ? 'desktop-click-unknown' : 'desktop-observation-failed'
          throw error
        })
      } }
    },
    stop: async () => {
      for (let actions = 0; ; actions++) {
        const observed = await observe('stop'), { decision } = observed
        if (decision.kind === 'stopped' && decision.bindingPreserved === true && decision.pendingConfirmation === false) return
        if (actions >= maxStopActions || !['dismiss-confirmation', 'stop-local'].includes(decision.kind)) throw Error('desktop local stop unverified')
        await sky.click(target(observed))
      }
    },
  })
  return { ...adapter, submissionEvidence: () => ({ ...evidence }) }
}

/**
 * Bind an existing HDC connection to the original phone's normal UI controls.
 * @param {object} options - Current, separately reviewed phone target and localized product labels.
 * @param {{run(args: string[], signal?: AbortSignal): Promise<string>}} options.hdc - Bound HDC port; no service startup.
 * @param {string} options.target - Already selected original serial; not logged.
 * @param {string} options.targetRef - Expected public original-target reference.
 * @param {string} options.bundle - Original installed bundle.
 * @param {string} options.pid - Prepared original process; a restart invalidates the adapter.
 * @param {string} options.windowId - Prepared original native window.
 * @param {string} options.layoutPath - Caller-allocated unique temporary dump path under /data/local/tmp/.
 * @param {string} options.audience - Current reviewed host, visible on the prepared page.
 * @param {{paired: string, disconnected: string, connecting: string, connected: string, failed: string}} options.labels - Original localized strings.
 * @param {() => number} options.clock - Monotonic clock.
 * @param {number} options.readyTtlMs - Reviewed observation lifetime.
 * @returns {ReturnType<typeof ownedAdapter>} Phone UI adapter; consent must already be checked, and stop never clears pairing or user data.
 */
export function createPhoneUiAdapter({ hdc, target, targetRef, bundle, pid, windowId, layoutPath, audience, labels, clock, readyTtlMs }) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(target) || !/^[A-Za-z0-9_.]+$/.test(bundle) || !/^[1-9][0-9]*$/.test(pid) || !/^[0-9]+$/.test(windowId) || targetReference(target) !== targetRef || !/^\/data\/local\/tmp\/[A-Za-z0-9_-]+\.json$/.test(layoutPath)) throw Error('phone target or temporary layout path invalid')
  /** @param {string[]} args @param {AbortSignal} [signal] */
  const own = (args, signal) => hdc.run(['-t', target, 'shell', ...args], signal)
  /** @param {AbortSignal} [signal] */
  const observe = async signal => {
    if ((await own(['pidof', bundle], signal)).trim() !== pid) throw Error('phone process changed')
    let raw, observedAt = NaN
    try {
      const saved = await own(['uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', layoutPath], signal)
      if (saved.trim() !== 'DumpLayout saved to:' + layoutPath) throw Error('phone layout capture unavailable')
      raw = await own(['cat', layoutPath], signal)
      observedAt = clock()
    } finally { await own(['rm', layoutPath]) }
    const view = assessLayout(JSON.parse(raw), { bundle })
    assertOwnedLayout(view)
    const nodes = view.nodes.map(node => Object.fromEntries(Object.entries(node).filter(([, value]) => typeof value === 'string')))
    const roots = nodes.filter(node => node.type === 'root' && node.bundleName === bundle && node.visible === 'true')
    if (roots.length !== 1 || roots[0].hostWindowId !== windowId || roots[0].pagePath !== 'pages/Index' || roots[0].abilityName !== 'EntryAbility' || (await own(['pidof', bundle], signal)).trim() !== pid) throw Error('phone window changed')
    return { nodes: nodes.filter(node => node.visible === 'true'), observedAt }
  }
  /** @param {Array<Record<string, string>>} nodes @param {string} id */
  const control = (nodes, id) => {
    const found = nodes.filter(node => node.id === id)
    if (found.length !== 1 || found[0].type !== 'Button' || found[0].enabled !== 'true') throw Error('phone control unavailable')
    return controlPoint(found[0].bounds)
  }
  /** @param {Array<Record<string, string>>} nodes */
  const inactive = nodes => nodes.some(node => node.text === labels.paired) && nodes.some(node => node.text === labels.disconnected) && !nodes.some(node => [labels.connected, labels.connecting].includes(node.text))
  return ownedAdapter({ clock, readyTtlMs,
    prepare: async signal => {
      const { nodes, observedAt } = await observe(signal); signal.throwIfAborted()
      const index = nodes.findIndex(node => node.id === 'product-connect')
      const consent = nodes.slice(0, index).findLast(node => node.type === 'Checkbox')
      if (!inactive(nodes) || nodes.some(node => node.text === labels.failed) || !nodes.some(node => node.text === audience) || consent?.checked !== 'true' || consent.enabled !== 'true') throw Error('phone host consent not prepared')
      const point = control(nodes, 'product-connect')
      return { observedAt, async submit() { signal.throwIfAborted(); await own(['uitest', 'uiInput', 'click', ...point], signal) } }
    },
    stop: async () => {
      const { nodes } = await observe()
      const point = control(nodes, 'product-route-stop')
      await own(['uitest', 'uiInput', 'click', ...point])
      const { nodes: stopped } = await observe()
      if (!inactive(stopped) || stopped.filter(node => node.id === 'product-connect').length !== 1 || stopped.find(node => node.id === 'product-connect')?.enabled !== 'false') throw Error('phone local stop unverified')
    },
  })
}

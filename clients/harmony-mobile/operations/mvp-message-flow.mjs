/** Two-message UI verification. Construction and import perform no device, network or filesystem IO. */
import { assertOwnedLayout, controlPoint } from '../scripts/connection-deployment-lib.mjs'
import { MvpWindowBudgetError } from './mvp-window-budget.mjs'

/** @param {string} marker - Fresh public run marker. @returns {{reply: string, messages: readonly string[]}} Closed ASCII test messages, passed to HDC without shell quotes. */
export function mvpMessagePlan(marker) {
  if (typeof marker !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(marker)) throw Error('invalid MVP run marker')
  const reply = 'MVP_REPLY_' + marker
  return Object.freeze({ reply, messages: Object.freeze(['Please_reply_only_with:' + reply + '.No_tools.', 'Please_print_integers_1_to_5000_one_per_line.No_tools.I_will_press_stop.']) })
}

/** @param {string} target - Reviewed HDC target. @param {string[]} point - Observed integer coordinates. @param {string} text - One closed test message. @returns {string[]} Exact argv; no quoted or executable text is admitted. */
export function mvpInputArgs(target, point, text) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(target) || point.length !== 2 || !point.every(x => /^[0-9]+$/.test(x)) || !/^[A-Za-z0-9_:.,-]{1,256}$/.test(text)) throw Error('invalid MVP input argv')
  return ['-t', target, 'shell', 'uitest', 'uiInput', 'inputText', ...point, text]
}

/** Structured failure; effects distinguish unissued, issued and unknown UI clicks from model acceptance. */
export class MvpFlowError extends Error {
  constructor(code, effects, cause, phase) { super(code, { cause }); this.name = 'MvpFlowError'; this.code = code; this.phase = phase; this.effects = { ...effects } }
}

function rect(bounds) {
  const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(bounds ?? '')
  if (!m) throw Error('invalid UI bounds')
  const [left, top, right, bottom] = m.slice(1).map(Number)
  if (right <= left || bottom <= top) throw Error('empty UI bounds')
  return { left, top, right, bottom }
}
function contains(outer, inner) { return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom }

/** @param {object} view - Fresh owned viewport. @returns {string[]} A vertical gesture wholly inside the visible Scroll, outside editable controls; throws instead of using fixed screen coordinates. */
export function mvpScrollGesture(view) {
  const nodes = view.viewport.nodes, scrolls = nodes.filter(n => n.id === 'product-page-scroll' && n.type === 'Scroll' && n.visible === 'true')
  if (scrolls.length !== 1) throw Error('visible product scroll required')
  const roots = nodes.filter(n => n.type === 'root' && n.visible === 'true')
  const s = rect(scrolls[0].bounds)
  if (roots.length !== 1 || !contains(rect(roots[0].bounds), s)) throw Error('scroll outside owned window')
  const pad = Math.max(1, Math.floor((s.right - s.left) / 100)), x = s.right - pad
  const from = Math.floor(s.top + (s.bottom - s.top) * 0.8), to = Math.floor(s.top + (s.bottom - s.top) * 0.2)
  const gesture = { left: x, right: x + 1, top: to, bottom: from + 1 }
  if (!contains(s, gesture) || nodes.some(n => n.visible === 'true' && ['TextInput', 'TextArea'].includes(n.type) && (() => { const r = rect(n.bounds); return x >= r.left && x <= r.right && from >= r.top && to <= r.bottom })())) throw Error('no non-editable scroll lane')
  return [String(x), String(from), String(x), String(to)]
}

/**
 * Own one serial UI sequence through select, two sends, phone reply and running-task stop. Running tasks can be stopped before body text arrives; conversation controls may use the fixed footer or the page Scroll.
 * @param {object} options - Explicit reviewed target, labels, budgets and injected UI/journal ports.
 * @returns {{run(): Promise<object>, observeConnection(maxObservationReads: number): Promise<{elapsedMs: number, samples: Array<{at: number, sequence: number, connected: boolean}>}>}} Single use; failures never retype, clear a draft, replay a click or reopen a connection. Timed observations require a successful message flow and the full-window budget. Caller retains window cleanup ownership.
 */
export function createMvpMessageFlow({ ui, journal, target, labels, marker, signal, clock, deadline, maxReads, maxScrolls, maxViewAgeMs, budget }) {
  if (![maxReads, maxScrolls, maxViewAgeMs].every(Number.isSafeInteger) || maxReads < 2 || maxScrolls < 0 || maxViewAgeMs < 1 || !Number.isFinite(deadline)) throw Error('invalid MVP flow limits')
  const plan = mvpMessagePlan(marker), effects = { send1: 'not-issued', send2: 'not-issued', stop: 'not-issued' }
  let consumed = false, lastSequence = -1, selected = false, scrolls = 0, phase = 'connect', succeeded = false, observed = false
  const fail = code => { throw new MvpFlowError(code, effects, undefined, phase) }
  const open = () => { if (signal.aborted) fail('cancelled'); if (budget) { try { budget.check(phase) } catch (error) { if (error instanceof MvpWindowBudgetError) fail(error.code); throw error } } else if (!Number.isFinite(clock()) || clock() >= deadline) fail('deadline') }
  const fresh = v => { open(); if (!Number.isFinite(v.observedAt) || clock() < v.observedAt || clock() - v.observedAt >= maxViewAgeMs) fail('stale-observation') }
  const record = async (method, ...args) => { try { await journal[method](...args) } catch (error) { void error; fail('journal-failed') }; open() }
  const texts = v => v.complete.nodes.filter(n => n.type === 'Text').map(n => n.text)
  const owned = (v, waitingForConnection) => {
    fresh(v)
    if (v.complete.coverage !== 'complete' || v.viewport.coverage !== 'viewport') fail('incomplete-observation')
    try { assertOwnedLayout(v.complete); assertOwnedLayout(v.viewport) } catch (error) { void error; fail('foreign-or-missing-app') }
    if (v.pid !== target.pid || v.window !== target.window || !Number.isSafeInteger(v.sequence) || v.sequence <= lastSequence) fail('stale-or-changed-window')
    lastSequence = v.sequence
    for (const face of [v.complete, v.viewport]) {
      const roots = face.nodes.filter(n => n.type === 'root' && n.visible === 'true')
      if (roots.length !== 1 || roots[0].bundleName !== target.bundle || roots[0].hostWindowId !== target.window || roots[0].pagePath !== 'pages/Index' || roots[0].abilityName !== 'EntryAbility') fail('changed-ui-owner')
    }
    const t = texts(v)
    if (!t.includes(labels.connected) && !(waitingForConnection && typeof labels.connecting === 'string' && labels.connecting.length > 0 && t.includes(labels.connecting))) fail('connection-lost')
    if (selected && (!v.complete.nodes.some(n => n.id === 'product-chat-back') || !t.includes(target.title))) fail('selection-lost')
    if (selected && t.includes(labels.readOnly)) fail('read-only')
    return v
  }
  const read = async (waitingForConnection = false) => { open(); const v = await ui.observe(signal); open(); return owned(v, waitingForConnection) }
  const one = (v, id) => {
    const nodes = v.complete.nodes.filter(n => n.id === id)
    if (nodes.length > 1) fail('duplicate-control')
    return nodes[0]
  }
  const diagnostic = (v, phase, reason) => ({ phase, reason, sequence: v.sequence, pid: v.pid, window: v.window, sendEnabled: one(v, 'product-send')?.enabled, taskState: one(v, 'dsh-task-state')?.text, draftLength: one(v, 'product-composer')?.text?.length ?? 0 })
  const checkDraft = (v, text) => {
    if (one(v, 'product-composer')?.text !== text || v.viewport.nodes.some(n => n.id === 'product-composer' && n.text !== text)) fail('draft-changed')
  }
  const visible = (v, id) => {
    const all = one(v, id)
    if (!all) return { reason: 'missing' }
    const type = id === 'product-composer' ? 'TextInput' : 'Button'
    if (all.type !== type) fail('wrong-control-type')
    if (all.enabled !== 'true') return { reason: 'disabled' }
    const footer = ['product-composer', 'product-send', 'product-cancel'].includes(id) ? one(v, 'product-conversation-controls') : undefined
    const found = v.viewport.nodes.filter(n => n.id === id)
    if (found.length > 1) fail('duplicate-control')
    if (footer && (found.length === 0 || found[0].visible !== 'true')) fail('footer-not-visible')
    if (found.length === 0 || found[0].visible !== 'true') return { reason: 'offscreen' }
    if (found[0].type !== type) fail('wrong-control-type')
    if (found[0].enabled !== 'true') return { reason: 'disabled' }
    const scrolls = v.viewport.nodes.filter(n => n.id === 'product-page-scroll' && n.type === 'Scroll' && n.visible === 'true')
    const root = v.viewport.nodes.find(n => n.type === 'root' && n.visible === 'true')
    if (footer) {
      const shown = v.viewport.nodes.filter(n => n.id === 'product-conversation-controls' && n.type === 'Column' && n.visible === 'true')
      if (footer.type !== 'Column' || shown.length !== 1 || !contains(rect(root.bounds), rect(shown[0].bounds)) || !contains(rect(shown[0].bounds), rect(found[0].bounds))) fail('footer-not-visible')
      return { node: found[0] }
    }
    if (scrolls.length !== 1 || !contains(rect(root.bounds), rect(scrolls[0].bounds)) || !contains(rect(scrolls[0].bounds), rect(found[0].bounds))) return { reason: 'clipped' }
    return { node: found[0] }
  }
  const waitControl = async (id, phase, draft) => {
    let reason = 'missing'
    for (let n = 0; n < maxReads; n++) {
      const v = await read(); if (draft !== undefined) checkDraft(v, draft)
      const result = visible(v, id); reason = result.reason
      await record('observe', diagnostic(v, phase, reason ?? 'ready'))
      if (result.node) return { v, node: result.node }
      if (reason === 'offscreen' || reason === 'clipped') {
        if (scrolls >= maxScrolls) fail('scroll-budget')
        let gesture
        try { gesture = mvpScrollGesture(v) } catch (error) { void error; fail('unsafe-scroll') }
        fresh(v); scrolls++; await ui.scroll(gesture, signal); open()
      } else { await ui.pause(signal); open() }
    }
    fail('control-' + reason)
  }
  const issue = async (key, v, node) => {
    fresh(v); await record('claim', key); fresh(v); effects[key] = 'unknown'
    try { await ui.click(controlPoint(node.bounds), signal) } catch (error) { void error; fail('click-outcome-unknown') }
    effects[key] = 'issued'; await record('issued', key)
  }
  const send = async index => {
    const text = plan.messages[index], key = index === 0 ? 'send1' : 'send2'
    const before = await waitControl('product-composer', key + '-input', '')
    fresh(before.v); await ui.input(controlPoint(before.node.bounds), text, signal); open()
    // Empty renders may lag input acknowledgment; after the first exact value, every later value must remain exact.
    let stable = 0
    for (let n = 0; n < maxReads && stable < 2; n++) {
      const v = await read(), draft = one(v, 'product-composer')?.text
      if (draft === '' && stable === 0) { await record('observe', diagnostic(v, key + '-stable', 'pending')) }
      else { checkDraft(v, text); stable++; await record('observe', diagnostic(v, key + '-stable', 'exact')) }
      await ui.pause(signal); open()
    }
    if (stable < 2) fail('input-not-observed')
    const ready = await waitControl('product-send', key, text)
    await issue(key, ready.v, ready.node)
  }
  const waitState = async (phase, predicate, waitingForConnection = false) => {
    for (let n = 0; n < maxReads; n++) { const v = await read(waitingForConnection); await record('observe', diagnostic(v, phase, 'waiting')); if (predicate(v)) return v; await ui.pause(signal); open() }
    fail(phase + '-not-observed')
  }
  return { async run() {
    if (consumed) fail('flow-already-consumed'); consumed = true
    try {
    open(); await record('begin', { marker, sessionId: target.sessionId, messageLimit: 2 }); open()
    await waitState('connected-phone', v => texts(v).includes(labels.connected), true)
    phase = 'reply'
    const row = await waitControl('product-session-' + target.sessionId, 'select')
    if (row.node.text !== target.title) fail('wrong-session-title')
    fresh(row.v); await ui.click(controlPoint(row.node.bounds), signal); open()
    // Selection completes asynchronously; the catalogue must not be mistaken for a conversation.
    await waitState('conversation', v => texts(v).includes(target.title) && v.complete.nodes.some(n => n.id === 'product-chat-back'))
    selected = true
    await send(0)
    await waitState('phone-reply', v => { const t = texts(v); return t.some((value, i) => value === labels.assistant && t[i + 1]?.split(/\r?\n/).at(-1) === plan.reply) && one(v, 'product-composer')?.text === '' && one(v, 'dsh-task-state')?.text === labels.completed })
    phase = 'stop'
    await send(1)
    await waitState('running-generation', v => one(v, 'dsh-task-state')?.text === labels.running && one(v, 'product-composer')?.text === '')
    const stop = await waitControl('product-cancel', 'stop')
    if (one(stop.v, 'dsh-task-state')?.text !== labels.running) fail('generation-ended-before-stop')
    checkDraft(stop.v, '')
    await issue('stop', stop.v, stop.node)
    await waitState('cancelled-generation', v => one(v, 'dsh-task-state')?.text === labels.cancelled)
    const result = { phoneReplyVerified: true, runningStopVerified: true, effects: { ...effects }, scrollActions: scrolls }
    await record('complete', result); succeeded = true; return result
    } catch (error) {
      if (error instanceof MvpFlowError) throw error
      throw new MvpFlowError('ui-port-failed', effects, error, phase)
    }
  }, async observeConnection(maxObservationReads) {
    if (!budget || !succeeded || observed || !Number.isSafeInteger(maxObservationReads) || maxObservationReads < 2) fail('observation-not-ready')
    observed = true; phase = 'observe'
    const samples = []; let start
    if (budget.check(phase) + budget.plan.observationMs >= budget.plan.deadlines.observe) fail('observation-budget')
    for (let n = 0; n < maxObservationReads; n++) {
      const v = await read(), at = budget.check(phase)
      start ??= at
      if (start + budget.plan.observationMs >= budget.plan.deadlines.observe) fail('observation-budget')
      if (samples.length > 0 && at - samples.at(-1).at > budget.plan.maxObservationGapMs) fail('observation-gap')
      samples.push({ at, sequence: v.sequence, connected: true })
      await record('observe', { ...diagnostic(v, 'stability', 'connected'), at })
      if (at - start >= budget.plan.observationMs) return { elapsedMs: at - start, samples }
      await ui.pause(signal); open()
    }
    fail('stability-not-observed')
  } }
}

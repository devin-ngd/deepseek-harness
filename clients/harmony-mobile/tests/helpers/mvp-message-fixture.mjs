/** Deterministic synthetic ArkUI layouts; no device, model, socket or process access. */
import { assessLayout, controlPoint } from '../../scripts/connection-deployment-lib.mjs'
import { createMvpMessageFlow, mvpMessagePlan } from '../../operations/mvp-message-flow.mjs'

export function mvpFixture(overrides = {}) {
  const marker = 'synthetic_run_001', plan = mvpMessagePlan(marker), controller = new AbortController(), calls = [], records = []
  const target = { pid: '123', window: '12', bundle: 'synthetic.mobile', sessionId: 'synthetic-session', title: 'MVP体验' }
  const labels = { connected: '已连接', connecting: '连接中', readOnly: '只读会话', assistant: '助手', running: '运行中', completed: '已完成', cancelled: '已取消' }
  const s = { now: 1000, sequence: 0, page: 'catalogue', draft: '', sent: 0, task: '', live: '', reply: '', send: 'ready', owner: true, selectDelay: 0, inputDelay: 0, pauses: 0 }
  const hooks = { observe() {}, input() {}, click() {}, pause() {}, journal() {}, ...overrides }
  const node = (id, type, bounds, text = '', enabled = 'true') => ({ id, type, bounds, text, enabled, visible: 'true' })
  function layout(coverage) {
    const nodes = [
      { type: 'root', bundleName: target.bundle, hostWindowId: target.window, pagePath: 'pages/Index', abilityName: 'EntryAbility', visible: 'true', bounds: '[0,0][1320,2848]' },
      node('product-page-scroll', 'Scroll', '[0,0][1320,1800]'),
      node('', 'Text', '[54,50][300,100]', labels.connected),
    ]
    if (s.page === 'catalogue') nodes.push(node('product-session-' + target.sessionId, 'Button', '[54,200][1266,300]', target.title))
    else nodes.push(
      node('product-chat-back', 'Button', '[54,100][300,200]'), node('', 'Text', '[54,220][1266,280]', target.title),
      node('product-composer', 'TextInput', '[54,1300][1266,1450]', s.draft),
      node('product-send', 'Button', s.send === 'clipped' ? '[54,1750][378,1850]' : '[54,1500][378,1640]', '', s.send === 'disabled' || s.draft === '' ? 'false' : 'true'),
      node('product-cancel', 'Button', '[400,1500][750,1640]'),
      node('dsh-task-state', 'Text', '[54,800][1200,900]', s.task),
      node('product-live-text', 'Text', '[54,900][1200,1200]', s.live),
      node('', 'Text', '[54,950][1200,1000]', labels.assistant), node('', 'Text', '[54,1000][1200,1100]', s.reply),
    )
    if (s.send === 'missing') nodes.splice(nodes.findIndex(n => n.id === 'product-send'), 1)
    if (coverage === 'viewport' && s.send === 'offscreen') nodes.splice(nodes.findIndex(n => n.id === 'product-send'), 1)
    if (!s.owner) nodes.push({ bundleName: 'foreign.overlay' })
    return assessLayout({ children: nodes.map(attributes => ({ attributes })) }, { bundle: target.bundle, coverage })
  }
  const journal = Object.fromEntries(['begin', 'claim', 'issued', 'observe', 'complete'].map(method => [method, async value => { records.push([method, value]); await hooks.journal(method, value, s) }]))
  const ui = {
    async observe() {
      s.sequence++
      if (s.selectPending && --s.selectPending <= 0) s.page = 'conversation'
      if (s.inputPending && --s.inputPending <= 0) s.draft = plan.messages[s.sent]
      await hooks.observe(s)
      const view = { sequence: s.sequence, pid: target.pid, window: target.window, observedAt: s.now, complete: layout('complete'), viewport: layout('viewport') }
      if (hooks.view) await hooks.view(view, s)
      return view
    },
    async click(point) {
      let id
      for (const n of layout('viewport').nodes) if (['Button'].includes(n.type) && n.bounds && controlPoint(n.bounds).join(',') === point.join(',')) id = n.id
      calls.push(['click', id]); await hooks.click(id, s)
      if (id === 'product-session-' + target.sessionId) { if (s.selectDelay) s.selectPending = s.selectDelay; else s.page = 'conversation' }
      else if (id === 'product-send') { s.sent++; s.draft = ''; if (s.sent === 1) { s.reply = plan.reply; s.task = labels.completed } else { s.task = labels.running; s.live = '1\n2\n3' } }
      else if (id === 'product-cancel') { s.task = labels.cancelled; s.live = '' }
      else throw Error('unexpected synthetic click')
    },
    async input(point, text) {
      calls.push(['input', point, text]); s.draft = text
      if (s.inputDelay) { s.draft = ''; s.inputPending = s.inputDelay }
      await hooks.input(text, s)
    },
    async scroll(gesture) { calls.push(['scroll', gesture]); s.send = 'ready'; if (hooks.scroll) await hooks.scroll(gesture, s) },
    async pause() { s.now += 10; s.pauses++; await hooks.pause(s) },
  }
  const options = { ui, journal, target, labels, marker, signal: controller.signal, clock: () => s.now, deadline: 10000, maxReads: 6, maxScrolls: 2, maxViewAgeMs: 500 }
  return { s, target, labels, plan, calls, records, options, ui, journal, controller, layout, flow: () => createMvpMessageFlow(options), sends: () => calls.filter(c => c[0] === 'click' && c[1] === 'product-send').length }
}

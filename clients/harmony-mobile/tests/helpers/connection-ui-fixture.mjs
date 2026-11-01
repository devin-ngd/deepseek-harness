/** Synthetic window2 and HDC protocols; importing these fixtures never opens an app or process. */
import { createDesktopUiAdapter, createPhoneUiAdapter } from '../../operations/connection-ui-adapters.mjs'
import { createUiConnectionStart } from '../../operations/connection-ui-start.mjs'
import { targetReference } from '../../scripts/connection-deployment-lib.mjs'
import { submitDesktopAndObserve } from '../../operations/desktop-postclick-submission.mjs'

export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
export class Clock {
  now = 1000
  pending = new Set()
  after(ms, run) { const entry = { at: this.now + ms, run }; this.pending.add(entry); return () => this.pending.delete(entry) }
  advance(ms) { this.now += ms; for (const entry of [...this.pending]) if (entry.at <= this.now && this.pending.delete(entry)) entry.run() }
}
export function uiFixture(t) {
  const clock = new Clock(), calls = [], lifetime = new AbortController(), releases = []
  const desktop = { phase: 'confirmation', held: null, onSubmit: () => {}, wrongWindow: false, stopFails: false }
  const phone = { phase: 'disconnected', enabled: true, consent: true, paired: true, pid: '123', window: '12', overlay: false, held: null, data: 'retained-synthetic-history' }
  const labels = { paired: '已配对', disconnected: '未连接', connecting: '连接中', connected: '已连接', failed: '操作失败' }
  const sky = {
    async activate_window() { calls.push(['desktop-activate']) },
    async get_window_state(_input) {
      calls.push(['desktop-observe', desktop.phase])
      const result = { profileId: 'synthetic-profile', sessionId: 'synthetic-session', state: desktop.phase === 'connecting' ? 'transport-started' : desktop.phase }
      return { window: { app: 'synthetic-dsh', id: desktop.wrongWindow ? 99 : 1 }, screenshots: [{ id: 'current-' + desktop.phase, width: 800, height: 600 }], accessibility: { tree: '0 窗口 Synthetic\n10 按钮 提交回答\n20 按钮 停止本地连接\n' + (desktop.phase === 'confirmation' ? '30 标题 需要你的回答\n' : '') + '40 编辑 经过过滤的公开结果 Value: ' + JSON.stringify(result) } }
    },
    click(input) {
      calls.push(['desktop-click', input.element_index])
      if (input.element_index === 10) { desktop.phase = 'connecting'; desktop.onSubmit(); return desktop.held ?? Promise.resolve() }
      if (input.element_index === 20) { desktop.phase = 'stopped'; return Promise.resolve() }
      throw Error('unreviewed desktop action')
    },
  }
  const review = async (state, purpose) => {
    if (purpose === 'connect') return { kind: 'submit-confirmation', allowSelected: true, elementIndex: 10, elementText: '提交回答' }
    if (desktop.stopFails) return { kind: 'unknown' }
    if (desktop.phase === 'stopped') return { kind: 'stopped', bindingPreserved: true, pendingConfirmation: false }
    return { kind: desktop.phase === 'confirmation' ? 'dismiss-confirmation' : 'stop-local', elementIndex: 20, elementText: '停止本地连接' }
  }
  const layout = () => ({ attributes: { type: 'root', bundleName: 'synthetic.mobile', visible: 'true', hostWindowId: phone.window, pagePath: 'pages/Index', abilityName: 'EntryAbility' }, children: [
    { text: labels.paired }, { text: labels[phone.phase] }, { text: 'relay.invalid' },
    { type: 'Checkbox', checked: String(phone.consent), enabled: 'true' },
    { type: 'Button', id: 'product-connect', enabled: String(phone.enabled), bounds: '[10,10][30,30]' },
    { type: 'Button', id: 'product-route-stop', enabled: 'true', bounds: '[40,40][60,60]' },
    ...(phone.overlay ? [{ bundleName: 'foreign.overlay' }] : []),
  ].map(attributes => ({ attributes: { visible: 'true', ...attributes } })) })
  const hdc = { async run(args, signal) {
    calls.push(['hdc', ...args]); signal?.throwIfAborted()
    const command = args.slice(3)
    if (command[0] === 'pidof') return phone.pid
    if (command[0] === 'cat') return JSON.stringify(layout())
    if (command[0] === 'rm') return ''
    if (command[1] === 'dumpLayout') return 'DumpLayout saved to:' + command.at(-1)
    if (command[1] === 'uiInput' && command[2] === 'click') {
      if (command[3] === '20') { phone.phase = 'connecting'; await phone.held; return '' }
      if (command[3] === '50') { phone.phase = 'disconnected'; phone.enabled = false; return '' }
    }
    throw Error('unexpected synthetic HDC command')
  } }
  const submissionOptions = { sky, clock: () => clock.now, deadline: 11000, maxObservations: 3, pause: async signal => { signal.throwIfAborted(); clock.advance(250) }, session: { profileId: 'synthetic-profile', sessionId: 'synthetic-session' }, labels: { buttonRole: '按钮', editRole: '编辑', headingRole: '标题', publicResult: '经过过滤的公开结果', pendingHeading: '需要你的回答', submitAnswer: '提交回答' } }
  const desktopOptions = { sky, window: { app: 'synthetic-dsh', id: 1 }, review, clock: () => clock.now, readyTtlMs: 5000, maxStopActions: 2, maxSubmitObservations: 3, session: submissionOptions.session, labels: submissionOptions.labels, submitAndObserve: (input, signal) => submitDesktopAndObserve({ ...submissionOptions, input, signal }) }
  const phoneOptions = { hdc, target: 'synthetic-original', targetRef: targetReference('synthetic-original'), bundle: 'synthetic.mobile', pid: '123', windowId: '12', layoutPath: '/data/local/tmp/synthetic-ui-test.json', audience: 'relay.invalid', labels, clock: () => clock.now, readyTtlMs: 5000 }
  const d = createDesktopUiAdapter(desktopOptions), p = createPhoneUiAdapter(phoneOptions)
  const owner = createUiConnectionStart({ desktop: d, phone: p, clock: () => clock.now, scheduler: clock, actionDeadline: 11000, cleanupDeadline: 16000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: lifetime.signal })
  t.after(async () => { for (const release of releases) release(); await owner.stop(); await owner.settled(); if (clock.pending.size !== 0) throw Error('UI expiry callbacks leaked') })
  return { clock, calls, lifetime, desktop, phone, releases, sky, review, hdc, desktopOptions, submissionOptions, phoneOptions, d, p, owner,
    async prepare() { await Promise.all([d.prepare(), p.prepare()]) },
    holdDesktop() { const gate = deferred(); desktop.held = gate.promise; releases.push(gate.resolve); return gate },
    connects() { return calls.filter(row => row[0] === 'desktop-click' && row[1] === 10).length + calls.filter(row => row[0] === 'hdc' && row.at(-3) === 'click' && row.at(-2) === '20').length },
  }
}

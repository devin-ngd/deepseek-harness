import test from 'node:test'
import assert from 'node:assert/strict'
import { uiFixture, deferred } from './helpers/connection-ui-fixture.mjs'
import { mvpFixture } from './helpers/mvp-message-fixture.mjs'
import { desktopActionTarget, desktopSubmissionState } from '../operations/desktop-connection-observation.mjs'
import { startVerifiedMvpMessages, prepareAndStartVerifiedMvpMessages } from '../operations/mvp-verified-start.mjs'
import { createDesktopUiAdapter } from '../operations/connection-ui-adapters.mjs'
import { createUiConnectionStart } from '../operations/connection-ui-start.mjs'
import { submitDesktopAndObserve } from '../operations/desktop-postclick-submission.mjs'

test('a returned final click with unchanged confirmation cannot admit message work', async t => {
  const f = uiFixture(t), original = f.sky.click.bind(f.sky)
  f.sky.click = input => {
    if (input.element_index === 10 || input.x === 10) { f.calls.push(['desktop-click', 10]); return Promise.resolve() }
    return original(input)
  }
  await f.prepare()
  let messageCalls = 0
  const result = await startVerifiedMvpMessages(f.owner, { async run() { messageCalls++; return {} } })
  assert.equal(result.connection.reason, 'action-outcome-unknown')
  assert.deepEqual(result.connection.cleanup, { desktop: 'stopped', phone: 'stopped' })
  assert.equal(result.messages, null); assert.equal(messageCalls, 0)
  assert.equal(f.connects(), 2)
  assert.deepEqual(f.d.submissionEvidence(), { click: 'acknowledged', verification: 'confirmation-pending', observations: 3, failure: 'desktop-submission-unverified' })
})

test('verified desktop panel admits the two-message flow only after phone connecting becomes connected', async t => {
  const f = uiFixture(t), messages = mvpFixture({ view(v, s) {
    if (s.sequence <= 2) { assert.equal(messages.calls.length, 0); for (const face of [v.complete, v.viewport]) face.nodes.find(n => n.text === '已连接').text = '连接中' }
  } }); await f.prepare()
  const result = await startVerifiedMvpMessages(f.owner, messages.flow())
  assert.equal(result.connection.reason, null); assert.equal(messages.sends(), 2)
  assert.equal(result.messages.runningStopVerified, true)
  assert.deepEqual(f.d.submissionEvidence(), { click: 'acknowledged', verification: 'verified', observations: 1, failure: null })
  await assert.rejects(startVerifiedMvpMessages(f.owner, messages.flow()), /already consumed/)
})

test('first post-click frame may be pending, but only a later current panel verifies the one click', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky)
  let post = 0
  f.sky.get_window_state = async input => {
    const state = await capture(input)
    if (f.desktop.phase === 'connecting' && ++post === 1) state.accessibility.tree += '\n30 标题 需要你的回答'
    return state
  }
  await f.prepare(); assert.equal((await f.owner.start()).reason, null)
  assert.equal(f.d.submissionEvidence().observations, 2); assert.equal(f.connects(), 2)
})

test('message failure is propagated without replay while the caller retains stop ownership', async t => {
  const f = uiFixture(t); await f.prepare(); let called = 0
  await assert.rejects(startVerifiedMvpMessages(f.owner, { async run() { called++; throw Error('synthetic message failure') } }), /message failure/)
  assert.equal(called, 1); assert.equal(f.connects(), 2)
  assert.deepEqual(await f.owner.stop(), { desktop: 'stopped', phone: 'stopped' })
})

test('a delayed Host result waits between observations and submits only once', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky), began = f.clock.now
  f.sky.get_window_state = async input => {
    const state = await capture(input)
    if (f.desktop.phase === 'connecting' && f.clock.now - began < 500) state.accessibility.tree = state.accessibility.tree.replace('transport-started', 'route-ready')
    return state
  }
  await f.prepare(); const result = await f.owner.start()
  assert.equal(result.reason, null); assert.equal(f.clock.now - began, 500)
  assert.equal(f.d.submissionEvidence().observations, 3); assert.equal(f.connects(), 2)
})

test('cancellation drains a pending observation pause before stop without another click', async t => {
  const f = uiFixture(t), gate = deferred(), entered = deferred()
  f.releases.push(gate.resolve)
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, submitAndObserve: (input, signal) => submitDesktopAndObserve({ ...f.submissionOptions, input, signal, pause: async () => { entered.resolve(); await gate.promise } }) })
  const click = f.sky.click.bind(f.sky)
  f.sky.click = input => input.element_index === 10 ? (f.calls.push(['desktop-click', 10]), Promise.resolve()) : click(input)
  await adapter.prepare(); const submitted = adapter.submit(); await entered.promise
  adapter.cancel(); let closed = false
  const closing = adapter.close().then(() => { closed = true }); await Promise.resolve()
  assert.equal(closed, false); assert.equal(f.desktop.phase, 'confirmation')
  gate.resolve(); await assert.rejects(submitted, e => e.name === 'AbortError'); await closing
  assert.equal(adapter.submissionEvidence().observations, 1); assert.equal(f.connects(), 1)
  assert.equal(f.desktop.phase, 'stopped')
})

for (const [name, mutate, failure] of [
  ['old transcript only', state => { state.accessibility.tree = '50 文本 {"profileId":"synthetic-profile","sessionId":"synthetic-session","state":"transport-started"}' }, 'desktop-submission-unverified'],
  ['panel still route-ready', state => { state.accessibility.tree = state.accessibility.tree.replace('transport-started', 'route-ready') }, 'desktop-submission-unverified'],
  ['different session', state => { state.accessibility.tree = state.accessibility.tree.replace('synthetic-session', 'other-session') }, 'desktop-session-changed'],
  ['different profile', state => { state.accessibility.tree = state.accessibility.tree.replace('synthetic-profile', 'other-profile') }, 'desktop-session-changed'],
  ['malformed JSON', state => { state.accessibility.tree = '40 编辑 经过过滤的公开结果 Value: {invalid}' }, 'desktop-result-invalid'],
  ['missing state fields', state => { state.accessibility.tree = '40 编辑 经过过滤的公开结果 Value: {}' }, 'desktop-result-invalid'],
  ['duplicate current panels', state => { state.accessibility.tree += '\n' + state.accessibility.tree.split('\n').at(-1) }, 'desktop-result-ambiguous'],
  ['changed window', state => { state.window.id = 99 }, 'desktop-window-changed'],
]) test(name + ' after click cannot admit messages', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky)
  f.sky.get_window_state = async input => { const state = await capture(input); if (f.desktop.phase === 'connecting') mutate(state); return state }
  await f.prepare(); let messageCalls = 0
  const result = await startVerifiedMvpMessages(f.owner, { async run() { messageCalls++; return {} } })
  assert.equal(result.connection.reason, 'action-outcome-unknown'); assert.equal(result.messages, null); assert.equal(messageCalls, 0)
  assert.equal(f.d.submissionEvidence().failure, failure); assert.equal(f.connects(), 2)
})

test('cancellation during a pending post-click observation drains that observation before normal stop', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky), gate = deferred(), entered = deferred()
  f.releases.push(gate.resolve)
  f.sky.get_window_state = async input => { if (f.desktop.phase === 'connecting') { entered.resolve(); await gate.promise }; return capture(input) }
  await f.prepare(); const pending = f.owner.start(); await entered.promise; f.lifetime.abort()
  assert.equal(f.desktop.phase, 'connecting'); gate.resolve()
  const result = await pending; assert.equal(result.reason, 'cancelled')
  assert.deepEqual(await f.owner.settled(), { desktop: 'stopped', phone: 'stopped' }); assert.equal(f.connects(), 2)
})

test('timeout during post-click observation reports pending cleanup until the original capture settles', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky), gate = deferred(), entered = deferred()
  f.releases.push(gate.resolve)
  f.sky.get_window_state = async input => { if (f.desktop.phase === 'connecting') { entered.resolve(); await gate.promise }; return capture(input) }
  await f.prepare(); const pending = f.owner.start(); await entered.promise
  f.clock.advance(10000); f.clock.advance(5000)
  const result = await pending; assert.equal(result.reason, 'action-timeout'); assert.equal(result.cleanup.desktop, 'pending')
  gate.resolve(); assert.deepEqual(await f.owner.settled(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.connects(), 2); assert.equal(f.clock.pending.size, 0)
})

test('post-click capture failure preserves click acknowledgment without claiming submission', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky)
  f.sky.get_window_state = input => { if (f.desktop.phase === 'connecting') throw Error('synthetic capture failure'); return capture(input) }
  await f.prepare(); const result = await f.owner.start()
  assert.equal(result.reason, 'action-outcome-unknown'); assert.equal(f.d.submissionEvidence().click, 'acknowledged')
  assert.equal(f.d.submissionEvidence().failure, 'desktop-observation-failed')
})

test('coordinate-only review, old index, wrong button name and disabled button are refused before clicking', async t => {
  const f = uiFixture(t), state = await f.sky.get_window_state({})
  for (const decision of [{ x: 10, y: 10, screenshotId: state.screenshots[0].id }, { elementIndex: 99, elementText: '提交回答' }, { elementIndex: 10, elementText: '停止本地连接' }]) assert.throws(() => desktopActionTarget(state, decision, f.desktopOptions.labels), e => e.code === 'desktop-button-unavailable')
  state.accessibility.tree = state.accessibility.tree.replace('10 按钮', '10 按钮 (disabled)')
  assert.throws(() => desktopActionTarget(state, { elementIndex: 10, elementText: '提交回答' }, f.desktopOptions.labels), e => e.code === 'desktop-button-unavailable')
  assert.equal(f.connects(), 0)
})

test('the final input carries only the current window and accessible index', async t => {
  const f = uiFixture(t), click = f.sky.click.bind(f.sky), inputs = []
  f.sky.click = input => { inputs.push(input); return click(input) }
  await f.prepare(); await f.owner.start()
  assert.deepEqual(inputs[0], { window: { app: 'synthetic-dsh', id: 1 }, element_index: 10 })
})

test('a reviewed real button for another action cannot replace the normal submit button', async t => {
  const f = uiFixture(t)
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => purpose === 'connect' ? { kind: 'submit-confirmation', allowSelected: true, elementIndex: 20, elementText: '停止本地连接' } : f.review(state, purpose) })
  await assert.rejects(adapter.prepare(), e => e.code === 'desktop-confirmation-not-prepared')
  assert.equal(f.connects(), 0); await adapter.close()
})

test('literal role and label metacharacters cannot widen accessibility matching', () => {
  const labels = { buttonRole: 'Button', editRole: 'Edit', headingRole: 'Heading', publicResult: 'Public [result].', pendingHeading: 'Need (decision)?', submitAnswer: 'Submit (answer)?' }
  const value = { profileId: 'p', sessionId: 's', state: 'transport-started' }
  const state = { window: { app: 'synthetic', id: 1 }, accessibility: { tree: '1 Button Submit (answer)?\n2 Edit Public [result]. Value: ' + JSON.stringify(value) } }
  assert.deepEqual(desktopActionTarget(state, { elementIndex: 1, elementText: 'Submit (answer)?' }, labels), { window: state.window, element_index: 1 })
  assert.equal(desktopSubmissionState(state, { profileId: 'p', sessionId: 's' }, labels), 'verified')
  state.accessibility.tree += '\n3 Heading Need (decision)?'
  assert.equal(desktopSubmissionState(state, { profileId: 'p', sessionId: 's' }, labels), 'confirmation-pending')
})

test('a manual wait after preparation reproduces expired readiness without any final click', async t => {
  const f = uiFixture(t); await f.prepare(); f.clock.now += 100000
  const lateOwner = createUiConnectionStart({ desktop: f.d, phone: f.p, clock: () => f.clock.now, scheduler: f.clock, actionDeadline: f.clock.now + 10000, cleanupDeadline: f.clock.now + 15000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: f.lifetime.signal })
  const result = await startVerifiedMvpMessages(lateOwner, { async run() { assert.fail('messages must remain uncalled') } })
  assert.equal(result.connection.reason, 'not-ready'); assert.equal(f.connects(), 0)
})

test('preparation and dispatch in one call use fresh deadlines without widening readiness', async t => {
  const f = uiFixture(t); f.clock.now += 100000
  let active, createdAt
  const result = await prepareAndStartVerifiedMvpMessages(f.d, f.p, () => {
    createdAt = f.clock.now
    f.submissionOptions.deadline = createdAt + 10000
    assert.equal(f.d.ready(), true); assert.equal(f.p.ready(), true)
    active = createUiConnectionStart({ desktop: f.d, phone: f.p, clock: () => f.clock.now, scheduler: f.clock, actionDeadline: f.clock.now + 10000, cleanupDeadline: f.clock.now + 15000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: f.lifetime.signal })
    return active
  }, { async run() { return { admitted: true } } })
  assert.equal(result.connection.reason, null); assert.equal(result.messages.admitted, true)
  assert.equal(f.clock.now, createdAt); assert.equal(f.connects(), 2)
  await active.stop(); await active.settled()
})

test('failed preparation never creates a connection or starts messages and retains pending review for caller cleanup', async t => {
  const f = uiFixture(t), entered = deferred(), release = deferred()
  const desktop = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => { if (purpose === 'connect') { entered.resolve(); await release.promise }; return f.review(state, purpose) } })
  f.releases.push(release.resolve); f.phone.host = 'other.invalid'; let created = 0
  const pending = prepareAndStartVerifiedMvpMessages(desktop, f.p, () => { created++; return f.owner }, { async run() { assert.fail('messages must remain uncalled') } })
  await entered.promise; await assert.rejects(pending, /consent not prepared/)
  assert.equal(created, 0); assert.equal(f.connects(), 0)
  let closed = false
  const closing = desktop.close().then(() => { closed = true }); await Promise.resolve(); assert.equal(closed, false)
  release.resolve(); await closing; assert.equal(desktop.ready(), false)
})

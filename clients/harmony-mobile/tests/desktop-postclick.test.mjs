import test from 'node:test'
import assert from 'node:assert/strict'
import { uiFixture, deferred } from './helpers/connection-ui-fixture.mjs'
import { createDesktopUiAdapter } from '../operations/connection-ui-adapters.mjs'
import { createUiConnectionStart } from '../operations/connection-ui-start.mjs'
import { submitDesktopAndObserve, readDesktopSubmissionReceipt } from '../operations/desktop-postclick-submission.mjs'
import { startVerifiedMvpMessages } from '../operations/mvp-verified-start.mjs'

test('combined submission uses one host request before the unchanged action cutoff', async t => {
  const f = uiFixture(t), requests = []
  f.clock.now = 8000
  const split = {
    async get_window_state(input) {
      if (f.desktop.phase === 'connecting') { requests.push('split-observe'); f.clock.advance(4000) }
      return f.sky.get_window_state(input)
    },
    click(input) {
      if (input.element_index === 10) { requests.push('split-click'); f.clock.advance(900) }
      return f.sky.click(input)
    },
  }
  const desktop = createDesktopUiAdapter({ ...f.desktopOptions, sky: split, submitAndObserve(input, signal) {
    requests.push('submit-and-observe'); f.clock.advance(900)
    return submitDesktopAndObserve({ ...f.submissionOptions, input, signal })
  } })
  const owner = createUiConnectionStart({ desktop, phone: f.p, clock: () => f.clock.now, scheduler: f.clock, actionDeadline: 11000, cleanupDeadline: 16000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: f.lifetime.signal })
  t.after(async () => { await owner.stop(); await owner.settled() })
  await Promise.all([desktop.prepare(), f.p.prepare()])
  let messages = 0
  const result = await startVerifiedMvpMessages(owner, { async run() { messages++; return { synthetic: true } } })
  assert.equal(result.connection.reason, null)
  assert.equal(messages, 1); assert.equal(f.connects(), 2)
  assert.deepEqual(requests, ['submit-and-observe'])
  assert.equal(f.clock.now, 8900)
})

const input = { window: { app: 'synthetic-dsh', id: 1 }, element_index: 10 }

test('host receipt contains actual post-click fields without screenshot payloads', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky)
  f.sky.get_window_state = async request => {
    const state = await capture(request)
    state.screenshots[0].url = 'data:image/png;base64,synthetic-private-pixels'
    return state
  }
  const raw = await submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal })
  const receipt = readDesktopSubmissionReceipt(raw, 3)
  assert.equal(receipt.click, 'acknowledged'); assert.equal(receipt.failure, null)
  assert.equal(receipt.states.length, 1); assert.equal(raw.includes('synthetic-private-pixels'), false)
  assert.equal(f.calls.filter(x => x[0] === 'desktop-activate').length, 1)
  assert.equal(f.connects(), 1)
})

test('expired host cutoff prevents the final click without granting a new deadline', t => {
  const f = uiFixture(t)
  assert.throws(() => submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal, deadline: f.clock.now }), e => e.code === 'desktop-submission-deadline')
  assert.equal(f.connects(), 0)
})

test('pre-existing cancellation prevents host input', t => {
  const f = uiFixture(t); f.lifetime.abort()
  assert.throws(() => submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal }), e => e.name === 'AbortError')
  assert.equal(f.connects(), 0)
})

test('a synchronous click defect stays synchronous and does not begin observation', t => {
  const f = uiFixture(t), original = f.sky.click.bind(f.sky)
  f.sky.click = request => { if (request.element_index === 10) throw Error('synthetic synchronous failure'); return original(request) }
  assert.throws(() => submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal }), /synthetic synchronous failure/)
  assert.equal(f.calls.some(x => x[0] === 'desktop-activate'), false)
})

test('activation failure preserves acknowledgment without reporting verification', async t => {
  const f = uiFixture(t)
  f.sky.activate_window = async () => { throw Error('synthetic activation unavailable') }
  const receipt = readDesktopSubmissionReceipt(await submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal }), 3)
  assert.equal(receipt.click, 'acknowledged'); assert.equal(receipt.failure, 'desktop-observation-failed')
  assert.deepEqual(receipt.states, []); assert.equal(f.connects(), 1)
})

test('a post-click clock reversal rejects verification after acknowledging the one input', async t => {
  const f = uiFixture(t), click = f.sky.click.bind(f.sky)
  f.sky.click = request => { const result = click(request); if (request.element_index === 10) f.clock.now--; return result }
  const receipt = readDesktopSubmissionReceipt(await submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal }), 3)
  assert.equal(receipt.click, 'acknowledged'); assert.equal(receipt.failure, 'desktop-submission-clock-invalid')
  assert.equal(receipt.states.length, 0); assert.equal(f.connects(), 1)
})

test('a late capture is awaited but cannot become verified at the host deadline', async t => {
  const f = uiFixture(t), capture = f.sky.get_window_state.bind(f.sky), entered = deferred(), release = deferred()
  f.releases.push(release.resolve)
  f.sky.get_window_state = async request => { entered.resolve(); await release.promise; return capture(request) }
  const pending = submitDesktopAndObserve({ ...f.submissionOptions, input, signal: f.lifetime.signal })
  await entered.promise; f.clock.now = 11000; release.resolve()
  const receipt = readDesktopSubmissionReceipt(await pending, 3)
  assert.equal(receipt.click, 'acknowledged'); assert.equal(receipt.failure, 'desktop-submission-deadline')
  assert.deepEqual(receipt.states, []); assert.equal(f.connects(), 1)
})

for (const [name, raw] of [
  ['success boolean', 'true'],
  ['broken JSON', '{'],
  ['missing fields', '{}'],
  ['wrong schema', JSON.stringify({ schema: 'other', click: 'acknowledged', states: [], failure: null })],
  ['unknown click outcome', JSON.stringify({ schema: 'dsh-desktop-submission/1', click: 'verified', states: [], failure: null })],
  ['malformed observation', JSON.stringify({ schema: 'dsh-desktop-submission/1', click: 'acknowledged', states: [{}], failure: null })],
]) test(name + ' receipt is rejected at the host process boundary', () => {
  assert.throws(() => readDesktopSubmissionReceipt(raw, 3), e => e.code === 'desktop-receipt-invalid')
})

for (const [name, mutate, code] of [
  ['no observed panel', r => { r.states = [] }, 'desktop-submission-unverified'],
  ['another window', r => { r.states[0].window.id = 99 }, 'desktop-window-changed'],
  ['another session', r => { r.states[0].accessibility.tree = r.states[0].accessibility.tree.replace('synthetic-session', 'other-session') }, 'desktop-session-changed'],
  ['unacknowledged observations', r => { r.click = 'unknown' }, 'desktop-receipt-invalid'],
  ['capture count over the original bound', r => { r.states = Array(4).fill(r.states[0]) }, 'desktop-receipt-invalid'],
  ['independent host failure', r => { r.failure = 'desktop-submission-deadline' }, 'desktop-submission-deadline'],
]) test(name + ' cannot admit messages from a serialized receipt', async t => {
  const f = uiFixture(t), submit = f.desktopOptions.submitAndObserve
  f.desktopOptions.submitAndObserve = async (...args) => { const receipt = JSON.parse(await submit(...args)); mutate(receipt); return JSON.stringify(receipt) }
  const desktop = createDesktopUiAdapter(f.desktopOptions)
  t.after(() => desktop.close())
  await desktop.prepare(); await assert.rejects(desktop.submit(), e => e.code === code)
  assert.equal(desktop.submissionEvidence().failure, code); assert.equal(f.connects(), 1)
})

test('cancellation retains a delayed serialized receipt before normal stop', async t => {
  const f = uiFixture(t), entered = deferred(), release = deferred(), original = f.desktopOptions.submitAndObserve
  f.releases.push(release.resolve)
  const desktop = createDesktopUiAdapter({ ...f.desktopOptions, submitAndObserve: async (...args) => { const raw = await original(...args); entered.resolve(); await release.promise; return raw } })
  t.after(() => desktop.close())
  await desktop.prepare(); const pending = desktop.submit(); await entered.promise
  desktop.cancel(); let stopped = false
  const closing = desktop.close().then(() => { stopped = true }); await Promise.resolve()
  assert.equal(stopped, false); assert.equal(f.desktop.phase, 'connecting')
  release.resolve(); await assert.rejects(pending, e => e.name === 'AbortError'); await closing
  assert.equal(f.desktop.phase, 'stopped'); assert.equal(f.connects(), 1)
  assert.equal(desktop.submissionEvidence().click, 'acknowledged')
  assert.equal(desktop.submissionEvidence().failure, 'cancelled')
})

test('action timeout retains a late host receipt until settled and never replays the click', async t => {
  const f = uiFixture(t), entered = deferred(), release = deferred(), original = f.desktopOptions.submitAndObserve
  f.releases.push(release.resolve)
  const desktop = createDesktopUiAdapter({ ...f.desktopOptions, submitAndObserve: async (...args) => { const raw = await original(...args); entered.resolve(); await release.promise; return raw } })
  const owner = createUiConnectionStart({ desktop, phone: f.p, clock: () => f.clock.now, scheduler: f.clock, actionDeadline: 11000, cleanupDeadline: 16000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: f.lifetime.signal })
  t.after(async () => { await owner.stop(); await owner.settled() })
  await Promise.all([desktop.prepare(), f.p.prepare()]); let messages = 0
  const pending = startVerifiedMvpMessages(owner, { async run() { messages++; return {} } })
  await entered.promise; f.clock.advance(10000); f.clock.advance(5000)
  const result = await pending
  assert.equal(result.connection.reason, 'action-timeout'); assert.equal(result.connection.cleanup.desktop, 'pending')
  assert.equal(messages, 0); assert.equal(f.desktop.phase, 'connecting')
  release.resolve(); assert.deepEqual(await owner.settled(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.connects(), 2); assert.equal(f.clock.pending.size, 0)
})

test('a missing combined submission port fails before observation or input', t => {
  const f = uiFixture(t), options = { ...f.desktopOptions }; delete options.submitAndObserve
  assert.throws(() => createDesktopUiAdapter(options), /submission port/)
  assert.equal(f.calls.length, 0)
})

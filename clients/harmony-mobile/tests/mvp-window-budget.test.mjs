import test from 'node:test'
import assert from 'node:assert/strict'
import { createMvpWindowBudget } from '../operations/mvp-window-budget.mjs'
import { runBudgetedMvpVerification } from '../operations/mvp-verified-start.mjs'
import { createUiConnectionStart } from '../operations/connection-ui-start.mjs'
import { uiFixture, deferred } from './helpers/connection-ui-fixture.mjs'
import { mvpFixture } from './helpers/mvp-message-fixture.mjs'

const durations = { connect: 30000, reply: 90000, stop: 120000, observe: 200000, cleanup: 60000 }
const expiresAt = { authorization: 901000, route: 601000, relay: 586000 }
function plan(clock, changes = {}) { return createMvpWindowBudget({ clock, epochClock: clock, durations: { ...durations }, expiresAt: { ...expiresAt }, maxObservationGapMs: 15000, ...changes }) }

test('one shared expiry reserves two serial messages, a separate full three minutes, sampling margin and cleanup', () => {
  const budget = plan(() => 1000)
  assert.deepEqual(budget.plan.deadlines, { connect: 31000, reply: 121000, stop: 241000, observe: 441000, cleanup: 501000 })
  assert.equal(budget.plan.hardExpiresAt, expiresAt.relay); assert.equal(budget.plan.observationMs, 180000)
})

for (const limit of ['authorization', 'route', 'relay']) test(limit + ' independently refuses insufficient time before any work', () => {
  for (const end of [500999, 501000]) assert.throws(() => plan(() => 1000, { expiresAt: { ...expiresAt, [limit]: end } }), e => e.code === 'insufficient-time')
})

test('the fixed plan cannot shrink cleanup or extend any deadline after preparation', () => {
  const values = { ...durations }, ends = { ...expiresAt }, budget = plan(() => 1000, { durations: values, expiresAt: ends })
  values.cleanup = 1; ends.route = 9999999
  assert.equal(budget.plan.durations.cleanup, 60000); assert.equal(budget.plan.deadlines.cleanup, 501000)
  assert.throws(() => { budget.plan.deadlines.cleanup = 9999999 }, TypeError)
  assert.throws(() => { budget.plan.durations.cleanup = 1 }, TypeError)
})

test('short observation, absent margin, invalid durations and non-finite clocks fail at planning', () => {
  for (const changes of [{ observationMs: 179999 }, { durations: { ...durations, observe: 180000 } }, { durations: { ...durations, reply: 0 } }, { durations: { ...durations, stop: NaN } }, { expiresAt: { ...expiresAt, relay: Infinity } }]) assert.throws(() => plan(() => 1000, changes), e => e.code === 'invalid-budget')
  assert.throws(() => plan(() => NaN), e => e.code === 'invalid-clock')
})

test('every phase has an exclusive fixed cutoff and clock regression cannot reopen it', () => {
  for (const phase of Object.keys(durations)) { let now = 1000; const b = plan(() => now); now = b.plan.deadlines[phase]; assert.throws(() => b.check(phase), e => e.code === 'deadline' && e.phase === phase) }
  let now = 1000; const b = plan(() => now); now = 1001; b.check('reply'); now = 1000
  assert.throws(() => b.check('reply'), e => e.code === 'invalid-clock')
})

test('actual epoch expiry is converted once without mixing it with monotonic deadlines', () => {
  const epoch = 1793410000000, budget = plan(() => 1000, { epochClock: () => epoch, expiresAt: { authorization: epoch + 900000, route: epoch + 600000, relay: epoch + 585000 } })
  assert.equal(budget.plan.hardExpiresAt, 586000); assert.equal(budget.plan.hardExpiresAtEpoch, epoch + 585000); assert.equal(budget.plan.deadlines.cleanup, 501000)
})

test('wall-clock jumps cannot outlive an epoch expiry or extend fixed reservations', () => {
  let epoch = 1000; const b = plan(() => 1000, { epochClock: () => epoch }); epoch = expiresAt.relay
  assert.throws(() => b.check('connect'), e => e.code === 'deadline'); assert.equal(b.plan.deadlines.cleanup, 501000)
  let backward = 1000; const other = plan(() => 1000, { epochClock: () => backward }); backward--
  assert.throws(() => other.check('connect'), e => e.code === 'invalid-clock')
})

function fixture(t, changes = {}) {
  const u = uiFixture(t), f = mvpFixture(changes.messages), cleanupCalls = []
  Object.defineProperty(f.s, 'now', { get: () => u.clock.now, set: value => u.clock.advance(value - u.clock.now) })
  const pause = f.ui.pause
  f.ui.pause = async signal => { const complete = f.records.some(r => r[0] === 'complete'); await pause(signal); if (complete) u.clock.advance(9990) }
  const budget = plan(f.options.clock), options = { desktop: u.d, phone: u.p, messageOptions: f.options, maxObservationReads: 30,
    prepareWindow: async () => budget, prepareConnection: async () => {},
    createConnection: admitted => {
      u.submissionOptions.deadline = admitted.plan.deadlines.connect
      return createUiConnectionStart({ desktop: u.d, phone: u.p, clock: f.options.clock, scheduler: u.clock, actionDeadline: admitted.plan.deadlines.connect, cleanupDeadline: admitted.plan.deadlines.cleanup, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: u.lifetime.signal })
    },
    cleanup: async context => { cleanupCalls.push(context); if (context.connection) { await context.connection.stop(); const r = await context.connection.settled(); assert.deepEqual(r, { desktop: 'stopped', phone: 'stopped' }) } else await Promise.all([u.d.close(), u.p.close()]) }, ...changes.options }
  return { u, f, budget, options, cleanupCalls, run: () => runBudgetedMvpVerification(options) }
}

test('the actual UI adapters and message flow finish both messages, fresh three-minute samples and awaited cleanup', async t => {
  const f = fixture(t), result = await f.run()
  assert.equal(result.passed, true); assert.equal(f.f.sends(), 2); assert.equal(result.messages.runningStopVerified, true)
  assert.equal(result.stability.elapsedMs, 180000); assert.equal(result.stability.samples.length, 19)
  assert.ok(result.stability.samples.every((s, i, all) => s.connected && (i === 0 || s.at > all[i - 1].at)))
  assert.equal(f.cleanupCalls.length, 1); assert.equal(f.u.clock.pending.size, 0)
})

test('operator delay before dispatch refuses both submissions and still cleans prepared state', async t => {
  const f = fixture(t); f.u.clock.advance(30000)
  const r = await f.run(); assert.equal(r.failure.code, 'deadline'); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0); assert.equal(f.cleanupCalls.length, 1)
})

test('admission regression: preparation after route creation consumes actual remaining time before any confirmation', async t => {
  const f = fixture(t); let confirmations = 0
  f.options.prepareWindow = async () => { f.u.clock.advance(98487); return plan(f.options.messageOptions.clock) }
  f.options.prepareConnection = async () => { confirmations++ }
  const result = await f.run()
  assert.equal(result.passed, false); assert.equal(result.failure.code, 'insufficient-time')
  assert.equal(confirmations, 0); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
  assert.equal(f.cleanupCalls.length, 1)
})

test('admission regression: normal confirmation preparation cannot consume the connection reservation and dispatch anyway', async t => {
  const f = fixture(t); let confirmations = 0, created = 0
  f.options.prepareConnection = async () => { confirmations++; f.u.clock.advance(30000) }
  f.options.createConnection = () => { created++; assert.fail('late connection factory') }
  const result = await f.run()
  assert.equal(result.failure.code, 'deadline'); assert.equal(confirmations, 1)
  assert.equal(created, 0); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
  assert.equal(f.cleanupCalls.length, 1)
})

test('admission regression: window preparation rejection still awaits owned cleanup without opening confirmation', async t => {
  const f = fixture(t); let confirmations = 0
  f.options.prepareWindow = async () => { throw Error('synthetic window preparation failure') }
  f.options.prepareConnection = async () => { confirmations++ }
  const result = await f.run()
  assert.equal(result.passed, false); assert.equal(result.failure.code, 'verification-failed')
  assert.equal(confirmations, 0); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
  assert.equal(f.cleanupCalls.length, 1)
})

test('slow runtime preparation precedes finite route creation and the factory receives the admitted fixed budget', async t => {
  const f = fixture(t), stages = []; let admitted
  f.options.prepareWindow = async () => {
    stages.push('runtime'); f.u.clock.advance(100000)
    const issued = f.u.clock.now
    stages.push('route'); admitted = plan(f.options.messageOptions.clock, { expiresAt: { authorization: issued + 900000, route: issued + 600000, relay: issued + 585000 } })
    return admitted
  }
  f.options.prepareConnection = async context => { assert.equal(context.budget, admitted); stages.push('confirmation') }
  const create = f.options.createConnection
  f.options.createConnection = budget => { assert.equal(budget, admitted); stages.push('dispatch'); return create(budget) }
  const result = await f.run()
  assert.equal(result.passed, true); assert.equal(result.admitted, true); assert.equal(f.f.sends(), 2)
  assert.equal(result.stability.elapsedMs, 180000); assert.equal(admitted.plan.deadlines.cleanup - admitted.plan.startAt, 500000)
  assert.equal(admitted.plan.durations.cleanup, 60000); assert.equal(admitted.plan.observationMs, 180000)
  assert.deepEqual(stages, ['runtime', 'route', 'confirmation', 'dispatch'])
})

test('starting the driver promise cannot open a confirmation while window preparation is pending', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(); let confirmations = 0, settled = false
  f.u.releases.push(() => release.resolve(f.budget))
  f.options.prepareWindow = async () => { entered.resolve(); return release.promise }
  f.options.prepareConnection = async () => { confirmations++ }
  const pending = f.run().then(result => { settled = true; return result }); await entered.promise
  assert.equal(confirmations, 0); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0); assert.equal(settled, false)
  release.resolve(f.budget); const result = await pending
  assert.equal(result.passed, true); assert.equal(confirmations, 1)
})

test('normal confirmation is prepared before either UI adapter captures its final action', async t => {
  const f = fixture(t), order = []
  f.u.desktop.phase = 'stopped'
  f.options.prepareConnection = async () => { order.push('confirmation'); f.u.desktop.phase = 'confirmation' }
  for (const [name, adapter] of [['desktop', f.options.desktop], ['phone', f.options.phone]]) {
    const prepare = adapter.prepare.bind(adapter)
    adapter.prepare = async () => { order.push(name); await prepare() }
  }
  assert.equal((await f.run()).passed, true)
  assert.equal(order[0], 'confirmation'); assert.deepEqual(new Set(order.slice(1)), new Set(['desktop', 'phone']))
})

test('budget construction failure waits for cleanup and never claims a known cleanup deadline', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(); let settled = false
  f.u.releases.push(release.resolve)
  f.options.prepareWindow = async () => { f.u.clock.advance(98487); return plan(f.options.messageOptions.clock) }
  const cleanup = f.options.cleanup
  f.options.cleanup = async context => { assert.equal(context.deadline, undefined); entered.resolve(); await release.promise; await cleanup(context) }
  const pending = f.run().then(result => { settled = true; return result }); await entered.promise
  assert.equal(settled, false); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
  release.resolve(); const result = await pending
  assert.equal(result.admitted, false); assert.equal(result.failure.code, 'insufficient-time'); assert.equal(result.failure.phase, 'plan')
  assert.equal(result.cleanupFailure, null); assert.equal(result.cleanupLate, null); assert.equal(f.cleanupCalls.length, 1)
})

test('window preparation rejection and unverified restoration remain separate failures', async t => {
  const f = fixture(t)
  f.options.prepareWindow = async () => { throw Error('synthetic public route failure') }
  f.options.cleanup = async () => { throw Error('synthetic restoration not verified') }
  const result = await f.run()
  assert.equal(result.admitted, false); assert.equal(result.failure.code, 'verification-failed'); assert.equal(result.failure.phase, 'prepare-window')
  assert.equal(result.cleanupFailure, 'cleanup-unverified'); assert.equal(result.cleanupLate, null); assert.equal(result.passed, false)
})

for (const stage of ['window', 'confirmation']) test('cancellation awaits pending ' + stage + ' preparation before cleanup and cannot advance afterward', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(); let cleaned = false, created = 0
  f.u.releases.push(() => release.resolve(f.budget))
  if (stage === 'window') f.options.prepareWindow = async context => { assert.equal(context.signal, f.f.controller.signal); entered.resolve(); return release.promise }
  else f.options.prepareConnection = async context => { assert.equal(context.signal, f.f.controller.signal); entered.resolve(); await release.promise }
  const cleanup = f.options.cleanup
  f.options.cleanup = async context => { cleaned = true; await cleanup(context) }
  f.options.createConnection = () => { created++; assert.fail('cancelled factory') }
  const pending = f.run(); await entered.promise; f.f.controller.abort(); await Promise.resolve()
  assert.equal(cleaned, false); assert.equal(created, 0)
  release.resolve(f.budget); const result = await pending
  assert.equal(result.failure.code, 'cancelled'); assert.equal(cleaned, true); assert.equal(created, 0)
  assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0); assert.equal(f.cleanupCalls.length, 1)
})

test('a delayed budget result is checked again before confirmation work', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(); let confirmations = 0
  f.u.releases.push(() => release.resolve(f.budget))
  f.options.prepareWindow = async () => { entered.resolve(); return release.promise }
  f.options.prepareConnection = async () => { confirmations++ }
  const pending = f.run(); await entered.promise; f.u.clock.advance(30000); release.resolve(f.budget)
  const result = await pending
  assert.equal(result.failure.code, 'deadline'); assert.equal(result.admitted, false); assert.equal(confirmations, 0)
  assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0); assert.equal(f.cleanupCalls.length, 1)
})

test('late confirmation completion settles before close and cannot start either UI adapter', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(); let captured = 0, cleaned = false
  f.u.releases.push(release.resolve)
  f.options.prepareConnection = async () => { entered.resolve(); await release.promise; f.u.desktop.phase = 'confirmation' }
  for (const adapter of [f.options.desktop, f.options.phone]) adapter.prepare = async () => { captured++ }
  const cleanup = f.options.cleanup; f.options.cleanup = async context => { cleaned = true; await cleanup(context) }
  const pending = f.run(); await entered.promise; f.u.clock.advance(30000)
  assert.equal(cleaned, false); assert.equal(captured, 0)
  release.resolve(); const result = await pending
  assert.equal(result.admitted, true); assert.equal(result.failure.code, 'deadline'); assert.equal(cleaned, true)
  assert.equal(captured, 0); assert.equal(f.u.desktop.phase, 'stopped'); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
})

test('confirmation preparation failure closes its partial UI and cannot reach submission', async t => {
  const f = fixture(t)
  f.options.prepareConnection = async () => { f.u.desktop.phase = 'confirmation'; throw Error('synthetic confirmation failure') }
  const result = await f.run()
  assert.equal(result.failure.code, 'verification-failed'); assert.equal(result.failure.phase, 'prepare-connection')
  assert.equal(result.admitted, true); assert.equal(f.u.desktop.phase, 'stopped'); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
  assert.equal(f.cleanupCalls.length, 1)
})

test('expired confirmation and cleanup overrun are independently reported without extending reservations', async t => {
  const f = fixture(t), originalDeadline = f.budget.plan.deadlines.cleanup, cleanup = f.options.cleanup
  f.options.prepareConnection = async () => { f.u.clock.advance(30000) }
  f.options.cleanup = async context => { f.u.clock.advance(originalDeadline - f.u.clock.now); await cleanup(context) }
  const result = await f.run()
  assert.equal(result.failure.code, 'deadline'); assert.equal(result.failure.phase, 'connect'); assert.equal(result.cleanupLate, true)
  assert.equal(result.cleanupFailure, null); assert.equal(f.budget.plan.deadlines.cleanup, originalDeadline); assert.equal(result.passed, false)
})

for (const issue of ['cancelled', 'read-cap']) test(issue + ' before preparation cannot create a route or open confirmation', async t => {
  const f = fixture(t); let windows = 0, confirmations = 0
  f.options.prepareWindow = async () => { windows++; return f.budget }; f.options.prepareConnection = async () => { confirmations++ }
  if (issue === 'cancelled') f.f.controller.abort(); else f.options.maxObservationReads = 0
  const result = await f.run()
  assert.equal(result.failure.code, issue === 'cancelled' ? 'cancelled' : 'invalid-budget')
  assert.equal(windows, 0); assert.equal(confirmations, 0); assert.equal(result.cleanupLate, null); assert.equal(f.cleanupCalls.length, 1)
})

test('preparation consuming the connection reservation refuses factory creation and messages', async t => {
  const f = fixture(t), prepare = f.options.phone.prepare.bind(f.options.phone); let created = 0
  f.options.phone.prepare = async () => { await prepare(); f.u.clock.advance(30000) }
  f.options.createConnection = () => { created++; assert.fail('late connection factory') }
  const r = await f.run(); assert.equal(r.failure.code, 'deadline'); assert.equal(created, 0); assert.equal(f.f.sends(), 0); assert.equal(f.cleanupCalls.length, 1)
})

test('failed preparation awaits the other owned preparation before invoking cleanup', async t => {
  const f = fixture(t), gate = deferred(), entered = deferred(); let cleaned = false
  f.options.desktop.prepare = async () => { throw Error('synthetic preparation failure') }
  f.options.phone.prepare = async () => { entered.resolve(); await gate.promise }
  const cleanup = f.options.cleanup; f.options.cleanup = async c => { cleaned = true; await cleanup(c) }
  const pending = f.run(); await entered.promise; await Promise.resolve(); assert.equal(cleaned, false)
  gate.resolve(); const r = await pending; assert.equal(r.failure.code, 'verification-failed'); assert.equal(cleaned, true); assert.equal(f.f.sends(), 0)
})

for (const number of [1, 2]) test('expiry during input ' + number + ' does not click its send or replay an earlier message', async t => {
  const f = fixture(t, { messages: { input(_text, state) { if (state.sent === number - 1) state.now = number === 1 ? 121000 : 241000 } } })
  const r = await f.run(); assert.equal(r.failure.code, 'deadline'); assert.equal(f.f.sends(), number - 1); assert.equal(r.failure.phase, number === 1 ? 'reply' : 'stop'); assert.equal(f.cleanupCalls.length, 1)
})

for (const kind of ['disconnect', 'foreign']) test(kind + ' during timed observation cannot pass and still reaches cleanup', async t => {
  let f; f = fixture(t, { messages: { view(v) { if (f.f.records.some(r => r[0] === 'complete')) { if (kind === 'foreign') v.viewport.foreign = true; else v.complete.nodes.find(n => n.text === '已连接').text = '未连接' } } } })
  const r = await f.run(); assert.equal(r.passed, false); assert.equal(r.failure.code, kind === 'foreign' ? 'foreign-or-missing-app' : 'connection-lost'); assert.equal(r.stability, null); assert.equal(f.cleanupCalls.length, 1)
})

test('an observation gap cannot be counted as three minutes of sampled connection', async t => {
  const f = fixture(t), pause = f.f.ui.pause; f.f.ui.pause = async s => { await pause(s); if (f.f.records.some(r => r[0] === 'complete')) f.u.clock.advance(16000) }
  const r = await f.run(); assert.equal(r.failure.code, 'observation-gap'); assert.equal(r.passed, false); assert.equal(f.cleanupCalls.length, 1)
})

test('zero-progress observations exhaust their cap without reporting successful stability', async t => {
  const f = fixture(t), pause = f.f.ui.pause; f.options.maxObservationReads = 2
  f.f.ui.pause = async signal => { if (f.f.records.some(r => r[0] === 'complete')) signal.throwIfAborted(); else await pause(signal) }
  const r = await f.run(); assert.equal(r.failure.code, 'stability-not-observed'); assert.equal(r.passed, false); assert.equal(f.cleanupCalls.length, 1)
})

test('cancellation prevents message work but never suppresses cleanup', async t => {
  const f = fixture(t); f.f.controller.abort()
  const r = await f.run(); assert.equal(r.failure.code, 'cancelled'); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0); assert.equal(f.cleanupCalls.length, 1)
})

test('cleanup failure and overrun remain separate from successful message and stability checks', async t => {
  const f = fixture(t), cleanup = f.options.cleanup
  f.options.cleanup = async c => { await cleanup(c); f.u.clock.advance(f.budget.plan.deadlines.cleanup - f.u.clock.now); throw Error('synthetic restore unverified') }
  const r = await f.run(); assert.equal(r.failure, null); assert.ok(r.stability.elapsedMs >= 180000); assert.equal(r.cleanupLate, true); assert.equal(r.cleanupFailure, 'cleanup-unverified'); assert.equal(r.passed, false)
})

test('completion waits for the cleanup owner instead of treating its start as restoration', async t => {
  const f = fixture(t), entered = deferred(), release = deferred(), cleanup = f.options.cleanup; let settled = false
  f.options.cleanup = async c => { entered.resolve(); await release.promise; await cleanup(c) }
  const pending = f.run().then(r => { settled = true; return r }); await entered.promise; assert.equal(settled, false)
  release.resolve(); assert.equal((await pending).passed, true)
})

for (const issue of ['clock', 'read-cap']) test('invalid ' + issue + ' is refused before UI preparation', async t => {
  const f = fixture(t)
  if (issue === 'clock') f.options.messageOptions = { ...f.f.options, clock: () => 1000 }
  else f.options.maxObservationReads = 0
  const r = await f.run(); assert.equal(r.failure.code, 'invalid-budget'); assert.equal(f.u.connects(), 0); assert.equal(f.f.sends(), 0)
})

test('cancellation during observation cannot become a successful duration and still cleans up', async t => {
  let f; f = fixture(t, { messages: { journal(method, value) { if (method === 'observe' && value.phase === 'stability') f.f.controller.abort() } } })
  const r = await f.run(); assert.equal(r.failure.code, 'cancelled'); assert.equal(r.stability, null); assert.equal(f.cleanupCalls.length, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareConnectionStart } from '../operations/prepared-connection-start.mjs'

function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function setup(overrides = {}) {
  const calls = [], controller = new AbortController(), time = { now: 1000 }
  const adapter = role => ({ ready: () => true, submit: async () => { calls.push(role) } })
  return { calls, controller, time, options: { desktop: adapter('desktop'), phone: adapter('phone'), clock: () => time.now, deadline: 10000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: controller.signal, ...overrides } }
}
test('both final actions are issued before either acknowledgment or polling', async () => {
  const first = deferred(), second = deferred(), f = setup()
  f.options.desktop.submit = () => { f.calls.push('desktop'); return first.promise }
  f.options.phone.submit = () => { f.calls.push('phone'); return second.promise }
  const pending = prepareConnectionStart(f.options)()
  assert.deepEqual(f.calls, ['desktop', 'phone'])
  second.resolve(); first.resolve()
  assert.deepEqual(await pending, { desktop: 'acknowledged', phone: 'acknowledged', reason: null, dispatchSkewMs: 0 })
})
test('desktop not ready refuses both final actions', async () => {
  const f = setup(); f.options.desktop.ready = () => false
  assert.equal((await prepareConnectionStart(f.options)()).reason, 'not-ready'); assert.deepEqual(f.calls, [])
})
test('phone not ready refuses both final actions', async () => {
  const f = setup(); f.options.phone.ready = () => false
  assert.equal((await prepareConnectionStart(f.options)()).reason, 'not-ready'); assert.deepEqual(f.calls, [])
})
test('cancelled or expired preparation never dials', async () => {
  const cancelled = setup(); cancelled.controller.abort()
  assert.equal((await prepareConnectionStart(cancelled.options)()).reason, 'cancelled'); assert.deepEqual(cancelled.calls, [])
  const expired = setup(); expired.time.now = expired.options.deadline
  assert.equal((await prepareConnectionStart(expired.options)()).reason, 'expired'); assert.deepEqual(expired.calls, [])
})
test('a callback consuming the remaining budget prevents a late second dial', async () => {
  const f = setup(); f.options.desktop.submit = async () => { f.calls.push('desktop'); f.time.now += 21797 }
  const r = await prepareConnectionStart(f.options)()
  assert.deepEqual(f.calls, ['desktop']); assert.equal(r.phone, 'not-issued'); assert.equal(r.reason, 'expired')
})
test('a non-overlapping dispatch budget is rejected before issuing the second action', async () => {
  const f = setup(); f.options.deadline = 100000; f.options.desktop.submit = async () => { f.calls.push('desktop'); f.time.now += 1000 }
  assert.equal((await prepareConnectionStart(f.options)()).reason, 'dispatch-budget-exceeded'); assert.deepEqual(f.calls, ['desktop'])
})
test('unknown action outcomes are reported without a retry or cleanup claim', async () => {
  const f = setup(); f.options.desktop.submit = async () => { f.calls.push('desktop'); throw Error('private diagnostic') }
  const commit = prepareConnectionStart(f.options), r = await commit()
  assert.equal(r.reason, 'action-outcome-unknown'); assert.equal(r.desktop, 'unknown'); assert.equal(r.phone, 'acknowledged')
  assert.equal(JSON.stringify(r).includes('private diagnostic'), false)
  await assert.rejects(commit(), /already consumed/); assert.deepEqual(f.calls, ['desktop', 'phone'])
})
test('a refused preparation is consumed and cannot become an implicit retry', async () => {
  const f = setup(); f.options.phone.ready = () => false
  const commit = prepareConnectionStart(f.options); assert.equal((await commit()).reason, 'not-ready')
  f.options.phone.ready = () => true; await assert.rejects(commit(), /already consumed/); assert.deepEqual(f.calls, [])
})
test('cancellation during the first synchronous submission blocks the second', async () => {
  const f = setup(); f.options.desktop.submit = async () => { f.calls.push('desktop'); f.controller.abort() }
  const r = await prepareConnectionStart(f.options)(); assert.equal(r.reason, 'cancelled'); assert.equal(r.phone, 'not-issued'); assert.deepEqual(f.calls, ['desktop'])
})
test('the local dispatch budget cannot relax the existing challenge TTL', () => {
  const f = setup(); f.options.maxDispatchSkewMs = f.options.challengeTtlMs
  assert.throws(() => prepareConnectionStart(f.options), /invalid connection start budget/); assert.deepEqual(f.calls, [])
})

test('a synchronous first action error blocks the second without assuming no side effects', async () => {
  const f = setup(); f.options.desktop.submit = () => { f.calls.push('desktop'); throw Error('private diagnostic') }
  const r = await prepareConnectionStart(f.options)()
  assert.equal(r.desktop, 'unknown'); assert.equal(r.phone, 'not-issued'); assert.equal(r.reason, 'action-outcome-unknown')
  assert.deepEqual(f.calls, ['desktop'])
})

test('invalid or backwards dispatch clocks cannot authorize a second action', async () => {
  const invalid = setup(); invalid.time.now = NaN
  assert.equal((await prepareConnectionStart(invalid.options)()).reason, 'invalid-clock'); assert.deepEqual(invalid.calls, [])
  const backwards = setup(); backwards.options.desktop.submit = async () => { backwards.calls.push('desktop'); backwards.time.now-- }
  assert.equal((await prepareConnectionStart(backwards.options)()).reason, 'dispatch-budget-exceeded'); assert.deepEqual(backwards.calls, ['desktop'])
})

test('cancellation after dispatch still waits for both owned action acknowledgments', async () => {
  const first = deferred(), second = deferred(), f = setup()
  f.options.desktop.submit = () => { f.calls.push('desktop'); return first.promise }
  f.options.phone.submit = () => { f.calls.push('phone'); return second.promise }
  let settled = false
  const pending = prepareConnectionStart(f.options)().then(result => { settled = true; return result })
  f.controller.abort(); first.resolve(); await first.promise
  assert.equal(settled, false); assert.deepEqual(f.calls, ['desktop', 'phone'])
  second.resolve(); assert.equal((await pending).reason, 'cancelled')
})

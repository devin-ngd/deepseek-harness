import test from 'node:test'
import assert from 'node:assert/strict'
import { planConcurrentMvpWindow } from '../operations/mvp-window-budget.mjs'

const durations = { prepare: 60000, connect: 60000, messages: 225000, observe: 200000, cleanup: 45000 }
function plan(now, overrides = {}) {
  return planConcurrentMvpWindow({ now, expiresAt: { authorization: 1800000, route: 525000, relay: 585000 }, durations, ...overrides })
}

test('signed-route preparation, messages, continuous observation and cleanup fit without extending expiries', () => {
  const result = plan(1000)
  assert.deepEqual(result, { startAt: 1000, hardExpiresAt: 525000, cleanupBy: 346000, totalReservedMs: 390000 })
  assert.ok(Object.isFrozen(result))
})

test('rc227 actual public-transfer time refuses before route upload or connection confirmation', () => {
  const routeExpiresAt = 1793496289225
  const now = Date.parse('2026-11-01T01:19:01.629Z')
  assert.ok(routeExpiresAt - now > 300000, 'old public-transfer check admitted this exact observation')
  let uploads = 0, confirmations = 0
  assert.throws(() => {
    plan(now, { expiresAt: { authorization: 1793497382372, route: routeExpiresAt - 75000, relay: routeExpiresAt - 15000 } })
    uploads++; confirmations++
  }, error => error.code === 'insufficient-time')
  assert.equal(uploads, 0); assert.equal(confirmations, 0)
})

test('rc227 relay-start interval is shorter than the unchanged remote minimum', () => {
  const routeExpiresAt = 1793496289225
  for (const at of ['2026-11-01T01:19:52.410Z', '2026-11-01T01:19:53.047Z']) {
    const remainingSeconds = Math.floor((routeExpiresAt - Date.parse(at)) / 1000) - 15
    assert.ok(remainingSeconds < 300)
  }
})

for (const cutoff of ['authorization', 'route', 'relay']) test(cutoff + ' independently refuses exact-budget equality and shortage', () => {
  for (const end of [390999, 391000]) assert.throws(() => plan(1000, { expiresAt: { authorization: 900000, route: 900000, relay: 900000, [cutoff]: end } }), error => error.code === 'insufficient-time')
})

test('elapsed preparation is rechecked instead of reusing an earlier admission', () => {
  assert.ok(plan(1000))
  assert.throws(() => plan(140000), error => error.code === 'insufficient-time')
  assert.equal(plan(1000, { durations: { ...durations, prepare: 0 } }).totalReservedMs, 330000)
})

test('longer observation owns the concurrent reservation and cleanup stays fully reserved', () => {
  const d = { ...durations, messages: 120000, observe: 250000 }
  assert.equal(plan(1000, { durations: d }).totalReservedMs, 415000)
  assert.equal(d.cleanup, 45000)
})

test('invalid clocks, durations and missing sampling margin cannot admit side effects', () => {
  for (const now of [NaN, Infinity, 1.5]) assert.throws(() => plan(now), error => error.code === 'invalid-budget')
  for (const d of [{ ...durations, prepare: -1 }, { ...durations, messages: 0 }, { ...durations, observe: 180000 }, { ...durations, cleanup: Infinity }]) assert.throws(() => plan(1000, { durations: d }), error => error.code === 'invalid-budget')
})

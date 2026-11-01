import test from 'node:test'
import assert from 'node:assert/strict'
import { uiFixture, deferred } from './helpers/connection-ui-fixture.mjs'
import { createDesktopUiAdapter, createPhoneUiAdapter } from '../operations/connection-ui-adapters.mjs'

test('UI construction is inert and preparation never taps a phone control', async t => {
  const f = uiFixture(t); assert.deepEqual(f.calls, [])
  await f.prepare(); assert.equal(f.connects(), 0); assert.ok(f.d.ready() && f.p.ready()); assert.equal(f.calls.some(row => row[0] === 'hdc' && row.includes('click')), false)
})

test('both actual UI drivers submit before the first desktop acknowledgment', async t => {
  const f = uiFixture(t), gate = f.holdDesktop(); await f.prepare()
  const started = f.owner.start()
  assert.equal(f.desktop.phase, 'connecting'); assert.equal(f.phone.phase, 'connecting'); assert.equal(f.connects(), 2)
  gate.resolve(); assert.equal((await started).reason, null)
  assert.deepEqual(await f.owner.stop(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.phone.paired, true); assert.equal(f.phone.data, 'retained-synthetic-history')
  await assert.rejects(f.owner.start(), /already consumed/); assert.equal(f.connects(), 2)
})

test('cancellation before final submission dismisses confirmation and never connects', async t => {
  const f = uiFixture(t); await f.prepare(); f.lifetime.abort()
  const result = await f.owner.start()
  assert.equal(result.reason, 'cancelled'); assert.equal(f.connects(), 0)
  assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' }); assert.equal(f.desktop.phase, 'stopped')
})

test('reentrant cancellation during desktop submission prevents phone submission and drains the original call', async t => {
  const f = uiFixture(t), gate = f.holdDesktop(); await f.prepare()
  f.desktop.onSubmit = () => f.lifetime.abort()
  const started = f.owner.start()
  assert.equal(f.connects(), 1); assert.equal(f.desktop.phase, 'connecting')
  gate.resolve(); const result = await started
  assert.equal(result.reason, 'cancelled'); assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' })
})

test('action timeout retains an unabortable desktop call and reports pending at cleanup deadline', async t => {
  const f = uiFixture(t), gate = f.holdDesktop(); await f.prepare()
  const started = f.owner.start(); f.clock.advance(10000)
  assert.equal(f.desktop.phase, 'connecting', 'stop cannot overtake the owned click')
  f.clock.advance(5000)
  const result = await started
  assert.equal(result.reason, 'action-timeout'); assert.equal(result.cleanup.desktop, 'pending')
  gate.resolve(); assert.deepEqual(await f.owner.settled(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.connects(), 2); assert.equal(f.clock.pending.size, 0)
})

test('a late failed acknowledgment still runs both normal stops without retry', async t => {
  const f = uiFixture(t), gate = f.holdDesktop(); await f.prepare()
  const started = f.owner.start(); gate.reject(Error('synthetic unknown click outcome'))
  const result = await started
  assert.equal(result.reason, 'action-outcome-unknown'); assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' }); assert.equal(f.connects(), 2)
})

test('unverified desktop cleanup remains failed while phone cleanup completes', async t => {
  const f = uiFixture(t); await f.prepare(); await f.owner.start(); f.desktop.stopFails = true
  assert.deepEqual(await f.owner.stop(), { desktop: 'failed', phone: 'stopped' })
  assert.equal(f.phone.paired, true)
})

test('stale readiness consumes the attempt and never submits', async t => {
  const f = uiFixture(t); await f.prepare(); f.clock.advance(5000)
  const result = await f.owner.start()
  assert.equal(result.reason, 'not-ready'); assert.equal(f.connects(), 0)
})

test('desktop window mismatch and missing normal Allow confirmation fail closed', async t => {
  const f = uiFixture(t); f.desktop.wrongWindow = true
  await assert.rejects(f.d.prepare(), /desktop-window-changed/); assert.equal(f.connects(), 0)
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => purpose === 'connect' ? { kind: 'submit-confirmation', allowSelected: false } : f.review(state, purpose) })
  f.desktop.wrongWindow = false; await assert.rejects(adapter.prepare(), e => e.code === 'desktop-confirmation-not-prepared')
  await adapter.close()
})

test('phone connect must name exactly the reviewed host and foreign overlays prohibit input', async t => {
  const f = uiFixture(t)
  for (const host of ['other.invalid', 'relay.invalid.other']) { f.phone.host = host; await assert.rejects(createPhoneUiAdapter(f.phoneOptions).prepare(), /consent not prepared/) }
  assert.equal(f.connects(), 0)
  assert.throws(() => createPhoneUiAdapter({ ...f.phoneOptions, labels: { ...f.phoneOptions.labels, connectHost: '连接' } }), /host action label invalid/)
  f.phone.host = 'relay.invalid'; f.phone.overlay = true
  const adapter = createPhoneUiAdapter(f.phoneOptions)
  await assert.rejects(adapter.prepare(), /foreign overlay/); await assert.rejects(adapter.close(), /foreign overlay/)
})

test('phone restart invalidates preparation and never transfers input to the new process', async t => {
  const f = uiFixture(t); f.phone.pid = '999'
  await assert.rejects(f.p.prepare(), /process changed/); assert.equal(f.connects(), 0)
})

test('cancellation while UI review is pending cannot publish a late readiness ticket', async t => {
  const f = uiFixture(t), reviewed = deferred(), entered = deferred()
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => {
    if (purpose === 'connect') { entered.resolve(); await reviewed.promise }
    return f.review(state, purpose)
  } })
  f.releases.push(reviewed.resolve)
  const preparation = adapter.prepare(); await entered.promise; adapter.cancel()
  const closed = adapter.close(); reviewed.resolve()
  await assert.rejects(preparation, /abort/i); await closed
  assert.equal(adapter.ready(), false); assert.equal(f.connects(), 0)
})

test('observation age includes review time rather than restarting the readiness clock', async t => {
  const f = uiFixture(t)
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => { if (purpose === 'connect') f.clock.advance(5000); return f.review(state, purpose) } })
  await adapter.prepare(); assert.equal(adapter.ready(), false); assert.throws(() => adapter.submit(), /not ready/)
  await adapter.close(); assert.equal(f.connects(), 0)
})

test('lifetime cancellation after both acknowledgments still stops both local UIs', async t => {
  const f = uiFixture(t); await f.prepare(); assert.equal((await f.owner.start()).reason, null)
  f.lifetime.abort(); assert.deepEqual(await f.owner.settled(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.desktop.phase, 'stopped'); assert.equal(f.phone.enabled, false); assert.equal(f.connects(), 2)
})

test('waiting for cleanup never implicitly issues a stop on a successful start', async t => {
  const f = uiFixture(t); await f.prepare(); await f.owner.start()
  await assert.rejects(f.owner.settled(), /not been requested/)
  assert.equal(f.desktop.phase, 'connecting'); assert.equal(f.phone.phase, 'connecting')
})

test('desktop targets require a button index in the current accessibility observation', async t => {
  const f = uiFixture(t)
  const adapter = createDesktopUiAdapter({ ...f.desktopOptions, review: async (state, purpose) => purpose === 'connect' ? { kind: 'submit-confirmation', allowSelected: true, elementIndex: 999, elementText: '提交回答' } : f.review(state, purpose) })
  await assert.rejects(adapter.prepare(), /desktop-button-unavailable/); await adapter.close(); assert.equal(f.connects(), 0)
})

test('phone cancellation waits for the pending input before stopping the route', async t => {
  const f = uiFixture(t), gate = deferred(), issued = deferred()
  const run = f.hdc.run.bind(f.hdc)
  f.hdc.run = (args, signal) => { if (args.at(-3) === 'click' && args.at(-2) === '20') issued.resolve(); return run(args, signal) }
  f.phone.held = gate.promise; f.releases.push(gate.resolve); await f.prepare()
  const started = f.owner.start(); await issued.promise; f.lifetime.abort()
  assert.equal(f.phone.phase, 'connecting')
  gate.resolve(); const result = await started
  assert.equal(result.reason, 'cancelled'); assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' })
  assert.equal(f.phone.data, 'retained-synthetic-history')
})

test('synchronous desktop driver failure prevents the phone final action', async t => {
  const f = uiFixture(t); await f.prepare()
  const click = f.sky.click.bind(f.sky)
  f.sky.click = input => { if (input.element_index === 10) throw Error('synthetic driver failure'); return click(input) }
  const result = await f.owner.start()
  assert.equal(result.reason, 'action-outcome-unknown'); assert.equal(result.dispatch.phone, 'not-issued'); assert.equal(f.connects(), 0)
  assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' })
})

test('late acknowledgments cannot evade a deadline whose timer has not run yet', async t => {
  const f = uiFixture(t), gate = f.holdDesktop(); await f.prepare()
  const started = f.owner.start()
  f.clock.now = 11000; gate.resolve()
  const result = await started
  assert.equal(result.reason, 'action-timeout'); assert.deepEqual(result.cleanup, { desktop: 'stopped', phone: 'stopped' })
})

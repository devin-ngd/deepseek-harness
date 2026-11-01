import test from 'node:test'
import assert from 'node:assert/strict'
import { createMvpMessageFlow, mvpInputArgs, mvpScrollGesture } from '../operations/mvp-message-flow.mjs'
import { mvpFixture } from './helpers/mvp-message-fixture.mjs'
import { deferred } from './helpers/connection-ui-fixture.mjs'

const failure = (f, code) => assert.rejects(f.flow().run(), e => e.code === code)

test('two exact inputs require the phone assistant reply, live generation and cancellation acknowledgment', async () => {
  const f = mvpFixture(), result = await f.flow().run()
  assert.deepEqual(result, { phoneReplyVerified: true, runningStopVerified: true, effects: { send1: 'issued', send2: 'issued', stop: 'issued' }, scrollActions: 0 })
  assert.equal(f.sends(), 2); assert.deepEqual(f.calls.filter(c => c[0] === 'input').map(c => c[2]), f.plan.messages)
  assert.deepEqual(f.records.filter(c => c[0] === 'claim').map(c => c[1]), ['send1', 'send2', 'stop'])
})

test('asynchronous session selection and an initially empty input render are awaited', async () => {
  const f = mvpFixture(); f.s.selectDelay = 3; f.s.inputDelay = 3
  await f.flow().run(); assert.equal(f.sends(), 2); assert.ok(f.s.pauses >= 8)
})

test('a phone remaining in connecting times out without navigation, input or send', async () => {
  const f = mvpFixture({ view(v) { for (const face of [v.complete, v.viewport]) face.nodes.find(n => n.text === '已连接').text = '连接中' } })
  await failure(f, 'connected-phone-not-observed'); assert.deepEqual(f.calls, [])
})

test('an initially disconnected phone is refused rather than reconnected or polled as connecting', async () => {
  const f = mvpFixture({ view(v) { for (const face of [v.complete, v.viewport]) face.nodes.find(n => n.text === '已连接').text = '未连接' } })
  await failure(f, 'connection-lost'); assert.deepEqual(f.calls, [])
})

for (const extra of ["'", '）']) test('literal input drift is refused without clearing or sending: ' + extra, async () => {
  const f = mvpFixture({ input(text, s) { s.draft = extra === "'" ? "'" + text + "'" : text + extra } })
  await failure(f, 'draft-changed'); assert.equal(f.sends(), 0); assert.equal(f.calls.filter(c => c[0] === 'input').length, 1)
})

test('a deferred IME mutation after one exact observation is refused', async () => {
  const f = mvpFixture({ pause(s) { if (s.draft) s.draft += '）' } })
  await failure(f, 'draft-changed'); assert.equal(f.sends(), 0)
})

for (const state of ['disabled', 'missing']) test(state + ' send waits within its budget and never swipes', async () => {
  const f = mvpFixture({ input(text, s) { s.send = state } })
  await failure(f, 'control-' + state); assert.equal(f.sends(), 0); assert.equal(f.calls.some(c => c[0] === 'scroll'), false)
  assert.ok(f.records.some(c => c[1]?.reason === state))
})

test('a temporarily disabled send can become ready without a scroll', async () => {
  let waiting = 0
  const f = mvpFixture({ input(text, s) { s.send = 'disabled'; waiting = 0 }, pause(s) { if (s.draft && ++waiting === 4) s.send = 'ready' } })
  await f.flow().run(); assert.equal(f.sends(), 2); assert.equal(f.calls.some(c => c[0] === 'scroll'), false)
})

for (const state of ['offscreen', 'clipped']) test(state + ' send uses the resized Scroll and rechecks the exact draft', async () => {
  const f = mvpFixture({ input(text, s) { s.send = state } })
  await f.flow().run()
  assert.deepEqual(f.calls.filter(c => c[0] === 'scroll').map(c => c[1]), [['1307', '1440', '1307', '360'], ['1307', '1440', '1307', '360']])
})

test('drift during a scroll fails before the send claim', async () => {
  const f = mvpFixture({ input(text, s) { s.send = 'offscreen' }, scroll(g, s) { s.draft += '）' } })
  await failure(f, 'draft-changed'); assert.equal(f.sends(), 0); assert.equal(f.records.some(c => c[0] === 'claim'), false)
})

test('a visible editable control crossing the scroll lane prevents scrolling', async () => {
  const f = mvpFixture({ input(text, s) { s.send = 'offscreen' }, view(v) { for (const face of [v.complete, v.viewport]) { const composer = face.nodes.find(n => n.id === 'product-composer'); if (composer?.bounds) composer.bounds = '[0,1300][1320,1450]' } } })
  await failure(f, 'unsafe-scroll'); assert.equal(f.calls.some(c => c[0] === 'scroll'), false)
})

test('scroll geometry outside the owned root is refused', async () => {
  const f = mvpFixture(), v = await f.ui.observe()
  v.viewport.nodes.find(n => n.id === 'product-page-scroll').bounds = '[0,0][1320,4000]'
  assert.throws(() => mvpScrollGesture(v), /outside owned/)
})

test('scroll budget is global across both messages', async () => {
  const f = mvpFixture({ input(text, s) { s.send = 'offscreen' } }); f.options.maxScrolls = 1
  await failure(f, 'scroll-budget'); assert.equal(f.sends(), 1)
})

for (const [name, mutate, code] of [
  ['PID change', v => { v.pid = '456' }, 'stale-or-changed-window'],
  ['window change', v => { v.window = '13' }, 'stale-or-changed-window'],
  ['foreign overlay', v => { v.viewport.foreign = true }, 'foreign-or-missing-app'],
  ['wrong page', v => { v.complete.nodes[0].pagePath = 'pages/Other' }, 'changed-ui-owner'],
  ['stale sequence', v => { v.sequence = 1 }, 'stale-or-changed-window'],
  ['incomplete tree', v => { v.complete.coverage = 'viewport' }, 'incomplete-observation'],
  ['old observation', v => { v.observedAt -= 500 }, 'stale-observation'],
  ['disconnection', v => { v.complete.nodes.find(n => n.text === '已连接').text = '未连接' }, 'connection-lost'],
  ['read-only selection', v => { v.complete.nodes.push({ type: 'Text', text: '只读会话' }) }, 'read-only'],
  ['lost selection', v => { v.complete.nodes = v.complete.nodes.filter(n => n.id !== 'product-chat-back') }, 'selection-lost'],
  ['duplicate send', v => { v.complete.nodes.push({ ...v.complete.nodes.find(n => n.id === 'product-send') }) }, 'duplicate-control'],
]) test(name + ' after input stops before sending', async () => {
  const f = mvpFixture({ view(v, s) { if (s.draft) mutate(v) } })
  await failure(f, code); assert.equal(f.sends(), 0)
})

test('viewport text disagreement with the complete snapshot is refused', async () => {
  const f = mvpFixture({ view(v, s) { if (s.draft) v.viewport.nodes.find(n => n.id === 'product-composer').text += '）' } })
  await failure(f, 'draft-changed'); assert.equal(f.sends(), 0)
})

test('a viewport showing a newly disabled send waits without swiping despite the older complete tree', async () => {
  const f = mvpFixture({ view(v, s) { if (s.draft) v.viewport.nodes.find(n => n.id === 'product-send').enabled = 'false' } })
  await failure(f, 'control-disabled'); assert.equal(f.sends(), 0); assert.equal(f.calls.some(c => c[0] === 'scroll'), false)
})

test('a changed control type cannot be clicked using its old identifier', async () => {
  const f = mvpFixture({ view(v, s) { if (s.draft) v.complete.nodes.find(n => n.id === 'product-send').type = 'Text' } })
  await failure(f, 'wrong-control-type'); assert.equal(f.sends(), 0)
})

test('an input command failure preserves the unissued send state and never retypes', async () => {
  const f = mvpFixture({ input() { throw Error('synthetic input outcome unknown') } })
  await assert.rejects(f.flow().run(), e => e.code === 'ui-port-failed' && e.effects.send1 === 'not-issued')
  assert.equal(f.calls.filter(c => c[0] === 'input').length, 1); assert.equal(f.sends(), 0)
})

test('cancellation waits for the original input call and then prevents any send', async () => {
  const gate = deferred(), entered = deferred()
  const f = mvpFixture({ async input() { entered.resolve(); await gate.promise } })
  let settled = false
  const pending = f.flow().run().finally(() => { settled = true })
  await entered.promise; f.controller.abort(); await Promise.resolve(); assert.equal(settled, false)
  gate.resolve(); await assert.rejects(pending, e => e.code === 'cancelled'); assert.equal(f.sends(), 0)
})

for (const stop of ['cancel', 'deadline', 'stale']) test(stop + ' during the final claim prevents click', async () => {
  const f = mvpFixture({ journal(method, key, s) { if (method === 'claim' && key === 'send1') { if (stop === 'cancel') f.controller.abort(); else s.now += stop === 'deadline' ? 10000 : 500 } } })
  await failure(f, stop === 'cancel' ? 'cancelled' : stop === 'deadline' ? 'deadline' : 'stale-observation')
  assert.equal(f.sends(), 0)
})

test('lost click acknowledgment records an unknown outcome and never retries', async () => {
  const f = mvpFixture({ click(id) { if (id === 'product-send') throw Error('synthetic lost acknowledgment') } })
  await assert.rejects(f.flow().run(), e => e.code === 'click-outcome-unknown' && e.effects.send1 === 'unknown' && e.effects.send2 === 'not-issued')
  assert.equal(f.sends(), 1); assert.equal(f.records.some(c => c[0] === 'issued'), false)
})

test('failed issuing journal prevents click; failed acknowledgment journal preserves issued outcome', async () => {
  for (const method of ['claim', 'issued']) {
    const f = mvpFixture({ journal(m) { if (m === method) throw Error('disk full') } })
    await assert.rejects(f.flow().run(), e => e.code === 'journal-failed' && e.effects.send1 === (method === 'claim' ? 'not-issued' : 'issued'))
    assert.equal(f.sends(), method === 'claim' ? 0 : 1)
  }
})

test('user text or an unmatched assistant answer cannot satisfy the phone reply receipt', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 1) { v.complete.nodes.find(n => n.text === '助手').text = '用户'; v.complete.nodes.push({ type: 'Text', text: f.plan.reply }) } } })
  await failure(f, 'phone-reply-not-observed'); assert.equal(f.sends(), 1)
})

test('an assistant response combining reasoning and a final exact reply line permits the second send', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 1) v.complete.nodes.find(n => n.text === f.plan.reply).text = 'Reasoning about the requested response.\n' + f.plan.reply } })
  const result = await f.flow().run()
  assert.equal(result.phoneReplyVerified, true); assert.equal(result.runningStopVerified, true); assert.equal(f.sends(), 2)
})

for (const [name, response] of [
  ['quoted reply', reply => '"' + reply + '"'],
  ['embedded reply', reply => 'Answer: ' + reply],
  ['reasoning mention before a different answer', reply => reply + '\nA different answer'],
]) test(name + ' cannot satisfy the final assistant reply', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 1) v.complete.nodes.find(n => n.text === f.plan.reply).text = response(f.plan.reply) } })
  await failure(f, 'phone-reply-not-observed'); assert.equal(f.sends(), 1)
})

test('an exact assistant message before turn completion cannot trigger the second send', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 1) v.complete.nodes.find(n => n.id === 'dsh-task-state').text = '运行中' } })
  await failure(f, 'phone-reply-not-observed'); assert.equal(f.sends(), 1)
})

test('a running reasoning phase can be stopped before body text arrives', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 2) v.complete.nodes.find(n => n.id === 'product-live-text').text = '' } })
  const result = await f.flow().run()
  assert.equal(result.runningStopVerified, true); assert.equal(f.calls.filter(c => c[1] === 'product-cancel').length, 1)
})

test('an enabled stop without a running task cannot pass as generation evidence', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 2) v.complete.nodes.find(n => n.id === 'dsh-task-state').text = '已完成' } })
  await failure(f, 'running-generation-not-observed'); assert.equal(f.calls.some(c => c[1] === 'product-cancel'), false)
})

test('an edited draft after the second send prevents the stop click', async () => {
  const f = mvpFixture({ view(v, s) { if (s.sent === 2) for (const face of [v.complete, v.viewport]) face.nodes.find(n => n.id === 'product-composer').text = 'manual draft' } })
  await failure(f, 'running-generation-not-observed'); assert.equal(f.calls.some(c => c[1] === 'product-cancel'), false)
})

function pinnedFooter(view) {
  for (const face of [view.complete, view.viewport]) {
    face.nodes.find(n => n.id === 'product-page-scroll').bounds = '[0,0][1320,1200]'
    face.nodes.push({ id: 'product-conversation-controls', type: 'Column', visible: 'true', bounds: '[0,1200][1320,1800]' })
  }
}

test('composer and actions in a fixed footer are used without scrolling history', async () => {
  const f = mvpFixture({ view(v, s) { if (s.page === 'conversation') pinnedFooter(v) } })
  const result = await f.flow().run()
  assert.ok(result.phoneReplyVerified && result.runningStopVerified); assert.equal(result.scrollActions, 0)
})

for (const mismatch of ['outside-footer', 'outside-root', 'missing-viewport-footer', 'duplicate-footer']) test('unsafe fixed controls are refused before input: ' + mismatch, async () => {
  const f = mvpFixture({ view(v, s) {
    if (s.page !== 'conversation') return
    pinnedFooter(v)
    for (const face of [v.complete, v.viewport]) {
      const footer = face.nodes.find(n => n.id === 'product-conversation-controls')
      if (mismatch === 'outside-footer') footer.bounds = '[0,1200][1320,1400]'
      if (mismatch === 'outside-root') footer.bounds = '[0,1200][1320,4000]'
      if (mismatch === 'duplicate-footer') face.nodes.push({ ...footer })
    }
    if (mismatch === 'missing-viewport-footer') v.viewport.nodes = v.viewport.nodes.filter(n => n.id !== 'product-conversation-controls')
  } })
  await failure(f, mismatch === 'duplicate-footer' ? 'duplicate-control' : 'footer-not-visible')
  assert.equal(f.calls.some(c => c[0] === 'scroll' || c[0] === 'input'), false); assert.equal(f.sends(), 0)
})

test('generation ending before the fresh stop observation prevents a misleading stop click', async () => {
  let liveReads = 0
  const f = mvpFixture({ observe(s) { if (s.sent === 2 && ++liveReads === 2) s.task = '已完成' } })
  await failure(f, 'generation-ended-before-stop'); assert.equal(f.calls.some(c => c[1] === 'product-cancel'), false)
})

test('a stop click alone is insufficient without the phone cancelled state', async () => {
  const f = mvpFixture({ view(v) { const n = v.complete.nodes.find(n => n.id === 'dsh-task-state'); if (n?.text === '已取消') n.text = '运行中' } })
  await failure(f, 'cancelled-generation-not-observed'); assert.equal(f.sends(), 2); assert.equal(f.records.some(c => c[0] === 'complete'), false)
})

test('one flow cannot be run concurrently or replayed', async () => {
  const f = mvpFixture(), flow = f.flow(), first = flow.run()
  await assert.rejects(flow.run(), e => e.code === 'flow-already-consumed'); await first; assert.equal(f.sends(), 2)
})

test('closed ASCII input argv never adds quotes and rejects remote shell syntax', () => {
  const f = mvpFixture(), args = mvpInputArgs('synthetic-target', ['100', '200'], f.plan.messages[0])
  assert.equal(args.at(-1), f.plan.messages[0]); assert.equal(args.at(-1).includes("'"), false)
  for (const text of ["'quoted'", 'has space', 'a;b', '$(cmd)', 'a`cmd`', 'a\nb']) assert.throws(() => mvpInputArgs('synthetic-target', ['100', '200'], text), /invalid/)
  assert.throws(() => createMvpMessageFlow({ ...f.options, maxReads: 0 }), /limits/)
})

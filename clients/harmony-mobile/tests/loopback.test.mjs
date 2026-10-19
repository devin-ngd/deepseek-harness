/** Exercises HTTP mock admission and reconnect; not a real desktop or HarmonyOS connection. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLoopbackFixture } from './helpers/loopback.mjs'

test('ephemeral loopback carrier admits one synthetic task and replays completion after a lost receipt', async () => {
  const fixture = await startLoopbackFixture()
  const post = async body => {
    const response = await fetch(fixture.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(response.status, 200)
    return response.json()
  }
  try {
    const sessions = await post({ operation: 'sessions' })
    const request = { protocol: 'dsh-mobile-lab/1', desktopId: fixture.desktop.desktopId, sessionId: sessions[0].sessionId,
      requestId: 'http-phone-request', scenario: 'rich-form', text: 'HTTP固定演示' }
    const accepted = await post({ operation: 'prompt', request })
    const reconciled = await post({ operation: 'receipt', sessionId: request.sessionId, requestId: request.requestId })
    assert.deepEqual(reconciled, accepted)
    fixture.desktop.advance(request.sessionId, request.requestId)
    fixture.desktop.advance(request.sessionId, request.requestId)
    const frames = await post({ operation: 'replay', sessionId: request.sessionId, cursor: 0 })
    assert.equal(frames.at(-1).event.state, 'completed')
    assert.ok(frames.some(frame => frame.event.kind === 'rich'))
    assert.deepEqual(await post({ operation: 'prompt', request }), accepted)
    assert.equal(fixture.desktop.admittedTasks, 1)
  } finally { await fixture.close() }
})

test('mock carrier refuses browser origins, arbitrary host commands and unknown routes', async () => {
  const fixture = await startLoopbackFixture()
  try {
    const hostile = await fetch(fixture.url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' }, body: '{"operation":"sessions"}' })
    assert.equal(hostile.status, 403)
    const arbitrary = await fetch(fixture.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"operation":"shell.execute","command":"not-executed"}' })
    assert.equal(arbitrary.status, 400)
    assert.equal(fixture.desktop.admittedTasks, 0)
    assert.equal((await fetch(fixture.url.replace('/mock', '/api'))).status, 404)
  } finally { await fixture.close() }
})

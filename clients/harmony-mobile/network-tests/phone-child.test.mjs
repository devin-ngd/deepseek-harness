/** Separate phone test process; only loopback BFF bytes are used for task/action results. No renderer or native platform is claimed. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { access, writeFile } from 'node:fs/promises'
import { NetworkPhone } from '../.build/network-phone.js'
import { WireCursor } from '../.build/wire.js'
import { authoredBlockId } from '../.build/upstream-authored.js'

test('separate phone process exercises actual loopback BFF and fixed replay lifecycle', { timeout: 18000 }, async () => {
  const baseUrl = process.env.DSH_HARMONY_PHONE_URL, output = process.env.DSH_HARMONY_PHONE_REPORT, readyFile = process.env.DSH_HARMONY_CANCEL_READY
  if (!baseUrl || !output || !readyFile) throw new Error('Owned network test launcher required')
  const config = { enabled: true, mode: 'loopback-fixed-replay', baseUrl, maxFrameBytes: 1048576, maxReadChunkBytes: 1048576, requestTimeoutMs: 10000, maxInFlight: 8 }
  const phone = new NetworkPhone(config, fetch)
  const owner = { desktopId: 'phase4-desktop', deviceId: 'phase4-phone', sessionId: 'phase4-session' }, cursor = new WireCursor(owner, 256)
  let commandSequence = 0, feed, feedAbort, feedError
  const received = [], assertions = [], connectionStates = [phone.state]
  const command = (operation, payload) => ({ protocol: 'dsh-mobile-lab/2', desktopId: owner.desktopId, deviceId: owner.deviceId, grantEpoch: 1,
    commandId: 'phone-' + process.pid + '-' + ++commandSequence, expiresAt: Date.now() + 60000, operation, payload })
  const request = (operation, payload) => phone.request(command(operation, payload))
  const until = async (check, timeout = 5000) => {
    const deadline = Date.now() + timeout
    while (!await check()) {
      if (feedError !== undefined && !feedAbort?.signal.aborted) throw feedError
      if (Date.now() >= deadline) throw new Error('Fixture wait timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  const startFeed = (resume = cursor.resume) => {
    feedError = undefined; feedAbort = new AbortController()
    feed = (async () => { try {
      for await (const item of phone.follow(command('session.sync', { sessionId: owner.sessionId, afterSeq: -1 }), resume, feedAbort.signal)) {
        if (cursor.apply(item)) received.push(item)
      }
    } catch (error) { feedError = error } })()
  }
  const stopFeed = async () => { feedAbort?.abort(); await feed }
  const assistant = () => {
    for (const item of received) {
      const payload = item.payload
      if (payload?.type === 'event' && payload.event.type === 'assistant/message') return payload.event.data.message
      if (payload?.type === 'snapshot') {
        const row = payload.records.find(record => record.event.type === 'assistant/message')
        if (row) return row.event.data.message
      }
    }
  }
  try {
    assert.equal(phone.state.connection, 'disconnected')
    startFeed(); await until(() => received.some(item => item.kind === 'reset'))
    assert.equal(phone.state.connection, 'connected'); connectionStates.push(phone.state)
    assertions.push('decoded opening marks loopback-fixed-replay connected')
    const rawApi = await fetch(new URL('/api', baseUrl), { method: 'POST', body: '{}' }); assert.equal(rawApi.status, 403); await rawApi.arrayBuffer()
    const origin = await fetch(new URL('/mobile/command', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.com' }, body: '{}' }); assert.equal(origin.status, 403); await origin.arrayBuffer()
    assertions.push('operator API and browser Origin refused')
    await assert.rejects(request('task.submit', { sessionId: 'phase4-foreign', requestId: 'foreign-request', text: 'Must never run' }), error => error.code === 'scope-denied')
    const foreignPeer = command('session.cancel', { sessionId: owner.sessionId }); foreignPeer.deviceId = 'foreign-device'
    await assert.rejects(phone.request(foreignPeer), error => error.code === 'scope-denied')
    assert.equal(phone.state.connection, 'connected'); assertions.push('cross session/device refused before dispatch; remote refusal stays connected')
    const rejectedFollow = phone.follow(command('session.sync', { sessionId: 'phase4-foreign', afterSeq: -1 }), { instance: null, relayCursor: -1 })[Symbol.asyncIterator]()
    await assert.rejects(rejectedFollow.next(), error => error.code === 'scope-denied')
    const forgedCursor = phone.follow(command('session.sync', { sessionId: owner.sessionId, afterSeq: -1 }), { instance: cursor.resume.instance, relayCursor: cursor.resume.relayCursor + 1000 })[Symbol.asyncIterator]()
    await assert.rejects(forgedCursor.next(), error => error.code === 'cursor-ahead')
    const malformed = await fetch(new URL('/mobile/command', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })
    assert.equal(JSON.parse(await malformed.text()).code, 'invalid-json')
    assertions.push('foreign follow, future cursor and malformed command receive explicit errors')
    const capacity = []
    try {
      for (let index = 0; index < 3; index++) {
        const iterator = phone.follow(command('session.sync', { sessionId: owner.sessionId, afterSeq: -1 }), { instance: null, relayCursor: -1 })[Symbol.asyncIterator]()
        capacity.push(iterator); assert.equal((await iterator.next()).value.kind, 'reset')
      }
      await assert.rejects(request('task.receipt', { sessionId: owner.sessionId, requestId: 'not-admitted' }), error => error.code === 'http-rejected')
    } finally { await Promise.all(capacity.map(iterator => iterator.return())) }
    // Cancellation reaches the server asynchronously; a fresh opening confirms the bounded slots were released.
    await until(async () => {
      try { return (await request('task.receipt', { sessionId: owner.sessionId, requestId: 'not-admitted' })).state === 'unknown' }
      catch (error) { if (error.code !== 'http-rejected') throw error; return false }
    })
    assertions.push('active request capacity rejects before dispatch and cancelled followers release slots')
    const task = { sessionId: owner.sessionId, requestId: 'phase4-request', text: 'Show fixed replay mobile forms over real BFF.' }
    const submit = command('task.submit', task), receipts = await Promise.all([phone.request(submit), phone.request(submit)])
    assert.deepEqual(receipts, [{ accepted: true, state: 'accepted', requestId: task.requestId }, { accepted: true, state: 'accepted', requestId: task.requestId }])
    await until(() => assistant() !== undefined)
    assert.ok(received.some(item => item.payload?.type === 'assistant-stream' && item.payload.frame.type === 'chunk'))
    assertions.push('duplicate packet admits once and actual follow chunks cross process boundary')
    const scope = { sessionId: owner.sessionId, messageId: assistant().id, blockId: authoredBlockId(assistant().id, 'phone-form'), guestProtocol: 'lumina-rich/1' }
    await stopFeed()
    const retained = cursor.resume, beforeReconnect = received.length
    assert.ok(['cancelled', 'transport-lost'].includes(feedError?.code)); connectionStates.push(phone.state)
    assert.deepEqual(await request('task.receipt', { sessionId: owner.sessionId, requestId: task.requestId }), receipts[0])
    startFeed(retained)
    const mounted = await request('rich.mount', scope), values = { title: 'Final mobile input', count: '7' }
    const intent = { mountId: mounted.mountId, actionId: 'phase3-action', actionName: 'submit', targetActionId: null,
      expectedDataRevision: mounted.snapshot.dataRevision, values, fileGrants: [],
      draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: values, dirty: ['title', 'count'] } }
    const action = command('rich.invoke', intent), actionReceipts = await Promise.all([phone.request(action), phone.request(action)])
    assert.deepEqual(actionReceipts[0], actionReceipts[1]); assert.equal(actionReceipts[0].accepted, true)
    let status
    await until(async () => { status = await request('rich.status', { mountId: mounted.mountId, actionId: intent.actionId }); return status?.terminal === true })
    assert.equal(status.state, 'completed'); assert.deepEqual(status.values, values)
    assert.ok(received.slice(beforeReconnect).some(item => item.kind === 'event'))
    assert.ok(!received.slice(beforeReconnect).some(item => item.kind === 'reset'))
    assertions.push('retained cursor resumes without reset, rich duplicate action completes original values')
    const changed = { ...action, payload: { ...intent, values: { title: 'Different packet', count: '9' } } }
    await assert.rejects(phone.request(changed), error => error.code === 'id-conflict')
    const other = await request('rich.mount', { ...scope, blockId: authoredBlockId(scope.messageId, 'other-form') })
    assert.equal((await request('rich.invoke', { ...intent, mountId: other.mountId })).code, 'ACTION_ID_CONFLICT')
    assertions.push('same command changed payload and Session-wide cross-block action reuse refused')
    await request('rich.dispose', { mountId: mounted.mountId })
    const reopened = await request('rich.mount', scope)
    assert.deepEqual(await request('rich.invoke', { ...intent, mountId: reopened.mountId }), actionReceipts[0])
    assertions.push('fresh mount retry retains original action receipt without model rerun')
    await stopFeed()
    const beforeReset = received.length
    startFeed({ instance: 'retired-generation', relayCursor: retained.relayCursor })
    await until(() => received.slice(beforeReset).some(item => item.kind === 'reset'))
    assertions.push('old server generation replaces state through canonical snapshot')
    await stopFeed()
    const timeoutPhone = new NetworkPhone({ ...config, requestTimeoutMs: 60 }, fetch)
    try {
      const timeoutStream = timeoutPhone.follow(command('session.sync', { sessionId: owner.sessionId, afterSeq: -1 }), { instance: null, relayCursor: -1 })[Symbol.asyncIterator]()
      assert.equal((await timeoutStream.next()).value.kind, 'reset')
      await assert.rejects(timeoutStream.next(), error => error.code === 'timeout')
    } finally { await timeoutPhone.close() }
    assertions.push('idle follow deadline cancels subscriber without task retry')
    startFeed()
    await request('task.submit', { sessionId: owner.sessionId, requestId: 'phase4-cancel', text: 'Hold the fourth fixed replay until explicit cancellation.' })
    await until(async () => { try { await access(readyFile); return true } catch (error) { if (error.code !== 'ENOENT') throw error; return false } })
    assert.deepEqual(await request('session.cancel', { sessionId: owner.sessionId }), { accepted: true })
    await stopFeed()
    assert.deepEqual(await request('task.submit', task), receipts[0])
    assert.deepEqual(await request('rich.invoke', { ...intent, mountId: reopened.mountId }), actionReceipts[0])
    assertions.push('real fourth replay cancellation and post-reconnect task/action retries preserve receipts')
    await writeFile(output, JSON.stringify({ processId: process.pid, mode: 'loopback-fixed-replay', connectionStates, assertions,
      wireItems: received.length, liveChunks: received.filter(item => item.payload?.type === 'assistant-stream' && item.payload.frame.type === 'chunk').length,
      resume: cursor.resume, finalAction: status, requestReceipt: receipts[0], cancellationReadiness: 'test-only owned replay marker; no API or host execution bridge exposed',
      rendererExecuted: false, arkWebQualified: false, nativeDeviceQualified: false }, null, 2) + '\n')
  } finally { await stopFeed(); await phone.close() }
})

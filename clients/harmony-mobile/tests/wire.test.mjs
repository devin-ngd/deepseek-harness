/** Offline framing/fault tests; these do not establish network or native platform qualification. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { NdjsonDecoder, WireCursor, parseWireItem, parseResume } from '../.build/wire.js'
import { NetworkPhone, resolveNetworkConfig } from '../.build/network-phone.js'

const encoder = new TextEncoder()
const config = { enabled: true, mode: 'loopback-fixed-replay', baseUrl: 'http://127.0.0.1:1/', maxFrameBytes: 8192, maxReadChunkBytes: 8192, requestTimeoutMs: 30, maxInFlight: 8 }
const owner = { desktopId: 'desk', deviceId: 'phone', sessionId: 'session' }
const command = { protocol: 'dsh-mobile-lab/2', ...owner, grantEpoch: 1, commandId: 'cmd', expiresAt: 1000, operation: 'session.sync', payload: { sessionId: owner.sessionId, afterSeq: -1 } }
const item = (kind = 'reset', relayCursor = -1, extra = {}) => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', kind, ...owner, instance: 'generation', relayCursor, payload: { text: '手机' }, ...extra })
const response = text => new Response(text, { headers: { 'content-type': 'application/x-ndjson' } })

test('UTF-8 split bytes and coalesced NDJSON frames preserve exact complete lines', () => {
  const decoder = new NdjsonDecoder(128), bytes = encoder.encode('{"text":"手机"}\n{"seq":1}\n')
  const lines = []
  for (const byte of bytes) lines.push(...decoder.push(Uint8Array.of(byte)))
  assert.deepEqual(lines, ['{"text":"手机"}', '{"seq":1}']); decoder.finish()
  assert.deepEqual([...new NdjsonDecoder(128).push(bytes)], lines)
})

test('oversized, invalid UTF-8, empty, CRLF and truncated frames refuse before JSON projection', () => {
  assert.throws(() => [...new NdjsonDecoder(4).push(encoder.encode('12345'))], error => error.code === 'frame-too-large')
  assert.throws(() => [...new NdjsonDecoder(128).push(Uint8Array.of(255, 10))], error => error.code === 'invalid-utf8')
  for (const value of ['\n', '{}\r\n']) assert.throws(() => [...new NdjsonDecoder(128).push(encoder.encode(value))])
  const decoder = new NdjsonDecoder(128); [...decoder.push(encoder.encode('{"unfinished"'))]
  assert.throws(() => decoder.finish(), error => error.code === 'truncated-frame')
})

test('owner/generation/sequence verification stops foreign, conflicting and gapped traffic', () => {
  const cursor = new WireCursor(owner, 2)
  cursor.apply(parseWireItem(item()))
  const zero = parseWireItem(item('event', 0))
  assert.equal(cursor.apply(zero), true); assert.equal(cursor.apply(zero), false)
  assert.throws(() => cursor.apply(parseWireItem(item('event', 0, { payload: 'changed' }))), error => error.code === 'cursor-conflict')
  assert.throws(() => cursor.apply(parseWireItem(item('event', 2))), error => error.code === 'cursor-gap')
  assert.throws(() => cursor.apply(parseWireItem(item('event', 1, { instance: 'other' }))), error => error.code === 'reset-required')
  assert.throws(() => cursor.apply(parseWireItem(item('event', 1, { sessionId: 'foreign' }))), error => error.code === 'scope-denied')
  assert.deepEqual(cursor.resume, { instance: 'generation', relayCursor: 0 })
  cursor.apply(parseWireItem(item('reset', 5, { instance: 'new-generation' })))
  assert.deepEqual(cursor.resume, { instance: 'new-generation', relayCursor: 5 })
  assert.throws(() => parseResume({ instance: null, relayCursor: -2 }))
  assert.throws(() => parseWireItem({ ...item(), secret: 'extra-field' }))
})

test('disabled and invalid deployment configuration never call fetch or select a host implicitly', async () => {
  let calls = 0
  const phone = new NetworkPhone({ enabled: false }, async () => { calls++; throw new Error('Should not fetch') })
  await assert.rejects(phone.request(command), error => error.code === 'disabled')
  assert.equal(phone.state.connection, 'disabled'); assert.equal(calls, 0); await phone.close()
  for (const baseUrl of ['http://example.com/', 'http://127.0.0.1/path', 'http://user:pass@127.0.0.1/', 'invalid']) assert.throws(() => resolveNetworkConfig({ ...config, baseUrl }))
  assert.throws(() => resolveNetworkConfig({ ...config, mode: 'configured-https' }))
  assert.throws(() => resolveNetworkConfig({ ...config, maxFrameBytes: 1 }), error => error.code === 'invalid-config')
})

test('successful or rejected unary results are decoded before marking transport connected', async () => {
  const frame = { protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', commandId: 'cmd', ok: true, value: { accepted: true } }
  const phone = new NetworkPhone(config, async () => response(JSON.stringify(frame) + '\n'))
  assert.deepEqual(await phone.request(command), frame.value); assert.equal(phone.state.connection, 'connected'); await phone.close()
  const denied = new NetworkPhone(config, async () => response(JSON.stringify({ ...frame, ok: false, value: undefined, code: 'scope-denied' }) + '\n'))
  await assert.rejects(denied.request(command), error => error.code === 'scope-denied')
  assert.equal(denied.state.connection, 'connected'); await denied.close()
})

test('unary extra frames, changed command identity and malformed JSON cannot become domain data', async () => {
  const frame = { protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', commandId: 'cmd', ok: true, value: true }
  for (const value of [JSON.stringify(frame) + '\n' + JSON.stringify(frame) + '\n', JSON.stringify({ ...frame, commandId: 'other' }) + '\n', '{bad}\n']) {
    const phone = new NetworkPhone(config, async () => response(value))
    await assert.rejects(phone.request(command)); assert.equal(phone.state.connection, 'disconnected'); await phone.close()
  }
})

test('consumer-paced stream reads are bounded and caller cancellation does not issue a task retry', async () => {
  let reads = 0, fetches = 0
  const controller = new AbortController()
  const body = new ReadableStream({ pull(stream) { reads++; stream.enqueue(encoder.encode(JSON.stringify({ type: 'item', streamId: 'cmd', value: item() }) + '\n')) } }, { highWaterMark: 0 })
  const phone = new NetworkPhone({ ...config, requestTimeoutMs: 1000 }, async () => { fetches++; return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }) })
  const iterator = phone.follow(command, { instance: null, relayCursor: -1 }, controller.signal)[Symbol.asyncIterator]()
  assert.equal((await iterator.next()).value.kind, 'reset'); assert.equal(reads, 1)
  controller.abort(); await assert.rejects(iterator.next(), error => error.code === 'cancelled')
  assert.equal(fetches, 1); await phone.close()
})

test('response timeout cancels owned reader and never automatically retries a command', async () => {
  let fetches = 0, cancelled = 0
  const phone = new NetworkPhone(config, async () => { fetches++; return new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { 'content-type': 'application/x-ndjson' } }) })
  await assert.rejects(phone.request(command), error => error.code === 'timeout')
  assert.equal(fetches, 1); assert.equal(cancelled, 1); await phone.close()
})
test('in-flight limit rejects new transport work before fetch and close cancels the existing reader', async () => {
  let fetches = 0
  const phone = new NetworkPhone({ ...config, requestTimeoutMs: 1000, maxInFlight: 1 }, async () => { fetches++; return new Response(new ReadableStream(), { headers: { 'content-type': 'application/x-ndjson' } }) })
  const first = phone.request(command)
  await assert.rejects(phone.request(command), error => error.code === 'queue-full')
  const closed = assert.rejects(first, error => error.code === 'closed')
  await phone.close(); await closed; assert.equal(fetches, 1)
})

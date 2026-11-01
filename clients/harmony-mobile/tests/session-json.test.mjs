/** Canonical Session JSON crosses the native carrier without inheriting rich-input depth limits. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DeviceProductRpc } from '../.build/device-product-rpc.js'
import { PairedProductTransport } from '../.build/paired-product-transport.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { PhoneCore } from '../.build/phone-core.js'
import { fields } from '../.build/link-protocol.js'
import { jsonPayload, parseWireItem } from '../.build/wire.js'
import { isRichJson } from '../.build/upstream.js'

const config = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
const owner = { desktopId: 'json-desktop', deviceId: 'json-phone', sessionId: 'json-session' }
const route = { desktopId: owner.desktopId, profileId: 'desktop', sessionId: owner.sessionId }
const tools = [{ name: 'ask', parameters: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } } } } } } } } } }]
const event = { type: 'request/header', seq: 0, time: 100, data: { header: { tools } } }
const snapshot = { type: 'snapshot', header: { version: 4, id: owner.sessionId, createdAt: 100, isSeeded: false }, cursor: 0, records: [{ type: 'event', event }], hasMore: false, projections: { asOfSeq: 0, values: {} }, assistantStream: { revision: 0 } }
const frame = payload => ({ protocol: 'dsh-mobile-wire/1', mode: 'desktop-profile', ...owner, instance: 'json-generation', relayCursor: 0, kind: 'reset', payload })

test('nested canonical tool schemas reach a writable native Session through both RPC adapters', async () => {
  const scheduler = { after: () => () => {} }, lifetime = new AbortController(), stopped = []
  let rpc
  const network = {
    request: async () => { throw new Error('No command belongs to this read-only fixture') },
    follow: async (id) => rpc.receive(JSON.stringify(jsonPayload({ kind: 'frame', id, value: frame(snapshot) }))),
    stop: async id => { stopped.push(id) }, close: async () => {},
  }
  rpc = new DeviceProductRpc(network, scheduler, 10000, 8, 'json-native')
  const transport = new PairedProductTransport(config.core.transport, 100000, () => 100, scheduler, async (status, receive) => {
    status('authorized')
    return rpc.view(route, receive)
  }, () => {}, lifetime.signal)
  const model = new SemanticPhone(owner, config.core.domain, 512)
  const core = new PhoneCore(transport, model, { ...config.core.core, grantEpoch: 1, clock: () => 100, nextCommandId: () => 'json-command' })
  const follow = core.follow(lifetime.signal)[Symbol.asyncIterator]()
  try {
    assert.equal(isRichJson({ payload: snapshot }), false)
    await transport.start()
    const next = await follow.next()
    assert.equal(next.done, false)
    assert.equal(next.value.cursor, 0)
    assert.equal(next.value.readOnly, false)
    assert.deepEqual(next.value.notices, [])
    assert.deepEqual(model.resume, { instance: 'json-generation', relayCursor: 0 })
  } finally {
    lifetime.abort()
    await follow.return()
    await transport.close()
    rpc.close()
  }
  assert.equal(stopped.length, 1)
})

test('a fragmented reply reaches completion through the selected native RPC view without resubmitting', async () => {
  const scheduler = { after: () => () => {} }, lifetime = new AbortController(), stopped = [], requests = []
  let rpc, followId, catalogCalls = 0
  const network = {
    async request(id, raw) {
      const packet = JSON.parse(raw)
      if (packet.method === 'metadata') { catalogCalls++; rpc.receive(JSON.stringify({ kind: 'result', id, value: { desktopId: owner.desktopId } })); return }
      const command = JSON.parse(packet.argument.packet)
      requests.push(command.operation)
      assert.equal(command.operation, 'task.submit')
      rpc.receive(JSON.stringify({ kind: 'result', id, value: { accepted: true, state: 'accepted', requestId: command.payload.requestId } }))
    },
    async follow(id) { followId = id; rpc.receive(JSON.stringify({ kind: 'frame', id, value: frame(snapshot) })) },
    async stop(id) { stopped.push(id) }, async close() {},
  }
  rpc = new DeviceProductRpc(network, scheduler, 10000, 8, 'fragment-native')
  const transport = new PairedProductTransport(config.core.transport, 600000, () => 100, scheduler, async (status, receive) => { status('authorized'); return rpc.view(route, receive) }, () => {}, lifetime.signal)
  const model = new SemanticPhone(owner, config.core.domain, 512)
  let commands = 0, relayCursor = 0, revision = 0, index = 0
  const core = new PhoneCore(transport, model, { ...config.core.core, grantEpoch: 1, clock: () => 100, nextCommandId: () => 'fragment-' + ++commands })
  const stream = core.follow(lifetime.signal)[Symbol.asyncIterator]()
  const deliver = async payload => {
    const next = stream.next()
    rpc.receive(JSON.stringify({ kind: 'frame', id: followId, value: { ...frame(payload), kind: 'event', relayCursor: ++relayCursor } }))
    const received = await next
    assert.equal(received.done, false)
    return received.value
  }
  const live = value => deliver({ type: 'assistant-stream', frame: { ...value, attemptId: 'fragmented', revision: ++revision } })
  const eventFrame = (type, seq, data, extra = {}) => ({ type: 'event', event: { type, seq, time: 100, data, ...extra } })
  try {
    await transport.start(); await stream.next()
    await core.submit('hello-once', 'Hello')
    assert.equal(model.view.task, 'accepted')
    await deliver(eventFrame('turn/start', 1, { turn: 1 }))
    await live({ type: 'start', startedAfterSeq: 1, turn: 1, step: 1 })
    for (let at = 0; at <= config.core.domain.maxBlocks; at++) await live({ type: 'chunk', index: index++, time: 100, chunk: { type: 'reasoning-delta', index: 0, text: 'r' } })
    await live({ type: 'chunk', index: index++, time: 100, chunk: { type: 'text-delta', index: 1, text: 'Hello' } })
    assert.equal(model.view.liveText, 'Hello')
    await deliver(eventFrame('assistant/message', 2, { turn: 1, step: 1, message: { id: 'hello-reply', role: 'assistant', content: [{ type: 'text', text: 'Hello' }], source: { kind: 'llm' } }, stream: [] }, { surfaceOp: 'append' }))
    await live({ type: 'end', index, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 2 } })
    const completed = await deliver(eventFrame('turn/end', 3, { turn: 1, reason: { kind: 'completed' } }))
    assert.equal(completed.task, 'completed'); assert.equal(completed.readOnly, false)
    assert.equal(completed.messages.at(-1).parts[0].text, 'Hello')
    assert.deepEqual(requests, ['task.submit'])
    await assert.rejects(live({ type: 'chunk', index, time: 100, chunk: { type: 'text-delta', index: 1, text: false } }), error => error.code === 'domain-invalid')
    assert.equal(model.view.readOnly, true)
    assert.deepEqual(await rpc.call({ method: 'metadata', argument: null }), { desktopId: owner.desktopId })
    assert.equal(catalogCalls, 1)
  } finally { lifetime.abort(); await stream.return(); await transport.close(); rpc.close() }
  assert.equal(stopped.length, 1)
})

test('wire JSON rejects lossy values and extra envelope fields', () => {
  const cycle = {}; cycle.self = cycle
  for (const invalid of [undefined, NaN, Infinity, -0, cycle, { value: undefined }, new Date(0)]) assert.throws(() => jsonPayload(invalid))
  assert.throws(() => parseWireItem({ ...frame(snapshot), extra: true }))
  assert.throws(() => fields({ value: true, extra: true }, ['value']))
})

test('Session resource limits and rich-input limits still reject before cursor admission', () => {
  const model = new SemanticPhone(owner, { ...config.core.domain, maxBytes: 128 }, 512)
  assert.throws(() => model.accept(parseWireItem(frame(snapshot))), error => error.code === 'domain-too-large')
  assert.equal(model.view.cursor, -1)
  assert.deepEqual(model.resume, { instance: null, relayCursor: -1 })
  assert.equal(isRichJson({ payload: snapshot }), false)
})

test('idle native read segments retain writable history for more than three minutes without replaying tasks', { timeout: 5000 }, async () => {
  let now = 100, rpc, follows = 0, mutations = 0
  const timers = [], started = new Map(), lifetime = new AbortController()
  const scheduler = { after(ms, callback) { const timer = { ms, callback, active: true }; timers.push(timer); return () => { timer.active = false } } }
  const network = {
    request: async () => { mutations++; throw Error('No mutation is authorized') },
    follow: async id => { follows++; if (follows === 1) rpc.receive(JSON.stringify({ kind: 'frame', id, value: frame(snapshot) })); started.get(follows)?.() },
    stop: async () => {}, close: async () => {},
  }
  rpc = new DeviceProductRpc(network, scheduler, 10000, 8, 'idle-native')
  const transport = new PairedProductTransport(config.core.transport, 600000, () => now, scheduler, async (status, receive) => { status('authorized'); return rpc.view(route, receive) }, () => {}, lifetime.signal)
  const model = new SemanticPhone(owner, config.core.domain, 512)
  let commands = 0
  const core = new PhoneCore(transport, model, { ...config.core.core, follow: { ...config.core.core.follow, retryDelayMs: 1 }, grantEpoch: 1, clock: () => now, nextCommandId: () => 'idle-' + ++commands })
  const stream = core.follow(lifetime.signal)[Symbol.asyncIterator]()
  let terminal
  try {
    await transport.start(); await stream.next()
    terminal = stream.next().then(value => ({ value }), error => ({ error }))
    for (let at = 1; at <= 20; at++) {
      const next = new Promise(resolve => { if (follows >= at + 1) resolve(); else started.set(at + 1, resolve) })
      const timer = timers.find(value => value.active && value.ms === config.core.transport.timeoutMs)
      assert.ok(timer); now += timer.ms; timer.callback()
      await Promise.race([next, terminal.then(result => { throw result.error ?? Error('Follow ended before the foreground owner') })])
      assert.equal(model.view.readOnly, false)
    }
    assert.equal(now, 200100); assert.equal(follows, 21); assert.equal(mutations, 0)
  } finally {
    lifetime.abort(); if (terminal) await terminal; await stream.return(); await transport.close(); rpc.close()
  }
  assert.ok(timers.every(timer => !timer.active))
})

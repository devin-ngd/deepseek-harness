/** Canonical read windows and their subscription owners; no sockets, identities or wall-clock waits. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
let moduleUrl
if (process.env.DSH_SESSION_WINDOW_MODULE) moduleUrl = pathToFileURL(process.env.DSH_SESSION_WINDOW_MODULE).href
else {
  const require = createRequire(new URL('../../../package.json', import.meta.url)), esbuild = require(require.resolve('esbuild', { paths: [fileURLToPath(new URL('../../../node_modules/.pnpm', import.meta.url))] }))
  const built = await esbuild.build({ stdin: { contents: "export * from './desktop-plugin/src/session-window.ts';export {profileServicePorts} from './desktop-plugin/src/ports.ts';export {PairedProductTransport} from './src/paired-product-transport.ts';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', tsconfig: fileURLToPath(new URL('../.build/projection.tsconfig.json', import.meta.url)) })
  moduleUrl = 'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64')
}
const { sessionWindow, profileServicePorts, PairedProductTransport } = await import(moduleUrl)
const request = { address: { kind: 'session', sessionId: 'fixture-session' }, assistantStream: true }
const policy = { maxMessages: 50, maxRecords: 512, maxBytes: 524288 }
function fixture(options = {}) {
  const opened = [], closed = [], frames = []
  async function* follow(value, signal) {
    const count = value.maxMessages; opened.push(count)
    try {
      const records = Array.from({ length: count * (options.recordsPerMessage ?? 1) }, (_, seq) => ({ type: 'event', event: { seq, type: 'fixture', data: 'x'.repeat(options.bytesPerRecord ?? 24000) } }))
      const frame = { type: 'snapshot', records, hasMore: true, cursor: 999, projections: { asOfSeq: 999, values: {} } }; frames.push(frame)
      yield frame
      assert.equal(signal.aborted, false)
      yield { type: 'event', event: { seq: 1000 } }
    } finally { closed.push(count); await options.close?.(count) }
  }
  return { follow, opened, closed, frames }
}
test('a history larger than the encrypted carrier opens a smaller canonical window and retains its live suffix', async () => {
  const f = fixture(), iterator = sessionWindow(f.follow, policy, request, new AbortController().signal)[Symbol.asyncIterator]()
  const first = await iterator.next()
  assert.deepEqual(f.opened, [50, 25, 12]); assert.deepEqual(f.closed, [50, 25])
  assert.equal(first.value, f.frames[2]); assert.equal(first.value.hasMore, true)
  assert.ok(Buffer.byteLength(JSON.stringify(first.value)) < policy.maxBytes)
  assert.equal((await iterator.next()).value.event.seq, 1000)
  await iterator.return(); assert.deepEqual(f.closed, [50, 25, 12])
})
test('record limits apply independently of encoded bytes', async () => {
  const f = fixture({ recordsPerMessage: 20, bytesPerRecord: 0 }), iterator = sessionWindow(f.follow, policy, request, new AbortController().signal)[Symbol.asyncIterator]()
  try { const first = await iterator.next(); assert.equal(first.value.records.length, 500); assert.deepEqual(f.opened, [50, 25]) } finally { await iterator.return() }
})
test('the actual profile ports apply the window and release it when the snapshot consumer returns', async () => {
  const f = fixture(), ports = profileServicePorts({ sessionController: { follow: f.follow } }, policy), iterator = ports.session.follow(request, new AbortController().signal)[Symbol.asyncIterator]()
  await iterator.next(); await iterator.return(); assert.deepEqual(f.closed, [50, 25, 12])
})
test('an irreducible oversized message rejects after cleanup and does not poison another read', async () => {
  const f = fixture({ bytesPerRecord: 600000 }), iterator = sessionWindow(f.follow, policy, { ...request, maxMessages: 2 }, new AbortController().signal)[Symbol.asyncIterator]()
  await assert.rejects(iterator.next(), error => error.code === 'history-too-large'); assert.deepEqual(f.closed, [2, 1])
  const good = fixture({ bytesPerRecord: 1 }), other = sessionWindow(good.follow, policy, request, new AbortController().signal)[Symbol.asyncIterator]()
  try { assert.equal((await other.next()).value.type, 'snapshot') } finally { await other.return() }
})
test('a rejected window finishes cleanup before a replacement opens and cancellation prevents reopening', async () => {
  let entered, release
  const atCleanup = new Promise(resolve => { entered = resolve }), cleanup = new Promise(resolve => { release = resolve }), controller = new AbortController()
  const f = fixture({ close: async () => { entered(); await cleanup } }), iterator = sessionWindow(f.follow, policy, request, controller.signal)[Symbol.asyncIterator](), pending = iterator.next(), rejected = assert.rejects(pending)
  try { await atCleanup; assert.deepEqual(f.opened, [50]); controller.abort() } finally { release(); await rejected; await iterator.return() }
  assert.deepEqual(f.opened, [50]); assert.deepEqual(f.closed, [50])
})
test('a genuine subscription release failure stops window retries', async () => {
  const primary = Error('synthetic cleanup failure'), f = fixture({ close: async () => { throw primary } }), iterator = sessionWindow(f.follow, policy, request, new AbortController().signal)[Symbol.asyncIterator]()
  await assert.rejects(iterator.next(), error => error === primary); assert.deepEqual(f.opened, [50])
})
test('the enlarged policy carries a three MiB history and retains independent record and text limits', async () => {
  const config = JSON.parse(await readFile('product.config.json', 'utf8')), f = fixture({ bytesPerRecord: 62000 })
  const iterator = sessionWindow(f.follow, { ...policy, maxBytes: config.core.domain.maxBytes }, request, new AbortController().signal)[Symbol.asyncIterator]()
  try { assert.equal((await iterator.next()).value.records.length, 50); assert.deepEqual(f.opened, [50]) } finally { await iterator.return() }
  assert.equal(config.core.domain.maxBytes, 4194304); assert.equal(config.core.domain.maxEvents, 512); assert.equal(config.core.domain.maxText, 262144)
  assert.ok(config.relay.e2e.maxPlaintextBytes > config.core.domain.maxBytes)
  assert.ok(config.maxCryptoBytes >= config.relay.e2e.maxPlaintextBytes)
  assert.ok(config.relay.e2e.maxFrameBytes > Math.ceil((config.relay.e2e.maxPlaintextBytes + 16) * 4 / 3) + 1024)
  assert.ok(config.relay.maxQueuedBytes >= config.relay.e2e.maxFrameBytes)
})
test('queued follow bytes stay bounded even when individual frames and frame count fit', async () => {
  let stopped = 0
  const transport = new PairedProductTransport({ maxPending: 8, maxQueuedFrames: 256, maxPacketBytes: 1200, timeoutMs: 1000, recovery: { maxAttempts: 1, retryDelayMs: 100 } }, 100000, () => 100, { after: () => () => {} }, async (status, receive) => {
    status('authorized')
    return { request: async () => {}, follow: async id => {
      for (let at = 0; at < 2; at++) receive(JSON.stringify({ kind: 'frame', id, value: { protocol: 'dsh-mobile-wire/1', mode: 'desktop-profile', kind: 'event', desktopId: 'desktop', deviceId: 'phone', sessionId: 'session', instance: 'instance', relayCursor: at, payload: 'x'.repeat(500) } }))
    }, stop: async () => { stopped++ }, close: async () => {} }
  }, () => {}, new AbortController().signal)
  await transport.start()
  const iterator = transport.follow({}, { instance: null, relayCursor: 0 })[Symbol.asyncIterator]()
  try { assert.equal((await iterator.next()).value.relayCursor, 0); await assert.rejects(iterator.next(), error => error.code === 'queue-full'); assert.equal(stopped, 1) } finally { await iterator.return(); await transport.close() }
})

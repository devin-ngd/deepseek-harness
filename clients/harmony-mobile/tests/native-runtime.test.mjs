/** Actual adapter logic under in-memory SDK substitutes plus shared core tests; native execution remains a separate acceptance layer. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { NativeCacheFile, NativeFixtureBytes, NativeHttpStream, NativeAssets, NativeRuntimeOwner, NATIVE_DOCUMENT, NATIVE_ORIGIN, sdk, resetSdk, context } from '../.build/native-adapters.js'
import { NativePortClient } from '../.build/native-port.js'
import { NativeOfflineHost } from '../.build/native-host.js'
import { nativeBootstrapPolicy } from '../.build/native-policy.js'
import { OfflineNativeProvider } from '../.build/native-offline.js'
import { PhoneCore } from '../.build/phone-core.js'
import { SemanticPhone } from '../.build/semantic-phone.js'

const policy = JSON.parse(await readFile('harmony/native-policy.json', 'utf8'))
const rawDir = 'harmony/entry/src/main/resources/rawfile/'
const manifest = JSON.parse(await readFile(rawDir + 'native-runtime-source-manifest.json', 'utf8'))
globalThis.canIUse = () => true
async function resources() { for (const item of manifest.resources) sdk.resources.set(item.name, await readFile(rawDir + item.name)) }
const tick = () => new Promise(accept => setImmediate(accept))
const packet = (id, method, payload = {}) => JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui', generation: 1, id, method, payload })
function sink() { return { chunks: [], errors: [], ended: 0, chunk(bytes) { this.chunks.push(bytes) }, end() { this.ended++ }, failed(code) { this.errors.push(code) } } }
function streamPolicy() { return { enabled: true, url: 'http://127.0.0.1:32123/mobile/follow', maxChunkBytes: 64, maxTotalBytes: 128, timeoutMs: 50 } }
async function owner() { resetSdk(); await resources(); const views = [], errors = [], busy = []; const value = new NativeRuntimeOwner(); value.initialize(context(), view => views.push(view), code => errors.push(code), pending => busy.push(pending)); value.load(); value.bind(NATIVE_DOCUMENT); const port = value.controller.ports[0]; port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ready', generation: 1 })); await tick(); return { value, port, views, errors, busy } }
function acknowledgeClose(port) { port.deliver = raw => { const call = JSON.parse(raw); if (call.method === 'close') queueMicrotask(() => port.emit(JSON.stringify({ protocol: call.protocol, kind: 'ui.reply', id: call.id, generation: call.generation, ok: true, value: { closed: true } }))) } }

test('native attachment loads verified code and grants no port to an inert completion', async () => {
  resetSdk(); await resources(); const errors = [], value = new NativeRuntimeOwner()
  value.initialize(context(), () => {}, code => errors.push(code), () => {})
  value.attached()
  assert.equal(value.controller.getUrl(), NATIVE_DOCUMENT); assert.ok(value.controller.html.length > 0)
  const encoded = 'data:text/html;charset=UTF-8;base64,' + Buffer.from(value.controller.html).toString('base64')
  assert.equal(value.allow(encoded, true), true)
  const sdkCompletion = 'data:text/html;charset=UTF-8;base64,' + encodeURIComponent(Buffer.from(value.controller.html).toString('base64'))
  assert.equal(value.allow(sdkCompletion, true), true)
  assert.equal(value.allow('data:text/html,' + encodeURIComponent(value.controller.html), true), true)
  assert.equal(value.allow(encoded + 'x', true), false)
  value.controller.url = 'about:blank'; value.bind(sdkCompletion)
  assert.deepEqual(value.controller.ports, []); assert.deepEqual(errors, ['native-document-denied'])
  value.controller.url = NATIVE_DOCUMENT; errors.length = 0
  assert.equal(value.allow('data:text/html,<script>evil()</script>', true), false)
  assert.equal(value.allow(encoded, false), false)
  value.bind('about:blank')
  assert.deepEqual(value.controller.ports, []); assert.deepEqual(errors, ['native-document-denied'])
  value.bind(sdkCompletion)
  assert.equal(value.allow(encoded, true), false)
  const port = value.controller.ports[0]; port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ready', generation: 1 }))
  acknowledgeClose(port); await value.close(); assert.equal(port.closed, true)
})

test('native close before attachment prevents late callbacks from restarting code', async () => {
  resetSdk(); await resources(); const value = new NativeRuntimeOwner()
  value.initialize(context(), () => {}, () => {}, () => {})
  value.controller.url = 'about:blank'; await value.close(); value.attached(); value.bind('about:blank')
  assert.equal(value.controller.html, ''); assert.deepEqual(value.controller.ports, [])
})

test('native cache completes partial UTF-8 reads and writes before fsync and rename', async () => {
  resetSdk(); sdk.maxRead = 2; sdk.maxWrite = 3
  const cache = new NativeCacheFile('/app', 128), text = '手机离线缓存\n'
  await cache.write(text); assert.equal(await cache.read(128), text)
  assert.ok(sdk.calls.indexOf('fsync') < sdk.calls.indexOf('rename')); assert.equal(sdk.fds.size, 0); assert.deepEqual([...sdk.dirs], ['/app'])
})
test('native cache fsync and rename failure preserve the previous file and remove temporary files', async () => {
  for (const operation of ['fsync', 'rename']) {
    resetSdk(); const cache = new NativeCacheFile('/app', 128); await cache.write('previous')
    sdk.faults.set(operation, 1); await assert.rejects(cache.write('replacement'), error => error.code === 'cache-write-failed' && error.cleanupFailed === false)
    assert.equal(await cache.read(128), 'previous'); assert.equal(sdk.files.size, 1); assert.equal(sdk.fds.size, 0); assert.equal(sdk.dirs.size, 1)
  }
})
test('native cache reports committed replacement separately from directory cleanup failure', async () => {
  resetSdk(); sdk.faults.set('rmdir', 1); const cache = new NativeCacheFile('/app', 128)
  await assert.rejects(cache.write('committed'), error => error.code === 'cache-committed-cleanup-failed')
  assert.equal(await cache.read(128), 'committed'); assert.equal(sdk.fds.size, 0)
})
test('native cache rejects oversized metadata before reading and denies symlink traversal', async () => {
  resetSdk(); const cache = new NativeCacheFile('/app', 128); await cache.write('safe'); sdk.calls = []; sdk.statSize = 129
  await assert.rejects(cache.read(128), error => error.code === 'cache-too-large'); assert.ok(!sdk.calls.includes('read')); assert.equal(sdk.fds.size, 0)
  sdk.statSize = null; sdk.files.get('/app/mobile-offline-cache.json').symlink = true
  await assert.rejects(cache.read(128), error => error.code === 'cache-read-failed')
})
test('native cache zero progress and invalid UTF-8 fail visibly without an empty cache fallback', async () => {
  resetSdk(); const cache = new NativeCacheFile('/app', 128); await cache.write('valid'); sdk.maxRead = 0
  await assert.rejects(cache.read(128), error => error.code === 'cache-read-incomplete'); assert.equal(sdk.fds.size, 0)
  sdk.maxRead = Infinity; sdk.files.set('/app/mobile-offline-cache.json', { bytes: Buffer.from([255]) }); await assert.rejects(cache.read(128))
})
test('native resource selection and hash reject unknown paths and same-length tampering', async () => {
  resetSdk(); await resources(); const assets = new NativeAssets(context())
  assert.throws(() => assets.read('../native-policy.json'), error => error.code === 'resource-denied'); assert.equal(sdk.resourceReads, 0)
  const bytes = Buffer.from(sdk.resources.get('native-policy.json')); bytes[0] ^= 1; sdk.resources.set('native-policy.json', bytes)
  assert.throws(() => assets.read('native-policy.json'), error => error.code === 'resource-hash-invalid')
})
test('native resource digest capability failure prevents executable resource admission', async () => {
  resetSdk(); await resources(); globalThis.canIUse = () => false
  try { assert.throws(() => new NativeAssets(context()).read('native-offline-core.js'), error => error.code === 'resource-digest-unavailable') }
  finally { globalThis.canIUse = () => true }
})
test('native fixture byte splits preserve multi-byte characters without network construction', () => {
  resetSdk(); const text = '中文🙂\n', bytes = new NativeFixtureBytes(128, 4).split(text, 1)
  assert.equal(Buffer.concat(bytes.map(value => Buffer.from(value, 'base64'))).toString('utf8'), text)
  assert.equal(sdk.requests.length, 0); assert.throws(() => new NativeFixtureBytes(3, 4).split(text, 1), error => error.code === 'stream-too-large')
})
test('disabled native HTTP refuses before SDK construction and active HTTP requires safe API and loopback scope', async () => {
  resetSdk(); const disabled = new NativeHttpStream(policy.nativeHttp)
  await assert.rejects(disabled.open('{}', sink()), error => error.code === 'stream-disabled'); assert.equal(sdk.requests.length, 0)
  for (const url of ['https://remote.invalid/mobile/follow', 'http://127.0.0.1:0/mobile/follow', 'http://127.0.0.1:65536/mobile/follow']) assert.throws(() => new NativeHttpStream({ ...streamPolicy(), url }), error => error.code === 'stream-scope-denied')
  sdk.api = 22; assert.throws(() => new NativeHttpStream(streamPolicy()), error => error.code === 'stream-api-unsupported')
})
test('native stream admits chunks only after exact NDJSON header and HTTP status and disables redirects', async () => {
  resetSdk(); const carrier = new NativeHttpStream(streamPolicy()), output = sink(), done = carrier.open('{}', output), request = sdk.requests[0]
  request.emit('dataReceive', new TextEncoder().encode('one\n').buffer); request.emit('headersReceive', { 'Content-Type': 'application/x-ndjson; charset=utf-8' }); request.emit('dataEnd'); assert.equal(output.chunks.length, 0)
  request.respond(200); await done; assert.equal(output.chunks.length, 1); assert.equal(output.ended, 1); assert.equal(request.options.maxRedirects, 0); assert.equal(request.options.usingCache, false); assert.equal(request.destroyed, true); assert.equal(request.listeners.size, 0)
})
test('native stream wrong header and rejected status release callbacks without delivering buffered bytes', async () => {
  for (const invalid of ['header', 'status']) {
    resetSdk(); const carrier = new NativeHttpStream(streamPolicy()), output = sink(), done = carrier.open('{}', output), request = sdk.requests[0]
    request.emit('dataReceive', new ArrayBuffer(2)); request.emit('headersReceive', invalid === 'header' ? { 'X-Notice': 'application/x-ndjson' } : { 'Content-Type': 'application/x-ndjson' }); request.respond(503); await done
    assert.equal(output.chunks.length, 0); assert.equal(output.ended, 0); assert.ok(output.errors.includes(invalid === 'header' ? 'stream-content-type-invalid' : 'stream-http-rejected')); assert.equal(request.listeners.size, 0)
  }
})

test('native live follow delivers before request completion only with an exact successful SDK status line', async () => {
  resetSdk(); const carrier = new NativeHttpStream({ ...streamPolicy(), timeoutMs: 1000 }), output = sink(), done = carrier.open('{}', output), request = sdk.requests[0]
  request.emit('dataReceive', new TextEncoder().encode('live\n').buffer)
  request.emit('headersReceive', { 'content-type': 'application/x-ndjson', 'Status-Line': 'HTTP/1.1 200 OK' })
  assert.equal(output.chunks.length, 1); assert.equal(output.ended, 0); assert.equal(request.destroyed, false)
  await carrier.close(); await done; assert.deepEqual(output.errors, ['stream-closed'])
  for (const line of ['HTTP/1.1 503 Unavailable', 'HTTP/1.1 2000 OK', 'HTTP/1.1 200 OK\r\nOther: forged']) {
    resetSdk(); const rejected = new NativeHttpStream(streamPolicy()), denied = sink(), pending = rejected.open('{}', denied), http = sdk.requests[0]
    http.emit('dataReceive', new ArrayBuffer(1)); http.emit('headersReceive', { 'content-type': 'application/x-ndjson', 'Status-Line': line }); await pending
    assert.equal(denied.chunks.length, 0); assert.deepEqual(denied.errors, ['stream-http-rejected']); assert.equal(http.destroyed, true)
  }
})
test('API26 live follow requires the exact BFF wire marker when SDK headers omit status', async () => {
  resetSdk(); const carrier = new NativeHttpStream({ ...streamPolicy(), timeoutMs: 1000 }), output = sink(), done = carrier.open('{}', output), request = sdk.requests[0]
  request.emit('headersReceive', { 'content-type': 'application/x-ndjson', 'x-dsh-mobile-stream': 'dsh-mobile-wire/1;status=200' })
  request.emit('dataReceive', new TextEncoder().encode('first\n').buffer)
  assert.equal(output.chunks.length, 1); assert.equal(output.ended, 0)
  request.respond(503); await done; assert.deepEqual(output.errors, ['stream-http-rejected']); assert.equal(output.ended, 0)
  for (const marker of ['dsh-mobile-wire/1;status=503', 'dsh-mobile-wire/2;status=200', 'dsh-mobile-wire/1;status=200\r\nInjected: true']) {
    resetSdk(); const rejected = new NativeHttpStream(streamPolicy()), denied = sink(), pending = rejected.open('{}', denied), http = sdk.requests[0]
    http.emit('dataReceive', new ArrayBuffer(1)); http.emit('headersReceive', { 'content-type': 'application/x-ndjson', 'x-dsh-mobile-stream': marker }); await pending
    assert.equal(denied.chunks.length, 0); assert.deepEqual(denied.errors, ['stream-protocol-invalid']); assert.equal(http.destroyed, true)
  }
})

test('native stream synchronous request and destroy failures settle even when the sink throws', async () => {
  resetSdk(); sdk.faults.set('http.request', 1); const first = new NativeHttpStream(streamPolicy()), output = sink(); await first.open('{}', output); assert.deepEqual(output.errors, ['stream-request-failed']); assert.equal(sdk.requests[0].listeners.size, 0)
  resetSdk(); sdk.faults.set('http.destroy', 1); const second = new NativeHttpStream(streamPolicy()), throwing = sink(); throwing.failed = code => { throwing.errors.push(code); throw new Error('display') }; const done = second.open('{}', throwing); await second.close(); await done; assert.deepEqual(throwing.errors, ['stream-cleanup-failed'])
})
test('native stream bounded timeout stops owned callbacks and cannot redeliver late data', async () => {
  resetSdk(); const carrier = new NativeHttpStream({ ...streamPolicy(), timeoutMs: 5 }), output = sink(); await carrier.open('{}', output); const request = sdk.requests[0]; request.emit('dataReceive', new ArrayBuffer(1)); request.respond(200); assert.deepEqual(output.errors, ['stream-timeout']); assert.equal(output.chunks.length, 0); assert.equal(request.listeners.size, 0)
})
test('native stream registration and oversized chunks fail before delivery and dispose the request', async () => {
  resetSdk(); sdk.faults.set('http.on', 1); const first = new NativeHttpStream(streamPolicy()), failed = sink(); await first.open('{}', failed); assert.deepEqual(failed.errors, ['stream-register-failed']); assert.equal(sdk.requests[0].destroyed, true)
  resetSdk(); const second = new NativeHttpStream(streamPolicy()), output = sink(), done = second.open('{}', output); sdk.requests[0].emit('dataReceive', new ArrayBuffer(65)); await done; assert.deepEqual(output.errors, ['stream-too-large']); assert.equal(output.chunks.length, 0); assert.equal(sdk.requests[0].listeners.size, 0)
})
test('native owner private port suppresses double submit and foreground reload never reconnects', async () => {
  const { value, port, busy } = await owner(); assert.equal(value.controller.bootstrap.uri, NATIVE_ORIGIN)
  value.command('submit', '', 'stable-intent', 'synthetic'); value.command('submit', '', 'another-intent', 'synthetic')
  assert.equal(port.posted.filter(raw => JSON.parse(raw).method === 'submit').length, 1); assert.equal(busy.at(-1), true)
  acknowledgeClose(port); await value.close(); assert.equal(port.closed, true); assert.equal(busy.at(-1), false); await value.foreground(); assert.equal(value.controller.url, NATIVE_DOCUMENT); assert.equal(port.posted.filter(raw => JSON.parse(raw).method === 'connect.demo').length, 0)
  await value.close()
})
test('native owner denies Web-selected network and approval methods and retires departed documents', async () => {
  const { value, port, errors } = await owner(); acknowledgeClose(port)
  port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'io', generation: 1, id: 'forged-approval', method: 'approval.confirm', payload: {} })); await tick()
  const denied = port.posted.map(JSON.parse).find(row => row.id === 'forged-approval'); assert.equal(denied.ok, false); assert.equal(denied.code, 'native-method-denied')
  assert.equal(value.allow('file:///private/cache', true), false); assert.equal(value.allow('https://remote.invalid', false), false); value.navigation('https://remote.invalid'); await value.close(); assert.equal(port.closed, true); assert.ok(errors.includes('native-navigation-denied'))
})
test('private port deadlines and generation reject mismatched replies and close outstanding waits', async () => {
  const channel = new MessageChannel(), client = new NativePortClient(channel.port1, { generation: 3, maxBytes: 2048, maxPending: 1, timeoutMs: 10 })
  channel.port2.addEventListener('message', event => { const request = JSON.parse(event.data); channel.port2.postMessage(JSON.stringify({ protocol: request.protocol, kind: 'io.reply', generation: 2, id: request.id, ok: true, value: 'untrusted' })) }); channel.port2.start()
  await assert.rejects(client.request('cache.read', { maxBytes: 100 }), error => error.code === 'native-timeout')
  const pending = client.request('cache.read', { maxBytes: 100 }); await client.close(); await assert.rejects(pending, error => error.code === 'closed'); channel.port2.close()
})
test('native host shares synthetic admission and offline cache while duplicate commands execute once', async () => {
  resetSdk(); const cache = new NativeCacheFile('/app', policy.host.read.maxSnapshotBytes), bytes = new NativeFixtureBytes(policy.host.domain.maxBytes, policy.nativeHttp.maxChunkBytes), views = []
  const io = { async request(method, payload) { switch (method) { case 'fixture.bytes': return { chunks: bytes.split(payload.text, payload.chunkBytes) }; case 'cache.read': return cache.read(payload.maxBytes); case 'cache.write': await cache.write(payload.text); return true; case 'cache.clear': await cache.clear(); return true; default: throw new Error('denied') } }, async close() {} }
  const host = new NativeOfflineHost(io, policy.host, view => views.push(view))
  try {
    await host.receive(packet('connect-a', 'connect.demo', { sessionId: 'mock-session-a' }))
    const submit = packet('submit-a', 'submit', { requestId: 'intent-a', text: 'synthetic-only' }); const first = await host.receive(submit); assert.deepEqual(await host.receive(submit), first); assert.equal(host.metrics.tasks, 1)
    for (let count = 0; count < 100 && views.at(-1).task !== 'completed'; count++) await tick()
    assert.equal(views.at(-1).error, ''); assert.equal(views.at(-1).task, 'completed'); assert.ok(views.some(view => view.messages.some(row => row.id.startsWith('native-live-') && row.text.includes('🙂')))); assert.ok(views.at(-1).messages.some(row => row.hasRich)); await host.receive(packet('save', 'cache.save')); await host.receive(packet('restore', 'cache.restore')); assert.equal(views.at(-1).readOnly, true); assert.equal(views.at(-1).offline, true)
    await assert.rejects(host.receive(packet('submit-again', 'submit', { requestId: 'other', text: 'synthetic' })), error => error.code === 'read-only'); assert.equal(host.metrics.tasks, 1)
    await assert.rejects(host.receive(packet('submit-a', 'submit', { requestId: 'intent-a', text: 'changed' })), error => error.code === 'id-conflict')
  } finally { await host.close() }
})
test('native bootstrap policy rejects credential additions and missing deployment limits before binding', () => {
  const valid = { protocol: 'dsh-native-bootstrap/1', policy: policy.host }; assert.deepEqual(nativeBootstrapPolicy(JSON.stringify(valid)), policy.host)
  assert.throws(() => nativeBootstrapPolicy(JSON.stringify({ ...valid, token: 'forged' })))
  assert.throws(() => nativeBootstrapPolicy(JSON.stringify({ ...valid, policy: { ...policy.host, read: {} } })))
  assert.throws(() => nativeBootstrapPolicy(JSON.stringify({ ...valid, policy: { ...policy.host, port: { ...policy.host.port, generation: 0 } } })))
})
test('native cache absence closes follow and disables dependent task submission until explicit reconnect', async () => {
  resetSdk(); const bytes = new NativeFixtureBytes(policy.host.domain.maxBytes, policy.nativeHttp.maxChunkBytes), views = []
  const io = { async request(method, payload) { if (method === 'fixture.bytes') return { chunks: bytes.split(payload.text, payload.chunkBytes) }; if (method === 'cache.read') return null; throw new Error('unused') }, async close() {} }
  const host = new NativeOfflineHost(io, policy.host, view => views.push(view))
  try { await host.receive(packet('cache-connect', 'connect.demo', { sessionId: 'mock-session-a' })); await host.receive(packet('cache-absent', 'cache.restore')); assert.equal(views.at(-1).readOnly, true); await assert.rejects(host.receive(packet('cache-mutate', 'submit', { requestId: 'refused', text: 'synthetic' })), error => error.code === 'native-cache-unavailable'); assert.equal(host.metrics.tasks, 0) }
  finally { await host.close() }
})

test('saved native cache restores after disconnect without reopening transport and another session refuses it', async () => {
  resetSdk()
  const cache = new NativeCacheFile('/app', policy.host.read.maxSnapshotBytes), bytes = new NativeFixtureBytes(policy.host.domain.maxBytes, policy.nativeHttp.maxChunkBytes), views = []
  let fixtureCalls = 0
  const io = { async request(method, payload) {
    if (method === 'fixture.bytes') { fixtureCalls++; return { chunks: bytes.split(payload.text, payload.chunkBytes) } }
    if (method === 'cache.write') { await cache.write(payload.text); return true }
    if (method === 'cache.read') return cache.read(payload.maxBytes)
    throw new Error('unexpected IO')
  }, async close() {} }
  const host = new NativeOfflineHost(io, policy.host, view => views.push(view))
  try {
    await host.receive(packet('offline-connect', 'connect.demo', { sessionId: 'mock-session-a' }))
    await host.receive(packet('offline-save', 'cache.save'))
    await host.receive(packet('offline-disconnect', 'disconnect'))
    const callsAtDisconnect = fixtureCalls
    assert.equal(views.at(-1).readOnly, true); assert.equal(views.at(-1).connection, 'disconnected')
    const result = await host.receive(packet('offline-restore', 'cache.restore'))
    assert.equal(result.restored, true); assert.equal(views.at(-1).offline, true); assert.equal(views.at(-1).readOnly, true)
    await assert.rejects(host.receive(packet('offline-task', 'submit', { requestId: 'must-refuse', text: 'synthetic' })), error => error.code === 'unpaired')
    assert.equal(fixtureCalls, callsAtDisconnect)
    await host.receive(packet('other-connect', 'connect.demo', { sessionId: 'mock-session-b' }))
    const refused = await host.receive(packet('other-restore', 'cache.restore'))
    assert.equal(refused.restored, false); assert.equal(refused.error, 'scope-denied'); assert.equal(views.at(-1).readOnly, true)
  } finally { await host.close() }
  await assert.rejects(host.receive(packet('after-close', 'cache.restore')), error => error.code === 'closed')
})

test('native rich action revisions keep the synthetic follow connected and replay one action', async () => {
  resetSdk()
  const bytes = new NativeFixtureBytes(policy.host.domain.maxBytes, policy.nativeHttp.maxChunkBytes)
  const io = { async request(method, payload) { assert.equal(method, 'fixture.bytes'); return { chunks: bytes.split(payload.text, payload.chunkBytes) } }, async close() {} }
  const provider = new OfflineNativeProvider(io, 'mock-session-a', { maxBytes: policy.host.domain.maxBytes, maxFrames: policy.host.maxFrames, chunkBytes: policy.host.chunkBytes, ttlMs: policy.host.ttlMs, maxMounts: policy.host.maxMounts })
  const model = new SemanticPhone(provider.owner, policy.host.domain, policy.host.maxFrames)
  let command = 0, failure = null
  const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: policy.host.ttlMs, clock: Date.now, nextCommandId: () => 'native-action-' + ++command, maxMounts: policy.host.maxMounts, maxIntents: policy.host.maxIntents })
  const abort = new AbortController(), following = (async () => { try { for await (const view of core.follow(abort.signal)) void view } catch (error) { failure = error } })()
  try {
    for (let n = 0; n < 100 && model.view.connection !== 'connected'; n++) await tick()
    await core.submit('native-action-task', 'synthetic task')
    for (let n = 0; n < 100 && model.view.task !== 'completed'; n++) await tick()
    const reference = model.view.messages.flatMap(row => row.rich)[0]; assert.ok(reference)
    const mount = await core.mount(reference), values = { title: 'fixed native action', count: '3' }
    const intent = { mountId: mount.mountId, actionId: 'native-replayed-action', actionName: 'submit', targetActionId: null, expectedDataRevision: mount.snapshot.dataRevision, values, fileGrants: [], draft: { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: values, dirty: Object.keys(values) } }
    const first = await core.request('rich.invoke', intent)
    await tick(); await tick()
    assert.equal(failure, null); assert.equal(model.view.connection, 'connected'); assert.equal(model.view.readOnly, false)
    assert.deepEqual(await core.request('rich.invoke', intent), first); assert.equal(provider.host.desktop.admittedActions, 1)
    assert.equal((await core.request('rich.status', { mountId: mount.mountId, actionId: intent.actionId })).state, 'completed')
  } finally { abort.abort(); await following; await core.close() }
})

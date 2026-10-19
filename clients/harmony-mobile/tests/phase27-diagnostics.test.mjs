/** Real source frames through the same .ets byte/owner implementations and shared core; SDK/layout substitutes cannot qualify ArkUI. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { NativeHttpStream, NativeStreamPolicy, NativeRuntimeOwner, NATIVE_DOCUMENT, sdk, resetSdk, context } from '../.build/phase27-sdk.js'
import { NativeFollowFaults } from '../.build/phase27-faults.js'
import { parseWireItem, parseResume, TransportError } from '../.build/wire.js'
import { parseCommand, text, natural } from '../.build/link-protocol.js'
import { isWireCursor, isWireId, isWireText } from '../.build/wire-fields.js'
import { ByteNetworkPhone } from '../.build/network-phone.js'
import { observeNativeGeneration } from '../.build/native-acceptance-probe.js'
import { NativeAppHost } from '../.build/native-app-host.js'
import { PhoneCore } from '../.build/phone-core.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { nativeCheckpointProof } from '../scripts/native-checkpoint-proof.mjs'
import { verifyWireFields } from '../scripts/wire-fields-verify.mjs'

const tick = () => new Promise(accept => setImmediate(accept))
const actual = parseWireItem(JSON.parse(await readFile('evidence/phase27-source-reset.json', 'utf8')))
const policy = JSON.parse(await readFile('.build/native-network-project/native-policy.json', 'utf8')).host
const ownerIds = { desktopId: actual.desktopId, deviceId: actual.deviceId, sessionId: actual.sessionId }
const packet = value => JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui.reply', generation: 1, id: 'native-acceptance-report', ok: true, value })
globalThis.canIUse = () => true

test('ArkTS validation is generated verbatim from the owning schema and rejects a stale generation', async () => {
  const shared = await readFile('src/wire-fields.ts', 'utf8'), generated = await readFile('harmony/entry/src/main/ets/generated/WireFields.ets', 'utf8')
  assert.equal(generated, shared)
  await verifyWireFields('.', 'harmony'); await verifyWireFields('.', '.build/native-network-project')
  const stale = await mkdtemp('.build/phase27-stale-schema-'), directory = join(stale, 'entry/src/main/ets/generated')
  await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'WireFields.ets'), shared.replace('value >= 0', 'value > 0'))
  await assert.rejects(verifyWireFields('.', stale), /differs from the owning protocol source/)
})

async function nativeOwner() {
  resetSdk()
  const root = '.build/native-network-project/entry/src/main/resources/rawfile/'
  const manifest = JSON.parse(await readFile(root + 'native-runtime-source-manifest.json', 'utf8'))
  for (const row of manifest.resources) sdk.resources.set(row.name, await readFile(root + row.name))
  const owner = new NativeRuntimeOwner(), views = [], errors = []
  owner.initialize(context(), view => views.push(view), code => errors.push(code), () => {})
  owner.load(); owner.bind(NATIVE_DOCUMENT)
  const port = owner.controller.ports[0]
  port.deliver = raw => { const call = JSON.parse(raw); if (call.kind === 'ui') queueMicrotask(() => port.emit(JSON.stringify({ protocol: call.protocol, kind: 'ui.reply', generation: call.generation, id: call.id, ok: true, value: { connected: true, closed: true } }))) }
  port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ready', generation: 1 })); await tick()
  owner.command('connect.demo', actual.sessionId); await tick()
  return { owner, port, views, errors }
}

test('shared protocol and the same ArkTS diagnostic reader accept -1/0/increases and all legal ID lengths', async () => {
  const native = await nativeOwner(), logs = [], info = console.info, warn = console.warn
  console.info = value => logs.push(value); console.warn = value => logs.push(value)
  try {
    for (const cursor of [-1, 0, 1, 19, Number.MAX_SAFE_INTEGER]) {
      for (const length of [1, 64, 127, 128]) {
        const instance = 'i'.repeat(length), commandId = 'c'.repeat(length)
        assert.equal(parseWireItem({ ...actual, instance, relayCursor: cursor }).relayCursor, cursor)
        assert.equal(parseResume({ instance, relayCursor: cursor }).relayCursor, cursor)
        assert.equal(isWireCursor(cursor), true); assert.equal(isWireId(instance), true)
        native.port.emit(packet({ probe: 'follow-decoded', commandId, instance, relayCursor: cursor, kind: 'reset', payloadSha256: 'a'.repeat(64) })); await tick()
      }
    }
    assert.equal(native.owner.diagnosticFailures, 0); assert.deepEqual(native.errors, [])
    for (const cursor of [-2, -10, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => parseWireItem({ ...actual, relayCursor: cursor }), error => error.code === 'invalid-packet')
      native.port.emit(packet({ probe: 'follow-decoded', commandId: 'c', instance: 'i', relayCursor: cursor, kind: 'reset', payloadSha256: 'a'.repeat(64) })); await tick()
    }
    for (const value of ['', ' ', 'x'.repeat(129), 'x'.repeat(4096), 'x'.repeat(4097), 'a/b', '-a']) {
      assert.throws(() => parseWireItem({ ...actual, instance: value }))
      native.port.emit(packet({ probe: 'follow-decoded', commandId: value, instance: 'i', relayCursor: -1, kind: 'reset', payloadSha256: 'a'.repeat(64) })); await tick()
    }
    assert.equal(text('x'.repeat(4096)).length, 4096); assert.equal(isWireText('x'.repeat(4096)), true)
    assert.throws(() => text('x'.repeat(4097)), error => error.code === 'invalid-packet')
    for (const cursor of [NaN, Infinity, -Infinity]) { assert.equal(isWireCursor(cursor), false); assert.throws(() => natural(cursor)) }
    const before = native.owner.diagnosticFailures
    for (const changes of [{ domainCursor: -2 }, { liveTextSha256: 'invalid' }, { connection: 'connecting' }, { liveTextBytes: -1 }, { readOnly: 'false' }]) {
      native.port.emit(packet({ probe: 'follow-admitted', commandId: 'c', instance: 'i', relayCursor: -1, domainCursor: 35, connection: 'connected', readOnly: false, liveTextBytes: 0, liveTextSha256: 'a'.repeat(64), ...changes })); await tick()
    }
    assert.equal(native.owner.diagnosticFailures, before + 5)
    assert.deepEqual(native.errors, []); assert.equal(logs.filter(line => line.startsWith('DSH native follow diagnostic: ')).length, 20)
  } finally { await native.owner.close(); console.info = info; console.warn = warn }
})

async function chain({ checkpoint = false, cursor = -1, loggerThrows = false, sinkThrows = false, events = false } = {}) {
  const native = await nativeOwner(), logs = [], streams = [], reports = [], info = console.info, warn = console.warn
  console.info = value => { if (loggerThrows) throw Error('diagnostic logger'); logs.push(value) }; console.warn = value => logs.push(value)
  const faults = new NativeFollowFaults(1)
  let source, observed
  const bytePort = { async open(url, body) {
    assert.equal(url.pathname, '/mobile/follow')
    const envelope = JSON.parse(body), command = parseCommand(JSON.stringify(envelope.command), { clock: Date.now, maxPacketBytes: 65536, maxCommandTtlMs: 60000 })
    let frame = { ...actual, relayCursor: cursor }, wire
    if (checkpoint) {
      faults.arm('reset-snapshot'); faults.take(); wire = faults.bytes('reset-snapshot', command.commandId, frame).text; faults.recordWrite('reset-snapshot')
      source = { faults: faults.report, commandAudit: { records: [{ stage: 'fault-written', fault: 'reset-snapshot', commandId: command.commandId }] } }
    } else {
      const items = [frame]
      if (events) {
        const lines = faults.bytes('cursor-conflict', command.commandId, frame).text.trim().split('\n').map(JSON.parse), zero = lines[1].value
        items.push(zero, { ...zero, relayCursor: zero.relayCursor + 1, payload: { ...zero.payload, event: { ...zero.payload.event, seq: zero.payload.event.seq + 1 } } })
      }
      wire = items.map(value => JSON.stringify({ type: 'item', streamId: command.commandId, value }) + '\n').join('') + JSON.stringify({ type: 'end', streamId: command.commandId }) + '\n'
    }
    const chunks = [], errors = [], stream = new NativeHttpStream(new NativeStreamPolicy(true, url.href, 65536, 1048576, 1000)); streams.push(stream)
    const work = stream.open(body, { chunk(bytes) { chunks.push(bytes) }, end() {}, failed(code) { errors.push(code) } })
    const request = sdk.requests.at(-1), bytes = new TextEncoder().encode(wire)
    request.emit('headersReceive', { 'content-type': 'application/x-ndjson', 'x-dsh-mobile-stream': 'dsh-mobile-wire/1;status=200' })
    for (let offset = 0; offset < bytes.length; offset += 8191) request.emit('dataReceive', bytes.slice(offset, offset + 8191).buffer)
    request.emit('dataEnd'); request.respond(200); await work
    assert.deepEqual(errors, []); assert.equal(request.destroyed, true)
    return { status: 200, contentType: 'application/x-ndjson', body: (async function* () { yield* chunks })(), close: () => stream.close() }
  } }
  const network = new ByteNetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl: 'http://127.0.0.1:18081/', maxFrameBytes: 1048576, maxReadChunkBytes: 65536, requestTimeoutMs: 2000, maxInFlight: 4 }, bytePort)
  const host = new NativeAppHost({ async request() { throw Error('Unexpected native IO') }, async close() {} }, { ...policy, follow: { mode: 'once' } }, view => native.port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'view', generation: 1, view })), undefined, [actual.sessionId], () => {
    observed = observeNativeGeneration(network, value => { reports.push(value); if (sinkThrows) throw Error('diagnostic sink'); native.port.emit(packet(value)) })
    return { ...observed, owner: ownerIds, mode: 'fixed-replay', metrics: () => ({ tasks: 0, actions: 0, mounts: 0 }) }
  })
  try {
    await host.receive(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui', generation: 1, id: 'connect-chain', method: 'connect.demo', payload: { sessionId: actual.sessionId } })); await tick()
    assert.equal(native.errors.includes('native-port-failed'), false)
    const view = native.views.at(-1)
    assert.equal(view.task, 'cancelled'); assert.equal(view.readOnly, false)
    assert.equal(view.messages.filter(row => row.id !== 'native-live-' + actual.sessionId).length, 6)
    return { view: structuredClone(view), logs: [...logs], reports, source, nativeFailures: native.owner.diagnosticFailures, observerFailures: observed.diagnosticFailures, byteFailures: streams.reduce((sum, value) => sum + value.diagnosticFailures, 0), close: async () => { await host.close(); await native.owner.close() } }
  } catch (error) { await host.close(); await native.owner.close(); throw error }
  finally { console.info = info; console.warn = warn }
}

test('real initial reset -1, event 0 and event 1 cross the byte decoder, observer, shared core and same .ets publication', async () => {
  const result = await chain({ events: true })
  try {
    assert.deepEqual(result.reports.filter(value => value.probe === 'follow-decoded').map(value => value.relayCursor), [-1, 0, 1])
    assert.deepEqual(result.reports.filter(value => value.probe === 'follow-admitted').map(value => value.relayCursor), [-1, 0, 1])
    assert.equal(result.nativeFailures + result.observerFailures + result.byteFailures, 0)
  } finally { await result.close() }
})

test('an illegal actual wire cursor remains a product failure even when diagnostic reporting fails', async () => {
  await assert.rejects(chain({ cursor: -2, sinkThrows: true }), error => error.code === 'transport-lost' && error.cause?.code === 'invalid-packet')
})

test('unchanged real checkpoint fixture crosses the complete proof; layout observation remains an explicit substitute', async () => {
  const result = await chain({ checkpoint: true }), marker = result.source.faults.checkpoint, session = actual.sessionId
  try {
    const nodes = [{ attributes: { type: 'List', visible: 'true', bounds: '[0,0][400,500]' } }, { attributes: { type: 'Text', id: 'dsh-message-native-live-' + session, visible: 'true', text: marker, bounds: '[0,100][400,200]' } }, { attributes: { type: 'Text', id: 'dsh-task-state', visible: 'true', text: 'cancelled' } }]
    const proof = nativeCheckpointProof(marker, result.source, result.logs.join('\n'), nodes, { task: 'cancelled', taskText: 'cancelled' })
    assert.equal(proof.passed, true); assert.equal(proof.diagnostics.decoded.relayCursor, -1); assert.equal(proof.diagnostics.admitted.domainCursor, 35)
    const closeLogs = [], info = console.info
    console.info = value => closeLogs.push(value)
    try { await result.close() } finally { console.info = info }
    const closedProof = nativeCheckpointProof(marker, result.source, [...result.logs, ...closeLogs].join('\n'), nodes, { task: 'cancelled', taskText: 'cancelled' })
    assert.equal(closedProof.passed, false); assert.equal(closedProof.missing, 'published')
    assert(closeLogs.some(value => value.includes('"connection":"disconnected","readOnly":true')))
    await writeFile('evidence/phase27-complete-chain.json', JSON.stringify({ passed: true, nativeExecuted: false, sdkSubstitutes: true, layoutSubstitute: true, initialSourceSha256: createHash('sha256').update(await readFile('evidence/phase27-source-reset.json')).digest('hex'), proof, closedProof, actualPublishedView: result.view, promptCalls: 0, replayCalls: 0, realModels: 0, logs: result.logs, closeLogs }, null, 2) + '\n')
  } finally { await result.close() }
})

test('diagnostic logger and report failures preserve the same initial source publication and disposal', async () => {
  const clean = await chain(); await clean.close()
  for (const flags of [{ loggerThrows: true }, { sinkThrows: true }]) {
    const result = await chain(flags)
    try {
      assert.deepEqual(result.view, clean.view)
      if (flags.loggerThrows) assert(result.byteFailures > 0 && result.nativeFailures > 0)
      if (flags.sinkThrows) assert(result.observerFailures > 0)
    } finally { await result.close() }
  }
})

test('command observations cannot swallow provider or clock failures and count only their own failures', async () => {
  const model = new SemanticPhone(ownerIds, policy.domain, policy.maxFrames), providerFailure = new TransportError('scope-denied')
  model.accept(actual)
  const provider = { async request() { throw providerFailure }, async *follow() { throw providerFailure }, async close() {} }
  const config = { grantEpoch: 1, ttlMs: 53000, clock: Date.now, nextCommandId: () => 'command', maxMounts: 8, maxIntents: 8, follow: { mode: 'once' }, observeCommand() { throw Error('diagnostic') } }
  const core = new PhoneCore(provider, model, config)
  await assert.rejects(core.request('read.projects', {}), error => error === providerFailure); assert.equal(core.diagnosticFailures, 1)
  const clockFailure = Error('command-clock-failed'), badClock = new PhoneCore(provider, model, { ...config, clock() { throw clockFailure } })
  await assert.rejects(badClock.request('read.projects', {}), error => error === clockFailure); assert.equal(badClock.diagnosticFailures, 0)
  const observed = observeNativeGeneration(provider, () => { throw Error('sink') })
  await assert.rejects(observed.provider.follow({}, {}, new AbortController().signal)[Symbol.asyncIterator]().next(), error => error === providerFailure)
})

test('actual owner/generation and malformed product view validation still retire the same .ets port', async () => {
  for (const bad of [{ protocol: 'wrong', kind: 'ready', generation: 1 }, { protocol: 'dsh-native-host/1', kind: 'ready', generation: 2 }, { protocol: 'dsh-native-host/1', kind: 'view', generation: 1, view: { sessionId: 'foreign' } }]) {
    const native = await nativeOwner()
    try { native.port.emit(JSON.stringify(bad)); await tick(); await tick(); assert(native.errors.includes('native-port-failed')) }
    finally { await native.owner.close() }
  }
})

test('same .ets byte disposal settles with broken logging and retains the actual transport or cleanup error', async () => {
  const info = console.info, warn = console.warn
  console.info = () => { throw Error('logger') }; console.warn = () => { throw Error('warning logger') }
  try {
    for (const cleanup of [false, true]) {
      resetSdk()
      const stream = new NativeHttpStream(new NativeStreamPolicy(true, 'http://127.0.0.1:18081/mobile/follow', 65536, 1048576, 1000)), failures = []
      const work = stream.open(JSON.stringify({ command: { commandId: 'c'.repeat(128), expiresAt: Date.now() + 53000 } }), { chunk() {}, end() { throw Error('unexpected end') }, failed(code) { failures.push(code) } })
      const request = sdk.requests[0]
      if (cleanup) sdk.faults.set('http.off', 1)
      request.reject({ code: 2300018 }); await work; await stream.close()
      assert.deepEqual(failures, [cleanup ? 'stream-cleanup-failed' : 'transport-lost']); assert.equal(request.destroyed, true); assert(stream.diagnosticFailures > 0)
    }
  } finally { console.info = info; console.warn = warn }
})

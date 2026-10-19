/** Actual broker/controller messages with a fake clock and the real ETS signer against fixed-key SDK substitutes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { RelayControlClient, ConnectionSupervisor, RoomBroker, RelayRooms, resolveBrokerPolicy, FixtureClock, fixtureSource, rawBroker, pairId, phoneKey, desktopKey, audience, nodeE2EPrimitives, p256CredentialId, Port, Codec, NativeRelaySocket, NativeRelayPolicy, NativeCryptoPrimitives, NativeDeviceKeys, NativeDeviceKeyPolicy, NativeExistingIdentitySigner, network, resetProductSdk, state, huks } = await import(process.env.HARMONY_PHASE76_CONTROL_PACKAGE ?? '../.build/phase76-control.js')
const drain = async () => { for (let n = 0; n < 20; n++) await new Promise(resolve => setImmediate(resolve)) }
function broker() { const clock = new FixtureClock(), authority = {}, policy = resolveBrokerPolicy({ ...rawBroker, pairs: rawBroker.pairs.map(pair => ({ ...pair, expiresAt: 1801000 })), challengeTtlMs: 10000, roomTtlMs: 30000, issueWindowMs: 60000, maxRoomIssuesPerWindow: 16 }), rooms = new RelayRooms(authority, { maxRooms: 2, maxRoomTtlMs: 30000, pairTimeoutMs: 30000, maxFrameBytes: 16384, maxBufferedBytes: 32768, maxFrames: 4096, idleTimeoutMs: 60000 }, () => clock.now), broker = new RoomBroker(authority, rooms, policy, audience, () => clock.now, fixtureSource()); return { clock, broker, close() { broker.close(); rooms.close() } } }
function trust(_f, role) { return { pairId, epoch: 1, role, audience, credentialId: p256CredentialId((role === 'phone' ? phoneKey : desktopKey).publicSpki), expiresAt: 1801000 } }
class MemoryPort {
  frames = new Set(); ends = new Set(); closed = false; bufferedAmount = 0; sent = []; remote;
  onFrame(callback) { this.frames.add(callback); return () => this.frames.delete(callback) }
  onEnd(callback) { this.ends.add(callback); return () => this.ends.delete(callback) }
  send(bytes) { if (this.closed) throw Error('fixture closed'); const copy = Uint8Array.from(bytes); this.sent.push(copy); queueMicrotask(() => { if (!this.closed && !this.remote.closed) for (const callback of this.remote.frames) callback(copy, false) }) }
  ready() {}
  terminate() { if (this.closed) return; this.closed = true; for (const callback of [...this.ends]) callback(); this.remote.terminate() }
}
function ports() { const client = new MemoryPort(), server = new MemoryPort(); client.remote = server; server.remote = client; return { client, server } }
function control(f, role, socket, signer = role === 'phone' ? phoneKey : desktopKey, diagnostic) { const leases = [], client = new RelayControlClient(socket, trust(f, role), signer, nodeE2EPrimitives, () => f.clock.now, 64, 32768, 15000, 60000, f.clock, lease => leases.push(lease), new AbortController().signal, diagnostic); return { client, leases } }
async function desktop(f) {
  let dials = 0; const generations = [], states = [], supervisor = new ConnectionSupervisor({ maxAttempts: 8, retryDelayMs: 500 }, 1801000, () => f.clock.now, f.clock, async ended => { dials++; const socket = ports(), endpoint = control(f, 'desktop', socket.client); socket.client.onEnd(ended); f.broker.attach(pairId, 'desktop', socket.server); generations.push(endpoint); return { close: async () => { endpoint.client.close(); await endpoint.client.settled() } } }, value => states.push(value), new AbortController().signal)
  await supervisor.start(); await drain(); return { supervisor, generations, states, dials: () => dials }
}
test('desktop budget exhausts while phone pairing takes155seconds, despite valid phone proof later', async () => {
  const f = broker(), host = await desktop(f); let phone
  try {
    for (let n = 0; n < 8; n++) { f.clock.advance(10000); f.broker.sweep(); await drain(); if (n < 7) { f.clock.advance(500); await drain() } }
    assert.equal(host.dials(), 8); assert.equal(host.states.at(-1), 'blocked'); assert.equal(f.clock.now, 84500)
    f.clock.advance(71643); f.broker.sweep(); const socket = ports(); let signs = 0
    phone = control(f, 'phone', socket.client, { ...phoneKey, sign: async bytes => { signs++; return phoneKey.sign(bytes) } }); f.broker.attach(pairId, 'phone', socket.server); await drain()
    assert.equal(signs, 1); assert.equal(socket.client.sent.length, 1); assert.equal(socket.client.closed, false); assert.equal(phone.leases.length, 0)
    f.clock.advance(10000); f.broker.sweep(); await drain(); assert.equal(socket.client.closed, true); assert.equal(phone.leases.length, 0)
  } finally { phone?.client.close(); await host.supervisor.close(); f.close() }
})
test('phone pairing ready before desktop activation permits the first generation with unchanged limits', async () => {
  const f = broker(); f.clock.advance(155143); let host, phone
  try { host = await desktop(f); const socket = ports(); phone = control(f, 'phone', socket.client); f.broker.attach(pairId, 'phone', socket.server); await drain(); assert.equal(host.dials(), 1); assert.equal(phone.leases.length, 1); assert.equal(host.generations[0].leases.length, 1); assert.equal(phone.leases[0].receipt.room, host.generations[0].leases[0].receipt.room) }
  finally { phone?.client.close(); await host?.supervisor.close(); f.close() }
})
async function nativePhone(f, diagnostic, fault) {
  resetProductSdk(); if (fault === 'huks-init') state.failure = 'init'; const authority = {}, callbacks = new Map(), alias = 'phase76-synthetic-phone'; state.aliases.add(alias)
  const crypto = new NativeCryptoPrimitives(16384), signer = new NativeExistingIdentitySigner(authority, new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, 16384)), crypto), codec = new Codec(crypto), publicSpki = codec.encode(await signer.initializeNative(authority)), server = new MemoryPort()
  server.remote = { closed: false, terminate() {} }; server.send = bytes => { server.sent.push(Uint8Array.from(bytes)); callbacks.get('message')(undefined, new TextDecoder().decode(bytes)) }
  server.terminate = () => { if (server.closed) return; server.closed = true; for (const fn of [...server.ends]) fn() }
  const sent = []
  network.factory = () => ({ on: (name, callback) => callbacks.set(name, callback), connect: async () => { callbacks.get('open')(); f.broker.attach(pairId, 'phone', server); return true }, send: async text => { assert.equal(typeof text, 'string'); if (fault === 'send') return false; sent.push(text); for (const fn of [...server.frames]) fn(new TextEncoder().encode(text), false); return true }, close: async () => { server.terminate(); return true } })
  const port = new Port(authority, new NativeRelayPolicy(authority, audience, 26, 10000, 16384, 32768), 32768, true), leases = [], client = new RelayControlClient(port, trust(f, 'phone'), { publicSpki, sign: bytes => signer.signNative(authority, bytes) }, codec, () => f.clock.now, 64, 32768, 15000, 60000, f.clock, lease => leases.push(lease), new AbortController().signal, diagnostic)
  await port.openPair(pairId); await drain(); return { client, port, signer, authority, sent, leases, server, receive: data => callbacks.get('message')(undefined, data) }
}
test('real broker text before connect resolves traverses ETS HUKS init/update/finish and Node verification', async () => {
  const f = broker(), host = await desktop(f), stages = []; let phone
  try { phone = await nativePhone(f, stage => stages.push(stage)); await drain(); assert.equal(phone.sent.length, 1); assert.equal(host.generations[0].leases.length, 1); assert.equal(phone.leases.length, 1); assert.deepEqual(stages, ['frame-received', 'frame-decoded', 'challenge-validated', 'identity-validated', 'sign-started', 'sign-completed', 'proof-queued', 'frame-received', 'frame-decoded', 'room-validated']); assert.deepEqual(state.huksOptions.map(value => [value.operation, value.purpose]), [['init', 4], ['update', 4], ['finish', 4]]); assert.equal(state.calls.includes('create'), false); assert.equal(state.calls.includes('remove'), false); const fixture = JSON.parse(await readFile(new URL('./fixtures/phase76-control-challenge.json', import.meta.url))); assert.deepEqual(JSON.parse(new TextDecoder().decode(phone.server.sent[0])), fixture) }
  finally { phone?.client.close(); await phone?.port.close(); phone?.signer.closeNative(phone.authority); await host.supervisor.close(); f.close() }
})
for (const failure of ['huks-init', 'send']) test('native ' + failure + ' failure remains distinguishable from an authenticated room', async () => {
  const f = broker(), host = await desktop(f), stages = [], lines = [], info = console.info, error = console.error; let phone
  console.info = line => lines.push(line); console.error = line => lines.push(line)
  try { phone = await nativePhone(f, stage => stages.push(stage), failure); assert.equal(phone.sent.length, 0); assert.equal(phone.leases.length, 0); assert.equal(stages.includes('room-validated'), false); if (failure === 'huks-init') { assert.ok(stages.includes('failure-sign:refused')); assert.equal(stages.includes('proof-queued'), false); assert.ok(lines.some(line => line.includes('DSH_HUKS_SIGN_REFUSED stage=init'))) } else { assert.ok(stages.includes('proof-queued')); assert.ok(lines.some(line => line.includes('DSH_CONTROL_IO=phone-send-failed'))) }; assert.equal(lines.join().includes('FAKE_NATIVE_FAILURE'), false) }
  finally { phone?.client.close(); if (phone) { if (failure === 'send') await assert.rejects(phone.port.close()); else await phone.port.close(); phone.signer.closeNative(phone.authority) }; await host.supervisor.close(); f.close(); console.info = info; console.error = error }
})
for (const variant of ['binary', 'json', 'unknown-field', 'audience']) test(variant + ' is refused before invoking an identity signer', async () => {
  const f = broker(), socket = ports(), stages = []; let signs = 0
  const endpoint = control(f, 'phone', socket.client, { ...phoneKey, sign: async bytes => { signs++; return phoneKey.sign(bytes) } }, stage => stages.push(stage))
  try { const fixture = JSON.parse(await readFile(new URL('./fixtures/phase76-control-challenge.json', import.meta.url))); if (variant === 'unknown-field') fixture.secret = 'DO_NOT_LOG_PRIVATE_BODY'; if (variant === 'audience') fixture.audience = 'foreign.invalid'; const bytes = new TextEncoder().encode(variant === 'json' ? '{' : JSON.stringify(fixture)); for (const fn of [...socket.client.frames]) fn(bytes, variant === 'binary'); await endpoint.client.settled(); assert.equal(signs, 0); assert.equal(socket.client.closed, true); assert.equal(stages.some(stage => stage.includes('DO_NOT_LOG')), false); assert.ok(stages.some(stage => stage.startsWith('failure-'))) }
  finally { endpoint.client.close(); f.close() }
})
test('a signature completing after challenge expiry is never queued', async () => {
  const f = broker(), socket = ports(), stages = []; let release, signs = 0
  const wait = new Promise(resolve => { release = resolve }), endpoint = control(f, 'phone', socket.client, { ...phoneKey, sign: async bytes => { signs++; await wait; return phoneKey.sign(bytes) } }, stage => stages.push(stage))
  try { f.broker.attach(pairId, 'phone', socket.server); await drain(); assert.equal(signs, 1); f.clock.advance(10000); release(); await endpoint.client.settled(); assert.ok(stages.includes('challenge-deadline')); assert.equal(stages.includes('proof-queued'), false); assert.equal(socket.client.sent.length, 0) }
  finally { release(); endpoint.client.close(); f.close() }
})
test('observer errors emit only a fixed fallback and do not replace protocol decisions', async () => {
  const f = broker(), socket = ports(), warnings = [], warn = console.warn, endpoint = control(f, 'phone', socket.client, phoneKey, () => { throw Error('DO_NOT_LOG_PRIVATE_BODY') })
  console.warn = line => warnings.push(line)
  try { f.broker.attach(pairId, 'phone', socket.server); await drain(); assert.equal(socket.client.sent.length, 1); assert.ok(warnings.length > 0); assert.ok(warnings.every(line => line === 'DSH_CONTROL_DIAGNOSTIC_FAILURE')) }
  finally { endpoint.client.close(); f.close(); console.warn = warn }
})
test('message errors with no data close without dereferencing absent bytes', async () => {
  resetProductSdk(); const callbacks = new Map(), authority = {}; let closed = 0, frames = 0
  network.factory = () => ({ on: (name, callback) => callbacks.set(name, callback), connect: async () => true, send: async () => true, close: async () => { closed++; return true } })
  const socket = new NativeRelaySocket(new NativeRelayPolicy(authority, audience, 26, 10000, 16384, 32768))
  try { await socket.connectControlNative(authority, 'phase76-synthetic-pair', 'phone', () => frames++, () => {}); assert.doesNotThrow(() => callbacks.get('message')({ code: 401, message: 'DO_NOT_LOG_PRIVATE_BODY' }, undefined)); await drain(); assert.equal(frames, 0); assert.equal(closed, 1) }
  finally { await socket.closeNative(authority) }
})

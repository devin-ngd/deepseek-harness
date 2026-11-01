/** Real control proofs and broker decisions under an instance-owned clock; no sockets or device IO. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { RelayControlClient } from '../src/relay-control-client.ts'
import { RoomBroker } from '../standalone-relay/src/room-broker.ts'
import { resolveBrokerPolicy } from '../standalone-relay/src/broker-policy.ts'
import { RelayRooms } from '../integration/relay-core.ts'
import { FixtureClock, ports, fixtureSource, rawBroker, pairId, phoneKey, desktopKey, audience } from '../integration/phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from '../integration/p256-channel.ts'
import { prepareConnectionStart } from '../operations/prepared-connection-start.mjs'
import { uiFixture } from '../tests/helpers/connection-ui-fixture.mjs'

function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture(t) {
  const clock = new FixtureClock(), authority = {}, expiresAt = 1801000
  const rooms = new RelayRooms(authority, { maxRooms: 2, maxRoomTtlMs: 30000, pairTimeoutMs: 30000, maxFrameBytes: 16384, maxBufferedBytes: 32768, maxFrames: 4096, idleTimeoutMs: 60000 }, () => clock.now)
  const policy = resolveBrokerPolicy({ ...rawBroker, pairs: rawBroker.pairs.map(pair => ({ ...pair, expiresAt })), challengeTtlMs: 10000, roomTtlMs: 30000 })
  const broker = new RoomBroker(authority, rooms, policy, audience, () => clock.now, fixtureSource()), endpoints = []
  t.after(async () => {
    for (const endpoint of endpoints) endpoint.client.close()
    broker.close(); rooms.close()
    await Promise.all(endpoints.map(endpoint => endpoint.client.settled()))
    assert.equal(clock.pending.size, 0, 'owned expiry callbacks released')
    for (const endpoint of endpoints) {
      for (const port of [endpoint.socket.client, endpoint.socket.server]) {
        assert.equal(port.frames.size, 0)
        assert.equal(port.ends.size, 0)
      }
    }
  })
  return { clock, expiresAt, broker, endpoints }
}
function attach(f, role, sign = (role === 'phone' ? phoneKey : desktopKey).sign) {
  const socket = ports(), key = role === 'phone' ? phoneKey : desktopKey, proof = deferred(), room = deferred(), stages = [], leases = []
  let signs = 0
  const client = new RelayControlClient(socket.client, { pairId, epoch: 1, role, audience, credentialId: p256CredentialId(key.publicSpki), expiresAt: f.expiresAt }, { publicSpki: key.publicSpki, sign: bytes => { signs++; return sign(bytes) } }, nodeE2EPrimitives, () => f.clock.now, 64, 32768, 15000, 60000, f.clock, lease => { leases.push(lease); room.resolve(lease) }, new AbortController().signal, stage => { stages.push(stage); if (stage === 'proof-queued') proof.resolve() })
  const endpoint = { client, socket, stages, leases, proof: proof.promise, room: room.promise, signs: () => signs }
  f.endpoints.push(endpoint); f.broker.attach(pairId, role, socket.server)
  return endpoint
}

async function stagger(t, first, gap) {
    const f = fixture(t), early = attach(f, first)
    await early.proof; await early.client.settled()
    assert.equal(early.signs(), 1); assert.equal(early.leases.length, 0)
    f.clock.advance(gap); f.broker.sweep()
    const late = attach(f, first === 'desktop' ? 'phone' : 'desktop')
    await late.proof; await late.client.settled()
    if (gap < 10000) {
      const [a, b] = await Promise.all([early.room, late.room])
      assert.equal(a.receipt.room, b.receipt.room)
      assert.equal(a.receipt.round, b.receipt.round)
      assert.ok(early.stages.includes('room-validated')); assert.ok(late.stages.includes('room-validated'))
      assert.equal(early.stages.includes('challenge-deadline'), false)
    } else {
      assert.ok(early.stages.includes('challenge-deadline')); assert.equal(early.socket.client.closed, true)
      assert.equal(early.leases.length, 0); assert.equal(late.leases.length, 0)
      assert.ok(late.stages.includes('sign-completed')); assert.ok(late.stages.includes('proof-queued'))
      assert.equal(late.stages.includes('room-validated'), false)
      f.clock.advance(10000); f.broker.sweep(); await late.client.settled()
      assert.ok(late.stages.includes('challenge-deadline')); assert.equal(late.socket.client.closed, true)
    }
    assert.equal(early.signs(), 1); assert.equal(late.signs(), 1, 'no automatic retry')
    assert.equal(f.endpoints.length, 2)
}

test('desktop first: 0ms admits both proofs', t => stagger(t, 'desktop', 0))
test('phone first: 0ms admits both proofs', t => stagger(t, 'phone', 0))
test('desktop first: 9999ms admits both proofs', t => stagger(t, 'desktop', 9999))
test('phone first: 9999ms admits both proofs', t => stagger(t, 'phone', 9999))
test('desktop first: 10000ms cannot reuse the expired proof', t => stagger(t, 'desktop', 10000))
test('phone first: 10000ms cannot reuse the expired proof', t => stagger(t, 'phone', 10000))
test('desktop first: 21797ms cannot reuse the expired proof', t => stagger(t, 'desktop', 21797))
test('phone first: 21797ms cannot reuse the expired proof', t => stagger(t, 'phone', 21797))

test('a signing result released at the challenge deadline is never sent', { timeout: 5000 }, async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = fixture(t)
  const phone = attach(f, 'phone', async bytes => { entered.resolve(); await release.promise; return phoneKey.sign(bytes) })
  await entered.promise; f.clock.advance(10000); release.resolve(); await phone.client.settled()
  assert.equal(phone.socket.client.sent.length, 0); assert.equal(phone.leases.length, 0)
  assert.ok(phone.stages.includes('challenge-deadline')); assert.equal(phone.stages.includes('proof-queued'), false)
})

test('a room receipt delivered after local challenge expiry cannot revive the endpoint', { timeout: 5000 }, async t => {
  const f = fixture(t), early = attach(f, 'desktop')
  await early.proof; await early.client.settled()
  const deliver = early.socket.server.send.bind(early.socket.server), held = deferred()
  let delayed
  early.socket.server.send = bytes => { if (JSON.parse(new TextDecoder().decode(bytes)).kind === 'room') { delayed = Uint8Array.from(bytes); held.resolve() } else deliver(bytes) }
  const rechallenged = deferred()
  let signs = 0
  const late = attach(f, 'phone', bytes => { if (++signs === 2) rechallenged.resolve(); return phoneKey.sign(bytes) })
  await held.promise; await late.room
  const queuedListeners = [...early.socket.client.frames]
  f.clock.advance(10000); f.broker.sweep()
  for (const listener of queuedListeners) listener(delayed, false)
  await rechallenged.promise; await Promise.all([early.client.settled(), late.client.settled()])
  assert.equal(early.leases.length, 0); assert.equal(early.stages.includes('room-validated'), false)
  assert.equal(late.leases.length, 1); assert.equal(late.leases[0].signal.aborted, true, 'fresh challenge retires the previous room')
})

test('prepared final actions issue both real control proofs before desktop UI acknowledgment', { timeout: 5000 }, async t => {
  const acknowledgment = deferred()
  t.after(() => acknowledgment.resolve())
  const f = fixture(t), issued = []
  let desktop, phone
  const commit = prepareConnectionStart({
    desktop: { ready: () => true, submit: () => { issued.push('desktop'); desktop = attach(f, 'desktop'); return acknowledgment.promise } },
    phone: { ready: () => true, submit: async () => { issued.push('phone'); phone = attach(f, 'phone') } },
    clock: () => f.clock.now, deadline: 100000, maxDispatchSkewMs: 1000, challengeTtlMs: 10000, signal: new AbortController().signal,
  })
  let acknowledged = false
  const pending = commit().then(result => { acknowledged = true; return result })
  assert.deepEqual(issued, ['desktop', 'phone'])
  const [a, b] = await Promise.all([desktop.room, phone.room])
  assert.equal(a.receipt.room, b.receipt.room); assert.equal(acknowledged, false)
  acknowledgment.resolve()
  assert.deepEqual(await pending, { desktop: 'acknowledged', phone: 'acknowledged', reason: null, dispatchSkewMs: 0 })
  assert.equal(desktop.signs(), 1); assert.equal(phone.signs(), 1)
})

test('UI adapters drive real control rooms and lifetime cancellation closes both endpoints', { timeout: 5000 }, async t => {
  const f = fixture(t), ui = uiFixture(t), gate = ui.holdDesktop()
  let desktop, phone
  const desktopClick = ui.sky.click.bind(ui.sky), phoneRun = ui.hdc.run.bind(ui.hdc)
  ui.sky.click = input => {
    if (input.element_index === 10) desktop = attach(f, 'desktop')
    if (input.element_index === 20) desktop?.client.close()
    return desktopClick(input)
  }
  ui.hdc.run = (args, signal) => {
    if (args.at(-3) === 'click' && args.at(-2) === '20') phone = attach(f, 'phone')
    if (args.at(-3) === 'click' && args.at(-2) === '50') phone?.client.close()
    return phoneRun(args, signal)
  }
  await ui.prepare()
  const started = ui.owner.start(), [a, b] = await Promise.all([desktop.room, phone.room])
  assert.equal(a.receipt.room, b.receipt.room); assert.equal(ui.connects(), 2)
  gate.resolve(); assert.equal((await started).reason, null)
  ui.lifetime.abort(); assert.deepEqual(await ui.owner.settled(), { desktop: 'stopped', phone: 'stopped' })
  assert.equal(desktop.socket.client.closed, true); assert.equal(phone.socket.client.closed, true)
  assert.equal(a.signal.aborted, true); assert.equal(b.signal.aborted, true)
})

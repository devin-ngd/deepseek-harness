/** Memory SDK substitute and public synthetic fingerprints only. No real socket/TLS/key/device operations are performed. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NativePairingConsent, PairingView, NativeRelaySocket, NativeRelayPolicy, fakeNetwork } from '../.build/phase36-native.js'
test('native confirmation requires exact offer, comparison, scope/identity and unexpired single use', () => {
  let now = 1000; const authority = {}, owner = new NativePairingConsent(authority, () => now), offer = () => new PairingView('p256-sha256-' + '1'.repeat(64), 'p256-sha256-' + '2'.repeat(64), 'fake-host', 'fake-profile', 'fake-device', 'fake-session', 'session.sync', 1100, 50), first = offer()
  owner.offer(authority, first); assert.throws(() => owner.accept(authority, first)); assert.throws(() => owner.compare(authority, offer(), true)); assert.throws(() => owner.compare({}, first, true)); owner.compare(authority, first, true)
  owner.offer(authority, offer()); assert.throws(() => owner.accept(authority, first)); const next = offer(); owner.offer(authority, next); owner.compare(authority, next, true); assert.equal(owner.accept(authority, next), next); assert.throws(() => owner.accept(authority, next))
  owner.offer(authority, next); owner.compare(authority, next, true); now = 1100; assert.throws(() => owner.accept(authority, next))
})
test('native WSS gate rejects unconfirmed API and wrong local owner before SDK access', async () => {
  const authority = {}, before = fakeNetwork.connects, socket = new NativeRelaySocket(new NativeRelayPolicy(authority, 'dsh.devinho.me', 0, 100, 128, 256))
  await assert.rejects(socket.connectNative(authority, 'phase36-fake-room', 'phone', '1'.repeat(64), () => {}, () => {})); assert.equal(fakeNetwork.connects, before)
})
test('native close is shared and a late successful connect is closed again instead of retained', async () => {
  const authority = {}; let connected, enter
  const ready = new Promise(resolve => { enter = resolve }), acquisition = new Promise(resolve => { connected = resolve })
  const oldFactory = fakeNetwork.factory; fakeNetwork.factory = () => { const socket = oldFactory(); socket.connect = async () => { enter(); return acquisition }; return socket }
  const owner = new NativeRelaySocket(new NativeRelayPolicy(authority, 'dsh.devinho.me', 26, 10000, 128, 256)), pending = owner.connectNative(authority, 'phase36-fake-room', 'phone', '1'.repeat(64), () => {}, () => {})
  await ready; const closed = owner.closeNative(authority); assert.equal(owner.closeNative(authority), closed); await closed; connected(true); await assert.rejects(pending); assert.equal(fakeNetwork.socket.closeCalls, 2); fakeNetwork.factory = oldFactory
})
test('native cleanup failure reaches owner as content-free unknown status and preserves shared failure', async () => {
  const authority = {}, oldFactory = fakeNetwork.factory, notice = []
  fakeNetwork.factory = () => { const socket = oldFactory(); socket.close = async () => { throw new Error('fake private detail') }; return socket }
  const owner = new NativeRelaySocket(new NativeRelayPolicy(authority, 'dsh.devinho.me', 26, 10000, 128, 256)); await owner.connectNative(authority, 'phase36-fake-room', 'phone', '1'.repeat(64), () => {}, failed => { notice.push(failed) }); owner.authenticatedNative(authority)
  const closing = owner.closeNative(authority); await assert.rejects(closing, /native WSS cleanup failed/); assert.equal(owner.closeNative(authority), closing); assert.deepEqual(notice, [true]); fakeNetwork.factory = oldFactory
})

/** Pure scope/native-confirmation state and transport guards; no keys, sockets, real device identity or permission dispatch. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeApprovalReview } from '../.build/approval-review.js'
import { DisabledNativeProvider } from '../.build/native-disabled.js'
import { NetworkPhone } from '../.build/network-phone.js'
import { MockDeviceRegistry } from '../.build/link-protocol.js'
import { RelayGuestGate } from '../.build/relay-guest.js'

const selection = { desktopId: 'security-desktop', deviceId: 'synthetic-security-phone', sessionId: 'security-session', actionId: 'security-action', grantEpoch: 1 }
const binding = { ...selection, approvalId: 'security-approval', revision: 1, expiresAt: 1500, summary: 'Synthetic approval review only' }
const intent = { approvalId: binding.approvalId, revision: 1, decision: 'approve' }
const command = { protocol: 'dsh-mobile-lab/2', desktopId: selection.desktopId, deviceId: selection.deviceId, grantEpoch: 1, commandId: 'security-command', expiresAt: 2000, operation: 'approval.list', payload: { sessionId: selection.sessionId } }
function state(options = {}) {
  let now = 1000
  const source = {}, registry = new MockDeviceRegistry('mock', () => now)
  if (!options.unpaired) registry.addFixtureGrant({ ...selection, epoch: 1, sessions: [selection.sessionId], operations: ['approval.list'], expiresAt: options.grantExpires ?? 3000, revoked: false })
  const review = new NativeApprovalReview(source, selected => registry.authorize({ ...command, desktopId: selected.desktopId, deviceId: selected.deviceId, grantEpoch: selected.grantEpoch }, selected.sessionId), { clock: () => now, maxBytes: 2048 })
  return { source, registry, review, advance: ms => { now += ms } }
}
test('default native provider and configured HTTPS cannot turn synthetic or absent identities into live network access', async () => {
  let fetched = 0
  const fetch = async () => { fetched++; throw new Error('No live IO permitted') }, config = { enabled: true, mode: 'configured-https', baseUrl: 'https://example.invalid/', maxFrameBytes: 4096, maxReadChunkBytes: 4096, requestTimeoutMs: 100, maxInFlight: 1 }
  assert.throws(() => new NetworkPhone(config, fetch), error => error.code === 'live-provider-unavailable')
  const provider = new DisabledNativeProvider()
  await assert.rejects(provider.request(command), error => error.code === 'unpaired')
  await assert.rejects(provider.follow(command, { instance: null, relayCursor: -1 })[Symbol.asyncIterator]().next(), error => error.code === 'unpaired')
  await provider.close(); await assert.rejects(provider.request(command), error => error.code === 'closed'); assert.equal(fetched, 0)
  assert.throws(() => new MockDeviceRegistry('production', () => 1), error => error.code === 'mock-only')
})
test('unpaired, revoked and expired synthetic devices cannot stage or confirm approval', async () => {
  const absent = state({ unpaired: true }); assert.throws(() => absent.review.stage(binding), error => error.code === 'scope-denied'); assert.equal(absent.review.view.state, 'unavailable')
  const revoked = state(); revoked.review.stage(binding); await revoked.registry.revoke(selection.deviceId)
  assert.throws(() => revoked.review.confirm(intent, revoked.source, selection), error => error.code === 'revoked'); assert.equal(revoked.review.view.review, null)
  const expired = state({ grantExpires: 1001 }); expired.review.stage(binding); expired.advance(1)
  assert.throws(() => expired.review.confirm(intent, expired.source, selection), error => error.code === 'grant-expired'); assert.equal(expired.review.view.review, null)
})
test('approval confirmation binds the current native Session, action, desktop, device and epoch', () => {
  const l = state(); l.review.stage(binding)
  for (const wrong of [{ sessionId: 'foreign' }, { actionId: 'foreign-action' }, { desktopId: 'foreign-desktop' }, { deviceId: 'foreign-device' }, { grantEpoch: 2 }]) {
    assert.throws(() => l.review.confirm(intent, l.source, { ...selection, ...wrong }), error => error.code === 'scope-denied'); assert.equal(l.review.view.review, null)
  }
  assert.throws(() => l.review.stage({ ...binding, sessionId: 'foreign' }), error => error.code === 'scope-denied')
  assert.throws(() => l.registry.authorize({ ...command, operation: 'task.submit' }, selection.sessionId), error => error.code === 'scope-denied')
})
test('expired and replaced approval revisions cannot approve a stale action; matching native review is local and idempotent', () => {
  const l = state(); l.review.stage(binding)
  assert.throws(() => l.review.confirm({ ...intent, revision: 0 }, l.source, selection), error => error.code === 'approval-stale')
  l.review.stage({ ...binding, revision: 2 }); assert.throws(() => l.review.confirm(intent, l.source, selection), error => error.code === 'approval-stale')
  assert.throws(() => l.review.stage(binding), error => error.code === 'approval-stale')
  assert.throws(() => l.review.stage({ ...binding, revision: 2, summary: 'changed same revision' }), error => error.code === 'approval-conflict')
  const current = { ...intent, revision: 2 }, first = l.review.confirm(current, l.source, selection)
  assert.deepEqual(first, { kind: 'local-review-only', decision: 'approve' }); assert.deepEqual(l.review.confirm(current, l.source, selection), first)
  assert.throws(() => l.review.confirm({ ...current, decision: 'deny' }, l.source, selection), error => error.code === 'approval-conflict')
  l.advance(500); assert.equal(l.review.view.state, 'expired'); assert.equal(l.review.view.review, null)
  assert.throws(() => l.review.confirm(current, l.source, selection), error => error.code === 'approval-expired')
  l.review.close(); assert.throws(() => l.review.confirm(current, l.source, selection), error => error.code === 'closed')
})
test('JSON claims, a cloned native source and correctly scoped rich packets cannot forge native confirmation', async () => {
  const l = state(); l.review.stage(binding)
  assert.throws(() => l.review.confirm(intent, {}, selection), error => error.code === 'native-confirmation-required')
  for (const forged of [{ ...intent, nativeConfirmed: true }, { ...intent, source: 'native' }, { ...intent, decision: true }]) assert.throws(() => l.review.confirm(forged, l.source, selection))
  let dispatched = 0
  const guestSource = {}, gate = new RelayGuestGate({ request: async () => { dispatched++; return null } }, { source: guestSource, sessionId: 'security-session', mountId: 'security-mount', renderRevision: 1, packetBytes: 4096, maxPackets: 8 })
  const packet = { protocol: 'lumina-rich/1', mountId: 'security-mount', renderRevision: 1, packetId: 'forged-native', seq: 1, type: 'approval.confirm', payload: intent }
  await assert.rejects(gate.receive(JSON.stringify(packet), guestSource), error => error.code === 'forbidden')
  assert.equal(dispatched, 0); assert.equal(l.review.view.review, null)
})
test('malformed, oversized, legacy unbound approval metadata and stale scope never modify an admitted review', () => {
  const l = state(); l.review.stage(binding); const before = l.review.view
  for (const invalid of [{ ...binding, summary: 'x'.repeat(3000) }, { ...binding, extra: 'field' }, { ...binding, revision: -1 }, { approvalId: binding.approvalId, revision: 1, summary: binding.summary, expiresAt: binding.expiresAt, state: 'pending' }]) {
    assert.throws(() => l.review.stage(invalid)); assert.deepEqual(l.review.view, before)
  }
})

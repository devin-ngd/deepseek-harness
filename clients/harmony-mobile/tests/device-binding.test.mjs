/** Fixed-key public device lifecycle tests; no installed profiles, HUKS/DPAPI, listeners or model providers. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createECDH, createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
const api = await import(pathToFileURL(process.env.DSH_HARMONY_DEVICE_BINDING_MODULE).href)
function key(scalar) { const d = Buffer.alloc(32); d[31] = scalar; const ec = createECDH('prime256v1'); ec.setPrivateKey(d); const point = ec.getPublicKey(), privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: d.toString('base64url') } }); return { publicSpki: createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64url'), sign: async bytes => sign('sha256', bytes, privateKey) } }
const desktop = key(2), phone = key(6), fingerprint = spki => 'p256-sha256-' + createHash('sha256').update(Buffer.from(spki, 'base64url')).digest('hex')
const primitives = { credentialId: async spki => fingerprint(spki), encode: bytes => Buffer.from(bytes).toString('base64url'), decode: text => Buffer.from(text, 'base64url'), verify: async (spki, bytes, signature) => verify('sha256', bytes, createPublicKey({ key: Buffer.from(spki, 'base64url'), format: 'der', type: 'spki' }), signature) }
function storage() { let value = null; const history = []; return { history, read: async () => value, compareAndSet: async (old, next) => { assert.equal(value, old, 'atomic compare conflict'); history.push(value); value = next } } }
function fixture(existing = storage(), policyOverrides = {}) {
  const authority = {}, native = {}, state = { now: 1000, phoneOffset: 0, ids: 0, calls: [], approvals: 0 }, timers = new Set(), rows = Array.from({ length: 40 }, (_, n) => ({ profileId: 'desktop', sessionId: 'session-' + n, title: 'Session ' + n, projectId: null }))
  const scheduler = { after: (ms, callback) => { const entry = { at: state.now + ms, callback }; timers.add(entry); return () => timers.delete(entry) } }
  const policy = { desktopId: 'fixture-desktop', profileId: 'desktop', deviceId: 'fixture-phone', identityAlias: 'fixture-original-phone', audience: 'relay.example', enrollmentTtlMs: 500, connectionTtlMs: 1000, challengeTtlMs: 100, maxChallenges: 1000, maxCatalogRows: 1000, maxPublicBytes: 65536, ...policyOverrides }
  const ports = { list: async () => structuredClone(rows), dispatch: async (sessionId, operation, payload, signal) => { signal.throwIfAborted(); state.calls.push({ sessionId, operation, payload }); return { sessionId, accepted: true } } }
  const owner = new api.DeviceBindingOwner(authority, policy, existing, desktop, ports, () => state.now, { id: () => 'fixture-id-' + ++state.ids, nonce: () => Buffer.alloc(32, state.ids).toString('base64url') }, scheduler)
  const publicStorage = storage(), client = new api.DeviceBindingClient(native, { ...policy, desktopCredentialId: fingerprint(desktop.publicSpki), maxProofs: 1000, maxChallengeTtlMs: 1000 }, publicStorage, phone, primitives, () => state.now + state.phoneOffset)
  const advance = ms => { state.now += ms; for (const item of [...timers]) if (item.at <= state.now && timers.delete(item)) item.callback() }
  const channel = id => { const abort = new AbortController(), base = { id, signal: abort.signal }; return { abort, server: { ...base, remoteCredentialId: fingerprint(phone.publicSpki) }, phone: { ...base, remoteCredentialId: fingerprint(desktop.publicSpki) } } }
  const bind = async () => { const offer = await owner.offer(authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }); const reply = JSON.parse(await client.signOffer(native, JSON.stringify(offer), true)); const receipt = await owner.confirm(authority, reply, async () => { state.approvals++; return true }); await client.accept(native, JSON.stringify(receipt), true); return receipt }
  const connect = async (ch = channel('channel-' + ++state.ids)) => { const challenge = await owner.challenge(ch.server), proof = await client.connectionProof(native, ch.phone, JSON.stringify(challenge)), ticket = await owner.authenticate(ch.server, proof); await client.ticket(native, ch.phone, ticket); return { ...ch, ticket, challenge, proof } }
  return { authority, native, state, timers, scheduler, policy, ports, rows, owner, client, existing, publicStorage, advance, channel, bind, connect, close: async () => { client.close(); await owner.close(); assert.equal(timers.size, 0) } }
}
test('pending registration creates no durable binding or ticket; cancellation preserves original records', async () => {
  const f = fixture()
  try { await f.owner.offer(f.authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }); assert.equal(await f.existing.read(), null); await f.owner.cancelOffer(f.authority); await f.owner.offer(f.authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }); assert.equal(f.state.approvals, 0); assert.equal(await f.existing.read(), null) } finally { await f.close() }
})

test('a phone clock 350 ms behind accepts a fresh channel ticket without extending desktop expiry', async () => {
  const f = fixture()
  try {
    await f.bind(); f.state.phoneOffset = -350
    const connected = await f.connect()
    assert.ok(connected.ticket.issuedAt > f.state.now + f.state.phoneOffset)
    assert.equal((await f.owner.catalog(connected.server, connected.ticket)).length, 40)
    f.advance(f.policy.connectionTtlMs)
    await assert.rejects(f.owner.catalog(connected.server, connected.ticket), /ticket denied/)
    assert.equal(connected.abort.signal.aborted, false)
  } finally { await f.close() }
})

test('phone ticket validation still rejects local expiry, altered signatures and another channel', async () => {
  const f = fixture()
  try {
    await f.bind(); const connected = await f.connect()
    await assert.rejects(f.client.ticket(f.native, f.channel('foreign').phone, connected.ticket), /ticket denied/)
    await assert.rejects(f.client.ticket(f.native, connected.phone, { ...connected.ticket, issuedAt: connected.ticket.issuedAt + 1 }), /ticket denied/)
    f.state.phoneOffset = f.policy.connectionTtlMs
    await assert.rejects(f.client.ticket(f.native, connected.phone, connected.ticket), /ticket denied/)
  } finally { await f.close() }
})
test('one device binding admits more than sixteen existing and future visible Sessions without another approval', async () => {
  const f = fixture()
  try { const receipt = await f.bind(); assert.equal('expiresAt' in receipt, false); assert.equal('sessions' in receipt, false); const ch = await f.connect(); assert.equal((await f.owner.catalog(ch.server, ch.ticket)).length, 40); f.rows.push({ profileId: 'desktop', sessionId: 'new-session', title: 'Created after binding', projectId: null }); assert.equal((await f.owner.catalog(ch.server, ch.ticket)).length, 41); assert.deepEqual(await f.owner.dispatch(ch.server, ch.ticket, 'desktop', 'new-session', 'session.sync', {}), { sessionId: 'new-session', accepted: true }); assert.equal(f.state.approvals, 1); assert.equal(f.existing.history.length, 1); assert.equal(f.publicStorage.history.length, 1) } finally { await f.close() }
})
test('cold host and phone reuse original registration but cannot reuse an old connection receipt', async () => {
  const f = fixture(); let second, coldPhone
  try { await f.bind(); const old = await f.connect(); await f.owner.close(); second = new api.DeviceBindingOwner(f.authority, f.policy, f.existing, desktop, f.ports, () => f.state.now, { id: () => 'cold-' + ++f.state.ids, nonce: () => Buffer.alloc(32, 7).toString('base64url') }, f.scheduler); await assert.rejects(second.catalog(old.server, old.ticket), /ticket denied/); coldPhone = new api.DeviceBindingClient(f.native, { ...f.policy, desktopCredentialId: fingerprint(desktop.publicSpki), maxProofs: 1000, maxChallengeTtlMs: 1000 }, f.publicStorage, phone, primitives, () => f.state.now); const challenge = await second.challenge(old.server), proof = await coldPhone.connectionProof(f.native, old.phone, JSON.stringify(challenge)), ticket = await second.authenticate(old.server, proof); assert.equal((await second.catalog(old.server, ticket)).length, 40); assert.equal(f.state.approvals, 1); assert.equal(f.existing.history.length, 1) } finally { coldPhone?.close(); await second?.close(); await f.close() }
})
test('legacy single-Session grants are neither converted nor accepted as device registrations', async () => {
  const store = storage(); await store.compareAndSet(null, JSON.stringify({ protocol: 'dsh-mobile-device-auth/1', sessions: ['old-session'], revoked: true, epoch: 10 })); const original = await store.read(), f = fixture(store)
  try { await assert.rejects(f.owner.offer(f.authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }), /already exists/); await assert.rejects(f.owner.challenge(f.channel('legacy').server)); assert.equal(await store.read(), original) } finally { await f.close() }
})
test('unknown fields, altered profiles, unconfirmed fingerprints and changed signing identities refuse', async () => {
  const f = fixture()
  try { const offer = await f.owner.offer(f.authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }); await assert.rejects(f.client.signOffer(f.native, JSON.stringify(offer), false), /comparison/); for (const changed of [{ ...offer, token: 'fixture-private' }, { ...offer, registration: { ...offer.registration, profileId: 'other' } }, { ...offer, registration: { ...offer.registration, phonePublicSpki: desktop.publicSpki } }]) await assert.rejects(f.client.signOffer(f.native, JSON.stringify(changed), true)); assert.equal(await f.existing.read(), null) } finally { await f.close() }
})
test('connection proof is one-use and tied to the exact trusted channel object', async () => {
  const f = fixture()
  try { await f.bind(); const ch = f.channel('original'), challenge = await f.owner.challenge(ch.server), proof = await f.client.connectionProof(f.native, ch.phone, JSON.stringify(challenge)); await assert.rejects(f.owner.authenticate({ ...ch.server }, proof), /challenge denied/); const ticket = await f.owner.authenticate(ch.server, proof); await assert.rejects(f.owner.authenticate(ch.server, proof), /challenge denied/); await assert.rejects(f.client.connectionProof(f.native, ch.phone, JSON.stringify(challenge)), /replay/); await assert.rejects(f.owner.catalog({ ...ch.server }, ticket), /ticket denied/) } finally { await f.close() }
})
test('ticket alteration, expiry, transport abort and replacement each deny old admission', async () => {
  const f = fixture()
  try { await f.bind(); const one = await f.connect(); await assert.rejects(f.owner.catalog(one.server, { ...one.ticket, signature: 'changed' }), /ticket denied/); await assert.rejects(f.owner.dispatch(one.server, one.ticket, 'other', 'session-1', 'session.sync', {}), /operation denied/); const two = await f.connect(); await assert.rejects(f.owner.catalog(one.server, one.ticket), /ticket denied/); f.advance(1001); await assert.rejects(f.owner.catalog(two.server, two.ticket), /ticket denied/); const three = await f.connect(); three.abort.abort(); await assert.rejects(f.owner.catalog(three.server, three.ticket), /ticket denied/); assert.equal(f.state.approvals, 1) } finally { await f.close() }
})
test('visibility is rechecked per request and before result delivery; accepted work is never repeated', async () => {
  const f = fixture()
  try { await f.bind(); const ch = await f.connect(); f.rows.splice(0, 1); await assert.rejects(f.owner.dispatch(ch.server, ch.ticket, 'desktop', 'session-0', 'task.submit', {}), /operation denied/); f.ports.dispatch = async (sessionId, operation) => { f.state.calls.push({ sessionId, operation }); f.rows.splice(f.rows.findIndex(row => row.sessionId === sessionId), 1); return { privateResult: 'must-not-deliver' } }; await assert.rejects(f.owner.dispatch(ch.server, ch.ticket, 'desktop', 'session-1', 'task.submit', {}), /retired before delivery/); assert.equal(f.state.calls.length, 1) } finally { await f.close() }
})
test('foreign profile rows and arbitrary Host API names never reach dispatch', async () => {
  const f = fixture()
  try { await f.bind(); const ch = await f.connect(); f.rows.push({ profileId: 'foreign', sessionId: 'hidden', title: 'Other', projectId: null }); await assert.rejects(f.owner.catalog(ch.server, ch.ticket), /scope/); f.rows.pop(); await assert.rejects(f.owner.dispatch(ch.server, ch.ticket, 'desktop', 'session-1', 'host.shell', {}), /operation denied/); assert.equal(f.state.calls.length, 0) } finally { await f.close() }
})
test('revocation immediately denies tickets, persists a signed tombstone and survives cold start', async () => {
  const f = fixture(); let cold
  try { await f.bind(); const ch = await f.connect(); await f.owner.revoke(f.authority); await assert.rejects(f.owner.catalog(ch.server, ch.ticket)); const record = JSON.parse(await f.existing.read()); assert.equal(record.revoked, true); assert.equal(record.epoch, 2); assert.equal(f.existing.history.length, 2); cold = new api.DeviceBindingOwner(f.authority, f.policy, f.existing, desktop, f.ports, () => f.state.now, { id: () => 'revoked-' + ++f.state.ids, nonce: () => Buffer.alloc(32, 7).toString('base64url') }, f.scheduler); await assert.rejects(cold.challenge(ch.server), /revoked/) } finally { await cold?.close(); await f.close() }
})
test('unknown registration writes and failed revocation remain visible and block the live owner', async () => {
  const f = fixture()
  try { await f.bind(); const ch = await f.connect(); f.existing.compareAndSet = async () => { throw new Error('fixture IO failure') }; await assert.rejects(f.owner.revoke(f.authority), /outcome unknown/); await assert.rejects(f.owner.catalog(ch.server, ch.ticket), /unavailable/); await assert.rejects(f.owner.challenge(ch.server), /unavailable/) } finally { await f.close() }
})
test('revocation in progress blocks a concurrent fresh connection before its persistent write settles', async () => {
  const f = fixture()
  try { await f.bind(); const ch = await f.connect(); const original = f.existing.compareAndSet; let release, entered; const started = new Promise(resolve => entered = resolve); f.existing.compareAndSet = async (...args) => { entered(); await new Promise(resolve => release = resolve); return original(...args) }; const revocation = f.owner.revoke(f.authority); await started; await assert.rejects(f.owner.challenge(ch.server), /revocation pending/); release(); await revocation } finally { await f.close() }
})

test('unknown initial commit is inspected rather than repeated and blocks the originating owner', async () => {
  const f = fixture()
  try {
    const offer = await f.owner.offer(f.authority, { publicSpki: phone.publicSpki, credentialId: fingerprint(phone.publicSpki) }), reply = JSON.parse(await f.client.signOffer(f.native, JSON.stringify(offer), true)), write = f.existing.compareAndSet
    f.existing.compareAndSet = async (...args) => { await write(...args); throw new Error('fixture acknowledgement lost after commit') }
    await assert.rejects(f.owner.confirm(f.authority, reply, async () => true), /commit outcome unknown/)
    assert.equal(JSON.parse(await f.existing.read()).bindingId, offer.registration.bindingId)
    await assert.rejects(f.owner.confirm(f.authority, reply, async () => true), /unavailable/)
    assert.equal(f.existing.history.length, 1)
  } finally { await f.close() }
})
async function mobileFixture(policyOverrides = {}, legacy = false) {
  const f = fixture(storage(), policyOverrides); await f.bind(); const publications = [], selections = [], closes = []
  const ports = { connect: async () => {
    const channel = f.channel('native-' + ++f.state.ids)
    return { authentication: 'caller', binding: channel.phone, challenge: async () => JSON.stringify(await f.owner.challenge(channel.server)), authenticate: proof => f.owner.authenticate(channel.server, proof), catalog: async ticket => legacy ? { sessions: (await f.owner.catalog(channel.server, ticket)).map(({ profileId, sessionId, title, projectId }) => ({ profileId, sessionId, title, projectId })), projects: null } : { sessions: await f.owner.catalog(channel.server, ticket), projects: await f.owner.projects(channel.server, ticket) }, ...(legacy ? {} : { manage: async (action, ticket) => (await f.owner.manage(channel.server, ticket, action)).sessionId }), select: async (route, ticket, publish, signal) => {
      await f.owner.dispatch(channel.server, ticket, route.profileId, route.sessionId, 'session.sync', {})
      const selected = { route, publish, signal }; selections.push(selected)
      return { richRequest: async raw => { await f.owner.dispatch(channel.server, ticket, route.profileId, route.sessionId, 'rich.invoke', { raw }); return JSON.stringify({ sessionId: route.sessionId }) }, close: async () => { closes.push(route.sessionId) } }
    }, close: async () => channel.abort.abort() }
  } }
  const product = new api.DeviceBoundMobileProduct(f.native, f.client, ports, () => f.state.now, f.scheduler, view => publications.push(view))
  return { ...f, product, publications, selections, closes, close: async () => { await product.close(); await f.close() } }
}
test('native device navigation lists new Sessions and isolates old subscriptions and rich requests on switch', async () => {
  const f = await mobileFixture()
  try {
    await f.product.connect(f.native); assert.equal(f.product.view.sessions.length, 40)
    await f.product.select(f.native, 'session-1'); const first = f.selections[0]; first.publish('old Session view'); assert.equal(f.product.view.content, 'old Session view')
    await f.product.select(f.native, 'session-2'); assert.equal(first.signal.aborted, true); assert.deepEqual(f.closes, ['session-1']); first.publish('late private old view'); assert.equal(f.product.view.content.includes('late private'), false)
    f.selections[1].publish('new Session view'); assert.equal(f.product.view.content, 'new Session view'); assert.deepEqual(JSON.parse(await f.product.richRequest('{}')), { sessionId: 'session-2' })
    f.rows.push({ profileId: 'desktop', sessionId: 'future', title: 'Future', projectId: null }); await f.product.refresh(f.native); await f.product.select(f.native, 'future'); assert.equal(f.product.view.selected.sessionId, 'future'); assert.equal(f.state.approvals, 1)
    assert.equal(JSON.stringify(f.publications).includes('harmony-device-ticket/1'), false)
  } finally { await f.close() }
})
test('native ticket expiry closes the Session/rich owner and reconnects using existing registration', async () => {
  const f = await mobileFixture()
  try {
    await f.product.connect(f.native); await f.product.select(f.native, 'session-1'); f.advance(1001)
    await assert.rejects(f.product.richRequest('{}'))
    await f.product.disconnect(f.native); assert.equal(f.product.view.state, 'disconnected'); assert.equal(f.selections[0].signal.aborted, true)
    await f.product.connect(f.native); await f.product.select(f.native, 'session-2'); assert.equal(f.product.view.selected.sessionId, 'session-2'); assert.equal(f.state.approvals, 1)
  } finally { await f.close() }
})

function directoryPorts(f) {
  f.ports.projects = async () => [{ projectId: 'project-1', title: 'Project One' }]
  f.ports.manage = async (action, signal) => {
    signal.throwIfAborted(); f.state.calls.push({ manage: action })
    if (action.action === 'create') { f.rows.push({ profileId: 'desktop', sessionId: 'created-' + f.state.calls.length, title: 'created-' + f.state.calls.length, projectId: action.projectId, updatedAt: 5, running: false, pinned: false, archived: false, blank: true }); return { sessionId: f.rows.at(-1).sessionId } }
    const row = f.rows.find(value => value.sessionId === action.sessionId); row.pinned = action.action === 'pin' || action.action !== 'unpin' && action.action !== 'archive' && row.pinned; row.archived = action.action === 'archive' || action.action !== 'unarchive' && row.archived
    return { sessionId: action.sessionId }
  }
}
test('desktop directory carries list state and management is limited to visible Sessions and projects', async () => {
  const f = fixture()
  try {
    await f.bind(); const ch = await f.connect()
    assert.deepEqual((await f.owner.catalog(ch.server, ch.ticket))[0], { profileId: 'desktop', sessionId: 'session-0', title: 'Session 0', projectId: null, updatedAt: 0, running: false, pinned: false, archived: false, blank: false })
    assert.deepEqual(await f.owner.projects(ch.server, ch.ticket), [])
    await assert.rejects(f.owner.manage(ch.server, ch.ticket, { action: 'pin', sessionId: 'session-1' }), /management unavailable/)
    directoryPorts(f)
    assert.deepEqual(await f.owner.projects(ch.server, ch.ticket), [{ projectId: 'project-1', title: 'Project One' }])
    assert.deepEqual(await f.owner.manage(ch.server, ch.ticket, { action: 'pin', sessionId: 'session-1' }), { sessionId: 'session-1' })
    assert.equal((await f.owner.catalog(ch.server, ch.ticket))[1].pinned, true)
    assert.equal((await f.owner.manage(ch.server, ch.ticket, { action: 'create', projectId: 'project-1' })).sessionId.startsWith('created-'), true)
    await f.owner.manage(ch.server, ch.ticket, { action: 'create', projectId: null })
    const calls = f.state.calls.length
    await assert.rejects(f.owner.manage(ch.server, ch.ticket, { action: 'archive', sessionId: 'hidden' }), /management denied/)
    await assert.rejects(f.owner.manage(ch.server, ch.ticket, { action: 'create', projectId: 'other-project' }), /management denied/)
    await assert.rejects(f.owner.manage(ch.server, ch.ticket, { action: 'delete', sessionId: 'session-1' }))
    await assert.rejects(f.owner.manage(ch.server, ch.ticket, { action: 'pin', sessionId: 'session-1', title: 'extra' }))
    await assert.rejects(f.owner.manage(ch.server, { ...ch.ticket, signature: 'changed' }, { action: 'pin', sessionId: 'session-2' }), /ticket denied/)
    assert.equal(f.state.calls.length, calls)
  } finally { await f.close() }
})
test('phone management refreshes the directory and keeps the selection; older desktops stay read-only', async () => {
  const f = await mobileFixture()
  try {
    directoryPorts(f); await f.product.connect(f.native)
    assert.equal(f.product.view.manageable, true); assert.deepEqual(f.product.view.projects, [{ projectId: 'project-1', title: 'Project One' }])
    await f.product.select(f.native, 'session-1')
    const created = await f.product.manage(f.native, { action: 'create', projectId: 'project-1' })
    assert.deepEqual(f.product.view.sessions.find(row => row.sessionId === created), { profileId: 'desktop', sessionId: created, title: created, projectId: 'project-1', updatedAt: 5, running: false, pinned: false, archived: false, blank: true })
    assert.equal(f.product.view.selected.sessionId, 'session-1')
    await f.product.manage(f.native, { action: 'archive', sessionId: 'session-1' }); assert.equal(f.product.view.sessions.find(row => row.sessionId === 'session-1').archived, true)
    await assert.rejects(f.product.manage(f.native, { action: 'rename', sessionId: 'session-1' }))
    await f.product.select(f.native, created); assert.equal(f.product.view.selected.sessionId, created)
  } finally { await f.close() }
  const legacy = await mobileFixture({}, true)
  try {
    await legacy.product.connect(legacy.native)
    assert.equal(legacy.product.view.manageable, false); assert.deepEqual(legacy.product.view.projects, [])
    assert.deepEqual(legacy.product.view.sessions[0], { profileId: 'desktop', sessionId: 'session-0', title: 'Session 0', projectId: null, updatedAt: 0, running: false, pinned: false, archived: false, blank: false })
    await assert.rejects(legacy.product.manage(legacy.native, { action: 'create', projectId: null }), /management unavailable/)
  } finally { await legacy.close() }
})
test('configured device tickets keep the catalogue usable beyond three minutes and still expire', async () => {
  const { connectionTtlMs } = JSON.parse(await readFile('desktop-plugin/device.enabled.example.json', 'utf8'))
  const f = await mobileFixture({ connectionTtlMs })
  try {
    await f.product.connect(f.native)
    f.advance(30000); await f.product.refresh(f.native)
    f.advance(150000); await f.product.refresh(f.native)
    assert.equal(f.product.view.state, 'connected'); assert.equal(f.product.view.sessions.length, 40)
    f.advance(connectionTtlMs - 180000)
    await assert.rejects(f.product.refresh(f.native))
    await f.product.disconnect(f.native)
    assert.equal(f.product.view.state, 'disconnected'); assert.equal(f.state.calls.length, 0)
  } finally { await f.close() }
})

test('a shorter routing deadline caps a configured ten-minute ticket and denies late catalogue reads', async () => {
  const { connectionTtlMs } = JSON.parse(await readFile('desktop-plugin/device.enabled.example.json', 'utf8'))
  const f = fixture(storage(), { connectionTtlMs })
  try {
    await f.bind(); const ch = f.channel('capped-ticket'), cap = f.state.now + 45000
    const challenge = await f.owner.challenge(ch.server), proof = await f.client.connectionProof(f.native, ch.phone, JSON.stringify(challenge))
    const ticket = await f.owner.authenticate(ch.server, proof, cap)
    assert.equal(ticket.expiresAt, cap)
    await f.client.ticket(f.native, ch.phone, ticket)
    f.advance(44999); assert.equal((await f.owner.catalog(ch.server, ticket)).length, 40)
    f.advance(1); await assert.rejects(f.owner.catalog(ch.server, ticket))
  } finally { await f.close() }
})

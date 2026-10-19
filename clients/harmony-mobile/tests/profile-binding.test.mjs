/** Pure in-memory qualification; no Context, SDK, model, listener, credentials, installation or native execution. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseProfileAdvertisement, resolveProfileCapabilities, PROFILE_CAPABILITIES } from '../.build/profile-capabilities.js'
import { bindSyntheticProfile } from '../.build/profile-binding.js'
import { syntheticProfileFixture } from '../.build/profile-binding-fixture.js'
import { RestrictedDesktopAdapter } from '../.build/desktop-adapter.js'
import { MockDeviceRegistry, MOBILE_LINK_PROTOCOL, LinkError, parseCommand } from '../.build/link-protocol.js'
import { MemoryAdmissionJournal } from '../.build/admission-journal.js'
import { id } from '../.build/protocol.js'

const rejects = code => error => error.code === code
const protocols = { command: MOBILE_LINK_PROTOCOL, wire: 'dsh-mobile-wire/1', richGuest: 'lumina-rich/1' }
const revisions = Object.fromEntries(PROFILE_CAPABILITIES.map(name => [name, 'fixture-ports/1']))
const requirements = capabilities => ({ protocols, capabilities })
const allRequirements = Object.fromEntries(PROFILE_CAPABILITIES.map(name => [name, { revision: revisions[name], required: true }]))
const advertised = () => ({ schema: 'dsh-mobile-profile-capabilities/1', desktopId: 'mock-desktop', profileId: 'profile-fixture',
  generation: 'profile-generation-1', protocols: { ...protocols }, capabilities: { ...revisions } })
const plan = (value = advertised(), required = allRequirements) => resolveProfileCapabilities(parseProfileAdvertisement(value), requirements(required))

function setup(options = {}) {
  let now = 1000
  const clock = () => now, nativeSource = {}
  const pending = { pendingId: id('pending-fixture'), sessionId: id('mock-session-a'), generation: id('profile-generation-1'),
    revision: 1, summary: 'Synthetic one-shot approval', expiresAt: 2000, state: 'pending' }
  const fixture = syntheticProfileFixture(clock, [pending])
  const selection = { desktopId: fixture.host.desktop.desktopId, profileId: id('profile-fixture'), generation: pending.generation,
    deviceId: id('fixture-phone-a'), grantEpoch: 1, sessionId: pending.sessionId }
  let peer = { kind: 'synthetic-device', ...selection, sessions: [selection.sessionId], capabilities: [...PROFILE_CAPABILITIES], expiresAt: 3000, revoked: false }
  const config = { selection, plan: options.plan ?? plan(), peer: () => peer, clock, nativeSource }
  const host = options.transform ? options.transform(fixture.ports) : fixture.ports
  const binding = options.unbound ? null : bindSyntheticProfile(host, config)
  const prompt = { sessionId: selection.sessionId, requestId: id('profile-request-1'), mode: 'queue', content: [{ type: 'text', text: 'Synthetic profile task' }] }
  const response = { pendingId: pending.pendingId, sessionId: pending.sessionId, generation: pending.generation, revision: 1, decision: 'allowed-once' }
  return { ...fixture, hostPorts: host, binding, selection, config, pending, response, prompt, nativeSource, clock,
    setPeer: update => { peer = { ...peer, ...update } }, operator: () => { peer = { kind: 'operator' } }, elapse: amount => { now += amount } }
}
const signal = () => new AbortController().signal
const follow = lab => ({ address: { kind: 'session', sessionId: lab.selection.sessionId }, assistantStream: true })
const mountRequest = lab => { const scope = lab.host.desktop.snapshotFor(lab.selection.sessionId).scope; return { sessionId: scope.sessionId, messageId: scope.messageId, blockId: scope.blockId } }
const draft = snapshot => ({ baseRevision: snapshot.draft.draftRevision, stateSchemaVersion: snapshot.manifest.stateSchemaVersion, fields: { title: 'Synthetic draft', count: '8' }, dirty: ['title', 'count'] })
const invoke = mounted => ({ mountId: mounted.mountId, actionId: id('profile-action-1'), actionName: 'submit', targetActionId: null,
  expectedDataRevision: mounted.snapshot.dataRevision, values: { title: 'Synthetic draft', count: '8' }, fileGrants: [], draft: draft(mounted.snapshot) })

test('negotiation selects exact requested revisions and cannot enable an advertised but unrequested endpoint', () => {
  const value = advertised(), result = plan(value, { 'session.follow': allRequirements['session.follow'] })
  assert.deepEqual(result.resolution('session.follow'), { enabled: true, revision: 'fixture-ports/1' })
  assert.deepEqual(result.resolution('approval.respond'), { enabled: false, reason: 'capability-not-requested' })
  assert.throws(() => result.require('approval.respond'), rejects('capability-not-requested'))
  value.capabilities['session.follow'] = 'changed'
  assert.equal(result.resolution('session.follow').revision, 'fixture-ports/1')
  const detached = result.resolution('session.follow'); detached.enabled = false
  result.require('session.follow')
})

test('missing metadata, protocol mismatch and required missing/versioned capabilities stop negotiation explicitly', () => {
  assert.throws(() => resolveProfileCapabilities(null, requirements(allRequirements)), rejects('metadata-missing'))
  for (const name of Object.keys(protocols)) { const value = advertised(); value.protocols[name] += '-next'; assert.throws(() => plan(value), error => error.code === 'protocol-mismatch' && error.subject === name) }
  for (const name of PROFILE_CAPABILITIES) {
    const missing = advertised(); delete missing.capabilities[name]
    assert.throws(() => plan(missing), error => error.code === 'capability-missing' && error.subject === name)
    const changed = advertised(); changed.capabilities[name] += '-next'
    assert.throws(() => plan(changed), error => error.code === 'capability-version' && error.subject === name)
  }
})

test('optional missing/versioned capabilities explain their disabled state; approval reply requires displayed projections', () => {
  const value = advertised(); delete value.capabilities['approval.list']; value.capabilities['rich.inline'] = 'next'
  const optional = Object.fromEntries(PROFILE_CAPABILITIES.map(name => [name, { revision: revisions[name], required: false }]))
  const result = plan(value, optional)
  assert.deepEqual(result.resolution('approval.list'), { enabled: false, reason: 'capability-missing' })
  assert.deepEqual(result.resolution('rich.inline'), { enabled: false, reason: 'capability-version' })
  assert.deepEqual(result.resolution('approval.respond'), { enabled: false, reason: 'capability-dependency' })
  assert.throws(() => plan(advertised(), { 'approval.respond': allRequirements['approval.respond'] }), rejects('capability-dependency'))
})

test('wire metadata rejects malformed known fields and ignores future advertised capabilities', () => {
  for (const invalid of [null, { ...advertised(), extra: true }, { ...advertised(), schema: 'future' }, { ...advertised(), capabilities: [] },
    { ...advertised(), generation: '../private' }, { ...advertised(), capabilities: { ...revisions, 'session.prompt': 1 } }]) assert.throws(() => parseProfileAdvertisement(invalid), rejects('metadata-invalid'))
  const decoded = parseProfileAdvertisement({ ...advertised(), capabilities: { ...revisions, 'future.optional': 'future/1' } })
  assert.equal(Object.hasOwn(decoded.capabilities, 'future.optional'), false)
  plan(decoded)
})

test('profile/desktop/generation selection and operator identity reject before a synthetic binding exists', () => {
  for (const [update, code] of [[{ desktopId: 'other-desktop' }, 'scope-denied'], [{ profileId: 'other-profile' }, 'scope-denied'], [{ generation: 'other-generation' }, 'generation-changed']]) {
    const lab = setup({ unbound: true }); assert.throws(() => bindSyntheticProfile(lab.hostPorts, { ...lab.config, selection: { ...lab.selection, ...update } }), rejects(code)); assert.equal(lab.host.promptCalls, 0)
  }
  const lab = setup({ unbound: true }); lab.operator()
  assert.throws(() => bindSyntheticProfile(lab.hostPorts, lab.config), rejects('operator-not-device'))
})

async function deniedAdmission(update, code) {
  const lab = setup(); lab.setPeer(update)
  await assert.rejects(lab.binding.services.session.prompt(lab.prompt, signal()), rejects(code))
  await assert.rejects(lab.binding.approvals.respond(lab.response, lab.nativeSource), rejects(code))
  assert.equal(lab.host.promptCalls, 0); assert.equal(lab.approvals.responses, 0)
  await lab.binding.release()
}
test('a changed desktop cannot dispatch through current device admission', () => deniedAdmission({ desktopId: 'another-desktop' }, 'scope-denied'))
test('a changed profile cannot dispatch through current device admission', () => deniedAdmission({ profileId: 'another-profile' }, 'scope-denied'))
test('a changed device cannot dispatch through current device admission', () => deniedAdmission({ deviceId: 'another-device' }, 'scope-denied'))
test('a changed epoch cannot dispatch through current device admission', () => deniedAdmission({ grantEpoch: 2 }, 'scope-denied'))
test('a removed Session cannot dispatch through current device admission', () => deniedAdmission({ sessions: [] }, 'scope-denied'))
test('a removed operation cannot dispatch through current device admission', () => deniedAdmission({ capabilities: [] }, 'scope-denied'))
test('a new generation cannot dispatch through current device admission', () => deniedAdmission({ generation: 'new-generation' }, 'generation-changed'))
test('a revoked grant cannot dispatch through current device admission', () => deniedAdmission({ revoked: true }, 'grant-revoked'))
test('an expired grant cannot dispatch through current device admission', () => deniedAdmission({ expiresAt: 1000 }, 'grant-expired'))

test('an operator appearing after binding cannot inherit device capabilities from the negotiated metadata', async () => {
  const lab = setup(); lab.operator()
  await assert.rejects(lab.binding.services.session.cancel({ sessionId: lab.selection.sessionId }), rejects('operator-not-device'))
  assert.equal(lab.host.cancelCalls, 0); await lab.binding.release()
})

test('disabled capability calls fail instead of returning an empty list or calling canonical owners', async () => {
  const requested = Object.fromEntries(PROFILE_CAPABILITIES.filter(name => !['approval.list', 'approval.respond', 'session.cancel'].includes(name)).map(name => [name, allRequirements[name]]))
  const lab = setup({ plan: plan(advertised(), requested) })
  await assert.rejects(lab.binding.services.session.cancel({ sessionId: lab.selection.sessionId }), rejects('capability-not-requested'))
  await assert.rejects(lab.binding.services.approvals.list(lab.selection.sessionId), rejects('capability-not-requested'))
  await assert.rejects(lab.binding.approvals.respond(lab.response, lab.nativeSource), rejects('capability-not-requested'))
  assert.equal(lab.host.cancelCalls, 0); assert.equal(lab.approvals.responses, 0); await lab.binding.release()
})

test('canonical prompt/follow/receipt/cancel stay on the selected Session without a second runtime', async () => {
  const lab = setup(), ports = lab.binding.services
  const controller = new AbortController(), iterator = ports.session.follow(follow(lab), controller.signal)[Symbol.asyncIterator]()
  const finalIterator = ports.session.follow(follow(lab), signal())[Symbol.asyncIterator]()
  try {
    assert.equal(ports.environment, 'synthetic-only')
    assert.deepEqual(await ports.session.prompt(lab.prompt, signal()), { accepted: true })
    assert.equal(await ports.session.findPromptReceipt(lab.selection.sessionId, lab.prompt.requestId), 'accepted')
    assert.equal((await iterator.next()).value.header.id, lab.selection.sessionId)
    assert.deepEqual(await ports.session.cancel({ sessionId: lab.selection.sessionId }), { accepted: true })
    const snapshot = (await finalIterator.next()).value
    assert.equal(snapshot.records.at(-1).event.data.state, 'cancelled')
    await assert.rejects(ports.session.prompt({ ...lab.prompt, sessionId: id('mock-session-b') }, signal()), rejects('scope-denied'))
    const foreign = ports.session.follow({ address: { kind: 'session', sessionId: id('mock-session-b') } }, signal())[Symbol.asyncIterator]()
    await assert.rejects(foreign.next(), rejects('scope-denied'))
    assert.equal(lab.host.promptCalls, 1); assert.equal(lab.host.cancelCalls, 1)
  } finally { controller.abort(); await iterator.return(); await finalIterator.return(); await lab.binding.release() }
  assert.equal(lab.host.activeFollows, 0)
})

test('follow authorization is rechecked between frames and closes the owned source iterator', async () => {
  let closed = 0
  const lab = setup({ transform: ports => ({ ...ports, session: { ...ports.session, follow: async function* (request, signal) {
    try {
      for await (const frame of ports.session.follow(request, signal)) yield frame
      yield { type: 'event', event: { type: 'mobile-lab/fixture', seq: 0, time: 1000, data: {}, ignorable: true } }
    }
    finally { closed++ }
  } } }) })
  const iterator = lab.binding.services.session.follow(follow(lab), signal())[Symbol.asyncIterator]()
  await iterator.next(); lab.setPeer({ revoked: true })
  await assert.rejects(iterator.next(), rejects('grant-revoked')); assert.equal(closed, 1)
  await lab.binding.release()
})

test('read permission lost while an approval projection is pending prevents delivery', async () => {
  let resolveRead
  const lab = setup({ transform: ports => ({ ...ports, approvals: { ...ports.approvals, list: () => new Promise(resolve => { resolveRead = resolve }), respond: request => ports.approvals.respond(request) } }) })
  const read = lab.binding.approvals.list(lab.selection.sessionId)
  lab.setPeer({ revoked: true }); resolveRead([lab.pending])
  await assert.rejects(read, rejects('grant-revoked')); await lab.binding.release()
})

test('rich CAS/action identity and receipts remain in the existing owner; another binding cannot address its mount', async () => {
  const lab = setup(), mounted = await lab.binding.services.rich.mount(mountRequest(lab))
  try {
    const saved = await lab.binding.services.rich.saveDraft({ sessionId: lab.selection.sessionId, mountId: mounted.mountId, draft: draft(mounted.snapshot) })
    assert.equal(saved.code, 'SAVED')
    const current = await lab.binding.services.rich.snapshot({ sessionId: lab.selection.sessionId, mountId: mounted.mountId }), request = { ...invoke({ ...mounted, snapshot: current }), sessionId: lab.selection.sessionId }
    const receipt = await lab.binding.services.rich.invoke(request)
    assert.deepEqual(await lab.binding.services.rich.invoke(request), receipt)
    assert.equal((await lab.binding.services.rich.invoke({ ...request, values: { title: 'conflict' } })).code, 'ACTION_ID_CONFLICT')
    assert.equal((await lab.binding.services.rich.status({ sessionId: lab.selection.sessionId, mountId: mounted.mountId, actionId: request.actionId })).state, 'accepted')
    assert.equal(lab.host.desktop.admittedActions, 1)
    const other = bindSyntheticProfile(lab.hostPorts, { ...lab.config, selection: { ...lab.selection, deviceId: id('fixture-phone-b') },
      peer: () => ({ kind: 'synthetic-device', ...lab.selection, deviceId: id('fixture-phone-b'), sessions: [lab.selection.sessionId], capabilities: [...PROFILE_CAPABILITIES], expiresAt: 3000, revoked: false }) })
    await assert.rejects(other.services.rich.snapshot({ sessionId: lab.selection.sessionId, mountId: mounted.mountId }), rejects('mount-unowned'))
    await assert.rejects(other.services.rich.dispose({ sessionId: lab.selection.sessionId, mountId: mounted.mountId }), rejects('mount-unowned')); await other.release()
  } finally { await lab.binding.release() }
  assert.equal(lab.host.mountCount, 0)
  await assert.rejects(lab.binding.services.rich.snapshot({ sessionId: lab.selection.sessionId, mountId: mounted.mountId }), rejects('binding-closed'))
})

test('revocation during mount releases the undeliverable host mount, and release still works after revoked scope', async () => {
  let revoke = () => {}
  const lab = setup({ transform: ports => ({ ...ports, rich: { ...ports.rich, mount: async request => { const result = await ports.rich.mount(request); revoke(); return result } } }) })
  revoke = () => lab.setPeer({ revoked: true })
  await assert.rejects(lab.binding.services.rich.mount(mountRequest(lab)), rejects('grant-revoked'))
  assert.equal(lab.host.mountCount, 0); await lab.binding.release()
  const active = setup(); await active.binding.services.rich.mount(mountRequest(active)); active.setPeer({ revoked: true })
  await active.binding.release(); assert.equal(active.host.mountCount, 0)
})

test('a failed host mount release is reported, stays owned and can be retried after consumer quiescence', async () => {
  let fail = true
  const lab = setup({ transform: ports => ({ ...ports, rich: { ...ports.rich, dispose: async request => { if (fail) throw new Error('Synthetic release unavailable'); return ports.rich.dispose(request) } } }) })
  await lab.binding.services.rich.mount(mountRequest(lab))
  await assert.rejects(lab.binding.release(), rejects('mount-cleanup-failed')); assert.equal(lab.host.mountCount, 1)
  fail = false; await lab.binding.release(); assert.equal(lab.host.mountCount, 0)
})

test('an undeliverable mount with failed cleanup remains recoverable through explicit binding release', async () => {
  let revoke = () => {}, fail = true
  const lab = setup({ transform: ports => ({ ...ports, rich: { ...ports.rich,
    mount: async request => { const mounted = await ports.rich.mount(request); revoke(); return mounted },
    dispose: async request => { if (fail) throw new Error('Synthetic release unavailable'); await ports.rich.dispose(request) },
  } }) })
  revoke = () => lab.setPeer({ revoked: true })
  await assert.rejects(lab.binding.services.rich.mount(mountRequest(lab)), error => error.code === 'mount-cleanup-failed' && error.cause.errors[0].code === 'grant-revoked')
  assert.equal(lab.host.mountCount, 1)
  fail = false; await lab.binding.release(); assert.equal(lab.host.mountCount, 0)
})

test('approval responds only through the original native receiver; duplicate delivery decides once and conflicts reject', async () => {
  const lab = setup()
  assert.equal((await lab.binding.services.approvals.list(lab.selection.sessionId))[0].approvalId, lab.pending.pendingId)
  await assert.rejects(lab.binding.approvals.respond(lab.response, {}), rejects('native-confirmation-required'))
  await assert.rejects(lab.binding.approvals.respond({ ...lab.response, sessionId: id('mock-session-b') }, lab.nativeSource), rejects('scope-denied'))
  await assert.rejects(lab.binding.approvals.respond({ ...lab.response, generation: id('stale-generation') }, lab.nativeSource), rejects('approval-stale'))
  assert.equal(lab.approvals.responses, 0)
  const results = await Promise.all([lab.binding.approvals.respond(lab.response, lab.nativeSource), lab.binding.approvals.respond(lab.response, lab.nativeSource)])
  assert.deepEqual(results.map(row => row.duplicate), [false, true]); assert.equal(lab.approvals.decisions, 1)
  await assert.rejects(lab.binding.approvals.respond({ ...lab.response, decision: 'rejected' }, lab.nativeSource), rejects('approval-conflict'))
  assert.equal((await lab.binding.approvals.list(lab.selection.sessionId))[0].state, 'answered')
  assert.deepEqual(await lab.binding.services.approvals.list(lab.selection.sessionId), [])
  assert.equal(lab.host.promptCalls, 0); await lab.binding.release()
})

test('stale revision, cancellation, expiry and unknown tickets cannot decide a pending approval', async () => {
  for (const [alter, response, code] of [[() => {}, { revision: 0 }, 'approval-stale'], [lab => lab.approvals.cancel(lab.pending.pendingId), {}, 'approval-cancelled'],
    [lab => lab.elapse(1000), {}, 'approval-expired'], [() => {}, { pendingId: id('absent-ticket') }, 'approval-not-found']]) {
    const lab = setup(); alter(lab)
    await assert.rejects(lab.binding.approvals.respond({ ...lab.response, ...response }, lab.nativeSource), rejects(code))
    assert.equal(lab.approvals.decisions, 0); await lab.binding.release()
  }
})

test('existing mobile commands still reject approval responses; metadata and tickets cannot add a guest bridge', () => {
  const lab = setup()
  const command = { protocol: MOBILE_LINK_PROTOCOL, ...lab.selection, commandId: 'forged-command', expiresAt: 1500, operation: 'approval.respond', payload: lab.response }
  delete command.profileId; delete command.generation; delete command.sessionId
  assert.throws(() => parseCommand(JSON.stringify(command), { clock: lab.clock, maxPacketBytes: 4096, maxCommandTtlMs: 1000, maxCachedCommands: 10, maxMountedBlocks: 2 }), rejects('scope-denied'))
  assert.equal(lab.approvals.responses, 0)
})

test('existing adapter journal reconciles a lost prompt receipt without another dispatch; canonical synthetic flow matches owner-local expectation', async () => {
  let loseReply = true
  const lab = setup({ transform: ports => ({ ...ports, session: { ...ports.session, prompt: async (request, signal) => {
    const value = await ports.session.prompt(request, signal); if (loseReply) throw new LinkError('transport-lost'); return value
  } } }) })
  const devices = new MockDeviceRegistry('mock', lab.clock), operations = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.invoke', 'rich.status', 'rich.dispose', 'approval.list']
  devices.addFixtureGrant({ desktopId: lab.selection.desktopId, deviceId: lab.selection.deviceId, epoch: 1, sessions: [lab.selection.sessionId], operations, expiresAt: 3000, revoked: false })
  const adapter = new RestrictedDesktopAdapter(lab.selection.desktopId, lab.binding.services, devices,
    { clock: lab.clock, maxPacketBytes: 131072, maxCommandTtlMs: 1000, maxCachedCommands: 30, maxMountedBlocks: 4 }, new MemoryAdmissionJournal(30))
  let sequence = 0
  const send = (operation, payload) => adapter.handle(JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId: lab.selection.desktopId, deviceId: lab.selection.deviceId,
    grantEpoch: 1, commandId: 'profile-command-' + ++sequence, expiresAt: 1500, operation, payload }))
  try {
    const submit = { sessionId: lab.selection.sessionId, requestId: lab.prompt.requestId, text: 'Synthetic profile task' }
    await assert.rejects(send('task.submit', submit), rejects('unknown-outcome')); loseReply = false
    const receipt = await send('task.submit', submit)
    await assert.rejects(send('task.submit', { ...submit, text: 'Changed intent' }), rejects('id-conflict'))
    const initial = await send('session.sync', { sessionId: lab.selection.sessionId, afterSeq: -1 })
    const mounted = await send('rich.mount', { ...mountRequest(lab), guestProtocol: 'lumina-rich/1' }), request = invoke(mounted)
    const action = await send('rich.invoke', request), duplicate = await send('rich.invoke', request)
    const status = await send('rich.status', { mountId: mounted.mountId, actionId: request.actionId })
    const cancelled = await send('session.cancel', { sessionId: lab.selection.sessionId })
    const final = await send('session.sync', { sessionId: lab.selection.sessionId, afterSeq: -1 })
    const actual = { environment: lab.binding.services.environment, owner: initial.header.id, receipt, promptCalls: lab.host.promptCalls,
      rich: { receipt: action, duplicateIdentical: JSON.stringify(action) === JSON.stringify(duplicate), state: status.state, admittedActions: lab.host.desktop.admittedActions },
      cancelled, finalTask: final.records.at(-1).event.data.state, approvalDisplayOnly: (await send('approval.list', { sessionId: lab.selection.sessionId })).length }
    assert.deepEqual(actual, JSON.parse(await readFile('tests/fixtures/phase30-profile-binding.expected.json', 'utf8')))
  } finally { await adapter.close(); await lab.binding.release() }
  assert.equal(lab.host.mountCount, 0); assert.equal(lab.host.activeFollows, 0)
})

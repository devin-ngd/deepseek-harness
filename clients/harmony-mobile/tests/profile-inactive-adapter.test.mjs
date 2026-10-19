/** Source-only synthetic workflow and caller-owned Cordis scope/effect tests; no app/profile registration or transport. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { InactiveProfileAdapter, resolveInactiveProfile, inactiveProfileCodec, PROFILE_RPC_CODEC, FollowJournal, Context, scopeTarget } from '../.build/phase31-adapter.js'
import { SyntheticHost } from '../.build/host-fixture.js'
import { SyntheticPendingApprovals } from '../.build/profile-binding-fixture.js'
import { MockDeviceRegistry, MOBILE_LINK_PROTOCOL, LinkError } from '../.build/link-protocol.js'
import { MemoryAdmissionJournal } from '../.build/admission-journal.js'
import { PROFILE_CAPABILITIES } from '../.build/profile-capabilities.js'
import { id } from '../.build/protocol.js'

const code = expected => error => error.code === expected
const allOperations = ['task.submit', 'task.receipt', 'session.sync', 'session.cancel', 'rich.mount', 'rich.invoke', 'rich.status', 'rich.dispose', 'approval.list']
function setup(options = {}) {
  let now = 1000, sequence = 0, peerReads = 0
  const clock = () => now, sid = id('mock-session-a'), desktopId = id('mock-desktop'), deviceId = id('phase31-phone'), generation = id(options.generation ?? 'phase31-generation-1')
  const journal = new FollowJournal(sid, { clock, ttlMs: 2000, maxFrames: 128, maxBytes: 1048576, maxFrameBytes: 131072 })
  const publisher = options.publisher ?? { journal }; publisher.journal = journal
  const host = options.host ?? new SyntheticHost({ sessionFormatVersion: 4, clock, publish: (sessionId, frame) => publisher.journal.publish(sessionId, frame), beforePrompt: async () => {}, losePromptReply: () => options.losePrompt === true })
  const registry = new MockDeviceRegistry('mock', clock)
  registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sid], operations: allOperations, expiresAt: 3000, revoked: false })
  const selection = { desktopId, profileId: id('phase31-profile'), generation, deviceId, grantEpoch: 1, sessionId: sid }
  let peer = { kind: 'synthetic-device', ...selection, sessions: [sid], capabilities: [...PROFILE_CAPABILITIES], expiresAt: 3000, revoked: false }
  const approvals = new SyntheticPendingApprovals(clock, []), observed = []
  const revisions = Object.fromEntries(PROFILE_CAPABILITIES.map(name => [name, 'fixture-ports/1']))
  const requirements = { protocols: { command: MOBILE_LINK_PROTOCOL, wire: 'dsh-mobile-wire/1', richGuest: 'lumina-rich/1' },
    capabilities: Object.fromEntries(PROFILE_CAPABILITIES.map(name => [name, { revision: revisions[name], required: name !== 'approval.respond' }])) }
  const dependencies = { spec: resolveInactiveProfile(options.request ?? { enabled: true }),
    advertisement: { schema: 'dsh-mobile-profile-capabilities/1', desktopId, profileId: selection.profileId, generation, protocols: requirements.protocols, capabilities: revisions }, requirements,
    host: { environment: 'synthetic-only', session: host.session, rich: host.rich, approvals }, binding: { selection, peer: () => { peerReads++; return peer }, clock, nativeSource: {} },
    registry, admission: options.admission ?? new MemoryAdmissionJournal(64), limits: { clock, maxPacketBytes: 131072, maxCommandTtlMs: 1000, maxCachedCommands: 64, maxMountedBlocks: 4 },
    journal, instance: id(options.instance ?? 'phase31-wire-1'), maxEnvelopeBytes: 200000, maxScopedListeners: 1,
    observe: view => { observed.push(view); if (options.observerThrows) throw new Error('Synthetic presentation unavailable') },
  }
  const adapter = options.unconstructed ? null : new InactiveProfileAdapter(dependencies)
  const packet = (operation, payload) => JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1,
    commandId: (options.instance ?? 'phase31-wire-1') + '-command-' + ++sequence, expiresAt: 1500, operation, payload })
  const argument = (operation, payload) => ({ version: PROFILE_RPC_CODEC, packet: packet(operation, payload) })
  return { adapter, dependencies, host, approvals, registry, journal, publisher, observed, sid, selection,
    argument, packet, setPeer: update => { peer = { ...peer, ...update } }, elapse: amount => { now += amount }, peerReads: () => peerReads }
}
const signal = () => new AbortController().signal
const send = (lab, operation, payload) => lab.adapter.request(lab.argument(operation, payload), signal())
const mountPayload = lab => ({ ...lab.host.desktop.snapshotFor(lab.sid).scope, guestProtocol: 'lumina-rich/1' })
async function mounted(lab) { const payload = mountPayload(lab); delete payload.renderRevision; return send(lab, 'rich.mount', payload) }
function intent(mount) { return { mountId: mount.mountId, actionId: 'phase31-action-1', actionName: 'submit', targetActionId: null,
  expectedDataRevision: mount.snapshot.dataRevision, values: { title: 'Original synthetic intent', count: '8' }, fileGrants: [],
  draft: { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: mount.snapshot.manifest.stateSchemaVersion,
    fields: { title: 'Original synthetic intent', count: '8' }, dirty: ['title', 'count'] } } }
async function attach(lab, agent = { id: lab.sid }) {
  const ctx = new Context()
  const owner = ctx.plugin(inner => { lab.adapter.attach(inner, agent) })
  await owner
  let delegated = 0
  ctx.on('approval/request', async () => { delegated++; return 'rejected' })
  return { ctx, owner, agent, ask: async (key = agent, requestAgent = agent, extra = {}) => ctx.waterfall(scopeTarget(key, key), 'approval/request', { agent: requestAgent, toolName: 'synthetic_tool', ...extra }, () => Promise.resolve('unavailable')), delegated: () => delegated }
}

test('omitted enable stays disabled without peer access, service dispatch or scoped registrations', async () => {
  const lab = setup({ request: {} })
  assert.deepEqual(resolveInactiveProfile({}), { enabled: false })
  assert.deepEqual(lab.adapter.metadata(), { enabled: false, codec: PROFILE_RPC_CODEC, advertisement: null })
  assert.equal(lab.adapter.attach({}, { id: lab.sid }), false)
  await assert.rejects(send(lab, 'task.submit', { sessionId: lab.sid, requestId: 'disabled', text: 'Synthetic' }), code('adapter-disabled'))
  assert.equal(lab.peerReads(), 0); assert.equal(lab.host.promptCalls, 0); assert.equal(lab.adapter.diagnostics.attachedScopes, 0)
  await lab.adapter.close()
})

test('metadata never advertises an approval reply owner; required approval or mismatched protocol rejects construction', async () => {
  const lab = setup()
  const value = lab.adapter.metadata(); assert.equal(value.enabled, true); assert.equal(Object.hasOwn(value.advertisement.capabilities, 'approval.respond'), false)
  delete value.advertisement.capabilities['session.cancel']; assert.equal(lab.adapter.metadata().advertisement.capabilities['session.cancel'], 'fixture-ports/1')
  const absent = setup({ unconstructed: true }); absent.dependencies.requirements.capabilities['approval.respond'].required = true
  assert.throws(() => new InactiveProfileAdapter(absent.dependencies), code('capability-missing'))
  const wrong = setup({ unconstructed: true }); wrong.dependencies.advertisement = { ...wrong.dependencies.advertisement, protocols: { ...wrong.dependencies.requirements.protocols, wire: 'future' } }
  assert.throws(() => new InactiveProfileAdapter(wrong.dependencies), code('protocol-mismatch'))
  await lab.adapter.close()
})

test('the strict Typert codec rejects unknown versions, extra fields, oversized arguments and malformed packets before owners', async () => {
  const codec = inactiveProfileCodec(4096), valid = { version: PROFILE_RPC_CODEC, packet: '{}' }
  assert.equal(codec.descriptor.mode, 'strict'); assert.deepEqual(codec.descriptor.create().parse(valid), valid)
  assert.throws(() => codec.schema.parse({ ...valid, version: 'future' }), code('codec-version'))
  for (const value of [null, { ...valid, extra: true }, { ...valid, packet: 1 }, { ...valid, packet: 'x'.repeat(5000) }]) assert.throws(() => codec.schema.parse(value), code('codec-invalid'))
  const lab = setup()
  await assert.rejects(lab.adapter.request({ ...valid, version: 'future' }, signal()), code('codec-version'))
  await assert.rejects(lab.adapter.request(valid, signal()), code('invalid-packet'))
  assert.equal(lab.host.promptCalls, 0); await lab.adapter.close()
})

test('current peer scope, grant epoch and generation are checked again after source construction', async () => {
  for (const [update, expected] of [[{ kind: 'operator' }, 'operator-not-device'], [{ grantEpoch: 2 }, 'scope-denied'], [{ generation: 'later' }, 'generation-changed'], [{ revoked: true }, 'grant-revoked'], [{ expiresAt: 1000 }, 'grant-expired']]) {
    const lab = setup(); lab.setPeer(update)
    await assert.rejects(send(lab, 'task.submit', { sessionId: lab.sid, requestId: 'denied', text: 'Synthetic' }), code(expected))
    assert.equal(await lab.dependencies.admission.get(lab.sid, 'denied'), undefined)
    assert.equal(lab.host.promptCalls, 0)
    await assert.rejects(send(lab, 'session.cancel', { sessionId: lab.sid }), code(expected))
    await lab.adapter.close()
  }
})

test('the scoped observer sees only its original fake Agent and always delegates the approval waterfall', async () => {
  const lab = setup(), scope = await attach(lab)
  try {
    assert.equal(await scope.ask(), 'rejected'); assert.equal(lab.observed.length, 1); assert.equal(scope.delegated(), 1)
    assert.equal(await scope.ask({ id: 'foreign-agent' }), 'rejected'); assert.equal(lab.observed.length, 1)
    assert.equal(await scope.ask(scope.agent, { id: 'foreign-agent' }), 'rejected'); assert.equal(lab.observed.length, 1); assert.equal(lab.adapter.diagnostics.scopeDrops, 1)
    const abort = new AbortController(); abort.abort()
    await scope.ask(scope.agent, scope.agent, { signal: abort.signal }); assert.equal(lab.observed.length, 1)
    assert.equal(lab.approvals.decisions, 0); assert.equal(lab.host.promptCalls, 0)
  } finally { await lab.adapter.close(); await scope.owner.dispose() }
  assert.equal(lab.adapter.diagnostics.attachedScopes, 0)
})

test('observer exceptions and changed device scope do not starve next or grant approval', async () => {
  const lab = setup({ observerThrows: true }), scope = await attach(lab)
  try {
    assert.equal(await scope.ask(), 'rejected'); assert.equal(lab.adapter.diagnostics.observerFailures, 1)
    lab.setPeer({ capabilities: [] }); assert.equal(await scope.ask(), 'rejected'); assert.equal(lab.observed.length, 1); assert.equal(lab.adapter.diagnostics.scopeDrops, 1)
    assert.equal(scope.delegated(), 2); assert.equal(lab.approvals.decisions, 0)
  } finally { await lab.adapter.close(); await scope.owner.dispose() }
})

test('device revocation closes scoped listeners and owned mounts; later calls cannot reenable the source', async () => {
  const lab = setup(), scope = await attach(lab)
  await mounted(lab); assert.equal(lab.host.mountCount, 1)
  await lab.registry.revoke(lab.selection.deviceId)
  assert.equal(lab.adapter.diagnostics.closed, true); assert.equal(lab.adapter.diagnostics.attachedScopes, 0); assert.equal(lab.host.mountCount, 0)
  assert.equal(await scope.ask(), 'rejected'); assert.equal(lab.observed.length, 0)
  await assert.rejects(send(lab, 'session.cancel', { sessionId: lab.sid }), code('adapter-closed'))
  assert.equal(lab.adapter.metadata().advertisement, null); await scope.owner.dispose()
})

test('owner effect disposal removes listeners and prevents later calls through the closed adapter', async () => {
  const lab = setup(), scope = await attach(lab)
  await scope.owner.dispose(); assert.equal(lab.adapter.diagnostics.attachedScopes, 0)
  assert.equal(await scope.ask(), 'rejected'); assert.equal(lab.observed.length, 0)
  await assert.rejects(send(lab, 'session.cancel', { sessionId: lab.sid }), code('adapter-closed'))
  await lab.adapter.close()
})

test('approval response remains explicitly refused through the versioned JSON wrapper', async () => {
  const lab = setup()
  await assert.rejects(send(lab, 'approval.respond', { sessionId: lab.sid, pendingId: 'not-a-permit', decision: 'allowed-once' }), code('scope-denied'))
  assert.equal(lab.approvals.responses, 0); assert.equal(lab.approvals.decisions, 0); await lab.adapter.close()
})

test('shared BFF follow carries reset and retained frames and caller cancellation does not dispatch a task', async () => {
  const lab = setup(), controller = new AbortController()
  const iterator = lab.adapter.follow(lab.argument('session.sync', { sessionId: lab.sid, afterSeq: -1 }), { instance: null, relayCursor: -1 }, controller.signal)[Symbol.asyncIterator]()
  try {
    const reset = (await iterator.next()).value; assert.equal(reset.kind, 'reset'); assert.equal(reset.sessionId, lab.sid)
    await send(lab, 'task.submit', { sessionId: lab.sid, requestId: 'stream-request', text: 'Synthetic stream' })
    const event = (await iterator.next()).value; assert.equal(event.kind, 'event'); assert.equal(event.instance, 'phase31-wire-1')
    controller.abort(); assert.equal(lab.host.promptCalls, 1)
  } finally { await iterator.return(); await lab.adapter.close() }
  assert.equal(lab.host.activeFollows, 0)
})

test('closed source wakes an awaiting follow and leaves no active canonical snapshot reader', async () => {
  const lab = setup(), iterator = lab.adapter.follow(lab.argument('session.sync', { sessionId: lab.sid, afterSeq: -1 }), { instance: null, relayCursor: -1 }, signal())[Symbol.asyncIterator]()
  await iterator.next()
  const next = iterator.next(), failed = assert.rejects(next, code('closed'))
  await lab.adapter.close(); await failed; await iterator.return()
  assert.equal(lab.host.activeFollows, 0); assert.equal(lab.adapter.diagnostics.attachedScopes, 0)
})

test('JSON device claims and foreign Session ids cannot create an admission record or reach a canonical owner', async () => {
  const lab = setup()
  const argument = lab.argument('task.submit', { sessionId: lab.sid, requestId: 'foreign-claim', text: 'Synthetic' })
  const command = JSON.parse(argument.packet); command.deviceId = 'another-device'
  await assert.rejects(lab.adapter.request({ ...argument, packet: JSON.stringify(command) }, signal()), code('scope-denied'))
  await assert.rejects(send(lab, 'task.submit', { sessionId: 'mock-session-b', requestId: 'foreign-claim', text: 'Synthetic' }), code('scope-denied'))
  assert.equal(await lab.dependencies.admission.get(lab.sid, 'foreign-claim'), undefined)
  assert.equal(lab.host.promptCalls, 0); await lab.adapter.close()
})

test('lost receipt, reopen, duplicate rich action and cancel remain on the original synthetic Session', async () => {
  const first = setup({ losePrompt: true }), request = { sessionId: first.sid, requestId: 'phase31-request', text: 'Original synthetic task' }
  await assert.rejects(send(first, 'task.submit', request), code('unknown-outcome'))
  const mount = await mounted(first), originalIntent = intent(mount), receipt = await send(first, 'rich.invoke', originalIntent)
  await first.adapter.close()
  const second = setup({ host: first.host, publisher: first.publisher, admission: first.dependencies.admission, generation: 'phase31-generation-2', instance: 'phase31-wire-2' })
  try {
    const reconciled = await send(second, 'task.submit', request)
    const reopened = await mounted(second), duplicate = await send(second, 'rich.invoke', { ...originalIntent, mountId: reopened.mountId })
    const status = await send(second, 'rich.status', { mountId: reopened.mountId, actionId: originalIntent.actionId })
    const cancel = await send(second, 'session.cancel', { sessionId: second.sid })
    const reset = await send(second, 'session.sync', { sessionId: second.sid, afterSeq: -1 })
    const actual = { owner: reset.header.id, promptCalls: first.host.promptCalls, reconciled, actionAdmissions: first.host.desktop.admittedActions,
      duplicateReceipt: JSON.stringify(receipt) === JSON.stringify(duplicate), actionState: status.state, cancel, finalTask: reset.records.at(-1).event.data.state,
      responseAdvertised: Object.hasOwn(second.adapter.metadata().advertisement.capabilities, 'approval.respond'), generation: second.adapter.metadata().advertisement.generation }
    assert.deepEqual(actual, JSON.parse(await readFile('tests/fixtures/phase31-inactive-profile.expected.json', 'utf8')))
  } finally { await second.adapter.close() }
  assert.equal(first.host.mountCount, 0); assert.equal(first.host.activeFollows, 0)
})

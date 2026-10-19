/** Synthetic lifecycle evidence only; no production model or desktop connection. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MockDesktop } from '../.build/mock.js'
import { MobileProjection } from '../.build/projection.js'
import { GuestGate } from '../.build/bridge.js'
import { parseInvokeRequest } from '../.build/upstream-validate.js'

const request = (desktop, sessionId = desktop.sessions[0].sessionId, requestId = 'phone-request-1') => ({
  protocol: 'dsh-mobile-lab/1', desktopId: desktop.desktopId, sessionId, requestId, scenario: 'rich-form', text: '固定合成流程',
})
const invoke = (mount, actionId = 'action-1') => ({ mountId: mount.mountId, actionId, actionName: 'submit',
  targetActionId: null, expectedDataRevision: mount.snapshot.dataRevision,
  values: { title: '手机草稿', count: '4' }, fileGrants: [],
  draft: { baseRevision: mount.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: { title: '手机草稿', count: '4' }, dirty: ['title', 'count'] },
})
const packet = (mount, payload, type = 'action.invoke', seq = 1, packetId = 'packet-1') => JSON.stringify({
  protocol: 'lumina-rich/1', mountId: mount.mountId, renderRevision: mount.snapshot.scope.renderRevision,
  seq, packetId, type, payload,
})
const code = expected => error => error.code === expected

test('real dispatch choices and extra authorization fields fail before admission', () => {
  for (const mode of ['real', 'glm', 'replay-to-live', '', undefined]) assert.throws(() => new MockDesktop(mode), code('mock-only'))
  const desktop = new MockDesktop('mock')
  for (const patch of [{ endpoint: 'shell/execute' }, { token: 'not-a-credential' }, { desktopId: 'another' }, { scenario: 'shell' }, { sessionId: '../../real-session' }]) {
    assert.throws(() => desktop.prompt({ ...request(desktop), ...patch }), code('invalid-request'))
  }
  assert.equal(desktop.admittedTasks, 0)
})

test('lost receipt is reconciled without dispatch and identical retry keeps one task', () => {
  const desktop = new MockDesktop('mock'), input = request(desktop)
  const receipt = desktop.prompt(input)
  assert.deepEqual(desktop.receipt(input.sessionId, input.requestId), receipt)
  assert.deepEqual(desktop.prompt({ text: input.text, ...input }), receipt)
  assert.throws(() => desktop.prompt({ ...input, text: 'changed' }), code('id-conflict'))
  assert.equal(desktop.admittedTasks, 1)
  assert.equal(receipt.state, 'queued')
})

test('phone disconnect preserves desktop progress; replay and history do not rerun tasks', () => {
  const desktop = new MockDesktop('mock'), input = request(desktop)
  const view = new MobileProjection(desktop.desktopId, input.sessionId)
  desktop.prompt(input)
  for (const frame of desktop.replay(input.sessionId, view.cursor)) view.accept(frame)
  view.acceptLive({ desktopId: desktop.desktopId, sessionId: input.sessionId, attemptId: 'attempt-1', index: 0, text: '正在' })
  assert.equal(view.liveText, '正在')
  view.disconnect()
  desktop.advance(input.sessionId, input.requestId)
  desktop.advance(input.sessionId, input.requestId)
  for (const frame of desktop.replay(input.sessionId, view.cursor)) view.accept(frame)
  const reopened = new MobileProjection(desktop.desktopId, input.sessionId)
  reopened.baseline(desktop.replay(input.sessionId, -1))
  assert.deepEqual(reopened.history, view.history)
  assert.equal(view.history.at(-1).event.state, 'completed')
  assert.equal(view.liveText, '')
  assert.equal(desktop.admittedTasks, 1)
  assert.equal(desktop.replay(desktop.sessions[1].sessionId, -1).length, 0)
})

test('journal duplicate is ignored; mismatch, foreign session and sequence gaps stop the affected projection', () => {
  const desktop = new MockDesktop('mock'), input = request(desktop)
  desktop.prompt(input); desktop.advance(input.sessionId, input.requestId)
  const frames = desktop.replay(input.sessionId, -1)
  const view = new MobileProjection(desktop.desktopId, input.sessionId)
  assert.equal(view.accept(frames[0]), true)
  assert.equal(view.accept(structuredClone(frames[0])), false)
  assert.throws(() => view.accept({ ...frames[1], seq: 3 }), code('sequence-gap'))
  assert.equal(view.cursor, 0)
  assert.throws(() => view.accept(frames[1]), code('sequence-gap'))
  view.baseline(frames)
  assert.throws(() => view.accept({ ...frames[0], event: { ...frames[0].event, state: 'cancelled' } }), code('frame-conflict'))
  assert.throws(() => view.baseline([{ ...frames[0], sessionId: desktop.sessions[1].sessionId }]), code('scope-mismatch'))
  assert.equal(view.cursor, 1)
})

test('live chunks deduplicate and committed message removes transient output', () => {
  const desktop = new MockDesktop('mock'), input = request(desktop)
  const view = new MobileProjection(desktop.desktopId, input.sessionId)
  const chunk = { desktopId: desktop.desktopId, sessionId: input.sessionId, attemptId: 'a', index: 0, text: '流式' }
  assert.equal(view.acceptLive(chunk), true); assert.equal(view.acceptLive(chunk), false)
  assert.throws(() => view.acceptLive({ ...chunk, index: 2 }), code('sequence-gap'))
  assert.equal(view.liveText, '')
  view.acceptLive(chunk)
  view.accept({ desktopId: desktop.desktopId, sessionId: input.sessionId, seq: 0, event: { kind: 'text', messageId: 'm', text: '完整' } })
  assert.equal(view.liveText, '')
})

test('draft CAS preserves confirmed input on conflict and remount restores edits', () => {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[0].sessionId, mount = desktop.mount(sid)
  const save = { mountId: mount.mountId, draft: invoke(mount).draft }
  const receipt = desktop.saveDraft(save)
  assert.equal(receipt.accepted, true)
  const before = desktop.snapshotFor(sid)
  assert.equal(desktop.saveDraft({ ...save, draft: { ...save.draft, fields: { title: 'stale' } } }).code, 'DRAFT_CONFLICT')
  assert.deepEqual(desktop.snapshotFor(sid), before)
  desktop.dispose(mount.mountId)
  const reopened = desktop.mount(sid)
  assert.notEqual(reopened.mountId, mount.mountId)
  assert.deepEqual(reopened.snapshot.draft.fields, save.draft.fields)
  assert.throws(() => desktop.saveDraft(save), code('stale-lease'))
})

test('rich submit, independent completion, original receipt and action status survive remount without rerun', () => {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[0].sessionId, mount = desktop.mount(sid)
  const input = invoke(mount)
  assert.ok(parseInvokeRequest({ ...input, sessionId: sid }))
  const receipt = desktop.invoke(input)
  assert.equal(receipt.state, 'accepted')
  assert.equal(desktop.status(mount.mountId, input.actionId).terminal, false)
  desktop.completeAction(mount.mountId, input.actionId)
  assert.equal(desktop.status(mount.mountId, input.actionId).state, 'completed')
  const reopened = desktop.mount(sid)
  assert.deepEqual(desktop.invoke({ ...input, mountId: reopened.mountId }), receipt)
  assert.equal(desktop.admittedActions, 1)
  assert.equal(desktop.invoke({ ...input, values: { title: 'different' } }).code, 'ACTION_ID_CONFLICT')
  assert.equal(reopened.snapshot.dataRevision, 2)
  assert.equal(reopened.snapshot.manifest.renderRevision, 1)
})

test('inherited read-only blocks admit no drafts, actions or file grants', () => {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[1].sessionId
  desktop.setInheritedReadOnly(sid)
  const mount = desktop.mount(sid)
  assert.equal(mount.snapshot.readOnly, true)
  assert.deepEqual(mount.snapshot.actions, [])
  assert.throws(() => desktop.invoke(invoke(mount)), code('forbidden'))
  assert.throws(() => desktop.saveDraft({ mountId: mount.mountId, draft: invoke(mount).draft }), code('forbidden'))
  assert.equal(desktop.admittedActions, 0)
})

test('completion uses originally submitted values while later drafts remain editable', () => {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[0].sessionId, mount = desktop.mount(sid), input = invoke(mount)
  desktop.invoke(input)
  const current = desktop.snapshotFor(sid)
  assert.equal(desktop.saveDraft({ mountId: mount.mountId, draft: { baseRevision: current.draft.draftRevision,
    stateSchemaVersion: 1, fields: { title: '下一次编辑' }, dirty: ['title'] } }).accepted, true)
  const latest = desktop.mount(sid)
  assert.equal(desktop.invoke(invoke(latest, 'action-2')).code, 'BUSY')
  desktop.completeAction(mount.mountId, input.actionId)
  const result = desktop.snapshotFor(sid)
  assert.deepEqual(result.actions[0].values, input.values)
  assert.equal(result.draft.fields.title, '下一次编辑')
  assert.equal(desktop.admittedActions, 1)
})

test('guest source, lease, revision, allowlist and canonical payload validation reject host access', () => {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[0].sessionId, mount = desktop.mount(sid), source = {}
  const gate = new GuestGate(desktop, { source, sessionId: mount.snapshot.scope.sessionId, mountId: mount.mountId, renderRevision: 1, packetBytes: 131072, maxPackets: 8 })
  const { mountId, ...payload } = invoke(mount)
  assert.throws(() => gate.receive(packet(mount, payload), {}), code('scope-mismatch'))
  assert.throws(() => gate.receive(packet(mount, { ...payload, sessionId: desktop.sessions[1].sessionId }), source), code('invalid-request'))
  assert.throws(() => gate.receive(packet(mount, { ...payload, mountId }), source), code('invalid-request'))
  assert.throws(() => gate.receive(packet(mount, payload, 'shell.execute'), source), code('forbidden'))
  assert.throws(() => gate.receive(packet(mount, payload, 'approval.confirm'), source), code('forbidden'))
  assert.throws(() => gate.receive(packet(mount, payload, 'action.invoke', 2), source), code('sequence-gap'))
  const wrongRevision = { ...mount, snapshot: { ...mount.snapshot, scope: { ...mount.snapshot.scope, renderRevision: 2 } } }
  assert.throws(() => gate.receive(packet(wrongRevision, payload), source), code('invalid-request'))
  assert.equal(desktop.admittedActions, 0)
  const accepted = gate.receive(packet(mount, payload), source)
  assert.equal(accepted.accepted, true)
  assert.deepEqual(gate.receive(packet(mount, payload), source), accepted)
  assert.equal(desktop.admittedActions, 1)
  gate.close()
  assert.throws(() => gate.receive(packet(mount, payload), source), code('stale-lease'))
})

test('cancel records intent and fixture terminal status without starting another task', () => {
  const desktop = new MockDesktop('mock'), input = request(desktop)
  desktop.prompt(input); desktop.advance(input.sessionId, input.requestId)
  desktop.cancelTask(input.sessionId, input.requestId)
  desktop.advance(input.sessionId, input.requestId)
  const states = desktop.replay(input.sessionId, -1).map(frame => frame.event.state)
  assert.deepEqual(states, ['queued', 'running', 'cancel_requested', 'cancelled'])
  assert.equal(desktop.admittedTasks, 1)
})

test('malformed and oversized guest JSON, dangerous value keys and new file grants are refused', () => {
  const desktop = new MockDesktop('mock'), mount = desktop.mount(desktop.sessions[0].sessionId), source = {}
  const gate = new GuestGate(desktop, { source, sessionId: mount.snapshot.scope.sessionId, mountId: mount.mountId, renderRevision: 1, packetBytes: 131072, maxPackets: 8 })
  assert.throws(() => gate.receive('{', source), code('invalid-request'))
  assert.throws(() => gate.receive('汉'.repeat(50000), source), code('invalid-request'))
  const { mountId: _mountId, ...payload } = invoke(mount)
  assert.throws(() => gate.receive(packet(mount, { ...payload, values: JSON.parse('{"__proto__":{"x":1}}') }), source), code('invalid-request'))
  assert.throws(() => gate.receive(packet(mount, { ...payload, fileGrants: ['new-grant'] }), source), code('forbidden'))
  assert.equal(desktop.admittedActions, 0)
})

/** End-to-end memory transport evidence. These cases do not qualify WAN, HAP, ArkWeb or real DSH composition. */
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { createLinkLab } from './helpers/link-lab.mjs'
import { MockOutboundRelay } from '../.build/relay.js'
import { MockDeviceRegistry, parseCommand } from '../.build/link-protocol.js'
import { CanonicalPhoneProjection } from '../.build/phone.js'
import { RelayGuestGate } from '../.build/relay-guest.js'
import { guestSdk } from '../.build/upstream-guest-sdk.js'

const code = expected => error => error.code === expected
const submit = (lab, requestId = 'request-1', text = '合成任务') => lab.phone.request('task.submit', { sessionId: lab.sid, requestId, text })
function mountPayload(lab) {
  const { sessionId, messageId, blockId } = lab.host.desktop.snapshotFor(lab.sid).scope
  return { sessionId, messageId, blockId, guestProtocol: 'lumina-rich/1' }
}
function draft(snapshot, fields) {
  return { baseRevision: snapshot.draft.draftRevision, stateSchemaVersion: snapshot.manifest.stateSchemaVersion, fields, dirty: Object.keys(fields) }
}
function invoke(mounted, actionId, values = { title: '最终输入', count: '8' }) {
  return { mountId: mounted.mountId, actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: mounted.snapshot.dataRevision,
    values, fileGrants: [], draft: draft(mounted.snapshot, values) }
}

test('phone submit, desktop stream and background completion return to the original session without reexecution', async () => {
  const lab = createLinkLab()
  try {
    await lab.phone.sync(lab.sid)
    assert.equal((await submit(lab)).accepted, true)
    lab.phone.poll(lab.sid)
    lab.host.advance(lab.sid)
    lab.host.stream(lab.sid, { type: 'start', attemptId: 'attempt-fixture', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 })
    lab.host.stream(lab.sid, { type: 'chunk', attemptId: 'attempt-fixture', revision: 2, index: 0, time: lab.clock(), chunk: { text: '合成流' } })
    const suffix = lab.phone.poll(lab.sid)
    suffix.forEach(packet => lab.phone.projection(lab.sid).apply(packet.frame))
    assert.equal(lab.phone.projection(lab.sid).liveAttempt.nextIndex, 1)
    lab.phone.setForeground(false)
    await assert.rejects(submit(lab, 'background-task'), code('phone-suspended'))
    lab.host.advance(lab.sid)
    lab.host.stream(lab.sid, { type: 'end', attemptId: 'attempt-fixture', revision: 3, index: 1, outcome: { kind: 'abandoned' } })
    assert.equal(lab.host.cancelCalls, 0)
    lab.phone.setForeground(true)
    const view = await lab.phone.sync(lab.sid)
    assert.equal(view.events.at(-1).data.state, 'completed')
    assert.equal(view.liveAttempt, undefined)
    await submit(lab)
    assert.equal(lab.host.promptCalls, 1)
    assert.equal(lab.host.desktop.admittedTasks, 1)
    assert.equal(lab.host.desktop.replay(lab.other, -1).length, 0)
    assert.equal(lab.host.activeFollows, 0)
  } finally { await lab.close() }
})

test('whole-session cancellation is forwarded once for a duplicate transport command', async () => {
  const lab = createLinkLab()
  try {
    await submit(lab); lab.host.advance(lab.sid)
    const command = lab.phone.command('session.cancel', { sessionId: lab.sid })
    await Promise.all([lab.relay.request(lab.peer, command), lab.relay.request(lab.peer, command)])
    assert.equal(lab.host.cancelCalls, 1)
    assert.equal((await lab.phone.sync(lab.sid)).events.at(-1).data.state, 'cancelled')
  } finally { await lab.close() }
})

test('canonical guest SDK saves latest input, submits over relay and reads completion after history reopen', async () => {
  const lab = createLinkLab(), errors = []
  let gate, deliver
  try {
    const mounted = await lab.phone.request('rich.mount', mountPayload(lab)), source = {}
    gate = new RelayGuestGate(lab.phone, { source, sessionId: mounted.snapshot.scope.sessionId, mountId: mounted.mountId, renderRevision: 1, packetBytes: 131072, maxPackets: 64 })
    let listener, hostSeq = 0
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, setTimeout, clearTimeout, performance,
      ResizeObserver: class { observe() {} }, CustomEvent: class {},
      document: { body: {}, querySelector: () => ({ scrollHeight: 120, getBoundingClientRect: () => ({ height: 120 }) }), documentElement: { style: { setProperty() {} } } },
      richGuest: { subscribe(callback) { listener = callback; return () => { listener = null } }, send(packet) {
        void gate.receive(JSON.stringify(packet), source).then(result => {
          if (['draft.save', 'action.invoke', 'action.status'].includes(packet.type)) deliver('result', {
            requestId: packet.packetId, ...(packet.type === 'action.status' ? { result } : { receipt: result }) })
        }).catch(error => errors.push(error))
      } }, dispatchEvent() {}, addEventListener() {},
    })
    deliver = (type, payload) => listener?.({ protocol: 'lumina-rich/1', mountId: mounted.mountId, renderRevision: 1,
      seq: ++hostSeq, packetId: 'host-' + hostSeq, type, payload })
    vm.runInContext('window = globalThis', context)
    vm.runInContext(guestSdk(mounted.mountId, 1), context, { timeout: 1000 })
    deliver('init', { snapshot: mounted.snapshot })
    vm.runInContext("rich.setDraft({title:'最后一次输入',count:'9'})", context)
    const receipt = await vm.runInContext('rich.submit()', context)
    assert.equal(receipt.accepted, true)
    lab.host.completeAction(lab.sid, receipt.actionId)
    deliver('snapshot', { snapshot: lab.host.desktop.snapshotFor(lab.sid) })
    const status = await vm.runInContext(`rich.status(${JSON.stringify(receipt.actionId)})`, context)
    assert.equal(status.state, 'completed')
    assert.deepEqual(status.values, { title: '最后一次输入', count: '9' })
    assert.equal(lab.host.desktop.admittedActions, 1)
    deliver('dispose', {}); await gate.close(); gate = null
    const reopened = await lab.phone.request('rich.mount', mountPayload(lab))
    assert.notEqual(reopened.mountId, mounted.mountId)
    assert.equal(reopened.snapshot.draft.fields.title, '最后一次输入')
    assert.equal((await lab.phone.request('rich.status', { mountId: reopened.mountId, actionId: receipt.actionId })).state, 'completed')
    assert.equal(lab.host.desktop.admittedActions, 1)
    assert.equal(errors.length, 0)
  } finally { deliver?.('dispose', {}); if (gate) await gate.close(); await lab.close() }
})

test('rich doubleclick and original action retry across mounts admit once; later drafts survive completion', async () => {
  const lab = createLinkLab()
  try {
    const mounted = await lab.phone.request('rich.mount', mountPayload(lab)), intent = invoke(mounted, 'action-1')
    const receipts = await Promise.all([lab.phone.request('rich.invoke', intent), lab.phone.request('rich.invoke', intent)])
    assert.deepEqual(receipts[0], receipts[1]); assert.equal(lab.host.desktop.admittedActions, 1)
    const current = await lab.phone.request('rich.snapshot', { mountId: mounted.mountId })
    const busy = await lab.phone.request('rich.invoke', invoke({ ...mounted, snapshot: current }, 'action-2'))
    assert.equal(busy.code, 'BUSY')
    await lab.phone.request('rich.saveDraft', { mountId: mounted.mountId, draft: draft(current, { title: '下一份草稿' }) })
    lab.host.completeAction(lab.sid, 'action-1')
    await lab.phone.request('rich.dispose', { mountId: mounted.mountId })
    const reopened = await lab.phone.request('rich.mount', mountPayload(lab))
    assert.deepEqual(await lab.phone.request('rich.invoke', { ...intent, mountId: reopened.mountId }), receipts[0])
    assert.equal(reopened.snapshot.draft.fields.title, '下一份草稿')
    assert.equal(reopened.snapshot.values.title, '最终输入')
    assert.equal(lab.host.desktop.admittedActions, 1)
    assert.equal((await lab.phone.request('rich.invoke', { ...intent, mountId: reopened.mountId, values: { changed: true } })).code, 'ACTION_ID_CONFLICT')
  } finally { await lab.close() }
})

test('lost host admission receipt resolves by read-only lookup, without second prompt call', async () => {
  const lab = createLinkLab({ losePromptReply: () => true })
  try {
    await assert.rejects(submit(lab), code('unknown-outcome'))
    assert.equal((await lab.phone.request('task.receipt', { sessionId: lab.sid, requestId: 'request-1' })).accepted, true)
    await submit(lab)
    assert.equal(lab.host.promptCalls, 1)
    await assert.rejects(submit(lab, 'request-1', '冲突内容'), code('id-conflict'))
  } finally { await lab.close() }
})

test('unknown outcome without admission evidence remains unknown and never triggers automatic resubmission', async () => {
  const lab = createLinkLab({ beforePrompt: async () => { throw new Error('synthetic admission failure') } })
  try {
    await assert.rejects(submit(lab), code('unknown-outcome'))
    assert.equal((await submit(lab)).state, 'unknown')
    assert.equal(lab.host.promptCalls, 1); assert.equal(lab.host.desktop.admittedTasks, 0)
  } finally { await lab.close() }
})

test('phone disconnect after dispatch loses response but desktop receipt prevents reexecution', async () => {
  let resume, entered
  const started = new Promise(resolve => { entered = resolve })
  const lab = createLinkLab({ beforePrompt: async () => { entered(); await new Promise(resolve => { resume = resolve }) } })
  try {
    const operation = submit(lab)
    await started; lab.phone.setForeground(false); resume()
    await assert.rejects(operation, code('transport-lost'))
    lab.phone.setForeground(true)
    assert.equal((await lab.phone.request('task.receipt', { sessionId: lab.sid, requestId: 'request-1' })).accepted, true)
    await submit(lab); assert.equal(lab.host.promptCalls, 1)
  } finally { await lab.close() }
})

test('desktop offline fails before dispatch and reconnect does not drain a hidden task queue', async () => {
  const lab = createLinkLab()
  try {
    lab.relay.detachDesktop()
    await assert.rejects(submit(lab), code('desktop-offline'))
    lab.relay.attachDesktop(lab.adapter)
    assert.equal(lab.host.promptCalls, 0)
    await submit(lab); assert.equal(lab.host.promptCalls, 1)
  } finally { await lab.close() }
})

test('expired relay cursor requires a fresh snapshot, never a task retry', async () => {
  const lab = createLinkLab({ maxEvents: 2 })
  try {
    await lab.phone.sync(lab.sid); await submit(lab); lab.host.advance(lab.sid); lab.host.advance(lab.sid)
    await assert.rejects(async () => lab.phone.poll(lab.sid), code('resync-needed'))
    assert.equal((await lab.phone.sync(lab.sid)).events.at(-1).data.state, 'completed')
    lab.elapse(101)
    await lab.phone.sync(lab.sid)
    assert.equal(lab.host.promptCalls, 1)
  } finally { await lab.close() }
})

test('snapshot race preserves events published while the opening snapshot is read', async () => {
  const lab = createLinkLab()
  try {
    await submit(lab)
    const original = lab.host.session.follow
    lab.host.session.follow = async function* (...args) {
      for await (const frame of original(...args)) { lab.host.advance(lab.sid); yield frame }
    }
    const view = await lab.phone.sync(lab.sid)
    assert.equal(view.events.at(-1).data.state, 'running')
    assert.equal(lab.host.activeFollows, 0)
  } finally { await lab.close() }
})

test('revocation releases mounts, rejects stale and queued messages and does not cancel accepted desktop tasks', async () => {
  const lab = createLinkLab()
  try {
    await submit(lab); await lab.phone.request('rich.mount', mountPayload(lab))
    assert.equal(lab.host.mountCount, 1)
    await lab.registry.revoke(lab.peer.deviceId)
    assert.equal(lab.host.mountCount, 0)
    await assert.rejects(submit(lab), code('revoked'))
    assert.throws(() => lab.phone.poll(lab.sid), code('resync-needed'))
    lab.host.advance(lab.sid); lab.host.advance(lab.sid)
    assert.equal(lab.host.cancelCalls, 0)
    assert.equal(lab.host.desktop.replay(lab.sid, -1).at(-1).event.state, 'completed')
  } finally { await lab.close() }
})

test('session, peer, mount and request identities cannot cross device scope', async () => {
  const lab = createLinkLab()
  try {
    await assert.rejects(lab.phone.request('task.submit', { sessionId: lab.other, requestId: 'foreign', text: 'x' }), code('scope-denied'))
    const mounted = await lab.phone.request('rich.mount', mountPayload(lab))
    const second = lab.addPhone('mock-phone-b')
    await assert.rejects(second.request('rich.snapshot', { mountId: mounted.mountId }), code('scope-denied'))
    await submit(lab)
    await assert.rejects(second.request('task.submit', { sessionId: lab.sid, requestId: 'request-1', text: 'x' }), code('scope-denied'))
    const forged = lab.phone.command('session.cancel', { sessionId: lab.sid })
    await assert.rejects(lab.relay.request(second.peer, forged), code('scope-denied'))
    assert.equal(lab.host.promptCalls, 1); assert.equal(lab.host.cancelCalls, 0)
  } finally { await lab.close() }
})

test('guest source, publication revision and method allowlist reject escalation before host mutation', async () => {
  const lab = createLinkLab(), source = {}
  let gate
  try {
    const mounted = await lab.phone.request('rich.mount', mountPayload(lab))
    gate = new RelayGuestGate(lab.phone, { source, sessionId: mounted.snapshot.scope.sessionId, mountId: mounted.mountId, renderRevision: 1, packetBytes: 131072, maxPackets: 8 })
    const packet = { protocol: 'lumina-rich/1', mountId: mounted.mountId, renderRevision: 1, packetId: 'p1', seq: 1, type: 'ready', payload: {} }
    await assert.rejects(gate.receive(JSON.stringify(packet), {}), code('scope-mismatch'))
    await assert.rejects(gate.receive(JSON.stringify({ ...packet, renderRevision: 2 }), source), code('invalid-request'))
    await assert.rejects(gate.receive(JSON.stringify({ ...packet, type: 'approval.answer' }), source), code('forbidden'))
    await assert.rejects(gate.receive(JSON.stringify({ ...packet, type: 'shell.exec' }), source), code('forbidden'))
    await assert.rejects(gate.receive(JSON.stringify({ ...packet, payload: { mountId: 'foreign' } }), source), code('invalid-request'))
    const result = await gate.receive(JSON.stringify(packet), source)
    assert.deepEqual(await gate.receive(JSON.stringify(packet), source), result)
    await assert.rejects(gate.receive(JSON.stringify({ ...packet, type: 'resize' }), source), code('id-conflict'))
    assert.equal(lab.host.promptCalls, 0); assert.equal(lab.host.desktop.admittedActions, 0)
  } finally { if (gate) await gate.close(); await lab.close() }
})

test('expired commands and grants, unknown protocols, oversized packets and unsupported approvals fail closed', async () => {
  const lab = createLinkLab()
  try {
    const command = lab.phone.command('session.cancel', { sessionId: lab.sid })
    for (const replacement of [{ protocol: 'unknown' }, { operation: 'approval.answer' }, { operation: 'shell.exec' }, { expiresAt: lab.clock() }]) {
      await assert.rejects(lab.adapter.handle(JSON.stringify({ ...command, ...replacement })))
    }
    assert.throws(() => parseCommand('x'.repeat(131073), lab.adapter.config), code('invalid-packet'))
    const expired = lab.addPhone('mock-expired', [lab.sid], 1001)
    lab.elapse(2)
    await assert.rejects(expired.request('session.cancel', { sessionId: lab.sid }), code('grant-expired'))
    lab.host.addApproval(lab.sid, { approvalId: 'approval-fixture', revision: 1, summary: '合成审批', state: 'pending', expiresAt: 1003 })
    assert.equal((await lab.phone.request('approval.list', { sessionId: lab.sid }))[0].state, 'pending')
    lab.elapse(2)
    assert.equal((await lab.phone.request('approval.list', { sessionId: lab.sid }))[0].state, 'expired')
    assert.equal(lab.host.cancelCalls, 0)
    assert.throws(() => new MockOutboundRelay('real', lab.registry, lab.relay.config), code('mock-only'))
    assert.throws(() => new MockDeviceRegistry('real', lab.clock), code('mock-only'))
  } finally { await lab.close() }
})

test('bounded command cache expires while uncertain admission journal refuses unsafe eviction', async () => {
  const lab = createLinkLab({ maxCommands: 2 })
  try {
    await submit(lab, 'one'); await submit(lab, 'two')
    await assert.rejects(submit(lab, 'three'), code('queue-full'))
    lab.elapse(501)
    await lab.phone.request('task.receipt', { sessionId: lab.sid, requestId: 'one' })
    await assert.rejects(submit(lab, 'three'), code('queue-full'))
    assert.equal(lab.host.promptCalls, 2)
  } finally { await lab.close() }
})

test('durable gaps and conflicting live revisions stop projection until a fresh atomic opening', async () => {
  const view = new CanonicalPhoneProjection('mock-session-a', 4)
  const baseline = { type: 'snapshot', header: { id: 'mock-session-a', version: 4, createdAt: 0, isSeeded: false }, cursor: -1,
    records: [], hasMore: false, projections: { asOfSeq: -1, values: {} } }
  view.apply(baseline)
  assert.throws(() => view.apply({ type: 'event', event: { type: 'mobile-lab/fixture', seq: 2, time: 0, data: {}, ignorable: true } }), code('resync-needed'))
  assert.equal(view.cursor, -1)
  view.apply(baseline)
  const start = { type: 'assistant-stream', frame: { type: 'start', attemptId: 'attempt', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 } }
  view.apply(start); view.apply(start)
  assert.throws(() => view.apply({ ...start, frame: { ...start.frame, attemptId: 'other' } }), code('resync-needed'))
  assert.throws(() => view.apply({ ...baseline, header: { ...baseline.header, id: 'foreign' } }), code('protocol-mismatch'))
  assert.equal(view.liveAttempt.attemptId, 'attempt')
})

test('revocation during mount acquisition disposes the late host lease before rejecting the result', async () => {
  const lab = createLinkLab()
  let resume, entered
  const started = new Promise(resolve => { entered = resolve })
  const original = lab.host.rich.mount
  lab.host.rich.mount = async request => {
    const mounted = await original(request); entered(); await new Promise(resolve => { resume = resolve }); return mounted
  }
  try {
    const operation = lab.phone.request('rich.mount', mountPayload(lab))
    await started; await lab.registry.revoke(lab.peer.deviceId); resume()
    await assert.rejects(operation, code('revoked'))
    assert.equal(lab.host.mountCount, 0)
  } finally { await lab.close() }
})

test('revocation aborts pending admission before fixture mutation and retains unknown receipt state', async () => {
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const lab = createLinkLab({ beforePrompt: signal => new Promise((resolve, reject) => {
    entered(); signal.addEventListener('abort', () => reject(new Error('fixture request aborted')), { once: true })
  }) })
  try {
    const operation = submit(lab)
    await started; await lab.registry.revoke(lab.peer.deviceId)
    await assert.rejects(operation, code('unknown-outcome'))
    assert.equal(lab.host.desktop.admittedTasks, 0); assert.equal(lab.host.cancelCalls, 0)
  } finally { await lab.close() }
})

test('adapter close waits for late mount release and rejects new work', async () => {
  const lab = createLinkLab()
  let resume, entered
  const started = new Promise(resolve => { entered = resolve })
  const original = lab.host.rich.mount
  lab.host.rich.mount = async request => {
    const mounted = await original(request); entered(); await new Promise(resolve => { resume = resolve }); return mounted
  }
  try {
    const operation = lab.phone.request('rich.mount', mountPayload(lab))
    await started
    const closing = lab.adapter.close(); resume()
    await assert.rejects(operation, code('closed')); await closing
    assert.equal(lab.host.mountCount, 0)
    await assert.rejects(submit(lab), code('closed'))
  } finally { await lab.close() }
})

test('oversized mount response releases its otherwise unreachable host lease', async () => {
  const lab = createLinkLab()
  const original = lab.host.rich.mount
  lab.host.rich.mount = async request => {
    const mounted = await original(request)
    return { ...mounted, snapshot: { ...mounted.snapshot, values: { large: 'x'.repeat(131073) } } }
  }
  try {
    await assert.rejects(lab.phone.request('rich.mount', mountPayload(lab)), code('queue-full'))
    assert.equal(lab.host.mountCount, 0)
  } finally { await lab.close() }
})

test('revocation reports failed host lease cleanup instead of hiding it', async () => {
  const lab = createLinkLab()
  const original = lab.host.rich.dispose
  try {
    await lab.phone.request('rich.mount', mountPayload(lab))
    lab.host.rich.dispose = async () => { throw new Error('fixture cleanup failed') }
    await assert.rejects(lab.registry.revoke(lab.peer.deviceId), /fixture cleanup failed/)
    await assert.rejects(submit(lab), code('revoked'))
  } finally { lab.host.rich.dispose = original; await lab.close() }
  assert.equal(lab.host.mountCount, 0)
})

test('mount budget includes concurrent acquisitions and survives transport cache expiry', async () => {
  const lab = createLinkLab({ maxMounts: 2 })
  try {
    const results = await Promise.allSettled([1, 2, 3].map(() => lab.phone.request('rich.mount', mountPayload(lab))))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2)
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'queue-full')
    assert.equal(lab.host.mountCount, 2)
    lab.elapse(501)
    await assert.rejects(lab.phone.request('rich.mount', mountPayload(lab)), code('queue-full'))
    const mounted = results.find(result => result.status === 'fulfilled').value
    await lab.phone.request('rich.dispose', { mountId: mounted.mountId })
    await lab.phone.request('rich.mount', mountPayload(lab))
    assert.equal(lab.host.mountCount, 2)
  } finally { await lab.close() }
  assert.equal(lab.host.mountCount, 0)
})

test('failed cleanup of a late revoked mount retains ownership for close retry', async () => {
  const lab = createLinkLab()
  let resume, entered
  const started = new Promise(resolve => { entered = resolve })
  const originalMount = lab.host.rich.mount, originalDispose = lab.host.rich.dispose
  lab.host.rich.mount = async request => {
    const mounted = await originalMount(request); entered(); await new Promise(resolve => { resume = resolve }); return mounted
  }
  try {
    const operation = lab.phone.request('rich.mount', mountPayload(lab))
    await started; await lab.registry.revoke(lab.peer.deviceId)
    lab.host.rich.dispose = async () => { throw new Error('late fixture cleanup failed') }
    resume(); await assert.rejects(operation, /late fixture cleanup failed/)
    assert.equal(lab.host.mountCount, 1)
  } finally { lab.host.rich.dispose = originalDispose; await lab.close() }
  assert.equal(lab.host.mountCount, 0)
})

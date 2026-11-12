/** Real recorded synthetic Session envelopes and owner-generated cases; no model or user data. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { nativeChatRows } from '../.build/native-chat-presentation.js'
import { PhoneCore } from '../.build/phone-core.js'
import { decodeAction, decodeRich, decodeDomain } from '../.build/domain.js'
import { richFixture } from '../.build/fixtures.js'
import { RelayGuestGate } from '../.build/relay-guest.js'

const limits = { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
const owner = { desktopId: 'test-desktop', deviceId: 'test-phone', sessionId: 'phase3-session' }
const rows = (await readFile('evidence/phase3-session.v4.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
const header = rows.shift(); delete header.type
const snapshot = events => ({ type: 'snapshot', header, cursor: events.at(-1)?.seq ?? -1, records: events.map(event => ({ type: 'event', event })), hasMore: false, projections: { asOfSeq: events.at(-1)?.seq ?? -1, values: {} }, assistantStream: { revision: 0 } })
const item = (payload, cursor = 0, kind = 'reset') => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance: 'fixture-generation', relayCursor: cursor, kind, payload })
const evt = (type, data, seq, extra = {}) => ({ type, data, seq, time: 1791634759000 + seq, ...extra })
const assistant = (seq, content, messageId = 'demo-message', extra = {}) => evt('assistant/message', { turn: 1, step: 1, message: { id: messageId, role: 'assistant', content, source: { kind: 'llm' } }, stream: [] }, seq, { surfaceOp: 'append', ...extra })

test('native chat preserves prose around a standard Rich marker as collapsed process text', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const marker = '```rich-inline\n{"blockId":"briefing-block"}\n```'
  const text = 'Collected observations.\n\n' + marker + '\n\nChecked all measurements.'
  model.accept(item(snapshot([assistant(0, [{ type: 'text', text }])])))
  assert.deepEqual(model.view.messages[0].rich.map(reference => reference.blockId), ['briefing-block'])
  assert.deepEqual(nativeChatRows(model.view.messages, 'demo-message'), [{
    id: 'demo-message', role: 'assistant', text: '', processKey: 'turn-1',
    processText: 'Collected observations.\n\n\n\nChecked all measurements.',
  }])
})

test('native chat adds a same-turn process disclosure when its earlier page arrives', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const process = assistant(0, [{ type: 'text', text: 'Collected observations.' }], 'earlier-message')
  const result = assistant(1, [{ type: 'text', text: '```rich-inline\n{"blockId":"briefing-block"}\n```' }])
  model.accept(item({ ...snapshot([result]), hasMore: true }))
  assert.deepEqual(nativeChatRows(model.view.messages, 'demo-message'), [{ id: 'demo-message', role: 'assistant', text: '' }])
  assert.equal(model.history({ protocol: 'dsh-mobile-read/1', sessionId: owner.sessionId,
    throughSeq: 1, beforeSeq: 1, hasMore: false, records: [{ type: 'event', event: process }] }), true)
  assert.deepEqual(nativeChatRows(model.view.messages, 'demo-message'), [{
    id: 'demo-message', role: 'assistant', text: '', processKey: 'turn-1', processText: 'Collected observations.',
  }])
  assert.equal(model.view.cursor, 1)
})

test('actual recorded Session projects messages, rich references, tool completion and cancelled turn', () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item(snapshot(rows)))
  assert.equal(model.view.cursor, 32); assert.equal(model.view.task, 'cancelled')
  assert.ok(model.view.messages.some(message => message.rich.length === 2))
  assert.deepEqual(model.view.tools.map(tool => tool.state), ['completed'])
  assert.equal(model.view.readOnly, false)
  assert.ok(model.view.messages.some(message => message.role === 'context'))
  const dispatch = model.view.messages.find(message => message.seq === 16)
  assert.equal(dispatch.role, 'context'); assert.ok(dispatch.parts[0].text.startsWith('Interactive input '))
})
test('ordinary human protocol examples and malformed dispatch text remain visible', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const text = 'Interactive input ' + JSON.stringify({ protocol: 'lumina-rich/1', actionName: 'submit', inputTrust: 'untrusted-rich-ui', actionId: 'example', blockId: 'demo-form' })
  const human = (seq, rpcId, text) => evt('user/message', { id: 'human-' + seq, role: 'user', source: { kind: 'user', rpcId }, content: [{ type: 'text', text }] }, seq, { surfaceOp: 'append' })
  model.accept(item(snapshot([assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }]), human(1, 'ordinary-request', text), human(2, 'rich-example', 'Interactive input {broken'), human(3, 'rich-example', text.replace('demo-form', 'missing-block'))])))
  assert.deepEqual(model.view.messages.slice(1).map(message => message.role), ['user', 'user', 'user'])
})
test('text/code/image/file blocks retain canonical vocabulary; unknown block is a safe placeholder', () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item(snapshot([assistant(0, [{ type: 'text', text: '```ts\nlet n=1\n```' }, { type: 'image', attachment: { attachmentId: 'opaque-image', mediaType: 'image/png', bytes: 20, width: 80, height: 40 } }, { type: 'file', attachment: { attachmentId: 'opaque-file', bytes: 20, name: 'result.txt' } }, { type: 'new-block', data: 'opaque' }])])))
  assert.deepEqual(model.view.messages[0].parts.map(part => part.kind), ['text', 'image', 'file', 'unsupported'])
  assert.ok(!JSON.stringify(model.view).includes('http'))
})
test('canonical replacement rules shadow earlier display rows', () => {
  const model = new SemanticPhone(owner, limits, 256), message = text => ({ id: 'human', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
  const first = evt('user/message', message('old'), 0, { surfaceOp: 'append' }), replacement = evt('user/message', message('new'), 1, { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 }, sourceEventSeqs: [0] })
  model.accept(item(snapshot([first, replacement])))
  assert.deepEqual(model.view.messages.map(message => message.parts[0].text), ['new'])
})
test('a partial history can display messages when a system replacement points before the window', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const system = text => ({ id: 'system', role: 'system', content: [{ type: 'text', text }], source: { kind: 'system-prompt' } })
  const first = evt('system/message', { turn: 1, step: 1, message: system('first') }, 0, { surfaceOp: 'append' })
  const user = evt('user/message', { id: 'human', role: 'user', content: [{ type: 'text', text: 'question' }], source: { kind: 'user' } }, 1, { surfaceOp: 'append' })
  const updated = evt('system/message', { turn: 1, step: 1, message: system('updated') }, 2, { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 }, sourceEventSeqs: [0] })
  const latest = evt('system/message', { turn: 1, step: 1, message: system('latest') }, 3, { surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 }, sourceEventSeqs: [2] })
  const answer = assistant(4, [{ type: 'text', text: 'answer' }])
  model.accept(item({ ...snapshot([user, updated, latest, answer]), hasMore: true }))
  assert.deepEqual(model.view.messages.map(message => message.parts[0].text), ['question', 'answer'])
  assert.equal(model.view.readOnly, false)
  assert.deepEqual(model.cache().events[1].surfaceOp, { op: 'replace', startSeq: 0, endSeq: 0 })
  assert.equal(model.history({ protocol: 'dsh-mobile-read/1', sessionId: owner.sessionId, throughSeq: 4, beforeSeq: 1,
    hasMore: false, records: [{ type: 'event', event: first }] }), true)
  assert.deepEqual(model.view.messages.map(message => message.parts[0].text), ['question', 'answer'])
  assert.equal(model.view.hasMore, false)
})
test('a missing user replacement target still rejects a partial history', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const user = evt('user/message', { id: 'human', role: 'user', content: [{ type: 'text', text: 'question' }], source: { kind: 'user' } }, 1,
    { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 }, sourceEventSeqs: [0] })
  assert.throws(() => model.accept(item({ ...snapshot([user]), hasMore: true })), /start seq 0 not found/)
})
test('a system replacement without its declared source is not treated as a partial-window seed', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const event = evt('system/message', { turn: 1, step: 1, message: { id: 'system', role: 'system', content: [{ type: 'text', text: 'prompt' }], source: { kind: 'system-prompt' } } }, 1,
    { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 } })
  assert.throws(() => model.accept(item({ ...snapshot([event]), hasMore: true })), /start seq 0 not found/)
})
test('unknown events preserve dense cursors, required unknown degrades to read-only', () => {
  const model = new SemanticPhone(owner, limits, 256); model.accept(item(snapshot([])))
  model.accept(item({ type: 'event', event: evt('future/notice', 'opaque', 0, { ignorable: true }) }, 1, 'event'))
  assert.equal(model.view.cursor, 0); assert.equal(model.view.readOnly, false)
  model.accept(item({ type: 'event', event: evt('future/required', { anything: 1 }, 1) }, 2, 'event'))
  assert.equal(model.view.cursor, 1); assert.equal(model.resume.relayCursor, 2); assert.equal(model.view.readOnly, true)
})
test('invalid, oversized, wrong owner, gaps, and rollback leave display and transport cursor unchanged', () => {
  const model = new SemanticPhone(owner, limits, 256); model.accept(item(snapshot([])))
  const before = model.view, resume = model.resume
  const candidates = [item({ type: 'event', event: assistant(0, [{ type: 'text', text: 1 }]) }, 1, 'event'), item({ type: 'event', event: evt('turn/start', { turn: 1 }, 2) }, 1, 'event'), { ...item(snapshot([])), sessionId: 'wrong' }, item({ ...snapshot([]), surprise: 1 }), item({ type: 'event', event: assistant(0, [{ type: 'text', text: 'x'.repeat(limits.maxText + 1) }]) }, 1, 'event')]
  for (const candidate of candidates) { assert.throws(() => model.accept(candidate)); assert.deepEqual(model.view, before); assert.deepEqual(model.resume, resume) }
  model.accept(item({ type: 'event', event: evt('turn/start', { turn: 1 }, 0) }, 1, 'event'))
  assert.throws(() => model.accept(item(snapshot([]), 2)), error => error.code === 'domain-rollback')
})
test('live revisions, durable commits, disconnect and turn failures remain distinct', () => {
  const model = new SemanticPhone(owner, limits, 256); model.accept(item(snapshot([]))); model.admissionState('accepted')
  model.accept(item({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'attempt', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 } }, 1, 'event'))
  model.accept(item({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', revision: 2, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'streamed' } } }, 2, 'event'))
  assert.equal(model.view.liveText, 'streamed'); assert.equal(model.view.task, 'accepted')
  model.disconnect(); assert.equal(model.view.connection, 'disconnected'); assert.equal(model.view.task, 'accepted')
  assert.throws(() => model.accept(item({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', revision: 4, index: 1, time: 2, chunk: { type: 'text-delta', index: 0, text: 'gap' } } }, 3, 'event')), error => error.code === 'domain-live-gap')
  model.accept(item({ type: 'event', event: evt('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'AUTH', message: 'Do not display' } } }, 0) }, 3, 'event'))
  assert.equal(model.view.task, 'failed'); assert.equal(model.view.error, '')
  model.admissionState('outcome_unknown'); assert.equal(model.view.task, 'outcome_unknown')
})

test('fragmented reasoning does not exhaust the content-block limit before the reply arrives', () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item(snapshot([])))
  let cursor = 0, revision = 0, index = 0
  const live = frame => model.accept(item({ type: 'assistant-stream', frame: { ...frame, attemptId: 'fragmented-attempt', revision: ++revision } }, ++cursor, 'event'))
  live({ type: 'start', startedAfterSeq: -1, turn: 1, step: 1 })
  for (let at = 0; at < limits.maxBlocks + 1; at++) live({ type: 'chunk', index: index++, time: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'r' } })
  live({ type: 'chunk', index: index++, time: 1, chunk: { type: 'text-delta', index: 1, text: 'Hello' } })
  assert.equal(model.view.liveText, 'Hello')
  assert.equal(model.view.readOnly, false)
  model.accept(item({ type: 'event', event: assistant(0, [{ type: 'reasoning', text: 'r'.repeat(limits.maxBlocks + 1) }, { type: 'text', text: 'Hello' }]) }, ++cursor, 'event'))
  live({ type: 'end', index, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 0 } })
  model.accept(item({ type: 'event', event: evt('turn/end', { turn: 1, reason: { kind: 'completed' } }, 1) }, ++cursor, 'event'))
  assert.equal(model.view.task, 'completed')
  assert.equal(model.view.messages.at(-1).parts.at(-1).text, 'Hello')
})

test('an active snapshot with many small stream fragments retains its reply and still enforces bytes', () => {
  const model = new SemanticPhone(owner, limits, 256)
  const stream = [...Array.from({ length: limits.maxBlocks + 1 }, () => ({ type: 'reasoning-delta', index: 0, text: 'r' })), { type: 'text-delta', index: 1, text: 'Hello' }]
  const opening = { ...snapshot([]), assistantStream: { revision: stream.length + 1, activeAttempt: { attemptId: 'fragmented-attempt', startedAfterSeq: -1, turn: 1, step: 1, nextIndex: stream.length, stream } } }
  model.accept(item(opening))
  assert.equal(model.view.liveText, 'Hello')
  assert.equal(model.view.readOnly, false)
  const small = new SemanticPhone(owner, { ...limits, maxBytes: 128 }, 256)
  assert.throws(() => small.accept(item(opening)), error => error.code === 'domain-too-large')
  assert.equal(small.view.cursor, -1)
  assert.deepEqual(small.resume, { instance: null, relayCursor: -1 })
})

test('cumulative live bytes reject before replacing the last admitted reply or cursor', () => {
  const model = new SemanticPhone(owner, { ...limits, maxBytes: 1024 }, 256)
  model.accept(item(snapshot([])))
  model.accept(item({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'bytes', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 } }, 1, 'event'))
  const chunk = index => item({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'bytes', revision: index + 2, index, time: 1, chunk: { type: 'text-delta', index: 0, text: 'x'.repeat(400) } } }, index + 2, 'event')
  model.accept(chunk(0)); model.accept(chunk(1))
  const before = model.view, resume = model.resume
  assert.throws(() => model.accept(chunk(2)), error => error.code === 'domain-too-large')
  assert.deepEqual(model.view, before); assert.deepEqual(model.resume, resume)
  const blocks = Array.from({ length: limits.maxBlocks + 1 }, () => ({ type: 'text', text: '' }))
  assert.throws(() => new SemanticPhone(owner, limits, 256).accept(item(snapshot([assistant(0, blocks)]))), error => error.code === 'domain-invalid')
})
test('future Session version provides metadata downgrade without interpreting records', () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item({ ...snapshot([]), header: { ...header, version: 5 }, cursor: 7, records: [{ future: true }], projections: { asOfSeq: 7, values: {} } }))
  assert.equal(model.view.cursor, 7); assert.equal(model.view.readOnly, true); assert.deepEqual(model.view.notices, ['session-version-unsupported'])
})
test('rich partial data updates preserve code and draft; stale or conflicting revisions refuse', () => {
  const model = new SemanticPhone(owner, limits, 256), rich = richFixture(owner.sessionId)
  model.accept(item(snapshot([assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }])])))
  const reference = model.view.messages[0].rich[0]; model.richSnapshot(rich, reference)
  const update = { ...rich, dataRevision: 2, values: { score: 7 }, draft: { ...rich.draft, draftRevision: 1, fields: { title: 'unsent draft' }, dirty: ['title'] } }
  model.richSnapshot(update, reference); assert.equal(model.view.rich[0].manifest.contentHash, rich.manifest.contentHash)
  assert.equal(model.view.rich[0].draft.fields.title, 'unsent draft')
  assert.throws(() => model.richSnapshot(rich, reference), error => error.code === 'rich-rollback')
  assert.throws(() => model.richSnapshot({ ...update, manifest: { ...update.manifest, contentHash: '1'.repeat(64) } }, reference), error => error.code === 'rich-conflict')
  const reopened = new SemanticPhone(owner, limits, 256); reopened.accept(item(snapshot([assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }])])))
  reopened.richSnapshot(update, reference); assert.deepEqual(reopened.view.rich, model.view.rich)
})
test('accepted and outcome_unknown actions are nonterminal; completed/failed/cancelled are terminal', () => {
  for (const state of ['accepted', 'outcome_unknown', 'completed', 'failed', 'cancelled']) {
    const action = { actionId: 'action', state, terminal: ['completed', 'failed', 'cancelled'].includes(state), ledgerSeq: 1, values: {}, progress: null, lateAfterCancel: false }
    assert.equal(decodeAction(action).state, state)
    assert.throws(() => decodeAction({ ...action, terminal: !action.terminal }))
  }
  assert.throws(() => decodeRich({ ...richFixture(owner.sessionId), protocol: 'future-rich/2' }, { sessionId: owner.sessionId, messageId: 'demo-message', blockId: 'demo-form' }, limits), error => error.code === 'rich-protocol-mismatch')
})
test('fork-inherited rich view is read-only and native core denies mutation before provider dispatch', async () => {
  const model = new SemanticPhone(owner, limits, 256), opening = snapshot([assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }])])
  model.accept(item({ ...opening, header: { ...header, isSeeded: true } })); const reference = model.view.messages[0].rich[0]
  model.richSnapshot(richFixture(owner.sessionId), reference); assert.equal(model.view.rich[0].readOnly, true)
  // Forks may own later tasks; only inherited rich blocks are forced read-only.
  let calls = 0
  const provider = { request: async () => { calls++; return { mountId: 'mount', snapshot: { ...richFixture(owner.sessionId), readOnly: true } } }, async *follow() {}, close: async () => {} }
  const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'native-command', maxMounts: 4, maxIntents: 8 })
  await core.mount(reference)
  await assert.rejects(core.request('rich.invoke', { mountId: 'mount' }), error => error.code === 'read-only'); assert.equal(calls, 1)
})
test('lost native task receipt never resends, read-only reconciliation preserves unknown outcome', async () => {
  let calls = 0
  const model = new SemanticPhone(owner, limits, 256), provider = { request: async command => { calls++; if (command.operation === 'task.submit') throw new Error('lost'); return { accepted: false, state: 'unknown', requestId: 'intent' } }, async *follow() {}, close: async () => {} }
  const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'native-command', maxMounts: 4, maxIntents: 8 })
  await assert.rejects(core.submit('intent', 'task')); await assert.rejects(core.submit('intent', 'task')); assert.equal(calls, 1)
  await core.receipt('intent'); assert.equal(calls, 2); assert.equal(model.view.task, 'outcome_unknown')
  await assert.rejects(core.submit('intent', 'changed'), error => error.code === 'id-conflict')
})

for (const [kind, expected] of [['aborted', 'cancelled'], ['completed', 'completed']]) {
  test(`cancel acknowledgement preserves the ${kind} turn received while the request is pending`, async () => {
    const model = new SemanticPhone(owner, limits, 256), calls = []
    model.accept(item(snapshot([evt('turn/start', { turn: 1 }, 0)])))
    const { promise, resolve } = Promise.withResolvers()
    const provider = { request(command) { calls.push(command.operation); return promise }, async *follow() {}, async close() {} }
    const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'cancel-command', maxMounts: 4, maxIntents: 8 })
    const pending = core.cancel()
    model.accept(item({ type: 'event', event: evt('turn/end', { turn: 1, reason: { kind } }, 1) }, 1, 'event'))
    assert.equal(model.view.task, expected)
    resolve({ accepted: true }); await pending
    assert.equal(model.view.task, expected)
    assert.deepEqual(calls, ['session.cancel'])
  })
}

test('cancel acknowledgement cannot use a historical terminal turn as cancellation evidence', async () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item(snapshot([evt('turn/start', { turn: 1 }, 0), evt('turn/end', { turn: 1, reason: { kind: 'aborted' } }, 1)])))
  const provider = { async request() { return { accepted: true } }, async *follow() {}, async close() {} }
  const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'cancel-command', maxMounts: 4, maxIntents: 8 })
  await core.cancel()
  assert.equal(model.view.task, 'cancel_requested')
})
test('minimal native port rejects fake approvals, host execution, wrong carrier and authority fields', async () => {
  const source = {}, binding = { source, sessionId: 'domain-session', mountId: 'mount', renderRevision: 1, packetBytes: 1024, maxPackets: 8 }, calls = []
  const gate = new RelayGuestGate({ request: async (...args) => { calls.push(args); return { disposed: true } } }, binding)
  const packet = type => JSON.stringify({ protocol: 'lumina-rich/1', mountId: 'mount', renderRevision: 1, packetId: 'packet', seq: 1, type, payload: {} })
  for (const type of ['approval.decide', 'task.submit', 'host.exec', 'file.grant']) await assert.rejects(gate.receive(packet(type), source), error => error.code === 'forbidden')
  await assert.rejects(gate.receive(packet('ready'), {}), error => error.code === 'scope-mismatch')
  assert.deepEqual(calls, []); await gate.close()
})
test('domain live baseline bounds and malformed recognized content reject before projection', () => {
  assert.throws(() => decodeDomain({ ...snapshot([]), assistantStream: { revision: 1, activeAttempt: { attemptId: 'a', startedAfterSeq: -1, turn: 1, step: 1, nextIndex: 1, stream: [{ type: 'text-delta', index: 0, text: false }] } } }, owner.sessionId, limits))
  assert.throws(() => new SemanticPhone(owner, { ...limits, maxBytes: 0 }, 10))
})
test('fork cut keeps new child-owned rich content editable and inherited content conservative', () => {
  const model = new SemanticPhone(owner, limits, 256), opening = snapshot([
    assistant(0, [{ type: 'text', text: 'Inherited text' }], 'inherited'),
    evt('session/end-seed', { inherited: true }, 1),
    assistant(2, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }]),
  ])
  model.accept(item({ ...opening, header: { ...header, isSeeded: true } }))
  model.richSnapshot(richFixture(owner.sessionId), model.view.messages[1].rich[0])
  assert.equal(model.view.rich[0].readOnly, false)
})
test('snapshot overlap conflict and same rich revision content changes never overwrite admitted state', () => {
  const model = new SemanticPhone(owner, limits, 256), message = assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }])
  model.accept(item(snapshot([message]))); const reference = model.view.messages[0].rich[0], rich = richFixture(owner.sessionId)
  model.richSnapshot(rich, reference); const before = model.view
  assert.throws(() => model.accept(item(snapshot([assistant(0, [{ type: 'text', text: 'Changed same event' }])]))), error => error.code === 'domain-conflict')
  assert.throws(() => model.richSnapshot({ ...rich, values: { changed: true } }, reference), error => error.code === 'rich-conflict')
  assert.deepEqual(model.view, before)
})
test('pending publication replacement stays separate from committed code and unsent draft', () => {
  const rich = richFixture(owner.sessionId), pending = { ...rich, pendingManifest: { ...rich.manifest, renderRevision: 2 }, draft: { ...rich.draft, fields: { title: 'last keystroke' }, dirty: ['title'] } }
  const parsed = decodeRich(pending, { sessionId: owner.sessionId, messageId: 'demo-message', blockId: 'demo-form' }, limits)
  assert.equal(parsed.manifest.renderRevision, 1); assert.equal(parsed.pendingManifest.renderRevision, 2); assert.equal(parsed.draft.fields.title, 'last keystroke')
})
test('native unsupported rich mount releases its lease and offers original readable fallback without guest execution', async () => {
  const model = new SemanticPhone(owner, limits, 256)
  model.accept(item(snapshot([assistant(0, [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }])])))
  const reference = { ...model.view.messages[0].rich[0], fallback: 'Original safe result' }, calls = []
  const provider = { request: async command => { calls.push(command.operation); return command.operation === 'rich.dispose' ? { disposed: true } : { mountId: 'future-mount', snapshot: { ...richFixture(owner.sessionId), protocol: 'future-rich/2' } } }, async *follow() {}, close: async () => {} }
  const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'native-command', maxMounts: 4, maxIntents: 8 })
  assert.deepEqual(await core.mountDisplay(reference), { kind: 'fallback', text: 'Original safe result', reason: 'rich-protocol-mismatch' })
  assert.deepEqual(calls, ['rich.mount', 'rich.dispose']); assert.deepEqual(model.view.rich, [])
})

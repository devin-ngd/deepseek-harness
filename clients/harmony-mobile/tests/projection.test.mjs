/** Archived native attempt and synthetic invalid decisions exercise maintained rich projections without IO. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { PhoneCore } from '../.build/phone-core.js'
import { richFixture } from '../.build/fixtures.js'
import { sha256, bytesToHex } from '../.build/upstream-domain.js'
const limits = { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
const owner = { desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: 'phase11-session' }
const rows = (await readFile('evidence/phase14-network/synthetic-session.v4.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
const header = rows.shift(); delete header.type
const snapshot = (events, hasMore = false) => ({ type: 'snapshot', header, cursor: events.at(-1)?.seq ?? -1, records: events.map(event => ({ type: 'event', event })), hasMore, projections: { asOfSeq: events.at(-1)?.seq ?? -1, values: {} } })
const item = (events, instance = 'v15-a', hasMore = false) => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance, relayCursor: 0, kind: 'reset', payload: snapshot(events, hasMore) })
const model = () => new SemanticPhone(owner, limits, 256)

test('phase14 native source-offload journal opens with original rich references and editable completed history', () => {
  const phone = model(); phone.accept(item(rows))
  assert.ok(rows.some(row => row.type === 'rich-inline/source-offload'))
  assert.equal(phone.view.readOnly, false); assert.equal(phone.view.task, 'completed')
  assert.ok(phone.view.messages.flatMap(row => row.rich).length > 0)
  assert.ok(!JSON.stringify(phone.view.messages).includes('sourceRef'))
  assert.deepEqual(phone.cache().events, rows)
})
test('complete projection cache restores read-only and a fresh generation reopens the same authored history', () => {
  const original = model(); original.accept(item(rows))
  const restored = model(); restored.restore(original.cache())
  assert.equal(restored.view.readOnly, true); assert.deepEqual(restored.view.messages, original.view.messages)
  restored.accept(item(rows, 'v15-reopened'))
  assert.equal(restored.view.readOnly, false); assert.deepEqual(restored.view.messages, original.view.messages)
})
test('partial first projection window stays read-only until canonical backwards history supplies the original target', () => {
  const at = rows.findIndex(row => row.type === 'rich-inline/source-offload'), phone = model()
  phone.accept(item(rows.slice(at), 'v15-partial', true))
  assert.equal(phone.view.readOnly, true); assert.ok(phone.view.notices.includes('message-projection-history-incomplete'))
  phone.history({ protocol: 'dsh-mobile-read/1', sessionId: owner.sessionId, throughSeq: rows.at(-1).seq, beforeSeq: rows[at].seq, hasMore: false, records: rows.slice(0, at).map(event => ({ type: 'event', event })) })
  assert.equal(phone.view.readOnly, false); assert.deepEqual(phone.cache().events, rows)
})
test('tampered hash, duplicate target and missing original reject atomically without consuming the resume hint', () => {
  const phone = model(); phone.accept(item([])); const before = phone.view, resume = phone.resume
  for (const change of ['hash', 'duplicate', 'missing', 'unknown-field']) {
    const changed = structuredClone(rows), decision = changed.find(row => row.type === 'rich-inline/source-offload')
    if (change === 'hash') decision.data.targets[0].sourceHash = '0'.repeat(64)
    if (change === 'duplicate') decision.data.targets.push(decision.data.targets[0])
    if (change === 'missing') decision.data.targets[0].seq = decision.seq + 1
    if (change === 'unknown-field') decision.data.targets[0].authority = 'host.exec'
    assert.throws(() => phone.accept(item(changed))); assert.deepEqual(phone.view, before); assert.deepEqual(phone.resume, resume)
  }
})
test('required unknown and unsupported projection events retain their existing read-only degradation', () => {
  for (const type of ['future/required', 'image/offload']) {
    const phone = model(), events = [...rows, { type, data: {}, seq: rows.at(-1).seq + 1, time: 0 }]
    phone.accept(item(events)); assert.equal(phone.view.readOnly, true)
  }
  const phone = model(); phone.accept(item([...rows, { type: 'future/ignorable', data: {}, seq: rows.at(-1).seq + 1, time: 0, ignorable: true }]))
  assert.equal(phone.view.readOnly, false)
})
test('browser digest provider matches Node UTF-8 SHA-256 for original sources and Unicode reference inputs', () => {
  for (const text of ['', '鸿蒙🎨\n', JSON.stringify(rows.find(row => row.type === 'rich-inline/source-offload').data), 'x'.repeat(65537)]) assert.equal(bytesToHex(sha256(new TextEncoder().encode(text))), createHash('sha256').update(text).digest('hex'))
})
test('replacement BFF generation retires old rich routing locally and cannot forward its lease to the new service', async () => {
  const chosen = { desktopId: 'd', deviceId: 'p', sessionId: 'demo' }, phone = new SemanticPhone(chosen, limits, 16), calls = []
  const event = { type: 'assistant/message', seq: 0, time: 0, surfaceOp: 'append', data: { turn: 1, step: 1, stream: [], message: { id: 'demo-message', role: 'assistant', source: { kind: 'llm' }, content: [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }] } } }
  const reset = instance => ({ ...item([event], instance), ...chosen, payload: { ...snapshot([event]), header: { ...header, id: chosen.sessionId } } })
  phone.accept(reset('first'))
  const provider = { async request(command) { calls.push(command.operation); return { mountId: 'old-lease', snapshot: richFixture(chosen.sessionId) } }, async *follow() {}, async close() {} }
  const core = new PhoneCore(provider, phone, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 1000, clock: () => 1, nextCommandId: () => 'c', maxMounts: 4, maxIntents: 8 })
  await core.mount(phone.view.messages[0].rich[0]); phone.accept(reset('replacement'))
  await assert.rejects(core.request('rich.snapshot', { mountId: 'old-lease' }), error => error.code === 'stale-mount')
  assert.deepEqual(await core.request('rich.dispose', { mountId: 'old-lease' }), { disposed: true })
  assert.deepEqual(calls, ['rich.mount'])
})

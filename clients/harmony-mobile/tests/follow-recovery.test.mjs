/** Read supervision reuses admitted wire hints; fake failures can never dispatch desktop work. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { PhoneCore } from '../.build/phone-core.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { TransportError } from '../.build/wire.js'
import { parseCommand } from '../.build/link-protocol.js'
const owner = { desktopId: 'd', deviceId: 'p', sessionId: 's' }, limits = { maxBytes: 65536, maxEvents: 64, maxBlocks: 64, maxText: 4096, maxRichBlocks: 4 }
const event = seq => ({ type: 'turn/start', seq, time: seq, data: { turn: seq + 1 } })
const wire = (kind, payload, relayCursor, instance = 'a') => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance, kind, relayCursor, payload })
const reset = (events = [], instance = 'a') => wire('reset', { type: 'snapshot', header: { version: 4, id: owner.sessionId, createdAt: 0, isSeeded: false }, cursor: events.at(-1)?.seq ?? -1, records: events.map(event => ({ type: 'event', event })), hasMore: false, projections: { asOfSeq: events.at(-1)?.seq ?? -1, values: {} } }, 0, instance)
const frame = (seq, cursor = seq + 1) => wire('event', { type: 'event', event: event(seq) }, cursor)
function fixture(follow, policy = { mode: 'bounded', maxSegments: 4, maxFailures: 2, retryDelayMs: 1 }) {
  const model = new SemanticPhone(owner, limits, 16), reads = [], writes = [], abort = new AbortController(); let next = 0, now = 1000
  const provider = { async *follow(command, resume, signal) { reads.push({ command, resume }); yield* follow(reads.length, signal, abort) }, async request(command) { writes.push(command); return { requestId: command.payload.requestId, accepted: true, state: 'accepted' } }, async close() {} }
  const clock = () => now + next
  const core = new PhoneCore(provider, model, { follow: policy, clock, grantEpoch: 1, ttlMs: 1000, maxMounts: 4, maxIntents: 16, nextCommandId: () => 'read-' + ++next })
  return { core, model, reads, writes, abort, clock, elapse: delta => { now += delta } }
}

test('recovery mints a new deadline after the previous request expires and rejects the old envelope', async () => {
  const f = fixture(async function* (at, signal, abort) {
    if (at === 1) { yield reset(); f.elapse(2000); throw new TransportError('transport-lost') }
    const config = { clock: f.clock, maxPacketBytes: 4096, maxCommandTtlMs: 1000, maxCachedCommands: 4, maxMountedBlocks: 1 }
    assert.throws(() => parseCommand(JSON.stringify(f.reads[0].command), config), error => error.code === 'request-expired' && error.timing.reason === 'elapsed')
    parseCommand(JSON.stringify(f.reads[1].command), config)
    yield frame(0); abort.abort()
  })
  for await (const view of f.core.follow(f.abort.signal)) void view
  assert.notEqual(f.reads[0].command.commandId, f.reads[1].command.commandId)
  assert.ok(f.reads[1].command.expiresAt > f.reads[0].command.expiresAt + 1000)
  assert.deepEqual(f.writes, [])
})

test('request-expired is terminal and never retries a rejected read or any desktop mutation', async () => {
  const f = fixture(async function* () { yield reset(); throw new TransportError('request-expired') })
  await assert.rejects(async () => { for await (const view of f.core.follow(f.abort.signal)) void view }, error => error.code === 'request-expired')
  assert.equal(f.reads.length, 1); assert.equal(f.model.view.readOnly, true); assert.deepEqual(f.writes, [])
})
test('clean bounded segments resume exact admitted cursors with fresh identities and never retry a submitted intent', async () => {
  const f = fixture(async function* (at, signal, abort) { if (at === 1) yield reset(); if (at === 2) { yield frame(0); yield frame(0) } if (at === 3) { yield frame(1); abort.abort() } })
  for await (const view of f.core.follow(f.abort.signal)) { if (view.cursor === -1) await f.core.submit('stable', 'task') }
  assert.deepEqual(f.reads.map(row => row.resume.relayCursor), [-1, 0, 1]); assert.deepEqual(f.reads.map(row => row.command.payload.afterSeq), [-1, -1, 0])
  assert.equal(new Set(f.reads.map(row => row.command.commandId)).size, 3); assert.equal(f.writes.length, 1)
  assert.equal(f.model.view.cursor, 1)
})
test('transport loss resumes accepted history and cancellation of a wait issues no desktop cancellation', async () => {
  const f = fixture(async function* (at, signal, abort) { if (at === 1) { yield reset(); yield frame(0); throw new TransportError('transport-lost') } yield frame(1); abort.abort() })
  for await (const view of f.core.follow(f.abort.signal)) { void view }
  assert.deepEqual(f.reads.map(row => row.resume.relayCursor), [-1, 1]); assert.deepEqual(f.writes, []); assert.equal(f.model.view.connection, 'disconnected')
})
test('empty recovered segments publish no new view; a later valid read snapshot confirms recovery without dispatch',async()=>{
  const f=fixture(async function* (at,signal,abort){if(at===1)yield reset();if(at===2)throw new TransportError('transport-lost');if(at===4){yield reset();abort.abort()}},{mode:'bounded',maxSegments:6,maxFailures:4,retryDelayMs:1})
  const views=[];for await(const view of f.core.follow(f.abort.signal))views.push(view)
  assert.equal(views.length,2);assert.ok(views.every(view=>view.connection==='connected'&&view.error===null&&!view.readOnly))
  assert.deepEqual(f.reads.map(row=>row.resume.relayCursor),[-1,0,0,0]);assert.deepEqual(f.writes,[])
  assert.equal(new Set(f.reads.map(row=>row.command.commandId)).size,4)
})
test('changed service generation requires a full reset and restores history without any task redispatch', async () => {
  const f = fixture(async function* (at, signal, abort) { if (at === 1) { yield reset(); yield frame(0); f.elapse(2000) } else {
    const config = { clock: f.clock, maxPacketBytes: 4096, maxCommandTtlMs: 1000, maxCachedCommands: 4, maxMountedBlocks: 1 }
    assert.throws(() => parseCommand(JSON.stringify(f.reads[0].command), config), error => error.code === 'request-expired')
    parseCommand(JSON.stringify(f.reads[1].command), config)
    yield reset([event(0), event(1)], 'reopened'); abort.abort()
  } })
  for await (const view of f.core.follow(f.abort.signal)) { void view }
  assert.equal(f.model.resume.instance, 'reopened'); assert.equal(f.model.view.cursor, 1); assert.deepEqual(f.writes, [])
})
test('recovery failure budget leaves admitted history read-only and blocks writes before provider IO', async () => {
  const f = fixture(async function* (at) { if (at === 1) yield reset(); throw new TransportError('timeout') })
  await assert.rejects(async () => { for await (const view of f.core.follow(f.abort.signal)) { void view } }, error => error.code === 'follow-recovery-exhausted')
  assert.equal(f.reads.length, 2); assert.equal(f.model.view.readOnly, true)
  await assert.rejects(f.core.submit('new', 'task'), error => error.code === 'read-only'); assert.deepEqual(f.writes, [])
})
test('finite clean segment budget stops and reports a read-only foreground lifetime', async () => {
  const f = fixture(async function* (at) { if (at === 1) yield reset() }, { mode: 'bounded', maxSegments: 2, maxFailures: 2, retryDelayMs: 1 })
  await assert.rejects(async () => { for await (const view of f.core.follow(f.abort.signal)) { void view } }, error => error.code === 'follow-budget-exhausted')
  assert.equal(f.reads.length, 2); assert.equal(f.model.view.readOnly, true)
})
test('truncated, reordered and conflicting deliveries stop read supervision without consuming the invalid item', async () => {
  for (const failure of ['truncated-frame', 'gap', 'conflict']) {
    const f = fixture(async function* () { yield reset(); yield frame(0); if (failure === 'truncated-frame') throw new TransportError(failure); if (failure === 'gap') yield frame(1, 3); if (failure === 'conflict') yield { ...frame(0), payload: { type: 'event', event: { ...event(0), time: 99 } } } })
    await assert.rejects(async () => { for await (const view of f.core.follow(f.abort.signal)) { void view } })
    assert.equal(f.reads.length, 1); assert.equal(f.model.resume.relayCursor, 1); assert.equal(f.model.view.cursor, 0); assert.equal(f.model.view.readOnly, true); assert.deepEqual(f.writes, [])
  }
})
test('cancellation interrupts a recovery pause and invalid budgets fail before read IO', async () => {
  const f = fixture(async function* () { yield reset() }, { mode: 'bounded', maxSegments: 4, maxFailures: 2, retryDelayMs: 10000 })
  const timer = setTimeout(() => f.abort.abort(), 10)
  try { for await (const view of f.core.follow(f.abort.signal)) { void view } } finally { clearTimeout(timer) }
  assert.equal(f.reads.length, 1); assert.deepEqual(f.writes, [])
  assert.throws(() => fixture(async function* () {}, { mode: 'bounded', maxSegments: 0, maxFailures: 1, retryDelayMs: 1 }), error => error.code === 'invalid-config')
})

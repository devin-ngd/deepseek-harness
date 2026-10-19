/** Synthetic catalogue, history, bounded resource and durable cache acceptance; no models, photos or user projects. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, stat, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { RestrictedReads } from '../.build/read-adapter.js'
import { RestrictedDesktopAdapter } from '../.build/desktop-adapter.js'
import { MemoryAdmissionJournal } from '../.build/admission-journal.js'
import { MockDeviceRegistry } from '../.build/link-protocol.js'
import { PhoneLibrary, MessageWindow } from '../.build/phone-library.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { decodeCatalog } from '../.build/read-protocol.js'
import { richFixture } from '../.build/fixtures.js'

const limits = { maxSourceItems: 500, maxPageItems: 4, maxSnapshots: 8, maxSnapshotBytes: 1048576, snapshotTtlMs: 1000, maxHistoryEvents: 256, maxImageBytes: 4096, maxImageDimension: 512, maxImagePixels: 262144, maxImageHandles: 2, imageTtlMs: 1000, maxImageChunkBytes: 32, maxInFlight: 4 }
const owner = { desktopId: 'read-desktop', deviceId: 'read-phone', sessionId: 'read-session' }, domain = { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
const operations = ['read.projects', 'read.sessions', 'read.history', 'image.open', 'image.read', 'image.close']
const rows = Array.from({ length: 100 }, (_, seq) => ({ type: 'user/message', seq, time: seq, surfaceOp: 'append', data: { id: 'message-' + seq, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic history ' + seq }] } }))
const image = { attachmentId: 'synthetic-image', mediaType: 'image/png', bytes: 64, width: 24, height: 16 }
rows[99].data.content.push({ type: 'image', attachment: image })
const opening = (events = rows.slice(96)) => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance: 'read-generation', relayCursor: 0, kind: 'reset', payload: { type: 'snapshot', header: { version: 4, id: owner.sessionId, createdAt: 0, isSeeded: false }, cursor: 99, records: events.map(event => ({ type: 'event', event })), hasMore: events[0]?.seq > 0, projections: { asOfSeq: 99, values: {} }, assistantStream: { revision: 0 } } })
function lab(policy = limits) {
  let now = 100, sequence = 0, imageReads = 0, historyReads = 0
  const registry = new MockDeviceRegistry('mock', () => now)
  registry.addFixtureGrant({ ...owner, epoch: 1, sessions: [owner.sessionId], operations, expiresAt: 100000, revoked: false })
  const projects = Array.from({ length: 6 }, (_, index) => ({ workspaceId: 'project-' + index, title: '项目 ' + index, path: 'D:/synthetic/private-' + index, sessionIds: [owner.sessionId, 'foreign'], createdAt: 'fixture', updatedAt: 'fixture' }))
  const services = { projects: async () => projects, sessions: async () => ({ items: [{ sessionId: owner.sessionId, updatedAt: 1, running: false, agentAvailable: true, formatStatus: 'current', cwd: 'D:/private' }, { sessionId: 'foreign', updatedAt: 1, running: true, agentAvailable: true }] }), history: async request => { historyReads++; const before = request.beforeSeq ?? 100, first = Math.max(0, before - request.maxMessages); return { records: rows.slice(first, before).map(event => ({ type: 'event', event })), hasMore: first > 0 } }, imageReference: async selection => selection.messageId === 'message-99' && selection.attachmentId === image.attachmentId ? image : null, image: async ref => { imageReads++; return { ref, data: Uint8Array.from({ length: 64 }, (_, at) => at) } } }
  const reads = new RestrictedReads(services, registry, policy, () => now, () => 'read-token-' + ++sequence)
  const command = (operation, payload, extra = {}) => ({ protocol: 'dsh-mobile-lab/2', desktopId: owner.desktopId, deviceId: owner.deviceId, grantEpoch: 1, commandId: 'command-' + ++sequence, expiresAt: 99999, operation, payload, ...extra })
  const request = (operation, payload) => reads.handle(command(operation, payload))
  const model = new SemanticPhone(owner, domain, 256); model.accept(opening())
  const library = new PhoneLibrary({ request }, model, policy, () => now, 1, 10000)
  return { reads, registry, services, projects, command, model, library, request, counts: () => ({ imageReads, historyReads }), advance: ms => { now += ms }, now: () => now }
}
test('catalogue pagination preserves immutable order, filters ungranted Sessions and removes all host paths', async () => {
  const l = lab(); try {
    const first = await l.library.page('projects', 'projects', null, 2); assert.equal(first.items.length, 2)
    l.projects.reverse(); const next = await l.library.page('projects', 'projects', first.next, 2)
    assert.deepEqual(next.items.map(row => row.projectId), ['project-0', 'project-1', 'project-2', 'project-3'])
    assert.ok(!JSON.stringify(next).includes('path')); assert.ok(!JSON.stringify(next).includes('foreign'))
    const sessions = await l.library.page('sessions', 'project-0', null, 2); assert.deepEqual(sessions.items.map(row => row.sessionId), [owner.sessionId])
  } finally { l.reads.close() }
})
test('foreign, expired, changed-limit and unsupported page cursors refuse before publication', async () => {
  const l = lab(); try {
    const first = await l.library.page('projects', 'projects', null, 2), before = l.library.lists
    await assert.rejects(l.request('read.sessions', { projectId: 'foreign', cursor: first.next, limit: 2 }), error => error.code === 'scope-denied')
    await assert.rejects(l.request('read.projects', { cursor: first.next, limit: 1 }), error => error.code === 'invalid-packet')
    l.advance(1001); await assert.rejects(l.library.page('projects', 'projects', first.next, 2), error => error.code === 'read-expired')
    assert.deepEqual(l.library.lists, before)
    assert.throws(() => decodeCatalog({ ...first, protocol: 'future/2' }, 'projects', 'projects', limits), error => error.code === 'read-version-unsupported')
  } finally { l.reads.close() }
})
test('source size, page size, snapshots and concurrent acquisitions stay bounded', async () => {
  const l = lab({ ...limits, maxSnapshots: 1 }); try {
    let release; l.services.projects = () => new Promise(resolve => { release = resolve })
    const first = l.request('read.projects', { cursor: null, limit: 2 })
    await assert.rejects(l.request('read.projects', { cursor: null, limit: 2 }), error => error.code === 'queue-full')
    release(l.projects); await first; assert.equal(l.reads.counts.snapshots, 1)
    l.advance(1001); l.services.projects = async () => Array(501).fill(l.projects[0])
    await assert.rejects(l.request('read.projects', { cursor: null, limit: 2 }), error => error.code === 'queue-full')
    assert.equal(l.reads.counts.snapshots, 0)
  } finally { l.reads.close() }
})
test('canonical history pages prepend with stable identity and never change follow or live cursors', async () => {
  const l = lab(); try {
    const resume = l.model.resume, cursor = l.model.view.cursor, ids = l.model.view.messages.map(row => row.id)
    for (let page = 0; page < 24; page++) await l.library.history(4)
    assert.equal(l.model.view.messages.length, 100); assert.equal(l.model.view.hasMore, false)
    assert.deepEqual(l.model.view.messages.slice(-4).map(row => row.id), ids); assert.deepEqual(l.model.resume, resume); assert.equal(l.model.view.cursor, cursor)
    assert.equal(new Set(l.model.view.messages.map(row => row.id)).size, 100)
  } finally { l.reads.close() }
})
test('history gaps, conflicts, window overflow and wrong Session reject atomically', async () => {
  const l = lab(); try {
    const before = l.model.view, page = { protocol: 'dsh-mobile-read/1', sessionId: owner.sessionId, throughSeq: 99, beforeSeq: 96, records: rows.slice(90, 96).map(event => ({ type: 'event', event })), hasMore: true }
    for (const value of [{ ...page, sessionId: 'foreign' }, { ...page, records: page.records.slice(0, -1) }, { ...page, hasMore: false }]) { assert.throws(() => l.model.history(value)); assert.deepEqual(l.model.view, before) }
    const conflicting = structuredClone(page); conflicting.beforeSeq = 97; conflicting.records.push({ type: 'event', event: { ...rows[96], data: { ...rows[96].data, content: [{ type: 'text', text: 'changed' }] } } })
    assert.throws(() => l.model.history(conflicting), error => error.code === 'domain-conflict'); assert.deepEqual(l.model.view, before)
    const small = new SemanticPhone(owner, { ...domain, maxEvents: 5 }, 256); small.accept(opening()); assert.throws(() => small.history({ ...page, records: page.records.slice(-2) }), error => error.code === 'domain-window-full'); assert.equal(small.view.messages.length, 4)
  } finally { l.reads.close() }
})
test('message viewport retains a keyed anchor after prepend and append, with bounded rows and explicit eviction', () => {
  const window = new MessageWindow(12), messages = rows.map(row => ({ id: row.data.id, seq: row.seq, role: 'user', parts: [], rich: [] }))
  window.position('message-96', 18, false); const old = window.update(messages.slice(96)), next = window.update(messages)
  assert.deepEqual(old.anchor, next.anchor); assert.equal(next.rows[0].id, 'message-96'); assert.ok(next.rows.length <= 12)
  window.position('message-0', 0, false); assert.equal(window.update(messages.slice(50)).anchorMissing, true)
  window.position('message-99', 0, true); assert.equal(window.update(messages).rows.at(-1).id, 'message-99')
})
test('image resource uses a scoped expiring handle, bounded chunks, exact dimensions and explicit release', async () => {
  const l = lab(); try {
    const view = await l.library.image(l.model.view.messages.at(-1), image.attachmentId)
    assert.equal(view.state, 'ready'); assert.equal(view.width, 24); assert.equal(view.height, 16)
    assert.equal(l.counts().imageReads, 1); assert.equal(l.reads.counts.handles, 0)
    assert.ok(!JSON.stringify(view).includes('D:/'))
  } finally { l.reads.close() }
})
test('ungranted image, arbitrary path selectors, expired handle and decoded pixel excess cannot read bytes', async () => {
  const l = lab(); try {
    const selection = { sessionId: owner.sessionId, messageId: 'message-99', messageSeq: 99, throughSeq: 99, attachmentId: 'synthetic-image' }
    await assert.rejects(l.request('image.open', { ...selection, path: 'D:/private/photo.jpg' }), error => error.code === 'invalid-packet')
    await assert.rejects(l.request('image.open', { ...selection, sessionId: 'foreign' }), error => error.code === 'scope-denied')
    const lease = await l.request('image.open', selection); l.advance(1001)
    await assert.rejects(l.request('image.read', { handle: lease.handle, offset: 0, length: 32 }), error => error.code === 'read-expired')
    l.services.imageReference = async () => ({ ...image, width: 2048 }); await assert.rejects(l.request('image.open', selection), error => error.code === 'queue-full')
    assert.equal(l.counts().imageReads, 0)
  } finally { l.reads.close() }
})
test('image decode failures and future lease versions yield size-preserving placeholders and release the lease', async () => {
  const l = lab(); try {
    const owner = { request: async (op, payload) => { const result = await l.request(op, payload); return op === 'image.open' ? { ...result, protocol: 'future/2' } : result } }
    const library = new PhoneLibrary(owner, l.model, limits, l.now, 1, 10000), view = await library.image(l.model.view.messages.at(-1), image.attachmentId)
    assert.equal(view.state, 'unavailable'); assert.equal(view.width, image.width); assert.equal(view.error, 'read-version-unsupported'); assert.equal(l.reads.counts.handles, 0)
  } finally { l.reads.close() }
})
test('revoke while image acquisition waits leaves no late handle or source-byte read', async () => {
  const l = lab(); try {
    let release; l.services.imageReference = () => new Promise(resolve => { release = resolve })
    const request = l.request('image.open', { sessionId: owner.sessionId, messageId: 'message-99', messageSeq: 99, throughSeq: 99, attachmentId: image.attachmentId })
    await l.registry.revoke(owner.deviceId); release(image); await assert.rejects(request)
    assert.deepEqual(l.reads.counts, { snapshots: 0, handles: 0, active: 0 }); assert.equal(l.counts().imageReads, 0)
  } finally { l.reads.close() }
})
test('durable offline cache restores history and drafts read-only without leases, hints, images or dispatch', async () => {
  const l = lab(); try {
    await l.library.page('projects', 'projects', null, 2); await l.library.history(4)
    const richMessage = { type: 'assistant/message', seq: 100, time: 100, surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'demo-message', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }] }, stream: [] } }
    l.model.accept({ ...opening(), relayCursor: 1, kind: 'event', payload: { type: 'event', event: richMessage } })
    const rich = richFixture(owner.sessionId); l.model.richSnapshot({ ...rich, draft: { ...rich.draft, draftRevision: 1, fields: { title: 'unsent offline draft' }, dirty: ['title'] } }, l.model.view.messages.at(-1).rich[0])
    const directory = await mkdtemp(resolve('.build/cache-fixture-')), file = join(directory, 'cache.json')
    const storage = { read: async max => { if ((await stat(file)).size > max) throw new Error('cache-too-large'); return readFile(file, 'utf8') }, write: async text => { await writeFile(file + '.pending', text, { flag: 'wx' }); await rename(file + '.pending', file) }, clear: async () => { throw new Error('Not exercised') } }
    await l.library.save(storage); const serialized = await readFile(file, 'utf8')
    assert.ok(!serialized.includes('read-token-')); assert.ok(!serialized.includes('relayCursor')); assert.ok(!serialized.includes('data:image'))
    const restored = new SemanticPhone(owner, domain, 256), library = new PhoneLibrary({ request: async () => { throw new Error('offline must not dispatch') } }, restored, limits, l.now, 1, 10000)
    assert.equal(await library.restore(storage), true); assert.equal(restored.view.readOnly, true); assert.equal(restored.view.connection, 'disconnected')
    assert.deepEqual(restored.view.messages, l.model.view.messages); assert.equal(restored.resume.instance, null)
    assert.equal(restored.view.rich[0].draft.fields.title, 'unsent offline draft'); assert.equal(restored.view.rich[0].readOnly, true)
    const fresh = opening(rows.slice(92)); fresh.payload.cursor = 100; fresh.payload.projections.asOfSeq = 100; fresh.payload.records.push({ type: 'event', event: richMessage })
    restored.accept(fresh); assert.equal(restored.view.readOnly, false)
  } finally { l.reads.close() }
})
test('corrupt, wrong-owner, future-version and expired cache cannot replace current state', async () => {
  const l = lab(); try {
    let text; const storage = { read: async () => text, write: async value => { text = value }, clear: async () => {} }
    await l.library.save(storage); const current = l.model.view, original = JSON.parse(text)
    for (const candidate of ['{broken', { ...original, schema: 'future-cache/2' }, { ...original, epoch: 2 }, { ...original, owner: { ...owner, sessionId: 'foreign' } }, { ...original, savedAt: 0 }]) {
      if (candidate.savedAt === 0) l.advance(20000)
      text = typeof candidate === 'string' ? candidate : JSON.stringify(candidate); assert.equal(await l.library.restore(storage), false); assert.deepEqual(l.model.view, current)
    }
  } finally { l.reads.close() }
})

test('undeliverable read acquisition releases its new snapshot or handle before returning failure', async () => {
  const l = lab(), adapter = new RestrictedDesktopAdapter(owner.desktopId, { environment: 'synthetic-only' }, l.registry,
    { clock: l.now, maxCommandTtlMs: 100000, maxPacketBytes: 600, maxCachedCommands: 32, maxMountedBlocks: 2 }, new MemoryAdmissionJournal(32), l.reads)
  try {
    const selected = { sessionId: owner.sessionId, messageId: 'message-99', messageSeq: 99, throughSeq: 99, attachmentId: image.attachmentId }
    l.services.imageReference = async () => ({ ...image, attachmentId: 'synthetic-image-' + 'x'.repeat(400) })
    await assert.rejects(adapter.handle(JSON.stringify(l.command('image.open', selected))), error => error.code === 'queue-full')
    assert.equal(l.reads.counts.handles, 0)
    l.projects.forEach(project => { project.title = 'x'.repeat(400) })
    await assert.rejects(adapter.handle(JSON.stringify(l.command('read.projects', { cursor: null, limit: 2 }))), error => error.code === 'queue-full')
    assert.equal(l.reads.counts.snapshots, 0)
  } finally { await adapter.close() }
})

test('colliding native tokens and concurrent image acquisitions cannot replace an owned resource', async () => {
  const l = lab({ ...limits, maxImageHandles: 1 }); let collision
  try {
    collision = new RestrictedReads(l.services, l.registry, limits, l.now, () => 'duplicate-token')
    await assert.rejects(collision.handle(l.command('read.projects', { cursor: null, limit: 1 })), error => error.code === 'id-conflict')
    assert.equal(collision.counts.snapshots, 0)
    let release; l.services.imageReference = () => new Promise(resolve => { release = resolve })
    const selection = { sessionId: owner.sessionId, messageId: 'message-99', messageSeq: 99, throughSeq: 99, attachmentId: image.attachmentId }
    const opening = l.request('image.open', selection)
    await assert.rejects(l.request('image.open', selection), error => error.code === 'queue-full')
    release(image); await opening; assert.equal(l.reads.counts.handles, 1)
  } finally { collision?.close(); l.reads.close() }
})

test('bad image chunks preserve dimensions, sanitize provider errors and release handles', async () => {
  const l = lab(); try {
    const faulty = new PhoneLibrary({ request: async (op, payload) => { const value = await l.request(op, payload); return op === 'image.read' ? { ...value, data: 'AA==' } : value } }, l.model, limits, l.now, 1, 10000)
    assert.equal((await faulty.image(l.model.view.messages.at(-1), image.attachmentId)).error, 'image-invalid'); assert.equal(l.reads.counts.handles, 0)
    l.services.image = async () => { throw { code: 'D:/private/photo.jpg', message: 'private provider error' } }
    const view = await l.library.image(l.model.view.messages.at(-1), image.attachmentId)
    assert.deepEqual(view, { state: 'unavailable', width: 24, height: 16, error: 'image-unavailable' }); assert.equal(l.reads.counts.handles, 0)
  } finally { l.reads.close() }
})

test('oversized and unavailable cache storage never replaces admitted history or dispatches tasks', async () => {
  const l = lab(); try {
    const before = l.model.view, oversized = 'x'.repeat(limits.maxSnapshotBytes + 1)
    assert.equal(await l.library.restore({ read: async () => oversized, write: async () => {}, clear: async () => {} }), false); assert.deepEqual(l.model.view, before)
    const unavailable = { read: async () => { throw new Error('unavailable') }, write: async () => { throw new Error('unavailable') }, clear: async () => {} }
    assert.equal(await l.library.restore(unavailable), false); assert.equal(l.library.cacheError, 'cache-unavailable'); assert.deepEqual(l.model.view, before)
    await assert.rejects(l.library.save(unavailable), /unavailable/); assert.deepEqual(l.model.view, before)
  } finally { l.reads.close() }
})

/** History pages remain local across an append-only opening change. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DeviceHistoryCache, deviceHistoryScope } from '../.build/device-history-cache.js'

const hash = raw => createHash('sha256').update(raw).digest('base64url')
const record = (seq, text = `message-${seq}`) => ({ type: 'event', event: { seq, type: 'user/message', data: { text } } })
const opening = (cursor, records) => ({ historyHash: hash(JSON.stringify([cursor, records])), reused: false,
  frame: { kind: 'reset', payload: { type: 'snapshot', cursor, records, hasMore: true,
    header: { id: 'fixture-session', version: 4, createdAt: 1, isSeeded: false } } } })
const page = (beforeSeq, throughSeq, records, hasMore = true) => ({ protocol: 'dsh-mobile-read/1', sessionId: 'fixture-session', beforeSeq, throughSeq, records, hasMore })
function fixture() {
  let stored = null
  const cache = new DeviceHistoryCache({ maxBytes: 1024 * 1024, maxSessions: 2, read: async () => stored,
    write: async value => { stored = value }, clear: async () => { stored = null } }, async raw => hash(raw))
  return { cache, stored: () => stored }
}

test('a new opening retains overlapping earlier records and reuses their pages at the new cursor', async () => {
  const f = fixture(), history = await f.cache.open('fixture-scope')
  history.expand(opening(5, [record(3), record(4), record(5)]))
  history.remember(3, 5, page(3, 5, [record(0), record(1), record(2)], false))
  history.expand(opening(7, [record(4), record(5), record(6), record(7)]))
  assert.deepEqual(history.older(4, 7), page(4, 7, [record(3)]))
  assert.deepEqual(history.older(3, 8), page(3, 8, [record(0), record(1), record(2)], false))
  assert.equal(history.older(8, 7), undefined)
  await f.cache.close()
  assert.ok(f.stored())
})

test('conflicting overlapping records discard the older cache', async () => {
  const f = fixture(), history = await f.cache.open('fixture-scope')
  history.expand(opening(5, [record(3), record(4), record(5)]))
  history.remember(3, 5, page(3, 5, [record(0), record(1), record(2)], false))
  history.expand(opening(7, [record(4, 'changed'), record(5), record(6), record(7)]))
  assert.equal(history.older(4, 7), undefined)
  assert.equal(history.older(3, 7), undefined)
  await f.cache.close()
})

test('a cached page cannot bridge a missing event or a different session', async () => {
  const f = fixture(), history = await f.cache.open('fixture-scope')
  history.expand(opening(5, [record(3), record(4), record(5)]))
  history.remember(3, 5, page(3, 5, [record(0), record(2)], false))
  history.remember(2, 5, { ...page(2, 5, [record(0), record(1)], false), sessionId: 'different-session' })
  assert.equal(history.older(3, 5), undefined)
  assert.equal(history.older(4, 5), undefined)
  assert.equal(history.older(2, 5), undefined)
  await f.cache.close()
})

test('closing waits for changed pages and revocation clears the final pending write', async () => {
  let stored = null, writes = 0
  const started = Promise.withResolvers(), release = Promise.withResolvers()
  const cache = new DeviceHistoryCache({ maxBytes: 1024 * 1024, maxSessions: 2, read: async () => stored,
    write: async raw => { writes++; if (writes === 1) { started.resolve(); await release.promise }; stored = raw },
    clear: async () => { stored = null } }, async raw => hash(raw))
  const history = await cache.open('fixture-scope')
  history.expand(opening(5, [record(3), record(4), record(5)]))
  await started.promise
  history.remember(3, 5, page(3, 5, [record(1), record(2)]))
  const cleared = cache.clear()
  release.resolve()
  await cleared
  assert.equal(writes, 2)
  assert.equal(stored, null)
})

test('an authenticated directory hides removed sessions across restarts and admits them when restored', async () => {
  let stored = null
  const storage = { maxBytes: 1024 * 1024, maxSessions: 2, read: async () => stored,
    write: async raw => { stored = raw }, clear: async () => { stored = null } }
  const binding = { bindingId: 'binding', epoch: 1, desktopId: 'desktop', profileId: 'desktop' }
  const row = { profileId: 'desktop', sessionId: 'fixture-session', title: 'Report', projectId: null,
    updatedAt: 0, running: false, pinned: false, archived: false, blank: false }
  let cache = new DeviceHistoryCache(storage, async raw => hash(raw))
  const history = await cache.open(deviceHistoryScope(binding, row.sessionId))
  history.bindRow(row)
  history.expand(opening(5, [record(3), record(4), record(5)]))
  assert.equal((await cache.sessions(binding)).length, 1)
  assert.equal((await cache.sessions({ ...binding, epoch: 2 })).length, 0)
  await cache.rememberDirectory(binding, [])
  history.remember(3, 5, page(3, 5, [record(1), record(2)]))
  assert.equal((await cache.sessions(binding)).length, 0)
  assert.equal((await cache.open(deviceHistoryScope(binding, row.sessionId))).hint, null)
  await cache.close()
  cache = new DeviceHistoryCache(storage, async raw => hash(raw))
  assert.equal((await cache.sessions(binding)).length, 0)
  await cache.rememberDirectory(binding, [row])
  assert.deepEqual(await cache.sessions(binding), [row])
  await cache.close()
})

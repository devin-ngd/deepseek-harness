/** Offline public fixtures only: no real grant, identity store, listener or model. Linux uses real directory synchronization. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, rm, open, stat, access } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createECDH, createPublicKey, createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const tools = resolve(process.env.HARMONY_PUBLIC_TOOLS_DIR ?? '.build/first-use-relay-tools.4')
const { reviewPublicMaintenance, revokePublicTrust, verifyPublicRevocation, PublicTrustStore } = await import(pathToFileURL(join(tools, 'revoke-public-trust.mjs')).href)
const template = JSON.parse(await readFile(join(tools, 'config.first-use.proposal.json'), 'utf8'))
const timers = JSON.parse(await readFile(join(tools, 'relay-endpoint-timers.json'), 'utf8'))
const execute = promisify(execFile)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function fixturePublic(n) { const ec = createECDH('prime256v1'), scalar = Buffer.alloc(32); scalar[31] = n; ec.setPrivateKey(scalar); const point = ec.getPublicKey(); scalar.fill(0); return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } }).export({ format: 'der', type: 'spki' }).toString('base64url') }
const io = {
  async append(file, bytes) { let offset = 0; while (offset < bytes.length) { const result = await file.write(bytes, offset, bytes.length - offset, null); assert.ok(result.bytesWritten > 0); offset += result.bytesWritten } },
  sync: file => file.sync(),
  async directorySync(path) { if (process.platform === 'win32') return; const file = await open(path, 'r'); try { await file.sync() } finally { await file.close() } },
}
async function fixture(t, initialize = true) {
  const base = resolve(process.env.HARMONY_PUBLIC_TEST_ROOT ?? tmpdir()); await mkdir(base, { recursive: true })
  const directory = await mkdtemp(join(base, 'harmony-public-maintenance-test-'))
  assert.ok(directory.startsWith(base + sep + 'harmony-public-maintenance-test-'))
  t.after(async () => { assert.ok(resolve(directory).startsWith(base + sep + 'harmony-public-maintenance-test-')); await rm(directory, { recursive: true, force: true }) })
  // Expired from creation: no fixture ever represents an active routing authorization.
  const pair = { pairId: 'expired-public-maintenance-fixture', desktopPublicSpki: fixturePublic(2), phonePublicSpki: fixturePublic(6), epoch: 1, expiresAt: 1, revoked: false }
  const state = join(directory, 'trust.jsonl'), config = { ...structuredClone(template), broker: { ...template.broker, pairs: [pair] }, publicTrust: { ...template.publicTrust, path: state } }
  const selection = reviewPublicMaintenance(config, pair, state, timers)
  if (initialize) { const authority = {}; await PublicTrustStore.initialize(authority, authority, selection.policy, selection.broker, selection.audience, io) }
  return { directory, pair, state, config, selection }
}
async function absent(path) { try { await access(path); return false } catch (error) { if (error.code === 'ENOENT') return true; throw error } }

test('expired public registration exclusively creates synchronized journal and head without a live pair', async t => {
  const f = await fixture(t)
  const authority = {}
  const journal = await readFile(f.state, 'utf8'), head = JSON.parse(await readFile(f.state + '.head', 'utf8'))
  assert.equal(head.digest, hash(Buffer.from(journal))); assert.equal(head.generation, 1)
  assert.equal(JSON.parse(journal).pairs[0].expiresAt, 1)
  assert.equal(await absent(f.state + '.lock'), true)
  if (process.platform !== 'win32') assert.equal((await stat(f.state)).mode & 0o777, 0o600)
  await assert.rejects(PublicTrustStore.initialize(authority, authority, f.selection.policy, f.selection.broker, f.selection.audience, io))
  assert.equal(await absent(f.state + '.lock'), false, 'refused duplicate initialization preserves its refusal lock')
  assert.equal(await readFile(f.state, 'utf8'), journal)
})

test('revocation appends the exact successor, strictly reopens it, and is idempotent', async t => {
  const f = await fixture(t), old = await readFile(f.state)
  await assert.rejects(verifyPublicRevocation(f.config, f.pair, f.state, timers, io))
  const first = await revokePublicTrust(true, f.config, f.pair, f.state, timers, io)
  assert.deepEqual({ epoch: first.epoch, revoked: first.revoked, verified: first.verified, already: first.alreadyRevoked }, { epoch: 2, revoked: true, verified: true, already: false })
  const bytes = await readFile(f.state); assert.equal(bytes.subarray(0, old.length).equals(old), true)
  const records = bytes.toString('utf8').trim().split('\n').map(JSON.parse)
  assert.equal(records.length, 2); assert.equal(records[1].pairs[0].revoked, true)
  assert.equal(records[1].pairs[0].desktopPublicSpki, f.pair.desktopPublicSpki); assert.equal(records[1].pairs[0].expiresAt, 1)
  const beforeHead = await readFile(f.state + '.head')
  const second = await revokePublicTrust(true, f.config, f.pair, f.state, timers, io)
  assert.equal(second.alreadyRevoked, true); assert.deepEqual(await readFile(f.state), bytes); assert.deepEqual(await readFile(f.state + '.head'), beforeHead)
  assert.equal((await verifyPublicRevocation(f.config, f.pair, f.state, timers, io)).verified, true)
  assert.equal(await absent(f.state + '.lock'), true)
})

test('declined or changed public selection refuses before journal mutation', async t => {
  const f = await fixture(t), before = await readFile(f.state)
  await assert.rejects(revokePublicTrust(false, f.config, f.pair, f.state, timers, io), /decision-denied/)
  for (const pair of [{ ...f.pair, pairId: 'other' }, { ...f.pair, epoch: 2 }, { ...f.pair, desktopPublicSpki: fixturePublic(8) }, { ...f.pair, token: 'never-echo-fixture' }]) await assert.rejects(revokePublicTrust(true, f.config, pair, f.state, timers, io))
  assert.throws(() => reviewPublicMaintenance(f.config, f.pair, join(f.directory, 'other.jsonl'), timers))
  assert.throws(() => reviewPublicMaintenance({ ...f.config, broker: { ...f.config.broker, maxPairs: 2 } }, f.pair, f.state, timers))
  assert.deepEqual(await readFile(f.state), before); assert.equal(await absent(f.state + '.lock'), true)
})

test('a durable revoked route cannot be revived by old epoch, higher active epoch or a new unregistered route id', async t => {
  const f = await fixture(t)
  await revokePublicTrust(true, f.config, f.pair, f.state, timers, io)
  const before = await readFile(f.state), head = await readFile(f.state + '.head')
  const store = await PublicTrustStore.reopen(f.selection.policy, f.selection.broker, f.selection.audience, io)
  try {
    assert.deepEqual(store.pairs(), [{ ...f.pair, epoch: 2, revoked: true }])
    for (const route of [f.pair, { ...f.pair, epoch: 3 }, { ...f.pair, pairId: 'unregistered-successor-route' }]) await assert.rejects(store.commit(route))
    assert.deepEqual(store.pairs(), [{ ...f.pair, epoch: 2, revoked: true }])
  } finally { await store.close() }
  assert.deepEqual(await readFile(f.state), before); assert.deepEqual(await readFile(f.state + '.head'), head)
  assert.equal((await verifyPublicRevocation(f.config, f.pair, f.state, timers, io)).verified, true)
  assert.equal(await absent(f.state + '.lock'), true)
})

test('missing public state is not initialized or assigned a new lock', async t => {
  const f = await fixture(t, false)
  await assert.rejects(revokePublicTrust(true, f.config, f.pair, f.state, timers, io))
  assert.equal(await absent(f.state), true); assert.equal(await absent(f.state + '.head'), true); assert.equal(await absent(f.state + '.lock'), true)
})

test('an existing public writer lock refuses maintenance and remains owned by that writer', async t => {
  const f = await fixture(t), before = await readFile(f.state), store = await PublicTrustStore.reopen(f.selection.policy, f.selection.broker, f.selection.audience, io)
  try { await assert.rejects(revokePublicTrust(true, f.config, f.pair, f.state, timers, io)); assert.equal(await absent(f.state + '.lock'), false); assert.deepEqual(await readFile(f.state), before) } finally { await store.close() }
  assert.equal(await absent(f.state + '.lock'), true)
})

for (const fault of ['append', 'sync']) test('unknown ' + fault + ' outcome preserves refusal state and never reports verified', async t => {
  const f = await fixture(t)
  const broken = { ...io,
    async append(file, bytes) { if (fault === 'append') { await file.write(bytes.subarray(0, 7)); throw new Error('fixture partial append') } await io.append(file, bytes) },
    async sync(file) { if (fault === 'sync') throw new Error('fixture sync failure'); await io.sync(file) },
  }
  await assert.rejects(revokePublicTrust(true, f.config, f.pair, f.state, timers, broken), error => error.code === 'state-unverified' && error.operationFailed && error.closeFailed)
  assert.equal(await absent(f.state + '.lock'), false)
  await assert.rejects(PublicTrustStore.reopen(f.selection.policy, f.selection.broker, f.selection.audience, io))
})

test('detached CLI previews only approved public fields and refuses a nonTTY revoke', async t => {
  const f = await fixture(t), configPath = join(f.directory, 'config.json'), pairPath = join(f.directory, 'pair.json'), limits = join(f.directory, 'timers.json')
  await writeFile(configPath, JSON.stringify(f.config)); await writeFile(pairPath, JSON.stringify(f.pair)); await writeFile(limits, JSON.stringify(timers))
  const args = ['--config', configPath, '--pair', pairPath, '--state', f.state, '--limits', limits], entry = join(tools, 'revoke-public-trust.mjs')
  const result = await execute(process.execPath, [entry, 'preview', ...args], { encoding: 'utf8' })
  const preview = JSON.parse(result.stdout); assert.equal(preview.pairId, f.pair.pairId); assert.equal(preview.revokedEpoch, 2)
  assert.equal(result.stdout.includes(f.pair.desktopPublicSpki), false)
  const before = await readFile(f.state)
  await assert.rejects(execute(process.execPath, [entry, 'revoke', ...args], { encoding: 'utf8' }), error => error.code === 1 && !error.stderr.includes('never-echo-fixture'))
  assert.deepEqual(await readFile(f.state), before); assert.equal(await absent(f.state + '.lock'), true)
})

test('existing registration CLI keeps nonTTY and expired-input safeguards', async t => {
  const f = await fixture(t, false), configPath = join(f.directory, 'config.json'), pairPath = join(f.directory, 'pair.json'), limits = join(f.directory, 'timers.json')
  await writeFile(configPath, JSON.stringify(f.config)); await writeFile(pairPath, JSON.stringify(f.pair)); await writeFile(limits, JSON.stringify(timers))
  await assert.rejects(execute(process.execPath, [join(tools, 'initialize-public-trust.mjs'), '--config', configPath, '--pair', pairPath, '--limits', limits]))
  await assert.rejects(execute(process.execPath, [join(tools, 'prepare-public-config.mjs'), '--config', configPath, '--pair', pairPath, '--state', f.state, '--output', join(f.directory, 'ready.json'), '--limits', limits]))
  assert.equal(await absent(f.state), true); assert.equal(await absent(f.state + '.lock'), true)
})

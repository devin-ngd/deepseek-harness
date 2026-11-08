import { strict as assert } from 'node:assert'
import { createECDH, createPublicKey } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PublicTrustStore, DeviceRouteJournal, publicTrustWrites, startupDiagnostic, RelayStartupFailure } from './integration.mjs'

process.env.HARMONY_RELAY_LOCAL_LOCK_RECOVERY = '1'
const audience = 'dsh.example.test'
function publicKey(scalar) {
  const secret = Buffer.alloc(32); secret[31] = scalar
  const ecdh = createECDH('prime256v1'); ecdh.setPrivateKey(secret)
  const point = ecdh.getPublicKey()
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } }).export({ format: 'der', type: 'spki' }).toString('base64url')
}
const pair = { pairId: 'fixture-pair', desktopPublicSpki: publicKey(2), phonePublicSpki: publicKey(6), epoch: 1, expiresAt: 9999999999999, revoked: false }
const broker = { enabled: true, pairs: [pair], maxPairs: 1, challengeTtlMs: 100, roomTtlMs: 500, maxChallengesPerConnection: 8, maxRoomIssuesPerWindow: 4, issueWindowMs: 1000, maxOwnerRoomIssues: 16, maxControlPayloadBytes: 4096, maxControlQueuedBytes: 8192 }
const policy = path => ({ path, maxBytes: 32768, maxRecords: 64 })
const args = process.argv.slice(2)
if (args[0] === 'hold-trust') {
  await PublicTrustStore.reopen(policy(args[1]), broker, audience)
  console.log('ready'); setInterval(() => {}, 1000)
} else if (args[0] === 'hold-written-trust') {
  const owner = await PublicTrustStore.reopen(policy(args[1]), broker, audience)
  await owner.commit({ ...pair, epoch: 2, revoked: true })
  console.log('ready'); setInterval(() => {}, 1000)
} else if (args[0] === 'hold-route') {
  await DeviceRouteJournal.reopen(policy(args[1]), args[2], [pair], 1, Date.now)
  console.log('ready'); setInterval(() => {}, 1000)
} else {
  const dir = await mkdtemp(join(tmpdir(), 'relay-journal-isolated-'))
  const trust = policy(join(dir, 'trust')), route = policy(join(dir, 'route'))
  async function crash(...params) {
    const child = spawn(process.execPath, [process.argv[1], ...params], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    let errors = ''
    child.stderr.on('data', bytes => { errors += bytes })
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(errors || 'child timeout')), 5000); child.stdout.once('data', () => { clearTimeout(timer); resolve() }); child.once('exit', code => { clearTimeout(timer); reject(new Error(errors || String(code))) }) })
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited
  }
  try {
    const authority = {}
    await PublicTrustStore.initialize(authority, authority, trust, broker, audience)
    await crash('hold-trust', trust.path)
    let store = await PublicTrustStore.reopen(trust, broker, audience)
    const anchor = store.fingerprint()
    await DeviceRouteJournal.initialize(route, anchor)
    await crash('hold-route', route.path, anchor)
    const routes = await DeviceRouteJournal.reopen(route, anchor, [pair], 1, Date.now)
    assert.equal(routes.pairs().length, 0); await routes.close()
    await store.commit({ ...pair, epoch: 2, revoked: true }); await store.close()
    store = await PublicTrustStore.reopen(trust, broker, audience)
    assert.equal(store.pairs()[0].revoked, true); await store.close()

    const written = policy(join(dir, 'written'))
    await PublicTrustStore.initialize(authority, authority, written, broker, audience)
    await crash('hold-written-trust', written.path)
    assert.equal(JSON.parse(await readFile(written.path + '.lock', 'utf8')).phase, 'dirty')
    await assert.rejects(PublicTrustStore.reopen(written, broker, audience))

    const broken = policy(join(dir, 'broken'))
    await PublicTrustStore.initialize(authority, authority, broken, broker, audience)
    const fault = { ...publicTrustWrites, append: async (file, bytes) => { await file.write(bytes.subarray(0, 4)); throw new Error('fixture sensitive') } }
    store = await PublicTrustStore.reopen(broken, broker, audience, fault)
    await assert.rejects(store.commit({ ...pair, epoch: 2, revoked: true }))
    await assert.rejects(store.close())
    assert.equal(JSON.parse(await readFile(broken.path + '.lock', 'utf8')).phase, 'dirty')
    await assert.rejects(PublicTrustStore.reopen(broken, broker, audience), error => {
      assert.equal(startupDiagnostic(new RelayStartupFailure('public-trust', error)), 'relay startup stage=public-trust reason=lock-dirty')
      return true
    })
    const d = startupDiagnostic(new RelayStartupFailure('device-routes', Object.assign(new Error('private fixture'), { code: 'EEXIST' })))
    assert.equal(d, 'relay startup stage=device-routes reason=already-exists'); assert.doesNotMatch(d, /private/)
    console.log('PASS real journal crash recovery, route recovery, persisted revocation, unknown write refusal, redacted diagnostics')
  } finally { await rm(dir, { recursive: true, force: true }) }
}

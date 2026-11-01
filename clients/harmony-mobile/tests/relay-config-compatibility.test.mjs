/** Exact deployed relay artifact, synthetic public pins and loopback only; no real registration or server is touched. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm, open } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createECDH, createPublicKey, createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const wsVersion = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).dependencies.ws
const WebSocket = require(join(root, 'node_modules/.pnpm/ws@' + wsVersion + '/node_modules/ws'))
const legacyPath = resolve('.build/relay-denial-candidate/server.mjs')
assert.equal(createHash('sha256').update(await readFile(legacyPath)).digest('hex'), '20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41')
const legacy = await import(pathToFileURL(legacyPath).href)
const tools = resolve(process.env.HARMONY_PUBLIC_TOOLS_DIR ?? '.build/first-use-relay-tools.5')
const { preparePublicConfig } = await import(pathToFileURL(join(tools, 'prepare-public-config.mjs')).href)
const template = JSON.parse(await readFile(join(tools, 'config.first-use.proposal.json'), 'utf8'))
const io = {
  async append(file, bytes) { let offset = 0; while (offset < bytes.length) offset += (await file.write(bytes, offset, bytes.length - offset, null)).bytesWritten },
  sync: file => file.sync(),
  async directorySync(path) { if (process.platform === 'win32') return; const file = await open(path, 'r'); try { await file.sync() } finally { await file.close() } },
}
function publicKey(n) { const ec = createECDH('prime256v1'), scalar = Buffer.alloc(32); scalar[31] = n; ec.setPrivateKey(scalar); const point = ec.getPublicKey(); scalar.fill(0); return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } }).export({ format: 'der', type: 'spki' }).toString('base64url') }
async function fixture(t, extra = {}) {
  const base = resolve('D:/Temp'), directory = await mkdtemp(join(base, 'harmony-config-compat-'))
  t.after(async () => { assert.ok(resolve(directory).startsWith(base + sep + 'harmony-config-compat-')); await rm(directory, { recursive: true, force: true }) })
  const pair = { pairId: 'synthetic-config-compatibility', desktopPublicSpki: publicKey(2), phonePublicSpki: publicKey(6), epoch: 1, expiresAt: Date.now() + 60000, revoked: false }
  const proposal = { ...template, host: '127.0.0.1', port: 0, publicHost: 'relay.example', ...extra }
  const configPath = join(directory, 'proposal.json'), pairPath = join(directory, 'pair.json'), output = join(directory, 'prepared.json'), state = join(directory, 'trust.jsonl')
  await writeFile(configPath, JSON.stringify(proposal)); await writeFile(pairPath, JSON.stringify(pair))
  await preparePublicConfig(['--config', configPath, '--pair', pairPath, '--state', state, '--output', output, '--limits', join(tools, 'relay-endpoint-timers.json')])
  return { directory, pair, config: JSON.parse(await readFile(output, 'utf8')) }
}
async function handshake(app, pair, origin) {
  return new Promise((accept, reject) => {
    const headers = { Host: 'relay.example', 'X-DSH-Relay-Pair': pair.pairId, 'X-DSH-Relay-Role': 'phone', ...(origin === undefined ? {} : { Origin: origin }) }
    const socket = new WebSocket('ws://127.0.0.1:' + app.port() + '/harmony/relay/control/v1', 'harmony-relay-control-v1', { headers, perMessageDeflate: false, handshakeTimeout: 1500 })
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('loopback handshake timeout')) }, 2500)
    const done = opened => { clearTimeout(timer); socket.terminate(); accept(opened) }
    socket.on('error', () => {}); socket.once('open', () => done(true)); socket.once('unexpected-response', (_request, response) => { response.resume(); done(false) })
  })
}
test('generated default-deny config starts the exact deployed relay and retains Origin rejection', async t => {
  const f = await fixture(t); assert.equal(Object.hasOwn(f.config, 'nativeOrigin'), false)
  const authority = {}; await legacy.PublicTrustStore.initialize(authority, authority, f.config.publicTrust, f.config.broker, f.config.publicHost, io)
  const app = await legacy.openRelayApplication(f.config, {}, Date.now, undefined, io)
  assert.ok(app)
  try { await app.start(); assert.equal(await handshake(app, f.pair, undefined), true); assert.equal(await handshake(app, f.pair, 'https://relay.example'), false); assert.equal(await handshake(app, f.pair, 'https://foreign.example'), false) } finally { await app.close() }
})
test('explicit deny keeps legacy semantics and native support is never silently downgraded', async t => {
  const denied = await fixture(t, { nativeOrigin: 'deny' }); assert.equal(Object.hasOwn(denied.config, 'nativeOrigin'), false)
  const native = await fixture(t, { nativeOrigin: 'networkkit-v1' }); assert.equal(native.config.nativeOrigin, 'networkkit-v1')
  await assert.rejects(legacy.openRelayApplication(native.config, {}, Date.now, undefined, io), /invalid relay configuration/)
})
test('unknown Origin policy is refused instead of being removed for compatibility', async t => {
  await assert.rejects(fixture(t, { nativeOrigin: 'allow-everything' }), /invalid relay configuration/)
})

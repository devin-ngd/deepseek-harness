/** Shipped ESM and official bundled ws only; loopback synthetic flows, no source alias, DSH runtime, keys, server, model or installation. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createStandaloneRelay, relayTokenDigest } from '../.build/phase38-release/server.mjs'
import WebSocket from '../.build/phase38-release/node_modules/ws/wrapper.mjs'
const stage = new URL('../.build/phase38-release/', import.meta.url), config = JSON.parse(await readFile(new URL('config.enabled.example.json', stage), 'utf8'))
const room = 'phase38-packed-fixture', desktop = '3'.repeat(64), phone = '4'.repeat(64)
async function fileHashes(directory, prefix = '') { const entries = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory); if (entry.isDirectory()) entries.push(...await fileHashes(url, prefix + entry.name + '/')); else entries.push([prefix + entry.name, createHash('sha256').update(await readFile(url)).digest('hex')]) } return entries.sort((a, b) => a[0].localeCompare(b[0])) }
function peer(port, role, token) { const ws = new WebSocket('ws://127.0.0.1:' + port + '/harmony/relay/v1', 'dsh-relay-v1', { headers: { Host: config.publicHost, Authorization: 'Bearer ' + token, 'X-DSH-Relay-Room': room, 'X-DSH-Relay-Role': role }, handshakeTimeout: 2000, perMessageDeflate: false }), messages = []
  const closed = new Promise(resolve => ws.once('close', resolve)), open = new Promise((resolve, reject) => { ws.once('open', () => resolve(true)); ws.once('error', error => { if (error.code === 'EACCES' || error.code === 'EPERM') reject(new Error('loopback unavailable')); else resolve(false) }) }); ws.on('error', () => {}); ws.on('message', (bytes, binary) => messages.push({ bytes: Buffer.from(bytes), binary })); return { ws, closed, open, messages }
}
async function messages(peer, count) { for (let i = 0; i < 60 && peer.messages.length < count; i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(peer.messages.length, count) }
test('shipped entry/default config is inert and CLI disabled exits without output or lifecycle scripts', async () => {
  assert.equal(createStandaloneRelay(), undefined)
  const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [fileURLToPath(new URL('server.mjs', stage)), '--config', fileURLToPath(new URL('config.disabled.json', stage))], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: 'D:/Temp', TMP: 'D:/Temp' } }); let stdout = '', stderr = ''; child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes }); child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr })) })
  assert.deepEqual(result, { code: 0, stdout: '', stderr: '' })
})
test('shipped dependency graph is only ws and has matching original registry integrity without native/install dependencies', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', stage), 'utf8')), verified = JSON.parse(await readFile(new URL('ws.verified.json', stage), 'utf8')), tar = await readFile(new URL('vendor/ws-8.21.3.tgz', stage))
  assert.deepEqual(Object.keys(lock.packages), ['', 'node_modules/ws']); assert.equal(lock.packages['node_modules/ws'].version, '8.21.3'); assert.equal(lock.packages['node_modules/ws'].integrity, verified.integrity); assert.equal('sha512-' + createHash('sha512').update(tar).digest('base64'), verified.integrity)
  const info = JSON.parse(await readFile(new URL('build-info.json', stage), 'utf8')); assert.equal(info.dshRuntimeOrFramework, false); assert.ok(info.externalImports.every(value => value === 'ws' || value.startsWith('node:')))
})
test('shipped transport denies empty rooms, forwards exact admitted opaque bytes and revokes both peers without writing its files', async () => {
  const before = await fileHashes(stage), authority = {}, owner = createStandaloneRelay({ ...config, port: 0 }, authority, () => 1000, () => {}); assert.ok(owner); await owner.start()
  try {
    const denied = peer(owner.port(), 'phone', phone); assert.equal(await denied.open, false); await denied.closed
    owner.provision(authority, { room, desktopDigest: relayTokenDigest(desktop), phoneDigest: relayTokenDigest(phone), expiresAt: 1500 })
    const a = peer(owner.port(), 'desktop', desktop); assert.equal(await a.open, true); const b = peer(owner.port(), 'phone', phone); assert.equal(await b.open, true); await messages(a, 1); await messages(b, 1)
    const opaque = Buffer.from([0, 255, 123, 0, 17, 128]); a.ws.send(opaque); await messages(b, 2); assert.deepEqual(b.messages[1], { bytes: opaque, binary: true })
    owner.revoke(authority, room); await Promise.all([a.closed, b.closed]); const retry = peer(owner.port(), 'phone', phone); assert.equal(await retry.open, false); await retry.closed
  } finally { await owner.close() }
  assert.deepEqual(await fileHashes(stage), before)
})
test('shipped parser refuses all-interface binding and overflowing ws/timer fields before startup', () => {
  for (const candidate of [{ ...config, host: '0.0.0.0' }, { ...config, maxFrameBytes: 0x80000000, maxBufferedBytes: 0x80000000 }, { ...config, sweepIntervalMs: 0x80000000 }]) assert.throws(() => createStandaloneRelay(candidate), /invalid relay configuration/)
})

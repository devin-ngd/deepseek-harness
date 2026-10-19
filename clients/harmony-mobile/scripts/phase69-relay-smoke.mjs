/** Test built imports, disabled startup and proposal preparation with fixed public fixtures only; initialization has no TTY and must refuse. */
import { readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash, createECDH, createPublicKey } from 'node:crypto'
import assert from 'node:assert/strict'
const tag = 'phase69-relay'; const stage = resolve('.build/phase69-review-candidate/relay'), tools = join(stage, 'public-tools'), world = await mkdtemp('D:/Temp/dsh-harmony-phase68-detached-')
const environment = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: world, TMP: world }
function run(entry, args) { const result = spawnSync(process.execPath, [entry, ...args], { cwd: world, env: environment, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 65536 }); assert.equal(result.error, undefined); return { code: result.status, output: result.stdout + result.stderr } }
const library = await import(pathToFileURL(join(stage, 'server.mjs')).href)
assert.equal(library.createStandaloneRelay({ enabled: false }), undefined)
assert.equal(run(join(stage, 'server.mjs'), ['--config', join(stage, 'config.disabled.json')]).code, 0)
function publicKey(scalar) { const ec = createECDH('prime256v1'), d = Buffer.alloc(32); d[31] = scalar; ec.setPrivateKey(d); const p = ec.getPublicKey(); return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: p.subarray(1, 33).toString('base64url'), y: p.subarray(33).toString('base64url') } }).export({ type: 'spki', format: 'der' }).toString('base64url') }
const pair = { pairId: 'phase68-fixed-public-smoke', desktopPublicSpki: publicKey(2), phonePublicSpki: publicKey(6), epoch: 1, expiresAt: Date.now() + 60000, revoked: false }, pairPath = join(world, 'public-pair.json'), state = join(world, 'not-initialized.jsonl'), output = join(world, 'proposal.json')
await writeFile(pairPath, JSON.stringify(pair))
const args = ['--config', join(tools, 'config.first-use.proposal.json'), '--pair', pairPath, '--state', state, '--output', output, '--limits', join(tools, 'relay-endpoint-timers.json')]
const prepared = run(join(tools, 'prepare-public-config.mjs'), args); assert.equal(prepared.code, 0, prepared.output)
const bytes = await readFile(output), proposal = JSON.parse(bytes.toString()); assert.equal(proposal.nativeOrigin, 'networkkit-v1'); assert.deepEqual(proposal.broker.pairs, [pair])
assert.equal(run(join(tools, 'prepare-public-config.mjs'), args).code, 1); assert.deepEqual(await readFile(output), bytes)
assert.equal(run(join(tools, 'initialize-public-trust.mjs'), ['--config', output, '--pair', pairPath, '--limits', join(tools, 'relay-endpoint-timers.json')]).code, 1)
assert.ok((await readdir(world)).every(file => !file.startsWith('not-initialized')))
const record = { at: new Date().toISOString(), world, builtRelayImport: true, disabledStartup: true, exactNativeOriginProposal: true, existingOutputPreserved: true, noTtyInitializationRefused: true, trustFilesCreated: 0, listenersStarted: 0, realGrant: false, realKeysOrPhoneAccess: false, serverSha256: createHash('sha256').update(await readFile(join(stage, 'server.mjs'))).digest('hex') }
await writeFile('evidence/' + tag + '-detached-smoke.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(record))

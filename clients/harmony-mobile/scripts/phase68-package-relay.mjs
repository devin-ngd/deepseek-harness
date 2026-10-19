/** Prepare an inactive candidate from verified public predecessor bytes; never contacts or alters the deployed relay. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { createHash } from 'node:crypto'
import { assertInitialProxyCapacity } from './relay-proxy-capacity.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const tag = process.argv[2] ?? 'phase68'; assert.match(tag, /^phase68(?:[.][0-9]+)?$/); const stage = resolve('.build/' + tag + '-relay-candidate'), previous = resolve('.build/relay-denial-candidate'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
await mkdir(stage)
const files = JSON.parse(await readFile('evidence/relay-denial-package-files.json', 'utf8'))
for (const entry of files) { assert.match(entry.file, /^[A-Za-z0-9_./-]+$/); assert.ok(!entry.file.includes('..')); const bytes = await readFile(join(previous, entry.file)); assert.equal(hash(bytes), entry.sha256); await mkdir(dirname(join(stage, entry.file)), { recursive: true }); await writeFile(join(stage, entry.file), bytes, { flag: 'wx' }) }
const originalProxy = await readFile(join(stage, 'relay.nginx.conf.proposal'), 'utf8')
assert.equal(hash(originalProxy), '3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2')
assert.equal((originalProxy.match(/burst=2 nodelay;/g) ?? []).length, 2); assert.ok(originalProxy.includes('rate=5r/m;')); assert.ok(originalProxy.includes('limit_conn harmony_relay_conn 4;'))
assert.throws(() => assertInitialProxyCapacity({ burst: 2, maxConnections: 4 }, { upgrades: 4, connections: 4 }), /burst-insufficient/)
const proxy = originalProxy.replaceAll('burst=2 nodelay;', 'burst=3 nodelay;'); assertInitialProxyCapacity({ burst: 3, maxConnections: 4 }, { upgrades: 4, connections: 4 })
await writeFile(join(stage, 'relay.nginx.conf.proposal'), proxy)
const built = await esbuild.build({ entryPoints: [resolve('standalone-relay/src/main.ts')], outfile: join(stage, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['ws'], metafile: true })
for (const output of Object.values(built.metafile.outputs)) for (const imported of output.imports) assert.ok(imported.path === 'ws' || isBuiltin(imported.path))
const sourceInputs = await Promise.all(Object.keys(built.metafile.inputs).map(async path => ({ path, sha256: hash(await readFile(path)) })))
for (const file of ['package.json', 'package-lock.json']) { const value = JSON.parse(await readFile(join(stage, file), 'utf8')); value.version = '0.0.0-phase68'; if (value.packages) value.packages[''].version = value.version; await writeFile(join(stage, file), JSON.stringify(value, null, 2) + '\n') }
const proposal = JSON.parse(await readFile('standalone-relay/config.first-use.proposal.json', 'utf8')); proposal.nativeOrigin = 'networkkit-v1'
await writeFile(join(stage, 'config.networkkit.proposal.json'), JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' })
const info = { at: new Date().toISOString(), version: '0.0.0-phase68', stage, sourceInputs, serverSha256: hash(await readFile(join(stage, 'server.mjs'))), predecessorVerifiedFiles: files.length, deployed: false, activated: false, signing: false, credentials: false, originalProxySha256: hash(originalProxy), proxySha256: hash(proxy), proxyChange: { ratePerMinute: 5, previousBurst: 2, candidateBurst: 3, maxConnections: 4, simultaneousInitialUpgrades: 4, sameEgressEvidence: 'conditional capacity analysis; no native wire capture' }, originMode: { default: 'deny', proposed: 'networkkit-v1', role: 'phone', canonicalTlsOriginOnly: true, browserCustomHeadersUnavailable: true, originalProofAndGrantRequired: true } }
await writeFile(join(stage, 'build-info.json'), JSON.stringify(info, null, 2) + '\n'); await writeFile('evidence/' + tag + '-relay-candidate.json', JSON.stringify(info, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ stage, serverSha256: info.serverSha256, activated: false, originalRateAndConnectionCapPreserved: true }))

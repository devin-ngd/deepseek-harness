/** Build a standalone Node/ws release from owned sources and verified official package bytes. No DSH runtime, server access or lifecycle script executes. */
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const project = resolve('.'), prep = 'D:/Temp/dsh-harmony-light-relay-20261013-prep', stage = resolve('.build/phase40-release'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const metadata = JSON.parse(await readFile(prep + '/ws.verified.json', 'utf8')), tarball = await readFile(prep + '/vendor/ws-8.21.3.tgz')
assert.equal(hash(tarball), metadata.sha256); assert.equal('sha512-' + createHash('sha512').update(tarball).digest('base64'), metadata.integrity)
assert.equal(Object.keys(metadata.dependencies).length, 0); assert.equal(metadata.os, null); assert.equal(metadata.cpu, null)
const lockBytes = await readFile(prep + '/package-lock.json'), lock = JSON.parse(lockBytes.toString('utf8')); assert.deepEqual(Object.keys(lock.packages), ['', 'node_modules/ws']); assert.equal(lock.packages['node_modules/ws'].integrity, metadata.integrity); assert.equal(lock.packages['node_modules/ws'].version, '8.21.3')
try { await stat(prep + '/node_modules'); throw new Error('Lock-only resolution installed modules') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
await mkdir(stage, { recursive: true }); await mkdir(join(stage, 'vendor'), { recursive: true }); await mkdir(join(stage, 'node_modules/ws'), { recursive: true })
const listing = spawnSync('C:/Windows/System32/tar.exe', ['-tzf', prep + '/vendor/ws-8.21.3.tgz'], { windowsHide: true, maxBuffer: 1048576 }); assert.equal(listing.status, 0)
for (const path of listing.stdout.toString('utf8').trim().split(/\r?\n/)) assert.ok(/^package\/[A-Za-z0-9_.\/-]+$/.test(path) && !path.includes('..'), 'unsafe official package path')
const extraction = spawnSync('C:/Windows/System32/tar.exe', ['-xzf', prep + '/vendor/ws-8.21.3.tgz', '--strip-components=1', '-C', join(stage, 'node_modules/ws')], { windowsHide: true, maxBuffer: 1048576 }); assert.equal(extraction.status, 0)
const manifest = JSON.parse(await readFile(join(stage, 'node_modules/ws/package.json'), 'utf8')); assert.equal(manifest.version, '8.21.3'); assert.equal(manifest.scripts?.install, undefined); assert.equal(manifest.scripts?.postinstall, undefined)
const built = await esbuild.build({ entryPoints: [resolve('standalone-relay/src/main.ts')], outfile: join(stage, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['ws'], metafile: true })
const inputFiles = Object.keys(built.metafile.inputs); assert.ok(inputFiles.every(path => !/packages\/|vendor\/|node_modules\/|device-auth|p256-channel|e2e-channel/.test(path.replaceAll('\\', '/'))), 'unexpected runtime import')
const outputs = Object.values(built.metafile.outputs).flatMap(value => value.imports); assert.ok(outputs.every(value => value.path === 'ws' || value.path.startsWith('node:')), 'unexpected external module')
const packageManifest = JSON.parse(await readFile(prep + '/package.json', 'utf8')); packageManifest.version = '0.0.0-phase40.1'; lock.version = packageManifest.version; lock.packages[''].version = packageManifest.version
const releaseLock = Buffer.from(JSON.stringify(lock, null, 2) + '\n')
await writeFile(join(stage, 'package.json'), JSON.stringify(packageManifest, null, 2) + '\n'); await writeFile(join(stage, 'package-lock.json'), releaseLock); await cp(prep + '/ws.verified.json', join(stage, 'ws.verified.json'))
await cp(prep + '/vendor/ws-8.21.3.tgz', join(stage, 'vendor/ws-8.21.3.tgz'))
for (const file of ['README.md', 'config.disabled.json', 'config.enabled.example.json', 'harmony-relay.service.proposal', 'relay.nginx.conf.proposal']) await cp('standalone-relay/' + file, join(stage, file))
await writeFile(join(stage, 'README.md'), (await readFile('standalone-relay/README.md', 'utf8')).replace('../docs/phase40-product-wiring.md', 'build-info.json'))
await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'))
const buildInfo = { version: '0.0.0-phase40.1', sharedRelayCoreAndUpgrade: true, existingP256VerifierAndShortRooms: true, dshRuntimeOrFramework: false, upstreamRuntimeCodeExecutedForLock: false, dependencyScriptsExecuted: false, lockOnly: true, dependencyResolutionReusedUnchanged: true, rootVersionMetadataUpdatedOnly: true, predecessorLockSha256: hash(lockBytes), lockSha256: hash(releaseLock), runtimeDependency: metadata, entry: 'node server.mjs --config <static-config.json>', nodeTarget: '^22.19.0 || >=24.0.0', linuxNativeDependencies: 0, linuxServerExecuted: false, defaultDisabled: true, roomBroker: 'preapproved-public-pairs-and-two-fresh-signatures', durableRevocationWriter: true, publicTrustFiles: 'explicit JSONL snapshot/head plus exclusive lock; no CLI enrollment/initialization', linuxDurabilityQualified: false, matchingBackupRollbackDetected: false, messagesPersisted: false, sourceInputs: await Promise.all(inputFiles.map(async path => ({ path, sha256: hash(await readFile(resolve(path))) }))), externalImports: outputs.map(value => value.path) }
await writeFile(join(stage, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n')
const files = []
async function collect(directory, prefix = '') { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { assert.equal(entry.isSymbolicLink(), false); const path = join(directory, entry.name), file = prefix + entry.name; if (entry.isDirectory()) await collect(path, file + '/'); else { const bytes = await readFile(path); files.push({ file, bytes: bytes.length, sha256: hash(bytes) }) } } }
await collect(stage); await writeFile('evidence/phase40-package-files.json', JSON.stringify(files, null, 2) + '\n'); await writeFile('evidence/phase40-build-info.json', JSON.stringify(buildInfo, null, 2) + '\n')
console.log(JSON.stringify({ stage, files: files.length, serverBytes: (await stat(join(stage, 'server.mjs'))).size, lockSha256: buildInfo.lockSha256, wsSha256: metadata.sha256, dshInstalled: false, modulesInstalledForLock: false, packageCodeExecuted: false }))

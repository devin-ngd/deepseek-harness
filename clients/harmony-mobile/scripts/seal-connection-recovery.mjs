/** Freeze independently built unsigned/offline artifacts; never signs, installs or activates access. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, access, readdir, lstat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const project = resolve('.'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const sdkEvidence = 'evidence/native-build/2026-10-24T10-38-12-734Z.json'
const typesEvidence = 'evidence/connection-recovery-typecheck-1792838578316.json'
const integrationEvidence = 'evidence/device-integration-1792838585094.json'
const manifestPath = 'evidence/connection-recovery-candidates-rc2.6.json'
const stage = resolve('.build/first-use-relay-tools-recovery.5')
const nativePath = 'D:/Temp/dsh-harmony-mobile-0.0.0-rc2.6-device-unsigned.hap'
const toolsPath = 'D:/Temp/harmony-public-relay-tools-0.0.0-first-use.5.zip'
const sdk = await read(sdkEvidence), types = await read(typesEvidence), integration = await read(integrationEvidence)
assert.equal(sdk.exitCode, 0); assert.equal(sdk.sourceArkTsCompiled, true)
assert.equal(sdk.inputsUnchangedDuringBuild, true); assert.equal(sdk.nativeJsImportAudit.passed, true)
assert.equal(types.passed, true); assert.deepEqual(types.diagnostics, [])
assert.equal(integration.passed, 7); assert.equal(integration.failed, 0)
assert.equal(integration.realIdentityAccess, false); assert.equal(integration.realModels, 0)
const logPath = 'D:/Temp/harmony-recovery-targeted-tests-sealed.log', log = await readFile(logPath, 'utf8')
assert.match(log, /# pass 21\r?\n/); assert.match(log, /# fail 0\r?\n/)
for (const input of types.sourceInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'type input changed: ' + input.path)

const nativeRoot = resolve('.build/native-controls-device-rc2-6'), parity = []
for (const [path, digest] of Object.entries(sdk.sourceHashes)) {
  assert.equal(hash(await readFile(path)), digest, 'native build input changed: ' + path)
  const name = relative(nativeRoot, path).replaceAll('\\', '/')
  assert.ok(!name.startsWith('../') && name !== '..')
  if (['AppScope/app.json5', 'entry/src/main/ets/product/ProductConfiguration.ets'].includes(name)) continue
  assert.equal(hash(await readFile(join('harmony', name))), digest, 'source/candidate mismatch: ' + name)
  parity.push(name)
}
const app = await read(join(nativeRoot, 'AppScope/app.json5'))
assert.equal(app.app.versionName, '0.0.0-rc2.6'); assert.equal(app.app.bundleName, 'local.dsh.mobile.offlineproduct')
const sourceConfig = await read('product.config.json')
assert.equal(sourceConfig.enabled, false); assert.equal(sourceConfig.core.enabled, false)
const config = await readFile(join(nativeRoot, 'entry/src/main/ets/product/ProductConfiguration.ets'), 'utf8')
assert.match(config, /"deviceBindingMode": true/); assert.match(config, /"enabled": false/)
assert.equal((await read(join(stage, 'package.json'))).version, '0.0.0-first-use.5')
const tools = await read(join(stage, 'build-info.json'))
for (const output of tools.outputs) {
  assert.equal(hash(await readFile(join(stage, output.file))), output.sha256)
  for (const input of output.inputs) assert.equal(hash(await readFile(input.path)), input.sha256)
}

function tar(args) {
  const result = spawnSync('tar.exe', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr); return result.stdout
}
const payload = await readFile(sdk.artifact.path)
assert.equal(hash(payload), sdk.artifact.sha256)
const entries = tar(['-tf', sdk.artifact.path]).trim().split(/\r?\n/)
assert.equal(new Set(entries).size, entries.length)
for (const name of ['module.json', 'ets/modules.abc', 'resources/rawfile/product-rich-document.js', 'resources/rawfile/guest-sdk.js']) assert.ok(entries.includes(name))
const module = JSON.parse(tar(['-xOf', sdk.artifact.path, 'module.json']))
assert.equal(module.app.versionName, app.app.versionName); assert.equal(module.app.bundleName, app.app.bundleName)
for (const name of entries.filter(value => value.startsWith('resources/rawfile/'))) {
  const result = spawnSync('tar.exe', ['-xOf', sdk.artifact.path, name], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0)
  assert.equal(hash(result.stdout), hash(await readFile(join(nativeRoot, 'entry/src/main', name))))
}
async function absent(path) { try { await access(path) } catch (error) { if (error.code === 'ENOENT') return; throw error } throw new Error('Preserve existing candidate: ' + path) }
for (const path of [nativePath, toolsPath, manifestPath]) await absent(path)
// This directory is an unsealed generated candidate, not an installed or previously archived tool.
await copyFile('standalone-relay/FIRST-USE-TOOLS.md', join(stage, 'FIRST-USE.md'))
const allowed = ['FIRST-USE.md', 'build-info.json', 'check-write-scope.mjs', 'config.first-use.proposal.json', 'initialize-public-trust.mjs', 'package.json', 'prepare-public-config.mjs', 'relay-endpoint-timers.json', 'revoke-public-trust.mjs']
assert.deepEqual((await readdir(stage)).sort(), allowed.sort())
const toolFiles = []
for (const file of allowed) { assert.ok((await lstat(join(stage, file))).isFile()); const bytes = await readFile(join(stage, file)); toolFiles.push({ file, bytes: bytes.length, sha256: hash(bytes) }) }
await copyFile(sdk.artifact.path, nativePath, constants.COPYFILE_EXCL)
tar(['-a', '-cf', toolsPath, '-C', stage, ...allowed])
assert.deepEqual(tar(['-tf', toolsPath]).trim().split(/\r?\n/).sort(), allowed.sort())
for (const file of toolFiles) assert.equal(hash(spawnSync('tar.exe', ['-xOf', toolsPath, file.file], { windowsHide: true }).stdout), file.sha256)
const artifact = async path => { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: hash(bytes) } }
const sources = ['src/native-device-product.ts', 'standalone-relay/src/first-use.ts', 'harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/ets/product/NativeDeviceProductOwner.ets', 'harmony/entry/src/main/ets/product/NativeProductOwner.ets', 'tests/relay-config-compatibility.test.mjs', 'tests/device-connection-page.test.mjs', 'integration/device-binding.spec.ts', 'scripts/typecheck-connection-recovery.mjs', 'scripts/prepare-device-native.mjs', 'scripts/build-first-use-relay-tools.mjs']
const result = { at: new Date().toISOString(), version: '0.0.0-rc2.6', native: { ...await artifact(nativePath), signed: false, installed: false, ...module.app, installableOnDeviceClaimed: false }, maintenance: { ...await artifact(toolsPath), version: '0.0.0-first-use.5', files: toolFiles, deployed: false }, nativeSourceParity: parity, sdkEvidence, typesEvidence, integrationEvidence, targeted: { passed: 21, failed: 0, logPath, sha256: hash(log) }, sourceInputs: await Promise.all(sources.map(async path => ({ path, sha256: hash(await readFile(path)) }))), unchangedDesktop: '0.0.0-rc2.5', realModels: 0, remoteAccess: false, realAuthorizationChanged: false, actualDeviceValidated: false, remaining: ['Original-material signing and phone installation require approval', 'Explicit networkkit-v1 requires a separately reviewed compatible relay; legacy server still refuses any Origin header', 'Preserve existing relay revocation epoch/history; do not initialize over it', 'Physical cold resume/reconnect and Session/rich round trips are not validated'] }
await writeFile(manifestPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ manifestPath, native: await artifact(nativePath), maintenance: await artifact(toolsPath), nativeSourceFiles: parity.length, signed: false, installed: false }))

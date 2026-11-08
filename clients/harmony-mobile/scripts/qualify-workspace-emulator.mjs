/** Associate native UI/Host evidence with unchanged sealed packages; this does not qualify a daily profile or a physical phone. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'

const [richPath, devflowPath] = process.argv.slice(2)
assert.ok(richPath?.startsWith('evidence/workspace-emulator-') && devflowPath?.startsWith('evidence/workspace-emulator-'))
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const root = (await json('source.json')).dshRoot
const pointer = await json('evidence/workspace-review-bundle.json'), manifestPath = join(pointer.destination, 'manifest.json'), manifest = await json(manifestPath)
for (const item of manifest.artifacts) assert.equal(sha(await readFile(join(pointer.destination, item.file))), item.sha256)
const checks = []
for (const [path, scope] of [[richPath, 'rich-input-actions-draft-and-Web-lifecycle'], [devflowPath, 'standard-DevFlow-settings-and-readonly-delegation']]) {
  const record = await json(path), native = await json(join(record.world, 'native-acceptance/result.json'))
  assert.equal(record.passed, true); assert.equal(record.packageUnchanged, true); assert.equal(record.tests.failed, 0)
  assert.equal(record.observed.nativeArkWeb, true); assert.equal(record.observed.replayResponses, 4); assert.equal(record.observed.models, 0)
  assert.deepEqual(record.observed.errors, []); assert.equal(record.observed.realEncryptedCarrier, false)
  assert.equal(native.passed, true); assert.equal(native.scope, scope); assert.equal(record.observed.finish.scope, scope)
  assert.deepEqual(native.checks, record.observed.finish.checks); assert.ok(Object.values(native.checks).every(value => value === true))
  for (const [file, hash] of Object.entries(record.packageSha256)) assert.equal(sha(await readFile(isAbsolute(file) ? file : join(root, file))), hash, file)
  assert.ok(manifest.artifacts.some(item => item.sha256 === record.archivePackage.sha256))
  const devflow = manifest.artifacts.find(item => item.name === 'dsh-devflow'); assert.ok(devflow)
  const stage = record.emulatorDevflow?.stage ?? join(record.world, 'devflow/archive-devflow/package')
  for (const item of devflow.inventory) assert.equal(sha(await readFile(join(stage, item.path))), item.sha256, item.path)
  if (scope.startsWith('rich-')) {
    assert.equal(native.checks.guestParentStorageAndNetworkDenied, true)
    assert.equal(record.observed.guestProbeRequests, 0)
  } else {
    const workflow = await json(join(record.world, 'workflow.json'))
    assert.deepEqual(workflow, { standardPackage: true, globalMode: 'auto', sessionMode: 'auto', parentModel: 'main', childModel: 'worker', childEffort: 'high', readonlyCompleted: true, persistedRequestChecked: true, replayResponses: 4, realModels: 0 })
  }
  checks.push({ path, sha256: sha(await readFile(path)), scope, world: record.world, checks: native.checks })
}
const ownershipPath = 'evidence/workspace-native-1793715061648.json', ownership = await json(ownershipPath)
assert.equal(ownership.passed, true); assert.equal(ownership.tests.passed, 54)
for (const [file, hash] of Object.entries(ownership.sourceSha256)) assert.equal(sha(await readFile(file)), hash, file)
assert.ok(!manifest.artifacts.some(item => item.name === '@deepseek-ai/dsh-client-connection'), 'The review bundle must not replace the standard Connection package')
const nativeBuildPath = 'evidence/native-build/2026-11-03T14-11-20-517Z.json', nativeBuild = await json(nativeBuildPath)
assert.equal(nativeBuild.exitCode, 0); assert.equal(sha(await readFile(nativeBuild.artifact.path)), nativeBuild.artifact.sha256)
const sourceHashes = nativeBuild.sourceHashes ?? nativeBuild.sourceSha256
for (const name of ['NativeWebRenderer', 'NativeWorkspaceOwner', 'NativeWorkspaceRich', 'NativeWorkspaceRichGuest']) {
  const suffix = '/entry/src/main/ets/product/' + name + '.ets'
  const entry = Object.entries(sourceHashes).find(([file]) => file.replaceAll('\\', '/').endsWith(suffix)); assert.ok(entry)
  assert.equal(sha(await readFile('harmony' + suffix)), entry[1])
}
const result = { schema: 'harmony-workspace-emulator-validation/1', at: new Date().toISOString(), passed: true,
  manifest: manifestPath, manifestSha256: sha(await readFile(manifestPath)), checks,
  ownership: { path: ownershipPath, tests: 54 }, nativeBuild: { path: nativeBuildPath, sha256: nativeBuild.artifact.sha256 },
  connectionPackageOverridden: false, application: 'local.dsh.mobile.workspacecheck', target: '127.0.0.1:5555',
  carrier: 'test-only HTTP loopback', realModelCalls: 0, dailyProfileChanged: false, installedRuntimeFullyQualified: false,
  remaining: ['native Index task creation choices', 'soft keyboard occlusion and manual typing', 'independent third-party fixed package', 'native memory and performance', 'real encrypted phone/public relay acceptance', 'daily profile package activation', 'full doc-sync'] }
const destination = join(pointer.destination, 'emulator-validation.json')
await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-emulator-validation.json', JSON.stringify({ path: destination, sha256: sha(await readFile(destination)), passed: true }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, scopes: checks.length, dailyProfileChanged: false }))

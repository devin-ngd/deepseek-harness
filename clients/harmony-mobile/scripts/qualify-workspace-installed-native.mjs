/** Tie installed-runtime native UI results to sealed packages, test HAP and the explicit HTTP fixture sources. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'

const paths = process.argv.slice(2); assert.equal(paths.length, 2)
assert.ok(paths.every(path => /^evidence\/workspace-installed-native-(devflow|rich)-[^/]+\.json$/.test(path)))
const json = async file => JSON.parse(await readFile(file, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const contained = (directory, path) => { const child = relative(directory, path); assert.ok(child && !child.startsWith('..') && !isAbsolute(child)) }
const backendPointer = await json('evidence/workspace-installed-validation.json'), backendBytes = await readFile(backendPointer.path)
assert.equal(sha(backendBytes), backendPointer.sha256)
const backend = JSON.parse(backendBytes.toString('utf8')); assert.equal(backend.passed, true); assert.equal(backend.runtime.verifiedFiles, 17257)
const copied = await json('evidence/workspace-installed-runtime.json'); assert.equal(copied.runtime, backend.runtime.path)
assert.equal(sha(await readFile(join(copied.runtime, 'desktop-runtime.json'))), backend.runtime.descriptorSha256)
const review = await json('evidence/workspace-review-bundle.json'), manifestPath = join(review.destination, 'manifest.json'), manifest = await json(manifestPath)
assert.equal(sha(await readFile(manifestPath)), backend.manifestSha256)
for (const artifact of manifest.artifacts) assert.equal(sha(await readFile(join(review.destination, artifact.file))), artifact.sha256)
const checks = []
for (const path of paths) {
  const record = await json(path), observed = record.observed, native = await json(join(record.world, 'native-acceptance/result.json'))
  assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
  assert.ok(['native-devflow', 'native-rich'].includes(record.scenario)); assert.equal(observed.scenario, record.scenario)
  assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
  assert.equal(record.appStartedThroughDshProfile, true); assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0)
  contained(copied.world, record.world); contained(record.world, record.home)
  assert.equal(observed.passed, true); assert.equal(observed.installedServices, true); assert.equal(observed.dailyProfile, false); assert.equal(observed.realModels, 0)
  assert.equal(observed.connectionPackageOverridden, false); assert.equal(observed.native.nativeArkWeb, true); assert.equal(observed.native.realEncryptedCarrier, false)
  assert.equal(observed.native.replayResponses, 4); assert.equal(observed.native.models, 0); assert.deepEqual(observed.native.errors, [])
  assert.equal(native.passed, true); assert.equal(native.nativeArkWeb, true); assert.equal(native.models, 0)
  assert.deepEqual(observed.native.finish.checks, native.checks); assert.ok(Object.values(native.checks).every(value => value === true))
  assert.equal(native.scope, record.scenario === 'native-devflow' ? 'standard-DevFlow-settings-and-readonly-delegation' : 'rich-input-actions-draft-and-Web-lifecycle')
  assert.equal(record.packages.length, 4); assert.deepEqual(record.packages.map(item => item.name), observed.packagesLoaded)
  for (const item of record.packages) {
    contained(record.world, item.stage)
    const artifact = manifest.artifacts.find(row => row.name === item.name); assert.ok(artifact)
    assert.equal(item.sha256, artifact.sha256); assert.equal(item.archive, join(review.destination, artifact.file))
    for (const file of artifact.inventory) assert.equal(sha(await readFile(join(item.stage, file.path))), file.sha256, file.path)
  }
  assert.ok(Object.keys(record.sourceSha256).length >= 7)
  for (const [file, hash] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(file)), hash, file)
  if (record.scenario === 'native-devflow') assert.deepEqual(await json(join(record.world, 'workflow.json')), { standardPackage: true, globalMode: 'auto', sessionMode: 'auto', parentModel: 'main', childModel: 'worker', childEffort: 'high', readonlyCompleted: true, persistedRequestChecked: true, replayResponses: 4, realModels: 0 })
  else { assert.equal(native.checks.guestParentStorageAndNetworkDenied, true); assert.equal(observed.native.guestProbeRequests, 0) }
  checks.push({ path, sha256: sha(await readFile(path)), scenario: record.scenario, world: record.world, scope: native.scope, checks: native.checks, fixtureBundleSha256: sha(await readFile(join(record.world, 'package/index.mjs'))), fixtureSourceSha256: record.sourceSha256 })
}
assert.deepEqual(checks.map(item => item.scenario).sort(), ['native-devflow', 'native-rich'])
const buildPath = 'evidence/native-build/2026-11-03T14-11-20-517Z.json', build = await json(buildPath)
assert.equal(build.exitCode, 0); assert.equal(sha(await readFile(build.artifact.path)), build.artifact.sha256)
const directory = join(review.destination, 'installed-native'); await mkdir(directory)
const hap = join(directory, 'workspace-fixture-unsigned.hap'); await cp(build.artifact.path, hap, { errorOnExist: true, force: false })
assert.equal(sha(await readFile(hap)), build.artifact.sha256)
const result = { schema: 'harmony-workspace-installed-native-validation/1', at: new Date().toISOString(), passed: true,
  backendValidation: { path: backendPointer.path, sha256: backendPointer.sha256 }, manifest: manifestPath, manifestSha256: backend.manifestSha256,
  runtime: backend.runtime, checks, nativeBuild: { path: buildPath, hap, sha256: build.artifact.sha256 },
  application: 'local.dsh.mobile.workspacecheck', target: '127.0.0.1:5555', carrier: 'test-only HTTP loopback',
  shell: 'sealed Harmony package workspace-shell', actualFrontendExecution: true, realModelCalls: 0, dailyProfileChanged: false,
  limits: ['workspace HTTP fixture composes source adapter classes with installed services', 'no packaged device-command activation or encrypted native carrier', 'no full keyboard or performance acceptance', 'no daily profile activation or physical phone'] }
const destination = join(directory, 'validation.json'); await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-installed-native-validation.json', JSON.stringify({ path: destination, sha256: sha(await readFile(destination)), passed: true }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, scopes: checks.map(item => item.scope), realModelCalls: 0 }))

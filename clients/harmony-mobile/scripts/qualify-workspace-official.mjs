/** Freeze unchanged installed-plugin acceptance separately from the mobile-adapted package candidates. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, dirname, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const bootReview = process.argv[2] === '--boot-review'
const [path, buildPath, installPath, productBuildPath] = process.argv.slice(bootReview ? 3 : 2)
const exact = bootReview && process.argv.length === 7
assert.equal(process.argv.length, exact ? 7 : bootReview ? 4 : 3)
assert.match(path, /^evidence\/workspace-installed-native-cipher-official-[^/]+\.json$/)
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const record = await json(path), native = await json(join(record.world, 'native-acceptance/result.json'))
const packaged = record.packagedRelay !== undefined
const candidateLabel = /^evidence\/workspace-cipher-diagnostic-(rc2-\d+)-native-review-project\.json$/.exec(record.nativeProject)?.[1]
assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
assert.equal(record.scenario, 'native-cipher-official'); assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0)
assert.equal(record.observed.native.realEncryptedCarrier, true); assert.equal(record.observed.native.replayResponses, 4)
assert.equal(record.observed.native.cipher.packagedDesktopRelay === true, packaged)
assert.deepEqual(record.observed.native.errors, []); assert.equal(record.observed.realModels, 0); assert.equal(native.models, 0)
assert.equal(native.passed, true); assert.deepEqual(native.checks, record.observed.native.finish.checks)
for (const name of ['officialStandardSettingsSaved', 'officialConversationSlotAndOriginalToggle', 'officialSettingsRestored', 'acceptedThenCompleted', 'exactDraftAndUnresolvedRestored', 'backgroundAndForeground']) assert.equal(native.checks[name], true)
assert.ok(Object.values(native.checks).every(value => value === true))
assert.equal(record.official.unchanged, true); assert.equal(record.official.noMobilePackageChanges, true)
assert.deepEqual(record.official.translationErrors, [])
assert.deepEqual(record.official.translationRequests, [{ provider: 'google', text: 'STANDARD_PLUGIN_REASONING', target: 'ja' }])
assert.equal(record.official.packages.length, 3)
assert.equal(record.official.packages.reduce((count, item) => count + item.files.length, 0), 33)
const settings = await json(join(record.world, 'official-settings.json'))
assert.deepEqual(settings.preferences, { provider: 'google', targetLanguage: 'ja' })
const profilePatch = join(record.home, 'profiles/workspace-review/cordis.patch.yml')
if (bootReview) {
  const { dshRoot } = await json('source.json'), require = createRequire(join(dshRoot, 'package.json'))
  const patch = require('js-yaml').load(await readFile(profilePatch, 'utf8'))
  assert.ok(Array.isArray(patch))
  const entries = patch.filter(row => row.id === 'cot-translation')
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0].config, settings.preferences)
}
let desktopProof, desktopProofPath, originalDeviceEntry
if (packaged) {
  assert.ok(exact)
  const pointer = await json(candidateLabel ? 'evidence/workspace-desktop-command-complete-validation.json' : 'evidence/workspace-desktop-complete-validation.json')
  desktopProofPath = pointer.path
  const bytes = await readFile(desktopProofPath); assert.equal(sha(bytes), pointer.sha256)
  desktopProof = JSON.parse(bytes)
  const mobile = record.packages.find(item => item.id === 'harmony-mobile'); assert.ok(mobile)
  assert.equal(mobile.sha256, desktopProof.sha256); assert.equal(mobile.archive, desktopProof.archive)
  assert.equal(sha(await readFile(mobile.archive)), desktopProof.sha256)
  assert.equal(record.packagedRelay.archiveSha256, desktopProof.sha256)
  originalDeviceEntry = join(mobile.stage, 'lib/device.js')
  const original = await readFile(originalDeviceEntry), fixture = await readFile(record.packagedRelay.fixturePath)
  assert.equal(sha(original), desktopProof.deviceEntrySha256)
  assert.equal(sha(original), record.packagedRelay.entrySha256); assert.equal(sha(fixture), record.packagedRelay.fixtureSha256)
  assert.equal(record.packagedRelay.fixturePath, join(record.world, 'package/device-relay-review.mjs'))
  assert.deepEqual(fixture, Buffer.concat([original, Buffer.from('\nexport { DeviceBindingDesktopRelay };\n')]))
}
const copied = await json('evidence/workspace-installed-runtime.json')
assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
assert.equal(sha(await readFile(join(copied.runtime, 'desktop-runtime.json'))), copied.descriptorSha256)
const project = await json(record.nativeProject), hap = join(project.target, 'entry/build/default/outputs/default/entry-default-unsigned.hap')
const testHapSha256 = sha(await readFile(hap))
let basePointer, productBuild, candidateVersion
if (exact) {
  assert.equal(project.exactProductCore, true)
  assert.match(buildPath, /^evidence\/native-build\/[\w-]+\.json$/)
  assert.match(productBuildPath, /^evidence\/native-build\/[\w-]+\.json$/)
  assert.equal(installPath, 'evidence/workspace-native-admission-install-' + testHapSha256.slice(0, 12) + '.json')
  const build = await json(buildPath), install = await json(installPath)
  assert.equal(build.cwd, project.target); assert.equal(build.artifact.path, hap); assert.equal(build.artifact.sha256, testHapSha256)
  assert.equal(build.exitCode, 0); assert.equal(build.sourceArkTsCompiled, true); assert.equal(build.inputsUnchangedDuringBuild, true); assert.deepEqual(build.signingConfigs, [])
  assert.equal(install.build, buildPath); assert.equal(install.hapSha256, testHapSha256)
  assert.equal(install.bundle, project.bundleName); assert.equal(install.target, '127.0.0.1:5555')
  assert.equal(install.inPlace, true); assert.equal(install.dataCleared, false); assert.equal(install.physicalPhoneAccessed, false); assert.equal(install.before.uid, install.after.uid)
  productBuild = await json(productBuildPath)
  assert.equal(productBuild.exitCode, 0); assert.equal(productBuild.sourceArkTsCompiled, true)
  assert.equal(productBuild.inputsUnchangedDuringBuild, true); assert.deepEqual(productBuild.signingConfigs, [])
  assert.equal(sha(await readFile(productBuild.artifact.path)), productBuild.artifact.sha256)
  const app = (await json(join(productBuild.cwd, 'AppScope/app.json5'))).app
  assert.equal(app.bundleName, 'local.dsh.mobile.offlineproduct'); assert.match(app.versionName, /^0\.0\.0-rc2\.\d+$/)
  candidateVersion = app.versionName
  if (candidateLabel) {
    assert.equal(project.productBuildPath, productBuildPath)
    assert.equal(project.productHapSha256, productBuild.artifact.sha256)
    assert.equal(candidateVersion, '0.0.0-' + candidateLabel.replace(/-(\d+)$/, '.$1'))
  }
  for (const file of ['entry/src/main/ets/product/ProductCore.js', 'entry/src/main/ets/product/NativeProductRichOwner.ets', 'entry/src/main/ets/native/NativeTransientAgreement.ets', 'entry/src/main/ets/native/NativeCryptoPrimitives.ets', 'entry/src/main/resources/rawfile/workspace-document.js',
    ...(candidateLabel ? ['entry/src/main/ets/pages/Index.ets', 'entry/src/main/ets/product/NativeWorkspaceOwner.ets'] : [])]) {
    const input = join(project.target, file)
    assert.equal(sha(await readFile(input)), build.sourceHashes[input])
    const productInput = join(productBuild.cwd, file)
    assert.equal(sha(await readFile(productInput)), productBuild.sourceHashes[productInput])
    assert.equal(build.sourceHashes[input], productBuild.sourceHashes[productInput])
  }
} else {
  basePointer = await json(bootReview ? 'evidence/workspace-native-boot-review-validation.json' : 'evidence/workspace-cipher-validation.json')
  const bytes = await readFile(basePointer.path)
  assert.equal(sha(bytes), basePointer.sha256)
  const base = JSON.parse(bytes); assert.equal(base.passed, true); assert.equal(testHapSha256, base.hapSha256)
}
if (bootReview) {
  assert.ok(candidateLabel || record.nativeProject === 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json')
  assert.equal(native.cleanupPassed, true)
  const preflight = await json(join(record.world, 'native-acceptance/preflight.json'))
  assert.equal(preflight.hostLive, true); assert.equal(preflight.unauthenticatedStatus, 403); assert.equal(preflight.physicalPhoneAccessed, false)
  assert.equal((await json(join(record.world, 'native-acceptance/cleanup.json'))).passed, true)
  assert.equal(record.observed.native.cipher.maxChunkBytes, 524288)
  assert.equal(record.observed.native.cipher.diagnosticFaults, undefined)
  assert.doesNotMatch(await readFile(join(record.world, 'native-acceptance/native-channel.log'), 'utf8'), /DSH_WORKSPACE_RPC .*failure=|workspace request failed; outcome may be unknown/)
}
assert.equal(sha(await readFile('scripts/accept-workspace-emulator.mjs')), native.driverSha256)
for (const [source, expected] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(source)), expected, source)
const review = await json('evidence/workspace-review-bundle.json')
const destination = await mkdtemp(bootReview ? 'evidence/workspace-native-official-boot-' : join(review.destination, 'official-plugin-')), files = []
const save = async (source, file) => {
  const bytes = await readFile(source), target = join(destination, file)
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' })
  files.push({ source, file, bytes: bytes.length, sha256: sha(bytes) })
}
await save(path, 'host.json')
if (exact) {
  await save(buildPath, 'build.json'); await save(installPath, 'emulator-install.json'); await save(hap, 'workspacecheck-unsigned.hap')
  await save(productBuildPath, 'product-build.json'); await save(productBuild.artifact.path, 'product-unsigned.hap')
  await save(record.nativeProject, 'native-project.json'); await save('scripts/prepare-workspace-native-review.mjs', 'sources/scripts/prepare-workspace-native-review.mjs')
  await save(join(record.world, 'package/index.mjs'), 'isolated-profile/host-fixture.mjs')
}
if (packaged) {
  await save(desktopProofPath, 'desktop/validation.json'); await save(desktopProof.archive, 'desktop/harmony-mobile.tgz')
  await save(originalDeviceEntry, 'desktop/device.js'); await save(record.packagedRelay.fixturePath, 'isolated-profile/device-relay-review.mjs')
}
for (const file of ['native-acceptance/result.json', 'official-settings.json', 'observed.json', 'probe.log', 'rich-actions.json']) await save(join(record.world, file), file)
if (bootReview) for (const file of ['preflight.json', 'cleanup.json']) await save(join(record.world, 'native-acceptance', file), 'native-acceptance/' + file)
if (bootReview) await save(profilePatch, 'isolated-profile/cordis.patch.yml')
for (const artifact of native.artifacts) {
  const child = relative(join(record.world, 'native-acceptance'), artifact)
  if (child === 'native-channel.log') { await save(artifact, 'native-acceptance/' + child); continue }
  assert.match(child, /^view-\d+\.json$/)
  await save(artifact, 'native-acceptance/layouts/' + child)
}
for (const item of record.official.packages) {
  const delta = relative(copied.runtime, item.directory); assert.ok(delta && !delta.startsWith('..') && !isAbsolute(delta))
  for (const file of item.files) {
    const source = join(item.directory, file.path)
    assert.equal(sha(await readFile(source)), file.sha256, source)
    await save(source, 'official-packages/' + item.name.replaceAll('/', '_') + '/' + file.path)
  }
}
for (const source of new Set([...Object.keys(record.sourceSha256), 'scripts/prepare-workspace-installed-probe.mjs', 'scripts/accept-workspace-emulator.mjs', 'scripts/qualify-workspace-official.mjs'])) await save(source, 'sources/' + source)
const validation = { passed: true, fullGoalComplete: false, nativeChecks: native.checks, packages: record.official.packages,
  modelReplayResponses: 4, realModels: 0, translationRequests: record.official.translationRequests,
  ...(exact ? { candidateVersion, candidateHapSha256: productBuild.artifact.sha256 } : {}),
  ...(packaged ? { desktopArchiveSha256: desktopProof.sha256, packagedDeviceEntrySha256: desktopProof.deviceEntrySha256, relayFixtureSuffixOnly: true } : {}),
  baseNativeCipherValidation: basePointer, testHapSha256, files,
  limits: ['installed runtime snapshot; no independent npm tarball or upstream release authenticity check', 'package own files inventoried; node_modules dependency edges excluded', 'translation endpoint uses fixed synthetic localhost responses', 'software test identity and opaque encrypted frames over HTTP loopback; no HUKS/WSS or physical phone', 'one unchanged official plugin; arbitrary third-party plugins remain unverified', 'no keyboard or memory performance qualification'] }
const output = join(destination, 'validation.json'); await writeFile(output, JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' })
await writeFile(candidateLabel ? 'evidence/workspace-native-official-' + candidateLabel + '-validation.json' : packaged ? 'evidence/workspace-native-official-packaged-validation.json' : exact ? 'evidence/workspace-native-official-current-validation.json' : bootReview ? 'evidence/workspace-native-official-boot-validation.json' : 'evidence/workspace-official-validation.json', JSON.stringify({ path: output, sha256: sha(await readFile(output)), fullGoalComplete: false }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, ownPackageFiles: 33, files: files.length }))

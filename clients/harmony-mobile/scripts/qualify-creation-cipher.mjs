/** Freeze actual Index creation over the installed device carrier with exact native inputs and persisted choices. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir, mkdtemp } from 'node:fs/promises'
import { join, dirname, relative, isAbsolute, basename } from 'node:path'
import { createHash } from 'node:crypto'

const [path, selectedBuild, selectedInstall, deviceBuildPath, desktopReceiptPath] = process.argv.slice(2)
assert.ok(process.argv.length >= 3 && process.argv.length <= 7)
assert.ok(desktopReceiptPath === undefined || /^evidence\/workspace-desktop-[\w-]+\.json$/.test(desktopReceiptPath))
assert.match(path, /^evidence\/workspace-installed-native-cipher-creation-[^/]+\.json$/)
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const record = await json(path), observed = record.observed.native, native = await json(join(record.world, 'native-acceptance/result.json'))
const candidateLabel = /^evidence\/creation-cipher-(rc2-\d+)-native-review-project\.json$/.exec(record.nativeProject)?.[1]
assert.ok(desktopReceiptPath === undefined || candidateLabel !== undefined)
const workspace = record.scenario === 'native-cipher-creation-workspace'
const work = workspace || record.scenario === 'native-cipher-creation-work', expectedTurns = work ? 4 : 0
assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0); assert.ok(['native-cipher-creation', 'native-cipher-creation-work', 'native-cipher-creation-workspace'].includes(record.scenario))
assert.equal(record.observed.installedServices, true); assert.equal(observed.nativeUi, true); assert.equal(observed.nativePage, 'Index')
assert.equal(observed.realEncryptedCarrier, true); assert.equal(observed.cipher.workspaceGranted, workspace)
assert.equal(observed.cipher.huks, false); assert.equal(observed.cipher.tls, false)
assert.ok(observed.cipher.sentFrames > 5 && observed.cipher.receivedFrames > 8)
assert.equal(observed.createdSessions, 1); assert.equal(observed.modelTurns, expectedTurns); assert.equal(observed.replayResponses, expectedTurns); assert.equal(observed.realModels, 0)
assert.equal(observed.defaultUnchanged, true); assert.deepEqual(observed.errors, [])
assert.equal(native.passed, true); assert.equal(native.models, 0); assert.deepEqual(native.checks, observed.finish.checks)
assert.equal(native.checks.nativePresetModelAndEffortSelected, true); assert.equal(native.checks.createdAndOpenedWithoutModel, true)
if (work) {
  assert.equal(native.checks.selectedModelExecutedFourNativePrompts, true)
  assert.equal(native.checks.nativeSessionLoadedWithoutError, true); assert.equal(observed.cipher.nativeExecutor, true)
  assert.deepEqual(observed.requests, Array.from({ length: 4 }, () => ({ sessionId: observed.createdId, ...observed.selection })))
}
if (workspace) {
  assert.ok(selectedInstall, 'An in-place test HAP install must be recorded for the workspace path')
  assert.equal(native.nativeArkWeb, true)
  assert.equal(native.checks.nativeCreatedWorkspaceLoaded, true)
  assert.equal(native.checks.nativeCreatedDraftRestored, true)
}
if (candidateLabel) {
  assert.ok(workspace && deviceBuildPath)
  assert.equal(native.checks.nativeCreatedPluginPanelOpened, true)
  assert.equal(native.checks.nativeCreatedPanelDraftRestored, true)
  assert.equal(observed.cipher.packagedDesktopRelay, true)
}
assert.equal(observed.preset, 'minimal')
assert.deepEqual(observed.selection, { provider: 'workspace-creation-replay', model: 'worker-model', reasoningEffort: 'high' })
assert.deepEqual(observed.actions, [{ action: 'create', projectId: null, agentPreset: 'minimal', model: observed.selection }])
const project = await json(record.nativeProject)
assert.equal(project.dataProviderOverride, 'CreationCipherProduct'); assert.equal(project.nativeCipher, true)
const productionIndex = 'harmony/entry/src/main/ets/pages/Index.ets', original = await readFile(productionIndex, 'utf8')
assert.equal(sha(Buffer.from(original)), project.productionUiSourceSha256)
const staged = await readFile(join(project.target, 'entry/src/main/ets/pages/Index.ets'), 'utf8')
assert.equal(staged, "import { CreationCipherProduct } from '../fixture/CreationCipherProduct'\n" + original.replace('private product: NativeProductOwner = new NativeProductOwner(productConfiguration)', 'private product: NativeProductOwner = new CreationCipherProduct(productConfiguration)'))
const buildPath = selectedBuild ?? 'evidence/native-build/2026-11-03T20-08-54-826Z.json', build = await json(buildPath)
assert.match(buildPath, /^evidence\/native-build\/[A-Za-z0-9-]+\.json$/)
assert.equal(build.exitCode, 0); assert.equal(build.inputsUnchangedDuringBuild, true); assert.deepEqual(build.signingConfigs, [])
assert.equal(sha(await readFile(build.artifact.path)), build.artifact.sha256)
if (selectedInstall !== undefined) {
  assert.equal(selectedInstall, 'evidence/workspace-native-admission-install-' + build.artifact.sha256.slice(0, 12) + '.json')
  const install = await json(selectedInstall)
  assert.equal(install.build, buildPath); assert.equal(install.hapSha256, build.artifact.sha256)
  assert.equal(install.target, '127.0.0.1:5555'); assert.equal(install.bundle, project.bundleName)
  assert.equal(install.inPlace, true); assert.equal(install.physicalPhoneAccessed, false); assert.equal(install.dataCleared, false)
  assert.equal(install.before.uid, install.after.uid); assert.equal(native.cleanupPassed, true)
}
let deviceBuild, candidateVersion
if (deviceBuildPath !== undefined) {
  assert.ok(workspace && selectedInstall)
  assert.match(deviceBuildPath, /^evidence\/native-build\/[\w-]+\.json$/)
  deviceBuild = await json(deviceBuildPath)
  assert.equal(deviceBuild.exitCode, 0); assert.equal(deviceBuild.sourceArkTsCompiled, true)
  assert.equal(deviceBuild.inputsUnchangedDuringBuild, true); assert.deepEqual(deviceBuild.signingConfigs, [])
  assert.equal(sha(await readFile(deviceBuild.artifact.path)), deviceBuild.artifact.sha256)
  const app = (await json(join(deviceBuild.cwd, 'AppScope/app.json5'))).app
  assert.equal(app.bundleName, 'local.dsh.mobile.offlineproduct'); assert.match(app.versionName, /^0\.0\.0-rc2\.\d+$/)
  candidateVersion = app.versionName
  if (candidateLabel) assert.equal(candidateVersion, '0.0.0-' + candidateLabel.replace(/-(\d+)$/, '.$1'))
  assert.equal(sha(Buffer.from(original)), deviceBuild.sourceHashes[join(deviceBuild.cwd, 'entry/src/main/ets/pages/Index.ets')])
  for (const file of ['entry/src/main/ets/product/ProductCore.js', 'entry/src/main/ets/product/NativeProductRichOwner.ets', 'entry/src/main/ets/product/NativeWorkspaceOwner.ets', 'entry/src/main/resources/rawfile/workspace-document.js']) {
    const input = join(deviceBuild.cwd, file)
    assert.equal(sha(await readFile(input)), deviceBuild.sourceHashes[input])
    assert.equal(deviceBuild.sourceHashes[input], build.sourceHashes[join(build.cwd, file)])
  }
}
const copied = await json('evidence/workspace-installed-runtime.json')
assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
assert.equal(sha(await readFile(join(copied.runtime, 'desktop-runtime.json'))), copied.descriptorSha256)
const review = await json('evidence/workspace-review-bundle.json'), manifest = await json(join(review.destination, 'manifest.json'))
for (const item of record.packages) {
  let expected = manifest.artifacts.find(row => row.file === basename(item.archive))
  if (candidateLabel && item.id === 'harmony-mobile') {
    const pointer = await json(desktopReceiptPath ?? 'evidence/workspace-desktop-command-complete-validation.json')
    const bytes = await readFile(pointer.path); assert.equal(sha(bytes), pointer.sha256)
    expected = JSON.parse(bytes)
    const entry = await readFile(join(item.stage, 'lib/device.js')), fixture = await readFile(record.packagedRelay.fixturePath)
    assert.equal(sha(entry), expected.deviceEntrySha256)
    assert.equal(item.sha256, record.packagedRelay.archiveSha256)
    assert.deepEqual(fixture, Buffer.concat([entry, Buffer.from('\nexport { DeviceBindingDesktopRelay };\n')]))
  }
  assert.ok(expected); assert.equal(item.sha256, expected.sha256); assert.equal(sha(await readFile(item.archive)), expected.sha256)
}
for (const [source, expected] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(source)), expected, source)
assert.equal(sha(await readFile('scripts/accept-workspace-emulator.mjs')), native.driverSha256)
async function find(directory) { return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(row => row.isDirectory() ? find(join(directory, row.name)) : [join(directory, row.name)]))).flat() }
const sessionPath = (await find(join(record.world, 'sessions'))).find(path => path.endsWith(join(observed.createdId, 'session.v4.jsonl'))); assert.ok(sessionPath)
const events = (await readFile(sessionPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
assert.equal(events[0].agentPreset, 'minimal'); assert.ok(events.some(event => event.type === 'model/selection' && JSON.stringify(event.data) === JSON.stringify(observed.selection)))
assert.equal(events.filter(event => event.type === 'turn/start').length, expectedTurns)
if (work) {
  assert.equal(events.filter(event => event.type === 'turn/end' && event.data.reason.kind === 'completed').length, 4)
  const headers = events.filter(event => event.type === 'request/header'); assert.ok(headers.length > 0)
  for (const header of headers) { const { provider, model, reasoningEffort } = header.data.header.config; assert.deepEqual({ provider, model, reasoningEffort }, observed.selection) }
}
const result = workspace ? 'creation-cipher-workspace' : work ? 'creation-cipher-work' : 'creation-cipher'
const destination = await mkdtemp(join(review.destination, result + '-')), files = []
const save = async (source, file) => { const bytes = await readFile(source), target = join(destination, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); files.push({ source, file, bytes: bytes.length, sha256: sha(bytes) }) }
await save(path, 'host.json'); await save(buildPath, 'build.json'); await save(build.artifact.path, 'workspacecheck-unsigned.hap')
if (selectedInstall !== undefined) await save(selectedInstall, 'emulator-install.json')
if (deviceBuild !== undefined) {
  await save(deviceBuildPath, 'product-build.json'); await save(deviceBuild.artifact.path, 'product-unsigned.hap')
}
await save(record.nativeProject, 'native-project.json'); await save(sessionPath, 'created-session.v4.jsonl'); await save(productionIndex, 'production-Index.ets')
for (const file of ['native-acceptance/result.json', 'observed.json', 'probe.log', 'creation-four-response-budget.json']) await save(join(record.world, file), file)
for (const artifact of native.artifacts) {
  const file = relative(join(record.world, 'native-acceptance'), artifact)
  assert.match(file, /^(?:view-\d+\.json|native-channel\.log)$/)
  await save(artifact, file === 'native-channel.log' ? 'native-acceptance/' + file : 'native-acceptance/layouts/' + file)
}
for (const [source, expected] of Object.entries(build.sourceHashes)) { const file = relative(project.target, source); assert.ok(file && !file.startsWith('..') && !isAbsolute(file)); assert.equal(sha(await readFile(source)), expected, source); await save(source, 'native-inputs/' + file.replaceAll('\\', '/')) }
for (const source of new Set([...Object.keys(record.sourceSha256), 'scripts/prepare-creation-native-review.mjs', 'scripts/prepare-workspace-installed-probe.mjs', 'scripts/accept-workspace-emulator.mjs', 'scripts/qualify-creation-cipher.mjs'])) await save(source, 'sources/' + source)
const validation = { passed: true, fullGoalComplete: false, preset: observed.preset, selection: observed.selection, createdSessions: 1, modelTurns: expectedTurns, requests: observed.requests, workspaceGranted: workspace,
  candidateVersion, candidateHapSha256: deviceBuild?.artifact.sha256,
  productionUiSourceSha256: project.productionUiSourceSha256, hapSha256: build.artifact.sha256, nativeChecks: native.checks, cipher: observed.cipher, files,
  limits: ['actual installed preset catalogue; model and effort choices supplied by an offline replay provider', 'software public test identity and opaque encrypted frames over HTTP loopback; HUKS/WSS untested', 'Index provider is substituted in the independent test app; production UI source unchanged', ...(work ? [] : ['no prompt after creation; selected-model dispatch remains unverified in this case']), 'no physical phone or daily activation'] }
const output = join(destination, 'validation.json'); await writeFile(output, JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' })
await writeFile(`evidence/${result}${candidateLabel ? '-' + candidateLabel : selectedInstall === undefined ? '' : '-current'}-validation.json`, JSON.stringify({ path: output, sha256: sha(await readFile(output)), fullGoalComplete: false }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, files: files.length, modelTurns: expectedTurns, workspaceGranted: workspace }))

/** Bind native keyboard checks and threshold-free lifecycle samples to their exact isolated artifacts. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { join, dirname, basename, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'

const paths = process.argv.slice(2); assert.equal(paths.length, 2)
assert.ok(paths.every(path => /^evidence\/workspace-installed-native-(rich|devflow)-[^/]+\.json$/.test(path)))
const json = async file => JSON.parse(await readFile(file, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const contained = (directory, file) => { const child = relative(directory, file); assert.ok(child && !child.startsWith('..') && !isAbsolute(child)) }
const review = await json('evidence/workspace-review-bundle.json'), manifestPath = join(review.destination, 'manifest.json'), manifest = await json(manifestPath)
const prior = await json('evidence/workspace-installed-native-validation.json'); assert.equal(sha(await readFile(prior.path)), prior.sha256)
const priorResult = await json(prior.path); assert.equal(priorResult.passed, true); assert.equal(sha(await readFile(manifestPath)), priorResult.manifestSha256)
const checks = [], rawMemory = []
let diagnostics
for (const path of paths) {
  const record = await json(path)
  assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
  assert.equal(record.keyboardReview, true); assert.equal(record.nativeProject, 'evidence/workspace-keyboard-native-review-project.json')
  assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0); assert.equal(record.appStartedThroughDshProfile, true)
  assert.equal(record.copiedRuntime, priorResult.runtime.path); assert.equal(record.descriptorSha256, priorResult.runtime.descriptorSha256)
  contained(record.world, record.home)
  const observed = record.observed, native = await json(join(record.world, 'native-acceptance/result.json'))
  assert.equal(observed.passed, true); assert.equal(observed.installedServices, true); assert.equal(observed.realModels, 0)
  assert.equal(observed.native.nativeArkWeb, true); assert.equal(observed.native.realEncryptedCarrier, false)
  assert.equal(observed.native.replayResponses, 4); assert.equal(observed.native.models, 0); assert.deepEqual(observed.native.errors, [])
  assert.equal(native.passed, true); assert.equal(native.nativeArkWeb, true); assert.equal(native.models, 0)
  let driverSource
  if (native.driverSha256 !== undefined) {
    driverSource = { path: 'scripts/accept-workspace-emulator.mjs', sha256: native.driverSha256 }
  } else {
    assert.equal(record.scenario, 'native-rich')
    const frozen = await json('evidence/workspace-keyboard-rich-driver.json'); assert.equal(frozen.case, path)
    driverSource = { path: frozen.path, sha256: frozen.sha256 }
  }
  assert.equal(sha(await readFile(driverSource.path)), driverSource.sha256)
  assert.deepEqual(native.checks, observed.native.finish.checks); assert.ok(Object.values(native.checks).every(value => value === true))
  assert.equal(native.checks.nativeKeyboardResize, true); assert.ok(native.keyboardSamples.length >= 2)
  for (const sample of native.keyboardSamples) {
    assert.ok(sample.keyboard.height > 0 && sample.keyboard.areaHeight > 0 && sample.keyboard.top > 0)
    assert.ok(sample.fieldBounds[1] >= sample.web[1] && sample.fieldBounds[3] <= sample.web[3])
    assert.ok(sample.web[3] <= sample.keyboard.window.top + sample.keyboard.top)
  }
  assert.equal(record.packages.length, 4)
  for (const item of record.packages) {
    const artifact = manifest.artifacts.find(row => row.name === item.name); assert.ok(artifact)
    assert.equal(item.sha256, artifact.sha256); assert.equal(sha(await readFile(item.archive)), artifact.sha256); contained(record.world, item.stage)
    for (const file of artifact.inventory) assert.equal(sha(await readFile(join(item.stage, file.path))), file.sha256, file.path)
  }
  let sourceBase = '.'
  if (record.scenario === 'native-rich') { const frozen = await json('evidence/workspace-keyboard-rich-sources.json'); assert.equal(frozen.case, path); sourceBase = frozen.directory }
  for (const [file, hash] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(join(sourceBase, file))), hash, file)
  if (record.scenario === 'native-rich') {
    assert.equal(native.checks.nativeUnicodeAndBackspace, true); assert.equal(native.checks.backDismissesKeyboardWithoutClosingRich, true)
    assert.equal(native.checks.repeatedOpenCloseWithoutModel, true); assert.equal(observed.native.guestProbeRequests, 0)
    assert.equal(native.diagnostics.thresholdFree, true); assert.equal(native.diagnostics.lifecycleSamples.length, 5); assert.equal(native.diagnostics.memorySamples.length, 11)
    assert.deepEqual(native.diagnostics.lifecycleSamples.map(row => row.cycle), [1, 2, 3, 4, 5])
    assert.equal(new Set(native.diagnostics.memorySamples.map(row => row.pid)).size, 1)
    for (const sample of native.diagnostics.lifecycleSamples) for (const key of ['nativeReadyMs', 'nativeCloseMs', 'uiObservedOpenMs', 'uiObservedCloseMs']) assert.ok(Number.isFinite(sample[key]) && sample[key] >= 0)
    for (const sample of native.diagnostics.memorySamples) {
      contained(record.world, sample.path); const bytes = await readFile(sample.path), text = bytes.toString('utf8')
      const value = pattern => { const match = pattern.exec(text); assert.ok(match); return Number(match[1]) }
      rawMemory.push({ ...sample, sha256: sha(bytes), applicationPssKiB: value(/^\s*Total\s+(\d+)\s+/m), arkTsPssKiB: value(/^\s*ark ts heap\s+(\d+)\s+/m), nativeHeapPssKiB: value(/^\s*native heap\s+(\d+)\s+/m), arkwebPaPssKiB: value(/^\s*arkweb-pa heap\s+(\d+)\s+/m) })
    }
    diagnostics = native.diagnostics
  } else { assert.equal(record.scenario, 'native-devflow'); assert.equal(native.checks.standardSettingsAndWorkerHighSaved, true); assert.equal(native.checks.readonlyWorkerCompleted, true) }
  checks.push({ path, sha256: sha(await readFile(path)), scenario: record.scenario, world: record.world, nativePath: join(record.world, 'native-acceptance/result.json'), nativeSha256: sha(await readFile(join(record.world, 'native-acceptance/result.json'))), checks: native.checks, keyboardSamples: native.keyboardSamples, sourceSha256: record.sourceSha256, sourceBase, driverSource })
}
assert.deepEqual(checks.map(row => row.scenario).sort(), ['native-devflow', 'native-rich']); assert.ok(diagnostics)
const project = await json('evidence/workspace-keyboard-native-review-project.json'), buildPath = 'evidence/native-build/2026-11-03T16-31-10-694Z.json', build = await json(buildPath)
assert.equal(build.exitCode, 0); assert.equal(sha(await readFile(build.artifact.path)), build.artifact.sha256)
const stagedFixture = join(project.target, 'entry/src/main/ets/fixture/WorkspaceReview.ets'), fixture = await readFile(stagedFixture, 'utf8')
assert.equal(fixture, (await readFile('integration/native/WorkspaceReview.ets', 'utf8')).replaceAll('../../harmony/entry/src/main/ets/', '../'))
const buildSources = build.sourceHashes ?? build.sourceSha256; assert.equal(buildSources[stagedFixture], sha(fixture))
for (const name of ['NativeWebRenderer', 'NativeWorkspaceOwner', 'NativeWorkspaceRich', 'NativeWorkspaceRichGuest', 'NativeWorkspaceCache']) {
  const suffix = '/entry/src/main/ets/product/' + name + '.ets', item = Object.entries(buildSources).find(([file]) => file.replaceAll('\\', '/').endsWith(suffix)); assert.ok(item)
  assert.equal(sha(await readFile('harmony' + suffix)), item[1])
}
const directory = join(review.destination, 'installed-keyboard'); await mkdir(directory)
const hap = join(directory, 'workspace-keyboard-fixture-unsigned.hap'); await cp(build.artifact.path, hap, { errorOnExist: true, force: false })
assert.equal(sha(await readFile(hap)), build.artifact.sha256)
for (const sample of rawMemory) { const output = join(directory, basename(sample.path)); await cp(sample.path, output, { errorOnExist: true, force: false }); sample.archivedPath = output }
const sourceDirectory = join(directory, 'fixture-sources')
for (const item of checks) for (const file of Object.keys(item.sourceSha256)) {
  const output = join(sourceDirectory, item.scenario, file); await mkdir(dirname(output), { recursive: true }); await cp(join(item.sourceBase, file), output, { errorOnExist: true, force: false })
}
const fixtureOutput = join(sourceDirectory, 'WorkspaceReview.ets'); await cp('integration/native/WorkspaceReview.ets', fixtureOutput, { errorOnExist: true, force: false })
for (const item of checks) { const output = join(sourceDirectory, item.scenario + '-driver.mjs'); await cp(item.driverSource.path, output, { errorOnExist: true, force: false }); item.driverSource.archivedPath = output }
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const pss = rawMemory.map(row => row.applicationPssKiB), baseline = rawMemory.find(row => row.label === 'closed-baseline'), last = rawMemory.find(row => row.label === 'closed-5'); assert.ok(baseline && last)
const result = { schema: 'harmony-workspace-keyboard-validation/1', at: new Date().toISOString(), passed: true,
  manifest: manifestPath, manifestSha256: sha(await readFile(manifestPath)), priorValidation: prior, checks,
  nativeBuild: { path: buildPath, hap, sha256: build.artifact.sha256 },
  measurementCard: { path: 'evidence/workspace-keyboard-measurement-card-20261104.json', sha256: sha(await readFile('evidence/workspace-keyboard-measurement-card-20261104.json')) },
  diagnostics: { ...diagnostics, memorySamples: rawMemory, summary: { nativeReadyMedianMs: median(diagnostics.lifecycleSamples.map(row => row.nativeReadyMs)), nativeCloseMedianMs: median(diagnostics.lifecycleSamples.map(row => row.nativeCloseMs)), applicationPssMinKiB: Math.min(...pss), applicationPssMaxKiB: Math.max(...pss), closedBaselinePssKiB: baseline.applicationPssKiB, finalClosedPssKiB: last.applicationPssKiB, finalClosedDeltaKiB: last.applicationPssKiB - baseline.applicationPssKiB }, boundedRetentionEstablished: false },
  inputControl: { path: 'evidence/workspace-keyboard-input-control-20261104.json', sha256: sha(await readFile('evidence/workspace-keyboard-input-control-20261104.json')) },
  unicodeScope: 'successful automated Chinese BMP input and native backspace; supplementary emoji entry remains unverified',
  realModelCalls: 0, dailyProfileChanged: false, carrier: 'test-only HTTP loopback',
  remaining: ['supplementary IME input outside UITest text/clipboard limitation', 'memory retention over more cycles and total renderer memory', 'physical device and public relay', 'production device activation and daily profile', 'independent fixed third-party package'] }
const destination = join(directory, 'validation.json'); await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-keyboard-validation.json', JSON.stringify({ path: destination, sha256: sha(await readFile(destination)), passed: true }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, diagnostics: result.diagnostics.summary, boundedRetentionEstablished: false }))

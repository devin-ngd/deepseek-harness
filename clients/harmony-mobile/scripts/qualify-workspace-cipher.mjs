/** Freeze native cipher acceptance with exact packages, HAP inputs, native diagnostics and explicit transport limits. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'

const keyboard = process.argv[2] === '--keyboard'
const rpcDiagnostics = process.argv[2] === '--rpc-diagnostics'
const bootReview = process.argv[2] === '--boot-review'
const panelTarget = process.argv[2] === '--plugin-target'
const args = process.argv.slice(keyboard || rpcDiagnostics || bootReview || panelTarget ? 3 : 2)
const builds = args.filter(value => value.startsWith('--build=')), installs = args.filter(value => value.startsWith('--install='))
const deviceBuilds = args.filter(value => value.startsWith('--device-build='))
assert.ok(builds.length <= 1 && installs.length === (panelTarget ? 0 : builds.length))
assert.ok(deviceBuilds.length <= (panelTarget ? 1 : 0))
const current = builds.length === 1
assert.ok(!(rpcDiagnostics || bootReview || panelTarget) || current)
const paths = args.filter(value => !value.startsWith('--build=') && !value.startsWith('--install=') && !value.startsWith('--device-build='))
assert.ok(paths.length >= 1 && paths.length <= 2)
assert.ok(paths.every(path => (panelTarget ? /^evidence\/workspace-installed-native-cipher-plugin-target-[^/]+\.json$/ : /^evidence\/workspace-installed-native-cipher-(rich|devflow)-[^/]+\.json$/).test(path)))
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const pointer = await json('evidence/workspace-review-bundle.json'), manifest = await json(join(pointer.destination, 'manifest.json'))
const copied = await json('evidence/workspace-installed-runtime.json')
assert.equal(sha(await readFile(join(copied.runtime, 'desktop-runtime.json'))), copied.descriptorSha256)
const buildPath = current ? builds[0].slice('--build='.length) : keyboard ? 'evidence/native-build/2026-11-03T21-18-16-405Z.json' : 'evidence/native-build/2026-11-03T18-52-17-145Z.json'
assert.match(buildPath, /^evidence\/native-build\/[A-Za-z0-9T-]+\.json$/)
const build = await json(buildPath)
assert.equal(build.exitCode, 0); assert.equal(build.inputsUnchangedDuringBuild, true); assert.equal(build.signingConfigs.length, 0)
assert.equal(sha(await readFile(build.artifact.path)), build.artifact.sha256)
assert.ok(build.nativeJsImportAudit.records.every(row => row.additionalImports?.some(item => item.module === '@ohos:url' && item.binding === 'default')))
const installPath = current && !panelTarget ? installs[0].slice('--install='.length) : undefined
const install = installPath === undefined ? undefined : await json(installPath)
if (install !== undefined) {
  assert.equal(install.build, buildPath); assert.equal(install.hapSha256, build.artifact.sha256)
  assert.equal(install.target, '127.0.0.1:5555'); assert.equal(install.bundle, 'local.dsh.mobile.workspacecheck')
  assert.equal(install.inPlace, true); assert.equal(install.physicalPhoneAccessed, false); assert.equal(install.before.uid, install.after.uid)
}
const records = []
for (const path of paths) {
  const record = await json(path), native = await json(join(record.world, panelTarget ? 'finish.json' : 'native-acceptance/result.json'))
  assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
  assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0)
  assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
  assert.equal(record.appStartedThroughDshProfile, true)
  assert.equal(record.observed.native.realEncryptedCarrier, true); assert.equal(record.observed.native.replayResponses, panelTarget ? 0 : rpcDiagnostics ? 1 : 4)
  assert.deepEqual(record.observed.native.errors, []); assert.equal(record.observed.realModels, 0)
  assert.equal(native.passed, true); assert.equal(native.models, 0); assert.ok(Object.values(native.checks).every(value => value === true))
  assert.deepEqual(native.checks, record.observed.native.finish.checks)
  if (!panelTarget) assert.equal(native.driverSha256, sha(await readFile('scripts/accept-workspace-emulator.mjs')))
  if (keyboard) {
    assert.equal(record.keyboardReview, true); assert.equal(native.checks.nativeKeyboardResize, true)
    assert.ok(native.keyboardSamples.length >= 4)
    for (const sample of native.keyboardSamples) assert.ok(sample.keyboard.height > 0 && sample.keyboard.areaHeight > 0)
    if (record.scenario === 'native-cipher-devflow') {
      for (const check of ['devflowUnicodeAndBackspace', 'devflowBackPreservesSettingsDraft', 'devflowSettingsRestoredAfterReopen', 'readonlyWorkerCompleted']) assert.equal(native.checks[check], true)
    } else {
      for (const check of ['nativeUnicodeAndBackspace', 'backDismissesKeyboardWithoutClosingRich', 'repeatedOpenCloseWithoutModel']) assert.equal(native.checks[check], true)
      assert.equal(native.diagnostics.lifecycleSamples.length, 5); assert.equal(native.diagnostics.memorySamples.length, 11)
    }
  }
  const channel = record.observed.native.cipher
  const disk = channel.persistedCatalogRows !== undefined
  assert.equal(channel.huks, false); assert.equal(channel.tls, false); assert.ok(channel.sentFrames > 5 && channel.receivedFrames > 8)
  for (const item of record.packages) {
    const expected = manifest.artifacts.find(artifact => artifact.file === basename(item.archive)); assert.ok(expected)
    assert.equal(sha(await readFile(item.archive)), expected.sha256); assert.equal(item.sha256, expected.sha256)
  }
  for (const [source, expected] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(source)), expected, source)
  const log = panelTarget ? '' : await readFile(join(record.world, 'native-acceptance/native-channel.log'), 'utf8')
  if (panelTarget) {
    assert.equal(record.scenario, 'native-cipher-plugin-target')
    assert.equal(record.nativeProject, 'evidence/workspace-plugin-cipher-native-review-project.json')
    assert.equal(record.observed.native.nativeArkWeb, true)
    assert.equal(native.actualNativeIndex, true); assert.equal(native.realStandardPluginExecuted, true)
    assert.equal(native.encryptedCarrier, true); assert.equal(native.unauthenticatedStatus, 403)
    assert.equal(native.target, '127.0.0.1:5555'); assert.equal(native.bundle, 'local.dsh.mobile.workspacecheck')
    assert.equal(native.physicalPhoneAccessed, false); assert.equal(native.dailyProfileUsed, false)
    assert.equal(native.stopped, true); assert.equal(native.forwardRemoved, true)
    assert.equal(native.before.uid, native.after.uid); assert.equal(native.hapSha256, build.artifact.sha256)
    assert.equal(resolve(native.build), resolve(buildPath)); assert.equal(channel.workspaceGranted, true)
    for (const name of ['nativeEncryptedChannelAuthenticated', 'nativePackageOpensStandardDevflowPanel', 'standardSettingsSaved', 'standardSettingsReopened', 'nativeChatDraftRetained']) assert.equal(native.checks[name], true)
    const settings = await json(join(record.world, 'plugin-panel.json'))
    assert.equal(settings.packageName, native.packageName); assert.equal(settings.globalMode, 'auto')
    assert.equal(settings.initialGlobalMode, 'direct'); assert.equal(settings.selectionUnchanged, true)
    assert.equal(settings.sessions, 1); assert.equal(settings.userMessages, 0); assert.equal(settings.turnStarts, 0)
    assert.equal(settings.replayResponses, 0); assert.equal(settings.realModels, 0)
  }
  if (rpcDiagnostics) {
    assert.equal(native.scope, 'native-workspace-rpc-diagnostics')
    assert.equal(native.checks.hostRejectionIdentified, true); assert.equal(native.checks.timeoutIdentified, true)
    assert.equal(native.checks.healthyRendererReady, true)
    assert.deepEqual(channel.diagnosticFaults.map(row => [row.failure, row.cancelled]), [['host-rejected', false], ['timeout', true]])
    assert.ok(channel.diagnosticFaults[1].elapsedMs >= 8000)
    for (const failure of ['unknown-outcome', 'timeout']) {
      assert.equal(log.split(/\r?\n/).filter(line => line.endsWith('DSH_WORKSPACE_RPC operation=rich-appearance failure=' + failure)).length, 1)
    }
  }
  if (bootReview) {
    assert.equal(record.nativeProject, 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json')
    assert.equal(channel.diagnosticFaults, undefined)
    assert.equal(channel.maxChunkBytes, 524288)
    assert.doesNotMatch(log, /DSH_WORKSPACE_RPC .*failure=|workspace request failed; outcome may be unknown/)
    if (record.scenario === 'native-cipher-devflow') {
      assert.equal(native.checks.standardSettingsAndWorkerHighSaved, true)
      assert.equal(native.checks.readonlyWorkerCompleted, true)
      const workflow = await json(join(record.world, 'workflow.json'))
      assert.equal(workflow.parentModel, 'main'); assert.equal(workflow.childModel, 'worker'); assert.equal(workflow.childEffort, 'high')
      assert.equal(workflow.readonlyCompleted, true); assert.equal(workflow.persistedRequestChecked, true)
      assert.equal(workflow.replayResponses, 4); assert.equal(workflow.realModels, 0)
    }
  }
  const retainedLogFacts = ['WORKSPACE_CIPHER_NATIVE_AUTHENTICATED', 'WORKSPACE_CIPHER_CREATION_OPTIONS_OK', 'keys-derived', 'peer-verified'].filter(fact => log.includes(fact))
  if (current && !panelTarget) {
    assert.equal(native.cleanupPassed, true)
    assert.equal((await json(join(record.world, 'native-acceptance/cleanup.json'))).passed, true)
    const preflight = await json(join(record.world, 'native-acceptance/preflight.json'))
    assert.equal(preflight.hostLive, true); assert.equal(preflight.unauthenticatedStatus, 403); assert.equal(preflight.physicalPhoneAccessed, false)
    const receiveCap = Number(/WORKSPACE_CIPHER_NATIVE_MAX_CHUNK (\d+)/.exec(log)?.[1])
    assert.ok(receiveCap >= channel.maxChunkBytes, 'Running native policy must cover the actual Host chunk size')
  }
  if (disk) {
    const corpus = await json(join(record.world, 'cold-corpus.json'))
    assert.equal(corpus.generatedBeforeHost, true); assert.equal(corpus.eventsPerSession, 0)
    assert.equal(channel.persistedCatalogRows, corpus.count + 1); assert.equal(channel.paddedDirectoryOnly, false)
    assert.ok(channel.catalogScans > 0 && channel.catalogPeakRows >= channel.persistedCatalogRows)
    if (channel.dataDelivery?.oneWayMs > 0) {
      assert.equal(channel.dataDelivery.oneWayMs, 680)
      assert.ok(channel.dataDelivery.toDesktop > 0 && channel.dataDelivery.fromDesktop > 0)
    }
    if (channel.desktopRelayCaps !== undefined) {
      assert.deepEqual(channel.desktopRelayCaps, { maxPlaintextBytes: 1048576, maxFrameBytes: 2097152, maxQueuedBytes: 4194304 })
      assert.equal(channel.wireMaxRequestBytes, 1048576); assert.equal(channel.phoneMaxPlaintextBytes, 5242880)
      assert.equal(channel.dataDelivery.oneWayMs, 680); assert.equal(channel.maxChunkBytes, 524288)
      assert.ok(channel.sentMaxFrameBytes > 0 && channel.sentMaxFrameBytes <= channel.desktopRelayCaps.maxFrameBytes)
      assert.ok(channel.receivedMaxFrameBytes > 0 && channel.receivedMaxFrameBytes <= channel.desktopRelayCaps.maxFrameBytes)
    }
    assert.doesNotMatch(log, /workspace request failed; outcome may be unknown/)
    let unmounting = false
    for (const line of log.split(/\r?\n/)) {
      if (line.includes('WORKSPACE_FIXTURE_STATE ')) unmounting = line.endsWith('WORKSPACE_FIXTURE_STATE unmount')
      if (line.includes('WORKSPACE_CIPHER_REQUEST_FAILURE ')) assert.ok(unmounting && line.endsWith('TransportError: cancelled'), line)
    }
  }
  if (!current || disk) {
    const negative = await json(join(record.world, 'carrier-negative.json'))
    assert.equal(negative.plaintextBypassStatus, 403); assert.equal(negative.wrongFixtureTokenStatus, 403)
  }
  records.push({ path, world: record.world, scenario: record.scenario, checks: native.checks, cipher: channel, retainedLogFacts })
}
const projectPath = panelTarget ? 'evidence/workspace-plugin-cipher-native-review-project.json' : rpcDiagnostics || bootReview ? 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json' : keyboard ? 'evidence/workspace-cipher-keyboard-native-review-project.json' : 'evidence/workspace-cipher-native-review-project.json'
const project = await json(projectPath)
const panelCandidate = panelTarget && project.productCoreReceipt !== undefined
const exactBootReview = bootReview && project.exactProductCore === true
assert.equal(deviceBuilds.length, panelCandidate ? 1 : 0)
let deviceBuild, deviceBuildPath
if (panelTarget) {
  assert.equal(project.pluginCipher, true); assert.equal(project.nativeCipher, true)
  const source = await readFile(join(project.target, 'entry/src/main/ets/pages/Index.ets'), 'utf8')
  const original = source.replace("import { CreationCipherProduct } from '../fixture/CreationCipherProduct'\n", '')
    .replace('new CreationCipherProduct(productConfiguration, true)', 'new NativeProductOwner(productConfiguration)')
  assert.equal(sha(original), project.productionUiSourceSha256)
}
if (panelCandidate) {
  const core = 'entry/src/main/ets/product/ProductCore.js'
  const product = await json(project.productCoreReceipt)
  deviceBuildPath = deviceBuilds[0].slice('--device-build='.length)
  assert.match(deviceBuildPath, /^evidence\/native-build\/[A-Za-z0-9T-]+\.json$/)
  deviceBuild = await json(deviceBuildPath)
  assert.equal(deviceBuild.cwd, product.target); assert.equal(deviceBuild.exitCode, 0)
  assert.equal(deviceBuild.sourceArkTsCompiled, true); assert.equal(deviceBuild.inputsUnchangedDuringBuild, true)
  assert.equal(deviceBuild.signingConfigs.length, 0); assert.equal(deviceBuild.deviceValidated, false)
  assert.equal(sha(await readFile(deviceBuild.artifact.path)), deviceBuild.artifact.sha256)
  const app = await json(join(product.target, 'AppScope/app.json5'))
  assert.equal(app.app.bundleName, 'local.dsh.mobile.offlineproduct'); assert.equal(app.app.versionName, product.version)
  assert.equal(deviceBuild.sourceHashes[join(product.target, core)], project.productCoreSha256)
  assert.equal(build.sourceHashes[join(project.target, core)], project.productCoreSha256)
  assert.equal(sha(await readFile(join(product.target, core))), project.productCoreSha256)
  for (const record of records) assert.doesNotMatch(await readFile(join(record.world, 'probe.log'), 'utf8'), /WORKSPACE_PANEL_DEVICE_FAILURE/)
}
const disk = records.some(record => record.cipher.persistedCatalogRows !== undefined)
const delayed = records.some(record => record.cipher.dataDelivery?.oneWayMs > 0)
const field = records.some(record => record.cipher.desktopRelayCaps !== undefined)
const currentEvidence = panelCandidate ? 'workspace-native-plugin-follow' : panelTarget ? 'workspace-native-plugin-cipher' : rpcDiagnostics ? 'workspace-native-rpc-diagnostics' : exactBootReview ? 'workspace-native-boot-current' : bootReview ? 'workspace-native-boot-review' : 'workspace-native-admission' + (disk ? '-disk' : '') + (field ? '-field' : delayed ? '-latency' : '')
const destination = await mkdtemp(current ? resolve('evidence/' + currentEvidence + '-') : join(pointer.destination, keyboard ? 'cipher-keyboard-' : 'native-cipher-')), files = []
const save = async (source, file) => {
  const bytes = await readFile(source), path = join(destination, file)
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: 'wx' })
  files.push({ source, file, bytes: bytes.length, sha256: sha(bytes) })
}
await save(buildPath, 'build.json'); await save(build.artifact.path, 'workspacecheck-unsigned.hap')
if (panelCandidate) {
  await save(projectPath, 'emulator-project.json')
  await save(project.productCoreReceipt, 'product-project.json')
  await save(deviceBuildPath, 'product-build.json')
  await save(deviceBuild.artifact.path, 'product-unsigned.hap')
}
if (installPath !== undefined) await save(installPath, 'emulator-install.json')
for (const [source, expected] of Object.entries(build.sourceHashes)) {
  const path = relative(project.target, source)
  assert.ok(path && !path.startsWith('..') && !isAbsolute(path)); assert.equal(sha(await readFile(source)), expected, source)
  await save(source, 'native-inputs/' + path.replaceAll('\\', '/'))
}
for (const record of records) {
  const scenario = record.scenario.replace('native-cipher-', '')
  await save(record.path, scenario + '/host.json')
  const outcomeFiles = panelTarget ? ['finish.json', 'plugin-panel.json'] : ['native-acceptance/result.json', 'native-acceptance/native-channel.log']
  for (const file of [...outcomeFiles, 'observed.json', 'probe.log']) await save(join(record.world, file), scenario + '/' + file)
  if (panelTarget) {
    const native = await json(join(record.world, 'finish.json'))
    assert.match(relative(resolve('.build'), resolve(native.world)), /^workspace-plugin-target-[\w-]+$/)
    const captures = (await readdir(native.world)).filter(file => /^layout-\d+\.json$|^[\w-]+\.jpeg$/.test(file))
    assert.ok(captures.some(file => file === 'standard-plugin-native-entry.jpeg'))
    for (const file of captures) {
      const path = join(native.world, file)
      if (panelCandidate && file.endsWith('.json')) assert.doesNotMatch(await readFile(path, 'utf8'), /unknown-outcome/)
      await save(path, scenario + '/ui/' + file)
    }
  }
  if (current && !panelTarget) for (const file of ['native-acceptance/preflight.json', 'native-acceptance/cleanup.json']) await save(join(record.world, file), scenario + '/' + file)
  if (!current || record.cipher.persistedCatalogRows !== undefined) await save(join(record.world, 'carrier-negative.json'), scenario + '/carrier-negative.json')
  if (record.cipher.persistedCatalogRows !== undefined) await save(join(record.world, 'cold-corpus.json'), scenario + '/cold-corpus.json')
  if (bootReview && scenario === 'devflow') await save(join(record.world, 'workflow.json'), scenario + '/workflow.json')
  if (exactBootReview) {
    await save(join(record.world, 'package/index.mjs'), scenario + '/host-fixture.mjs')
    const native = await json(join(record.world, 'native-acceptance/result.json'))
    for (const artifact of native.artifacts) {
      const local = relative(join(record.world, 'native-acceptance'), artifact)
      if (local === 'native-channel.log') continue
      assert.match(local, /^view-\d+\.json$/)
      await save(artifact, scenario + '/native-acceptance/layouts/' + local)
    }
  }
  if (keyboard) {
    const native = await json(join(record.world, 'native-acceptance/result.json'))
    for (const path of native.artifacts) {
      const local = relative(record.world, path)
      assert.ok(local && !local.startsWith('..') && !isAbsolute(local))
      await save(path, scenario + '/' + local.replaceAll('\\', '/'))
    }
    await save(join(record.world, 'native-project.json'), scenario + '/native-project.json')
    for (const file of await readdir(record.world)) {
      if (/^pointer-(ready|done)-\d+\.json$/.test(file)) await save(join(record.world, file), scenario + '/' + file)
    }
  }
}
const sources = new Set()
for (const record of records) for (const source of Object.keys((await json(record.path)).sourceSha256)) sources.add(source)
for (const source of ['src/native-protocol-shims.mjs', 'scripts/build-product-core.mjs', 'scripts/native-js-imports.mjs', 'scripts/prepare-workspace-native-review.mjs', 'scripts/accept-workspace-emulator.mjs', 'scripts/qualify-workspace-cipher.mjs', 'tests/workspace-native-url.test.mjs', 'tests/phase57-native-imports.test.mjs']) sources.add(source)
for (const source of sources) await save(source, 'sources/' + source)
const validation = { passed: true, scenarios: records, buildSha256: sha(await readFile(buildPath)), hapSha256: build.artifact.sha256,
  ...(current ? { currentProjection: true, installedArtifactVerified: true } : { sourceFix: 'SDK URL parser instead of an absent native browser global' }), keyboard, fullGoalComplete: false, files,
  limits: ['public fixed synthetic identity', 'software signing key; HUKS untested', 'opaque encrypted frames over HTTP loopback; WSS/TLS untested', 'independent emulator app and copied installed profile', panelTarget ? 'zero replay responses and zero real models' : rpcDiagnostics ? 'one replay response, two injected appearance failures, zero real models' : 'four replay responses per case; zero real models', 'early handshake hilog may rotate; retainedLogFacts records only observed lines; complete-flow evidence uses the exact native HAP and acknowledged encrypted requests', ...(disk ? ['cold Session count uses header-only synthetic files; no representative history byte size'] : current ? ['loopback preflight covers unauthenticated rejection; no separate plaintext bypass or wrong-token exchange receipt for this run'] : []), ...(delayed ? ['680 ms is imposed once per direction on encrypted data frames; control traffic and link bandwidth are unshaped'] : []), keyboard ? 'Chinese BMP input and native Backspace; supplementary Unicode, physical phone and daily activation untested; application-only PSS is not a process-tree memory qualification' : 'no physical phone, daily activation, keyboard or performance qualification'] }
await writeFile(join(destination, 'validation.json'), JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' })
const bytes = await readFile(join(destination, 'validation.json'))
await writeFile(current ? 'evidence/' + currentEvidence + '-validation.json' : keyboard ? 'evidence/workspace-cipher-keyboard-validation.json' : 'evidence/workspace-cipher-validation.json', JSON.stringify({ path: join(destination, 'validation.json'), sha256: sha(bytes), scenarios: records.map(record => record.scenario) }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, scenarios: records.map(record => record.scenario), files: files.length }))

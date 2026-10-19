/** Offline behavior and refusal checks for the reviewable connection candidate; no compile, device or signing is invoked. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  CANDIDATE_APPLICATION_PATH, CANDIDATE_CONFIGURATION_PATH, CANDIDATE_DIRECTORIES, CANDIDATE_EVIDENCE_DIRECTORY, CANDIDATE_DIRECTORY_PREFIX, CANDIDATE_FILES, EXAMPLE_ALIAS, EXAMPLE_HOST, FROZEN_ACCEPTANCE,
  assertApprovedCandidate, assertBuildEvidencePolicy, assertCandidateCopy, assertDefaultDisabledSource, assertUnsignedHapEntries,
  candidateDirectoryName, candidateDirectoryPath, configurationBody, createCandidateDirectory, defaultConfigurationBody,
  hashCandidateSource, inspectUnsignedHap, renderConfiguration, sha256, verifyCandidateEvidence, verifyGeneratedRuntime,
} from '../scripts/connection-candidate.mjs'
import { HAP_MODULE, HAP_PACK, buildZip, hapEntries } from './hap-fixture.mjs'

const project = resolve('.')
const platform = JSON.parse(await readFile('harmony/platform.json', 'utf8'))
const defaults = JSON.parse(await readFile('product.config.json', 'utf8'))
const generated = await readFile('harmony/entry/src/main/ets/product/ProductConfiguration.ets', 'utf8')
const expectedHap = { sdkVersion: platform.installedSdkVersion, api: platform.installedSdkApi }
const execFileAsync = promisify(execFile)
const validEvidence = project => ({
  exitCode: 0, cwd: project, daemon: false, sourceArkTsCompiled: true, inputsUnchangedDuringBuild: true,
  nativeJsImportAudit: { passed: true, records: [{ file: 'ProductCore.js', module: '@ohos:util', binding: 'default' }, { file: 'PairedCore.js', module: '@ohos:util', binding: 'default' }] },
  signingConfigs: [], requestPermissions: [{ name: 'ohos.permission.INTERNET' }],
  pairing: false, desktopConnection: false, simulatorValidated: false, arkWebValidated: false, deviceValidated: false, nativeKeyOperationsExecuted: false,
  realModelCalls: 0, sessionUploads: 0,
  artifact: { type: 'unsigned HAP', path: join(project, 'entry/build/default/outputs/default/entry-default-unsigned.hap'), bytes: 10, sha256: 'a'.repeat(64), installableOnDeviceClaimed: false },
})

/**
 * Build one complete synthetic audit fixture in its own temporary candidate and
 * evidence scopes. The candidate tree is a full copy of the maintained source so
 * the audit can recompute every retained input hash.
 */
async function prepareAuditFixture(t) {
  const candidate = await mkdtemp(join(project, '.build/native-controls-connection-audit-'))
  const scope = await mkdtemp(join(project, '.build/connection-candidate-audit-'))
  t.after(() => rm(candidate, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  t.after(() => rm(scope, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  const name = candidate.slice(join(project, '.build').length + 1)
  for (const entry of CANDIDATE_DIRECTORIES) await cp(join(project, 'harmony', entry), join(candidate, entry), { recursive: true, dereference: false })
  for (const file of CANDIDATE_FILES) {
    const target = join(candidate, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(project, 'harmony', file), target)
  }
  const body = configurationBody(defaults, { enabled: true, approvedHost: EXAMPLE_HOST, identityAlias: EXAMPLE_ALIAS, deviceApiVerified: 26 })
  const configurationText = renderConfiguration(body, true)
  await writeFile(join(candidate, CANDIDATE_CONFIGURATION_PATH), configurationText)
  const application = JSON.parse(await readFile(join(candidate, CANDIDATE_APPLICATION_PATH), 'utf8'))
  application.app.bundleName = 'local.dsh.mobile.offlineproduct'
  await writeFile(join(candidate, CANDIDATE_APPLICATION_PATH), JSON.stringify(application, null, 2) + '\n')
  const hapBytes = buildZip(hapEntries()), hapPath = join(candidate, 'entry/build/default/outputs/default/entry-default-unsigned.hap')
  await mkdir(dirname(hapPath), { recursive: true })
  await writeFile(hapPath, hapBytes)
  const sourceHashes = await hashCandidateSource(join(project, 'harmony'))
  const inputHashes = await hashCandidateSource(candidate)
  const buildEvidence = validEvidence(candidate)
  buildEvidence.sourceHashes = Object.fromEntries(Object.entries(inputHashes).map(([path, digest]) => [join(candidate, path), digest]))
  buildEvidence.artifact = { type: 'unsigned HAP', path: hapPath, bytes: hapBytes.length, sha256: sha256(hapBytes), installableOnDeviceClaimed: false }
  const buildPath = join(scope, 'build-evidence.json')
  await writeFile(buildPath, JSON.stringify(buildEvidence, null, 2) + '\n')
  const buildBytes = await readFile(buildPath), hap = inspectUnsignedHap(hapBytes, expectedHap), runtime = await verifyGeneratedRuntime(project)
  const evidence = {
    schema: 'harmony-connection-candidate/1', status: 'passed',
    approval: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 26, installedApi: 26, explicitInputs: true, example: false, deviceApiConfirmed: false },
    defaults: { sourceDefaultDisabled: true, configurationPath: 'harmony/' + CANDIDATE_CONFIGURATION_PATH, configurationSha256: sha256(generated), productConfigSha256: sha256(await readFile('product.config.json')) },
    candidate: { directory: '.build/' + name, inputFiles: Object.keys(inputHashes).length, sourceHashes, inputHashes, configuration: { path: CANDIDATE_CONFIGURATION_PATH, sha256: sha256(configurationText), body } },
    generatedRuntime: runtime,
    build: { evidence: relativePath(buildPath), evidenceSha256: sha256(buildBytes) },
    hap: { bytes: hapBytes.length, sha256: sha256(hapBytes), type: 'unsigned HAP', signatureEntries: [], installableOnDeviceClaimed: false, module: { bundleName: hap.module.app.bundleName, versionName: hap.module.app.versionName, versionCode: hap.module.app.versionCode, compileSdkVersion: hap.module.app.compileSdkVersion, requestPermissions: hap.module.module.requestPermissions }, pack: hap.pack },
    sideEffects: { signing: false, installation: false, hdc: false, deviceIo: false, relay: false, network: false, realModelCalls: 0, grantsCreated: 0, defaultFilesWritten: 0 },
  }
  const evidencePath = join(scope, 'passed.json')
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n')
  return { candidate, evidence, evidencePath, name }
}

test('the default-disabled source and maintained generated configuration are current', () => assertDefaultDisabledSource(defaults, generated))

test('the maintained generated runtimes match their recorded source hashes', async () => {
  const result = await verifyGeneratedRuntime(project)
  assert.equal(result.reports.length, 3); assert.ok(result.sourceHashes > 300)
})

test('explicit offline approval accepts the historical example', () => {
  assert.deepEqual(assertApprovedCandidate({ host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 }), { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 26 })
})

for (const bad of [
  { name: 'empty host', input: { host: '', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'uppercase host', input: { host: 'Dsh.Devinho.Me', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'leading label dash', input: { host: '-dsh.devinho.me', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'single label host', input: { host: 'dsh', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'empty DNS label', input: { host: 'a..devinho.me', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'trailing host dot', input: { host: 'dsh.devinho.me.', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'reserved invalid host', input: { host: 'dsh.devinho.invalid', alias: EXAMPLE_ALIAS, api: 26, installedApi: 26 } },
  { name: 'empty alias', input: { host: EXAMPLE_HOST, alias: '', api: 26, installedApi: 26 } },
  { name: 'whitespace alias', input: { host: EXAMPLE_HOST, alias: 'two words', api: 26, installedApi: 26 } },
  { name: 'dot alias', input: { host: EXAMPLE_HOST, alias: '..', api: 26, installedApi: 26 } },
  { name: 'leading dash alias', input: { host: EXAMPLE_HOST, alias: '-phone', api: 26, installedApi: 26 } },
  { name: 'zero device API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 0, installedApi: 26 } },
  { name: 'unverified device API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 19, installedApi: 26 } },
  { name: 'different device API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 25, installedApi: 26 } },
  { name: 'fractional device API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 26.5, installedApi: 26 } },
  { name: 'string device API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: '26', installedApi: 26 } },
  { name: 'missing installed API', input: { host: EXAMPLE_HOST, alias: EXAMPLE_ALIAS, api: 26, installedApi: undefined } },
]) test('explicit offline approval refuses ' + bad.name, () => assert.throws(() => assertApprovedCandidate(bad.input)))

test('the candidate body enables only the transport approval and preserves every budget', () => {
  const before = JSON.stringify(defaults)
  const body = configurationBody(defaults, { enabled: true, approvedHost: EXAMPLE_HOST, identityAlias: EXAMPLE_ALIAS, deviceApiVerified: 26 })
  const core = JSON.parse(body.corePolicyJson)
  assert.equal(body.enabled, true); assert.equal(body.approvedHost, EXAMPLE_HOST); assert.equal(body.identityAlias, EXAMPLE_ALIAS); assert.equal(body.deviceApiVerified, 26)
  assert.equal(core.enabled, true); assert.equal(core.trustMaxBytes, body.publicTrustMaxBytes)
  for (const key of ['trustMaxBytes', 'transport', 'domain', 'duplicateCap', 'core', 'commandPrefix']) assert.deepEqual(core[key], defaults.core[key])
  assert.equal(body.maxCryptoBytes, defaults.maxCryptoBytes); assert.equal(body.maxTotalSendBytes, defaults.maxTotalSendBytes)
  assert.equal(body.publicTrustMaxBytes, defaults.publicTrustMaxBytes); assert.deepEqual(body.relay, defaults.relay)
  assert.equal(JSON.stringify(defaults), before)
})

for (const bad of [
  { name: 'enabled source', mutate: value => { value.enabled = true } },
  { name: 'source host', mutate: value => { value.approvedHost = EXAMPLE_HOST } },
  { name: 'source alias', mutate: value => { value.identityAlias = EXAMPLE_ALIAS } },
  { name: 'source device API', mutate: value => { value.deviceApiVerified = 26 } },
  { name: 'source core policy', mutate: value => { value.core.enabled = true } },
]) test('default-disabled source refuses ' + bad.name, () => { const value = structuredClone(defaults); bad.mutate(value); assert.throws(() => assertDefaultDisabledSource(value, generated)) })

test('default-disabled source refuses a differing generated configuration', () => assert.throws(() => assertDefaultDisabledSource(defaults, generated.replace('"enabled": false', '"enabled": true'))))

test('candidate names are fresh, prefixed and accepted by the build project selector', () => {
  const first = candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef12'), second = candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef13')
  assert.equal(first, CANDIDATE_DIRECTORY_PREFIX + '202610180534349-abcdef12')
  assert.match(first, /^native-controls-[A-Za-z0-9_-]+$/); assert.notEqual(first, second)
  assert.throws(() => candidateDirectoryName(new Date('invalid'), 'abcdef12'))
  assert.throws(() => candidateDirectoryName(new Date(), 'ABCDEF12'))
})

for (const bad of ['../native-controls-connection-x', 'native-controls-EjhQw5', 'native-controls-connection-a/b', 'native-controls-connection-a\\b', 'native-controls-connection-a.b', resolve('escape'), '']) test('candidate path refuses ' + JSON.stringify(bad), () => assert.throws(() => candidateDirectoryPath(project, bad)))

test('candidate directory creation refuses existing paths and redirected bases', async t => {
  const root = await mkdtemp(join(project, '.build/connection-candidate-test-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  await mkdir(join(root, '.build'))
  const name = candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef12')
  const path = await createCandidateDirectory(root, name)
  assert.equal((await lstat(path)).isDirectory(), true)
  await assert.rejects(() => createCandidateDirectory(root, name), /already exists/)
  const target = join(root, 'redirect-target')
  await mkdir(join(target, '.build'), { recursive: true })
  const link = join(root, 'redirect-root')
  try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) { if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('directory links unavailable: ' + error.code); throw error }
  await assert.rejects(() => createCandidateDirectory(link, candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef13')), /link or redirect/)
  const linkedCandidate = join(root, '.build', candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef14'))
  await symlink(target, linkedCandidate, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(() => createCandidateDirectory(root, candidateDirectoryName(new Date('2026-10-18T05:34:34.972Z'), 'abcdef14')), /already exists/)
})

test('candidate copy accepts only the configuration and bundle differences', () => {
  const configuration = 'entry/src/main/ets/product/ProductConfiguration.ets'
  const before = { 'AppScope/app.json5': 'a'.repeat(64), 'entry/src/main/ets/pages/Index.ets': 'b'.repeat(64), 'platform.json': 'c'.repeat(64), [configuration]: 'e'.repeat(64) }
  const after = { ...before, 'AppScope/app.json5': 'd'.repeat(64), [configuration]: 'f'.repeat(64) }
  const changed = { configuration, application: 'AppScope/app.json5' }
  assert.deepEqual(assertCandidateCopy(before, after, changed), { copied: 4 })
  assert.throws(() => assertCandidateCopy(before, { ...after, 'entry/src/main/ets/pages/Index.ets': 'g'.repeat(64) }, changed), /outside the generated configuration/)
  const missingConfiguration = { ...after }; delete missingConfiguration[configuration]
  assert.throws(() => assertCandidateCopy(before, missingConfiguration, changed), /missing its configuration/)
  const missingApplication = { ...after }; delete missingApplication['AppScope/app.json5']
  assert.throws(() => assertCandidateCopy(before, missingApplication, changed), /missing its configuration/)
  assert.throws(() => assertCandidateCopy(before, { ...after, extra: 'h'.repeat(64) }, changed), /input set differs/)
})

test('unsigned HAP entry names admit application entries and refuse signing metadata', () => {
  assert.deepEqual(assertUnsignedHapEntries(['module.json', 'pack.info', 'ets/modules.abc']), { entryCount: 3 })
  for (const bad of [[], ['META-INF/CERT.RSA'], ['meta-inf/manifest.mf'], ['sign/profile.p7b'], ['.pages.info'], ['a\\b'], ['module.json', 'module.json'], ['../module.json'], ['/module.json']]) assert.throws(() => assertUnsignedHapEntries(bad))
})

test('unsigned HAP inspection accepts a complete contiguous payload', () => {
  const result = inspectUnsignedHap(buildZip(hapEntries()), expectedHap)
  assert.equal(result.entryCount, 3); assert.equal(result.unsignedLayout, true)
  assert.equal(result.module.app.bundleName, 'local.dsh.mobile.offlineproduct')
})

for (const bad of [
  { name: 'signing metadata entry', entries: () => hapEntries({ extra: [{ name: 'META-INF/CERT.RSA', data: 'signature' }] }), error: /signing metadata|signature material/ },
  { name: 'signature material entry', entries: () => hapEntries({ extra: [{ name: '.pages.info', data: 'bitmap' }] }), error: /signature material/ },
  { name: 'duplicate entry', entries: () => [...hapEntries(), { name: 'module.json', data: '{}' }], error: /duplicate/ },
  { name: 'path traversal entry', entries: () => hapEntries({ extra: [{ name: '../module.json', data: '{}' }] }), error: /invalid/ },
  { name: 'inserted signature block', entries: () => hapEntries(), options: { gap: 64 }, error: /signature block or padding/ },
  { name: 'appended signature trailer', entries: () => hapEntries(), options: { trailer: 'PKCS7-signature' }, error: /appended signature/ },
  { name: 'encrypted entry', entries: () => hapEntries().map(entry => entry.name === 'module.json' ? { ...entry, flags: 0x0801 } : entry), error: /encrypted/ },
  { name: 'data descriptor entry', entries: () => hapEntries().map(entry => entry.name === 'module.json' ? { ...entry, flags: 0x0808 } : entry), error: /data descriptor/ },
  { name: 'local name mismatch', entries: () => hapEntries().map(entry => entry.name === 'module.json' ? { ...entry, localName: 'other.json' } : entry), error: /local entry name/ },
  { name: 'local size mismatch', entries: () => hapEntries().map(entry => entry.name === 'module.json' ? { ...entry, localCompressed: 1 } : entry), error: /local entry size/ },
  { name: 'missing module metadata', entries: () => hapEntries().filter(entry => entry.name !== 'module.json'), error: /missing required entry/ },
  { name: 'missing pack metadata', entries: () => hapEntries().filter(entry => entry.name !== 'pack.info'), error: /missing required entry/ },
  { name: 'wrong bundle', entries: () => { const module = structuredClone(HAP_MODULE); module.app.bundleName = 'local.dsh.mobile.lab'; return hapEntries({ module }) }, error: /bundle or version/ },
  { name: 'wrong version name', entries: () => { const module = structuredClone(HAP_MODULE); module.app.versionName = '0.0.1'; return hapEntries({ module }) }, error: /bundle or version/ },
  { name: 'wrong version code', entries: () => { const module = structuredClone(HAP_MODULE); module.app.versionCode = 2; return hapEntries({ module }) }, error: /bundle or version/ },
  { name: 'wrong compile SDK', entries: () => { const module = structuredClone(HAP_MODULE); module.app.compileSdkVersion = '25.0.0.1'; return hapEntries({ module }) }, error: /compile SDK/ },
  { name: 'wrong module type', entries: () => { const module = structuredClone(HAP_MODULE); module.module.type = 'feature'; return hapEntries({ module }) }, error: /permissions or module type/ },
  { name: 'extra permission', entries: () => { const module = structuredClone(HAP_MODULE); module.module.requestPermissions.push({ name: 'ohos.permission.LOCATION' }); return hapEntries({ module }) }, error: /permissions or module type/ },
  { name: 'wrong pack bundle', entries: () => { const pack = structuredClone(HAP_PACK); pack.summary.app.bundleName = 'local.dsh.mobile.lab'; return hapEntries({ pack }) }, error: /pack metadata/ },
  { name: 'wrong pack API', entries: () => { const pack = structuredClone(HAP_PACK); pack.summary.modules[0].apiVersion.target = 25; return hapEntries({ pack }) }, error: /pack metadata/ },
  { name: 'not a zip archive', entries: () => null, options: {}, error: /not a zip archive/ },
]) test('unsigned HAP inspection refuses ' + bad.name, () => {
  const bytes = bad.entries() === null ? Buffer.from('not a zip archive') : buildZip(bad.entries(), bad.options ?? {})
  assert.throws(() => inspectUnsignedHap(bytes, expectedHap), bad.error)
})

test('the retained unsigned HAP also passes the unsigned layout inspection', async t => {
  const path = '.build/native-controls-EjhQw5/entry/build/default/outputs/default/entry-default-unsigned.hap'
  const bytes = await readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (bytes === null) return t.skip('retained unsigned HAP is not present in this checkout')
  const result = inspectUnsignedHap(bytes, expectedHap)
  assert.equal(result.entryCount, 23); assert.equal(result.unsignedLayout, true)
})

test('the retained officially signed HAP is refused by the unsigned inspection', async t => {
  const path = '.build/phase70-signature-verification/exact-candidate-signed.hap'
  const bytes = await readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (bytes === null) return t.skip('retained signed HAP is not present in this checkout')
  assert.throws(() => inspectUnsignedHap(bytes, expectedHap), /signature material|signature block|appended signature/)
})

test('build evidence policy accepts an unsigned INTERNET-only compile', () => assert.equal(assertBuildEvidencePolicy(validEvidence(join(project, '.build', 'native-controls-connection-fixture')), { project: join(project, '.build', 'native-controls-connection-fixture') }).checks.length, 8))

for (const bad of [
  { name: 'non-zero exit', mutate: value => { value.exitCode = 1 } },
  { name: 'foreign project', mutate: value => { value.cwd = join(project, '.build', 'other') } },
  { name: 'daemon', mutate: value => { value.daemon = true } },
  { name: 'missing ArkTS compile', mutate: value => { value.sourceArkTsCompiled = false } },
  { name: 'changed inputs', mutate: value => { value.inputsUnchangedDuringBuild = false } },
  { name: 'failed import audit', mutate: value => { value.nativeJsImportAudit.passed = false } },
  { name: 'missing paired import', mutate: value => { value.nativeJsImportAudit.records.pop() } },
  { name: 'signing configuration', mutate: value => { value.signingConfigs = [{ name: 'default' }] } },
  { name: 'extra permission', mutate: value => { value.requestPermissions = [{ name: 'ohos.permission.INTERNET' }, { name: 'ohos.permission.LOCATION' }] } },
  { name: 'pairing claim', mutate: value => { value.pairing = true } },
  { name: 'desktop connection claim', mutate: value => { value.desktopConnection = true } },
  { name: 'device validation claim', mutate: value => { value.deviceValidated = true } },
  { name: 'model calls', mutate: value => { value.realModelCalls = 1 } },
  { name: 'session uploads', mutate: value => { value.sessionUploads = 1 } },
  { name: 'missing artifact', mutate: value => { value.artifact = null } },
  { name: 'signed artifact claim', mutate: value => { value.artifact.type = 'signed HAP' } },
  { name: 'installable claim', mutate: value => { value.artifact.installableOnDeviceClaimed = true } },
  { name: 'invalid artifact hash', mutate: value => { value.artifact.sha256 = 'not-a-hash' } },
  { name: 'artifact outside project', mutate: value => { value.artifact.path = join(project, 'escape.hap') } },
]) test('build evidence policy refuses ' + bad.name, () => {
  const directory = join(project, '.build', 'native-controls-connection-fixture'), value = validEvidence(directory)
  bad.mutate(value)
  assert.throws(() => assertBuildEvidencePolicy(value, { project: directory }))
})

test('the plan CLI writes nothing and labels example versus explicit inputs', async () => {
  const before = await clientSnapshot()
  const example = await runCandidateCli([])
  assert.equal(example.status, 0, example.stderr)
  const plan = JSON.parse(example.stdout)
  assert.equal(plan.mode, 'plan'); assert.equal(plan.offlineOnly, true); assert.equal(plan.builds, false); assert.equal(plan.writes, 0)
  assert.equal(plan.approval.example, true); assert.equal(plan.approval.explicitInputs, false); assert.equal(plan.approval.deviceApiConfirmed, false)
  assert.ok(plan.warnings.length > 0, 'example mode must be labelled')
  assert.equal(await pathExists(join(project, plan.candidateDirectory)), false)
  assert.deepEqual(await clientSnapshot(), before)
  const explicit = await runCandidateCli(['--host=' + EXAMPLE_HOST, '--alias=' + EXAMPLE_ALIAS, '--api=26'])
  assert.equal(explicit.status, 0, explicit.stderr)
  const explicitPlan = JSON.parse(explicit.stdout)
  assert.equal(explicitPlan.approval.example, false); assert.equal(explicitPlan.approval.explicitInputs, true); assert.equal(explicitPlan.approval.deviceApiConfirmed, false)
  assert.equal(await pathExists(join(project, explicitPlan.candidateDirectory)), false)
  assert.deepEqual(await clientSnapshot(), before)
})

for (const bad of [
  { name: 'compile without explicit inputs', args: ['--compile'], error: /requires explicit/ },
  { name: 'partial explicit plan', args: ['--host=' + EXAMPLE_HOST], error: /requires all of/ },
  { name: 'empty host', args: ['--host=', '--alias=' + EXAMPLE_ALIAS, '--api=26'], error: /host/ },
  { name: 'uppercase host', args: ['--host=Dsh.Devinho.Me', '--alias=' + EXAMPLE_ALIAS, '--api=26'], error: /lowercase/ },
  { name: 'API mismatch', args: ['--host=' + EXAMPLE_HOST, '--alias=' + EXAMPLE_ALIAS, '--api=25'], error: /must equal/ },
  { name: 'non-numeric API', args: ['--host=' + EXAMPLE_HOST, '--alias=' + EXAMPLE_ALIAS, '--api=abc'], error: /positive integer/ },
  { name: 'unknown argument', args: ['--bogus'], error: /Unknown argument/ },
  { name: 'duplicate host', args: ['--host=' + EXAMPLE_HOST, '--host=' + EXAMPLE_HOST, '--alias=' + EXAMPLE_ALIAS, '--api=26'], error: /Duplicate/ },
  { name: 'audit without path', args: ['--audit'], error: /requires one evidence/ },
  { name: 'empty audit path', args: ['--audit='], error: /requires one evidence/ },
  { name: 'audit with candidate inputs', args: ['--audit=x', '--host=' + EXAMPLE_HOST, '--alias=' + EXAMPLE_ALIAS, '--api=26'], error: /does not accept candidate inputs/ },
  { name: 'compile with audit', args: ['--compile', '--audit=x'], error: /cannot be combined/ },
]) test('the CLI refuses ' + bad.name, async () => {
  const before = await clientSnapshot()
  const result = await runCandidateCli(bad.args)
  assert.equal(result.status, 1)
  assert.match(result.stderr, bad.error)
  assert.equal(result.stdout, '')
  assert.deepEqual(await clientSnapshot(), before)
})

test('the audit CLI refuses missing, malformed and non-passed reports without writing', async t => {
  const before = await clientSnapshot()
  const missing = await runCandidateCli(['--audit=.build/does-not-exist.json'])
  assert.equal(missing.status, 1); assert.match(missing.stderr, /unavailable/)
  const root = await mkdtemp(join(project, '.build/connection-candidate-audit-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  const malformed = join(root, 'malformed.json'); await writeFile(malformed, '{')
  const badJson = await runCandidateCli(['--audit=' + relativePath(malformed)])
  assert.equal(badJson.status, 1); assert.match(badJson.stderr, /not valid JSON/)
  const failed = join(root, 'failed.json'); await writeFile(failed, JSON.stringify({ schema: 'harmony-connection-candidate/1', status: 'failed' }))
  const nonPassed = await runCandidateCli(['--audit=' + relativePath(failed)])
  assert.equal(nonPassed.status, 1); assert.match(nonPassed.stderr, /not a passed/)
  assert.deepEqual(await clientSnapshot(), before)
})

test('the audit CLI re-verifies a full retained candidate copy without writing', async t => {
  const fixture = await prepareAuditFixture(t)
  const before = await clientSnapshot()
  const result = await runCandidateCli(['--audit=' + relativePath(fixture.evidencePath)])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.mode, 'audit'); assert.equal(output.status, 'passed'); assert.equal(output.builds, false); assert.equal(output.writes, 0)
  assert.equal(output.hap.sha256, fixture.evidence.hap.sha256); assert.equal(output.candidate, '.build/' + fixture.name)
  assert.ok(output.checks.includes('retained-input-hashes'))
  assert.deepEqual(await clientSnapshot(), before)
})

for (const bad of [
  { name: 'a modified retained source', mutate: fixture => writeFile(join(fixture.candidate, 'entry/src/main/ets/pages/Index.ets'), '// modified retained candidate source\n') },
  { name: 'a deleted retained source', mutate: fixture => rm(join(fixture.candidate, 'entry/src/main/ets/pages/Index.ets')) },
  { name: 'an added retained source', mutate: fixture => writeFile(join(fixture.candidate, 'entry/src/main/ets/pages/AuditExtra.ets'), '// extra retained candidate source\n') },
]) test('the audit refuses ' + bad.name, async t => {
  const fixture = await prepareAuditFixture(t)
  await bad.mutate(fixture)
  await assert.rejects(() => verifyCandidateEvidence(project, fixture.evidence, platform), /retained candidate source inputs differ/)
})

test('documentation and local scripts connect the compiled candidate evidence', async () => {
  const doc = await readFile('docs/connection-candidate.md', 'utf8')
  for (const value of [FROZEN_ACCEPTANCE.test, FROZEN_ACCEPTANCE.check, FROZEN_ACCEPTANCE.compileCommand, CANDIDATE_DIRECTORY_PREFIX, CANDIDATE_EVIDENCE_DIRECTORY, EXAMPLE_HOST, EXAMPLE_ALIAS, '不构成现场授权']) assert.ok(doc.includes(value), 'documentation is missing: ' + value)
  const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts
  assert.ok(scripts['check:connection-candidate'].includes('scripts/check-connection-candidate.mjs'))
  assert.ok(scripts['test:connection-candidate'].includes('tests/connection-candidate.test.mjs'))
  const current = await currentCandidateEvidence()
  const evidencePath = CANDIDATE_EVIDENCE_DIRECTORY + '/' + current.name
  const { candidate, build, hap } = current.evidence
  const docs = new Map([
    ['README.md', await readFile('README.md', 'utf8')],
    ['README.zh.md', await readFile('README.zh.md', 'utf8')],
    ['docs/acceptance.md', await readFile('docs/acceptance.md', 'utf8')],
    ['docs/tasks.md', await readFile('docs/tasks.md', 'utf8')],
    ['docs/HANDOFF-2026-10-18.md', await readFile('docs/HANDOFF-2026-10-18.md', 'utf8')],
    ['docs/connection-candidate.md', doc],
  ])
  for (const [path, text] of docs) {
    assert.ok(text.includes(evidencePath), path + ' must link the passed candidate evidence')
    if (path !== 'docs/connection-candidate.md') assert.ok(text.includes('connection-candidate.md'), path + ' must reference the candidate entry document')
  }
  for (const path of ['README.md', 'README.zh.md']) assert.ok(docs.get(path).includes('node scripts/check-connection-candidate.mjs --audit=' + evidencePath), path + ' must name the read-only audit entry')
  for (const path of ['README.md', 'README.zh.md', 'docs/acceptance.md', 'docs/connection-candidate.md']) assert.ok(docs.get(path).includes(build.evidence), path + ' must link the official build report')
  for (const path of ['docs/acceptance.md', 'docs/connection-candidate.md']) assert.ok(docs.get(path).includes(build.log), path + ' must link the official build log')
  const handoff = docs.get('docs/HANDOFF-2026-10-18.md'), continuation = handoff.slice(handoff.indexOf('## 13.'))
  for (const value of [evidencePath, build.evidence, build.log, String(candidate.inputFiles), String(hap.bytes), hap.sha256]) assert.ok(continuation.includes(value), 'HANDOFF section 13 is missing: ' + value)
  assert.ok(continuation.includes('--audit'), 'HANDOFF section 13 must record the read-only audit result')
  const sidecar = await readFile('README.i18n.yaml', 'utf8')
  assert.ok(sidecar.includes('/dsh-harmony-mobile-client-lab:'), 'README sidecar must retain the pairing record')
})

async function runCandidateCli(args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['scripts/check-connection-candidate.mjs', ...args], { cwd: project, encoding: 'utf8' })
    return { status: 0, stdout, stderr }
  } catch (error) {
    return { status: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

async function currentCandidateEvidence() {
  const names = (await readdir(CANDIDATE_EVIDENCE_DIRECTORY)).filter(name => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}\.json$/.test(name)).sort()
  assert.ok(names.length > 0, 'a passed candidate evidence report must exist')
  const name = names.at(-1)
  const evidence = JSON.parse(await readFile(join(CANDIDATE_EVIDENCE_DIRECTORY, name), 'utf8'))
  assert.equal(evidence.status, 'passed', name + ' must be a passed report')
  return { name, evidence }
}

async function clientSnapshot() {
  return {
    artifacts: await treeHashes(join(project, 'harmony/AppScope')),
    sources: await treeHashes(join(project, 'harmony/entry/src')),
    config: sha256(await readFile('product.config.json')),
    runtimeEvidence: sha256(await readFile('evidence/normal-product-native-build.json')),
    builds: await treeHashes(join(project, 'evidence/native-build')),
    acceptance: await treeHashes(join(project, CANDIDATE_EVIDENCE_DIRECTORY)),
  }
}

async function treeHashes(directory) {
  const hashes = {}
  const walk = async (path, prefix) => {
    let entries
    try { entries = await readdir(path, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    for (const entry of entries) { const child = join(path, entry.name), key = prefix + '/' + entry.name; if (entry.isDirectory()) await walk(child, key); else hashes[key] = sha256(await readFile(child)) }
  }
  await walk(directory, ''); return hashes
}

async function pathExists(path) { try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

function relativePath(path) { return path.slice(project.length + 1).replaceAll('\\', '/') }

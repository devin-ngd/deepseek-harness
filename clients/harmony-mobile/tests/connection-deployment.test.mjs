/** Synthetic sign/install policy and CLI plan checks for the exact connection candidate; no HDC, Java or device action runs. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  ATTEMPT_SCHEMA, AUTHORIZATION, CANDIDATE, PHONE, SIGNING,
  assertAttempt, assertCandidateArtifact, assertCertificateChain, assertDeviceFields, assertDeviceObservation,
  assertHdcInvocation, assertInspectGuard, assertInstalledMetadata, assertInstallGuard, assertLaunchGuard, assertLaunchLayout,
  assertOwnedLayout, assertPayload, assertPreflightGuard, assertPublicIdentity, assertSignGuard, assertUiGuard,
  assertVerifyExistingGuard, assessLayout, controlPoint, findSingleControl, identityCandidates, identityFromNodes,
  installedMetadata, nextCommands, nextRunLabel, parseBundleDump, parseLayoutTree, sanitizeOutput, sha256, targetReference,
} from '../scripts/connection-deployment-lib.mjs'
import { existingIdentity, inputAlias } from '../scripts/connection-deployment.mjs'
import { claimAction, claimedActions } from '../scripts/connection-deployment-claim.mjs'

const project = resolve('.')
const bundle = CANDIDATE.bundleName
const labels = { connected: '已连接电脑', connecting: '正在连接或恢复', disconnected: '未连接', stopped: '连接已停止。请退出后检查配对、网络和授权状态。', connect: '连接电脑', failed: '操作未确认完成。请查看状态；任务可以查询原回执，避免重复发送。' }
const execFileAsync = promisify(execFile)

test('the fixed constants match the reviewed candidate evidence and recorded toolchain', async () => {
  const evidence = JSON.parse(await readFile(CANDIDATE.evidence, 'utf8'))
  assert.equal(evidence.status, 'passed')
  assert.equal(evidence.hap.path, '.build/native-controls-connection-202610180825353-facc28ee/entry/build/default/outputs/default/entry-default-unsigned.hap')
  assert.equal(evidence.hap.bytes, CANDIDATE.bytes)
  assert.equal(evidence.hap.sha256, CANDIDATE.sha256)
  assert.equal(evidence.hap.module.bundleName, CANDIDATE.bundleName)
  assert.equal(evidence.hap.module.versionName, CANDIDATE.versionName)
  assert.equal(evidence.hap.module.versionCode, CANDIDATE.versionCode)
  assert.deepEqual(evidence.hap.module.requestPermissions.map(row => row.name), [...CANDIDATE.permissions])
  assert.equal(evidence.approval.alias, PHONE.alias)
  const sdk = JSON.parse(await readFile('evidence/phase59-pages-info-sdk.json', 'utf8'))
  assert.equal(sdk.officialJarSha256, SIGNING.jarSha256)
  assert.match(PHONE.fingerprint, /^p256-sha256-[0-9a-f]{64}$/)
  assert.match(PHONE.certificateChainSha256, /^[0-9a-f]{64}$/)
  assert.equal(AUTHORIZATION.sentinelApproval, null)
  assert.equal(AUTHORIZATION.fabricatedToken, false)
  assert.equal(ATTEMPT_SCHEMA, 'harmony-connection-deployment/1')
})

test('the candidate artifact guard accepts only the reviewed bytes and digest', () => {
  assert.deepEqual(assertCandidateArtifact({ bytes: CANDIDATE.bytes, sha256: CANDIDATE.sha256 }), { bytes: CANDIDATE.bytes, sha256: CANDIDATE.sha256 })
  for (const bad of [
    { bytes: CANDIDATE.bytes - 1, sha256: CANDIDATE.sha256 },
    { bytes: CANDIDATE.bytes + 1, sha256: CANDIDATE.sha256 },
    { bytes: CANDIDATE.bytes, sha256: '0'.repeat(64) },
    { bytes: CANDIDATE.bytes, sha256: CANDIDATE.sha256.toUpperCase() },
  ]) assert.throws(() => assertCandidateArtifact(bad))
})

test('device fields accept only CMM-AL10 and API 26', () => {
  assert.deepEqual(assertDeviceFields({ model: 'CMM-AL10', api: '26' }), { model: 'CMM-AL10', api: 26 })
  for (const bad of [{ model: 'CMM-AL00', api: '26' }, { model: 'CMM-AL10', api: '25' }, { model: 'CMM-AL10', api: 0 }, { model: undefined, api: '26' }]) assert.throws(() => assertDeviceFields(bad))
})

test('device observation refusals cover missing, extra, wrong-reference and unclean targets', () => {
  assert.equal(targetReference('synthetic-serial'), 'target-' + sha256(Buffer.from('synthetic-serial')).slice(0, 8))
  for (const bad of [
    { targets: [], model: 'CMM-AL10', api: '26' },
    { targets: ['[Empty]'], model: 'CMM-AL10', api: '26' },
    { targets: ['one', 'two'], model: 'CMM-AL10', api: '26' },
    { targets: ['synthetic-serial'], model: 'CMM-AL10', api: '26' },
    { targets: [' synthetic-serial'], model: 'CMM-AL10', api: '26' },
    { targets: ['synthetic\nserial'], model: 'CMM-AL10', api: '26' },
  ]) assert.throws(() => assertDeviceObservation(bad))
})

test('installed metadata accepts the retained bundle and refuses a different bundle, version or permission set', () => {
  assert.deepEqual(assertInstalledMetadata({ bundleName: bundle, versionName: '0.0.0', versionCode: 1 }), { bundleName: bundle, versionName: '0.0.0', versionCode: 1, permissions: undefined })
  assert.deepEqual(assertInstalledMetadata({ bundleName: bundle, versionName: '0.0.0', versionCode: 1, permissions: ['ohos.permission.INTERNET'] }).permissions, ['ohos.permission.INTERNET'])
  for (const bad of [
    { bundleName: 'local.dsh.mobile.lab', versionName: '0.0.0', versionCode: 1 },
    { bundleName: bundle, versionName: '0.0.1', versionCode: 1 },
    { bundleName: bundle, versionName: '0.0.0', versionCode: 2 },
    { bundleName: bundle, versionName: '0.0.0', versionCode: 1, permissions: ['ohos.permission.INTERNET', 'ohos.permission.LOCATION'] },
    { bundleName: bundle, versionName: '0.0.0', versionCode: 1, permissions: [] },
    null,
  ]) assert.throws(() => assertInstalledMetadata(bad))
})

test('the certificate chain guard accepts only the original chain', () => {
  assert.equal(assertCertificateChain(PHONE.certificateChainSha256), PHONE.certificateChainSha256)
  assert.throws(() => assertCertificateChain('0'.repeat(64)))
  assert.throws(() => assertCertificateChain(undefined))
})

const inputEntries = [
  { path: 'module.json', bytes: 10, sha256: 'a'.repeat(64) },
  { path: 'pack.info', bytes: 20, sha256: 'b'.repeat(64) },
]
const pagesInfo = { bytes: 312, sha256: 'c'.repeat(64) }
const signedEntries = [...inputEntries, { path: '.pages.info', ...pagesInfo }]

test('payload comparison accepts identical application entries and exactly one SDK page bitmap', () => {
  assert.deepEqual(assertPayload({ inputEntries, signedEntries, pagesInfo }), { applicationEntryCount: 2, signingMetadataAddition: { path: '.pages.info', ...pagesInfo } })
})

for (const bad of [
  { name: 'changed entry', signed: [{ path: 'module.json', bytes: 11, sha256: 'a'.repeat(64) }, signedEntries[1], signedEntries[2]] },
  { name: 'removed entry', signed: [signedEntries[0], signedEntries[2]] },
  { name: 'extra unknown entry', signed: [...signedEntries, { path: 'extra.txt', bytes: 1, sha256: 'd'.repeat(64) }] },
  { name: 'wrong bitmap digest', pages: { bytes: 312, sha256: 'd'.repeat(64) } },
  { name: 'wrong bitmap length', pages: { bytes: 311, sha256: pagesInfo.sha256 } },
  { name: 'duplicate signed entry', signed: [...signedEntries, signedEntries[0]] },
  { name: 'invalid digest', signed: [{ path: 'module.json', bytes: 10, sha256: 'nope' }, signedEntries[1], signedEntries[2]] },
]) test('payload comparison refuses ' + bad.name, () => assert.throws(() => assertPayload({ inputEntries, signedEntries: bad.signed ?? signedEntries, pagesInfo: bad.pages ?? pagesInfo })))

function attemptFixture() {
  const label = 'connection-deployment-202610180825353-abcdef12'
  return {
    schema: ATTEMPT_SCHEMA, label, createdAt: '2026-10-18T08:25:35.312Z',
    ownedRun: { label, directory: '.build/' + label },
    candidate: { evidence: CANDIDATE.evidence, label: CANDIDATE.label, path: '.build/native-controls-connection-202610180825353-facc28ee/entry/build/default/outputs/default/entry-default-unsigned.hap', bytes: CANDIDATE.bytes, sha256: CANDIDATE.sha256 },
    authorization: { source: AUTHORIZATION.source, choice: AUTHORIZATION.choice, recordedAt: '2026-10-18T08:25:35.312Z', sentinelApproval: null, fabricatedToken: false, note: AUTHORIZATION.note, scope: [...AUTHORIZATION.scope] },
    phone: { server: PHONE.server, targetRef: PHONE.targetRef, model: PHONE.model, api: PHONE.api, alias: PHONE.alias, fingerprint: PHONE.fingerprint, certificateChainSha256: PHONE.certificateChainSha256 },
    signing: { project: SIGNING.project, ide: SIGNING.ide, jarSha256: SIGNING.jarSha256, materialsReused: true, materialsRegenerated: false, privateKeyContentProjected: false, rawArgumentsProjected: false, materialHashes: {} },
    previous: [],
    steps: { prepare: { status: 'completed' }, preflight: { status: 'pending' }, sign: { status: 'pending' }, install: { status: 'pending' }, inspect: { status: 'pending' }, launch: { status: 'pending' } },
    signed: null, preflight: null, install: null, inspect: null, launch: null, identity: null,
    actions: { 'input-alias': { status: 'pending' }, 'existing-identity': { status: 'pending' } },
    sideEffects: {},
  }
}

function preflightPassed(value = attemptFixture()) {
  value.steps.preflight = { status: 'completed' }
  value.preflight = { passed: true }
  return value
}

function signedFixture(value = attemptFixture(), overrides = {}) {
  return {
    schema: 'harmony-connection-deployment-signed/1', label: value.label, verified: true,
    inputSha256: CANDIDATE.sha256, certificateChainSha256: PHONE.certificateChainSha256, payloadIdentical: true,
    signingMetadataAddition: { path: '.pages.info', bytes: 312, sha256: 'c'.repeat(64) }, packageSignerExecutions: 1,
    artifact: { path: '.build/' + value.label + '/candidate-signed.hap', bytes: 5279000, sha256: 'b'.repeat(64) },
    ...overrides,
  }
}

test('attempt ownership and the recorded authorization choice are checked', () => {
  assert.deepEqual(assertAttempt(attemptFixture()), attemptFixture())
  for (const bad of [
    value => { value.schema = 'other/1' },
    value => { value.ownedRun.label = 'connection-deployment-other' },
    value => { value.candidate.sha256 = '0'.repeat(64) },
    value => { value.phone.targetRef = 'target-00000000' },
    value => { value.signing.jarSha256 = '0'.repeat(64) },
    value => { value.authorization.source = 'sentinel' },
    value => { value.authorization.sentinelApproval = 'Sentinel_old' },
    value => { value.authorization.fabricatedToken = true },
  ]) { const value = attemptFixture(); bad(value); assert.throws(() => assertAttempt(value)) }
})

test('preflight runs once after preparation and before signing or installation', () => {
  assert.equal(assertPreflightGuard(attemptFixture()).steps.preflight.status, 'pending')
  const failed = attemptFixture(); failed.steps.preflight = { status: 'failed' }; assert.equal(assertPreflightGuard(failed).steps.preflight.status, 'failed')
  assert.throws(() => assertPreflightGuard(preflightPassed()))
  const signed = attemptFixture(); signed.steps.sign = { status: 'started' }; assert.throws(() => assertPreflightGuard(signed))
})

test('signing is refused without a passed preflight, after one attempt or after a signed result exists', () => {
  assert.equal(assertSignGuard(preflightPassed()).steps.sign.status, 'pending')
  assert.throws(() => assertSignGuard(attemptFixture()))
  const attempted = preflightPassed(); attempted.steps.sign = { status: 'unknown' }; assert.throws(() => assertSignGuard(attempted))
  const signed = preflightPassed(); signed.signed = { verified: true }; assert.throws(() => assertSignGuard(signed))
  const installed = preflightPassed(); installed.steps.install = { status: 'started' }; assert.throws(() => assertSignGuard(installed))
})

test('retained-output verification is available only after a signer attempt or its fixed claim', () => {
  const started = preflightPassed(); started.steps.sign = { status: 'started' }; assert.equal(assertVerifyExistingGuard(started).steps.sign.status, 'started')
  const claimed = preflightPassed(); assert.equal(assertVerifyExistingGuard(claimed, new Set(['sign'])).steps.sign.status, 'pending')
  assert.throws(() => assertVerifyExistingGuard(preflightPassed()))
  assert.throws(() => assertVerifyExistingGuard(attemptFixture()))
  const installStarted = preflightPassed(); installStarted.steps.sign = { status: 'started' }; installStarted.steps.install = { status: 'started' }; assert.throws(() => assertVerifyExistingGuard(installStarted))
})

test('installation requires one verified signed result and refuses every replay', () => {
  const value = preflightPassed(); value.steps.sign = { status: 'completed' }; assert.equal(assertInstallGuard(value, signedFixture(value)).steps.install.status, 'pending')
  const unknown = preflightPassed(); unknown.steps.sign = { status: 'unknown' }; assert.throws(() => assertInstallGuard(unknown, null))
  assert.throws(() => assertInstallGuard(attemptFixture(), signedFixture()))
  const base = preflightPassed(); base.steps.sign = { status: 'completed' }
  for (const bad of [
    signedFixture(base, { verified: false }),
    signedFixture(base, { label: 'connection-deployment-other' }),
    signedFixture(base, { inputSha256: '0'.repeat(64) }),
    signedFixture(base, { certificateChainSha256: '0'.repeat(64) }),
    signedFixture(base, { payloadIdentical: false }),
    signedFixture(base, { signingMetadataAddition: { path: 'other', bytes: 1, sha256: 'c'.repeat(64) } }),
    signedFixture(base, { packageSignerExecutions: 2 }),
  ]) assert.throws(() => assertInstallGuard(base, bad))
  const replayed = preflightPassed(); replayed.steps.sign = { status: 'completed' }; replayed.steps.install = { status: 'unknown' }; assert.throws(() => assertInstallGuard(replayed, signedFixture(replayed)))
})

test('inspection diagnoses a started, unknown or claimed installation but launch requires a known success', () => {
  const started = attemptFixture(); started.steps.install = { status: 'started' }; assert.equal(assertInspectGuard(started).steps.install.status, 'started')
  const claimed = attemptFixture(); assert.equal(assertInspectGuard(claimed, new Set(['install'])).steps.install.status, 'pending')
  assert.throws(() => assertInspectGuard(attemptFixture()))
  const success = preflightPassed(); success.steps.install = { status: 'completed' }; success.install = { success: true }; success.steps.inspect = { status: 'completed' }; success.inspect = { passed: true, installKnown: true }
  assert.equal(assertLaunchGuard(success).steps.launch.status, 'pending')
  const unknown = structuredClone(success); unknown.steps.install = { status: 'unknown' }; unknown.install = { success: false }; assert.throws(() => assertLaunchGuard(unknown))
  const noProof = structuredClone(success); noProof.inspect = { passed: true, installKnown: false }; assert.throws(() => assertLaunchGuard(noProof))
  const launched = structuredClone(success); launched.steps.launch = { status: 'completed' }; assert.throws(() => assertLaunchGuard(launched))
})

test('UI actions require a known install, passed inspection and launch; layout diagnoses an unknown launch', () => {
  const launched = preflightPassed(); launched.steps.install = { status: 'completed' }; launched.install = { success: true }; launched.steps.inspect = { status: 'completed' }; launched.inspect = { passed: true, installKnown: true }; launched.steps.launch = { status: 'completed' }
  assert.equal(assertUiGuard(launched, 'layout').steps.launch.status, 'completed')
  assert.equal(assertUiGuard(launched, 'read-identity').steps.launch.status, 'completed')
  for (const status of ['started', 'unknown']) {
    const repeated = structuredClone(launched); repeated.actions['input-alias'] = { status }; assert.throws(() => assertUiGuard(repeated, 'input-alias'))
    const existing = structuredClone(launched); existing.actions['existing-identity'] = { status }; assert.throws(() => assertUiGuard(existing, 'existing-identity'))
  }
  const unknownLaunch = structuredClone(launched); unknownLaunch.steps.launch = { status: 'unknown' }
  assert.equal(assertUiGuard(unknownLaunch, 'layout').steps.launch.status, 'unknown')
  assert.throws(() => assertUiGuard(unknownLaunch, 'read-identity'))
  const claimedPending = structuredClone(launched); claimedPending.steps.launch = { status: 'pending' }
  assert.equal(assertUiGuard(claimedPending, 'layout', new Set(['launch'])).steps.launch.status, 'pending')
  const noLaunch = structuredClone(launched); noLaunch.steps.launch = { status: 'pending' }; assert.throws(() => assertUiGuard(noLaunch, 'layout'))
  assert.throws(() => assertUiGuard(launched, 'connect'))
})

test('next commands route unknown, failed or claimed outcomes to read-only recovery', () => {
  const prepared = preflightPassed()
  assert.deepEqual(nextCommands(prepared), ['sign'])
  for (const [status, claimed] of [['started', new Set()], ['unknown', new Set()], ['pending', new Set(['sign'])]]) {
    const value = structuredClone(prepared); value.steps.sign = { status }
    assert.deepEqual(nextCommands(value, claimed), ['verify-existing'])
  }
  const unverified = structuredClone(prepared); unverified.steps.sign = { status: 'completed' }
  assert.deepEqual(nextCommands(unverified), ['verify-existing'])
  assert.ok(!nextCommands(unverified).includes('install'))
  const verified = structuredClone(unverified); verified.signed = { verified: true }
  assert.deepEqual(nextCommands(verified), ['install'])
  const signUnknown = structuredClone(verified); signUnknown.steps.sign = { status: 'unknown' }
  assert.deepEqual(nextCommands(signUnknown), ['install'])
  for (const [status, claimed] of [['started', new Set()], ['unknown', new Set()], ['pending', new Set(['install'])]]) {
    const value = structuredClone(verified); value.steps.install = { status }
    assert.deepEqual(nextCommands(value, claimed), ['inspect'])
  }
  const installed = structuredClone(verified); installed.steps.install = { status: 'completed' }; installed.install = { success: true }; installed.steps.inspect = { status: 'completed' }; installed.inspect = { passed: true, installKnown: true }
  assert.deepEqual(nextCommands(installed, new Set(['install'])), ['launch'])
  for (const [status, claimed] of [['started', new Set()], ['unknown', new Set()], ['pending', new Set(['launch'])]]) {
    const value = structuredClone(installed); value.steps.launch = { status }
    assert.deepEqual(nextCommands(value, claimed), ['inspect', 'layout'])
    assert.ok(!nextCommands(value, claimed).includes('launch'))
  }
  const launched = structuredClone(installed); launched.steps.launch = { status: 'completed' }
  assert.deepEqual(nextCommands(launched, new Set(['install', 'launch'])), ['layout', 'input-alias', 'existing-identity', 'read-identity', 'capture'])
  launched.actions['input-alias'] = { status: 'started' }
  assert.ok(!nextCommands(launched).includes('input-alias'))
  assert.ok(nextCommands(launched).includes('read-identity'))
})

const uiLabels = new Map([
  ['product_identity_name', 'identity-name'],
  ['product_identity_existing', 'existing public identity'],
  ['product_connected', labels.connected],
  ['product_connecting', labels.connecting],
  ['product_disconnected', labels.disconnected],
  ['product_connection_stopped', labels.stopped],
  ['product_connect', labels.connect],
  ['product_operation_failed', labels.failed],
])

function launchedFixture() {
  const value = preflightPassed()
  value.steps.install = { status: 'completed' }; value.install = { success: true }
  value.steps.inspect = { status: 'completed' }; value.inspect = { passed: true, installKnown: true }
  value.steps.launch = { status: 'completed' }
  return value
}

function uiActionTree(inputText = '') {
  return {
    attributes: { bundleName: bundle, type: 'Window', visible: 'true' },
    children: [
      { attributes: { bundleName: bundle, type: 'Text', text: labels.disconnected, visible: 'true' } },
      { attributes: { bundleName: bundle, type: 'Button', text: labels.connect, visible: 'true', enabled: 'false' } },
      { attributes: { bundleName: bundle, type: 'TextInput', hint: 'identity-name', text: inputText, visible: 'true', enabled: 'true', bounds: '[10,90][110,150]' } },
      { attributes: { bundleName: bundle, type: 'Button', text: 'existing public identity', visible: 'true', enabled: 'true', bounds: '[10,160][110,220]' } },
    ],
  }
}

function uiActionRuntime(tree, failure = null) {
  const attempt = launchedFixture()
  const calls = { claims: [], statuses: [], inputText: [], click: [], evidence: [] }
  const runtime = {
    loadAttempt: async () => attempt,
    readLabels: async () => uiLabels,
    dumpLayout: async () => ({ serial: 'synthetic-serial', assessment: assessLayout(tree, { bundle }) }),
    claim: async (action, value) => { calls.claims.push([action, value.label]); if (failure?.claim !== undefined) throw failure.claim },
    recordAction: async (value, action, status, extra = {}) => { calls.statuses.push([action, status]); value.actions[action] = { status, ...extra } },
    writeActionEvidence: async (value, action, record) => { calls.evidence.push([action, record]) },
    inputText: async (value, serial, point, alias) => { calls.inputText.push({ serial, point, alias }); if (failure?.input !== undefined) throw failure.input },
    click: async (value, serial, point) => { calls.click.push({ serial, point }); if (failure?.click !== undefined) throw failure.click },
    now: () => '2026-10-18T00:00:00.000Z',
  }
  return { runtime, calls }
}

test('input-alias executes the real action path with native labels and one alias input', async () => {
  const { runtime, calls } = uiActionRuntime(uiActionTree())
  await inputAlias(runtime)
  assert.deepEqual(calls.claims.map(row => row[0]), ['input-alias'])
  assert.deepEqual(calls.statuses.map(row => row[1]), ['started', 'completed'])
  assert.equal(calls.inputText.length, 1)
  assert.equal(calls.inputText[0].alias, PHONE.alias)
  assert.deepEqual(calls.inputText[0].point, ['60', '120'])
  assert.equal(calls.click.length, 0)
  assert.equal(calls.evidence[0][0], 'input-alias')
})

test('existing-identity executes the real action path with one click', async () => {
  const { runtime, calls } = uiActionRuntime(uiActionTree(PHONE.alias))
  await existingIdentity(runtime)
  assert.deepEqual(calls.claims.map(row => row[0]), ['existing-identity'])
  assert.deepEqual(calls.statuses.map(row => row[1]), ['started', 'completed'])
  assert.equal(calls.click.length, 1)
  assert.deepEqual(calls.click[0].point, ['60', '190'])
  assert.equal(calls.inputText.length, 0)
})

test('a failed or claimed UI input leaves no completed evidence', async () => {
  const failed = uiActionRuntime(uiActionTree(), { input: new Error('synthetic input failure') })
  await assert.rejects(inputAlias(failed.runtime), /result is unknown/)
  assert.deepEqual(failed.calls.statuses.map(row => row[1]), ['started', 'unknown'])
  assert.equal(failed.calls.evidence.length, 0)
  const claimed = uiActionRuntime(uiActionTree(), { claim: Object.assign(new Error('claim exists'), { code: 'claim-exists' }) })
  await assert.rejects(inputAlias(claimed.runtime), /claim exists/)
  assert.equal(claimed.calls.statuses.length, 0)
  assert.equal(claimed.calls.inputText.length, 0)
})

test('two independent processes contend for one fixed claim and only one executes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-deployment-claim-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fixture = join(directory, 'claim-child.mjs'), marker = join(directory, 'executed.log')
  const moduleUrl = pathToFileURL(resolve('scripts/connection-deployment-claim.mjs')).href
  await writeFile(fixture, [
    "import { appendFile } from 'node:fs/promises'",
    'import { claimAction } from ' + JSON.stringify(moduleUrl),
    'const [directory, label, action, marker] = process.argv.slice(2)',
    'try { await claimAction({ directory, label, action }) } catch (error) { if (error.code === \'claim-exists\') { console.error(error.message); process.exit(2) } throw error }',
    "await appendFile(marker, 'executed\\n')",
  ].join('\n') + '\n', 'utf8')
  const run = () => execFileAsync(process.execPath, [fixture, directory, 'connection-deployment-race', 'sign', marker], { cwd: project, encoding: 'utf8' })
  const results = await Promise.allSettled([run(), run()])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  const refused = results.find(row => row.status === 'rejected')
  assert.equal(refused.reason.code, 2)
  assert.match(refused.reason.stderr, /claim already exists/)
  assert.deepEqual([...(await claimedActions(directory, 'connection-deployment-race'))], ['sign'])
  const lines = async path => (await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })).trim().split('\n').filter(Boolean)
  assert.equal((await lines(marker)).length, 1)
  await assert.rejects(run(), error => error.code === 2)
  assert.equal((await lines(marker)).length, 1)
  await claimAction({ directory, label: 'connection-deployment-crashed', action: 'install' })
  const crashedMarker = join(directory, 'crashed.log')
  await assert.rejects(execFileAsync(process.execPath, [fixture, directory, 'connection-deployment-crashed', 'install', crashedMarker], { cwd: project, encoding: 'utf8' }), error => error.code === 2)
  assert.equal(await readFile(crashedMarker, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error }), null)
  assert.deepEqual([...(await claimedActions(directory, 'connection-deployment-crashed'))], ['install'])
})

const runDirectory = resolve('.build', 'connection-deployment-test')
const artifactPath = resolve(runDirectory, 'candidate-signed.hap')
const hdcContext = { target: 'synthetic-serial', artifactPath, runDirectory, alias: PHONE.alias }
const hdcBase = (rest, target = hdcContext.target) => ['-p', '-s', PHONE.server, '-t', target, ...rest]

test('the HDC allowlist admits only the documented read-only, in-place install and UI commands', () => {
  assert.equal(assertHdcInvocation(['-p', '-s', PHONE.server, 'list', 'targets'], hdcContext), 'list-targets')
  const cases = [
    [['shell', 'param', 'get', 'const.product.model'], 'device-model'],
    [['shell', 'param', 'get', 'const.ohos.apiversion'], 'device-api'],
    [['shell', 'bm', 'dump', '-n', bundle], 'bundle-metadata'],
    [['shell', 'pidof', bundle], 'process-id'],
    [['shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility'], 'launch'],
    [['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', '/data/local/tmp/connection-deployment-layout-123.json'], 'layout'],
    [['file', 'recv', '/data/local/tmp/connection-deployment-layout-123.json', join(runDirectory, 'layout.json')], 'receive-file'],
    [['shell', 'snapshot_display', '-f', '/data/local/tmp/connection-deployment-capture-123.jpeg'], 'capture'],
    [['shell', 'uitest', 'uiInput', 'inputText', '10', '20', PHONE.alias], 'input-text'],
    [['shell', 'uitest', 'uiInput', 'click', '10', '20'], 'click'],
    [['install', '-r', artifactPath], 'install-in-place'],
  ]
  for (const [rest, expected] of cases) assert.equal(assertHdcInvocation(hdcBase(rest), hdcContext), expected)
})

for (const bad of [
  { name: 'different server', args: ['-p', '-s', '127.0.0.1:8711', 'list', 'targets'] },
  { name: 'server start', args: ['start', 'server'] },
  { name: 'unapproved target', args: hdcBase(['shell', 'param', 'get', 'const.product.model'], 'other-serial') },
  { name: 'uninstall', args: hdcBase(['uninstall', bundle]) },
  { name: 'bundle clean', args: hdcBase(['shell', 'bm', 'clean', '-n', bundle]) },
  { name: 'force stop', args: hdcBase(['shell', 'aa', 'force-stop', bundle]) },
  { name: 'reboot', args: hdcBase(['shell', 'reboot']) },
  { name: 'kill', args: hdcBase(['kill']) },
  { name: 'install without -r', args: hdcBase(['install', artifactPath]) },
  { name: 'install a different artifact', args: hdcBase(['install', '-r', resolve(runDirectory, 'other.hap')]) },
  { name: 'remote layout outside the temporary prefix', args: hdcBase(['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', '/data/local/tmp/other.json']) },
  { name: 'receive outside the run directory', args: hdcBase(['file', 'recv', '/data/local/tmp/connection-deployment-layout-123.json', resolve(runDirectory, '..', 'escape.json')]) },
  { name: 'wrong alias input', args: hdcBase(['shell', 'uitest', 'uiInput', 'inputText', '10', '20', 'other-alias']) },
  { name: 'non-numeric click', args: hdcBase(['shell', 'uitest', 'uiInput', 'click', 'x', '20']) },
  { name: 'unknown command', args: hdcBase(['shell', 'rm', '-rf', '/data/local/tmp/x']) },
]) test('the HDC allowlist refuses ' + bad.name, () => assert.throws(() => assertHdcInvocation(bad.args, hdcContext)))

const launchTree = {
  attributes: { bundleName: bundle, type: 'Window', visible: 'true' },
  children: [
    { attributes: { bundleName: bundle, type: 'Text', text: labels.disconnected, visible: 'true' } },
    { attributes: { bundleName: bundle, type: 'Button', text: labels.connect, visible: 'true', enabled: 'false', bounds: '[10,20][110,80]' } },
    { attributes: { bundleName: bundle, type: 'TextInput', hint: 'identity', text: '', visible: 'true', enabled: 'true', bounds: '[10,90][110,150]' } },
  ],
}

test('layout assessment distinguishes the owned window from a foreign overlay and flattens nodes', () => {
  const view = assessLayout(launchTree, { bundle })
  assert.equal(view.owned, true); assert.equal(view.foreign, false); assert.equal(view.nodes.length, 4); assert.equal(view.safe[0].text, undefined)
  assert.deepEqual(parseLayoutTree(launchTree), view.nodes)
  assert.deepEqual(assertOwnedLayout(view), { owned: true, foreign: false })
  const foreign = structuredClone(launchTree); foreign.children.push({ attributes: { bundleName: 'com.other.overlay', visible: 'true' } })
  assert.throws(() => assertOwnedLayout(assessLayout(foreign, { bundle })))
  assert.throws(() => assertOwnedLayout({ owned: false, foreign: false }))
})

test('launch layout must show an inactive connection and a disabled connect control', () => {
  const view = assessLayout(launchTree, { bundle })
  assert.deepEqual(assertLaunchLayout(view, labels), { inactive: true })
  for (const mutate of [
    value => { value.children[0].attributes.text = labels.connected },
    value => { value.children[0].attributes.text = labels.connecting },
    value => { value.children[0].attributes.text = labels.failed },
    value => { value.children[0].attributes.text = 'other' },
    value => { value.children[1].attributes.enabled = 'true' },
  ]) { const tree = structuredClone(launchTree); mutate(tree); assert.throws(() => assertLaunchLayout(assessLayout(tree, { bundle }), labels)) }
})

test('controls are selected by identity with exactly one visible enabled match', () => {
  const nodes = parseLayoutTree(launchTree)
  assert.equal(findSingleControl(nodes, node => node.type === 'TextInput', 'input').hint, 'identity')
  const ambiguous = [...nodes, { ...nodes[3], id: 'second' }]
  assert.throws(() => findSingleControl(ambiguous, node => node.type === 'TextInput', 'input'))
  assert.throws(() => findSingleControl(nodes, node => node.type === 'Button' && node.enabled === 'true', 'button'))
  assert.throws(() => findSingleControl(nodes, node => node.type === 'Missing', 'missing'))
  assert.deepEqual(controlPoint('[10,20][110,80]'), ['60', '50'])
  for (const bad of ['', '[10,20]', '[20,20][20,20]', '[10,20][10,80]', '[a,b][c,d]']) assert.throws(() => controlPoint(bad))
})

const identitySpki = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEZYu9JT1xilfcVm6r8-lhaV59_kBQGKDvyCyubFFRL-JHq6yKIM2AbtXfOvaoKMXj-lZutJcFdIptK6dtpNyRMQ'
const identityFingerprint = 'p256-sha256-0b29f0191fcefa6c712cb153125995545e93f073230e9c8999596e887799a51a'

test('public identity hashes the public SPKI bytes instead of trusting the credentialId text', () => {
  assert.equal(createHash('sha256').update(Buffer.from(identitySpki, 'base64url')).digest('hex'), identityFingerprint.slice('p256-sha256-'.length))
  const expected = { alias: PHONE.alias, fingerprint: identityFingerprint }
  const identity = { credentialId: identityFingerprint, identityAlias: PHONE.alias, publicSpki: identitySpki }
  const nodes = [{ type: 'Text', text: JSON.stringify(identity), visible: 'true' }]
  assert.equal(identityCandidates(nodes, PHONE.alias).length, 1)
  assert.deepEqual(identityFromNodes(nodes, PHONE.alias), identity)
  assert.deepEqual(assertPublicIdentity(identity, expected), identity)
  const wrongSpki = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE-5WlkKoGrEX19OEiYJIGuqrnRGK5Q6pmb-4FqBADyUvsBVajh6mhOR5tzMebHgtKK4saxQdDqPXj1soRmYRO5w'
  assert.notEqual(createHash('sha256').update(Buffer.from(wrongSpki, 'base64url')).digest('hex'), identityFingerprint.slice('p256-sha256-'.length))
  for (const bad of [
    { ...identity, credentialId: 'p256-sha256-' + '0'.repeat(64) },
    { ...identity, identityAlias: 'other' },
    { ...identity, publicSpki: 'not base64!' },
    { ...identity, publicSpki: identitySpki + '=' },
    { ...identity, publicSpki: wrongSpki },
    { ...identity, extra: true },
  ]) assert.throws(() => assertPublicIdentity(bad, expected))
  assert.throws(() => identityFromNodes([], PHONE.alias))
  assert.throws(() => identityFromNodes([{ text: JSON.stringify(identity) }, { text: JSON.stringify(identity) }], PHONE.alias))
})

test('bundle dump parsing and sanitized output keep device identifiers out of evidence', () => {
  const dump = parseBundleDump('noise\n{"name":"local.dsh.mobile.offlineproduct","versionName":"0.0.0","versionCode":1}')
  assert.equal(installedMetadata(dump).bundleName, bundle)
  assert.throws(() => parseBundleDump('no object'))
  assert.throws(() => parseBundleDump('{'))
  const target = 'synthetic-serial'
  const output = sanitizeOutput('path ' + target + ' tail', { target, limit: 20 })
  assert.equal(output.includes(target), false)
  assert.ok(output.length <= 20)
})

test('run labels are fresh, prefixed and validated', () => {
  const first = nextRunLabel(new Date('2026-10-18T08:25:35.312Z'), 'abcdef12'), second = nextRunLabel(new Date('2026-10-18T08:25:35.312Z'), 'abcdef13')
  assert.equal(first, 'connection-deployment-202610180825353-abcdef12')
  assert.notEqual(first, second)
  assert.throws(() => nextRunLabel(new Date('invalid'), 'abcdef12'))
  assert.throws(() => nextRunLabel(new Date(), 'ABC'))
})

test('the plan CLI writes nothing and reports the fixed reviewed candidate', async () => {
  const before = await deploymentSnapshot()
  const defaultPlan = await runCli([])
  assert.equal(defaultPlan.status, 0, defaultPlan.stderr)
  const plan = JSON.parse(defaultPlan.stdout)
  assert.equal(plan.mode, 'plan'); assert.equal(plan.action, 'none')
  assert.equal(plan.candidate.sha256, CANDIDATE.sha256); assert.equal(plan.candidate.bytes, CANDIDATE.bytes); assert.equal(plan.candidate.matchesReviewed, true)
  assert.equal(plan.authorization.sentinelApproval, null); assert.equal(plan.authorization.fabricatedToken, false)
  assert.deepEqual(plan.next.slice(0, 3), ['prepare', 'preflight', 'sign'])
  assert.equal(plan.notExecuted.length, 4)
  assert.deepEqual(await deploymentSnapshot(), before)
  const explicitPlan = await runCli(['plan'])
  assert.equal(explicitPlan.status, 0, explicitPlan.stderr)
  assert.equal(JSON.parse(explicitPlan.stdout).mode, 'plan')
  assert.deepEqual(await deploymentSnapshot(), before)
})

test('the CLI refuses unknown commands and extra arguments without writing', async () => {
  const before = await deploymentSnapshot()
  for (const args of [['connect'], ['prepare', 'extra'], ['install', '--force']]) {
    const result = await runCli(args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Unknown command|Exactly one command/)
    assert.deepEqual(await deploymentSnapshot(), before)
  }
})

test('the entry does not read desktop profiles, credentials or a handwritten approval', async () => {
  const source = await readFile('scripts/connection-deployment.mjs', 'utf8') + await readFile('scripts/connection-deployment-lib.mjs', 'utf8')
  assert.doesNotMatch(source, /\.dsh[\\/]profiles|field-credentials|credentials\.yaml|approval\.json/i)
  assert.doesNotMatch(source, /start server|bm clean|force-stop|uninstall -r/i)
})

test('the deployment entry and its synthetic tests are wired into the package and documentation', async () => {
  const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts
  assert.match(scripts['check:connection-deployment'], /scripts\/connection-deployment\.mjs/)
  assert.match(scripts['test:connection-deployment'], /tests\/connection-deployment\.test\.mjs/)
  const doc = await readFile('docs/connection-deployment.md', 'utf8')
  for (const value of ['scripts/connection-deployment.mjs', 'tests/connection-deployment.test.mjs', 'evidence/connection-deployment/attempt.json', CANDIDATE.sha256, CANDIDATE.label, '未执行', 'Sentinel', '同一版本']) assert.ok(doc.includes(value), 'documentation is missing: ' + value)
  const candidateDoc = await readFile('docs/connection-candidate.md', 'utf8')
  assert.ok(candidateDoc.includes('connection-deployment.md'))
})

async function runCli(args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['scripts/connection-deployment.mjs', ...args], { cwd: project, encoding: 'utf8' })
    return { status: 0, stdout, stderr }
  } catch (error) {
    return { status: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

async function deploymentSnapshot() {
  const names = async path => (await readdir(path).catch(error => { if (error.code === 'ENOENT') return []; throw error })).sort()
  return {
    runs: (await names('.build')).filter(name => name.startsWith('connection-deployment-')),
    evidence: await names('evidence/connection-deployment'),
    attempt: (await names('evidence/connection-deployment')).includes('attempt.json'),
    candidate: sha256(await readFile('.build/native-controls-connection-202610180825353-facc28ee/entry/build/default/outputs/default/entry-default-unsigned.hap')),
  }
}

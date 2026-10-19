/** Freeze only one complete current-code run, with original reports and inspected Chrome evidence; never qualify a native platform. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const full = await json('evidence/regression-final.json'), output = full.output
assert.equal(full.passed, true); assert.equal(full.inputsUnchangedDuringRun, true)
assert.deepEqual(full.counts, { node: 95, 'source-replay': 9, 'bff-replay': 7, 'embedded-child': 2 })
assert.equal(full.previousCasesLost, 0); assert.deepEqual(full.retiredCases, [])
assert.ok(full.checks.every(row => row.result === 'pass'))
const inventory = await json(join(output, 'test-inventory.json'))
assert.deepEqual(inventory.counts, full.counts); assert.equal(inventory.continuity.length, 6)
assert.ok(inventory.continuity.every(row => row.missing.length === 0 && row.lostCases.length === 0))
assert.deepEqual(inventory.retirements, []); assert.equal(inventory.files.find(row => row.path === 'tests/security.test.mjs').count, 6)
const frozenInputs = await json(join(output, 'frozen-inputs.json')), sources = await json(join(output, 'source-hashes.json'))
for (const [path, expected] of Object.entries({ ...frozenInputs, ...sources })) assert.equal(await digest(path), expected, 'Input changed after acceptance: ' + path)
const strictLog = await readFile(join(output, 'strict.txt'), 'utf8'), strict = /strict TypeScript (\S+); (\d+) lab\/integration modules/.exec(strictLog)
assert.ok(strict)
const read = await json(join(output, 'phase6-network.json')), chrome = await json(join(output, 'phase6-browser.json')), native = await json(join(output, 'native-source-handoff.json')), preflight = await json(join(output, 'phase6-native-preflight.json')), qa = await json('evidence/phase7-visual-qa.json')
assert.ok(read.passed && chrome.passed && native.passed && qa.inspected)
assert.equal(await digest(native.bundlePath), native.sha256)
for (const item of qa.screenshots) { assert.equal(item.path.startsWith(output.replaceAll('\\', '/') + '/'), true); assert.equal(await digest(item.path), item.sha256) }
assert.deepEqual(qa.screenshots.map(item => item.width), [360, 480, 1080])
assert.equal(read.modelRequests, 0); assert.equal(read.realModelCalls, 0); assert.equal(read.uploadCalls, 0)
assert.equal(read.listenerClosed, true); assert.ok(Object.values(read.resourceCounts).every(value => value === 0))
assert.equal(full.realModelCalls, 0); assert.equal(full.uploadCalls, 0); assert.equal(full.sourceFifthCallRefused, true)
assert.equal(full.fixedResponsesPerExecutionContext, 4); assert.equal(full.loopbackListenersClosed, true)
assert.equal(chrome.realModelCalls, 0); assert.equal(chrome.uploadCalls, 0)
assert.equal(full.legacyChromeAssertions, 15); assert.equal(full.phase5ChromeAssertions, 15); assert.equal(full.sharedMobileDesktopChromeAssertions, 25)
const ownedHashes = { ...frozenInputs }
async function own(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name).replaceAll('\\', '/')
    if (item.isSymbolicLink()) continue
    if (item.isDirectory()) await own(path); else ownedHashes[path] = await digest(path)
  }
}
await own('harmony')
const summary = {
  phase: 7, generatedAt: new Date().toISOString(), project: resolve('.'), completedBatch: true, mode: 'fixed-replay/synthetic-only',
  fullRegression: { entry: 'node scripts/regression.mjs', report: output + '/summary.json', counts: full.counts, distinctTopLevelTests: full.counts.node + full.counts['source-replay'] + full.counts['bff-replay'], embeddedChildCounting: '2 already exercised inside BFF parents; not added', strict: { typescript: strict[1], modules: Number(strict[2]), passed: true }, chromeAssertionGroups: { legacy: 15, actualBff: 15, sharedMobileDesktop: 25 }, allStagesPassed: true, frozenInputs: output + '/frozen-inputs.json', sourceHashes: output + '/source-hashes.json', inputsUnchangedDuringRunAndAtFreeze: true },
  continuity: { archives: inventory.continuity.map(row => ({ version: row.version, sha256: row.archiveSha256, missingFiles: row.missing.length, lostCases: row.lostCases.length })), retiredCases: [], previousCasesLost: 0, preservedPreviousEvidence: true },
  completedScope: { defaultProvider: 'unpaired/closed; no activation/configuration', configuredHttps: 'live-provider-unavailable before fetch', productionIdentity: 'absent; generated trusted entry excludes mock identity and live transport', approvalReview: 'pure local-review-only; current native source/selection, device grant, Session/action/epoch/revision/expiry; no server endpoint, permit or dispatch', nativeApiWork: 'concrete SDK calls stopped: official OS7 declarations unavailable and related scope has no DevEco/SDK', serviceRead: { projects: read.projects, projectSessions: read.projectSessions, historyMessages: read.historyMessages, image: read.image }, sharedRichContent: chrome.comparisons },
  safety: { fixedResponsesPerExecutionContext: 4, readOnlyModelRequests: 0, realModelCalls: 0, uploadCalls: 0, fifthReplayCallRefused: true, listenersClosed: true, syntheticDataOnly: true, credentialsCreated: false, pairingActivated: false, installedDshChangedOrRestarted: false, networkSecurityChanged: false, devicePermissionsActivated: false, signed: false, installed: false, paid: false, committed: false, pushed: false },
  qualification: { node: true, sourceServiceReplay: true, loopbackBff: true, chromeReferenceCarrier: true, generatedEsmStatic: true, supportedDshProfile: false, sdkMux: false, nativeRuntimeContainer: false, nativeHttpCachePort: false, arkTsCompiled: false, hapBuilt: false, arkWebQualified: false, simulator: false, actualInstalledDesktop: false, wan: false, device: false },
  nativeHandoff: native, toolPreflight: preflight, visualQa: qa,
  blocked: ['Official approved DevEco/SDK version/path and exact phone build/API; verify SDK declarations and minimum API before implementation.', 'App-owned trusted ESM execution/close, native byte-stream/cache/message-port/lifecycle adapters and unsigned compilation.', 'Real desktop approval endpoint; production identity, pairing, secure storage/revoke and standard E2EE require separate authorization.', 'Supported dsh profile/SDK mux, signing, debugging/install/permissions, WAN/certificate/network settings and cellular device end-to-end evidence.'],
  documents: ['docs/phase7-handoff.md', 'docs/native-platform.md', 'docs/security-review.md', 'docs/upgrade-phase7.md', 'docs/regression.md', 'docs/native-first-build.md', 'docs/tasks.md'], ownedHashes,
  rollback: 'Create-only v7 owned-source snapshot after this freeze; v1–v6 retained. No installed DSH, dirty source files, branch history or system settings changed.'
}
await writeFile('evidence/phase7-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log('PASS: phase7 one-run freeze; 111 distinct Node/Vitest tests and 55 Chrome groups; native gaps explicit')

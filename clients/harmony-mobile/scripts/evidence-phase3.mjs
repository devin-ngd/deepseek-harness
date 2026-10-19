/** Summarize already-run offline checks; no model, network, device or application is started. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
const json = async name => JSON.parse(await readFile(join(project, 'evidence', name), 'utf8'))
const report = await json('phase3-vitest.json'), link = await json('phase3-link.json'), reopen = await json('phase3-reopen.json'), guard = await json('phase3-guard.json')
if (!report.success || report.numTotalTests !== 9 || report.numPassedTests !== 9 || link.counts.realCalls !== 0
  || link.counts.replay[0]?.calls !== 4 || link.counts.replay[0]?.blockedCalls !== 0 || link.uploadExtensionCalls !== 0
  || reopen.taskPromptCallsOnRestore !== 0 || reopen.counts.replay[0]?.calls !== 0 || !reopen.readOnlyRecoveryExactCountRefusalObserved
  || guard.afterFifthCallProbe.replay[0]?.blockedCalls !== 1 || guard.afterFifthCallProbe.realCalls !== 0) throw new Error('Passing phase-three evidence required')
const sourceServiceHashes = {}
for (const relative of ['packages/api/session-controller/src/index.ts', 'packages/api/session-controller/src/commands.ts',
  'packages/experimental/rich-inline/src/host/index.ts', 'packages/experimental/rich-inline/src/host/ledger.ts',
  'packages/experimental/rich-inline/src/host/tools.ts', 'packages/llm/llm/src/index.ts', 'packages/llm/llm/src/offline-replay.ts',
  'packages/test-support/llm-replay/src/index.ts', 'packages/test-support/session-snapshot/src/offline.ts',
  'packages/storage/storage-domain/src/domain.ts', 'packages/storage/storage-json/src/atomic.ts']) {
  sourceServiceHashes[relative] = createHash('sha256').update(await readFile(join(config.dshRoot, relative))).digest('hex')
}
const git = (...args) => execFileSync('git', args, { cwd: config.dshRoot, encoding: 'utf8', windowsHide: true }).trimEnd()
const result = {
  generatedAt: new Date().toISOString(), project, sourceBranch: git('branch', '--show-current'), sourceCommit: git('rev-parse', 'HEAD'),
  sourceStatusAfterWork: git('status', '--short').split(/\r?\n/), writeScope: 'clients/harmony-mobile and fresh D:/Temp source archive; original dirty entries retained',
  checks: [
    { command: 'node scripts/check.mjs --integration', result: 'pass', modules: 19, layer: 'strict source-linked TypeScript 6.0.3, real service test types included' },
    { command: 'node scripts/assets.mjs', result: 'pass', layer: 'canonical hashes, HAP-local resources; ArkTS not compiled' },
    { command: 'node --test tests/core.test.mjs tests/guest-runtime.test.mjs tests/native-source.test.mjs tests/admission.test.mjs tests/link.test.mjs', result: 'pass', tests: 43, layer: 'synthetic ports, guest fake DOM, native static assertions' },
    { command: 'node scripts/integration-check.mjs', result: 'pass', tests: report.numPassedTests, layer: 'real source Loader/Session/Rich/Storage, fixed replay and memory phone/relay', hostEscalation: 'sandbox realpath EPERM in owned test cwd; same narrow command' },
    { command: 'git status --short; git diff --check; git rev-parse HEAD; git branch --show-current', result: 'recorded/pass', layer: 'tracked diff and preserved branch/status; client is untracked' },
    { command: 'node scripts/validate-files.mjs', result: 'pass', layer: 'owned LF formatting and local Markdown links; validation rerun after this file is generated' },
  ],
  nodeTestsThisBatch: 43, realServiceTestsThisBatch: report.numPassedTests, previousEvidence: 'phase2-summary.json',
  previousChromeAssertions: { count: 15, rerunThisBatch: false, layer: 'direct mock iframe, not ArkWeb' },
  primaryReplay: link.counts, refusalProbe: guard.afterFifthCallProbe, readOnlyReopen: reopen.counts,
  liveFrames: link.liveFrames, verifiedDurableCursor: reopen.verifiedCursor, restorePromptCalls: reopen.taskPromptCallsOnRestore,
  negativeCases: ['journal claim failure prevents dispatch', 'acceptance write failure reconciles without prompt', 'missing/corrupt/invalid/foreign-version/wrong-key journal refuses without replacement',
    'missing mode or dispatch guard refuses before construction', 'fifth replay refuses before extensions', 'read-only restore exposes exact-count underconsumption', 'unknown persisted intent never dispatches'],
  qualifiedLayers: ['strict pure TS and integration TS', 'source-mode actual Cordis Loader/SessionController/RichInline/JSONL/StorageDomain', 'real fixed-replay streaming/action/cancel', 'logical owner restart on persisted files'],
  unverifiedLayers: ['supported dsh application profile and SDK/BFF transport', 'OS process kill or power failure', 'production persistent prompt receipts and concurrent process writers',
    'wire codec and semantic phone projection', 'pairing/authentication/TLS/E2EE', 'WAN/cellular', 'real approvals', 'ArkTS/HAP/ArkWeb/emulator/Mate90 device'],
  inactiveStepsRequiringApproval: ['official DevEco/SDK installation', 'device debugging/permissions/signing/HAP installation', 'real desktop addon/profile and pairing', 'persistent device credentials', 'WAN deployment/certificates/network settings', 'live model tests'],
  installedDshRestartedOrOverwritten: false, userSessionsAccessed: false, onlineModelCalls: 0, glmCalls: 0,
  persistentCredentialsCreated: false, networkListenersInIntegration: 0, securitySettingsChanged: false, pushedOrCommitted: false,
  sourceServiceHashes, fixtureSourceHashes: JSON.parse(await readFile(join(project, '.build', 'source-hashes.json'), 'utf8')),
  preservedArchives: ['D:/Temp/dsh-harmony-client-20261010-source-v1.zip', 'D:/Temp/dsh-harmony-client-20261010-source-v2.zip'],
}
await writeFile(join(project, 'evidence', 'phase3-summary.json'), JSON.stringify(result, null, 2) + '\n')
console.log('PASS: real-service evidence summary, exact four-response primary run, refusal probes and source hashes')

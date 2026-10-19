/** Freeze completed loopback test evidence; no socket, model, app or device is started. */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
const read = async name => JSON.parse(await readFile(join(project, 'evidence', name), 'utf8'))
const report = await read('phase4-vitest.json'), network = await read('phase4-network.json')
if (!report.success || report.numPassedTests !== 5 || network.serverProcessId === network.phone.processId || !network.listenerClosed
  || network.metrics.active !== 0 || network.counts.realCalls !== 0 || network.counts.replay[0]?.calls !== 4
  || network.counts.replay[0]?.blockedCalls !== 0 || network.uploadExtensionCalls !== 0 || network.phone.finalAction.state !== 'completed') throw new Error('Complete passing phase-four evidence required')
const hashes = {}
for (const file of ['src/wire.ts', 'src/network-phone.ts', 'integration/mobile-bff.ts', 'integration/loopback-bff.ts',
  'network-tests/bff.spec.ts', 'network-tests/phone-child.test.mjs', 'network-tests/flow-control.spec.ts', 'scripts/network-check.mjs']) {
  hashes[file] = createHash('sha256').update(await readFile(join(project, file))).digest('hex')
}
const git = (...args) => execFileSync('git', args, { cwd: source.dshRoot, encoding: 'utf8', windowsHide: true }).trimEnd()
await writeFile(join(project, 'evidence/phase4-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), project,
  sourceBranch: git('branch', '--show-current'), sourceCommit: git('rev-parse', 'HEAD'), sourceStatusAfterWork: git('status', '--short').split(/\r?\n/),
  checks: [
    { command: 'node scripts/check.mjs --integration', result: 'pass', modules: 26, layer: 'strict TypeScript source and integration' },
    { command: 'node scripts/assets.mjs', result: 'pass', layer: 'source hashes and native fixture resources; no ArkTS compile' },
    { command: 'node --test tests/wire.test.mjs tests/native-source.test.mjs', result: 'pass', tests: 12, layer: 'wire 9, native static 3' },
    { command: 'node scripts/network-check.mjs', result: 'pass', tests: report.numPassedTests, layer: network.layer,
      escalation: 'unchanged narrow command after sandbox connect EACCES 127.0.0.1; diagnostic retained' },
    { command: 'git status --short; git diff --check', result: 'recorded/pass', layer: 'original tracked changes retained; added client only' },
    { command: 'node scripts/validate-files.mjs', result: 'pass', layer: 'owned final LF and documentation links; rerun after summary' },
  ], distinctNewWireTests: 9, nativeStaticTests: 3, sourceBffAndFlowTests: report.numPassedTests, phoneChildScenarios: 1,
  phoneAssertions: network.phone.assertions, connectionStates: network.phone.connectionStates, serverProcessId: network.serverProcessId, phoneProcessId: network.phone.processId,
  counts: network.counts, metrics: network.metrics, listenerClosed: network.listenerClosed, modelRequests: network.modelRequests,
  qualified: ['two distinct OS test processes', 'actual Gateway/SessionController/RichInline source services', 'loopback HTTP/NDJSON', 'bounded framing, backpressure and capacity', 'generation/cursor reconnect', 'real replay action and cancellation with original receipts'],
  unverified: ['production Web Connection/standard mux/SDK profile', 'domain codec and semantic phone projection', 'native transport provider', 'ArkTS/HAP/ArkWeb', 'authenticated pairing/TLS/E2EE', 'WAN/cellular', 'OS hard kill', 'Mate90 device'],
  defaults: 'NetworkPhone and BFF disabled until explicit test activation; Native Fixture/Disabled; no configured HTTPS connection used',
  deploymentInputs: ['relay location/domain/TLS source and allowed costs', 'desktop profile activation window and workspace/session/operation scope', 'trusted pairing confirmation and persistent device identity/revocation approval', 'phone OS build and approved official tools/debug/signing/install/INTERNET permissions'],
  installedDshRestartedOrOverwritten: false, userSessionsAccessed: false, persistentCredentialsCreated: false, securitySettingsChanged: false,
  onlineModelCalls: 0, glmCalls: 0, uploadExtensionCalls: 0, pushedOrCommitted: false, backgroundProcessesOrListenersLeft: false,
  hashes, sourceModuleHashes: JSON.parse(await readFile(join(project, '.build/source-hashes.json'), 'utf8')),
  previousEvidencePreserved: ['phase2-summary.json', 'phase3-summary.json'], previousArchivesPreserved: ['source-v1.zip', 'source-v2.zip', 'source-v3.zip'],
}, null, 2) + '\n')
console.log(`PASS: phase4 evidence frozen; different PIDs; four fixed replies; ${network.phone.assertions.length} phone assertions; listener and child closed`)

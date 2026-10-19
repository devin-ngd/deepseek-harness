/** Freeze completed phase5 evidence only; this script launches no app, browser, listener or model. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const source = JSON.parse(await readFile('source.json', 'utf8')), project = resolve('.')
const network = JSON.parse(await readFile('evidence/phase5-network.json', 'utf8')), report = JSON.parse(await readFile('evidence/phase5-vitest.json', 'utf8'))
const node = await readFile('evidence/phase5-node.txt', 'utf8'), finalNode = await readFile('evidence/phase5-final-node.txt', 'utf8')
const displayNode = await readFile('evidence/phase5-display-node.txt', 'utf8')
if (!report.success || report.numPassedTests !== 1 || network.serverProcessId === network.phone.processId || !network.listenerClosed || network.metrics.active !== 0 || network.modelRequests !== 4 || network.counts.realCalls !== 0 || network.counts.replay[0]?.calls !== 4 || network.counts.replay[0]?.blockedCalls !== 0 || network.uploadExtensionCalls !== 0 || network.phone.finalAction.state !== 'completed' || network.phone.domainView.task !== 'cancelled' || !node.includes('pass 30') || !finalNode.includes('pass 20') || !displayNode.includes('pass 21')) throw new Error('Complete passing phase5 evidence required')
const files = ['src/domain.ts', 'src/semantic-phone.ts', 'src/phone-core.ts', 'src/rich-renderer.ts', 'src/upstream-domain.ts', 'src/native-runtime.ts', 'src/wire.ts', 'src/relay-guest.ts', 'integration/replay-host.ts', 'integration/mobile-publication.ts', 'network-tests/phase5.spec.ts', 'network-tests/phase5-phone.test.mjs', 'tests/domain.test.mjs', 'tests/native-source.test.mjs', 'scripts/phase5-assets.mjs', 'scripts/phase5-check.mjs', 'scripts/phase5-native-preview.mjs', 'harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/ets/provider/MobileProvider.ets', 'harmony/entry/src/main/resources/rawfile/trusted-phone-core.js']
const hashes = {}; for (const file of files) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: source.dshRoot, encoding: 'utf8', windowsHide: true }).trimEnd()
await writeFile('evidence/phase5-summary.json', JSON.stringify({ generatedAt: new Date().toISOString(), project, sourceBranch: git('branch', '--show-current'), sourceCommit: git('rev-parse', 'HEAD'), sourceStatusAfterWork: git('status', '--short').split(/\r?\n/),
  checks: [
    { command: 'node scripts/check.mjs --integration', result: 'pass', modules: 34, layer: 'strict TypeScript and source imports; prebuilt vendor declarations required' },
    { command: 'node scripts/assets.mjs', result: 'pass', layer: 'canonical source assets and hashes' },
    { command: 'node scripts/phase5-assets.mjs', result: 'pass', layer: 'shared semantic native fixtures and browser/trusted runtime bundles; no ArkTS compile' },
    { command: 'node --test tests/domain.test.mjs tests/wire.test.mjs tests/guest-runtime.test.mjs tests/native-source.test.mjs', result: 'pass', tests: 30, note: 'initial domain 16, wire 9, guest 2, native static 3' },
    { command: 'node --test tests/domain.test.mjs tests/native-source.test.mjs', result: 'pass', tests: 20, note: 'domain 17 and native static 3 before display refinement' },
    { command: 'node --test tests/domain.test.mjs tests/native-source.test.mjs', result: 'pass', tests: 21, note: 'final domain 18 and native static 3; repeated cases not added to distinct count' },
    { command: 'node scripts/phase5-check.mjs', result: 'pass', tests: 1, layer: 'actual source BFF services → distinct Node PhoneCore process → Chrome scoped guest', escalation: 'unchanged command after sandbox loopback EACCES; formal narrow approval' },
    { command: 'node scripts/phase5-native-preview.mjs', result: 'pass', layer: 'inert HTML/CSS from actual admitted rich publication' },
  ], distinctNodeTests: 32, domainTests: 18, nativeStaticTests: 3, wireTests: 9, guestRuntimeTests: 2, sourceBffTests: 1,
  phoneAssertions: network.phone.assertions, phoneAssertionGroups: network.phone.assertions.length, serverProcessId: network.serverProcessId, phoneProcessId: network.phone.processId,
  semanticViews: network.phone.semanticViews, streamedTextViews: network.phone.streamedTextViews, durableCursor: network.phone.durableCursor, finalAction: network.phone.finalAction, disconnectedRunning: network.phone.disconnectedRunning,
  counts: network.counts, modelRequests: network.modelRequests, uploadExtensionCalls: network.uploadExtensionCalls, listenerClosed: network.listenerClosed, metrics: network.metrics,
  qualified: ['current Session/rich domain admission and semantic projection', 'actual Gateway/SessionController/RichInline source services in bounded replay', 'distinct OS test processes over loopback', 'Chrome authored form and chart via canonical guest SDK and scoped native-owned provider', 'real draft CAS, action completion and history remount', '360/480px touch and local code scrolling', 'correct-scope fake approval rejection', 'protocol/renderer/hash readable fallback', 'fourth replay cancellation after disconnect/reconnect'],
  remaining: ['message projection plugin coverage and history pagination', 'real scoped project/session lists and image download', 'offline multi-device draft persistence/conflict UI', 'trusted pendingManifest confirmation and approval response UI', 'standard Web Connection/mux/SDK and supported dsh profile', 'native HTTP/message port and identity provider', 'ArkTS/HAP/ArkWeb/IME/accessibility/lifecycle', 'approved pairing/TLS/WAN/cellular/device installation'],
  arkTsCompiled: false, arkWebQualified: false, wanQualified: false, deviceQualified: false, installedDshRestartedOrOverwritten: false, userSessionsAccessed: false, persistentCredentialsCreated: false, securitySettingsChanged: false, glmCalls: 0, pushedOrCommitted: false,
  previousEvidencePreserved: ['phase2-summary.json', 'phase3-summary.json', 'phase4-summary.json'], previousArchivesPreserved: ['source-v1.zip', 'source-v2.zip', 'source-v3.zip', 'source-v4.zip'], hashes,
  sourceModuleHashes: JSON.parse(await readFile('.build/source-hashes.json', 'utf8')),
}, null, 2) + '\n')
console.log('PASS: phase5 frozen; 32 distinct Node tests; actual BFF/PhoneCore/Chrome; four fixed responses; real/upload zero; listener closed')

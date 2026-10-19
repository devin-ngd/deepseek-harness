/** Reconcile the completed, revoked field window from public evidence and its single synthetic Session. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const marker = await json('.build/phase54-active.json'), exchange = await json('.build/phase67-exchange.json'), lifetime = await json('evidence/phase67-grant-lifetime.json')
const cleanup = await json(join(exchange.exchange, 'desktop-cleanup.json')), result = await json(join(marker.world, 'fixed-world/field-result.json')), exited = await json('evidence/phase67-field-exit.json')
const credentials = await json('.build/phase67-reconcile-current.json'), processes = await json('.build/phase67-processes-current.json'), phone = await json('evidence/phase67-device-final.json'), stopped = await json('evidence/phase67-phone-cleanup.json'), pairing = await json('evidence/phase67-pair-reviewed.json')
assert.equal(cleanup.confirmedGrant, true); assert.equal(cleanup.revocationSucceeded, true); assert.equal(cleanup.resourcesClosed, true); assert.ok(Date.parse(cleanup.at) < lifetime.expiresAt)
assert.equal(exited.code, 0); assert.equal(exited.signal, null); assert.equal(processes.fieldProcessCount, 0); assert.equal(phone.pid, ''); assert.equal(stopped.finalPid, '')
assert.equal(credentials.activeGrantCount, 0); assert.equal(credentials.grants.length, 1); assert.equal(credentials.grants[0].revoked, true); assert.equal(credentials.grants[0].epoch, 2)
assert.equal(credentials.oldProofPreserved, true); assert.equal(credentials.signedArtifactUnchanged, true); assert.equal(result.realModels, 0); assert.equal(result.uploads, 0)
assert.equal(result.replay.length, 1); assert.deepEqual(result.replay[0], { expectedCalls: 4, calls: 0, blockedCalls: 0, realCalls: 0 })
assert.ok(processes.listeners.some(row => row.address === '127.0.0.1' && row.port === 8710 && row.pid === 20964))
const files = (await readdir('evidence')).filter(name => /^phase67-relay-inspection-\d+[.]json$/.test(name)).sort(), remote = await json(join('evidence', files.at(-1)))
assert.equal(remote.exit, 0); assert.ok(remote.output.includes('temporary_override=absent')); assert.ok(remote.output.includes('--config /home/devin/harmony-relay/config.enabled.json'))
assert.ok(remote.output.includes('55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3')); assert.ok(remote.output.includes('20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41'))
const remoteState = JSON.parse(remote.output.trim().split('\n').at(-1)); assert.deepEqual(remoteState.originalConfig, { brokerEnabled: false, fieldPairConfigured: false }); assert.equal(remoteState.establishedBackendSockets, 0)
const publicJournal = remoteState.publicFiles.find(row => row.name === 'public-state/replay-v1.jsonl'), publicHead = remoteState.publicFiles.find(row => row.name === 'public-state/replay-v1.jsonl.head')
assert.equal(publicJournal.sha256, 'fb9929bc7d2f45488a6059a792e62a6ace7391ec3df923f869486b963e47ec3f'); assert.equal(publicHead.sha256, 'eea3b80d837454d154520fba3ace018fb57fc2f30acbbdcd7567ce297ffb81d2')
const sessions = []
async function scan(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await scan(path); else if (entry.name === 'session.v4.jsonl') sessions.push(path) } }
await scan(join(marker.world, 'fixed-world/sessions')); assert.equal(sessions.length, 1); assert.ok(sessions[0].includes('harmony-mobile-field-replay-session'))
const bytes = await readFile(sessions[0]), sha256 = createHash('sha256').update(bytes).digest('hex'), events = {}
assert.equal(sha256, '5f3f40e7ef75c794c15e8f8accb590e1212297ac375720b30377bc8643c959fa')
for (const row of bytes.toString('utf8').trim().split('\n').map(JSON.parse)) { const tag = row.type ?? row.event?.type; assert.equal(typeof tag, 'string'); events[tag] = (events[tag] ?? 0) + 1 }
assert.ok(Object.keys(events).every(tag => ['session', 'session/end-seed'].includes(tag)))
await copyFile(join(exchange.exchange, 'desktop-cleanup.json'), 'evidence/phase67-desktop-cleanup.json'); await copyFile(join(marker.world, 'fixed-world/field-result.json'), 'evidence/phase67-fixed-result.json')
const report = { at: new Date().toISOString(), nativeEnrollmentSignatureVerified: true, nativeLocalPairingSaved: true, exactPairingReviewedAt: pairing.at, grant: { startsAt: lifetime.startsAt, expiresAt: lifetime.expiresAt, revokedAt: cleanup.at, renewal: false, activeCount: 0, tombstoneEpoch: 2 }, desktopExitCode: 0, fieldProcesses: 0, phonePid: '', originalHdcPid: 20964, relay: { restored: true, originalConfigAndServerUnchanged: true, temporaryOverride: false, originalBrokerEnabled: false, fieldPairConfigured: false, temporaryPublicJournalAndHeadPreserved: true, temporaryPairExpiry: lifetime.expiresAt, temporaryPairTombstoneWritten: false }, session: { id: 'harmony-mobile-field-replay-session', sha256, unchanged: true, events, userMessages: 0, llmRequests: 0 }, replayCalls: 0, realModelCalls: 0, userProjectOperations: 0, signedArtifactUnchanged: true, trueEndToEndPassed: false, blocker: 'native product remained disconnected; failure stage not exposed', unverified: ['native control authentication', 'native E2E and device grant proof', 'phone catalogue and stream', 'phone task to desktop execution', 'real ArkWeb rich action', 'live deduplication, reconnect and cancellation'], relayInspection: files.at(-1), securityChanges: false, newIdentity: false, reinstalled: false }
await writeFile('evidence/phase67-closeout.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

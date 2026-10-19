/** Assemble already completed phase75 public evidence; performs no device, credential or remote operation. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const root = 'D:/Temp/dsh-harmony-phase75-operation', world = 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world', exchange = join(world, 'exchange/run-vQfb8Y')
const json = async path => JSON.parse(await readFile(path, 'utf8')), digest = bytes => createHash('sha256').update(bytes).digest('hex')
const signed = await json(join(root, 'signed.json')), installed = await json(join(root, 'install-result.json')), lifetime = await json(join(exchange, 'grant-lifetime.json')), cleanup = await json(join(exchange, 'desktop-cleanup.json')), initialCleanup = await json(join(root, 'final-cleanup.json'))
const finalRead = await json(join(root, 'device-read-public-1792226230170.json')), phone = await json(finalRead.path), exit = await json(join(root, 'device-inspect-1792226295723.json')), repairedRestore = await json(join(root, 'corrected-restore-result.json')), relay = await json(join(root, 'relay-restore-1792226307059.json')), state = await json(join(root, 'desktop-final-1792226314565.json')), replay = await json(join(world, 'field-result.json'))
assert.equal(installed.installed, true); assert.equal(installed.dataCleared, false); assert.equal(signed.certificateMatched && signed.profileMatched && signed.applicationEntriesMatched, true)
assert.equal(digest(await readFile(signed.path)), signed.sha256)
assert.equal(finalRead.sha256, digest(await readFile(finalRead.path))); assert.equal(phone.record.paired.grant.epoch, 7); assert.equal(phone.revokedEpoch, 6); assert.equal(phone.history.length, 3)
assert.equal(cleanup.confirmedGrant && cleanup.revocationSucceeded && cleanup.resourcesClosed, true)
assert.equal(state.activeGrantCount, 0); assert.equal(state.grants.length, 1); assert.equal(state.grants[0].epoch, 8); assert.equal(state.grants[0].revoked, true); assert.equal(exit.pid, '')
assert.equal(repairedRestore.result.restored && relay.restored, true); assert.equal(replay.replay[0].calls, 0); assert.equal(replay.realModels, 0); assert.equal(replay.uploads, 0)
const config = 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/home/field.json', configHash = digest(await readFile(config)); assert.equal(configHash, '4b55390c21d5d956a781b715b22fccb5bb2d95602abaa229608ca314afdda519')
try { await lstat(world + '.field-owner.lock'); throw new Error('owner lock remains') } catch (error) { if (error.code !== 'ENOENT') throw error }
async function sessionFile(directory) { for (const row of await readdir(directory, { withFileTypes: true })) { const path = join(directory, row.name); if (row.isFile() && row.name === 'session.v4.jsonl') return path; if (row.isDirectory()) { const found = await sessionFile(path); if (found) return found } } }
const actualSession = await sessionFile(join(world, 'sessions')); assert.ok(actualSession); const sessionHash = digest(await readFile(actualSession)); assert.equal(sessionHash, '5f3f40e7ef75c794c15e8f8accb590e1212297ac375720b30377bc8643c959fa')
const markers = await json(join(root, 'exercise-connection-log-receipt-1792225963968.json'))
const recovery = resolve('.build/phase75.2-restore-only'), inventory = []
for (const name of (await readdir(recovery)).sort()) { const bytes = await readFile(join(recovery, name)); inventory.push({ file: name, bytes: bytes.length, sha256: digest(bytes) }) }
await writeFile(join(recovery, 'files.sha256.json'), JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' })
const result = {
  schema: 'harmony-phase75-field-closeout/1', recordedAt: new Date().toISOString(), status: 'CONTROL_AUTHENTICATION_FAILED_CLEANUP_VERIFIED',
  approval: { sourceHumanMessageId: 'Sentinel_89e6422f7b5c8191a26ce3f3bee61489', approvedAt: '2026-10-17T08:07:08Z', requestMessageId: 'Sentinel_0ffcecddae688191877de8c40408d420', scopeExpanded: false },
  installation: { ...installed, utc: new Date(installed.observedAt).toISOString(), signedHap: signed.path, signedBytes: signed.bytes, originalCertificateAndProfileMatched: true, applicationEntriesMatched: true, newPermissions: false },
  identity: { originalHuksMatched: true, created: false, originalDesktopDpapiReused: true },
  history: { nativeReadEvidence: finalRead.path, documentSha256: finalRead.sha256, grantEpoch: 7, revokedFloor: 6, entries: 3, exactFinalDocumentMatched: true, intermediateGrant5Activated: false },
  grant: { epoch: 7, startsAt: new Date(lifetime.startsAt).toISOString(), scheduledExpiresAt: new Date(lifetime.expiresAt).toISOString(), revokedAt: cleanup.at, finalEpoch: 8, finalRevoked: true, active: 0, autoRenewed: false },
  relay: { publicSixFieldsUploaded: true, destination: 'dhome:/home/devin/harmony-relay/phase75-successor/relay-pair.json', initialized: true, temporarilyActivated: true, restored: true, originalOperatorVerifiedRestore: 'D:/Temp/dsh-harmony-phase75-operation/relay-restore-1792226307059.json', originalNginxHash: '3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2', journalsPreserved: true, credentialsUploaded: false, sessionContentUploaded: false },
  connection: { phoneControlHttpUpgraded: true, firstFrame: true, authenticated: false, dataConnected: false, markers: markers.result.markers, nativeErrorLines: markers.result.nativeErrorLines, rawLogsRetained: false, screenshotCaptured: false },
  acceptance: { taskDispatched: false, replayCalls: 0, realModels: 0, uploads: 0, sessionSha256: sessionHash, sessionUnchanged: true, phoneStreamVerified: false, arkWebVerified: false, actionDedupVerified: false, draftRestoreVerified: false, reconnectVerified: false, cancellationVerified: false },
  cleanup: { desktopOwner: cleanup, initialCleanup, repair: repairedRestore, originalPublicConfigRestored: configHash, ownerLockAbsent: true, phoneExit: exit, finalDesktopObservedAt: state.observedAt, installedUserDshChanged: false },
  validation: { command: 'node --test tests/phase75-operations.test.mjs tests/phase75-operation-security.test.mjs tests/phase75-phone-exercise.test.mjs', environment: 'Host after sandbox junction EPERM; unchanged test command', tests: 127, passed: 127, failed: 0, syntaxChecks: ['phase75-phone-exercise.mjs', 'phase75-relay-cleanup-diagnostic.mjs', 'phase75-restore-owned-service.mjs', 'operations/phase75/maintenance.mjs'], deviceTestResultNotInferredFromOffline: true },
  deliverables: { signedHap: signed.path, sealedOperator: 'D:/Temp/dsh-harmony-mobile-phase75.1-complete-operation-plan.zip', restoredRunner: recovery, restoredRunnerSha256: '17620a6a10ecff07c8e630a91f17fa44148c38c8005fd3d942344a440c4d9157', report: 'docs/phase75-field-closeout.md', originalEvidence: root },
  remaining: ['Locate native control processing failure after first-frame using content-free offline diagnostics.', 'Phone task, stream, ArkWeb interaction, deduplication, draft/reconnect and cancellation remain unverified.', 'Any new live window requires separate approval from revoked8 and phone complete7; do not reuse phase75 pair/grant.']
}
await writeFile('evidence/phase75-field-closeout.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ status: result.status, recordedAt: result.recordedAt, active: 0, revokedEpoch: 8, relayRestored: true, phonePid: '', sessionUnchanged: true, receipt: 'evidence/phase75-field-closeout.json' }))

/** Reconcile only this isolated field's public evidence; never projects credential ciphertext or raw logs. */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const marker = await json('.build/phase54-active.json'), desktop = await json('evidence/phase55-desktop-identity.json'), phone = await json('evidence/phase55-device-final.json'), processes = await json('evidence/phase55-owned-processes.json'), relay = await json('evidence/phase55-relay-unchanged.json'), resume = await json('evidence/phase55-resume-preview-refusal.json')
assert.equal(desktop.grantCount, 0); assert.equal(desktop.grantTimerStarted, false); assert.equal(phone.pid, ''); assert.equal(processes.count, 0); assert.equal(relay.exit.code, 0); assert.equal(resume.coldPublicIdentityMatched, true)
const sessions = []
async function scan(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await scan(path); else if (entry.name === 'session.v4.jsonl') sessions.push(path) } }
await scan(join(marker.world, 'fixed-world/sessions')); assert.equal(sessions.length, 1); assert.ok(sessions[0].includes('harmony-mobile-field-replay-session'))
const lines = (await readFile(sessions[0], 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse), events = {}
for (const row of lines) { const tag = row.type ?? row.event?.type; assert.equal(typeof tag, 'string'); events[tag] = (events[tag] ?? 0) + 1 }
assert.ok(Object.keys(events).every(tag => ['session', 'session/end-seed'].includes(tag)))
const canonical = { at: new Date().toISOString(), events, canonicalUserMessages: 0, canonicalLlmRequests: 0, realModels: 0, userProjectOperations: 0, recordedFixtureIncluded: false }
await writeFile('evidence/phase55-canonical-session.json', JSON.stringify(canonical, null, 2) + '\n')
const logRecords = []
for (const name of (await readdir(marker.world)).filter(name => /^(?:owned-errors-|phase55-owned-enrollment-).*\.log$/.test(name))) {
  const bytes = await readFile(join(marker.world, name)), text = bytes.toString('utf8')
  logRecords.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), enrollmentStageMarkers: (text.match(/DSH_ENROLLMENT_STAGE|DSH_ENROLLMENT_REFUSED/g) ?? []).length, enrollmentExceptionMatches: (text.match(/native enrollment|crypto-verify-failed|crypto-public-key-invalid|key-public-export/g) ?? []).length })
}
assert.ok(logRecords.every(row => row.enrollmentStageMarkers === 0 && row.enrollmentExceptionMatches === 0))
const layout = await json('evidence/phase55-layout-resume-preview.json'), strings = await json('harmony/entry/src/main/resources/base/element/string.json'), value = name => strings.string.find(row => row.name === name).value
assert.ok(layout.nodes.some(row => row.text === value('product_operation_failed'))); assert.ok(layout.nodes.some(row => row.text === value('product_enrollment_sign') && row.enabled === 'false'))
await writeFile('evidence/phase55-preview-diagnostic-scope.json', JSON.stringify({ at: new Date().toISOString(), operation: 'previewEnrollment', control: value('product_enrollment_preview'), visibleError: value('product_operation_failed'), signingDisabled: true, bothFingerprintsShown: false, stageKnown: false, alreadyChecked: ['exact public input', 'fresh challenge', 'clean UI', 'existing HUKS public key after cold start', 'device clock sample', 'exact generated ProductCore under SDK substitutes'], existingLogMetadata: logRecords, rawLogsPackaged: false, publicInputsAndLayoutsRetainedOnlyInField: true, collector: { ownPidOnly: true, fixedMarkersOnly: true, maximumRecords: 64, rawLogRetention: false, secretOrKeyBytesLogged: false, fullChallengeLogged: false } }, null, 2) + '\n')
const progress = { at: new Date().toISOString(), installed: true, realHuksPublicIdentity: true, coldPublicIdentityMatched: true, desktopIdentityReused: true, nativePreview: 'refused; stage unknown', huksChallengeSigned: false, grantCount: 0, grantCreated: false, grantStartedAt: null, grantExpiresAt: null, ownedFieldProcesses: 0, fieldControllerStopAcknowledged: processes.stopWriteAcknowledged, fieldControllerSessionLost: processes.controllerSessionLost, phoneProductPid: phone.pid, relayActivated: false, relayVerifiedAt: relay.at, diagnosticUnsignedCompiled: true, diagnosticSigned: false, diagnosticInstalled: false, needsNewDiagnosticUpdateApproval: true, modelCalls: 0, userProjectOperations: 0, trueEndToEndPassed: false }
await writeFile('evidence/phase55-progress.json', JSON.stringify(progress, null, 2) + '\n'); console.log(JSON.stringify(progress))

/** Verify this field's zero-grant shutdown and retain only public summaries; never copy keys, exchange bodies or raw logs. */
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const json = async path => JSON.parse(await readFile(path, 'utf8')), marker = await json('.build/phase54-active.json'), desktop = await json('evidence/phase56-desktop-identity.json'), phone = await json('evidence/phase56-device-final.json'), processes = await json('evidence/phase56-owned-processes.json'), relay = await json('evidence/phase56-relay-unchanged.json')
assert.equal(desktop.grantCount, 0); assert.equal(desktop.grantTimerStarted, false); assert.equal(phone.pid, ''); assert.equal(processes.count, 0); assert.equal(processes.stopWriteAcknowledged, true); assert.equal(relay.exit.code, 0)
for (const path of [join(marker.home, 'phone-reply.json'), join(marker.world, 'phone-create-attempt-phase56.json')]) { try { await access(path); throw new Error('unexpected proof or identity creation attempt') } catch (error) { if (error.code !== 'ENOENT') throw error } }
assert.equal(desktop.identities[0].fingerprint, (await json('evidence/phase55-desktop-identity.json')).identities[0].fingerprint)
const names = await readdir('evidence'), logName = names.filter(name => name.startsWith('phase56-enrollment-markers-')).sort().at(-1), log = await json('evidence/' + logName), refusals = log.markers.filter(row => row.kind === 'refusal')
assert.equal(refusals.length, 2); assert.ok(refusals.every(row => row.stage === 'parse-offer' && row.category === 'SyntaxError')); assert.ok(log.markers.every(row => row.kind !== 'stage' || row.stage === 'parse-offer'))
const raw = (await readFile(join(marker.world, 'fixed-world/exchange/run-pgizRK/desktop-offer.json'), 'utf8')).trim(), digest = value => createHash('sha256').update(value).digest('hex'), verified = []
for (const name of names.filter(name => name.startsWith('phase56-layout-verify-public-input-'))) { const report = await json('evidence/' + name), row = report.nodes.find(row => row.hint === '桌面公开挑战 JSON'); if (row) verified.push({ sha256: row.publicJsonSha256, bytes: row.publicJsonBytes }) }
assert.ok(verified.some(row => row.sha256 === digest(raw))); assert.ok(verified.some(row => row.sha256 === digest('{}')))
const result = { at: new Date().toISOString(), installedDiagnosticVerified: true, phonePublicIdentityMatchedExisting: true, desktopIdentityReused: true, challengeInputExactlyMatched: true, publicInputBytes: Buffer.byteLength(raw), publicInputSha256: digest(raw), challengeExpiresAt: new Date(JSON.parse(raw).ticket.expiresAt).toISOString(), nativeStage: 'parse-offer', category: 'SyntaxError', syntheticEmptyObjectAlsoRefused: true, rootCauseProven: false, nativeSignatureReached: false, phoneChallengeSigned: false, grantCount: 0, grantStartedAt: null, grantExpiresAt: null, originalWorldReused: true, fieldStopAcknowledged: true, ownedFieldProcesses: 0, phoneProductClosed: true, relayTrustInitialized: false, relayServiceChanged: false, newParserCandidateSigned: false, newParserCandidateInstalled: false, realModels: 0, userProjectOperations: 0, trueEndToEndPassed: false }
await writeFile('evidence/phase56-native-refusal.json', JSON.stringify(result, null, 2) + '\n')
const sessions = []
async function scan(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await scan(path); else if (entry.name === 'session.v4.jsonl') sessions.push(path) } }
await scan(join(marker.world, 'fixed-world/sessions')); assert.equal(sessions.length, 1); const events = {}
for (const row of (await readFile(sessions[0], 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)) { const tag = row.type ?? row.event?.type; assert.equal(typeof tag, 'string'); events[tag] = (events[tag] ?? 0) + 1 }
assert.ok(Object.keys(events).every(tag => ['session', 'session/end-seed'].includes(tag)))
await writeFile('evidence/phase56-canonical-session.json', JSON.stringify({ at: result.at, events, recordedFixtureIncluded: false, canonicalUserMessages: 0, canonicalLlmRequests: 0, realModels: 0, userProjectOperations: 0 }, null, 2) + '\n'); console.log(JSON.stringify(result))

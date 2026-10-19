/** Record the observed real proof and bounded grant while leaving both live processes and the original installation untouched. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const exchange = 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-4crf2L'
const lifetime = await json(exchange + '/grant-lifetime.json'), phone = await json(exchange + '/phone-pair.json'), reply = await json(exchange + '/phone-reply.json'), previous = await json('evidence/phase67-previous-round-reconciled.json')
assert.equal(phone.paired.grant.expiresAt, lifetime.expiresAt); assert.equal(phone.paired.grant.revoked, false)
assert.equal(lifetime.grantTtlMs, 1800000); assert.deepEqual(phone.paired.grant.sessions, ['harmony-mobile-field-replay-session'])
const names = await readdir('evidence'), activationName = names.filter(value => /^phase54-relay-activate-\d+\.json$/.test(value)).sort().at(-1), activation = await json('evidence/' + activationName)
assert.equal(activation.exit.code, 0); assert.match(activation.output, /RuntimeMaxUSec=27min 16s/)
const report = { at: new Date().toISOString(), state: 'real-proof-verified-grant-active-phone-local-pairing-pending', previousRound: previous, originalHuksProofVerifiedByDesktop: true, signatureBytes: Buffer.from(reply.proof.signature, 'base64url').length, publicReplySha256: createHash('sha256').update(await readFile(exchange + '/phone-reply.json')).digest('hex'), lifetime, startsUtc: new Date(lifetime.startsAt).toISOString(), expiresUtc: new Date(lifetime.expiresAt).toISOString(), session: phone.paired.grant.sessions[0], operations: phone.paired.grant.operations, epoch: phone.paired.grant.epoch, renewal: false, relay: { active: true, activationEvidence: activationName, runtimeMaximum: '27min 16s', originalApprovedDirectoryOnly: true }, liveTerminalSession: 94048, desktopPrompt: 'CONNECT FIXED REPLAY', nativeAppPid: '56617', next: 'Scroll past the existing public reply, input phone-pair.json, compare native fingerprints and network host, save local pairing, then confirm desktop CONNECT and phone Connect.', taskSubmitted: false, richInteractionPassed: false, realModels: 0, userProjectOperations: 0, installationRepeated: false, hapResigned: false }
await writeFile('evidence/phase67-grant-progress.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
await writeFile('docs/phase67-grant-progress.md', `# Fresh proof verified and bounded grant active

The interrupted round was reconciled as unsigned and ungranted, with no remaining field process and unchanged Session bytes. The installed alpha.4 app and both original identities were reused. This round produced a ${report.signatureBytes}-byte HUKS signature; the desktop authorization owner verified the phone proof and committed the exact single-Session grant.

Actual recorded validity is ${report.startsUtc} through ${report.expiresUtc}, without renewal. The original approved relay is active with RuntimeMaxSec 27 minutes 16 seconds from activation, bounded by the same expiry. It has no expanded directory, port or identity scope.

The live desktop terminal is session 94048, waiting at CONNECT FIXED REPLAY. Native app PID 56617 is running and currently displays the long public reply; the local pairing controls are below it. No task has been submitted yet. The next work is to input this exchange's phone-pair.json, compare fingerprints and network host, save local pairing, and connect both endpoints. Do not restart, install, re-sign or reinitialize either live operation. The exchange is ${exchange}. The final phone-to-desktop task, ArkWeb interaction, deduplication/reconnect/cancel checks and explicit revocation/relay restoration remain pending. Real models and user-project operations remain zero.

Evidence: [active grant state](../evidence/phase67-grant-progress.json), [recorded lifetime](../evidence/phase67-grant-lifetime.json), [old-round reconciliation](../evidence/phase67-previous-round-reconciled.json), and [new challenge](../evidence/phase67-fresh-offer.json).
`, { flag: 'wx' })
console.log(JSON.stringify({ proofVerified: true, starts: report.startsUtc, expires: report.expiresUtc, relayActive: true, terminal: 94048, next: 'native local pairing, then endpoint connection' }))

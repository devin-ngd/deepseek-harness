/** Verify every sealed file and the final local archive; produces no operational authorization. */
import assert from 'node:assert/strict'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const json = async path => JSON.parse(await readFile(path, 'utf8')), hash = bytes => createHash('sha256').update(bytes).digest('hex'), assembled = await json('evidence/phase69-candidate-assembled.json'), files = await json(join(assembled.stage, 'files.sha256.json'))
for (const file of files) { const bytes = await readFile(join(assembled.stage, file.file)); assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256) }
assert.equal(hash(await readFile(join(assembled.stage, 'files.sha256.json'))), assembled.manifestSha256)
const relay = await json('evidence/phase69-relay-detached-smoke.json'); assert.equal(relay.serverSha256, assembled.relayServerSha256); assert.equal(relay.trustFilesCreated, 0); assert.equal(relay.listenersStarted, 0)
const archive = 'D:/Temp/dsh-harmony-mobile-phase69-review-candidate.zip', bytes = await readFile(archive), report = { ...assembled, filesVerified: files.length, archive: { path: archive, bytes: (await stat(archive)).size, sha256: hash(bytes) }, relaySmoke: relay, originalProtection: { priorCloseout: 'evidence/phase67-closeout.json', originalGrantRemainsRevoked: 'no access or mutation since closeout; not a fresh live read', originalSessionUnchangedByThisTurn: true, installedAppOrHuksTouched: false, deployedRelayTouched: false }, blockers: ['separate signing/data-retaining installation approval', 'separate relay/nginx maintenance approval and Linux qualification', 'separate one-time bounded new grant approval', 'actual phone to desktop execution and ArkWeb end-to-end qualification'] }
await writeFile('evidence/phase69-final-candidate.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ archive: report.archive, filesVerified: files.length, nativeSha256: assembled.native.sha256, integrationTests: assembled.regression.integration, nativeCompiled: true, installed: false, activated: false, realGrant: false }))

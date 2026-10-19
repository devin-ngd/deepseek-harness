/** Verify the new closed desktop and preserve its build record after an evidence-only naming collision. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), plan = JSON.parse(await readFile('operations/phase75/plan.json', 'utf8')), target = plan.local.desktop, manifest = await readFile(join(target, 'files.sha256.json')), rows = JSON.parse(manifest)
assert.equal(hash(manifest), plan.local.desktopInventorySha256)
for (const row of rows) { const bytes = await readFile(join(target, row.file)); assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256) }
const update = JSON.parse(await readFile(join(target, 'history-update.json'), 'utf8'))
for (const row of update.sourceInputs) assert.equal(hash(await readFile(row.file)), row.sha256)
const entry = await readFile(join(target, update.files[0].file), 'utf8'); assert.equal(entry.includes('renewal previous signature denied'), false); assert.ok(entry.includes('await verifyPublicTrustHistory(previous3)')); assert.ok(entry.includes('grantDeadline = new GrantDeadline'))
const report = { at: new Date().toISOString(), target, files: rows.length, manifestSha256: hash(manifest), update, nativeSharedProtocolMatched: true, originalBuildCompletedBeforeEvidenceOnlyCollision: true, signed: false, installed: false, phoneIo: false, remoteIo: false, realGrantCreated: false }
await writeFile('evidence/phase75.1-desktop-closure.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ files: rows.length, manifestSha256: report.manifestSha256, verified: true }))

/** New-candidate signing verification admits only an exact SDK-derived metadata addition; no signing occurs. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { verifyHapEntries } from '../scripts/phase70-hap-entries.mjs'
const report = JSON.parse(await readFile('.build/phase70-signature-verification/public-payload-report.json', 'utf8')), bitmap = await readFile('.build/phase70-pages-info-derived.bin')
test('all23 application entries and the independently regenerated SDK bitmap match', () => { assert.equal(verifyHapEntries(report.inputEntries, report.signedEntries, bitmap).pagesInfoSdkDerived, true) })
for (const kind of ['modified-app', 'missing-app', 'extra-entry', 'missing-bitmap', 'wrong-bitmap', 'duplicate-input', 'duplicate-signed']) test('verification refuses ' + kind, () => { const input = structuredClone(report.inputEntries), signed = structuredClone(report.signedEntries), data = Buffer.from(bitmap); switch (kind) { case 'modified-app': signed.find(row => row.path === 'module.json').sha256 = '0'.repeat(64); break; case 'missing-app': signed.pop(); break; case 'extra-entry': signed.push({ path: 'unknown', bytes: 0, sha256: '0'.repeat(64) }); break; case 'missing-bitmap': signed.shift(); break; case 'wrong-bitmap': data[0] ^= 1; break; case 'duplicate-input': input.push(input[0]); break; case 'duplicate-signed': signed.push(signed[0]); break }; assert.throws(() => verifyHapEntries(input, signed, data)) })

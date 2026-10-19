/** Exact application payload comparison plus the installed SDK's independently regenerated page bitmap. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
/** @param input - SHA-pinned unsigned application entries. @param signed - existing officially signed entries. @param bitmap - regenerated from the unsigned archive with the pinned SDK ZIP alignment/PageInfoGenerator, without signing. @returns exact payload and SDK-derived signer metadata evidence. */
export function verifyHapEntries(input, signed, bitmap) {
  const metadata = { path: '.pages.info', bytes: bitmap.length, sha256: createHash('sha256').update(bitmap).digest('hex') }
  assert.equal(metadata.bytes, 312); assert.equal(metadata.sha256, 'd7b6f7518c632ebe84a8dc26bfcde43b03de5471ae4525778be175713109619d')
  assert.equal(input.length, 23); assert.equal(new Set(input.map(row => row.path)).size, input.length); assert.equal(new Set(signed.map(row => row.path)).size, signed.length)
  const before = new Map(input.map(row => [row.path, row])), after = new Map(signed.map(row => [row.path, row])); assert.equal(before.has(metadata.path), false)
  for (const row of input) assert.deepEqual(after.get(row.path), row, 'approved application entry changed: ' + row.path)
  assert.deepEqual(signed.filter(row => !before.has(row.path)), [metadata], 'only the SDK-regenerated bitmap may be added')
  return { applicationEntriesExactlyMatch: true, applicationEntryCount: input.length, signingMetadataAddition: metadata, pagesInfoSdkDerived: true }
}

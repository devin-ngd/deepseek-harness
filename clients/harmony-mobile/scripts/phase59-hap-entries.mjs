/** The exact approved HAP keeps all application bytes; only the observed official signer metadata is admitted. */
import assert from 'node:assert/strict'
const metadata = { path: '.pages.info', bytes: 312, sha256: '88e3c89c1ba979b1add12c52918a13488b0dd35b434f6bddaa90b85410bcf675' }
/** @param {object[]} input Public entries from the SHA-pinned approved HAP. @param {object[]} signed Public entries after official signing. @returns {object} Matched application count and the single pinned signer addition. */
export function verifyHapEntries(input, signed) {
  assert.equal(input.length, 23, 'approved input entry count changed')
  assert.equal(new Set(input.map(row => row.path)).size, input.length, 'duplicate input entry')
  assert.equal(new Set(signed.map(row => row.path)).size, signed.length, 'duplicate signed entry')
  const before = new Map(input.map(row => [row.path, row])), after = new Map(signed.map(row => [row.path, row]))
  assert.equal(before.has(metadata.path), false, 'signer metadata was already in the input')
  for (const row of input) assert.deepEqual(after.get(row.path), row, 'approved application entry changed: ' + row.path)
  assert.deepEqual(signed.filter(row => !before.has(row.path)), [metadata], 'unrecognized signer addition')
  return { applicationEntriesExactlyMatch: true, applicationEntryCount: input.length, signingMetadataAddition: metadata }
}

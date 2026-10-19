/** Signing verification refuses application mutation and every unrecognized metadata variation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { verifyHapEntries } from '../scripts/phase59-hap-entries.mjs'
const fixture = JSON.parse(await readFile(new URL('./fixtures/phase59-hap-entries.expected.json', import.meta.url), 'utf8'))
test('all original application bytes match and only the pinned official metadata is added', () => {
  const result = verifyHapEntries(fixture.input, fixture.signed)
  assert.equal(result.applicationEntriesExactlyMatch, true); assert.equal(result.applicationEntryCount, 23); assert.equal(result.signingMetadataAddition.path, '.pages.info')
})
test('changed application bytes are refused', () => {
  const entries = structuredClone(fixture.signed); entries.find(row => row.path === 'module.json').sha256 = '0'.repeat(64)
  assert.throws(() => verifyHapEntries(fixture.input, entries), /application entry changed/)
})
test('missing application data is refused', () => {
  assert.throws(() => verifyHapEntries(fixture.input, fixture.signed.filter(row => row.path !== 'module.json')), /application entry changed/)
})
test('an additional executable or any other unrecognized entry is refused', () => {
  assert.throws(() => verifyHapEntries(fixture.input, [...fixture.signed, { path: 'unexpected.abc', bytes: 1, sha256: '0'.repeat(64) }]), /unrecognized signer addition/)
})
test('the signer metadata must match its approved bytes and size', () => {
  const entries = structuredClone(fixture.signed); entries.find(row => row.path === '.pages.info').sha256 = '0'.repeat(64)
  assert.throws(() => verifyHapEntries(fixture.input, entries), /unrecognized signer addition/)
})
test('missing signer metadata is refused', () => {
  assert.throws(() => verifyHapEntries(fixture.input, fixture.input), /unrecognized signer addition/)
})
test('duplicate names are refused before an ambiguous lookup', () => {
  assert.throws(() => verifyHapEntries(fixture.input, [...fixture.signed, fixture.signed[0]]), /duplicate signed entry/)
})

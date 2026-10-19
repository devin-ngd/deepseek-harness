/** Enrollment collection retains fixed markers only, without phone or platform SDK access. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { enrollmentMarkers } from '../scripts/phase55-enrollment-lines.mjs'

test('fixed enrollment markers retain only named fields', () => {
  const sha256 = 'a'.repeat(64)
  assert.deepEqual(enrollmentMarkers('timestamp pid I tag DSH_ENROLLMENT_STAGE=parse-offer\nDSH_ENROLLMENT_TRANSCRIPT bytes=18 sha256=' + sha256 + '\nDSH_ENROLLMENT_REFUSED stage=verify-desktop-signature failure=crypto-verify-failed'), [
    { kind: 'stage', stage: 'parse-offer' }, { kind: 'public-transcript', bytes: 18, sha256 }, { kind: 'refusal', stage: 'verify-desktop-signature', category: 'crypto-verify-failed' }
  ])
})
test('unknown categories and appended payloads are discarded without echoing them', () => {
  const raw = 'DSH_ENROLLMENT_STAGE=parse-offer payload=DO_NOT_RETAIN\nDSH_ENROLLMENT_REFUSED stage=verify-desktop-signature failure=account-marker\nDSH_ENROLLMENT_STAGE=unknown\nprivateKey=DO_NOT_RETAIN\nDSH_ENROLLMENT_TRANSCRIPT bytes=18 sha256=' + 'a'.repeat(64) + ' nonce=DO_NOT_RETAIN'
  assert.deepEqual(enrollmentMarkers(raw), [])
})
test('collection is bounded and keeps only the latest fixed markers', () => {
  assert.equal(enrollmentMarkers(('DSH_ENROLLMENT_STAGE=parse-offer\n').repeat(100)).length, 64)
  assert.throws(() => enrollmentMarkers('x'.repeat(1048577)), /bounded enrollment log/)
})

/** Bounded diagnostic projection refuses unrecognized values and payloads. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { signingMarkers } from '../scripts/phase58-sign-lines.mjs'
test('known signing stages, SDK codes and byte lengths retain only fixed fields', () => {
  assert.deepEqual(signingMarkers('prefix DSH_HUKS_SIGN_STAGE=init\nprefix DSH_HUKS_SIGN_REFUSED stage=init code=12000003\nDSH_HUKS_SIGN_RESULT bytes=64'), [{ kind: 'sign-stage', stage: 'init' }, { kind: 'sign-refusal', stage: 'init', code: '12000003' }, { kind: 'sign-length', bytes: 64 }])
})
test('unknown codes, raw error text and appended signature contents are omitted', () => {
  assert.deepEqual(signingMarkers('DSH_HUKS_SIGN_REFUSED stage=init code=123456789\nDSH_HUKS_SIGN_STAGE=secret\nDSH_HUKS_SIGN_RESULT bytes=64 signature=private\nraw SDK text'), [])
})
test('log size and diagnostic count stay bounded', () => {
  assert.throws(() => signingMarkers('x'.repeat(1048577)), /bounded/)
  assert.equal(signingMarkers('DSH_HUKS_SIGN_STAGE=finish\n'.repeat(100)).length, 64)
  assert.deepEqual(signingMarkers('DSH_HUKS_SIGN_REFUSED stage=verify-public-signature code=unavailable'), [{ kind: 'sign-refusal', stage: 'verify-public-signature', code: 'unavailable' }])
})

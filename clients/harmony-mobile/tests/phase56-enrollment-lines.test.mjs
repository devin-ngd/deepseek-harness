/** Parser-stage collection preserves only the reviewed finite labels and return metadata. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { enrollmentMarkers } from '../scripts/phase56-enrollment-lines.mjs'
test('shared parsing and return metadata retain fixed fields only', () => {
  assert.deepEqual(enrollmentMarkers('I tag DSH_ENROLLMENT_STAGE=shared-validate-offer\nDSH_ENROLLMENT_RETURN type=undefined units=0\nDSH_ENROLLMENT_REFUSED stage=decode-shared-input failure=SyntaxError'), [{ kind: 'stage', stage: 'shared-validate-offer' }, { kind: 'shared-return', type: 'undefined', units: 0 }, { kind: 'refusal', stage: 'decode-shared-input', category: 'SyntaxError' }])
})
test('unknown labels, caller text and extra fields are not retained', () => { assert.deepEqual(enrollmentMarkers('DSH_ENROLLMENT_STAGE=account-marker\nDSH_ENROLLMENT_RETURN type=string units=12 payload=DO_NOT_RETAIN\nDSH_ENROLLMENT_REFUSED stage=shared-offer-input failure=secret-marker'), []) })
test('response and event counts remain bounded', () => { assert.equal(enrollmentMarkers(('DSH_ENROLLMENT_STAGE=native-parse-json\n').repeat(100)).length, 64); assert.throws(() => enrollmentMarkers('x'.repeat(1048577)), /bounded/) })

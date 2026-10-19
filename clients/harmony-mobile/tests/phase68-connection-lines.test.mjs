/** Failure observability retains stages without projecting controlled log text. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionMarkers } from '../scripts/phase68-connection-lines.mjs'
test('connection stages distinguish dial return, HTTP upgrade and first control/data frames without raw text', () => {
  const raw = ['DSH_CONNECTION_STAGE=phone-control-dial-started private=ignored', 'DSH_CONNECTION_STAGE=phone-control-dial-returned', 'DSH_CONNECTION_FAILURE=phone-control-socket-error code=200 credentials=ignored', 'DSH_CONNECTION_STAGE=phone-data-http-upgraded', 'unrelated error with private material', 'DSH_CONNECTION_STAGE=phone-data-first-frame', 'DSH_CONNECTION_STAGE=phone-data-unknown-secret'].join('\n')
  assert.deepEqual(connectionMarkers(raw), [{ role: 'phone', plane: 'control', stage: 'dial-started' }, { role: 'phone', plane: 'control', stage: 'dial-returned' }, { role: 'phone', plane: 'control', stage: 'socket-error', code: 200 }, { role: 'phone', plane: 'data', stage: 'http-upgraded' }, { role: 'phone', plane: 'data', stage: 'first-frame' }])
})
test('connection marker retention is bounded and malformed codes or stages are omitted', () => {
  assert.equal(connectionMarkers(Array(80).fill('DSH_CONNECTION_STAGE=phone-control-socket-closed').join('\n')).length, 64)
  assert.deepEqual(connectionMarkers('DSH_CONNECTION_FAILURE=phone-control-socket-error code=secret\nDSH_CONNECTION_STAGE=guest-control-first-frame'), [])
})

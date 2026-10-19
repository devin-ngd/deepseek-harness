/** Actual ETS socket owner under a NetworkKit callback substitute; no actual WSS, identity or device access. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeRelaySocket, NativeRelayPolicy, network, resetProductSdk } from '../.build/product-native.js'
import { connectionMarkers } from '../scripts/phase68-connection-lines.mjs'
for (const callbackStyle of ['direct-error', 'async-error']) test('dial completion precedes upgrade and HTTP refusal is sanitized: ' + callbackStyle, async () => {
  resetProductSdk(); const callbacks = new Map(), lines = [], original = console.info; let closes = 0
  console.info = value => lines.push(value)
  network.factory = () => ({ on: (name, callback) => callbacks.set(name, callback), connect: async () => true, send: async () => true, close: async () => { closes++; return true } })
  const authority = {}, socket = new NativeRelaySocket(new NativeRelayPolicy(authority, 'relay.fixture.example', 26, 10000, 4096, 8192))
  try {
    await socket.connectControlNative(authority, 'fixed-pair', 'phone', () => {}, () => {})
    assert.deepEqual(connectionMarkers(lines.join('\n')).map(row => row.stage), ['dial-started', 'dial-returned'])
    const failure = { code: 200, data: '403', message: 'private diagnostic text must not escape' }
    callbacks.get('error')(...(callbackStyle === 'direct-error' ? [failure] : [undefined, failure]))
    await socket.closeNative(authority)
    assert.deepEqual(connectionMarkers(lines.join('\n')).at(-1), { role: 'phone', plane: 'control', stage: 'socket-error', code: 200, httpStatus: 403 })
    assert.ok(!lines.join('\n').includes('private diagnostic')); assert.equal(closes, 1)
  } finally { await socket.closeNative(authority); console.info = original }
})

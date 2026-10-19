/** Fixed-replay HAP admission under Node; no HTTP, emulator or live device claim. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nativeReplayBootstrap } from '../.build/native-replay-policy.js'

const policy = JSON.parse(await readFile(new URL('../harmony/native-policy.json', import.meta.url), 'utf8')).host
const replay = { desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: 'phase11-session', baseUrl: 'http://127.0.0.1:18081/' }
const packet = changes => JSON.stringify({ protocol: 'dsh-native-replay-bootstrap/1', policy, replay, ...changes })

test('native replay bootstrap admits one fixed loopback identity and refuses destinations or extra capabilities before IO', () => {
  assert.equal(nativeReplayBootstrap(packet({})).policy.maxRows, policy.maxRows)
  for (const changes of [{ protocol: 'dsh-native-bootstrap/1' }, { extra: true }, { replay: { ...replay, token: 'synthetic-denied' } },
    ...['desktopId', 'deviceId', 'sessionId'].map(key => ({ replay: { ...replay, [key]: 'foreign' } })),
    ...['http://127.0.0.1:18082/', 'http://localhost:18081/', 'http://192.0.2.1/', 'https://example.invalid/', 'file:///'].map(baseUrl => ({ replay: { ...replay, baseUrl } }))]) {
    assert.throws(() => nativeReplayBootstrap(packet(changes)), /native-replay-config-invalid/)
  }
  assert.throws(() => nativeReplayBootstrap(' '.repeat(16385)), /native-replay-config-invalid/)
  assert.throws(() => nativeReplayBootstrap(packet({ policy: { ...policy, networkEnabled: true } })), /native-config-invalid/)
})

test('native UI cannot select a foreign Session through the approved replay host', async () => {
  let calls = 0
  const io = { request: async () => { calls++; throw new Error('Unexpected IO') }, close: async () => {} }
  const host = nativeReplayBootstrap(packet({})).create(io, undefined, () => {})
  try {
    await assert.rejects(host.receive(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui', generation: policy.port.generation, id: 'foreign', method: 'connect.demo', payload: { sessionId: 'foreign-session' } })), /scope-denied/)
    assert.equal(calls, 0)
  } finally { await host.close() }
})

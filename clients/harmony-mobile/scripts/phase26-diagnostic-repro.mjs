/** Reproduce the sealed v25 diagnostic's legal-cursor rejection under SDK substitutes; no native resource or network activation. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { NativeRuntimeOwner, NATIVE_DOCUMENT, sdk, resetSdk, context } from '../.build/phase25-sdk.js'
import { parseWireItem } from '../.build/wire.js'

const build = JSON.parse(await readFile('evidence/native-build/2026-10-12T13-40-03-568Z.json', 'utf8'))
const staged = 'D:\\workspace\\agents\\deepseek-harness\\clients\\harmony-mobile\\.build\\native-network-project\\entry\\src\\main\\ets\\native\\NativeRuntimeOwner.ets'
assert.equal(createHash('sha256').update(await readFile(staged)).digest('hex'), build.sourceHashes[staged])
const wire = parseWireItem({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', kind: 'reset', desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: 'phase11-session', instance: 'source-instance', relayCursor: -1, payload: {} })
assert.equal(wire.relayCursor, -1)
globalThis.canIUse = () => true
const tick = () => new Promise(accept => setImmediate(accept))
const findings = []
for (const probe of ['follow-decoded', 'follow-admitted']) {
  resetSdk()
  const root = '.build/native-network-project/entry/src/main/resources/rawfile/'
  const manifest = JSON.parse(await readFile(root + 'native-runtime-source-manifest.json', 'utf8'))
  for (const item of manifest.resources) sdk.resources.set(item.name, await readFile(root + item.name))
  const messages = [], errors = [], old = console.info
  console.info = message => messages.push(message)
  const owner = new NativeRuntimeOwner()
  try {
    owner.initialize(context(), () => {}, code => errors.push(code), () => {})
    owner.load(); owner.bind(NATIVE_DOCUMENT)
    const port = owner.controller.ports[0]
    port.deliver = raw => {
      const call = JSON.parse(raw)
      if (call.kind === 'ui') queueMicrotask(() => port.emit(JSON.stringify({ protocol: call.protocol, kind: 'ui.reply', generation: call.generation, id: call.id, ok: true, value: { connected: true, closed: true } })))
    }
    port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ready', generation: 1 }))
    await tick(); owner.command('connect.demo', 'phase11-session'); await tick()
    const value = { probe, commandId: 'initial-read', instance: 'source-instance', relayCursor: wire.relayCursor,
      ...(probe === 'follow-decoded' ? { kind: 'reset', payloadSha256: 'a'.repeat(64) } : { domainCursor: 35, connection: 'connected', readOnly: false, liveTextBytes: 0, liveTextSha256: createHash('sha256').update('').digest('hex') }) }
    port.emit(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui.reply', generation: 1, id: 'native-acceptance-report', ok: true, value }))
    await tick()
    assert(errors.includes('native-port-failed'))
    assert(!messages.some(message => message.startsWith('DSH native follow diagnostic: ')))
    findings.push({ value, protocolCursorAccepted: true, nativeDiagnosticRejected: true, errors, diagnosticAccepted: false })
  } finally { await owner.close(); console.info = old }
}
await writeFile('evidence/phase26-diagnostic-repro.json', JSON.stringify({ schema: 'dsh-harmony-v25-cursor-defect-repro/1', createdAt: new Date().toISOString(), build: 'evidence/native-build/2026-10-12T13-40-03-568Z.json', stagedSourceHashVerified: true, findings, interpretation: 'Reproduction of the v25 defect, not a passing diagnostic acceptance test. Wire permits -1; the private diagnostic rejects every cursor below zero and closes the owner.', nativeExecuted: false, networkActivated: false, hapChanged: false, validatorsChanged: false }, null, 2) + '\n')
console.log('REPRODUCED: v25 rejects legal -1 cursor in both decoded/admitted private diagnostics; sealed HAP and validators unchanged')

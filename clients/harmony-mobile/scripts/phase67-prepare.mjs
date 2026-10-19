/** Reconcile the ungranted expired round and prepare one fresh invocation of the unchanged tested runtime. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const current = await json('.build/phase67-reconcile-current.json'), processes = await json('.build/phase67-processes-current.json'), phone = await json('evidence/phase67-device-inspect.json'), layout = await json('evidence/phase67-layout-foreground.json'), acknowledgement = await json('evidence/phase66-world-assets-ack.json')
assert.equal(current.activeGrantCount, 0); assert.equal(current.grants.length, 0); assert.equal(processes.fieldProcessCount, 0)
assert.ok(current.records.every(value => !value.present)); assert.equal(phone.pid, '56617')
assert.ok(layout.nodes.some(value => value.text === '确认并签署这次挑战' && value.enabled === 'false'))
assert.equal(layout.nodes.filter(value => value.type === 'Text' && value.publicJsonSha256).length, 1)
for (const entry of acknowledgement.sessionFilesUnchanged) assert.equal(hash(await readFile(entry.path)), entry.sha256)
assert.equal(hash(await readFile(acknowledgement.manifest)), acknowledgement.afterSha256)
const report = { at: new Date().toISOString(), expiredExchange: current.records.find(value => value.path.endsWith('phone-reply.json')).path, signatureAttemptAbsent: true, publicReplyAbsent: true, nativeSignControlDisabled: true, deviceGrantCount: 0, fieldProcessCount: 0, previousGracefulExitNotObserved: true, endedByExecutionTransportLoss: true, currentSessionBytesUnchanged: true, oldProofPreserved: true, installedApplicationReused: true, newIdentityCreated: false, freshInvocationPermitted: true }
await writeFile('evidence/phase67-previous-round-reconciled.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
const source = await readFile('scripts/phase66-start-field.mjs', 'utf8')
await writeFile('scripts/phase67-start-field.mjs', source.replaceAll('phase66', 'phase67').replace('.build/phase67-active-v2.json', '.build/phase66-active-v2.json'), { flag: 'wx' })
console.log(JSON.stringify(report))

/** Seal closed ninth-round evidence only; this module invokes no SDK, listener, emulator or device command. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { nativeCheckpointProof } from './native-checkpoint-proof.mjs'
const root = resolve('.')
assert.equal(root, resolve('D:/workspace/agents/deepseek-harness/clients/harmony-mobile'))
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n')
const index = [], attempts = []
const hap = await json('evidence/phase28-hap.json')
assert.equal(hash(await readFile(hap.path)), hap.sha256)
for (const name of ['round9', 'round9-resume1']) {
  const world = resolve('D:/Temp/dsh-harmony-phase28-native-20261013-' + name), destination = resolve('evidence/phase28-native/' + name)
  const cleanup = await json(join(world, 'forward-cleanup.json')), service = await json(join(world, 'service-final.json'))
  assert.equal(cleanup.failure, null); assert.equal(cleanup.deadlineExceeded, false); assert(cleanup.cleanup.every(value => value.ok))
  assert.equal(service.closed, true); assert.equal(service.realModelCalls, 0); assert.equal(service.uploadCalls, 0)
  assert(service.records.every(value => value.listenerClosed && value.carrier.active === 0 && value.promptCalls === 0 && value.counts.replay[0].calls === 0))
  const licenses = []
  for (const phase of ['before-start', 'after-start', 'before-stop', 'after-stop']) {
    const license = (await json(join(world, 'license-' + phase + '.json'))).license
    assert.equal(license.sha256, '4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4')
    assert.equal(license.modifiedUtc, '2026-10-12T02:57:25.618Z'); assert.equal(license.rawFileCopied, false)
    licenses.push({ phase, ...license })
  }
  await mkdir(destination, { recursive: true })
  for (const file of await readdir(world)) {
    const original = join(world, file)
    if (!(await stat(original)).isFile()) continue
    const bytes = await readFile(original), copied = join(destination, file)
    const text = /\.(?:json|log|txt|request)$/.test(file)
    const normalized = text ? Buffer.from(bytes.toString('utf8').replace(/\r+\n/g, '\n').trimEnd() + '\n') : bytes
    await writeFile(copied, normalized)
    if (text && !normalized.equals(bytes)) await writeFile(copied + '.raw', bytes)
    index.push({ world, original: file, copied: copied.replaceAll('\\', '/'), bytes: bytes.length, originalSha256: hash(bytes), copySha256: hash(normalized), originalBytesRetained: !text || normalized.equals(bytes) || text })
  }
  attempts.push({ world, windowOpened: cleanup.windowOpened, firstForwardAt: cleanup.startedAt, cleanupAt: cleanup.completedAt, cleanupPassed: true, cleanupOperations: cleanup.cleanup.length, licenses, source: service.records.at(-1) })
}
const world = attempts[1].world, source = attempts[1].source, driver = await json(join(world, 'native-driver-result.json')), lease = await json(join(world, 'forward-lease.json'))
assert.equal(attempts[0].windowOpened, false); assert.equal(driver.passed, true); assert.equal(driver.cleanupPassed, true)
assert.deepEqual(driver.faultSummary, { planned: 1, passed: 1, failed: 0, blocked: 0 })
assert.equal(lease.mappingActivations, 1); assert.equal(lease.activationCount, 1); assert.equal(lease.maximumMs, 1800000)
assert.equal(Date.parse(lease.expiresAt) - Date.parse(lease.startedAt), 1800000)
assert.equal(Date.parse(lease.cleanupAt), Date.parse(lease.expiresAt) - 180000)
assert.equal(source.commandExpiry.elapsed, 0); assert.equal(source.commandExpiry.futureLimit, 0); assert.equal(source.commandClock, 'trusted')
const host = await json(join(world, 'final-host-check.json'))
assert.deepEqual(host.processes.map(value => value.ProcessId), [33004]); assert.deepEqual(host.listeners.map(value => value.LocalPort), [8710])
const output = await readFile(join(world, 'native-app-driver.log'), 'utf8')
const tree = await json(join(world, 'checkpoint-native-layout.json')), nodes = []
const walk = value => { if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value); for (const [key, child] of Object.entries(value)) if (key !== 'attributes') Array.isArray(child) ? child.forEach(walk) : walk(child) }
walk(tree)
const proof = nativeCheckpointProof(source.faults.checkpoint, source, output, nodes, { task: 'cancelled', taskText: hap.cancelledTaskText })
assert.equal(proof.passed, true); assert.deepEqual(proof.stages, driver.steps[0].evidence.proof.stages)
const labels = ['command generated', 'command sent', 'byte delivery', 'follow diagnostic']
const records = new Map(labels.map(label => [label, []]))
const logs = [output, ...driver.records.filter(value => value.args.includes('hilog')).map(value => value.output)]
for (const line of new Set(logs.flatMap(value => value.split(/\r?\n/)))) for (const label of labels) {
  const prefix = 'DSH native ' + label + ': ', offset = line.indexOf(prefix)
  if (offset >= 0) records.get(label).push({ line, value: JSON.parse(line.slice(offset + prefix.length)) })
}
const follow = records.get('follow diagnostic').map(value => value.value)
const initialDecoded = follow.find(value => value.probe === 'follow-decoded'), initialAdmitted = follow.find(value => value.probe === 'follow-admitted' && value.commandId === initialDecoded.commandId)
assert.equal(initialDecoded.relayCursor, -1); assert.equal(initialAdmitted.relayCursor, -1); assert.equal(initialAdmitted.domainCursor, 35); assert.equal(initialAdmitted.readOnly, false); assert.equal(initialAdmitted.connection, 'connected')
const pairs = [...new Set(source.commandAudit.records.map(value => value.commandId))].map(commandId => {
  const generated = records.get('command generated').find(value => value.value.commandId === commandId)?.value
  const sent = records.get('command sent').find(value => value.value.commandId === commandId)?.value
  const audit = source.commandAudit.records.filter(value => value.commandId === commandId), checked = audit.find(value => value.stage === 'checked')
  assert(generated && sent && checked, 'Missing native timing pair ' + commandId)
  assert.equal(generated.ttlMs, 53000); assert.equal(sent.expiresAt, generated.expiresAt); assert.equal(checked.outcome, 'admitted')
  const remainingMs = sent.expiresAt - checked.at; assert(remainingMs > 0 && remainingMs <= 60000)
  return { commandId, generated, sent, audit, remainingMs }
})
const socket = source.commandAudit.records.find(value => value.stage === 'fault-written' && value.fault === 'transport-reset')
assert(socket)
const lost = records.get('byte delivery').find(value => value.value.commandId === socket.commandId)?.value
assert.equal(lost.code, 'transport-lost'); assert.equal(lost.ended, false)
const recovered = follow.find(value => value.probe === 'follow-admitted' && value.commandId !== socket.commandId && pairs.find(pair => pair.commandId === value.commandId)?.generated.generatedAt > socket.at)
assert(recovered); assert.equal(recovered.readOnly, false); assert.equal(recovered.connection, 'connected')
const initialDelivery = records.get('byte delivery').find(value => value.value.commandId === initialDecoded.commandId)?.value
assert.equal(initialDelivery.ended, true); assert.equal(initialDelivery.code, '')
assert.equal(initialDelivery.receivedBytes, initialDelivery.deliveredBytes)
const lastState = await json(join(world, 'state.json'))
assert.equal(lastState.carrier.gatewayErrors, 0)
const summary = { schema: 'dsh-harmony-phase28-native/1', passed: true, criterionChanged: false, approvedRound: 9, hap, attempts, window: { startedAt: lease.startedAt, expiresAt: lease.expiresAt, cleanupReserveAt: lease.cleanupAt, driverDeadline: (await json(join(world, 'driver-anchor.json'))).deadline, completedCleanupAt: attempts[1].cleanupAt, elapsedMs: Date.parse(attempts[1].cleanupAt) - Date.parse(lease.startedAt), mappingActivations: 1, simultaneousMappings: 1, reset: false }, matrix: driver.faultSummary, initial: { decoded: initialDecoded, admitted: initialAdmitted, delivery: initialDelivery }, socket: { written: socket, deliveryFailure: lost, recovered }, checkpoint: { ...proof, nativeLayout: 'evidence/phase28-native/round9-resume1/checkpoint-native-layout.json', observationTime: driver.steps[0].completedAt }, commandPairs: pairs, shutdown: { beforeCleanupGatewayErrors: lastState.carrier.gatewayErrors, retainedFinalGatewayErrors: source.carrier.gatewayErrors, active: source.carrier.active, listenerClosed: true }, sharedHdcPid: 33004, ideStarted: false, authenticationAttempted: false, settingsChanged: false, realModels: 0, replayCalls: 0, promptCalls: 0, uploads: 0, nativeEmulatorSocketQualified: true, deviceQualified: false, wanQualified: false, installedDesktopQualified: false, priorFailuresReclassified: false, remaining: ['Real phone and OS compatibility', 'Authenticated remote transport and pairing', 'Installed desktop execution and rich action end-to-end acceptance'] }
await save('evidence/phase28-summary.json', summary)
await save('evidence/phase28-artifact-index.json', { files: index })
console.log(JSON.stringify({ passed: true, nativeSocket: true, elapsedMs: summary.window.elapsedMs, artifacts: index.length, initialCursor: -1, checkpointBytes: proof.diagnostics.delivered.receivedBytes, cleanup: 'all passed', device: false, wan: false }))

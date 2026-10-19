/** Seal closed round-eight artifacts and distinct blocked attempts; this script never invokes SDK or network APIs. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const root = resolve('.')
assert.equal(root, resolve('D:/workspace/agents/deepseek-harness/clients/harmony-mobile'))
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const normalize = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n').trimEnd() + '\n'
const exists = async path => { try { await access(path); return true } catch (error) { if (error.code !== 'ENOENT') throw error; return false } }
const output = resolve('evidence/phase26-native'); await mkdir(output, { recursive: true })
const attempts = [], index = []
for (const name of ['round8', 'round8-resume1', 'round8-resume2']) {
  const world = resolve('D:/Temp/dsh-harmony-phase26-native-20261013-' + name), destination = resolve(output, name)
  await mkdir(destination, { recursive: true })
  const cleanup = await json(resolve(world, 'forward-cleanup.json')), source = await json(resolve(world, 'service-final.json'))
  const driver = await exists(resolve(world, 'native-driver-result.json')) ? await json(resolve(world, 'native-driver-result.json')) : null
  const failure = await exists(resolve(world, 'prewindow-failure.json')) ? await json(resolve(world, 'prewindow-failure.json')) : null
  assert.equal(cleanup.failure, null); assert.equal(cleanup.deadlineExceeded, false)
  assert(cleanup.cleanup.every(value => value.ok)); assert.equal(source.closed, true)
  assert.equal(source.realModelCalls, 0); assert.equal(source.uploadCalls, 0)
  assert(source.records.every(record => record.promptCalls === 0 && record.counts.replay[0].calls === 0 && record.carrier.active === 0 && record.listenerClosed && record.faults.consumed.length === 0 && record.faults.written.length === 0))
  if (driver) { assert.equal(driver.passed, false); assert.equal(driver.cleanupPassed, true); assert(driver.steps.every(step => step.status === 'blocked' && step.executed === false)) }
  const lines = driver ? [...new Set(driver.records.flatMap(record => record.output.split(/\r?\n/)).filter(line => line.includes('DSH native')))] : []
  const files = ['forward-cleanup.json', 'service-final.json', 'state.json', 'owner.json', 'resource-owner.json', 'emulator-owner.json', 'emulator-start-request.json', 'emulator-start.out.log', 'emulator-start.err.log', 'driver-anchor.json', 'prewindow-commands.json', 'service.log', 'exit.json', 'license-before-start.json', 'license-after-start.json', 'license-before-stop.json', 'license-after-stop.json', 'native-driver-result.json', 'native-app-driver.log', 'forward-lease.json', 'forward-active.json', 'prewindow-ready.json', 'prewindow-failure.json', 'resume-preflight.json', 'prelaunch-screen.jpeg', 'awake-screen.jpeg', 'normal-screen-navigation.json', 'target-ready-observations.json', 'final-host-check.json']
  const licenses = []
  for (const file of files) {
    const path = resolve(world, file); if (!await exists(path)) continue
    const bytes = await readFile(path), target = resolve(destination, file)
    await copyFile(path, target)
    const normalized = !file.endsWith('.jpeg') && bytes.toString('utf8') !== normalize(bytes)
    if (normalized) { await copyFile(path, target + '.raw'); await writeFile(target, normalize(bytes)) }
    index.push({ attempt: name, source: path, file: 'evidence/phase26-native/' + name + '/' + file, originalBytes: bytes.length, sha256: digest(bytes), normalized, rawFile: normalized ? 'evidence/phase26-native/' + name + '/' + file + '.raw' : null })
    if (file.startsWith('license-')) {
      const audit = JSON.parse(bytes.toString('utf8'))
      assert.equal(audit.license.sha256, '4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4')
      assert.equal(audit.license.modifiedUtc, '2026-10-12T02:57:25.618Z')
      assert.equal(audit.emulatorExecutableInvocations, 0); assert.equal(audit.acceptedNewAgreement, false)
      licenses.push({ file, ...audit.license })
    }
  }
  const report = { name, world, status: 'blocked', error: driver?.error ?? failure?.code, steps: driver?.steps ?? [], socketFaultExecuted: false, cleanup: { completedAt: cleanup.completedAt, windowOpened: cleanup.windowOpened, operations: cleanup.cleanup.map(({ name, ok }) => ({ name, ok })) }, originalAnchor: await json(resolve(world, 'driver-anchor.json')), source: source.records, nativeLines: lines, licenses }
  await save(resolve(destination, 'closed-report.json'), report); attempts.push(report)
}
const lease = await json(resolve(output, 'round8/forward-lease.json'))
const replacement = await json(resolve(output, 'round8-resume2/forward-lease.json'))
const host = await json(resolve(output, 'round8-resume2/final-host-check.json'))
assert.equal(replacement.startedAt, lease.startedAt); assert.equal(replacement.expiresAt, lease.expiresAt); assert.equal(replacement.mappingActivations, 2)
assert(attempts.every(attempt => attempt.originalAnchor.deadline === attempts[0].originalAnchor.deadline))
assert.deepEqual(host.processes.map(process => process.ProcessId), [33004]); assert.deepEqual(host.listeners.map(listener => listener.LocalPort), [8710])
const final = attempts.at(-1), nativeGeneration = final.nativeLines.find(line => line.includes('DSH native command generated: ') && line.includes('"operation":"session.sync"'))
const generated = JSON.parse(nativeGeneration.slice(nativeGeneration.indexOf('DSH native command generated: ') + 'DSH native command generated: '.length))
const sentLine = final.nativeLines.find(line => line.includes('DSH native command sent: ') && line.includes(generated.commandId)), sent = JSON.parse(sentLine.slice(sentLine.indexOf('DSH native command sent: ') + 'DSH native command sent: '.length))
const audit = final.source[0].commandAudit.records.filter(record => record.commandId === generated.commandId)
const deliveryLine = final.nativeLines.find(line => line.includes('DSH native byte delivery: ') && line.includes(generated.commandId)), delivery = JSON.parse(deliveryLine.slice(deliveryLine.indexOf('DSH native byte delivery: ') + 'DSH native byte delivery: '.length))
assert.equal(generated.ttlMs, 53000); assert.equal(sent.expiresAt, generated.expiresAt)
assert.equal(delivery.deliveredBytes, 76009); assert.equal(delivery.code, 'stream-closed')
assert(final.nativeLines.some(line => line.includes('DSH native runtime failure: native-port-failed')))
const sourceRepro = await json('evidence/phase26-source-repro-2026-10-13T01-27-45.318Z/source-reset.json')
assert.equal(sourceRepro.relayCursor, -1); assert.equal(sourceRepro.domainCursor, 35)
const hap = await json('evidence/phase25-hap.json'); assert.equal(digest(await readFile(hap.path)), hap.sha256)
for (const file of ['phase26-runner-tests.tap', 'phase26-compile.log', 'phase26-compile-with-repro.log', 'phase26-compile-with-repro-fixed.log']) {
  const path = resolve('evidence', file), bytes = await readFile(path)
  if (!await exists(path + '.raw')) await writeFile(path + '.raw', bytes, { flag: 'wx' })
  assert.equal(normalize(await readFile(path + '.raw')), normalize(bytes))
  await writeFile(path, normalize(bytes))
}
const summary = {
  schema: 'dsh-harmony-round8-native/1', createdAt: new Date().toISOString(), passed: false, windowClosed: true,
  qualification: { planned: 1, passed: 0, failed: 0, blocked: 1 }, socketFaultExecuted: false,
  attempts: attempts.map(({ name, error, socketFaultExecuted, cleanup }) => ({ name, error, socketFaultExecuted, cleanup })),
  firstForwardAt: lease.startedAt, expiresAt: lease.expiresAt, cleanupAt: lease.cleanupAt, driverDeadline: attempts[0].originalAnchor.deadline,
  completedAt: final.cleanup.completedAt, elapsedFromFirstForwardMs: Date.parse(final.cleanup.completedAt) - Date.parse(lease.startedAt), mappingActivations: 2, maximumSimultaneousMappings: 1, emulatorStarts: 3, windowReset: false,
  hap: { path: hap.path, sha256: hap.sha256, bytes: hap.bytes, rebuilt: false, changed: false, api: 26, unsigned: true },
  initialFollow: { generated, sent, audit, delivery, runtimeFailure: 'native-port-failed', checkedRemainingMs: generated.expiresAt - audit.find(record => record.stage === 'checked').at },
  earliestFailure: 'Initial owner-bound frame private diagnostic admission; native-port-failed before valid native view and before socket fault injection.',
  rootCause: 'Wire and real source reset allow relayCursor=-1; sealed v25 private diagnostic validates relayCursor>=0. Both decoded/admitted reports reject the legitimate initial sentinel and close the native owner. Actual diagnostic packet values were not printed before rejection; source and same staged .ets SDK reproduction establish the mismatch.',
  sourceRepro, sdkRepro: 'evidence/phase26-diagnostic-repro.json', validatorsChanged: false, payloadOrExpectedTextChanged: false,
  promptCalls: 0, replayCalls: 0, realModels: 0, uploads: 0, realTaskDispatches: 0, expiryElapsed: 0, expiryFutureLimit: 0,
  cleanupPassed: true, licenseUnchanged: true, licenseRawCopied: false, sharedHdcPid: 33004, sharedHdcStopIssued: false,
  installedDshTouched: false, systemTimeChanged: false, publicProtocolChanged: false, committed: false, pushed: false,
  remaining: 'Socket recovery and exact visible probe remain unqualified. No validation/HAP change or additional native attempt in this window; private diagnostic sentinel handling needs separate offline correction and review.'
}
assert.equal(summary.elapsedFromFirstForwardMs, 853635)
await save('evidence/phase26-artifact-index.json', { schema: 'dsh-harmony-round8-artifacts/1', files: index })
await save('evidence/phase26-summary.json', summary)
console.log(JSON.stringify({ qualification: summary.qualification, completedAt: summary.completedAt, elapsedMs: summary.elapsedFromFirstForwardMs, artifacts: index.length, rootCause: 'private diagnostic rejects valid -1', validatorsChanged: false }))

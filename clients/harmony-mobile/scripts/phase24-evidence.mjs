/** Derive the closed seventh-window report from owned artifacts; never invoke SDK, network, or native processes. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root = resolve('.')
assert.equal(root, resolve('D:/workspace/agents/deepseek-harness/clients/harmony-mobile'))
const evidence = resolve('evidence/phase24-native')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const json = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const normalize = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n').trimEnd() + '\n'
const attempts = []
const index = []
await mkdir(evidence, { recursive: true })
for (const name of ['round7', 'round7-resume1']) {
  const world = resolve('D:/Temp/dsh-harmony-phase24-native-20261012-' + name)
  const destination = resolve(evidence, name)
  await mkdir(destination, { recursive: true })
  const driver = await readJson(resolve(world, 'native-driver-result.json'))
  const service = await readJson(resolve(world, 'service-final.json'))
  const lease = await readJson(resolve(world, 'forward-lease.json'))
  const anchor = await readJson(resolve(world, 'driver-anchor.json'))
  const cleanup = await readJson(resolve(world, 'forward-cleanup.json'))
  const host = await readJson(resolve(world, 'final-host-check.json'))
  assert.equal(driver.passed, false)
  assert.equal(driver.cleanupPassed, true)
  assert.equal(cleanup.failure, null)
  assert.equal(cleanup.deadlineExceeded, false)
  assert(cleanup.cleanup.every(operation => operation.ok))
  assert.equal(lease.startedAt, '2026-10-12T12:43:34.992Z')
  assert.equal(lease.expiresAt, '2026-10-12T13:13:34.992Z')
  assert.equal(anchor.deadline, '2026-10-12T13:03:35.438Z')
  assert.deepEqual(driver.expiryFailures, [])
  assert.deepEqual(host.processes.map(process => process.ProcessId), [33004])
  assert.deepEqual(host.listeners.map(listener => listener.LocalPort), [8710])
  assert.equal(service.closed, true)
  assert.equal(service.realModelCalls, 0)
  assert.equal(service.uploadCalls, 0)
  assert.equal(service.records.length, 1)
  const source = service.records[0]
  assert.equal(source.commandClock, 'trusted')
  assert.equal(source.promptCalls, 0)
  assert.equal(source.counts.replay[0].calls, 0)
  assert.equal(source.commandExpiry.elapsed, 0)
  assert.equal(source.commandExpiry.futureLimit, 0)
  assert.equal(source.carrier.active, 0)
  assert.equal(source.listenerClosed, true)
  const lines = [...new Set(driver.records.flatMap(record => record.output.split(/\r?\n/)).filter(line => /DSH native (?:command generated:|command sent:|view:)/.test(line)))]
  const generated = new Map(), sent = new Map()
  for (const line of lines) {
    for (const [label, target] of [['generated', generated], ['sent', sent]]) {
      const marker = 'DSH native command ' + label + ': '
      const offset = line.indexOf(marker)
      if (offset < 0) continue
      const value = JSON.parse(line.slice(offset + marker.length))
      if (target.has(value.commandId)) assert.deepEqual(target.get(value.commandId).value, value)
      target.set(value.commandId, { line, value })
    }
  }
  const audit = source.commandAudit.records
  const pairs = [...new Set(audit.map(record => record.commandId))].map(commandId => {
    const generation = generated.get(commandId)?.value
    const transmission = sent.get(commandId)?.value
    const records = audit.filter(record => record.commandId === commandId)
    assert(generation && transmission, 'Missing native generation/send: ' + commandId)
    assert.equal(generation.ttlMs, 53000)
    assert.equal(generation.expiresAt - generation.generatedAt, 53000)
    assert.equal(transmission.expiresAt, generation.expiresAt)
    assert(records.every(record => record.expiresAt === generation.expiresAt))
    const received = records.find(record => record.stage === 'received')
    const checked = records.find(record => record.stage === 'checked')
    assert(received && checked)
    const remainingMs = generation.expiresAt - checked.at
    assert(remainingMs > 0 && remainingMs <= 60000)
    assert.equal(checked.outcome, 'admitted')
    return { commandId, generation, transmission, records, remainingMs, generatedMinusDesktopReceivedMs: generation.generatedAt - received.at }
  })
  const faults = audit.filter(record => record.stage === 'fault-taken').map(taken => {
    const written = audit.find(record => record.stage === 'fault-written' && record.commandId === taken.commandId && record.faultIndex === taken.faultIndex && record.fault === taken.fault)
    assert(written)
    return { fault: taken.fault, commandId: taken.commandId, faultIndex: taken.faultIndex, taken, written }
  })
  const swipes = driver.records.filter(record => record.args.includes('swipe')).map(({ at, args, code, output }) => ({ at, args, code, output }))
  const licenses = []
  for (const file of ['license-before-start.json', 'license-after-start.json', 'license-before-stop.json', 'license-after-stop.json']) {
    const record = await readJson(resolve(world, file))
    assert.equal(record.acceptedNewAgreement, false)
    assert.equal(record.license.sha256, '4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4')
    assert.equal(record.license.modifiedUtc, '2026-10-12T02:57:25.618Z')
    licenses.push({ file, at: record.generatedAt, ...record.license })
  }
  const files = ['native-driver-result.json', 'service-final.json', 'forward-lease.json', 'forward-active.json', 'forward-cleanup.json', 'driver-anchor.json', 'final-host-check.json', 'prewindow-ready.json', 'emulator-owner.json', 'resource-owner.json', 'owner.json', 'license-before-start.json', 'license-after-start.json', 'license-before-stop.json', 'license-after-stop.json', 'native-app-driver.log', 'native-timing-views.log', 'service.log']
  if (name === 'round7') files.push('hap-before.json', 'cursor-gap.jpeg', 'cursor-conflict.jpeg')
  else files.push('resume-preflight.json', 'last-checkpoint-layout.json')
  for (const file of files) {
    const path = resolve(world, file), bytes = await readFile(path)
    const target = resolve(destination, file)
    await copyFile(path, target)
    const normalized = !file.endsWith('.jpeg') && bytes.toString('utf8') !== normalize(bytes)
    if (normalized) {
      await copyFile(path, target + '.raw')
      await writeFile(target, normalize(bytes))
    }
    index.push({ attempt: name, source: path, file: 'evidence/phase24-native/' + name + '/' + file, bytes: bytes.length, sha256: digest(bytes), originalBytesPreserved: true, normalized, rawFile: normalized ? 'evidence/phase24-native/' + name + '/' + file + '.raw' : null })
  }
  const { commandAudit, ...sourceSummary } = source
  const views = lines.filter(line => line.includes('DSH native view:'))
  const report = { name, world, passed: false, steps: driver.steps, faultSummary: driver.faultSummary, lease, anchor, cleanup: { completedAt: cleanup.completedAt, passed: true, operations: cleanup.cleanup.map(({ name, ok }) => ({ name, ok })) }, source: sourceSummary, nativeViews: views, commandPairs: pairs, faultPairs: faults, checkpointScrollCommands: swipes, expiryFailures: driver.expiryFailures, licenses, host }
  await json(resolve(destination, 'paired-proof.json'), report)
  attempts.push(report)
}
assert.deepEqual(attempts[0].faultSummary, { planned: 3, passed: 2, failed: 1, blocked: 0 })
assert.deepEqual(attempts[1].faultSummary, { planned: 1, passed: 0, failed: 1, blocked: 0 })
assert.equal(attempts[1].checkpointScrollCommands.length, 4)
assert(attempts[1].checkpointScrollCommands.every(command => command.code === 0))
const layout = await readJson(resolve(evidence, 'round7-resume1/last-checkpoint-layout.json'))
const nodes = []
const visit = value => {
  if (!value || typeof value !== 'object') return
  if (value.attributes) nodes.push(value.attributes)
  for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child)
}
visit(layout)
const texts = nodes.filter(node => node.type === 'Text').map(({ text, originalText, visible, bounds }) => ({ text, originalText, visible, bounds }))
assert(!texts.some(node => node.text === attempts[1].source.faults.checkpoint || node.originalText === attempts[1].source.faults.checkpoint))
const hap = await readJson(resolve('evidence/phase23-hap.json'))
assert.equal(digest(await readFile(hap.path)), hap.sha256)
assert.equal((await stat(hap.path)).size, hap.bytes)
await mkdir(resolve(evidence, 'original-checks'), { recursive: true })
for (const file of ['phase24-runner-tests.tap', 'phase24-scroll-tests.tap', 'phase24-compile.log']) {
  const path = resolve('evidence', file), bytes = await readFile(path)
  const rawPath = resolve(evidence, 'original-checks', file + '.raw')
  let original
  try { original = await readFile(rawPath) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    original = bytes
    await writeFile(rawPath, original, { flag: 'wx' })
  }
  assert.equal(normalize(original), normalize(bytes))
  await writeFile(path, normalize(bytes))
}
const summary = {
  schema: 'dsh-harmony-round7-native/1', createdAt: new Date().toISOString(), windowClosed: true, passed: false,
  qualification: { planned: 3, passed: 2, failed: 1, blocked: 0 }, attemptedObservations: 4,
  cases: attempts.flatMap(attempt => attempt.steps.map(step => ({ attempt: attempt.name, ...step }))),
  originalLease: attempts[0].lease, originalDriverAnchor: attempts[0].anchor,
  completedAt: attempts[1].cleanup.completedAt,
  elapsedFromFirstForwardMs: Date.parse(attempts[1].cleanup.completedAt) - Date.parse(attempts[0].lease.startedAt),
  mappingActivations: 2, maximumSimultaneousMappings: 1, windowReset: false,
  cleanupPassed: true, sharedHdcPid: 33004, sharedHdcStopIssued: false, manualHdcStartIssued: false,
  hap: { path: hap.path, sha256: hap.sha256, bytes: hap.bytes, rebuiltThisPhase: false, unsigned: true, api: 26 },
  clock: { nominalTtlMs: 60000, wireTtlMs: 53000, desktopCapMs: 60000, status: 'trusted', expiryElapsed: 0, expiryFutureLimit: 0, faultCommandPairs: attempts.map(attempt => ({ attempt: attempt.name, pairs: attempt.faultPairs, receivedCommands: attempt.commandPairs.length, remainingMsRange: [Math.min(...attempt.commandPairs.map(pair => pair.remainingMs)), Math.max(...attempt.commandPairs.map(pair => pair.remainingMs))] })) },
  sourceFinalCounters: attempts.map(attempt => ({ attempt: attempt.name, carrier: attempt.source.carrier })),
  promptCalls: 0, replayCalls: 0, realModels: 0, uploads: 0, systemTimeChanged: false, publicProtocolChanged: false, serverAdmissionRelaxed: false,
  licenseUnchanged: true, licenseRawCopied: false, installedDshTouched: false, committed: false, pushed: false,
  negativeCaseVisualReview: { screenshots: ['round7/cursor-gap.jpeg', 'round7/cursor-conflict.jpeg'], reviewed: true, observation: 'Native disconnected UI and disabled task buttons visible; precise cursor error fields are in the native log, not screenshot text.' },
  continuationLayout: { exactCheckpointObserved: false, texts, source: 'round7-resume1/last-checkpoint-layout.json', scrolls: 4 },
  references: attempts.map(attempt => 'evidence/phase24-native/' + attempt.name + '/paired-proof.json'),
  remaining: 'Socket exact native Text/originalText marker was absent twice despite reset-snapshot write and rows=7. Rendering/layout cause unresolved; no claim of socket acceptance. Real phone, WAN, installed DSH profile and production time/grant authentication remain unqualified.'
}
await json(resolve('evidence/phase24-artifact-index.json'), { schema: 'dsh-harmony-round7-artifacts/1', files: index })
await json(resolve('evidence/phase24-summary.json'), summary)
console.log(JSON.stringify({ passed: false, qualification: summary.qualification, elapsedMs: summary.elapsedFromFirstForwardMs, evidenceFiles: index.length, pairs: attempts.map(attempt => attempt.commandPairs.length), nativeResourceCalls: 0 }))

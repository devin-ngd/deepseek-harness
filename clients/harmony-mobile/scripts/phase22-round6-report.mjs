/** Seal the sixth diagnostic attempt and exact paired clock observations; no SDK or native resources are activated. */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const world = 'D:/Temp/dsh-harmony-phase22-native-20261012-round6'
const get = async name => JSON.parse(await readFile(join(world, name), 'utf8'))
const checksum = bytes => createHash('sha256').update(bytes).digest('hex')
const driver = await get('native-driver-result.json'), lease = await get('forward-lease.json')
const cleanup = await get('forward-cleanup.json'), service = await get('service-final.json'), host = await get('final-host-check.json')
const hap = JSON.parse(await readFile('evidence/phase22-hap.json', 'utf8'))
const licenses = await Promise.all(['license-before-start.json', 'license-after-start.json', 'license-before-stop.json', 'license-after-stop.json'].map(get))
if (!driver.cleanupPassed || cleanup.failure !== null || cleanup.deadlineExceeded || !cleanup.cleanup.every(row => row.ok)) throw Error('Owned cleanup not confirmed')
if (lease.mappingActivations !== 1 || lease.maximumMs !== 1800000 || cleanup.completedAt >= lease.expiresAt) throw Error('Bounded original window differs')
if (licenses.some(row => row.license.sha256 !== licenses[0].license.sha256 || row.license.modifiedUtc !== licenses[0].license.modifiedUtc)) throw Error('License changed')
if (checksum(await readFile(hap.path)) !== hap.sha256) throw Error('Sealed HAP changed')
if (host.processes.some(row => /^(Emulator|qemu|deveco)/i.test(row.Name)) || host.listeners.some(row => [5555,16311,18081,3741].includes(row.LocalPort))) throw Error('Owned resources or IDE remain')
const run = service.records[0]
if (!service.closed || service.realModelCalls !== 0 || service.uploadCalls !== 0 || run.promptCalls !== 0 || run.counts.replay[0].calls !== 0) throw Error('Replay safety differs')
const lines = [...new Set(driver.records.filter(row => row.args.includes('hilog')).flatMap(row => row.output.split(/\r?\n/)))]
const timeline = lines.flatMap(line => { const match = /DSH native command (generated|sent): (\{.*\})/.exec(line); return match ? [{ stage: match[1], ...JSON.parse(match[2]) }] : [] })
const audits = service.records.flatMap(row => row.commandAudit.records)
const pairs = timeline.filter(row => row.stage === 'generated').map(generation => ({ commandId: generation.commandId, generation,
  send: timeline.find(row => row.stage === 'sent' && row.commandId === generation.commandId), desktop: audits.filter(row => row.commandId === generation.commandId) }))
if (pairs.length !== 5 || timeline.length !== 10 || run.commandAudit.dropped !== 0 || pairs.some(row => !row.send || row.desktop.length !== 2)) throw Error('Complete paired timings absent')
const rejected = pairs.filter(row => row.desktop.some(next => next.outcome === 'future-limit')).map(row => {
  const received = row.desktop.find(next => next.stage === 'received'), checked = row.desktop.find(next => next.stage === 'checked')
  return { commandId: row.commandId, operation: row.generation.operation, generatedAt: row.generation.generatedAt, sentAt: row.send.sentAt,
    receivedAt: received.at, checkedAt: checked.at, expiresAt: row.generation.expiresAt, ttlMs: row.generation.ttlMs,
    remainingAtCheckMs: row.generation.expiresAt - checked.at, futureExcessMs: row.generation.expiresAt - checked.at - 60000,
    nativeGenerationToSendMs: row.send.sentAt - row.generation.generatedAt,
    clockLeadLowerBoundMs: row.send.sentAt - received.at, rejection: checked.outcome }
})
if (rejected.length !== 3 || rejected.map(row => row.futureExcessMs).join(',') !== '404,375,358' || rejected.some(row => row.ttlMs !== 60000 || row.clockLeadLowerBoundMs <= 0)) throw Error('Recorded clock cause differs')
if (driver.faultSummary.blocked !== 3 || driver.faultSummary.passed !== 0 || driver.steps.some(row => row.executed) || run.faults.consumed.length || run.faults.written.length) throw Error('Native matrix differs')
const destination = 'evidence/phase22-round6-native'; await mkdir(destination)
const names = ['native-driver-result.json','prewindow-ready.json','prewindow-commands.json','forward-lease.json','forward-active.json','forward-cleanup.json','emulator-owner.json','emulator-start-request.json','pre-start-processes.json','resource-owner.json','owner.json','state.json','service-final.json','service.log','exit.json','license-before-start.json','license-after-start.json','license-before-stop.json','license-after-stop.json','final-host-check.json','inspection-reopen.json','native-app-driver.log','command-timing-excerpts.log','command-timing-pairs.json','prewindow-screen.jpeg','awake-screen.jpeg','bundle-before.txt','emulator-start.out.log','emulator-start.err.log']
for (const name of await readdir(world)) if (/^expiry-failure-\d+\.json$/.test(name)) names.push(name)
const files = {}
for (const name of names) {
  const original = await readFile(join(world, name))
  const bytes = /\.(?:json|txt|log)$/.test(name) ? Buffer.from(original.toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').trimEnd() + '\n') : original
  await writeFile(join(destination, name), bytes, { flag: 'wx' })
  files[name] = { bytes: bytes.length, sha256: checksum(bytes), originalBytes: original.length, originalSha256: checksum(original), lineEndingsNormalized: !bytes.equals(original) }
}
await writeFile(join(destination, 'paired-timings.json'), JSON.stringify(pairs, null, 2) + '\n', { flag: 'wx' })
const summary = { schema: 'dsh-harmony-native-diagnostic-round6/1', generatedAt: new Date().toISOString(), passed: false,
  windowClosed: true, noFurtherReopen: true, nativeExecuted: true, faultScenariosExecuted: false, matrix: driver.steps, counts: driver.faultSummary,
  startedAt: lease.startedAt, originalDeadline: lease.expiresAt, cleanupAt: cleanup.completedAt, elapsedMs: Date.parse(cleanup.completedAt) - Date.parse(lease.startedAt),
  mappingActivations: 1, maximumSimultaneousMappings: 1, windowReset: false, cleanupPassed: true, hostCheck: destination + '/final-host-check.json',
  licenseUnchanged: true, licenseSha256: licenses[0].license.sha256, licenseModifiedUtc: licenses[0].license.modifiedUtc,
  licenseCliInvoked: false, licenseInputSent: false, systemTimeChanged: false, securitySettingsChanged: false, ideStarted: false,
  sharedHdc: { preexistingAbsent: true, normalSdkAutomaticallyStartedPid: 33004, manualStartIssued: false, stopIssued: false, preservedAfterCleanup: host.processes.some(row => row.Name === 'hdc.exe' && row.ProcessId === 33004) },
  realModels: 0, uploads: 0, promptCalls: 0, replayCalls: 0, hap,
  actualClockCauseConfirmed: true, cause: 'Native epoch-millisecond clock is ahead of desktop admission; client TTL equals the desktop future limit and fresh reads are refused before fault injection.',
  rejected, completePairedRequests: 5, auditDropped: 0, timingEvidence: destination + '/paired-timings.json',
  preciseClockOffsetMeasured: false, clockOffsetLimit: 'Send-before-receive ordering proves at least the reported clock lead. One-way transit and queue latency prevent treating the lower bound as an exact offset.',
  fifthWindowIndividualRequestsReclassified: false, ttlRaised: false, ttlChanged: false, expiryIgnored: false, publicProtocolChanged: false,
  faults: run.faults, commandExpiry: run.commandExpiry, notQualified: ['native socket reset recovery','native cursor-gap','native cursor-conflict','real installed DSH','real device/pairing/WAN/TLS/signing'], files }
await writeFile('evidence/phase22-round6-summary.json', JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ actualClockCauseConfirmed: true, blocked: 3, faultsWritten: 0, elapsedMs: summary.elapsedMs, cleanupPassed: true, realModels: 0, uploads: 0, files: names.length }))

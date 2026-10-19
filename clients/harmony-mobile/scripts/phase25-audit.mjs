/** Read the closed synthetic journal and native artifacts, then replay shared projection in memory; no network or SDK operation. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
import { NativeAppHost } from '../.build/native-app-host.js'
import { observeNativeGeneration } from '../.build/native-acceptance-probe.js'
import { nativeCheckpointProof } from './native-checkpoint-proof.mjs'

const configuration = JSON.parse(await readFile('source.json', 'utf8'))
assert.equal(resolve('.'), resolve('D:/workspace/agents/deepseek-harness/clients/harmony-mobile'))
const require = createRequire(resolve(configuration.dshRoot, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [resolve(configuration.dshRoot, 'node_modules/.pnpm')] }))
await esbuild.build({ entryPoints: [resolve('integration/native-follow-faults.ts')], outfile: resolve('.build/phase25-faults.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', tsconfig: await projectionTsconfig(resolve('.'), configuration.dshRoot), absWorkingDir: configuration.dshRoot })
const { NativeFollowFaults } = await import('../.build/phase25-faults.js')
const previous = JSON.parse(await readFile('evidence/phase24-native/round7-resume1/paired-proof.json', 'utf8'))
const journalPath = 'evidence/phase25-synthetic-journal.v4.jsonl'
const journalBytes = await readFile(journalPath)
const [header, ...events] = journalBytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
assert.equal(header.id, 'phase11-session'); assert.equal(header.version, 4)
const { type, ...sessionHeader } = header
assert.equal(type, 'session')
const cursor = events.at(-1).seq
const reset = { protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: header.id, instance: 'phase25-journal-replay', relayCursor: 0, kind: 'reset', payload: { type: 'snapshot', header: sessionHeader, cursor, records: events.map(event => ({ type: 'event', event })), hasMore: false, projections: { asOfSeq: cursor, values: {} } } }
const marker = previous.source.faults.checkpoint, commandId = marker.slice('DSH read checkpoint '.length)
const faults = new NativeFollowFaults(1), before = JSON.stringify(reset)
const injected = faults.bytes('reset-snapshot', commandId, reset)
const checkpoint = JSON.parse(injected.text.split('\n')[0]).value
assert.equal(JSON.stringify(reset), before)
assert.deepEqual(checkpoint.payload.records, reset.payload.records)
const reports = [], views = [], raw = JSON.parse(await readFile('harmony/native-policy.json', 'utf8'))
const provider = {
  async request() { throw Error('Dispatch and rich requests are forbidden in this in-memory replay') },
  async *follow(command, resume, signal) {
    void command; void resume
    yield reset; yield checkpoint
    if (!signal.aborted) await new Promise(accept => signal.addEventListener('abort', accept, { once: true }))
  },
  async close() {},
}
const observed = observeNativeGeneration(provider, value => reports.push(value))
const host = new NativeAppHost({ async request() { throw Error('Native IO is forbidden in this audit') }, async close() {} }, raw.host, view => views.push(view), undefined, [header.id], () => ({ ...observed, owner: { desktopId: reset.desktopId, deviceId: reset.deviceId, sessionId: reset.sessionId }, mode: 'fixed-replay', metrics: () => ({ tasks: 0, actions: 0, mounts: 0 }) }))
try {
  await host.receive(JSON.stringify({ protocol: 'dsh-native-host/1', kind: 'ui', generation: raw.host.port.generation, id: 'phase25-audit-connect', method: 'connect.demo', payload: { sessionId: header.id } }))
  for (let turn = 0; turn < 10 && !reports.some(value => value.probe === 'follow-admitted' && value.liveTextSha256 === faults.report.checkpointFrame.textSha256); turn++) await new Promise(accept => setImmediate(accept))
  assert.equal(views[0].messages.length, 6)
  assert.equal(views.at(-1).messages.length, 7)
  assert.equal(views.at(-1).totalMessages, 6)
  assert.equal(views.at(-1).task, 'cancelled')
  assert.equal(views.at(-1).messages.at(-1).text, marker)
  assert(reports.some(value => value.probe === 'follow-admitted' && value.liveTextSha256 === faults.report.checkpointFrame.textSha256))
} finally { await host.close() }
assert.deepEqual(await readFile(journalPath), journalBytes)
const layout = JSON.parse(await readFile('evidence/phase24-native/round7-resume1/last-checkpoint-layout.json', 'utf8')), nodes = []
const visit = value => { if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value); for (const child of Object.values(value)) visit(child) }
visit(layout)
const list = nodes.find(node => node.attributes.type === 'List').attributes
const visibleMessages = nodes.filter(node => node.attributes.type === 'Text' && ['Mobile action completed by the real rich-inline service.', 'Fixed cancellable replay task'].includes(node.attributes.text)).map(node => node.attributes)
const oldProof = nativeCheckpointProof(marker, { ...previous.source, commandAudit: { records: previous.commandPairs.flatMap(pair => pair.records) } }, previous.nativeViews.join('\n'), nodes, { task: 'cancelled', taskText: '演示已取消' })
assert.equal(oldProof.passed, false)
const evidence = {
  schema: 'dsh-harmony-socket-offline-trace/1', createdAt: new Date().toISOString(), offlineOnly: true,
  originalNativeResult: 'failed', originalNativeEarliestMissingCapture: 'Exact BFF checkpoint payload/byte fingerprint and correlated ArkTS delivery were not recorded. Existing fault-written evidence is server-side only.',
  originalNativeObservedFailure: 'Exact native checkpoint Text/originalText absent after four bounded swipes; last widget tree contains historical rows 5/6, not the live tail.',
  originalFaultPair: previous.faultPairs.find(pair => pair.fault === 'reset-snapshot'),
  originalNativeViews: previous.nativeViews, listBounds: list.bounds, visibleMessages,
  originalQualificationUnderPreparedProof: oldProof,
  reconstructedReplay: { journalPath, journalSha256: createHash('sha256').update(journalBytes).digest('hex'), events: events.length, cursor, originalJournalUnchanged: true, checkpoint: marker, receipt: faults.report.checkpointFrame, nativeViews: views.map(view => ({ task: view.task, connection: view.connection, readOnly: view.readOnly, rows: view.messages.length, durableTotal: view.totalMessages, tail: view.messages.at(-1) })), reports, snapshotByteIdenticalToOriginalNetworkCapture: false, arkTsExecuted: false, arkWebExecuted: false, note: 'Uses actual saved synthetic records and unchanged injection/projection code; original HTTP snapshot bytes and assistant revision were not captured.' },
  rootCauseAssessment: 'Confirmed observation defect: bounded swipes stopped on historical rows in a 209px List; the driver did not target the live tail. No shared decoder or projection defect reproduced. Actual original marker reception/rendering remains unproven without missing captures.',
  fix: 'Native latest-message navigation by ListScroller plus stable native text/task ids; original probe payload and expected text retained. Acceptance requires correlated byte, decoded, admitted, native-published, fully-visible text and original task evidence.',
  emulatorStarted: false, installed: false, forwardCreated: false, realModels: 0, uploads: 0, newDispatches: 0,
}
await writeFile('evidence/phase25-trace.json', JSON.stringify(evidence, null, 2) + '\n')
console.log('PASS: unchanged synthetic journal yields 6 durable rows plus exact live checkpoint; native failure remains unqualified; no SDK/network calls')

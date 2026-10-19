/** Standalone offline verifier; reads only its packaged fixtures and invokes no SDK, network, model or desktop service. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseWireItem, parseResume } from '../src/wire.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { PhoneCore } from '../src/phone-core.ts'
import { observeNativeGeneration } from '../src/native-acceptance-probe.ts'
import { nativeCheckpointProof } from './native-checkpoint-proof.mjs'

const [major, minor] = process.versions.node.split('.').map(Number)
if (!(major === 22 && minor >= 19 || major >= 24)) throw Error('Node 22.19+ or 24+ required')
const root = new URL('./', import.meta.url)
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'))
const manifest = await json('manifest.json')
for (const file of manifest.files) {
  if (typeof file.path !== 'string' || file.path.includes('..') || file.path.startsWith('/') || file.path.includes(':') || file.path.includes('\\')) throw Error('Invalid package path')
  const bytes = await readFile(new URL(file.path, root))
  assert.equal(bytes.length, file.bytes, file.path)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
}
const matrix = await json('fixtures/acceptance-ledger.json')
assert.equal(matrix.fullCurrentRegressionClaimed, false)
assert.equal(matrix.rows.filter(row => row.status === 'current-native-pass').length, 1)
assert.equal(matrix.currentHap.sha256, manifest.nativeHapSha256)
const frame = parseWireItem(await json('fixtures/source-reset.json'))
assert.equal(frame.relayCursor, -1)
assert.throws(() => parseWireItem({ ...frame, relayCursor: -2 }))
assert.equal(parseResume({ instance: frame.instance, relayCursor: 0 }).relayCursor, 0)
const owner = { desktopId: frame.desktopId, deviceId: frame.deviceId, sessionId: frame.sessionId }
const limits = { maxBytes: 1048576, maxEvents: 512, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
let mutations = 0, follows = 0, closed = 0
const provider = {
  async request() { mutations++; throw Error('Offline package forbids every request operation') },
  async *follow() { follows++; yield frame },
  async close() { closed++ },
}
const reports = [], observed = observeNativeGeneration(provider, value => reports.push(value))
const model = new SemanticPhone(owner, limits, 512)
const core = new PhoneCore(observed.provider, model, { grantEpoch: 1, ttlMs: 53000, clock: () => 1000000, nextCommandId: () => 'offline-read', maxMounts: 8, maxIntents: 8, follow: { mode: 'once' }, observeCommand: observed.observeCommand })
observed.observeCore(core)
for await (const view of core.follow(new AbortController().signal)) {
  assert.equal(view.cursor, 35); assert.equal(view.task, 'cancelled'); assert.equal(view.readOnly, false)
}
await core.close()
assert.equal(mutations, 0); assert.equal(follows, 1); assert.equal(closed, 1)
assert(reports.some(value => value.probe === 'follow-decoded' && value.relayCursor === -1))
assert(reports.some(value => value.probe === 'follow-admitted' && value.domainCursor === 35))
const native = await json('fixtures/native-summary.json'), layout = await json('fixtures/native-layout.json')
const nodes = []
const walk = value => { if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value); for (const [key, child] of Object.entries(value)) if (key !== 'attributes') Array.isArray(child) ? child.forEach(walk) : walk(child) }
walk(layout)
const source = native.attempts[1].source, logs = await readFile(new URL('fixtures/native.log', root), 'utf8')
const proof = nativeCheckpointProof(source.faults.checkpoint, source, logs, nodes, { task: 'cancelled', taskText: native.hap.cancelledTaskText })
assert.equal(proof.passed, true)
assert.equal(nativeCheckpointProof(source.faults.checkpoint, source, logs + '\nDSH native runtime failure: native-port-failed', nodes, { task: 'cancelled', taskText: native.hap.cancelledTaskText }).passed, false)
console.log(JSON.stringify({ passed: true, packageOnly: true, currentTsMockRead: true, recordedNativeEvidenceRechecked: true, freshNativeExecution: false, fullCurrentRegressionClaimed: false, mutations, network: false, credentialsRead: false, sdkInvoked: false, models: 0, uploads: 0, installedDesktopVerified: false, deviceQualified: false, wanQualified: false }, null, 2))

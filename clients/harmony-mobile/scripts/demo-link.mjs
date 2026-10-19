/** Reproducible offline fixture runner, not a launched DSH app or real desktop task. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { createLinkLab } from '../tests/helpers/link-lab.mjs'

const project = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
const hashes = JSON.parse(await readFile(join(project, '.build/source-hashes.json'), 'utf8'))
const sessionTypes = await readFile(join(source.dshRoot, 'packages/core/session/src/types.ts'), 'utf8')
assert.match(sessionTypes, /export const SESSION_FORMAT_VERSION = 4\b/, 'Fixture format requires requalification when DSH format changes')
const lab = createLinkLab(), stages = []
try {
  await lab.phone.sync(lab.sid)
  stages.push({ stage: 'phone-submit', receipt: await lab.phone.request('task.submit', { sessionId: lab.sid, requestId: 'demo-request', text: '固定合成场景，不执行真实任务' }) })
  lab.host.advance(lab.sid)
  lab.host.stream(lab.sid, { type: 'start', attemptId: 'demo-attempt', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 })
  lab.host.stream(lab.sid, { type: 'chunk', attemptId: 'demo-attempt', revision: 2, index: 0, time: lab.clock(), chunk: { text: '固定流式输出' } })
  lab.phone.poll(lab.sid)
  stages.push({ stage: 'stream', activeAttempt: lab.phone.projection(lab.sid).liveAttempt })
  lab.phone.setForeground(false)
  lab.host.advance(lab.sid)
  lab.host.stream(lab.sid, { type: 'end', attemptId: 'demo-attempt', revision: 3, index: 1, outcome: { kind: 'abandoned' } })
  lab.phone.setForeground(true)
  await lab.phone.sync(lab.sid)
  stages.push({ stage: 'reconnect', state: lab.phone.projection(lab.sid).events.at(-1).data.state,
    receipt: await lab.phone.request('task.receipt', { sessionId: lab.sid, requestId: 'demo-request' }) })
  const { messageId, blockId } = lab.host.desktop.snapshotFor(lab.sid).scope
  const mounted = await lab.phone.request('rich.mount', { sessionId: lab.sid, messageId, blockId, guestProtocol: 'lumina-rich/1' })
  const values = { title: '手机提交的合成表单', count: '6' }
  const intent = { mountId: mounted.mountId, actionId: 'demo-action', actionName: 'submit', targetActionId: null,
    expectedDataRevision: mounted.snapshot.dataRevision, values, fileGrants: [], draft: {
      baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: mounted.snapshot.manifest.stateSchemaVersion,
      fields: values, dirty: Object.keys(values) } }
  const receipts = await Promise.all([lab.phone.request('rich.invoke', intent), lab.phone.request('rich.invoke', intent)])
  assert.deepEqual(receipts[0], receipts[1])
  lab.host.completeAction(lab.sid, intent.actionId)
  lab.phone.poll(lab.sid)
  stages.push({ stage: 'rich-complete', action: await lab.phone.request('rich.status', { mountId: mounted.mountId, actionId: intent.actionId }),
    dataRevision: lab.host.desktop.snapshotFor(lab.sid).dataRevision })
  await lab.registry.revoke(lab.peer.deviceId)
  assert.equal(lab.host.mountCount, 0)
  assert.equal(lab.host.desktop.admittedTasks, 1); assert.equal(lab.host.desktop.admittedActions, 1)
  const result = { mode: 'synthetic-memory-only', sourceCommit: source.auditedCommit, sessionId: lab.sid,
    executionOwner: lab.peer.desktopId, stages, counters: { taskServiceCalls: lab.host.promptCalls,
      admittedTasks: lab.host.desktop.admittedTasks, admittedRichActions: lab.host.desktop.admittedActions,
      mountsAfterRevoke: lab.host.mountCount, activeFollows: lab.host.activeFollows, realModelCalls: 0, networkListeners: 0 },
    sourceHashes: hashes, unverified: ['real DSH composition', 'durable process-loss recovery', 'WAN/TLS/E2EE/authentication', 'ArkTS compilation', 'ArkWeb', 'HAP', 'Mate90 device'] }
  await mkdir(join(project, 'evidence'), { recursive: true })
  await writeFile(join(project, 'evidence/link-demo.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ mode: result.mode, sessionId: result.sessionId, counters: result.counters, evidence: 'evidence/link-demo.json' }, null, 2))
} finally { await lab.close() }

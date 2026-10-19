/** Offline exact checkpoint qualification; server writes and native projection never substitute for visible native text. */
import { createHash } from 'node:crypto'
import { NativeAcceptanceFailure } from './native-window-policy.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')
const rectangle = value => {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value ?? '')
  if (!match) return null
  const [left, top, right, bottom] = match.slice(1).map(Number)
  return right > left && bottom > top ? { left, top, right, bottom } : null
}
/** @param expected - original server-issued unique marker. @param source - source status with checkpointFrame and fault-written audit. @param output - scoped native log suffix. @param nodes - observed native layout nodes. @param expectedState - original task status and locale-owned label. @returns each stage and the earliest missing observation; this calls no SDK or UI API. */
export function nativeCheckpointProof(expected, source, output, nodes, expectedState) {
  if (typeof expected !== 'string' || !expected.startsWith('DSH read checkpoint ') || expected.length > 256) throw Error('checkpoint-proof-invalid')
  const record = source.faults.checkpointFrame
  const diagnostics = [], deliveries = [], nativeMessages = []
  for (const line of output.split(/\r?\n/)) {
    for (const [label, destination] of [['DSH native follow diagnostic: ', diagnostics], ['DSH native byte delivery: ', deliveries], ['DSH native live message admitted: ', nativeMessages]]) {
      const offset = line.indexOf(label)
      if (offset >= 0) { try { destination.push(JSON.parse(line.slice(offset + label.length))) } catch (error) { if (!(error instanceof SyntaxError)) throw error } }
    }
  }
  const built = record && source.faults.checkpoint === expected && record.textSha256 === hash(expected)
  const written = built && source.commandAudit.records.some(value => value.stage === 'fault-written' && value.commandId === record.commandId && value.fault === 'reset-snapshot')
  const delivered = written && deliveries.find(value => value.commandId === record.commandId && value.receivedBytes === record.bytes && value.deliveredBytes === record.bytes && value.ended === true && value.code === '')
  const decoded = delivered && diagnostics.find(value => value.probe === 'follow-decoded' && value.commandId === record.commandId && value.kind === 'reset' && value.instance === record.instance && value.relayCursor === record.relayCursor && value.payloadSha256 === record.payloadSha256)
  const admitted = decoded && diagnostics.find(value => value.probe === 'follow-admitted' && value.commandId === record.commandId && value.instance === record.instance && value.relayCursor === record.relayCursor && value.domainCursor === record.domainCursor && value.liveTextBytes === Buffer.byteLength(expected) && value.liveTextSha256 === record.textSha256 && value.connection === 'connected' && value.readOnly === false)
  const matching = nativeMessages.filter(value => value.text === expected).at(-1)
  const latest = matching && nativeMessages.filter(value => value.sessionId === matching.sessionId && value.messageId === matching.messageId).at(-1)
  const latestView = latest && output.split(/\r?\n/).filter(line => line.includes('DSH native view: ' + latest.sessionId + ', ')).at(-1)
  const observationHealthy = !output.includes('DSH native diagnostic failed: ') && !output.includes('DSH native runtime failure: ')
  const published = admitted && observationHealthy && latest && latest.text === expected && latest.messageId === 'native-live-' + latest.sessionId && latest.connection === 'connected' && latest.readOnly === false && latest.task === expectedState.task && (latest.error === undefined || latest.error === '') && (!latestView || latestView.includes(', connected, ') && latestView.includes(', readOnly=false, error=none')) && latest
  const lists = nodes.filter(node => node.attributes.type === 'List' && node.attributes.visible === 'true')
  const list = lists.length === 1 ? rectangle(lists[0].attributes.bounds) : null
  const nativeText = published && list && nodes.find(node => {
    const attributes = node.attributes, bounds = rectangle(attributes.bounds)
    return attributes.type === 'Text' && attributes.id === 'dsh-message-' + published.messageId && attributes.visible === 'true' && (attributes.text === expected || attributes.originalText === expected) && bounds && bounds.left >= list.left && bounds.right <= list.right && bounds.top >= list.top && bounds.bottom <= list.bottom
  })
  const taskText = nativeText && nodes.find(node => node.attributes.type === 'Text' && node.attributes.id === 'dsh-task-state' && node.attributes.visible === 'true' && (node.attributes.text === expectedState.taskText || node.attributes.originalText === expectedState.taskText))
  const stages = { built: Boolean(built), written: Boolean(written), delivered: Boolean(delivered), decoded: Boolean(decoded), admitted: Boolean(admitted), published: Boolean(published), visible: Boolean(nativeText), taskVisible: Boolean(taskText) }
  return { passed: Object.values(stages).every(Boolean), missing: Object.entries(stages).find(([, value]) => !value)?.[0] ?? null, stages, commandId: record?.commandId ?? null, nativeText: nativeText?.attributes ?? null, diagnostics: { delivered: delivered || null, decoded: decoded || null, admitted: admitted || null, published: published || null } }
}
/** @param expected - original marker. @param ports - scoped read-only observations and one native latest-message navigation. @param policy - explicit finite polling and original window budget. @param expectedState - original task and its locale-owned label. @returns complete proof; records each missing stage and never performs a blind swipe or dispatch. */
export async function observeNativeCheckpointProof(expected, ports, policy, expectedState) {
  if (!Number.isInteger(policy.maxPolls) || policy.maxPolls < 1 || policy.maxPolls > 100 || !Number.isSafeInteger(policy.pauseMs) || policy.pauseMs < 1) throw new NativeAcceptanceFailure('checkpoint-proof-policy-invalid')
  let located = false, proof
  for (let poll = 1; poll <= policy.maxPolls; poll++) {
    policy.budget.requireTime()
    const source = await ports.source(), output = await ports.logs(), nodes = await ports.layout()
    proof = nativeCheckpointProof(expected, source, output, nodes, expectedState)
    ports.record({ poll, located, proof })
    if (proof.passed) return { ...proof, located }
    if (proof.stages.published && !located) {
      const controls = nodes.filter(node => node.attributes.type === 'Button' && node.attributes.id === 'dsh-transcript-latest' && node.attributes.enabled === 'true' && node.attributes.visible === 'true')
      if (controls.length !== 1 || !rectangle(controls[0].attributes.bounds)) throw new NativeAcceptanceFailure('checkpoint-latest-control-not-confirmed', 'case-observation')
      policy.budget.requireTime()
      await ports.latest(controls[0].attributes)
      located = true
    }
    if (poll < policy.maxPolls) await ports.sleep(policy.pauseMs)
  }
  throw new NativeAcceptanceFailure('checkpoint-proof-missing-' + proof.missing, 'case-observation')
}

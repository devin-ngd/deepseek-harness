/** Bounded domain admission shared by transport consumers and native provider implementations. */
import type { JsonValue, SessionWireEvent, RichSnapshot, RichActionStatus, RichReceipt } from './upstream.ts'
import type { SessionId } from './protocol.ts'
import { id } from './protocol.ts'
import { TransportError } from './wire.ts'
import { assertSessionWireEvent, SESSION_FORMAT_VERSION, isRichValues, typedRichValuesValid } from './upstream-domain.ts'

/** Deployment-owned resource bounds; no provider silently supplies defaults. */
export interface DomainLimits { readonly maxBytes: number; readonly maxEvents: number; readonly maxBlocks: number; readonly maxText: number; readonly maxRichBlocks: number }
/** Display blocks preserve source vocabulary; code remains text, and images contain no download authority. */
export type MessagePart = { readonly kind: 'text' | 'reasoning'; readonly text: string }
  | { readonly kind: 'image'; readonly attachmentId: string; readonly mediaType: string; readonly width: number; readonly height: number }
  | { readonly kind: 'file'; readonly attachmentId: string; readonly name: string }
  | { readonly kind: 'tool-call'; readonly callId: string; readonly name: string; readonly arguments: string }
  | { readonly kind: 'unsupported'; readonly type: string }
/** Typed subset used by mobile rendering; other accepted events remain opaque journal facts. */
export interface DecodedEvent { readonly wire: SessionWireEvent; readonly parts?: readonly MessagePart[]; readonly messageId?: string; readonly role?: string }
/** Stream state is process-local and never establishes durable task completion. */
export interface LiveState { readonly revision: number; readonly attemptId: string | null; readonly nextIndex: number; readonly chunks: readonly JsonValue[]; readonly committedSeq: number | null }
/** Snapshot metadata is validated before replacing any current window. */
export type DomainFrame = { readonly type: 'snapshot'; readonly cursor: number; readonly version: number; readonly seeded: boolean; readonly hasMore: boolean; readonly events: readonly DecodedEvent[]; readonly live: LiveState }
  | { readonly type: 'event'; readonly event: DecodedEvent }
  | { readonly type: 'assistant-stream'; readonly frame: Readonly<Record<string, JsonValue>> }

/** @param value - untrusted JSON. @returns an object or a localized failure category. */
export function object(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) throw new TransportError('domain-invalid')
  return value
}
function keys(value: Record<string, JsonValue>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new TransportError('domain-invalid')
}
/** @param value - candidate integer. @param minimum - inclusive lower bound. @returns accepted safe integer. */
export function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) throw new TransportError('domain-invalid')
  return value
}
/** @param value - candidate text. @param max - UTF-16 length cap. @returns bounded string, including empty display text. */
export function string(value: unknown, max: number): string { if (typeof value !== 'string' || value.length > max) throw new TransportError('domain-invalid'); return value }
/** @param value - candidate Boolean. @returns strict Boolean without coercion. */
export function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new TransportError('domain-invalid'); return value }
/** @param value - decoded JSON. @param limits - explicit bounds. Reject excess bytes before domain state changes. */
export function bounded(value: JsonValue, limits: DomainLimits): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limits.maxBytes) throw new TransportError('domain-too-large')
}
/** @param limits - deployment selection. Reject invalid limits at construction. */
export function validateLimits(limits: DomainLimits): void { for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new TransportError('invalid-config') }
/** @param value - content list. @param limits - bounded presentation policy. @returns normalized source blocks. */
export function parts(value: JsonValue | undefined, limits: DomainLimits): readonly MessagePart[] {
  if (!Array.isArray(value) || value.length > limits.maxBlocks) throw new TransportError('domain-invalid')
  return value.map(entry => {
    const block = object(entry), type = string(block.type, 128)
    switch (type) {
      case 'text': case 'reasoning': return { kind: type, text: string(block.text, limits.maxText) }
      case 'image': {
        const image = object(block.attachment), mediaType = string(image.mediaType, 128)
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) throw new TransportError('domain-invalid')
        integer(image.bytes)
        return { kind: 'image', attachmentId: string(image.attachmentId, 128), mediaType, width: integer(image.width, 1), height: integer(image.height, 1) }
      }
      case 'file': { const file = object(block.attachment); integer(file.bytes); return { kind: 'file', attachmentId: string(file.attachmentId, 128), name: string(file.name, 4096) } }
      case 'tool-call': return { kind: 'tool-call', callId: string(block.id, 128), name: string(block.name, 256), arguments: string(block.arguments, limits.maxText) }
      default: return { kind: 'unsupported', type }
    }
  })
}
/** @param value - canonical Session wire event. @param limits - display bounds. @returns admitted immutable wire data and display fields. */
export function decodeEvent(value: JsonValue, limits: DomainLimits): DecodedEvent {
  try { assertSessionWireEvent(value) } catch (error) { throw new TransportError('domain-invalid', { cause: error }) }
  const wire = value
  if (!['user/message', 'assistant/message', 'system/message', 'developer/message', 'tool/result', 'turn/start', 'turn/end', 'tool/call'].includes(wire.type)) return { wire }
  const data = object(wire.data)
  let message: Record<string, JsonValue> | undefined
  if (wire.type === 'user/message') message = data
  else if (['assistant/message', 'system/message', 'developer/message', 'tool/result'].includes(wire.type)) message = object(data.message)
  if (message !== undefined) {
    const role = string(message.role, 32)
    if (role !== wire.type.split('/')[0] && !(wire.type === 'tool/result' && role === 'tool')) throw new TransportError('domain-invalid')
    const result = { wire, messageId: string(message.id, 128), role, parts: parts(message.content, limits) }
    if (wire.type === 'user/message') string(object(message.source).kind, 128)
    if (wire.type === 'tool/result') { string(message.toolCallId, 128); boolean(message.isError) }
    return result
  }
  if (wire.type === 'turn/start' || wire.type === 'turn/end') {
    integer(data.turn, 1)
    if (wire.type === 'turn/end') { const reason = object(data.reason); string(reason.kind, 128); if (reason.kind === 'error') object(reason.error) }
  }
  if (wire.type === 'tool/call') { string(data.callId, 128); string(data.name, 256); string(data.arguments, limits.maxText) }
  return { wire }
}
/** @param value - live chunk JSON. @param limits - presentation caps. Reject malformed recognized chunks while keeping extension chunks opaque. */
export function validateChunk(value: JsonValue, limits: DomainLimits): void {
  const chunk = object(value), type = string(chunk.type, 128)
  if (['block-start', 'block-end', 'text-delta', 'reasoning-delta', 'tool-call-delta'].includes(type)) integer(chunk.index)
  if (type === 'text-delta' || type === 'reasoning-delta') string(chunk.text, limits.maxText)
  if (type === 'block-start') string(chunk.blockType, 128)
  if (type === 'block-end') parts([chunk.block!], limits)
  if (type === 'tool-call-delta') { string(chunk.id, 128); if (chunk.name !== undefined) string(chunk.name, 256); string(chunk.argumentsDelta, limits.maxText) }
}
/** @param value - BFF payload JSON. @param owner - native-selected Session. @param limits - bounded policy. @returns validated domain frame; no journal cursor is changed here. */
export function decodeDomain(value: JsonValue, owner: SessionId, limits: DomainLimits): DomainFrame {
  bounded(value, limits)
  const frame = object(value)
  if (frame.type === 'event') { keys(frame, ['type', 'event']); return { type: 'event', event: decodeEvent(frame.event!, limits) } }
  if (frame.type === 'assistant-stream') {
    keys(frame, ['type', 'frame'])
    const live = object(frame.frame); integer(live.revision); string(live.attemptId, 128)
    keys(live, live.type === 'start' ? ['type', 'attemptId', 'revision', 'startedAfterSeq', 'turn', 'step'] : live.type === 'chunk' ? ['type', 'attemptId', 'revision', 'index', 'time', 'chunk'] : ['type', 'attemptId', 'revision', 'index', 'outcome'])
    if (live.type === 'start') { integer(live.startedAfterSeq, -1); integer(live.turn, 1); integer(live.step, 1) }
    else if (live.type === 'chunk') { integer(live.index); integer(live.time); validateChunk(live.chunk!, limits) }
    else if (live.type === 'end') { integer(live.index); const outcome = object(live.outcome); if (outcome.kind === 'committed') { integer(outcome.seq); if (!['assistant/message', 'assistant/attempt'].includes(String(outcome.eventType))) throw new TransportError('domain-invalid') } else if (outcome.kind !== 'abandoned') throw new TransportError('domain-invalid') }
    else throw new TransportError('domain-invalid')
    return { type: 'assistant-stream', frame: live }
  }
  if (frame.type !== 'snapshot') throw new TransportError('domain-invalid')
  keys(frame, ['type', 'header', 'cursor', 'records', 'hasMore', 'projections'], ['assistantStream'])
  const header = object(frame.header), version = integer(header.version, 1), cursor = integer(frame.cursor, -1), projections = object(frame.projections)
  if (header.id !== owner) throw new TransportError('scope-denied')
  integer(header.createdAt); boolean(header.isSeeded)
  keys(header, ['version', 'id', 'createdAt', 'isSeeded'], ['cwd', 'parentSession', 'origin', 'delegationDepth', 'agentPreset'])
  if (integer(projections.asOfSeq, -1) !== cursor) throw new TransportError('domain-invalid')
  object(projections.values)
  if (!Array.isArray(frame.records) || frame.records.length > limits.maxEvents) throw new TransportError('domain-too-large')
  // Different released formats expose metadata and an upgrade notice only; do not reinterpret their records.
  const events = version === SESSION_FORMAT_VERSION ? frame.records.map(record => { const entry = object(record); if (entry.type !== 'event') throw new TransportError('domain-invalid'); return decodeEvent(entry.event!, limits) }) : []
  let previous: number | undefined
  for (const entry of events) { const seq = entry.wire.seq; if (seq > cursor || previous !== undefined && seq !== previous + 1) throw new TransportError('domain-gap'); previous = seq }
  if (previous !== undefined && previous !== cursor || events.length === 0 && cursor >= 0 && version === SESSION_FORMAT_VERSION) throw new TransportError('domain-gap')
  let live: LiveState = { revision: -1, attemptId: null, nextIndex: 0, chunks: [], committedSeq: null }
  if (frame.assistantStream !== undefined && version === SESSION_FORMAT_VERSION) {
    const baseline = object(frame.assistantStream), revision = integer(baseline.revision)
    live = { ...live, revision }
    if (baseline.activeAttempt !== undefined) {
      const active = object(baseline.activeAttempt); integer(active.startedAfterSeq, -1); integer(active.turn, 1); integer(active.step, 1)
      if (!Array.isArray(active.stream) || active.stream.length > limits.maxBlocks) throw new TransportError('domain-too-large')
      active.stream.forEach(chunk => validateChunk(chunk, limits))
      live = { revision, attemptId: string(active.attemptId, 128), nextIndex: integer(active.nextIndex), chunks: active.stream, committedSeq: null }
    }
  }
  return { type: 'snapshot', cursor, version, seeded: boolean(header.isSeeded), hasMore: boolean(frame.hasMore), events, live }
}
/** @param value - rich action JSON. @returns status accepted without transport acknowledgement conflation. */
export function decodeAction(value: JsonValue): RichActionStatus {
  const action = object(value), state = action.state
  if (state !== 'accepted' && state !== 'queued' && state !== 'running' && state !== 'cancel_requested' && state !== 'outcome_unknown' && state !== 'completed' && state !== 'failed' && state !== 'cancelled') throw new TransportError('domain-invalid')
  const terminal = boolean(action.terminal)
  if (terminal !== ['completed', 'failed', 'cancelled'].includes(state) || !isRichValues(action.values) || !typedRichValuesValid(action.values)) throw new TransportError('domain-invalid')
  const progress = action.progress === null ? null : object(action.progress)
  return { actionId: id<'rich-inline-action'>(string(action.actionId, 128)), state, terminal, ledgerSeq: integer(action.ledgerSeq), values: action.values,
    progress: progress === null ? null : { done: integer(progress.done), total: integer(progress.total), label: string(progress.label, 4096) }, lateAfterCancel: boolean(action.lateAfterCancel) }
}
/** @param value - save/invoke acknowledgement. @returns validated receipt; acceptance never implies completion. */
export function decodeReceipt(value: JsonValue): RichReceipt {
  const receipt = object(value), state = receipt.state
  if (state !== null && !['accepted', 'queued', 'running', 'cancel_requested', 'outcome_unknown', 'completed', 'failed', 'cancelled'].includes(String(state))) throw new TransportError('domain-invalid')
  return { accepted: boolean(receipt.accepted), code: string(receipt.code, 256), actionId: receipt.actionId === null ? null : id<'rich-inline-action'>(string(receipt.actionId, 128)), state: state as RichReceipt['state'], draftRevision: integer(receipt.draftRevision) }
}
/** @param value - rich snapshot. @param owner - native-derived scope. @param limits - bounded content policy. @returns complete validated snapshot; future protocols use a separate fallback path. */
export function decodeRich(value: JsonValue, owner: { readonly sessionId: SessionId; readonly messageId: string; readonly blockId: string }, limits: DomainLimits): RichSnapshot {
  bounded(value, limits)
  const snapshot = object(value), scope = object(snapshot.scope)
  if (snapshot.protocol !== 'lumina-rich/1') throw new TransportError('rich-protocol-mismatch')
  if (scope.sessionId !== owner.sessionId || scope.messageId !== owner.messageId || scope.blockId !== owner.blockId) throw new TransportError('scope-denied')
  const manifest = (candidate: JsonValue | undefined): RichSnapshot['manifest'] => {
    const m = object(candidate)
    if (m.blockId !== owner.blockId || !/^[a-f0-9]{64}$/.test(string(m.contentHash, 64))) throw new TransportError('domain-invalid')
    return { blockId: id<'rich-inline-block'>(owner.blockId), renderRevision: integer(m.renderRevision, 1), html: string(m.html, limits.maxText), css: string(m.css, limits.maxText), js: string(m.js, limits.maxText), fallbackText: string(m.fallbackText, limits.maxText), stateSchemaVersion: integer(m.stateSchemaVersion, 1), contentHash: string(m.contentHash, 64) }
  }
  const draft = (candidate: JsonValue | undefined): RichSnapshot['draft'] => {
    const d = object(candidate)
    if (!isRichValues(d.fields) || !Array.isArray(d.dirty) || d.dirty.length > limits.maxBlocks || new Set(d.dirty).size !== d.dirty.length) throw new TransportError('domain-invalid')
    return { draftRevision: integer(d.draftRevision), stateSchemaVersion: integer(d.stateSchemaVersion, 1), fields: d.fields, dirty: d.dirty.map(key => string(key, 128)) }
  }
  if (!isRichValues(snapshot.values) || !typedRichValuesValid(snapshot.values) || !Array.isArray(snapshot.actions) || snapshot.actions.length > limits.maxBlocks || !Array.isArray(snapshot.archivedDrafts) || snapshot.archivedDrafts.length > limits.maxBlocks || !Array.isArray(snapshot.files) || snapshot.files.length > limits.maxBlocks) throw new TransportError('domain-invalid')
  const current = manifest(snapshot.manifest), renderRevision = integer(scope.renderRevision, 1)
  if (current.renderRevision !== renderRevision) throw new TransportError('domain-invalid')
  const actions = snapshot.actions.map(decodeAction)
  if (new Set(actions.map(action => action.actionId)).size !== actions.length) throw new TransportError('domain-invalid')
  return { protocol: 'lumina-rich/1', scope: { sessionId: owner.sessionId, messageId: id<'MessageId'>(owner.messageId), blockId: id<'rich-inline-block'>(owner.blockId), renderRevision }, manifest: current,
    pendingManifest: snapshot.pendingManifest === null ? null : manifest(snapshot.pendingManifest), readOnly: boolean(snapshot.readOnly), dataRevision: integer(snapshot.dataRevision), values: snapshot.values,
    draft: draft(snapshot.draft), archivedDrafts: snapshot.archivedDrafts.map(draft), actions, files: snapshot.files.map(candidate => { const f = object(candidate); if (f.purpose !== 'agent-input' || !/^[a-f0-9]{64}$/.test(string(f.sha256, 64))) throw new TransportError('domain-invalid'); return { grantId: id<'rich-inline-file-grant'>(string(f.grantId, 128)), assetId: string(f.assetId, 128), sha256: string(f.sha256, 64), displayName: string(f.displayName, 4096), sizeBytes: integer(f.sizeBytes), purpose: 'agent-input' } }) }
}
/** @param failure - validated failure JSON. @returns display text with the desktop's AUTH suppression rule; UI Chat imports would merge incompatible Host/Client programs. */
export function failureView(failure: JsonValue): string { const value = object(failure); return value.code === 'AUTH' ? '' : typeof value.message === 'string' ? value.message : 'desktop-failure' }

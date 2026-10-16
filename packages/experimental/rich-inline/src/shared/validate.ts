/** Validation of untrusted JSON and marker text entering a rich message. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RichActionRequest, RichBlockId, RichDraft, RichInvokeRequest, RichSaveDraftRequest, RichValues, RichRenderRequest } from './types.ts'

/** Fixed protocol identifier; never an origin or authentication credential. */
export const RICH_PROTOCOL = 'lumina-rich/1'
/** Cross-process opaque identity grammar. */
export const RICH_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/

/** Reject dangerous property names and invalid or excessive recursive values.
 * @param value - wire or model-generated candidate.
 * @param depth - current JSON nesting level.
 * @returns whether the candidate is bounded lossless JSON.
 */
export function isRichJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 16) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (typeof value === 'string') return value.length <= 131_072
  if (Array.isArray(value)) return value.length <= 2_000 && value.every(item => isRichJson(item, depth + 1))
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  const entries = Object.entries(value)
  return entries.length <= 500 && entries.every(([key, item]) =>
    key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && key.length <= 128 && isRichJson(item, depth + 1))
}

/** Parse a strict save request before forwarding a generated content event.
 * @param value - hostile packet payload with trusted Client-injected Session and mount identities.
 * @returns validated request or null.
 */
export function parseSaveDraftRequest(value: unknown): RichSaveDraftRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Partial<RichSaveDraftRequest>
  if (!Object.keys(value).every(key => ['sessionId', 'mountId', 'draft'].includes(key)) || typeof request.sessionId !== 'string' || request.sessionId.length === 0
    || typeof request.mountId !== 'string' || !RICH_ID.test(request.mountId)
    || !isRichDraft(request.draft)) return null
  return { sessionId: request.sessionId, mountId: request.mountId, draft: request.draft }
}

/** Parse supported submit or cancel intents without granting authority.
 * @param value - hostile packet payload with trusted Client-injected Session and mount identities.
 * @returns validated request or null.
 */
export function parseInvokeRequest(value: unknown): RichInvokeRequest | null { return isRichInvoke(value) ? value : null }

/** Validate renderer diagnostics without accepting forged authorization or routing fields.
 * @param value - renderer-supplied candidate.
 * @returns bounded report or null.
 */
export function parseRenderRequest(value: unknown): RichRenderRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Partial<RichRenderRequest>
  if (!Object.keys(value).every(key => ['sessionId', 'mountId', 'state', 'message'].includes(key))
    || typeof request.sessionId !== 'string' || request.sessionId.length === 0
    || typeof request.mountId !== 'string' || !RICH_ID.test(request.mountId)
    || (request.state !== 'rendered' && request.state !== 'failed')
    || typeof request.message !== 'string' || request.message.length > 512) return null
  return { sessionId: request.sessionId, mountId: request.mountId, state: request.state, message: request.message }
}

/** Parse action lookup fields against the trusted Session and mount without accepting a block selector.
 * @param value - untrusted status request.
 * @returns validated lookup or null.
 */
export function parseActionRequest(value: unknown): RichActionRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Partial<RichActionRequest>
  if (!Object.keys(value).every(key => ['sessionId', 'mountId', 'actionId'].includes(key)) || typeof request.sessionId !== 'string' || request.sessionId.length === 0
    || typeof request.mountId !== 'string' || !RICH_ID.test(request.mountId)
    || typeof request.actionId !== 'string' || !RICH_ID.test(request.actionId)) return null
  return { sessionId: request.sessionId, mountId: request.mountId, actionId: request.actionId }
}

/** Validate top-level arbitrary JSON fields.
 * @param value - untrusted value map.
 * @returns whether the candidate is a valid map.
 */
export function isRichValues(value: unknown): value is RichValues {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && isRichJson(value)
}

/** Validate the complete input state used by both draft saves and action submissions.
 * @param value - untrusted draft candidate.
 * @returns whether revision and field information are valid.
 */
export function isRichDraft(value: unknown): value is RichDraft {
  if (value === null || typeof value !== 'object') return false
  const draft = value as Partial<RichDraft>
  return Object.keys(value).every(key => ['baseRevision', 'stateSchemaVersion', 'fields', 'dirty'].includes(key))
    && typeof draft.baseRevision === 'number' && Number.isSafeInteger(draft.baseRevision) && draft.baseRevision >= 0
    && typeof draft.stateSchemaVersion === 'number' && Number.isSafeInteger(draft.stateSchemaVersion) && draft.stateSchemaVersion >= 1
    && isRichValues(draft.fields) && Array.isArray(draft.dirty) && draft.dirty.length <= 500
    && draft.dirty.every(key => typeof key === 'string' && RICH_ID.test(key))
    && new Set(draft.dirty).size === draft.dirty.length
}

/** Validate an iframe submit intent; scope and authorization remain host-owned.
 * @param value - queued or remote JSON candidate.
 * @returns whether the candidate contains only supported submit fields.
 */
export function isRichInvoke(value: unknown): value is RichInvokeRequest {
  if (value === null || typeof value !== 'object') return false
  const request = value as Partial<RichInvokeRequest>
  return Object.keys(value).every(key => ['sessionId', 'mountId', 'actionId', 'actionName', 'targetActionId', 'expectedDataRevision', 'values', 'draft', 'fileGrants'].includes(key))
    && typeof request.sessionId === 'string' && request.sessionId.length > 0
    && typeof request.mountId === 'string' && RICH_ID.test(request.mountId)
    && typeof request.actionId === 'string' && RICH_ID.test(request.actionId)
    && (request.actionName === 'submit' && request.targetActionId === null
      || request.actionName === 'cancel' && typeof request.targetActionId === 'string' && RICH_ID.test(request.targetActionId))
    && typeof request.expectedDataRevision === 'number' && Number.isSafeInteger(request.expectedDataRevision) && request.expectedDataRevision >= 0
    && isRichValues(request.values) && typedRichValuesValid(request.values) && isRichDraft(request.draft)
    && Array.isArray(request.fileGrants)
    && request.fileGrants.length <= 16 && request.fileGrants.every(id => typeof id === 'string' && RICH_ID.test(id))
    && new Set(request.fileGrants).size === request.fileGrants.length
}

/** Validate semantic constraints for the reserved typed-value vocabulary; ordinary JSON stays supported.
 * @param values - already JSON-validated values.
 * @returns whether typed numbers, calendar dates, tables, and attachment references are valid.
 */
export function typedRichValuesValid(values: RichValues): boolean {
  const check = (value: JsonValue): boolean => {
    if (Array.isArray(value)) return value.every(check)
    if (value === null || typeof value !== 'object') return true
    const kind = value.type
    if (kind === 'number' && (typeof value.value !== 'number' || !Number.isFinite(value.value))) return false
    if (kind === 'decimal' && (typeof value.value !== 'string' || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value.value))) return false
    if (kind === 'text' && typeof value.value !== 'string' || kind === 'boolean' && typeof value.value !== 'boolean' || kind === 'null' && value.value !== null) return false
    if (kind === 'date') {
      if (typeof value.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.value)) return false
      const date = new Date(`${value.value}T00:00:00.000Z`)
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.value) return false
    }
    if (kind === 'option' && (typeof value.id !== 'string' || !RICH_ID.test(value.id))) return false
    if (kind === 'selection' && (!Array.isArray(value.ids) || !value.ids.every(id => typeof id === 'string' && RICH_ID.test(id)) || new Set(value.ids).size !== value.ids.length)) return false
    if (kind === 'object' && !isRichValues(value.value)) return false
    if (kind === 'list' && !Array.isArray(value.value)) return false
    if (kind === 'asset' || kind === 'media') {
      const ref = value.ref
      if (ref === null || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.grantId !== 'string' || !RICH_ID.test(ref.grantId)
        || typeof ref.assetId !== 'string' || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)
        || typeof ref.sizeBytes !== 'number' || !Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0 || ref.purpose !== 'agent-input') return false
      if (kind === 'media' && (typeof value.kind !== 'string' || !['image', 'audio', 'video', 'document'].includes(value.kind)
        || value.startMs !== undefined && (typeof value.startMs !== 'number' || value.startMs < 0)
        || value.endMs !== undefined && (typeof value.endMs !== 'number' || value.endMs < 0)
        || typeof value.startMs === 'number' && typeof value.endMs === 'number' && value.endMs < value.startMs)) return false
    }
    if (kind === 'table') {
      if (!Array.isArray(value.columns) || value.columns.length > 100
        || !Array.isArray(value.rows) || value.rows.length > 2_000) return false
      const columns = new Map<string, string>()
      for (const col of value.columns) {
        if (col === null || typeof col !== 'object' || Array.isArray(col) || typeof col.id !== 'string' || !RICH_ID.test(col.id)
          || typeof col.label !== 'string' || typeof col.valueType !== 'string'
          || !['null', 'text', 'number', 'decimal', 'boolean', 'date', 'option', 'selection', 'object', 'list', 'asset', 'media', 'table']
            .includes(col.valueType) || columns.has(col.id)) return false
        columns.set(col.id, col.valueType)
      }
      const rows = new Set<string>()
      for (const row of value.rows) {
        if (row === null || typeof row !== 'object' || Array.isArray(row) || typeof row.rowId !== 'string' || !RICH_ID.test(row.rowId) || rows.has(row.rowId) || !isRichValues(row.cells)) return false
        rows.add(row.rowId)
        if (Object.keys(row.cells).length !== columns.size || Object.entries(row.cells).some(([key, cell]) =>
          cell === null || typeof cell !== 'object' || Array.isArray(cell) || cell.type !== columns.get(key) || !check(cell))) return false
      }
    }
    return Object.values(value).every(check)
  }
  return Object.values(values).every(check)
}

/** Recognize only explicit rich-inline fenced markers, never arbitrary HTML.
 * @param text - settled assistant text.
 * @returns every valid block identity in source order.
 */
export function richMarkerIds(text: string): readonly RichBlockId[] {
  const ids: RichBlockId[] = []
  for (const match of text.matchAll(/```rich-inline\s*\n([^`]+)\n```/g)) {
    let parsed: unknown
    if (match[1] === undefined) continue
    try { parsed = JSON.parse(match[1]) } catch (error) { void error; continue }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    const marker = parsed as { blockId?: unknown }
    if (Object.keys(parsed).length === 1 && typeof marker.blockId === 'string' && RICH_ID.test(marker.blockId)) ids.push(marker.blockId as RichBlockId)
  }
  return ids
}

/** Stable JSON encoding used to compare the original accepted action with retries.
 * @param value - validated lossless JSON candidate.
 * @returns canonical JSON text with sorted object keys.
 */
export function canonicalRichJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRichJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalRichJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

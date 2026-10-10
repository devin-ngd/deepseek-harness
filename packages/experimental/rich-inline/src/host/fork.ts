/** Read-only restoration from the child's own inherited publish facts, never the parent's later ledger. */
import { createHash } from 'node:crypto'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { RichMountRequest, RichValues } from '../shared/types.ts'
import { canonicalRichJson, isRichValues, richMarkerIds, typedRichValuesValid } from '../shared/validate.ts'
import type { RichBlockRecord } from './ledger.ts'

interface Inspection {
  readonly meta: { readonly id: SessionId; readonly parentSession?: SessionId }
  readonly inheritedEventCount: number
  readonly events: readonly SessionEvent[]
}

/** Replace confirmed fork values without changing the independent publication, draft or authority state. */
function restoreForkState(block: RichBlockRecord, values: RichValues, fallbackText: string): RichBlockRecord {
  return { ...block, manifest: { ...block.manifest, fallbackText },
    dataRevision: block.dataRevision + 1, values: structuredClone(values) }
}

/** Recover only a successful publication in the addressed child's fork-inherited event prefix.
 * @param inspection - authorized point read of the child Session.
 * @param request - trusted marker owner in that same child.
 * @param maxBytes - publication bound applied before restoring content.
 * @returns independent read-only data with no actions, outbox, grants, or transferred drafts.
 */
export function restoreForkBlock(inspection: Inspection, request: RichMountRequest, maxBytes: number): RichBlockRecord | null {
  if (inspection.meta.id !== request.sessionId || inspection.meta.parentSession === undefined
    || inspection.inheritedEventCount <= 0) return null
  const inherited = inspection.events.filter(event => event.seq < inspection.inheritedEventCount)
  if (!inherited.some(event => event.type === 'assistant/message' && event.data.interrupted !== true
    && event.data.message.id === request.messageId
    && event.data.message.content.some(part => part.type === 'text' && richMarkerIds(part.text).includes(request.blockId)))) return null
  const calls = new Map<ToolCallId, { name: string; args: unknown; turn: number; step: number }>()
  let restored: RichBlockRecord | null = null
  for (const event of inherited) {
    if (event.type === 'tool/call' && ['rich_inline_publish', 'rich_inline_update'].includes(event.data.name)) {
      try { calls.set(event.data.callId, { ...event.data, args: JSON.parse(event.data.arguments) }) } catch (error) { void error }
    }
    if (event.type !== 'tool/result' || event.data.message.isError === true) continue
    const call = calls.get(event.data.message.toolCallId)
    if (call === undefined || call.turn !== event.data.turn || call.step !== event.data.step) continue
    const raw = call.args
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const args = raw as Record<string, unknown>
    if (call.name === 'rich_inline_update') {
      const meta = event.data.meta
      const outcome = meta !== null && typeof meta === 'object' && !Array.isArray(meta) ? meta['richInline'] : undefined
      if (restored === null || outcome === null || typeof outcome !== 'object' || Array.isArray(outcome)
        || outcome['kind'] !== 'data' || outcome['blockId'] !== request.blockId || args.blockId !== request.blockId
        || args.expectedRenderRevision !== restored.manifest.renderRevision || args.expectedDataRevision !== restored.dataRevision
        || outcome['dataRevision'] !== restored.dataRevision + 1 || !Number.isSafeInteger(outcome['dataRevision'])
        || typeof args.fallbackText !== 'string' || !isRichValues(args.values) || !typedRichValuesValid(args.values)
        || Buffer.byteLength(JSON.stringify(args)) > maxBytes) continue
      restored = restoreForkState(restored, args.values, args.fallbackText)
      continue
    }
    if (typeof args.html !== 'string' || typeof args.css !== 'string' || typeof args.js !== 'string' || typeof args.fallbackText !== 'string'
      || typeof args.stateSchemaVersion !== 'number' || !Number.isSafeInteger(args.stateSchemaVersion) || args.stateSchemaVersion < 1
      || args.blockId !== undefined && args.blockId !== request.blockId) continue
    const values: unknown = args.values ?? restored?.values ?? {}
    if (!isRichValues(values) || !typedRichValuesValid(values) || Buffer.byteLength(JSON.stringify(args)) > maxBytes) continue
    const result = event.data.message.content.find(part => part.type === 'text' && richMarkerIds(part.text).includes(request.blockId))
    if (result?.type !== 'text') continue
    const match = /^Interactive block ([^,]+), render revision ([1-9]\d*), data revision ([1-9]\d*)\./.exec(result.text)
      ?? /^Interactive block ([^,]+), revision ([1-9]\d*)\./.exec(result.text)
    if (match?.[1] !== request.blockId || !Number.isSafeInteger(Number(match[2]))) continue
    const renderRevision = Number(match[2])
    const dataRevision = Number(match[3] ?? match[2])
    if (!Number.isSafeInteger(dataRevision)) continue
    const { html, css, js, fallbackText, stateSchemaVersion } = args
    restored = { manifest: { blockId: request.blockId, renderRevision, html, css, js, fallbackText, stateSchemaVersion,
      contentHash: createHash('sha256').update(canonicalRichJson({ html, css, js, stateSchemaVersion })).digest('hex') },
    pendingManifest: null, messageId: request.messageId, dataRevision, readOnly: true, values,
    draft: { draftRevision: 0, stateSchemaVersion, fields: {}, dirty: [] }, archivedDrafts: [], files: [] }
  }
  return restored
}

/** Read-only restoration from the child's own inherited publish facts, never the parent's later ledger. */
import { createHash } from 'node:crypto'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { RichMountRequest } from '../shared/types.ts'
import { canonicalRichJson, isRichValues, richMarkerIds, typedRichValuesValid } from '../shared/validate.ts'
import type { RichBlockRecord } from './ledger.ts'

interface Inspection {
  readonly meta: { readonly id: SessionId; readonly parentSession?: SessionId }
  readonly inheritedEventCount: number
  readonly events: readonly SessionEvent[]
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
  const calls = new Map<ToolCallId, unknown>()
  let restored: RichBlockRecord | null = null
  for (const event of inherited) {
    if (event.type === 'tool/call' && event.data.name === 'rich_inline_publish') {
      try { calls.set(event.data.callId, JSON.parse(event.data.arguments)) } catch (error) { void error }
    }
    if (event.type !== 'tool/result' || event.data.message.isError === true) continue
    const raw = calls.get(event.data.message.source.callId)
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const args = raw as Record<string, unknown>
    if (typeof args.html !== 'string' || typeof args.css !== 'string' || typeof args.js !== 'string' || typeof args.fallbackText !== 'string'
      || typeof args.stateSchemaVersion !== 'number' || !Number.isSafeInteger(args.stateSchemaVersion) || args.stateSchemaVersion < 1
      || args.blockId !== undefined && args.blockId !== request.blockId) continue
    const values: unknown = args.values ?? restored?.values ?? {}
    if (!isRichValues(values) || !typedRichValuesValid(values) || Buffer.byteLength(JSON.stringify(args)) > maxBytes) continue
    const result = event.data.message.content.find(part => part.type === 'text' && richMarkerIds(part.text).includes(request.blockId))
    if (result?.type !== 'text') continue
    const match = /^Interactive block ([^,]+), revision ([1-9]\d*)\./.exec(result.text)
    if (match?.[1] !== request.blockId || !Number.isSafeInteger(Number(match[2]))) continue
    const renderRevision = Number(match[2])
    const { html, css, js, fallbackText, stateSchemaVersion } = args
    restored = { manifest: { blockId: request.blockId, renderRevision, html, css, js, fallbackText, stateSchemaVersion,
      contentHash: createHash('sha256').update(canonicalRichJson({ html, css, js, stateSchemaVersion })).digest('hex') },
    pendingManifest: null, messageId: request.messageId, dataRevision: renderRevision, readOnly: true, values,
    draft: { draftRevision: 0, stateSchemaVersion, fields: {}, dirty: [] }, archivedDrafts: [], files: [] }
  }
  return restored
}

/** Durable model-request offload; original authored messages remain the immutable source store. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
import type { AssistantMessage, Message } from '@deepseek-ai/dsh-llm'
import { authoredBlockId, authoredContent, authoredFences } from '../shared/authored.ts'
import type { AuthoredContent } from '../shared/authored.ts'
import type { RichBlockId } from '../shared/types.ts'
import { offloadRichToolSources, readRichToolSource, richToolSourceProjection } from './tool-source.ts'
import { registerCurrentSessionMessageProjection } from '@deepseek-ai/dsh-session-format-catalog/message-projections'

/** Immutable source selection; possession alone grants no cross-Session access. */
export type RichSourceRef = Branded<'rich-inline-source'>
/** Original text occurrence and its independently reproducible publication identity. */
export interface RichSourceTarget {
  readonly seq: SessionSeq
  readonly partIndex: number
  readonly start: number
  readonly end: number
  readonly sourceHash: string
  readonly sourceRef: RichSourceRef
  readonly blockId: RichBlockId
  readonly renderRevision: 1
  readonly dataRevision: 1
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Replace settled rich-html occurrences in future model requests with scoped source references.
     * Original messages, stream records, identities, and tool associations remain unchanged.
     * Targets identify complete unique authored fences by original sequence, position and SHA-256.
     * Replay requires the rich-inline interpreter; omission changes model-visible history.
     * @messageProjection
     */
    'rich-inline/source-offload': { targets: RichSourceTarget[] }
  }
}
const index = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const targetSchema = z.object({ seq: index.transform(SessionSeq), partIndex: index, start: index, end: index,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceRef: z.string().regex(/^source-[a-f0-9]{64}$/u).transform(value => brandString<RichSourceRef>(value)),
  blockId: z.string().min(1).transform(value => brandString<RichBlockId>(value)),
  renderRevision: z.literal(1), dataRevision: z.literal(1),
}).strict()
const decisionSchema = z.object({ targets: z.array(targetSchema).nonempty() }).strict()
function hash(source: string): string { return createHash('sha256').update(source).digest('hex') }
function reference(message: AssistantMessage, partIndex: number, start: number, sourceHash: string): RichSourceRef {
  return brandString<RichSourceRef>(`source-${hash(JSON.stringify([message.id, partIndex, start, sourceHash]))}`)
}
function selected(event: SessionEvent | undefined, target: RichSourceTarget): AuthoredContent {
  if (event?.type !== 'assistant/message' || event.data.interrupted === true || event.data.message.source.replayState !== undefined) {
    throw new Error('rich-inline/source-offload: target is not an eligible settled Assistant message')
  }
  const part = event.data.message.content[target.partIndex]
  const fence = part?.type === 'text' ? authoredFences(part.text).find(item => item.start === target.start && item.end === target.end) : undefined
  const code = fence === undefined ? null : authoredContent(fence.source)
  if (fence === undefined || code === null || hash(fence.source) !== target.sourceHash
    || reference(event.data.message, target.partIndex, target.start, target.sourceHash) !== target.sourceRef
    || authoredBlockId(event.data.message.id, code.key) !== target.blockId) {
    throw new Error('rich-inline/source-offload: source position, hash or block identity mismatch')
  }
  const matchingKeys = event.data.message.content.flatMap(item => item.type === 'text'
    ? authoredFences(item.text).filter(candidate => authoredContent(candidate.source)?.key === code.key) : [])
  if (matchingKeys.length !== 1) throw new Error('rich-inline/source-offload: duplicate authored block key')
  return code
}
/** Pure validation preserves identities and other projections; originals never acquire placeholders. */
export const richSourceProjection: SessionMessageProjection<'rich-inline/source-offload'> = {
  type: 'rich-inline/source-offload',
  project(event, context) {
    const { targets } = decisionSchema.parse(event.data)
    const changed = new Map<SessionSeq, Message>()
    const seen = new Set<string>()
    for (const target of [...targets].sort((a, b) => b.start - a.start)) {
      const key = `${target.seq}:${target.partIndex}:${target.start}`
      if (seen.has(key) || !context.nodes.includes(target.seq)) throw new Error('rich-inline/source-offload: duplicate or absent surface target')
      seen.add(key)
      const original = context.events[target.seq - context.baseSeq]
      selected(original, target)
      if (original?.type !== 'assistant/message') throw new Error('rich-inline/source-offload: missing original message')
      const message = changed.get(target.seq) ?? context.messages.get(target.seq) ?? original.data.message
      const part = message.content[target.partIndex]
      const originalPart = original.data.message.content[target.partIndex]
      if (message.role !== 'assistant' || part?.type !== 'text' || originalPart?.type !== 'text'
        || part.text.slice(target.start, target.end) !== originalPart.text.slice(target.start, target.end)) {
        throw new Error('rich-inline/source-offload: another projection changed the selected occurrence')
      }
      const text = `${part.text.slice(0, target.start)}[Rich artifact ${target.blockId}; render revision 1; data revision 1; sourceRef ${target.sourceRef}. Read source or values with rich_inline_read.]${part.text.slice(target.end)}`
      changed.set(target.seq, { ...message, content: message.content.map((item, position) => position === target.partIndex ? { type: 'text', text } : item) })
    }
    return changed
  },
}

/**
 * Append one atomic decision outside synchronous Session event observers.
 * @param session - live Session with the interpreter installed.
 * @param events - complete immutable publication facts from an explicit asynchronous inspection.
 * @param minBytes - deployment threshold for each complete authored source.
 * @returns the number of newly selected occurrences.
 */
export function offloadRichSources(session: Session, events: readonly SessionEvent[], minBytes: number): number {
  const prior = new Set(events.flatMap(event => event.type === 'rich-inline/source-offload' ? event.data.targets.map(target => target.sourceRef) : []))
  const targets: RichSourceTarget[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data.interrupted === true || event.data.message.source.replayState !== undefined
      || !session.surface.nodes.includes(event.seq)) continue
    const keys = event.data.message.content.flatMap(part => part.type === 'text' ? authoredFences(part.text).flatMap((fence) => {
      const code = authoredContent(fence.source)
      return code === null ? [] : [code.key]
    }) : [])
    if (new Set(keys).size !== keys.length) continue
    event.data.message.content.forEach((part, partIndex) => {
      if (part.type !== 'text') return
      for (const fence of authoredFences(part.text)) {
        const code = authoredContent(fence.source)
        if (code === null || Buffer.byteLength(fence.source) < minBytes) continue
        const sourceHash = hash(fence.source)
        const sourceRef = reference(event.data.message, partIndex, fence.start, sourceHash)
        if (prior.has(sourceRef)) continue
        targets.push({ seq: event.seq, partIndex, start: fence.start, end: fence.end, sourceHash, sourceRef,
          blockId: authoredBlockId(event.data.message.id, code.key), renderRevision: 1, dataRevision: 1 })
      }
    })
  }
  if (targets.length > 0) session.append('rich-inline/source-offload', { targets })
  return targets.length
}

/** Scope and range selected by a model-facing read tool, never an ambient file path. */
export interface RichSourceRead {
  readonly sourceRef: string
  readonly field: string
  readonly offset: number
  readonly length: number
}
/** Immutable fragment and cursor; character counts use JavaScript string units. */
export interface RichSourceValue {
  readonly sourceRef: RichSourceRef
  readonly sourceHash: string
  readonly field: string
  readonly offset: number
  readonly totalChars: number
  readonly text: string
  readonly nextOffset: number | null
}
/**
 * Read a bounded fragment from this Session's declared immutable sources.
 * @param events - trusted controller inspection, retaining full original messages.
 * @param request - untrusted tool arguments admitted by the source field and range checks.
 * @param maxChars - configured per-read character limit.
 * @returns the fragment, source hash and continuation offset; no draft or action authority.
 */
export function readRichSource(events: readonly SessionEvent[], request: RichSourceRead, maxChars: number): RichSourceValue {
  if (!['html', 'css', 'js', 'fallbackText', 'values'].includes(request.field)
    || !Number.isSafeInteger(request.offset) || request.offset < 0 || !Number.isSafeInteger(request.length)
    || request.length < 1 || request.length > maxChars) throw new Error('rich_inline_read: invalid field or range')
  const targets = events.flatMap(event => event.type === 'rich-inline/source-offload' ? decisionSchema.parse(event.data).targets : [])
  const target = targets.find(item => item.sourceRef === request.sourceRef)
  const toolSource = target === undefined ? readRichToolSource(events, request.sourceRef, request.field) : undefined
  if (target === undefined && toolSource === undefined) throw new Error('rich_inline_read: source reference is not declared in this Session')
  const code = target === undefined ? undefined : selected(events.find(event => event.seq === target.seq), target)
  const source = toolSource?.text ?? (request.field === 'values' ? JSON.stringify(code?.values ?? {}) : code?.[request.field as 'html' | 'css' | 'js' | 'fallbackText'])
  if (source === undefined) throw new Error('rich_inline_read: missing source field')
  if (request.offset > source.length) throw new Error('rich_inline_read: offset exceeds source length')
  const text = source.slice(request.offset, request.offset + request.length)
  const end = request.offset + text.length
  const sourceHash = target?.sourceHash ?? toolSource?.sourceHash
  if (sourceHash === undefined) throw new Error('rich_inline_read: missing source hash')
  return { sourceRef: brandString<RichSourceRef>(request.sourceRef), sourceHash, field: request.field, offset: request.offset,
    totalChars: source.length, text, nextOffset: end < source.length ? end : null }
}

/**
 * Register replay semantics and prepare history only after a delegated pre-step admits entry.
 * @param ctx - Session and Agent services under the plugin lifetime.
 * @param minBytes - configured source threshold.
 * @param inspect - explicit asynchronous read of the immutable publication history, including unmounted sources.
 */
export function installRichSourceOffload(ctx: Context, minBytes: number,
  inspect: (sessionId: SessionId, signal: AbortSignal) => Promise<readonly SessionEvent[]>): void {
  ctx.sessions.registerMessageProjection(richSourceProjection)
  ctx.sessions.registerMessageProjection(richToolSourceProjection)
  ctx.effect(() => registerCurrentSessionMessageProjection(richSourceProjection), 'rich-inline.detached-source-projection')
  ctx.effect(() => registerCurrentSessionMessageProjection(richToolSourceProjection), 'rich-inline.detached-tool-projection')
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    signal.throwIfAborted()
    if (decision.kind === 'enter') {
      const events = await inspect(agent.id, signal)
      signal.throwIfAborted()
      offloadRichSources(agent.session, events, minBytes)
      offloadRichToolSources(agent.session, events, minBytes)
    }
    return decision
  })
}

/** Immutable source selections from successfully settled publication and state tools. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { RichBlockId } from '../shared/types.ts'
import type { RichSourceRef } from './source.ts'

const index = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const revision = index.min(1)
const blockId = z.string().min(1).transform(value => brandString<RichBlockId>(value))
const fields = ['html', 'css', 'js', 'fallbackText', 'values'] as const
const values = z.record(z.string(), z.json())
const publishSchema = z.object({ blockId: z.string().optional(), expectedRenderRevision: revision.optional(),
  html: z.string(), css: z.string(), js: z.string(), fallbackText: z.string(), stateSchemaVersion: revision,
  values: values.optional() }).strict()
const updateSchema = z.object({ blockId: z.string(), expectedRenderRevision: revision, expectedDataRevision: revision,
  fallbackText: z.string(), values }).strict()
const outcomeSchema = z.object({ richInline: z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('publish'), blockId, renderRevision: revision, dataRevision: revision, marker: z.string() }).strict(),
  z.object({ kind: z.literal('data'), blockId, dataRevision: revision }).strict(),
]) }).strict()
const targetSchema = z.object({ seq: index.transform(SessionSeq), partIndex: index, resultSeq: index.transform(SessionSeq),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceRef: z.string().regex(/^source-[a-f0-9]{64}$/u).transform(value => brandString<RichSourceRef>(value)),
  blockId, renderRevision: revision, dataRevision: revision }).strict()
const decisionSchema = z.object({ targets: z.array(targetSchema).nonempty() }).strict()

/** Original invocation and successful result identify one immutable confirmed revision. */
export interface RichToolSourceTarget {
  readonly seq: SessionSeq
  readonly partIndex: number
  readonly resultSeq: SessionSeq
  readonly sourceHash: string
  readonly sourceRef: RichSourceRef
  readonly blockId: RichBlockId
  readonly renderRevision: number
  readonly dataRevision: number
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Replace successful publication/state arguments in future requests with immutable references.
     * Original arguments and results remain in the audit; failed or unsettled calls retain their content.
     * Replay requires the rich-inline interpreter and validates the causally paired result metadata.
     * @messageProjection
     */
    'rich-inline/tool-offload': { targets: RichToolSourceTarget[] }
  }
}
function hash(text: string): string { return createHash('sha256').update(text).digest('hex') }
function reference(target: Omit<RichToolSourceTarget, 'sourceRef'>): RichSourceRef {
  return brandString<RichSourceRef>(`source-${hash(JSON.stringify(target))}`)
}
function selected(events: readonly SessionEvent[], target: RichToolSourceTarget) {
  const original = events.find(event => event.seq === target.seq)
  const result = events.find(event => event.seq === target.resultSeq)
  if (original?.type !== 'assistant/message' || original.data.interrupted === true
    || original.data.message.source.replayState !== undefined || result?.type !== 'tool/result'
    || result.data.message.isError === true || result.data.error !== undefined) throw new Error('rich-inline/tool-offload: ineligible settlement')
  const part = original.data.message.content[target.partIndex]
  if (part?.type !== 'tool-call' || !['rich_inline_publish', 'rich_inline_update'].includes(part.name)) throw new Error('rich-inline/tool-offload: invalid invocation')
  const calls = events.filter(event => event.type === 'tool/call' && event.data.callId === part.id
    && event.data.turn === original.data.turn && event.data.step === original.data.step)
  const call = calls[0]
  if (calls.length !== 1 || call?.type !== 'tool/call' || call.data.name !== part.name || call.data.arguments !== part.arguments
    || result.data.message.toolCallId !== part.id || result.data.turn !== call.data.turn || result.data.step !== call.data.step
    || !(original.seq < call.seq && call.seq < result.seq) || hash(part.arguments) !== target.sourceHash) throw new Error('rich-inline/tool-offload: invocation association or hash mismatch')
  const input = part.name === 'rich_inline_publish' ? publishSchema.parse(JSON.parse(part.arguments)) : updateSchema.parse(JSON.parse(part.arguments))
  const outcome = outcomeSchema.parse(result.data.meta).richInline
  const renderRevision = outcome.kind === 'publish' ? outcome.renderRevision : updateSchema.parse(input).expectedRenderRevision
  if (outcome.kind !== (part.name === 'rich_inline_publish' ? 'publish' : 'data') || outcome.blockId !== target.blockId
    || input.blockId !== undefined && input.blockId !== target.blockId || renderRevision !== target.renderRevision
    || outcome.dataRevision !== target.dataRevision
    || part.name === 'rich_inline_update' && updateSchema.parse(input).expectedDataRevision + 1 !== target.dataRevision) throw new Error('rich-inline/tool-offload: confirmed revision mismatch')
  const { sourceRef, ...identity } = target
  if (reference(identity) !== sourceRef) throw new Error('rich-inline/tool-offload: reference mismatch')
  return { original, part, input }
}

/** Pure argument projection preserves tool identities, result pairing and other message projections. */
export const richToolSourceProjection: SessionMessageProjection<'rich-inline/tool-offload'> = {
  type: 'rich-inline/tool-offload',
  project(event, context) {
    const changed = new Map<SessionSeq, Message>()
    const seen = new Set<string>()
    for (const target of decisionSchema.parse(event.data).targets) {
      const key = `${target.seq}:${target.partIndex}`
      if (seen.has(key) || !context.nodes.includes(target.seq)) throw new Error('rich-inline/tool-offload: duplicate or absent surface target')
      seen.add(key)
      const { original, part, input } = selected(context.events.filter(item => item.seq < event.seq), target)
      const message = changed.get(target.seq) ?? context.messages.get(target.seq) ?? original.data.message
      const current = message.content[target.partIndex]
      if (message.role !== 'assistant' || current?.type !== 'tool-call' || current.id !== part.id || current.name !== part.name
        || current.arguments !== part.arguments) throw new Error('rich-inline/tool-offload: another projection changed the invocation')
      const retained = Object.fromEntries(Object.entries(input).filter(([field]) => !fields.includes(field as typeof fields[number])))
      const argumentsText = JSON.stringify({ ...retained, richSource: { sourceRef: target.sourceRef, blockId: target.blockId,
        renderRevision: target.renderRevision, dataRevision: target.dataRevision,
        fields: fields.filter(field => field in input) } })
      changed.set(target.seq, { ...message, content: message.content.map((item, position) => position === target.partIndex
        ? { ...current, arguments: argumentsText } : item) })
    }
    return changed
  },
}

/**
 * Select only complete invocations with successful structured publication outcomes.
 * @param session - live Session with this interpreter registered.
 * @param events - complete asynchronous inspection of the original audit.
 * @param minBytes - configured argument threshold.
 * @returns newly selected invocation count.
 */
export function offloadRichToolSources(session: Session, events: readonly SessionEvent[], minBytes: number): number {
  const prior = new Set(events.flatMap(event => event.type === 'rich-inline/tool-offload'
    ? event.data.targets.map(target => `${target.seq}:${target.partIndex}`) : []))
  const targets: RichToolSourceTarget[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message' || !session.surface.nodes.includes(event.seq)) continue
    event.data.message.content.forEach((part, partIndex) => {
      if (part.type !== 'tool-call' || !['rich_inline_publish', 'rich_inline_update'].includes(part.name)
        || Buffer.byteLength(part.arguments) < minBytes || prior.has(`${event.seq}:${partIndex}`)) return
      const results = events.filter(item => item.type === 'tool/result' && item.data.message.toolCallId === part.id
        && item.data.turn === event.data.turn && item.data.step === event.data.step)
      const result = results[0]
      if (results.length !== 1 || result?.type !== 'tool/result') return
      const outcome = outcomeSchema.safeParse(result.data.meta)
      if (!outcome.success) return
      const meta = outcome.data.richInline
      let parsed: unknown
      try { parsed = JSON.parse(part.arguments) } catch (_error) { return } // Malformed recorded JSON has no offload authority.
      const update = part.name === 'rich_inline_update' ? updateSchema.safeParse(parsed) : undefined
      if (update !== undefined && !update.success) return
      const identity = { seq: event.seq, partIndex, resultSeq: result.seq, sourceHash: hash(part.arguments), blockId: meta.blockId,
        renderRevision: meta.kind === 'publish' ? meta.renderRevision : update?.data.expectedRenderRevision ?? 0, dataRevision: meta.dataRevision }
      const target = { ...identity, sourceRef: reference(identity) }
      try { selected(events, target) } catch (_error) { return } // Invalid or incomplete durable tool facts remain unprojected.
      targets.push(target)
    })
  }
  if (targets.length > 0) session.append('rich-inline/tool-offload', { targets })
  return targets.length
}

/**
 * Resolve a declared tool source without mounting content or observing a mutable draft.
 * @param events - immutable audit of the current Session, including inherited history.
 * @param sourceRef - scoped reference selected by this Session's projection decisions.
 * @param field - publication source or confirmed replacement values.
 * @returns immutable field text and digest, or undefined for an undeclared reference.
 */
export function readRichToolSource(events: readonly SessionEvent[], sourceRef: string,
  field: string): { sourceHash: string; text: string } | undefined {
  const target = events.flatMap(event => event.type === 'rich-inline/tool-offload' ? decisionSchema.parse(event.data).targets : [])
    .find(item => item.sourceRef === sourceRef)
  if (target === undefined) return undefined
  const { input } = selected(events, target)
  if (!fields.includes(field as typeof fields[number]) || !(field in input)) throw new Error('rich_inline_read: field is not present in this confirmed snapshot')
  const value = input[field as keyof typeof input]
  return { sourceHash: target.sourceHash, text: typeof value === 'string' ? value : JSON.stringify(value) }
}

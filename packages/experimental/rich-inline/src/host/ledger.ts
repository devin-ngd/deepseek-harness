/** One durable aggregate holds drafts, action receipts, and dispatch intents atomically. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { RichActionId, RichBlockId, RichGrantId } from '../shared/types.ts'
import { isRichValues, typedRichValuesValid, RICH_ID } from '../shared/validate.ts'

const id = z.string().regex(RICH_ID)
const natural = z.number().int().nonnegative()
const jsonValues = z.record(z.string(), z.json()).refine(value => isRichValues(value))
const values = jsonValues.refine(value => typedRichValuesValid(value))
const draft = z.object({
  draftRevision: natural, stateSchemaVersion: z.number().int().positive(), fields: jsonValues, dirty: z.array(id).max(500),
}).strict()
const manifest = z.object({
  blockId: id.transform(value => brandString<RichBlockId>(value)), renderRevision: natural.min(1),
  html: z.string(), css: z.string(), js: z.string(), fallbackText: z.string(), stateSchemaVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
const grant = z.object({
  grantId: id.transform(value => brandString<RichGrantId>(value)), assetId: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string(), sizeBytes: natural, purpose: z.literal('agent-input'),
}).strict()
const status = z.object({
  actionId: id.transform(value => brandString<RichActionId>(value)),
  state: z.enum(['accepted', 'queued', 'running', 'cancel_requested', 'outcome_unknown', 'completed', 'failed', 'cancelled']),
  terminal: z.boolean(), ledgerSeq: natural, values,
  progress: z.object({ done: natural, total: natural, label: z.string().max(512) })
    .strict().refine(value => value.done <= value.total).nullable(),
  lateAfterCancel: z.boolean(),
}).strict().refine(value => value.terminal === ['completed', 'failed', 'cancelled'].includes(value.state))
const receipt = z.object({
  accepted: z.boolean(), code: z.string(), actionId: id.transform(value => brandString<RichActionId>(value)).nullable(),
  state: z.enum(['accepted', 'queued', 'running', 'cancel_requested', 'outcome_unknown', 'completed', 'failed', 'cancelled']).nullable(),
  draftRevision: natural,
}).strict()
const block = z.object({
  manifest, pendingManifest: manifest.nullable(), messageId: id.transform(value => brandString<MessageId>(value)).nullable(),
  dataRevision: natural, readOnly: z.boolean(), values, draft, archivedDrafts: z.array(draft).max(16),
  files: z.array(z.object({
    grant,
    attachment: z.object({
      attachmentId: id.transform(value => brandString<AttachmentId>(value)), name: z.string(), bytes: natural,
    }).strict(),
  }).strict()).max(16),
}).strict()
const action = z.object({
  blockId: id.transform(value => brandString<RichBlockId>(value)), renderRevision: natural, dataRevision: natural,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  agentRequestId: id.transform(value => brandString<SessionRequestId>(value)), status, receipt,
  actionName: z.enum(['submit', 'cancel', 'render']), targetActionId: id.transform(value => brandString<RichActionId>(value)).nullable(),
  values, fileGrants: z.array(id.transform(value => brandString<RichGrantId>(value))).max(16),
  outbox: z.boolean(), dispatchAttempts: natural, claimed: z.boolean(), cancelRequested: z.boolean(), claimedTurn: natural.nullable(),
  completionCallId: id.transform(value => brandString<ToolCallId>(value)).nullable(),
}).strict()
const sessionSchema = z.object({
  sessionId: id.transform(value => brandString<SessionId>(value)), blocks: z.record(id, block), actions: z.record(id, action),
}).strict()
  .superRefine((record, issue) => {
    for (const [key, value] of Object.entries(record.blocks)) {
      if (value.manifest.blockId !== key || value.pendingManifest !== null
        && (value.pendingManifest.blockId !== key || value.pendingManifest.renderRevision <= value.manifest.renderRevision)) {
        issue.addIssue({ code: 'custom', message: 'inconsistent block publication identity', path: ['blocks', key] })
      }
      for (const file of value.files) {
        if (file.grant.assetId !== file.attachment.attachmentId || file.grant.assetId !== `sha256:${file.grant.sha256}`
          || file.grant.sizeBytes !== file.attachment.bytes) {
          issue.addIssue({ code: 'custom', message: 'inconsistent stored file grant', path: ['blocks', key, 'files'] })
        }
      }
    }
    for (const [key, value] of Object.entries(record.actions)) {
      if (value.status.actionId !== key || value.receipt.actionId !== key || !value.receipt.accepted
        || record.blocks[value.blockId] === undefined) {
        issue.addIssue({ code: 'custom', message: 'inconsistent accepted action identity', path: ['actions', key] })
      }
    }
  })

/** Entire persisted state of one Session, changed in a single durable write. */
export type RichSessionRecord = z.infer<typeof sessionSchema>
/** Persisted rich block, draft, pending update, and file grants. */
export type RichBlockRecord = z.infer<typeof block>
/** Original receipt and retry payload remain immutable as action status evolves. */
export type RichActionRecord = z.infer<typeof action>
/** Validated domain declaration; malformed authoritative records fail loading. */
export const richLedgerSpec = defineDomain({
  name: 'rich_inline', version: 1, layout: 'single', tables: { sessions: domainTable<SessionId, RichSessionRecord>(sessionSchema) },
})
/** Typed handle owned by this plugin; it must close before its storage provider. */
export type RichLedgerDomain = Domain<typeof richLedgerSpec>
/** Session aggregate table used by the Host serialization owner. */
export type RichLedgerTable = KvTable<SessionId, RichSessionRecord>

/** Terminal state is not inferred from a transport acknowledgement or Agent idle.
 * @param state - current action state.
 * @returns whether the ledger permits no further status transitions.
 */
export function terminalRichState(state: string): boolean { return ['completed', 'failed', 'cancelled'].includes(state) }

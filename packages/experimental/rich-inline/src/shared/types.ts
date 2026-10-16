/** Browser-safe rich message transport and saved state. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
export type { RichTaskUsage, RichUsageCount, RichUsageSession } from './usage.ts'

/** Stable identity of one published rich block. */
export type RichBlockId = Branded<'rich-inline-block'>
/** Identity of one iframe lifetime; never persisted or reused. */
export type RichMountId = Branded<'rich-inline-mount'>
/** Stable idempotency identity chosen before an action is sent. */
export type RichActionId = Branded<'rich-inline-action'>
/** Explicit authority granted by the trusted file picker. */
export type RichGrantId = Branded<'rich-inline-file-grant'>
/** Arbitrary bounded JSON fields; rendering does not prescribe their layout. */
export type RichValues = Record<string, JsonValue>
/** Host-derived owner; generated content cannot choose a target. */
export interface RichScope {
  readonly sessionId: SessionId
  readonly messageId: MessageId
  readonly blockId: RichBlockId
  readonly renderRevision: number
}
/** Full content replacement; scripts run only after the committed replacement mounts. */
export interface RichManifest {
  readonly blockId: RichBlockId
  readonly renderRevision: number
  readonly html: string
  readonly css: string
  readonly js: string
  readonly fallbackText: string
  readonly stateSchemaVersion: number
  readonly contentHash: string
}
/** Draft save or submit carries the current input, including the last keystroke. */
export interface RichDraft {
  readonly baseRevision: number
  readonly stateSchemaVersion: number
  readonly fields: RichValues
  readonly dirty: readonly string[]
}
/** A draft revision becomes visible only after the durable write succeeds. */
export interface RichSavedDraft {
  readonly draftRevision: number
  readonly stateSchemaVersion: number
  readonly fields: RichValues
  readonly dirty: readonly string[]
}
/** Accepted and queued actions are not completed work. */
export type RichActionState = 'accepted' | 'queued' | 'running' | 'cancel_requested' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
/** Durable action status, separate from transport acknowledgements. */
export interface RichActionStatus {
  readonly actionId: RichActionId
  readonly state: RichActionState
  readonly terminal: boolean
  readonly ledgerSeq: number
  readonly values: RichValues
  readonly progress: { readonly done: number; readonly total: number; readonly label: string } | null
  readonly lateAfterCancel: boolean
}
/** Opaque file reference; contains neither a host path nor a download URL. */
export interface RichFileGrant {
  readonly grantId: RichGrantId
  readonly assetId: string
  readonly sha256: string
  readonly displayName: string
  readonly sizeBytes: number
  readonly purpose: 'agent-input'
}
/** Complete replacement snapshot for refresh, polling, and reconnect. */
export interface RichSnapshot {
  readonly protocol: 'lumina-rich/1'
  readonly scope: RichScope
  readonly manifest: RichManifest
  readonly pendingManifest: RichManifest | null
  readonly readOnly: boolean
  readonly dataRevision: number
  readonly values: RichValues
  readonly draft: RichSavedDraft
  readonly archivedDrafts: readonly RichSavedDraft[]
  readonly actions: readonly RichActionStatus[]
  readonly files: readonly RichFileGrant[]
  /** Internal repair status is separate from user business actions; older snapshots omit it. */
  readonly renderRepair?: RichActionState | null
}
/** Host confirms persistence of the intent, not execution of its consequences. */
export interface RichReceipt {
  readonly accepted: boolean
  readonly code: string
  readonly actionId: RichActionId | null
  readonly state: RichActionState | null
  readonly draftRevision: number
}
/** A trusted renderer requests a mount after identifying its persisted assistant message. */
export interface RichMountRequest {
  readonly sessionId: SessionId
  readonly messageId: MessageId
  readonly blockId: RichBlockId
}
/** New lifetime identity and complete durable baseline. */
export interface RichMountValue { readonly mountId: RichMountId; readonly snapshot: RichSnapshot }
/** Trusted Client repeats the Session for access checks; it must own the registered mount. */
export interface RichMountRequestId { readonly sessionId: SessionId; readonly mountId: RichMountId }
/** Conditional polling keeps unchanged code and state off the transport. */
export interface RichPollRequest extends RichMountRequestId { readonly revision: string | null }
/** Opaque revision covers drafts, actions, files, repair and staged code as well as confirmed data. */
export interface RichPollValue { readonly revision: string; readonly snapshot: RichSnapshot | null }
/** Scoped execution diagnostics carry no confirmation, tool selector, or session authority. */
export interface RichRenderRequest extends RichMountRequestId {
  readonly state: 'rendered' | 'failed'
  readonly message: string
}
/** Repair enqueue acknowledgement is separate from successful execution or business completion. */
export interface RichRenderReceipt { readonly code: string; readonly repairQueued: boolean }
/** Compare-and-set draft write. */
export interface RichSaveDraftRequest extends RichMountRequestId { readonly draft: RichDraft }
/** Input intent addresses its registered block; generated content never supplies the Session. */
export interface RichInvokeRequest extends RichSaveDraftRequest {
  readonly actionId: RichActionId
  readonly actionName: 'submit' | 'cancel'
  readonly targetActionId: RichActionId | null
  readonly expectedDataRevision: number
  readonly values: RichValues
  readonly fileGrants: readonly RichGrantId[]
}
/** Status and cancellation lookup never enqueue another prompt. */
export interface RichActionRequest extends RichMountRequestId { readonly actionId: RichActionId }
/** Called only by trusted host UI after the existing upload succeeds. */
export interface RichRegisterFileRequest extends RichMountRequestId { readonly receiptId: Branded<'file-upload-receipt-id'> }
/** Trusted renderer accepts or keeps a pending replacement without silently overwriting edits. */
export interface RichApplyUpdateRequest extends RichMountRequestId { readonly discardDraft: boolean }

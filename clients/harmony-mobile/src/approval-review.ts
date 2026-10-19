/** Local native review preflight only; a successful review never grants desktop permission or dispatches an action. */
import type { DesktopId, SessionId } from './protocol.ts'
import type { DeviceId } from './link-protocol.ts'
import type { JsonValue, Branded } from './upstream.ts'
import { fields, natural, text } from './link-protocol.ts'
import { canonical, id } from './protocol.ts'
import { TransportError } from './wire.ts'

/** Device/server review identity remains separate from rich SDK action identity until an actual approval endpoint supplies the mapping. */
export interface ApprovalSelection {
  readonly desktopId: DesktopId; readonly deviceId: DeviceId; readonly sessionId: SessionId
  readonly actionId: Branded<'mobile-approval-action'>; readonly grantEpoch: number
}
/** Exact Session/action/revision displayed by trusted UI; summary is explanatory text, never executable permission. */
export interface ApprovalBinding extends ApprovalSelection {
  readonly approvalId: Branded<'mobile-approval'>; readonly revision: number; readonly expiresAt: number; readonly summary: string
}
/** UI review outcome is intentionally not a transport permit. */
export interface LocalReview { readonly kind: 'local-review-only'; readonly decision: 'approve' | 'deny' }
/** Holds one bounded current review. The injected authorization owner must independently validate the live device/Session grant. */
export class NativeApprovalReview {
  private current: ApprovalBinding | null = null
  private reviewed: LocalReview | null = null
  private closed = false
  /** @param nativeSource - actual trusted UI receiver identity; never serialized or provided by a guest. @param authorize - current identity/scope checker; no credential generation. @param config - explicit clock and incoming JSON byte limit. */
  constructor(private readonly nativeSource: object, private readonly authorize: (selection: ApprovalSelection) => void,
    private readonly config: { readonly clock: () => number; readonly maxBytes: number }) {
    if (!Number.isSafeInteger(config.maxBytes) || config.maxBytes < 1) throw new TransportError('invalid-config')
  }
  private bound(value: JsonValue): void { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > this.config.maxBytes) throw new TransportError('approval-too-large') }
  /** @returns detached local review; absence or expiry never becomes approval. */
  get view(): { readonly binding: ApprovalBinding | null; readonly state: 'unavailable' | 'pending' | 'expired' | 'reviewed'; readonly review: LocalReview | null } {
    return { binding: structuredClone(this.current), state: this.closed || this.current === null ? 'unavailable' : this.current.expiresAt <= this.config.clock() ? 'expired' : this.reviewed === null ? 'pending' : 'reviewed', review: this.current !== null && this.current.expiresAt > this.config.clock() && !this.closed ? structuredClone(this.reviewed) : null }
  }
  /** @param value - bounded canonical review fields from a future trusted adapter; current legacy approval.list lacks this complete binding and remains display-only. */
  stage(value: JsonValue): void {
    if (this.closed) throw new TransportError('closed')
    this.bound(value)
    const row = fields(value, ['desktopId', 'deviceId', 'sessionId', 'actionId', 'grantEpoch', 'approvalId', 'revision', 'expiresAt', 'summary'])
    const binding: ApprovalBinding = { desktopId: id<'mobile-desktop'>(text(row.desktopId)), deviceId: id<'mobile-device'>(text(row.deviceId)), sessionId: id<'SessionId'>(text(row.sessionId)), actionId: id<'mobile-approval-action'>(text(row.actionId)), approvalId: id<'mobile-approval'>(text(row.approvalId)), grantEpoch: natural(row.grantEpoch), revision: natural(row.revision), expiresAt: natural(row.expiresAt), summary: text(row.summary) }
    if (binding.grantEpoch < 1 || binding.revision < 1) throw new TransportError('approval-invalid')
    this.authorize(binding)
    if (this.current?.approvalId === binding.approvalId) {
      if (binding.revision < this.current.revision) throw new TransportError('approval-stale')
      if (binding.revision === this.current.revision) { if (canonical(binding) !== canonical(this.current)) throw new TransportError('approval-conflict'); return }
    }
    this.current = binding; this.reviewed = null
  }
  /** @param value - native button intent containing only id/revision/decision. @param source - actual native receiver, not a JSON field. @param selection - currently selected native Session/action. @returns idempotent local review; no server approval, task or rich operation occurs. */
  confirm(value: JsonValue, source: object, selection: ApprovalSelection): LocalReview {
    if (this.closed) throw new TransportError('closed')
    if (source !== this.nativeSource) throw new TransportError('native-confirmation-required')
    this.bound(value)
    const row = fields(value, ['approvalId', 'revision', 'decision']), binding = this.current
    if (binding === null || row.approvalId !== binding.approvalId || row.revision !== binding.revision) throw new TransportError('approval-stale')
    if (row.decision !== 'approve' && row.decision !== 'deny') throw new TransportError('approval-invalid')
    const expected: ApprovalSelection = { desktopId: binding.desktopId, deviceId: binding.deviceId, sessionId: binding.sessionId, actionId: binding.actionId, grantEpoch: binding.grantEpoch }
    if (canonical(expected) !== canonical(selection)) throw new TransportError('scope-denied')
    this.authorize(expected)
    if (binding.expiresAt <= this.config.clock()) throw new TransportError('approval-expired')
    const review: LocalReview = { kind: 'local-review-only', decision: row.decision }
    if (this.reviewed !== null && this.reviewed.decision !== review.decision) throw new TransportError('approval-conflict')
    this.reviewed = review; return structuredClone(review)
  }
  /** Invalidate local confirmation after native teardown; it does not cancel desktop work. */
  close(): void { this.closed = true; this.current = null; this.reviewed = null }
}

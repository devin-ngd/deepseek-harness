/** Experimental mobile adapter API. It is separate from the existing DSH wire API. */
import type { Branded, RichSnapshot } from './upstream.ts'
import { isWireId } from './wire-fields.ts'

/** Desktop execution owner; this fixture does not confer network authority. */
export type DesktopId = Branded<'mobile-desktop'>
/** Mobile request id, retained unchanged across receipt reconciliation. */
export type RequestId = Branded<'mobile-request'>
/** Session identity uses the upstream brand without carrying filesystem paths. */
export type SessionId = Branded<'SessionId'>

/**
 * Admit a bounded opaque identifier at a wire parser or fixture construction site.
 * @param value - candidate identity.
 * @returns branded identifier; throws before state mutation on invalid input.
 */
export function id<B extends string>(value: string): Branded<B> {
  if (!isWireId(value)) throw new MobileError('invalid-request')
  return value as Branded<B>
}

/** Stable expected failure categories; none grants safe automatic resubmission. */
export type FailureCode = 'mock-only' | 'invalid-request' | 'not-found' | 'id-conflict'
  | 'scope-mismatch' | 'sequence-gap' | 'frame-conflict' | 'stale-lease' | 'forbidden'

/** No user data or credentials are embedded in error messages. */
export class MobileError extends Error {
  constructor(readonly code: FailureCode, options?: ErrorOptions) { super(code, options); this.name = 'MobileError' }
}

/** Selected session and request identity are chosen by trusted native UI. */
export interface TaskRequest {
  readonly protocol: 'dsh-mobile-lab/1'
  readonly desktopId: DesktopId
  readonly sessionId: SessionId
  readonly requestId: RequestId
  readonly scenario: 'rich-form'
  readonly text: string
}

/** Admission acknowledges intent; completion arrives independently. */
export interface TaskReceipt {
  readonly requestId: RequestId
  readonly sessionId: SessionId
  readonly accepted: true
  readonly state: 'queued'
}

/** Synthetic durable adapter events, not copied DSH SessionEvent discriminators. */
export type LabEvent =
  | { readonly kind: 'task'; readonly requestId: RequestId; readonly state: 'queued' | 'running' | 'completed' | 'cancel_requested' | 'cancelled' }
  | { readonly kind: 'text'; readonly messageId: string; readonly text: string }
  | { readonly kind: 'rich'; readonly snapshot: RichSnapshot }
  | { readonly kind: 'approval'; readonly approvalId: string; readonly summary: string; readonly state: 'pending' | 'expired' }

/** A sequence belongs to one desktop/session, and increments only after fixture admission. */
export interface JournalFrame {
  readonly desktopId: DesktopId
  readonly sessionId: SessionId
  readonly seq: number
  readonly event: LabEvent
}

/** Live chunks are process-local; reconnect replaces their baseline. */
export interface LiveChunk {
  readonly desktopId: DesktopId
  readonly sessionId: SessionId
  readonly attemptId: string
  readonly index: number
  readonly text: string
}

/** Bounded selection rows displayed by the native shell. */
export interface SessionRow {
  readonly sessionId: SessionId
  readonly project: string
  readonly title: string
  readonly executionOwner: DesktopId
}

/**
 * Compare JSON operation content independent of object member order.
 * @param value - JSON data already admitted by its owner.
 * @returns deterministic serialization for fixture deduplication.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new MobileError('invalid-request')
  return encoded
}

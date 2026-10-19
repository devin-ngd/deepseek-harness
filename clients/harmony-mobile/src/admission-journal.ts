/** Task admission survives adapter replacement; uncertain records are never evicted or automatically dispatched. */
import { LinkError } from './link-protocol.ts'
import type { DeviceId } from './link-protocol.ts'
import type { DesktopId, SessionId } from './protocol.ts'
import type { SessionRequestId } from './upstream.ts'

/** Durable intent identity, stored before the canonical prompt call; accepted means admission, not completion. */
export interface AdmissionRecord {
  readonly desktopId: DesktopId
  readonly sessionId: SessionId
  readonly requestId: SessionRequestId
  readonly deviceId: DeviceId
  readonly fingerprint: string
  readonly state: 'submitting' | 'accepted'
}
/** One writer owns the journal. Persistent providers must atomically claim and fail closed on unreadable state. */
export interface AdmissionJournal {
  /** @param record - new intent. @returns existing record, or a durable newly created claim; only the latter permits dispatch. */
  claim(record: AdmissionRecord): Promise<{ readonly created: boolean; readonly record: AdmissionRecord }>
  /** @param sessionId - task owner. @param requestId - stable task identifier. @returns recorded intent, if any. */
  get(sessionId: SessionId, requestId: SessionRequestId): Promise<AdmissionRecord | undefined>
  /** @param record - previously claimed intent. @returns after accepted evidence is stored durably. */
  accept(record: AdmissionRecord): Promise<void>
}
/** @param sessionId - task owner. @param requestId - stable task identifier. @returns slash-delimited key; both identifiers exclude slashes. */
export function admissionKey(sessionId: SessionId, requestId: SessionRequestId): string { return sessionId + '/' + requestId }

/** Bounded volatile journal for unit fixtures only. Production activation needs a persistent provider. */
export class MemoryAdmissionJournal implements AdmissionJournal {
  private readonly rows = new Map<string, AdmissionRecord>()
  /** @param maxRecords - positive cap; reaching it rejects new work instead of forgetting uncertain work. */
  constructor(private readonly maxRecords: number) {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new LinkError('invalid-packet')
  }
  async claim(record: AdmissionRecord): Promise<{ readonly created: boolean; readonly record: AdmissionRecord }> {
    const key = admissionKey(record.sessionId, record.requestId), old = this.rows.get(key)
    if (old !== undefined) return { created: false, record: structuredClone(old) }
    if (this.rows.size >= this.maxRecords) throw new LinkError('queue-full')
    this.rows.set(key, structuredClone(record)); return { created: true, record: structuredClone(record) }
  }
  async get(sessionId: SessionId, requestId: SessionRequestId): Promise<AdmissionRecord | undefined> {
    return structuredClone(this.rows.get(admissionKey(sessionId, requestId)))
  }
  async accept(record: AdmissionRecord): Promise<void> {
    const key = admissionKey(record.sessionId, record.requestId), old = this.rows.get(key)
    if (old === undefined || old.desktopId !== record.desktopId || old.deviceId !== record.deviceId || old.fingerprint !== record.fingerprint) throw new LinkError('id-conflict')
    this.rows.set(key, { ...old, state: 'accepted' })
  }
}

/** Finite desktop-only clock and injection observations for synthetic native acceptance. */
import type { CommandId } from '../src/link-protocol.ts'
import { integer } from '../src/domain.ts'

/** Request identity correlates timing only; no request payload or authentication data is retained. */
export interface CommandAuditRecord {
  readonly stage: 'received' | 'checked' | 'adapter-rejected' | 'fault-taken' | 'fault-written'
  readonly commandId: CommandId
  readonly expiresAt: number
  readonly at: number
  readonly outcome: 'received' | 'admitted' | 'elapsed' | 'future-limit' | 'taken' | 'written'
  readonly clockSource: 'desktop Date.now' | 'desktop monotonic epoch'
  readonly unit: 'epoch-ms'
  readonly fault?: string
  readonly faultIndex?: number
}
/** Overflow is visible and disqualifies a complete timing trace; it never changes command admission. */
export class CommandAudit {
  private readonly records: CommandAuditRecord[] = []
  private dropped = 0
  /** @param maxRecords - explicit retained observation limit. @param checkedClockSource - actual admission clock provider. */
  constructor(readonly maxRecords: number, private readonly checkedClockSource: CommandAuditRecord['clockSource']) { integer(maxRecords, 1) }
  /** @param value - desktop observation containing only diagnostic metadata. */
  record(value: Omit<CommandAuditRecord, 'clockSource' | 'unit'>): void {
    if (this.records.length >= this.maxRecords) { this.records.shift(); this.dropped++ }
    this.records.push({ ...value, clockSource: value.stage === 'checked' || value.stage === 'adapter-rejected' ? this.checkedClockSource : 'desktop Date.now', unit: 'epoch-ms' })
  }
  /** @returns detached finite observations and explicit retention loss. */
  get report() { return { dropped: this.dropped, records: this.records.map(record => ({ ...record })) } }
}

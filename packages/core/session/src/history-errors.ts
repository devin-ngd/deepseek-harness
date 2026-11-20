import type { SessionSeq } from './types.ts'

/** A stored event cannot be detached as lossless JSON for asynchronous history. */
export class SessionHistoryCopyError extends Error {
  /** @param seq - sequence of the event that could not be copied. */
  constructor(readonly seq: SessionSeq) {
    super(`session history event at seq ${String(seq)} is not losslessly JSON-serializable`)
    this.name = 'SessionHistoryCopyError'
  }
}

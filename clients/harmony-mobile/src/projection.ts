/** Fixture projection; a transport decoder must admit real DSH data before using a production projection. */
import { canonical, MobileError } from './protocol.ts'
import type { DesktopId, JournalFrame, LiveChunk, SessionId } from './protocol.ts'

/** Owns one selected session's display generation, without execution authority. */
export class MobileProjection {
  private records: JournalFrame[] = []
  private live: LiveChunk[] = []
  private attempt: string | null = null
  private suspended = false
  constructor(readonly desktopId: DesktopId, readonly sessionId: SessionId) {}
  /** Last inclusive adapter sequence; -1 is the empty prefix. */
  get cursor(): number { return this.records.length - 1 }
  /** Detached committed display facts. */
  get history(): readonly JournalFrame[] { return structuredClone(this.records) }
  /** Ephemeral stream presentation only. */
  get liveText(): string { return this.live.map(chunk => chunk.text).join('') }

  /**
   * Accept a typed fixture frame, reject gaps and conflicting duplicates before mutation.
   * @param frame - detached journal frame already admitted by the adapter.
   * @returns whether a new event was appended.
   */
  accept(frame: JournalFrame): boolean {
    this.scope(frame)
    if (this.suspended) throw new MobileError('sequence-gap')
    if (!Number.isSafeInteger(frame.seq) || frame.seq < 0) throw new MobileError('invalid-request')
    if (frame.seq <= this.cursor) {
      if (canonical(this.records[frame.seq]) !== canonical(frame)) { this.suspended = true; throw new MobileError('frame-conflict') }
      return false
    }
    if (frame.seq !== this.cursor + 1) { this.suspended = true; throw new MobileError('sequence-gap') }
    this.records.push(structuredClone(frame))
    if (frame.event.kind === 'text') { this.live = []; this.attempt = null }
    return true
  }

  /**
   * Atomically replace an entire fixture prefix when resuming after process loss or gaps.
   * @param frames - full ordered prefix from the fixture owner; invalid input leaves the old display intact.
   */
  baseline(frames: readonly JournalFrame[]): void {
    const replacement = new MobileProjection(this.desktopId, this.sessionId)
    for (const frame of frames) replacement.accept(frame)
    this.records = [...replacement.history]
    this.live = []; this.attempt = null; this.suspended = false
  }

  /** @param chunk - scoped fixture live chunk. @returns false for identical retransmissions; a gap clears ephemeral state. */
  acceptLive(chunk: LiveChunk): boolean {
    this.scope(chunk)
    if (!Number.isSafeInteger(chunk.index) || chunk.index < 0) throw new MobileError('invalid-request')
    if (this.attempt !== chunk.attemptId) {
      if (chunk.index !== 0) throw new MobileError('sequence-gap')
      this.live = []; this.attempt = chunk.attemptId
    }
    const old = this.live[chunk.index]
    if (old !== undefined) {
      if (canonical(old) !== canonical(chunk)) throw new MobileError('frame-conflict')
      return false
    }
    if (chunk.index !== this.live.length) { this.live = []; this.attempt = null; throw new MobileError('sequence-gap') }
    this.live.push(structuredClone(chunk))
    return true
  }

  /** Phone backgrounding abandons transient display without cancelling the desktop. */
  disconnect(): void { this.live = []; this.attempt = null }
  private scope(frame: { readonly desktopId: DesktopId; readonly sessionId: SessionId }): void {
    if (frame.desktopId !== this.desktopId || frame.sessionId !== this.sessionId) throw new MobileError('scope-mismatch')
  }
}

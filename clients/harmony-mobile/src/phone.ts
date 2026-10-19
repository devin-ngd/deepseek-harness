/** Platform-independent trusted phone state; no ArkWeb or network authentication claim. */
import { canonical, id } from './protocol.ts'
import type { SessionId } from './protocol.ts'
import { LinkError, MOBILE_LINK_PROTOCOL } from './link-protocol.ts'
import type { MobileCommand, MobileOperation, OutboundEvent } from './link-protocol.ts'
import type { MockOutboundRelay, MockPeer } from './relay.ts'
import type { MobileResult } from './desktop-adapter.ts'
import type { SessionFollowFrame, SessionWireEvent } from './upstream.ts'

/** Canonical raw event mirror. Product rendering must additionally reuse DSH's current semantic projection. */
export class CanonicalPhoneProjection {
  private baselineCursor = -1
  private cursorValue = -1
  private streamRevision = -1
  private lastLiveFingerprint: string | null = null
  private readonly eventHashes = new Map<number, string>()
  private readonly records = new Map<number, SessionWireEvent>()
  private active: NonNullable<Extract<SessionFollowFrame, { type: 'snapshot' }>['assistantStream']>['activeAttempt']
  private committedAt: number | null = null
  private needsSync = true

  /** @param sessionId - trusted selected owner. @param version - accepted fixture Session format. */
  constructor(readonly sessionId: SessionId, readonly version: number) {}
  /** @returns last durable seq, independently of live stream and relay sequence. */
  get cursor(): number { return this.cursorValue }
  /** @returns detached log records from the retained snapshot window. */
  get events(): readonly SessionWireEvent[] { return structuredClone([...this.records.values()]) }
  /** @returns detached process-local attempt; it never means durable task completion. */
  get liveAttempt(): typeof this.active { return structuredClone(this.active) }
  /** @returns whether a fresh opening is required before incremental processing. */
  get resyncRequired(): boolean { return this.needsSync }

  /** @param frame - typed detached in-memory service output, not a network parser. Mutations are atomic on failed snapshot validation. */
  apply(frame: SessionFollowFrame): void {
    if (frame.type === 'snapshot') {
      if (frame.header.id !== this.sessionId || frame.header.version !== this.version || frame.projections.asOfSeq !== frame.cursor) throw new LinkError('protocol-mismatch')
      const staged = new Map<number, SessionWireEvent>(), hashes = new Map<number, string>()
      let previous: number | undefined
      for (const record of frame.records) {
        const seq = record.event.seq
        if (!Number.isSafeInteger(seq) || seq < 0 || seq > frame.cursor || previous !== undefined && seq !== previous + 1) throw new LinkError('resync-needed')
        staged.set(seq, structuredClone(record.event)); hashes.set(seq, canonical(record.event)); previous = seq
      }
      if (!Number.isSafeInteger(frame.cursor) || frame.cursor < -1 || previous !== undefined && previous !== frame.cursor) throw new LinkError('resync-needed')
      this.records.clear(); this.eventHashes.clear()
      for (const [seq, event] of staged) this.records.set(seq, event)
      for (const [seq, hash] of hashes) this.eventHashes.set(seq, hash)
      this.baselineCursor = frame.cursor; this.cursorValue = frame.cursor; this.needsSync = false
      this.streamRevision = frame.assistantStream?.revision ?? -1; this.lastLiveFingerprint = null
      this.active = structuredClone(frame.assistantStream?.activeAttempt); this.committedAt = null
      return
    }
    if (this.needsSync) throw new LinkError('resync-needed')
    if (frame.type === 'event') {
      const event = frame.event, hash = canonical(event), old = this.eventHashes.get(event.seq)
      if (old !== undefined) { if (old !== hash) this.failSync(); return }
      if (event.seq <= this.baselineCursor) return
      if (event.seq !== this.cursorValue + 1) this.failSync()
      this.records.set(event.seq, structuredClone(event)); this.eventHashes.set(event.seq, hash); this.cursorValue = event.seq
      if (this.committedAt !== null && event.seq >= this.committedAt) { this.active = undefined; this.committedAt = null }
      return
    }
    const live = frame.frame, hash = canonical(live)
    if (live.revision < this.streamRevision) return
    if (live.revision === this.streamRevision) {
      if (this.lastLiveFingerprint !== null && hash !== this.lastLiveFingerprint) this.failSync()
      return
    }
    if (live.type === 'start') this.active = { attemptId: live.attemptId, startedAfterSeq: live.startedAfterSeq,
      turn: live.turn, step: live.step, nextIndex: 0, stream: [] }
    else {
      const active = this.active
      if (active === undefined || active.attemptId !== live.attemptId || active.nextIndex !== live.index) this.failSync()
      if (live.type === 'chunk') this.active = { ...active, nextIndex: live.index + 1, stream: [...active.stream, live.chunk] }
      else if (live.outcome.kind === 'abandoned' || live.outcome.seq <= this.cursorValue) this.active = undefined
      else this.committedAt = live.outcome.seq
    }
    this.streamRevision = live.revision; this.lastLiveFingerprint = hash
  }
  private failSync(): never { this.needsSync = true; throw new LinkError('resync-needed') }
  /** Suspension invalidates live presentation; durable execution is owned by the desktop. */
  suspend(): void { this.active = undefined; this.needsSync = true }
}

/** Trusted phone client sends a fixed operation allowlist through the mock outbound link. */
export class MockPhoneClient {
  private sequence = 0
  private readonly relayCursors = new Map<SessionId, number>()
  private readonly projections = new Map<SessionId, CanonicalPhoneProjection>()

  /** @param relay - memory-only fixture. @param peer - trusted mock identity. @param ttlMs - command expiration. @param sessionVersion - fixture-compatible format. */
  constructor(private readonly relay: MockOutboundRelay, readonly peer: MockPeer, readonly ttlMs: number, readonly sessionVersion: number) {
    relay.setForeground(peer, true)
  }
  /** @param operation - native-owned supported method. @param payload - untrusted values still validated by the desktop. @returns fresh bounded request identity. */
  command(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): MobileCommand {
    return { protocol: MOBILE_LINK_PROTOCOL, desktopId: this.peer.desktopId, deviceId: this.peer.deviceId,
      grantEpoch: this.peer.epoch, commandId: id<'mobile-command'>(this.peer.deviceId + '-command-' + ++this.sequence),
      expiresAt: this.relay.config.clock() + this.ttlMs, operation, payload }
  }
  /** @param operation - native-owned method. @param payload - operation fields. @returns service response, with no automatic retry. */
  async request(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): Promise<MobileResult> {
    return (await this.relay.request(this.peer, this.command(operation, payload))).value
  }
  /** @param sessionId - native-selected owner. @returns canonical raw projection, opened once per native selection. */
  projection(sessionId: SessionId): CanonicalPhoneProjection {
    let view = this.projections.get(sessionId)
    if (view === undefined) { view = new CanonicalPhoneProjection(sessionId, this.sessionVersion); this.projections.set(sessionId, view) }
    return view
  }
  /** @param sessionId - native-selected owner. @returns refreshed view and subsequent retained frames. A lost relay prefix is reported, never retried as a task. */
  async sync(sessionId: SessionId): Promise<CanonicalPhoneProjection> {
    const command = this.command('session.sync', { sessionId, afterSeq: this.projection(sessionId).cursor })
    const { value, beforeRelayCursor } = await this.relay.request(this.peer, command)
    if (value === null || typeof value !== 'object' || !('type' in value) || value.type !== 'snapshot') throw new LinkError('invalid-packet')
    const view = this.projection(sessionId); view.apply(value)
    this.relayCursors.set(sessionId, beforeRelayCursor)
    this.poll(sessionId)
    return view
  }
  /** @param sessionId - selected owner. @returns received suffix; duplicate application is safe, gaps require sync. */
  poll(sessionId: SessionId): readonly OutboundEvent[] {
    const command = this.command('session.sync', { sessionId, afterSeq: this.projection(sessionId).cursor })
    const after = this.relayCursors.get(sessionId)
    if (after === undefined) throw new LinkError('resync-needed')
    const events = this.relay.replay(this.peer, command, sessionId, after)
    for (const event of events) {
      this.projection(sessionId).apply(event.frame); this.relayCursors.set(sessionId, event.relaySeq)
    }
    return events
  }
  /** @param foreground - false models phone backgrounding without a keepalive privilege or desktop cancellation. */
  setForeground(foreground: boolean): void {
    this.relay.setForeground(this.peer, foreground)
    if (!foreground) for (const projection of this.projections.values()) projection.suspend()
  }
}

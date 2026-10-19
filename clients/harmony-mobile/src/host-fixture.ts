/** Canonical service-port fixtures. All task and rich state belongs to the existing fixed MockDesktop. */
import { MockDesktop } from './mock.ts'
import { id } from './protocol.ts'
import type { SessionId } from './protocol.ts'
import type { ApprovalView, DesktopServicePorts } from './desktop-adapter.ts'
import { LinkError } from './link-protocol.ts'
import { isRichJson } from './upstream.ts'
import type { SessionFollowFrame, SessionEventEntry, SessionAssistantStreamFrame, SessionRequestId } from './upstream.ts'

/** Every source and failure choice is explicit; no model or installed desktop is reachable. */
export interface HostFixtureConfig {
  readonly sessionFormatVersion: number
  readonly clock: () => number
  readonly publish: (sessionId: SessionId, frame: SessionFollowFrame) => void
  readonly beforePrompt: (signal: AbortSignal) => Promise<void>
  readonly losePromptReply: () => boolean
}

/** Synthetic implementations accept canonical requests without loading an installed DSH process. */
export class SyntheticHost implements DesktopServicePorts {
  readonly environment = 'synthetic-only'
  readonly desktop = new MockDesktop('mock')
  private readonly mounts = new Map<string, SessionId>()
  private readonly emitted = new Map<SessionId, number>()
  private readonly recordTimes = new Map<string, number>()
  private readonly prompts = new Map<SessionId, SessionRequestId>()
  private readonly pendingApprovals = new Map<SessionId, ApprovalView[]>()
  private readonly live = new Map<SessionId, Extract<SessionFollowFrame, { type: 'snapshot' }>['assistantStream']>()
  activeFollows = 0
  promptCalls = 0
  cancelCalls = 0

  /** @param config - fixed replay metadata, virtual clock and in-memory outbound event sink. */
  constructor(private readonly config: HostFixtureConfig) {}

  readonly session: DesktopServicePorts['session'] = {
    prompt: async (request, signal) => {
      this.promptCalls++
      await this.config.beforePrompt(signal)
      if (signal.aborted) throw new LinkError('closed')
      if (request.mode !== 'queue' || request.content.length !== 1 || request.content[0]?.type !== 'text') throw new LinkError('invalid-packet')
      this.desktop.prompt({ protocol: 'dsh-mobile-lab/1', desktopId: this.desktop.desktopId,
        sessionId: request.sessionId, requestId: request.requestId, scenario: 'rich-form', text: request.content[0].text })
      this.prompts.set(request.sessionId, request.requestId)
      this.flush(request.sessionId)
      if (this.config.losePromptReply()) throw new LinkError('transport-lost')
      return { accepted: true }
    },
    cancel: request => {
      this.cancelCalls++
      const requestId = this.prompts.get(request.sessionId)
      if (requestId !== undefined) this.desktop.cancelTask(request.sessionId, id<'mobile-request'>(requestId))
      this.flush(request.sessionId)
      return { accepted: true }
    },
    follow: (request, signal) => this.follow(request.address, signal),
    findPromptReceipt: async (sessionId, requestId) => this.desktop.receipt(sessionId, id<'mobile-request'>(requestId)) === null ? 'absent' : 'accepted',
  }

  readonly rich: DesktopServicePorts['rich'] = {
    mount: async request => {
      const snapshot = this.desktop.snapshotFor(request.sessionId)
      if (snapshot.scope.messageId !== request.messageId || snapshot.scope.blockId !== request.blockId) throw new LinkError('scope-denied')
      const mounted = this.desktop.mount(request.sessionId)
      this.mounts.set(mounted.mountId, request.sessionId)
      return mounted
    },
    snapshot: async request => this.desktop.snapshotFor(this.requireMount(request.mountId)),
    saveDraft: async request => this.desktop.saveDraft(request),
    invoke: async request => this.desktop.invoke(request),
    status: async request => this.desktop.status(request.mountId, request.actionId),
    dispose: async request => { this.mounts.delete(request.mountId); this.desktop.dispose(request.mountId) },
  }

  readonly approvals: DesktopServicePorts['approvals'] = {
    list: async sessionId => {
      this.desktop.snapshotFor(sessionId)
      return (this.pendingApprovals.get(sessionId) ?? []).map(approval => ({ ...approval,
        state: approval.expiresAt <= this.config.clock() ? 'expired' : approval.state }))
    },
  }

  /** @returns number of host mounts, for teardown and revocation evidence only. */
  get mountCount(): number { return this.mounts.size }

  /** Advance only the fixed synthetic task. @param sessionId - fixture session owner. */
  advance(sessionId: SessionId): void {
    const requestId = this.prompts.get(sessionId)
    if (requestId === undefined) throw new LinkError('invalid-packet')
    this.desktop.advance(sessionId, id<'mobile-request'>(requestId)); this.flush(sessionId)
  }

  /** Settle the fixture's existing action ledger; does not implement a second ledger. @param sessionId - original owner. @param actionId - original fixture action. */
  completeAction(sessionId: SessionId, actionId: string): void {
    const mount = this.desktop.mount(sessionId)
    try { this.desktop.completeAction(mount.mountId, id<'rich-inline-action'>(actionId)); this.flush(sessionId) }
    finally { this.desktop.dispose(mount.mountId) }
  }

  /** Inject a canonical process-local frame. @param sessionId - explicit fixture owner. @param frame - fixed test frame. */
  stream(sessionId: SessionId, frame: SessionAssistantStreamFrame): void {
    this.desktop.snapshotFor(sessionId)
    if (frame.type === 'start') this.live.set(sessionId, { revision: frame.revision, activeAttempt: {
      attemptId: frame.attemptId, startedAfterSeq: frame.startedAfterSeq, turn: frame.turn, step: frame.step, nextIndex: 0, stream: [] } })
    else if (frame.type === 'chunk') {
      const baseline = this.live.get(sessionId), active = baseline?.activeAttempt
      if (active === undefined || active.attemptId !== frame.attemptId || active.nextIndex !== frame.index) throw new LinkError('resync-needed')
      this.live.set(sessionId, { revision: frame.revision, activeAttempt: { ...active, nextIndex: frame.index + 1, stream: [...active.stream, frame.chunk] } })
    } else this.live.set(sessionId, { revision: frame.revision })
    this.config.publish(sessionId, { type: 'assistant-stream', frame })
  }

  /** Create display-only approval fixture. @param sessionId - authorized owner. @param approval - synthetic expiry metadata. */
  addApproval(sessionId: SessionId, approval: ApprovalView): void {
    this.desktop.snapshotFor(sessionId)
    this.pendingApprovals.set(sessionId, [...(this.pendingApprovals.get(sessionId) ?? []), structuredClone(approval)])
  }

  private requireMount(mountId: string): SessionId {
    const sessionId = this.mounts.get(mountId)
    if (sessionId === undefined) throw new LinkError('stale-mount')
    return sessionId
  }
  private records(sessionId: SessionId): SessionEventEntry[] {
    return this.desktop.replay(sessionId, -1).map(record => {
      const key = sessionId + '/' + record.seq
      let time = this.recordTimes.get(key)
      if (time === undefined) { time = this.config.clock(); this.recordTimes.set(key, time) }
      const data: unknown = JSON.parse(JSON.stringify(record.event))
      if (!isRichJson(data)) throw new LinkError('invalid-packet')
      // This laboratory event is explicitly ignorable, never a forged DSH assistant/message.
      return { type: 'event', event: { type: 'mobile-lab/fixture', seq: record.seq, time, data, ignorable: true } }
    })
  }
  private flush(sessionId: SessionId): void {
    const records = this.records(sessionId), after = this.emitted.get(sessionId) ?? -1
    for (const record of records) if (record.event.seq > after) this.config.publish(sessionId, record)
    this.emitted.set(sessionId, records.at(-1)?.event.seq ?? -1)
  }
  private async *follow(address: import('@deepseek-ai/dsh-api-session-controller/types').SessionAddress, signal: AbortSignal): AsyncIterable<SessionFollowFrame> {
    if (address.kind !== 'session' || signal.aborted) throw new LinkError('invalid-packet')
    this.activeFollows++
    try {
      const records = this.records(address.sessionId), cursor = records.at(-1)?.event.seq ?? -1
      const assistantStream = this.live.get(address.sessionId)
      yield { type: 'snapshot', header: { id: address.sessionId, version: this.config.sessionFormatVersion, createdAt: 0, isSeeded: false },
        cursor, records, hasMore: false, projections: { asOfSeq: cursor, values: {} },
        ...(assistantStream === undefined ? {} : { assistantStream: structuredClone(assistantStream) }) }
    } finally { this.activeFollows-- }
  }
}

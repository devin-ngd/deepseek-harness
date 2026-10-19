/** Explicit offline native demo composes existing synthetic services; production runtime exports remain mock-free. */
import { SyntheticHost } from './host-fixture.ts'
import { RestrictedDesktopAdapter } from './desktop-adapter.ts'
import { MockDeviceRegistry } from './link-protocol.ts'
import type { MobileCommand } from './link-protocol.ts'
import type { NativeProvider } from './phone-core.ts'
import type { JsonValue, SessionFollowFrame } from './upstream.ts'
import type { WireItem, WireResume } from './wire.ts'
import { jsonPayload, NdjsonDecoder, parseWireItem, TransportError } from './wire.ts'
import { MemoryAdmissionJournal } from './admission-journal.ts'
import { id } from './protocol.ts'
import { SESSION_FORMAT_VERSION, SessionSeq } from './upstream-domain.ts'
import { object, integer, string } from './domain.ts'
import type { NativeIo } from './native-port.ts'
import { nativeSecurityManifest } from './native-security-fixture.ts'

/** Native selects these synthetic Sessions; generated content cannot create other execution scopes. */
export const OFFLINE_NATIVE_SESSIONS = ['mock-session-a', 'mock-session-b'] as const
/** Deployment limits apply to retained follow frames and native byte replies. */
export interface OfflineNativePolicy { readonly maxBytes: number; readonly maxFrames: number; readonly chunkBytes: number; readonly ttlMs: number; readonly maxMounts: number }
/** Shared service composition owns synthetic task/action admission, independent of the page's lifetime. */
export class OfflineNativeProvider implements NativeProvider {
  readonly host: SyntheticHost
  private readonly adapter: RestrictedDesktopAdapter
  private queue: WireItem[] = []
  private wake: (() => void) | undefined
  private cursor = 0
  private streamRevision = 0
  private following = false
  private closed = false
  private tail: Promise<void> = Promise.resolve()
  private failure: Error | null = null
  private readonly submittedText = new Map<string, string>()
  private readonly device = id<'mobile-device'>('offline-native-phone')
  /** @param io - app cache/resource carrier only. @param sessionId - native-selected fixed demo Session. @param policy - explicit byte/frame/chunk bounds. */
  constructor(private readonly io: NativeIo, readonly sessionId: typeof OFFLINE_NATIVE_SESSIONS[number], private readonly policy: OfflineNativePolicy) {
    if (!OFFLINE_NATIVE_SESSIONS.includes(sessionId)) throw new TransportError('scope-denied')
    for (const value of Object.values(policy)) integer(value, 1)
    const clock = () => Date.now()
    this.host = new SyntheticHost({ sessionFormatVersion: SESSION_FORMAT_VERSION, clock, beforePrompt: async () => undefined, losePromptReply: () => false,
      publish: (session, frame) => { if (session === sessionId && this.following) this.enqueue(frame) } })
    if (sessionId === 'mock-session-b') {
      const owner = id<'SessionId'>(sessionId), snapshot = this.host.desktop.snapshotFor(owner)
      this.host.desktop.replaceFixturePublication(owner, nativeSecurityManifest(snapshot.manifest))
    }
    const devices = new MockDeviceRegistry('mock', clock)
    devices.addFixtureGrant({ deviceId: this.device, desktopId: this.host.desktop.desktopId, epoch: 1, sessions: [id<'SessionId'>(sessionId)],
      operations: ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.snapshot', 'rich.dispose', 'approval.list'], expiresAt: Number.MAX_SAFE_INTEGER, revoked: false })
    this.adapter = new RestrictedDesktopAdapter(this.host.desktop.desktopId, this.host, devices,
      { clock, maxPacketBytes: policy.maxBytes, maxCommandTtlMs: policy.ttlMs, maxCachedCommands: policy.maxFrames, maxMountedBlocks: policy.maxMounts }, new MemoryAdmissionJournal(policy.maxFrames))
  }
  /** @returns immutable synthetic routing identity; no production identity or token exists. */
  get owner() { return { desktopId: this.host.desktop.desktopId, deviceId: this.device, sessionId: id<'SessionId'>(this.sessionId) } }
  private fixtureEvent(value: JsonValue): JsonValue {
    const entry = object(value), wire = object(entry.event)
    if (wire.type !== 'mobile-lab/fixture') return value
    const record = this.host.desktop.replay(id<'SessionId'>(this.sessionId), -1).find(row => row.seq === wire.seq)
    if (!record) throw new TransportError('native-fixture-missing')
    const event = record.event, base = { seq: record.seq, time: integer(wire.time) }
    // These canonical envelopes exist only in the explicitly labelled synthetic native provider; the source lab journal stays unchanged.
    switch (event.kind) {
      case 'task': {
        const turn = this.host.desktop.replay(id<'SessionId'>(this.sessionId), -1).find(row => row.event.kind === 'task' && row.event.requestId === event.requestId && row.event.state === 'queued')!.seq + 1
        if (event.state === 'queued') return jsonPayload({ type: 'event', event: { ...base, type: 'user/message', surfaceOp: 'append', data: { id: 'fixture-user-' + record.seq, role: 'user', content: [{ type: 'text', text: this.submittedText.get(event.requestId) ?? 'synthetic task' }], source: { kind: 'user', rpcId: event.requestId } } } })
        if (event.state === 'running') return jsonPayload({ type: 'event', event: { ...base, type: 'turn/start', data: { turn } } })
        if (event.state === 'completed' || event.state === 'cancelled') return jsonPayload({ type: 'event', event: { ...base, type: 'turn/end', data: { turn, reason: { kind: event.state === 'completed' ? 'completed' : 'aborted' } } } })
        return value
      }
      case 'text': return jsonPayload({ type: 'event', event: { ...base, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'fixture-text-' + record.seq, role: 'assistant', content: [{ type: 'text', text: event.text }], source: { kind: 'llm' } }, stream: [] } } })
      case 'rich': {
        const previous = this.host.desktop.replay(id<'SessionId'>(this.sessionId), -1).filter(row => row.seq < record.seq && row.event.kind === 'rich' && row.event.snapshot.scope.messageId === event.snapshot.scope.messageId).at(-1)
        if (previous) return value // The synthetic log retains rich updates; the scoped snapshot RPC owns their current data.
        return jsonPayload({ type: 'event', event: { ...base, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: event.snapshot.scope.messageId, role: 'assistant', content: [{ type: 'text', text: '```rich-inline\n' + JSON.stringify({ blockId: event.snapshot.scope.blockId }) + '\n```' }], source: { kind: 'llm' } }, stream: [] } } })
      }
      case 'approval': return value
      default: { const unsupported: never = event; throw new TransportError('native-fixture-invalid', { cause: unsupported }) }
    }
  }
  private project(value: JsonValue): JsonValue {
    const frame = object(value)
    if (frame.type === 'event') return this.fixtureEvent(value)
    if (frame.type === 'snapshot') {
      if (!Array.isArray(frame.records)) throw new TransportError('native-fixture-invalid')
      return { ...frame, records: frame.records.map(row => this.fixtureEvent(row)), ...(frame.assistantStream === undefined ? { assistantStream: { revision: this.streamRevision } } : {}) }
    }
    return value
  }
  private async bytes(value: JsonValue): Promise<WireItem[]> {
    const reply = object(await this.io.request('fixture.bytes', { text: JSON.stringify(value) + '\n', chunkBytes: this.policy.chunkBytes }))
    if (!Array.isArray(reply.chunks) || reply.chunks.length > this.policy.maxBytes) throw new TransportError('native-bytes-invalid')
    const decoder = new NdjsonDecoder(this.policy.maxBytes), items: WireItem[] = []
    let total = 0
    for (const chunk of reply.chunks) {
      const raw = atob(string(chunk, this.policy.chunkBytes * 2))
      total += raw.length
      if (raw.length < 1 || raw.length > this.policy.chunkBytes || total > this.policy.maxBytes || btoa(raw) !== chunk) throw new TransportError('native-bytes-invalid')
      for (const line of decoder.push(Uint8Array.from(raw, char => char.charCodeAt(0)))) items.push(parseWireItem(JSON.parse(line)))
    }
    decoder.finish(); return items
  }
  private enqueue(frame: SessionFollowFrame): void {
    const item = jsonPayload({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', kind: 'event', ...this.owner, instance: 'native-offline', relayCursor: ++this.cursor, payload: this.project(jsonPayload(frame)) })
    this.tail = this.tail.then(async () => {
      const items = await this.bytes(item)
      if (this.closed || !this.following) return
      if (this.queue.length + items.length > this.policy.maxFrames) throw new TransportError('native-stream-too-large')
      this.queue.push(...items); this.wake?.()
    }).catch((error: unknown) => { this.failure = error instanceof Error ? error : new TransportError('native-stream-failed'); this.wake?.() })
  }
  /** @param command - bounded native core command. @returns existing synthetic service result; no external process or model runs. */
  async request(command: MobileCommand): Promise<JsonValue> {
    if (this.closed) throw new TransportError('closed')
    if (command.operation === 'task.submit' && typeof command.payload.requestId === 'string' && typeof command.payload.text === 'string' && !this.submittedText.has(command.payload.requestId)) {
      if (this.submittedText.size >= this.policy.maxFrames) throw new TransportError('native-intent-full')
      this.submittedText.set(command.payload.requestId, command.payload.text)
    }
    const previousTasks = this.host.desktop.admittedTasks
    const value = jsonPayload(await this.adapter.handle(JSON.stringify(command)))
    if (command.operation === 'task.submit' && object(value).accepted === true && this.host.desktop.admittedTasks > previousTasks) {
      const session = id<'SessionId'>(this.sessionId), records = this.host.desktop.replay(session, -1), cut = records.at(-1)!.seq
      const attempt = id<'LlmAttemptId'>('native-fixture-attempt-' + previousTasks)
      this.host.advance(session)
      this.host.stream(session, { type: 'start', attemptId: attempt, revision: ++this.streamRevision, startedAfterSeq: SessionSeq(cut), turn: previousTasks + 1, step: 1 })
      this.host.stream(session, { type: 'chunk', attemptId: attempt, revision: ++this.streamRevision, index: 0, time: Date.now(), chunk: { type: 'text-delta', index: 0, text: '合成离线流式进度🙂' } })
      this.host.advance(session)
      const committed = this.host.desktop.replay(session, -1).find(row => row.seq > cut && row.event.kind === 'text')!.seq
      this.host.stream(session, { type: 'end', attemptId: attempt, revision: ++this.streamRevision, index: 1, outcome: { kind: 'committed', eventType: 'assistant/message', seq: committed } })
    }
    if (command.operation === 'rich.invoke') { const receipt = object(value); if (receipt.accepted === true && typeof receipt.actionId === 'string') this.host.completeAction(id<'SessionId'>(this.sessionId), receipt.actionId) }
    await this.tail; if (this.failure) throw this.failure
    return value
  }
  /** @param command - fixed Session follow scope. @param resume - read-only hint; never dispatches. @param signal - foreground lifetime. @returns native-chunk-decoded canonical frames and subsequent synthetic service events. */
  async *follow(command: MobileCommand, resume: WireResume, signal?: AbortSignal): AsyncIterable<WireItem> {
    if (this.closed || this.following || command.payload.sessionId !== this.sessionId) throw new TransportError('native-follow-invalid')
    void resume
    this.following = true
    const aborted = () => this.wake?.(); signal?.addEventListener('abort', aborted, { once: true })
    try {
      const initial = await this.adapter.handle(JSON.stringify(command))
      const first = await this.bytes(jsonPayload({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', kind: 'reset', ...this.owner, instance: 'native-offline', relayCursor: this.cursor, payload: this.project(jsonPayload(initial)) }))
      for (const item of first) { if (!signal?.aborted && !this.closed) yield item }
      while (!signal?.aborted && !this.closed) {
        if (this.failure) throw this.failure
        const item = this.queue.shift()
        if (item) { yield item; continue }
        await new Promise<void>(accept => { this.wake = accept })
      }
    } finally { this.following = false; this.queue = []; this.wake = undefined; signal?.removeEventListener('abort', aborted) }
  }
  /** @returns after routing stops and synthetic leases/requests settle; no accepted desktop task is cancelled. */
  async close(): Promise<void> { this.closed = true; this.wake?.(); await this.tail; await this.adapter.close() }
}

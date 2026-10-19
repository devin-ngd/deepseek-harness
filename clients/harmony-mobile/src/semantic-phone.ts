/** Shared semantic model for native presentation and browser QA; domain admission precedes both cursors. */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionId } from './protocol.ts'
import { canonical, id } from './protocol.ts'
import type { JsonValue, RichSnapshot } from './upstream.ts'
import type { WireItem, WireResume } from './wire.ts'
import type { DomainLimits, DecodedEvent, LiveState, MessagePart } from './domain.ts'
import { WireCursor, TransportError, jsonPayload } from './wire.ts'
import { bounded, decodeDomain, decodeEvent, decodeRich, failureView, integer, boolean, object, parts, string, validateLimits } from './domain.ts'
import { authoredContent, authoredFences, authoredBlockId, richMarkerIds, KNOWN_SESSION_EVENT_TYPES, MESSAGE_PROJECTION_EVENT_TYPES, SurfaceManager, SessionLogOffset, SESSION_FORMAT_VERSION, createRichSourceProjection, createRichToolSourceProjection, richProjectionHistoryStart, sha256, bytesToHex } from './upstream-domain.ts'

const richProjections = [createRichSourceProjection(text => bytesToHex(sha256(new TextEncoder().encode(text)))), createRichToolSourceProjection(text => bytesToHex(sha256(new TextEncoder().encode(text))))]
const richProjectionTypes = new Set<string>(richProjections.map(projection => projection.type))

/** Native-selected publication; generated HTML cannot replace it. */
export interface RichReference { readonly sessionId: SessionId; readonly messageId: string; readonly blockId: string; readonly fallback: string }
/** One display row retains durable message identity and rich references. */
export interface MessageView { readonly id: string; readonly seq: number; readonly role: string; readonly parts: readonly MessagePart[]; readonly rich: readonly RichReference[] }
/** Transport delivery, turn state, and rich actions are separate facts. */
export interface PhoneView {
  readonly sessionId: SessionId; readonly desktopId: string; readonly cursor: number; readonly hasMore: boolean; readonly readOnly: boolean
  readonly connection: 'disconnected' | 'connected'; readonly task: 'idle' | 'accepted' | 'running' | 'completed' | 'cancel_requested' | 'cancelled' | 'failed' | 'outcome_unknown' | 'pending_confirmation'
  readonly error: string | null; readonly notices: readonly string[]; readonly messages: readonly MessageView[]; readonly liveText: string
  readonly tools: readonly { readonly callId: string; readonly name: string; readonly state: 'running' | 'completed' | 'failed' }[]
  readonly rich: readonly RichSnapshot[]
}
interface JournalState { readonly cursor: number; readonly version: number; readonly seeded: boolean; readonly hasMore: boolean; readonly events: readonly DecodedEvent[]; readonly live: LiveState }
const emptyLive: LiveState = { revision: -1, attemptId: null, nextIndex: 0, chunks: [], committedSeq: null }
/** Current rich-inline dispatch text is folded only with its generated RPC source and a visible persisted block; this grants no authority. */
function richDispatch(data: Readonly<Record<string, JsonValue>>, content: readonly MessagePart[], messages: readonly MessageView[]): boolean {
  const source = object(data.source), text = content.length === 1 && content[0]?.kind === 'text' ? content[0].text : null
  if (typeof source.rpcId !== 'string' || !source.rpcId.startsWith('rich-') || text === null || !text.startsWith('Interactive input ')) return false
  let input: Readonly<Record<string, JsonValue>>
  try { input = object(jsonPayload(JSON.parse(text.slice('Interactive input '.length)))) }
  catch (error) { if (error instanceof SyntaxError || error instanceof TransportError) return false; throw error }
  return input.protocol === 'lumina-rich/1' && input.actionName === 'submit' && input.inputTrust === 'untrusted-rich-ui'
    && typeof input.actionId === 'string' && input.actionId.length > 0
    && messages.some(message => message.rich.some(reference => reference.blockId === input.blockId))
}
/** Trusted mobile projection; exact replay duplicates are safe and malformed frames leave display and resume unchanged. */
export class SemanticPhone {
  private wire: WireCursor
  private journal: JournalState = { cursor: -1, version: SESSION_FORMAT_VERSION, seeded: false, hasMore: false, events: [], live: emptyLive }
  private readonly snapshots = new Map<string, RichSnapshot>()
  private connected = false
  private offline = false
  private admission: PhoneView['task'] = 'idle'
  private admissionCut = -1
  private error: string | null = null
  private followFailure: string | null = null
  /** @param owner - native routing selection. @param limits - explicit bounded domain policy. @param duplicateCap - retained wire fingerprints. */
  constructor(readonly owner: Pick<WireItem, 'desktopId' | 'deviceId' | 'sessionId'>, readonly limits: DomainLimits, private readonly duplicateCap: number) {
    validateLimits(limits); this.wire = new WireCursor(owner, duplicateCap)
  }
  /** @returns transport hint after semantic admission, independently of durable and live revisions. */
  get resume(): WireResume { return this.wire.resume }
  /** @param item - parsed, owner-bound wire item. @returns whether new domain state was published. */
  accept(item: WireItem): boolean {
    const decoded = decodeDomain(item.payload, this.owner.sessionId, this.limits)
    if ((item.kind === 'reset') !== (decoded.type === 'snapshot')) throw new TransportError('domain-invalid')
    const nextWire = this.wire.fork()
    if (!nextWire.apply(item)) return false
    let next = this.journal
    if (decoded.type === 'snapshot') {
      if (decoded.cursor < next.cursor) throw new TransportError('domain-rollback')
      for (const entry of decoded.events) { const old = next.events.find(previous => previous.wire.seq === entry.wire.seq); if (old !== undefined && canonical(old.wire) !== canonical(entry.wire)) throw new TransportError('domain-conflict') }
      next = { ...decoded, events: decoded.events }
    } else if (next.version === SESSION_FORMAT_VERSION) {
      if (decoded.type === 'event') {
        const row = decoded.event, old = next.events.find(entry => entry.wire.seq === row.wire.seq)
        if (old !== undefined) { if (canonical(old.wire) !== canonical(row.wire)) throw new TransportError('domain-conflict') }
        else if (row.wire.seq > next.cursor) {
          if (row.wire.seq !== next.cursor + 1) throw new TransportError('domain-gap')
          if (next.events.length >= this.limits.maxEvents) throw new TransportError('domain-window-full')
          const live = next.live.committedSeq !== null && row.wire.seq >= next.live.committedSeq ? { ...emptyLive, revision: next.live.revision } : next.live
          next = { ...next, cursor: row.wire.seq, events: [...next.events, row], live }
        }
      } else {
        const frame = decoded.frame, revision = frame.revision as number
        if (revision !== next.live.revision + 1) throw new TransportError('domain-live-gap')
        let live: LiveState
        if (frame.type === 'start') live = { revision, attemptId: frame.attemptId as string, nextIndex: 0, chunks: [], committedSeq: null }
        else {
          if (frame.attemptId !== next.live.attemptId || frame.index !== next.live.nextIndex) throw new TransportError('domain-live-gap')
          if (frame.type === 'chunk') {
            if (next.live.chunks.length >= this.limits.maxBlocks) throw new TransportError('domain-too-large')
            live = { ...next.live, revision, nextIndex: next.live.nextIndex + 1, chunks: [...next.live.chunks, frame.chunk!] }
          } else {
            const outcome = object(frame.outcome), committedSeq = outcome.kind === 'committed' ? outcome.seq as number : null
            live = committedSeq === null || committedSeq <= next.cursor ? { ...emptyLive, revision } : { ...next.live, revision, committedSeq }
          }
        }
        next = { ...next, live }
      }
    }
    bounded(jsonPayload({ events: next.events.map(entry => entry.wire), chunks: [...next.live.chunks] }), this.limits)
    // Stage semantic rendering before committing the transport hint; renderer errors cannot consume an event.
    this.project(next, false)
    this.journal = next; this.wire = nextWire; this.connected = true; this.offline = false
    if (item.kind === 'reset') this.followFailure = null
    return true
  }
  /** @param value - bounded canonical backwards page in its native-selected envelope. @returns whether older records were appended; live/wire cursors never move backwards. */
  history(value: JsonValue): boolean {
    bounded(value, this.limits)
    const page = object(value)
    if (page.protocol !== 'dsh-mobile-read/1' || this.journal.version !== SESSION_FORMAT_VERSION) throw new TransportError('read-version-unsupported')
    if (page.sessionId !== this.owner.sessionId || integer(page.throughSeq, -1) > this.journal.cursor) throw new TransportError('scope-denied')
    if (!Array.isArray(page.records) || page.records.length > this.limits.maxEvents) throw new TransportError('domain-too-large')
    const events = page.records.map(record => { const row = object(record); if (row.type !== 'event') throw new TransportError('domain-invalid'); return decodeEvent(row.event!, this.limits) })
    const before = page.beforeSeq === null ? integer(page.throughSeq, -1) + 1 : integer(page.beforeSeq)
    for (let at = 0; at < events.length; at++) if (events[at]!.wire.seq >= before || at > 0 && events[at]!.wire.seq !== events[at - 1]!.wire.seq + 1) throw new TransportError('domain-gap')
    const currentFirst = this.journal.events[0]?.wire.seq ?? this.journal.cursor + 1
    for (const entry of events) { const old = this.journal.events.find(row => row.wire.seq === entry.wire.seq); if (old !== undefined && canonical(old.wire) !== canonical(entry.wire)) throw new TransportError('domain-conflict') }
    const older = events.filter(entry => entry.wire.seq < currentFirst), hasMore = boolean(page.hasMore)
    if (older.length === 0) return false
    if (older.at(-1)!.wire.seq !== currentFirst - 1 || events.at(-1)!.wire.seq !== before - 1 || hasMore === false && older[0]!.wire.seq !== 0) throw new TransportError('domain-gap')
    const joined = [...older, ...this.journal.events]
    if (joined.length > this.limits.maxEvents) throw new TransportError('domain-window-full')
    bounded(jsonPayload(joined.map(entry => entry.wire)), this.limits)
    const next = { ...this.journal, events: joined, hasMore }; this.project(next); this.journal = next; return true
  }
  /** @returns oldest retained durable seq; this is independent of follow's current cursor. */
  get firstSeq(): number { return this.journal.events[0]?.wire.seq ?? this.journal.cursor + 1 }
  /** @returns bounded source facts and drafts only; credentials, mounts and transport resume hints are absent. */
  cache(): JsonValue {
    const value = jsonPayload({ schema: 'mobile-semantic-cache/1', owner: this.owner, version: this.journal.version, cursor: this.journal.cursor, seeded: this.journal.seeded, hasMore: this.journal.hasMore, events: this.journal.events.map(entry => entry.wire), rich: [...this.snapshots.values()] })
    bounded(value, this.limits); return value
  }
  /** @param value - cache bytes already checked by OfflineCache. Restore atomically as disconnected/read-only; fresh remote opening is required for mutation. */
  restore(value: JsonValue): void {
    bounded(value, this.limits)
    const cache = object(value), owner = object(cache.owner)
    if (cache.schema !== 'mobile-semantic-cache/1') throw new TransportError('cache-version-unsupported')
    if (canonical(owner) !== canonical(this.owner) || !Array.isArray(cache.events) || !Array.isArray(cache.rich)) throw new TransportError('scope-denied')
    const staged = new SemanticPhone(this.owner, this.limits, this.duplicateCap)
    staged.accept({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...this.owner, instance: id<'mobile-wire-instance'>('offline-cache'), relayCursor: 0, kind: 'reset', payload: { type: 'snapshot', header: { version: integer(cache.version, 1), id: this.owner.sessionId, createdAt: 0, isSeeded: boolean(cache.seeded) }, cursor: integer(cache.cursor, -1), records: cache.events.map(event => ({ type: 'event', event })), hasMore: boolean(cache.hasMore), projections: { asOfSeq: integer(cache.cursor, -1), values: {} } } })
    for (const value of cache.rich) { const scope = object(object(value).scope), reference = staged.view.messages.flatMap(message => message.rich).find(row => row.messageId === scope.messageId && row.blockId === scope.blockId); if (reference === undefined) throw new TransportError('scope-denied'); staged.richSnapshot(value, reference) }
    this.journal = staged.journal; this.snapshots.clear(); for (const [key, value] of staged.snapshots) this.snapshots.set(key, value)
    this.wire = new WireCursor(this.owner, this.duplicateCap); this.offline = true; this.connected = false; this.admission = 'idle'; this.admissionCut = -1; this.error = null
  }
  /** @param state - native operation result. Unknown delivery remains visible until a read-only receipt query resolves it. */
  admissionState(state: 'accepted' | 'outcome_unknown' | 'cancel_requested', error: string | null = null, cut = this.journal.cursor): void { this.admission = state; this.admissionCut = cut; this.error = error }
  /** A decoded owner-bound RPC also confirms connectivity when a retained follow suffix is empty. */
  verifiedConnection(): void { this.connected = true }
  /** Retain desktop turn state on network loss; live text is marked stale by connection state. */
  disconnect(): void { this.connected = false }
  /** @param code - terminal read failure. Retain admitted history and block writes until a validated full reset. */
  failFollow(code: string): void { this.followFailure = code; this.connected = false }
  /** @param value - network rich snapshot. @param reference - native-selected persisted message block. @returns admitted current rich state; old revisions never overwrite drafts or actions. */
  richSnapshot(value: JsonValue, reference: RichReference): RichSnapshot {
    if (!this.view.messages.some(message => message.rich.some(item => item.messageId === reference.messageId && item.blockId === reference.blockId))) throw new TransportError('scope-denied')
    const next = decodeRich(value, reference, this.limits), old = this.snapshots.get(reference.blockId)
    if (old !== undefined) {
      if (next.scope.renderRevision < old.scope.renderRevision || next.dataRevision < old.dataRevision || next.draft.draftRevision < old.draft.draftRevision) throw new TransportError('rich-rollback')
      for (const previous of old.actions) { const action = next.actions.find(item => item.actionId === previous.actionId); if (action === undefined || action.ledgerSeq < previous.ledgerSeq || previous.terminal && JSON.stringify(action) !== JSON.stringify(previous)) throw new TransportError('rich-rollback') }
      if (next.scope.renderRevision === old.scope.renderRevision && next.manifest.contentHash !== old.manifest.contentHash) throw new TransportError('rich-conflict')
      if (next.scope.renderRevision === old.scope.renderRevision && canonical(next.manifest) !== canonical(old.manifest) || next.dataRevision === old.dataRevision && canonical(next.values) !== canonical(old.values) || next.draft.draftRevision === old.draft.draftRevision && canonical(next.draft) !== canonical(old.draft)) throw new TransportError('rich-conflict')
    }
    if (!this.snapshots.has(reference.blockId) && this.snapshots.size >= this.limits.maxRichBlocks) throw new TransportError('domain-too-large')
    this.snapshots.set(reference.blockId, structuredClone(next)); return structuredClone(next)
  }
  /** @returns detached locale-independent model; ArkUI binds resources to these statuses. */
  get view(): PhoneView { return structuredClone(this.project(this.journal)) }
  private project(state: JournalState, offline = this.offline): PhoneView {
    const notices: string[] = [], messages: MessageView[] = [], tools = new Map<string, PhoneView['tools'][number]>()
    let readOnly = state.version !== SESSION_FORMAT_VERSION || offline, task = this.admission, error = this.error
    if (offline) notices.push('offline-cache')
    if (state.version !== SESSION_FORMAT_VERSION) notices.push('session-version-unsupported')
    if (this.followFailure !== null) { readOnly = true; error = this.followFailure; notices.push('follow-read-only') }
    const unknown = state.events.filter(entry => !KNOWN_SESSION_EVENT_TYPES.has(entry.wire.type) && entry.wire.ignorable !== true)
    if (unknown.length > 0) { readOnly = true; notices.push('required-event-unsupported') }
    const projectionMissing = state.events.some(entry => MESSAGE_PROJECTION_EVENT_TYPES.has(entry.wire.type) && !richProjectionTypes.has(entry.wire.type))
    if (projectionMissing) { readOnly = true; notices.push('message-projection-unavailable') }
    const events = state.events.map(entry => entry.wire as SessionEvent)
    const firstRequired = state.version === SESSION_FORMAT_VERSION && unknown.length === 0 && !projectionMissing ? richProjectionHistoryStart(events) : null
    const incompleteProjection = state.hasMore && firstRequired !== null && firstRequired < (events[0]?.seq ?? state.cursor + 1)
    if (incompleteProjection) { readOnly = true; notices.push('message-projection-history-incomplete') }
    let current = new Set<number>()
    if ((!readOnly || (offline || this.followFailure !== null) && state.version === SESSION_FORMAT_VERSION && unknown.length === 0 && !projectionMissing && !incompleteProjection) && state.events.length > 0) {
      // Only the maintained surface manager owns replacement/source rules. Complete display fields were admitted by decodeDomain.
      const surface = new SurfaceManager(events, SessionLogOffset(events[0]!.seq), richProjections)
      current = new Set(surface.nodes)
    } else current = new Set(state.events.filter(entry => entry.parts !== undefined).map(entry => entry.wire.seq))
    for (const entry of state.events) {
      const event = entry.wire, data = event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {}
      if (event.type === 'turn/start' && event.seq > this.admissionCut) task = 'running'
      if (event.type === 'turn/end' && event.seq > this.admissionCut) {
        const reason = object(data.reason)
        switch (reason.kind) {
          case 'completed': task = 'completed'; break
          case 'aborted': task = 'cancelled'; break
          case 'blocked': task = 'pending_confirmation'; break
          case 'error': task = 'failed'; error = failureView(reason.error!); break
          default: task = 'outcome_unknown'; notices.push('turn-incomplete'); break
        }
      }
      if (event.type === 'tool/call') tools.set(String(data.callId), { callId: String(data.callId), name: String(data.name), state: 'running' })
      if (event.type === 'tool/result') {
        const result = object(data.message), callId = String(result.toolCallId), previous = tools.get(callId)
        tools.set(callId, { callId, name: previous?.name ?? 'unknown', state: result.isError === true ? 'failed' : 'completed' })
      }
      if (entry.parts === undefined || entry.messageId === undefined || entry.role === 'system' || entry.role === 'developer' || entry.role === 'tool' || !current.has(event.seq)) continue
      const rich: RichReference[] = [], rendered: MessagePart[] = []
      for (const part of entry.parts) {
        if (entry.role !== 'assistant' || part.kind !== 'text') { rendered.push(part); continue }
        let at = 0
        for (const fence of authoredFences(part.text)) {
          const authored = authoredContent(fence.source)
          if (authored === null) continue
          if (fence.start > at) rendered.push({ kind: 'text', text: part.text.slice(at, fence.start) })
          rich.push({ sessionId: this.owner.sessionId, messageId: entry.messageId, blockId: authoredBlockId(entry.messageId, authored.key), fallback: authored.fallbackText }); at = fence.end
        }
        const remaining = part.text.slice(at), markers = richMarkerIds(remaining)
        for (const blockId of markers) rich.push({ sessionId: this.owner.sessionId, messageId: entry.messageId, blockId, fallback: 'rich-block-pending' })
        if (remaining.trim() && markers.length === 0) rendered.push({ kind: 'text', text: remaining })
      }
      const role = entry.role === 'user' && (object(data.source).kind !== 'user' || richDispatch(data, rendered, messages)) ? 'context' : entry.role ?? 'unsupported'
      messages.push({ id: entry.messageId, seq: event.seq, role, parts: rendered, rich })
    }
    if (this.admission === 'outcome_unknown') task = this.admission
    let liveText = ''
    for (const value of state.live.chunks) { const chunk = object(value); if (chunk.type === 'text-delta') liveText += string(chunk.text, this.limits.maxText); else if (chunk.type === 'block-end') { const final = parts([chunk.block!], this.limits); if (liveText === '' && final[0]?.kind === 'text') liveText += final[0].text } }
    if (liveText.length > this.limits.maxText) throw new TransportError('domain-too-large')
    const inheritedCut = state.events.filter(entry => entry.wire.type === 'session/end-seed' && object(entry.wire.data).inherited === true).at(-1)?.wire.seq
    return { sessionId: this.owner.sessionId, desktopId: this.owner.desktopId, cursor: state.cursor, hasMore: state.hasMore, readOnly, connection: this.connected ? 'connected' : 'disconnected', task, error, notices,
      messages, liveText, tools: [...tools.values()], rich: [...this.snapshots.values()].filter(snapshot => messages.some(message => message.id === snapshot.scope.messageId && message.rich.some(reference => reference.blockId === snapshot.scope.blockId))).map(snapshot => {
        const messageSeq = messages.find(message => message.id === snapshot.scope.messageId)?.seq
        return readOnly || state.seeded && (inheritedCut === undefined || messageSeq === undefined || messageSeq < inheritedCut) ? { ...snapshot, readOnly: true } : snapshot
      }) }
  }
}

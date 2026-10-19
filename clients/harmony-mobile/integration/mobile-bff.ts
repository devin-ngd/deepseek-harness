/** Narrow BFF Remote service over the actual Gateway; fixture identity is explicitly not device authentication. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ScopedDesktopExecutor, DesktopCommandAuthorizer } from '../src/desktop-adapter.ts'
import { fields, natural, text, parseCommand, LinkError, CommandExpiryError } from '../src/link-protocol.ts'
import type { DeviceId, MobileCommand, CommandExpiry } from '../src/link-protocol.ts'
import type { DesktopId, SessionId } from '../src/protocol.ts'
import type { SessionFollowFrame, JsonValue } from '../src/upstream.ts'
import { jsonPayload, parseResume, TransportError } from '../src/wire.ts'
import type { WireItem, WireInstance } from '../src/wire.ts'
import type { CommandAudit } from './command-audit.ts'
import { id } from '../src/protocol.ts'

/** One bounded Session journal; overflow requires a new canonical snapshot rather than dropping frames silently. */
export class FollowJournal {
  private nextCursor = -1
  private dropped = -1
  private readonly frames: { readonly cursor: number; readonly value: JsonValue; readonly expiresAt: number; readonly bytes: number }[] = []
  private readonly listeners = new Set<() => void>()
  private bytes = 0
  private closed = false
  /** @param owner - isolated Session owner. @param config - explicit retention policy. */
  constructor(readonly owner: SessionId, private readonly config: { readonly clock: () => number; readonly ttlMs: number; readonly maxFrames: number; readonly maxBytes: number; readonly maxFrameBytes: number }) {
    for (const value of [config.ttlMs, config.maxFrames, config.maxBytes, config.maxFrameBytes]) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
  }
  /** @returns last produced transport cursor, separately from Session durable seq. */
  get cursor(): number { return this.nextCursor }
  /** @param sessionId - real follow owner. @param frame - canonical source output. */
  publish(sessionId: SessionId, frame: SessionFollowFrame): void {
    if (this.closed) throw new TransportError('closed')
    if (sessionId !== this.owner) throw new TransportError('scope-denied')
    const value = jsonPayload(JSON.parse(JSON.stringify(frame))), bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
    if (bytes > this.config.maxFrameBytes || bytes > this.config.maxBytes) throw new TransportError('frame-too-large')
    this.frames.push({ cursor: ++this.nextCursor, value, expiresAt: this.config.clock() + this.config.ttlMs, bytes }); this.bytes += bytes
    this.prune()
    for (const listener of [...this.listeners]) listener()
  }
  private prune(): void {
    while (this.frames.length > 0 && (this.frames[0]!.expiresAt <= this.config.clock() || this.frames.length > this.config.maxFrames || this.bytes > this.config.maxBytes)) {
      const old = this.frames.shift()!; this.bytes -= old.bytes; this.dropped = old.cursor
    }
  }
  /** @param after - last received transport sequence. @returns retained suffix, or a visible reset requirement. */
  read(after: number): readonly { readonly cursor: number; readonly value: JsonValue }[] {
    if (this.closed) throw new TransportError('closed')
    this.prune()
    if (after > this.nextCursor) throw new TransportError('cursor-ahead')
    if (after < this.dropped) throw new TransportError('reset-required')
    return this.frames.filter(frame => frame.cursor > after).map(frame => ({ cursor: frame.cursor, value: structuredClone(frame.value) }))
  }
  /** @param after - cursor inspected before subscribing. @param signal - stream lifetime. @returns on a new frame or rejects on closure/cancel; subscription and recheck avoid a lost wake-up. */
  wait(after: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => { this.listeners.delete(changed); signal.removeEventListener('abort', aborted) }
      const changed = () => { cleanup(); if (this.closed) reject(new TransportError('closed')); else resolve() }
      const aborted = () => { cleanup(); reject(new TransportError('cancelled')) }
      this.listeners.add(changed); signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) aborted(); else if (this.closed || this.nextCursor !== after) changed()
    })
  }
  /** Release waiters; this journal owns no model cancellation. */
  close(): void { this.closed = true; for (const listener of [...this.listeners]) listener() }
}
/** Live service handles are supplied by the isolated composition; the HTTP carrier remains a separate owner. */
export interface MobileBffConfig {
  readonly adapter: ScopedDesktopExecutor
  readonly registry: DesktopCommandAuthorizer
  readonly journal: FollowJournal
  readonly desktopId: DesktopId
  readonly deviceId: DeviceId
  readonly instance: WireInstance
  readonly mode?: WireItem['mode']
  readonly audit?: CommandAudit
}
/** Only request and follow are available to the carrier; no caller-selected Gateway namespace crosses HTTP. */
export class MobileBffCore {
  private readonly mode: WireItem['mode']
  private elapsed = 0
  private futureLimit = 0
  private lastExpiry: CommandExpiry | null = null
  /** @param config - explicit fixture scope and original admission/follow owners; creates no Context or service registration. */
  constructor(private readonly config: MobileBffConfig) { this.mode = resolveBffMode(config.mode) }
  /** @returns bounded desktop-only rejection diagnostics; payloads, identities and credentials are excluded. */
  get commandExpiryReport() { return { elapsed: this.elapsed, futureLimit: this.futureLimit, last: this.lastExpiry === null ? null : { ...this.lastExpiry } } }
  private recordExpiry(error: unknown): void {
    if (!(error instanceof CommandExpiryError)) return
    if (error.timing.reason === 'elapsed') this.elapsed++; else this.futureLimit++
    this.lastExpiry = { ...error.timing }
  }
  private async handle(packet: string): Promise<JsonValue> {
    try { return jsonPayload(await this.config.adapter.handle(packet)) }
    catch (error) { this.auditExpiry(packet, error, 'adapter-rejected'); this.recordExpiry(error); throw error }
  }
  private auditExpiry(packet: string, error: unknown, stage: 'checked' | 'adapter-rejected'): void {
    if (!(error instanceof CommandExpiryError) || !this.config.audit) return
    const value = fields(JSON.parse(packet), ['protocol', 'desktopId', 'deviceId', 'grantEpoch', 'commandId', 'expiresAt', 'operation', 'payload'])
    this.config.audit.record({ stage, commandId: id<'mobile-command'>(text(value.commandId)), expiresAt: error.timing.expiresAt, at: error.timing.checkedAt, outcome: error.timing.reason })
  }
  private command(packet: string): MobileCommand {
    let command: MobileCommand, checkedAt = 0
    try { command = parseCommand(packet, { ...this.config.adapter.config, clock: () => { checkedAt = this.config.adapter.config.clock(); return checkedAt } }) }
    catch (error) { this.auditExpiry(packet, error, 'checked'); this.recordExpiry(error); throw error }
    this.config.audit?.record({ stage: 'checked', commandId: command.commandId, expiresAt: command.expiresAt, at: checkedAt, outcome: 'admitted' })
    if (command.desktopId !== this.config.desktopId || command.deviceId !== this.config.deviceId) throw new LinkError('scope-denied')
    this.config.registry.authorize(command)
    return command
  }
  /** @param packet - exact mobile command JSON. @param signal - caller wait lifetime. @returns bounded domain JSON after the restricted adapter completes. */
  async request(packet: string, signal: AbortSignal): Promise<JsonValue> {
    if (signal.aborted) throw new TransportError('cancelled')
    this.command(packet)
    // Transport cancellation never cancels an accepted desktop task; receipts resolve unknown delivery.
    return this.handle(packet)
  }
  /** @param packet - session.sync command JSON. @param resume - untrusted generation/cursor hint. @param signal - subscriber lifetime. @returns reset snapshot or retained/live frames owned by the native-selected Session. */
  async *follow(packet: string, resume: unknown, signal: AbortSignal): AsyncIterable<WireItem> {
    const command = this.command(packet)
    if (command.operation !== 'session.sync') throw new LinkError('scope-denied')
    const payload = fields(command.payload, ['sessionId', 'afterSeq'])
    if (payload.afterSeq !== -1) natural(payload.afterSeq)
    if (payload.sessionId !== this.config.journal.owner) throw new LinkError('scope-denied')
    this.config.registry.authorize(command, this.config.journal.owner)
    const hint = parseResume(resume)
    let cursor = hint.relayCursor, reset = hint.instance !== this.config.instance
    if (!reset) {
      try { this.config.journal.read(cursor) }
      catch (error) { if (!(error instanceof TransportError) || error.code !== 'reset-required') throw error; reset = true }
    }
    const item = (kind: WireItem['kind'], relayCursor: number, value: JsonValue): WireItem => ({ protocol: 'dsh-mobile-wire/1', mode: this.mode,
      kind, desktopId: this.config.desktopId, deviceId: this.config.deviceId, sessionId: this.config.journal.owner,
      instance: this.config.instance, relayCursor, payload: value })
    if (reset) {
      cursor = this.config.journal.cursor
      yield item('reset', cursor, await this.handle(packet))
    }
    while (!signal.aborted) {
      this.config.registry.authorize(command, this.config.journal.owner)
      for (const frame of this.config.journal.read(cursor)) {
        if (signal.aborted) throw new TransportError('cancelled')
        this.config.registry.authorize(command, this.config.journal.owner)
        yield item('event', frame.cursor, frame.value); cursor = frame.cursor
      }
      await this.config.journal.wait(cursor, signal)
    }
  }
}

function resolveBffMode(mode: WireItem['mode'] | undefined): WireItem['mode'] { return mode === undefined ? 'fixed-replay' : mode }

/** Existing Remote Service delegates to the shared transport-independent owner. */
export class MobileBff extends TypertRemoteService {
  private readonly core: MobileBffCore
  /** @param ctx - actual Gateway/Session owner. @param config - fixture-selected capability scope. */
  constructor(ctx: Context, config: MobileBffConfig) { super(ctx, 'harmonyMobile', { namespace: 'harmonyMobile' }); this.core = new MobileBffCore(config) }
  /** @returns bounded desktop-only expiry diagnostics from the shared request owner. */
  get commandExpiryReport() { return this.core.commandExpiryReport }
  /** @param packet - exact mobile command JSON. @param signal - caller wait lifetime. @returns original restricted adapter result. */
  @Remote
  request(packet: string, signal: AbortSignal): Promise<JsonValue> { return this.core.request(packet, signal) }
  /** @param packet - session.sync command. @param resume - generation/cursor hint. @param signal - subscriber lifetime. @returns shared reset/retained/live frames. */
  @Remote({ mode: 'stream' })
  follow(packet: string, resume: unknown, signal: AbortSignal): AsyncIterable<WireItem> { return this.core.follow(packet, resume, signal) }
}
declare module '@deepseek-ai/cordis' { interface Context { harmonyMobile: MobileBff } }

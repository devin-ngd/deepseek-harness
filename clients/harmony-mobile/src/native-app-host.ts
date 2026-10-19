/** App-owned ESM orchestrator; ArkUI owns selection/commands and the opaque iframe owns only rich SDK operations. */
import type { JsonValue } from './upstream.ts'
import type { DomainLimits } from './domain.ts'
import { object, string, integer, decodeRich } from './domain.ts'
import type { ReadLimits } from './read-protocol.ts'
import { PhoneCore } from './phone-core.ts'
import { SemanticPhone } from './semantic-phone.ts'
import { PhoneLibrary, MessageWindow } from './phone-library.ts'
import { BrowserRichRenderer, MOBILE_RENDERER_VERSION } from './rich-renderer.ts'
import type { NativeProvider, CommandGeneration } from './phone-core.ts'
import type { FollowPolicy } from './follow-policy.ts'
import type { NativeIo, NativePortPolicy, NativeUiCommand } from './native-port.ts'
import { nativeUiCommand } from './native-port.ts'
import { canonical, id } from './protocol.ts'
import { TransportError } from './wire.ts'
import { CommandEpochClock, resolveCommandLifetime } from './command-clock.ts'
import type { CommandClockPolicy, CommandLifetime } from './command-clock.ts'

/** Explicit owner settings; all fields are HAP-owned, never supplied by generated content. */
export interface NativeHostPolicy {
  readonly port: NativePortPolicy; readonly domain: DomainLimits; readonly read: ReadLimits
  readonly maxRows: number; readonly maxFrames: number; readonly chunkBytes: number; readonly maxIntents: number
  readonly maxMounts: number; readonly cacheAgeMs: number; readonly ttlMs: number
  readonly follow: FollowPolicy
  readonly commandClock: CommandClockPolicy
}
/** Native display DTO derives from the shared semantic model and MessageWindow, without another reducer. */
export interface NativeHostView {
  readonly desktopId: string; readonly sessionId: string; readonly task: string; readonly connection: string; readonly error: string
  readonly readOnly: boolean; readonly hasMore: boolean; readonly totalMessages: number; readonly offline: boolean
  readonly messages: readonly { readonly id: string; readonly role: string; readonly text: string; readonly hasRich: boolean; readonly hasImage: boolean; readonly imageWidth: number; readonly imageHeight: number }[]
}
/** Trusted native-selected connection, separate from guest display and IO. */
export interface NativeHostConnection { readonly provider: NativeProvider; readonly owner: SemanticPhone['owner']; readonly mode: 'synthetic-only' | 'fixed-replay'; metrics(): { tasks: number; actions: number; mounts: number }; /** Trusted in-process diagnostic observer; never supplied by generated content. @param core - this connection's shared orchestrator. */ observeCore?(core: PhoneCore): void; /** @param value - local command timing without payloads. */ observeCommand?(value: CommandGeneration): void }
/** Factory selects a provider only after native UI Session admission. */
export type NativeHostFactory = (io: NativeIo, sessionId: string, policy: NativeHostPolicy) => NativeHostConnection
/** Private app runtime. Disconnect retains only display/cache selection; reconnect or close discards it. Native IO and control methods are never attached to window or the guest. */
export class NativeAppHost {
  private connection: NativeHostConnection | undefined
  private core: PhoneCore | undefined
  private displayCore: PhoneCore | undefined
  private library: PhoneLibrary | undefined
  private followAbort: AbortController | undefined
  private following: Promise<void> | undefined
  private renderer: BrowserRichRenderer | undefined
  private mountedKey = ''
  private mountedId = ''
  private mountedInstance: string | null = null
  private renderTail: Promise<void> = Promise.resolve()
  private runtimeFailure = ''
  private commandCounter = 0
  private readonly commandPrefix = crypto.randomUUID()
  private tail: Promise<unknown> = Promise.resolve()
  private readonly calls = new Map<string, { fingerprint: string; result: Promise<JsonValue> }>()
  private closed = false
  private readonly window: MessageWindow
  private readonly commandClock: CommandEpochClock
  private readonly commandLifetime: CommandLifetime
  /** @param io - bound app-native cache/byte port. @param policy - immutable HAP settings. @param publish - app-owned UI port. @param frame - isolated rich carrier, absent in unit tests. @param sessions - exact native-owned Session allowlist. @param connect - trusted provider factory, never supplied by a guest. */
  constructor(private readonly io: NativeIo, readonly policy: NativeHostPolicy, private readonly publish: (view: NativeHostView) => void, private readonly frame: HTMLIFrameElement | undefined, private readonly sessions: readonly string[], private readonly connect: NativeHostFactory) {
    for (const value of [policy.maxRows, policy.maxFrames, policy.chunkBytes, policy.maxIntents, policy.maxMounts, policy.cacheAgeMs, policy.ttlMs]) integer(value, 1)
    this.commandLifetime = resolveCommandLifetime(policy.ttlMs, policy.commandClock)
    this.commandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, policy.commandClock.maxWallDriftMs)
    this.window = new MessageWindow(policy.maxRows)
  }
  /** @param raw - native UI packet. @returns a deduplicated command result; a conflict cannot execute. */
  receive(raw: string): Promise<JsonValue> {
    if (this.closed) return Promise.reject(new TransportError('closed'))
    let command: NativeUiCommand
    try { command = nativeUiCommand(raw, this.policy.port) } catch (error) { return Promise.reject(error) }
    const fingerprint = canonical(command), previous = this.calls.get(command.id)
    if (previous) return previous.fingerprint === fingerprint ? previous.result : Promise.reject(new TransportError('id-conflict'))
    if (this.calls.size >= this.policy.maxIntents) return Promise.reject(new TransportError('native-intent-full'))
    const result = this.tail.then(() => this.execute(command))
    this.tail = result.then(() => undefined, () => undefined)
    this.calls.set(command.id, { fingerprint, result }); return result
  }
  private storage() {
    return { read: async (maxBytes: number) => { const value = await this.io.request('cache.read', { maxBytes }); return value === null ? null : string(value, maxBytes) },
      write: async (text: string) => { await this.io.request('cache.write', { text }) }, clear: async () => { await this.io.request('cache.clear', {}) } }
  }
  private async execute(command: NativeUiCommand): Promise<JsonValue> {
    const payload = object(command.payload)
    if (!['connect.demo', 'submit'].includes(command.method) && Object.keys(payload).length !== 0) throw new TransportError('native-packet-invalid')
    switch (command.method) {
      case 'connect.demo': {
        if (Object.keys(payload).length !== 1 || !this.sessions.includes(string(payload.sessionId, 128))) throw new TransportError('scope-denied')
        await this.disconnect(false)
        this.runtimeFailure = ''
        const connection = this.connect(this.io, string(payload.sessionId, 128), this.policy), provider = connection.provider
        this.connection = connection
        const model = new SemanticPhone(connection.owner, this.policy.domain, this.policy.maxFrames)
        this.core = new PhoneCore(provider, model, { follow: this.policy.follow, grantEpoch: 1, ttlMs: this.commandLifetime.wireTtlMs, clock: () => this.commandClock.now(), nextCommandId: () => id<'mobile-command'>('native-core-' + this.commandPrefix + '-' + ++this.commandCounter), maxMounts: this.policy.maxMounts, maxIntents: this.policy.maxIntents, ...(connection.observeCommand ? { observeCommand: connection.observeCommand } : {}) })
        this.displayCore = this.core
        this.library = new PhoneLibrary(this.core, model, this.policy.read, () => Date.now(), 1, this.policy.cacheAgeMs)
        const core = this.core, abort = new AbortController(); this.followAbort = abort
        connection.observeCore?.(core)
        const ready = new Promise<void>((accept, reject) => {
          this.following = (async () => { try { for await (const view of core.follow(abort.signal)) { void view; if (this.core !== core) return; this.emit(); this.scheduleRich(core); accept() } } catch (error) { reject(error); if (!abort.signal.aborted && this.core === core) { this.runtimeFailure = error instanceof TransportError ? error.code : 'native-stream-failed'; this.emit() } } })()
        })
        await ready; return { connected: true, mode: connection.mode }
      }
      case 'submit': {
        if (Object.keys(payload).length !== 2) throw new TransportError('native-packet-invalid')
        const core = this.requireCore(), value = await core.submit(string(payload.requestId, 128), string(payload.text, 4096)); this.scheduleRich(core); await this.renderTail; this.emit(); return value
      }
      case 'cancel': await this.requireCore().cancel(); this.emit(); return { cancelRequested: true }
      case 'cache.save': await this.requireLibrary().save(this.storage()); return { saved: true }
      case 'cache.restore': {
        await this.stopFollow(); await this.renderTail; await this.renderer?.close(); this.renderer = undefined; this.mountedKey = ''
        if (this.frame) this.frame.srcdoc = ''
        const restored = await this.requireLibrary().restore(this.storage())
        if (!restored) { this.displayCore?.model.disconnect(); this.runtimeFailure = 'native-cache-unavailable' }
        this.emit()
        return { restored, error: this.requireLibrary().cacheError }
      }
      case 'disconnect': await this.disconnect(); return { disconnected: true }
      case 'close': await this.disconnect(false); this.closed = true; return { closed: true }
    }
  }
  private requireCore(): PhoneCore { if (!this.core) throw new TransportError('unpaired'); if (this.runtimeFailure) throw new TransportError(this.runtimeFailure); return this.core }
  private requireLibrary(): PhoneLibrary { if (!this.library) throw new TransportError('unpaired'); return this.library }
  private emit(): void {
    if (!this.displayCore) return
    const view = this.displayCore.model.view, rows = this.window.update(view.messages.filter(message => message.role !== 'context'))
    const messages = rows.rows.map(message => { const image = message.parts.find(part => part.kind === 'image'); return { id: message.id, role: message.role, text: message.parts.flatMap(part => part.kind === 'text' ? [part.text] : []).join('\n'), hasRich: message.rich.length > 0, hasImage: image !== undefined, imageWidth: image?.width ?? 0, imageHeight: image?.height ?? 0 } })
    if (view.liveText) messages.push({ id: 'native-live-' + view.sessionId, role: 'assistant', text: view.liveText, hasRich: false, hasImage: false, imageWidth: 0, imageHeight: 0 })
    this.publish({ desktopId: view.desktopId, sessionId: view.sessionId, task: view.task, connection: view.connection, error: this.runtimeFailure || view.error || '', readOnly: !this.core || view.readOnly || this.runtimeFailure !== '', messages, hasMore: view.hasMore, totalMessages: rows.total, offline: view.notices.includes('offline-cache') })
  }
  private scheduleRich(core: PhoneCore): void {
    this.renderTail = this.renderTail.then(() => this.rich(core)).catch((error: unknown) => { void error; if (this.core === core) { this.runtimeFailure = 'native-rich-failed'; this.emit() } })
  }
  private async rich(core: PhoneCore): Promise<void> {
    if (this.core !== core || this.runtimeFailure) return
    const reference = core.model.view.messages.flatMap(message => message.rich)[0]
    if (!reference || !this.frame || core.model.view.readOnly) return
    const key = reference.sessionId + '/' + reference.messageId + '/' + reference.blockId
    const instance = core.model.resume.instance
    if (key === this.mountedKey && instance === this.mountedInstance && this.renderer && this.mountedId) {
      const snapshot = decodeRich(await core.request('rich.snapshot', { mountId: this.mountedId }), reference, this.policy.domain)
      if (this.renderer.update(snapshot)) return
    }
    await this.renderer?.close()
    this.renderer = new BrowserRichRenderer(this.frame, { request: async (operation, payload) => { const value = await core.request(operation, payload); this.emit(); return value } }, { rendererVersion: MOBILE_RENDERER_VERSION, packetBytes: this.policy.domain.maxBytes, maxPackets: this.policy.maxFrames })
    const mount = await core.mount(reference)
    await this.renderer.open(mount); this.mountedKey = key; this.mountedId = mount.mountId; this.mountedInstance = instance
  }
  private async stopFollow(): Promise<void> { this.followAbort?.abort(); await this.following; this.followAbort = undefined; this.following = undefined }
  private async disconnect(publish = true): Promise<void> {
    const display = this.core ?? this.displayCore
    this.displayCore = undefined
    await this.stopFollow(); await this.renderTail; await this.renderer?.close(); this.renderer = undefined; this.mountedKey = ''; this.mountedId = ''; this.mountedInstance = null
    if (this.frame) this.frame.srcdoc = ''
    await this.core?.close(); this.core?.model.disconnect()
    this.core = undefined; this.connection = undefined
    if (publish) { this.displayCore = display; this.emit() }
    else this.library = undefined
  }
  /** @returns owner-provided admission and lease metrics; no provider state can be changed through them. */
  get metrics() { return this.connection?.metrics() ?? { tasks: 0, actions: 0, mounts: 0 } }
  /** Revoke UI routing, settle owned work and dispose rich leases before the native IO port closes. */
  async close(): Promise<void> { this.closed = true; await this.tail; await this.disconnect(false); this.calls.clear() }
}

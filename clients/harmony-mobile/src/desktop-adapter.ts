/** Restricted forwarding adapter. Canonical DSH service types are reused; the adapter owns no rich ledger. */
import { canonical, id } from './protocol.ts'
import type { SessionId, DesktopId } from './protocol.ts'
import { fields, natural, text, LinkError, parseCommand } from './link-protocol.ts'
import type { MobileCommand, DeviceId, LinkConfig, MockDeviceRegistry } from './link-protocol.ts'
import type { AdmissionJournal, AdmissionRecord } from './admission-journal.ts'
import { admissionKey } from './admission-journal.ts'
import type { RestrictedReads } from './read-adapter.ts'
import type { JsonValue } from './upstream.ts'
import { parseActionRequest, parseInvokeRequest, parseSaveDraftRequest } from './upstream.ts'
import type {
  RichMountRequest, RichMountValue, RichMountRequestId, RichSnapshot, RichSaveDraftRequest, RichInvokeRequest,
  RichReceipt, RichActionRequest, RichActionStatus, SessionPromptRequest, SessionPromptValue,
  SessionRequestId, SessionCancelRequest, SessionCancelValue, SessionFollowRequest, SessionFollowFrame,
} from './upstream.ts'

/** Canonical methods called on existing service owners. Future real activation needs its own permission and composition qualification. */
export interface DesktopOperationPorts {
  readonly session: {
    prompt(request: SessionPromptRequest, signal: AbortSignal): Promise<SessionPromptValue>
    cancel(request: SessionCancelRequest): SessionCancelValue | Promise<SessionCancelValue>
    follow(request: SessionFollowRequest, signal: AbortSignal): AsyncIterable<SessionFollowFrame>
    /** Reads receipt evidence only; absence never authorizes automatic dispatch after an unknown outcome. */
    findPromptReceipt(sessionId: SessionId, requestId: SessionRequestId): Promise<'accepted' | 'absent' | 'unavailable'>
  }
  readonly rich: {
    mount(request: RichMountRequest): Promise<RichMountValue>
    snapshot(request: RichMountRequestId): Promise<RichSnapshot>
    saveDraft(request: RichSaveDraftRequest): Promise<RichReceipt>
    invoke(request: RichInvokeRequest): Promise<RichReceipt>
    status(request: RichActionRequest): Promise<RichActionStatus | null>
    dispose(request: RichMountRequestId): Promise<void>
  }
  readonly approvals: { list(sessionId: SessionId): Promise<readonly ApprovalView[]> }
}
/** Fixture-only service composition; the public fixture adapter keeps its original activation guard. */
export interface DesktopServicePorts extends DesktopOperationPorts { readonly environment: 'synthetic-only' }
/** Current command authorization owned by a fixture registry or an authenticated profile peer. */
export interface DesktopCommandAuthorizer {
  /** @param command - parsed mobile envelope. @param sessionId - optional requested owner. Throws before dispatch or delivery when current authority is absent. */
  authorize(command: MobileCommand, sessionId?: SessionId): void
  /** @param callback - mount/follow cleanup owner. @returns disposer for its revocation listener. */
  onRevoke(callback: (deviceId: DeviceId) => Promise<void>): () => void
}
/** Display-only pending approval; generated content cannot answer it through this protocol. */
export interface ApprovalView {
  readonly approvalId: string
  readonly revision: number
  readonly summary: string
  readonly expiresAt: number
  readonly state: 'pending' | 'expired' | 'cancelled'
}
interface Lease { readonly deviceId: DeviceId; readonly epoch: number; readonly sessionId: SessionId; readonly hostMountId: RichMountValue['mountId']; readonly renderRevision: number }
/** Stable mobile receipt state is distinct from a DSH turn's completion. */
export interface AdmissionView { readonly accepted: boolean; readonly state: 'accepted' | 'unknown'; readonly requestId: SessionRequestId }
/** Detached results on the typed in-memory fixture transport. A future network transport needs a response parser. */
export type MobileResult = AdmissionView | SessionCancelValue | SessionFollowFrame | RichMountValue | RichSnapshot
  | RichReceipt | RichActionStatus | null | { readonly disposed: true } | readonly ApprovalView[] | { readonly mobileRead: JsonValue }

/** Sole bounded mobile request executor. Unsupported operations fail here before service calls. */
export abstract class ScopedDesktopExecutor {
  private readonly leases = new Map<string, Lease>()
  private readonly pending = new Map<string, { readonly record: AdmissionRecord; readonly result: Promise<AdmissionView> }>()
  private readonly commands = new Map<string, { readonly expiresAt: number; readonly fingerprint: string; readonly result: Promise<MobileResult> }>()
  private readonly inFlight = new Set<Promise<unknown>>()
  private readonly lifetimes = new Set<AbortController>()
  private readonly deviceLifetimes = new Map<AbortController, DeviceId>()
  private readonly stopRevoke: () => void
  private nextLease = 0
  private pendingMounts = 0
  private closed = false

  /** @param desktopId - expected execution owner. @param services - isolated canonical service ports. @param devices - fixture grant owner. @param config - bounded command policy. @param journal - sole admission writer; persistence must precede dispatch. @param reads - optional read capability; absence rejects read requests. */
  protected constructor(readonly desktopId: DesktopId, private readonly services: DesktopOperationPorts,
    private readonly devices: DesktopCommandAuthorizer, readonly config: LinkConfig, private readonly journal: AdmissionJournal, private readonly reads?: RestrictedReads) {
    this.stopRevoke = devices.onRevoke(async deviceId => {
      for (const [lifetime, owner] of this.deviceLifetimes) if (owner === deviceId) lifetime.abort()
      const owned = [...this.leases].filter(([, lease]) => lease.deviceId === deviceId)
      await this.disposeLeases(owned)
      for (const key of this.commands.keys()) if (key.startsWith(deviceId + '/')) this.commands.delete(key)
    })
  }

  /** @param raw - untrusted complete packet. @returns bounded operation result; lost admission remains unknown until read-only evidence resolves it. */
  handle(raw: string): Promise<MobileResult> {
    if (this.closed) return Promise.reject(new LinkError('closed'))
    let command: MobileCommand
    try {
      command = parseCommand(raw, this.config)
      if (command.desktopId !== this.desktopId) throw new LinkError('scope-denied')
      this.devices.authorize(command)
    } catch (error) { return Promise.reject(error) }
    const key = command.deviceId + '/' + command.commandId, fingerprint = canonical(command)
    for (const [cachedKey, entry] of this.commands) if (entry.expiresAt <= this.config.clock()) this.commands.delete(cachedKey)
    const old = this.commands.get(key)
    if (old !== undefined) return old.fingerprint === fingerprint ? old.result : Promise.reject(new LinkError('id-conflict'))
    if (this.commands.size >= this.config.maxCachedCommands) return Promise.reject(new LinkError('queue-full'))
    const result = this.execute(command).then(async value => {
      try {
        this.devices.authorize(command)
        if (new TextEncoder().encode(JSON.stringify(value)).byteLength > this.config.maxPacketBytes) throw new LinkError('queue-full')
        return structuredClone(value)
      } catch (error) {
        this.reads?.discardUndelivered(command)
        // A mount whose reply cannot be delivered has no reachable phone owner.
        if (command.operation === 'rich.mount' && value !== null && typeof value === 'object' && 'mountId' in value) {
          const lease = this.leases.get(value.mountId)
          if (lease !== undefined) await this.disposeLeases([[value.mountId, lease]])
        }
        throw error
      }
    })
    this.commands.set(key, { fingerprint, result, expiresAt: command.expiresAt })
    this.inFlight.add(result)
    // Each caller owns its operation failure; teardown only waits for quiescence.
    void result.then(() => this.inFlight.delete(result), () => this.inFlight.delete(result))
    return result
  }
  /** @param mountId - untrusted opaque mount selector. @returns whether this executor issued that lifetime; callers must still authorize the owning peer/session before using it. */
  ownsMount(mountId: unknown): boolean { return typeof mountId === 'string' && this.leases.has(mountId) }

  private scoped(command: MobileCommand, value: unknown): SessionId {
    const sessionId = id<'SessionId'>(text(value))
    this.devices.authorize(command, sessionId)
    return sessionId
  }
  private lease(command: MobileCommand, mountId: unknown): Lease {
    const lease = this.leases.get(text(mountId))
    if (lease === undefined) throw new LinkError('stale-mount')
    if (lease.deviceId !== command.deviceId || lease.epoch !== command.grantEpoch) throw new LinkError('scope-denied')
    this.devices.authorize(command, lease.sessionId)
    return lease
  }
  private async execute(command: MobileCommand): Promise<MobileResult> {
    switch (command.operation) {
      case 'read.projects': case 'read.sessions': case 'read.history': case 'image.open': case 'image.read': case 'image.close': {
        if (this.reads === undefined) throw new LinkError('read-disabled')
        return { mobileRead: await this.reads.handle(command) }
      }
      case 'task.submit': {
        const payload = fields(command.payload, ['sessionId', 'requestId', 'text'])
        const sessionId = this.scoped(command, payload.sessionId)
        const request: SessionPromptRequest = { sessionId, requestId: id<'session-request-id'>(text(payload.requestId)), mode: 'queue', content: [{ type: 'text', text: text(payload.text) }] }
        return this.submit(command, request)
      }
      case 'task.receipt': {
        const payload = fields(command.payload, ['sessionId', 'requestId'])
        const sessionId = this.scoped(command, payload.sessionId), requestId = id<'session-request-id'>(text(payload.requestId))
        return this.reconcile(command.deviceId, sessionId, requestId)
      }
      case 'session.cancel': {
        const payload = fields(command.payload, ['sessionId'])
        return this.services.session.cancel({ sessionId: this.scoped(command, payload.sessionId) })
      }
      case 'session.sync': {
        const payload = fields(command.payload, ['sessionId', 'afterSeq'])
        const sessionId = this.scoped(command, payload.sessionId)
        if (payload.afterSeq !== -1) natural(payload.afterSeq)
        const lifetime = new AbortController(); this.lifetimes.add(lifetime); this.deviceLifetimes.set(lifetime, command.deviceId)
        const iterator = this.services.session.follow({ address: { kind: 'session', sessionId }, assistantStream: true }, lifetime.signal)[Symbol.asyncIterator]()
        try {
          const first = await iterator.next()
          if (first.done || first.value.type !== 'snapshot' || first.value.header.id !== sessionId) throw new LinkError('invalid-packet')
          return first.value
        } finally { lifetime.abort(); await iterator.return?.(); this.lifetimes.delete(lifetime); this.deviceLifetimes.delete(lifetime) }
      }
      case 'rich.mount': {
        const payload = fields(command.payload, ['sessionId', 'messageId', 'blockId', 'guestProtocol'])
        if (payload.guestProtocol !== 'lumina-rich/1') throw new LinkError('protocol-mismatch')
        const sessionId = this.scoped(command, payload.sessionId)
        if (this.leases.size + this.pendingMounts >= this.config.maxMountedBlocks) throw new LinkError('queue-full')
        this.pendingMounts++
        try {
          const mounted = await this.services.rich.mount({ sessionId, messageId: id<'MessageId'>(text(payload.messageId)), blockId: id<'rich-inline-block'>(text(payload.blockId)) })
          const mountId = id<'rich-inline-mount'>('mobile-mount-' + ++this.nextLease)
          const lease: Lease = { deviceId: command.deviceId, epoch: command.grantEpoch, sessionId,
            hostMountId: mounted.mountId, renderRevision: mounted.snapshot.scope.renderRevision }
          this.leases.set(mountId, lease)
          try {
            if (this.closed) throw new LinkError('closed')
            this.devices.authorize(command, sessionId)
          } catch (error) { await this.disposeLeases([[mountId, lease]]); throw error }
          return { mountId, snapshot: mounted.snapshot }
        } finally { this.pendingMounts-- }
      }
      case 'rich.snapshot': case 'rich.dispose': {
        const payload = fields(command.payload, ['mountId'])
        const lease = this.lease(command, payload.mountId)
        if (command.operation === 'rich.dispose') {
          await this.disposeLeases([[text(payload.mountId), lease]]); return { disposed: true }
        }
        return this.services.rich.snapshot({ sessionId: lease.sessionId, mountId: lease.hostMountId })
      }
      case 'rich.saveDraft': {
        const payload = fields(command.payload, ['mountId', 'draft']), lease = this.lease(command, payload.mountId)
        const request = parseSaveDraftRequest({ ...payload, sessionId: lease.sessionId })
        if (request === null) throw new LinkError('invalid-packet')
        return this.services.rich.saveDraft({ ...request, mountId: lease.hostMountId })
      }
      case 'rich.invoke': {
        const payload = fields(command.payload, ['mountId', 'draft', 'actionId', 'actionName', 'targetActionId', 'expectedDataRevision', 'values', 'fileGrants']), lease = this.lease(command, payload.mountId)
        const request = parseInvokeRequest({ ...payload, sessionId: lease.sessionId })
        if (request === null) throw new LinkError('invalid-packet')
        return this.services.rich.invoke({ ...request, mountId: lease.hostMountId })
      }
      case 'rich.status': {
        const payload = fields(command.payload, ['mountId', 'actionId']), lease = this.lease(command, payload.mountId)
        const request = parseActionRequest({ ...payload, sessionId: lease.sessionId })
        if (request === null) throw new LinkError('invalid-packet')
        return this.services.rich.status({ ...request, mountId: lease.hostMountId })
      }
      case 'approval.list': {
        const payload = fields(command.payload, ['sessionId'])
        return this.services.approvals.list(this.scoped(command, payload.sessionId))
      }
    }
  }
  private submit(command: MobileCommand, request: SessionPromptRequest): Promise<AdmissionView> {
    const key = admissionKey(request.sessionId, request.requestId)
    const record: AdmissionRecord = { desktopId: this.desktopId, sessionId: request.sessionId, requestId: request.requestId,
      deviceId: command.deviceId, fingerprint: canonical(request), state: 'submitting' }
    const pending = this.pending.get(key)
    if (pending !== undefined) {
      try { this.sameIntent(pending.record, record) } catch (error) { return Promise.reject(error) }
      return pending.result
    }
    const operation = (async (): Promise<AdmissionView> => {
      const claim = await this.journal.claim(record)
      this.sameIntent(claim.record, record)
      if (!claim.created) return this.reconcile(command.deviceId, request.sessionId, request.requestId)
      // Revocation or expiry during the durable claim leaves an uncertain record without dispatch.
      this.devices.authorize(command, request.sessionId)
      if (this.closed) throw new LinkError('closed')
      const lifetime = new AbortController(); this.lifetimes.add(lifetime); this.deviceLifetimes.set(lifetime, command.deviceId)
      try {
        await this.services.session.prompt(request, lifetime.signal)
        await this.journal.accept(record)
        return { accepted: true, state: 'accepted', requestId: request.requestId }
      } catch (error) { throw new LinkError('unknown-outcome', { cause: error }) }
      finally { this.lifetimes.delete(lifetime); this.deviceLifetimes.delete(lifetime) }
    })().finally(() => { this.pending.delete(key) })
    this.pending.set(key, { record, result: operation })
    return operation
  }
  private sameIntent(old: AdmissionRecord, current: AdmissionRecord): void {
    if (old.desktopId !== current.desktopId || old.deviceId !== current.deviceId) throw new LinkError('scope-denied')
    if (old.fingerprint !== current.fingerprint) throw new LinkError('id-conflict')
  }
  private async reconcile(deviceId: DeviceId, sessionId: SessionId, requestId: SessionRequestId): Promise<AdmissionView> {
    let record = await this.journal.get(sessionId, requestId)
    if (record === undefined) return { accepted: false, state: 'unknown', requestId }
    if (record.desktopId !== this.desktopId || record.deviceId !== deviceId) throw new LinkError('scope-denied')
    if (record.state !== 'accepted') {
      const evidence = await this.services.session.findPromptReceipt(sessionId, requestId)
      if (evidence === 'accepted') { await this.journal.accept(record); record = { ...record, state: 'accepted' } }
    }
    return { accepted: record.state === 'accepted', state: record.state === 'accepted' ? 'accepted' : 'unknown', requestId }
  }
  /** Await release of every mapped host mount and abort active reads. Existing durable work belongs to the desktop. */
  async close(): Promise<void> {
    if (this.closed && this.leases.size === 0) return
    if (!this.closed) { this.closed = true; this.stopRevoke() }
    for (const lifetime of this.lifetimes) lifetime.abort()
    this.reads?.close()
    await Promise.allSettled([...this.inFlight])
    await this.disposeLeases([...this.leases])
  }
  private async disposeLeases(entries: readonly (readonly [string, Lease])[]): Promise<void> {
    const results = await Promise.allSettled(entries.map(async ([key, lease]) => {
      await this.services.rich.dispose({ sessionId: lease.sessionId, mountId: lease.hostMountId })
      this.leases.delete(key)
    }))
    const rejected = results.find(result => result.status === 'rejected')
    if (rejected?.status === 'rejected') throw rejected.reason
  }
}

/** Fixture executor retains its synthetic-only guard; production adapters use an independently authenticated authorizer. */
export class RestrictedDesktopAdapter extends ScopedDesktopExecutor {
  /** @param desktopId - expected fixture owner. @param services - isolated canonical ports. @param devices - fixture grants. @param config - explicit bounds. @param journal - sole intent writer. @param reads - optional fixture read ports. */
  constructor(desktopId: DesktopId, services: DesktopServicePorts, devices: MockDeviceRegistry, config: LinkConfig, journal: AdmissionJournal, reads?: RestrictedReads) {
    if (services.environment !== 'synthetic-only') throw new LinkError('mock-only')
    super(desktopId, services, devices, config, journal, reads)
  }
}

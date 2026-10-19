/** Scoped read provider composes maintained DSH list/page/attachment services; it never dispatches a task or accepts a host path. */
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { SessionListValue, SessionPage, SessionPageRequest } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment/types'
import type { MobileCommand, MockDeviceRegistry, DeviceId } from './link-protocol.ts'
import { fields, text, natural, LinkError } from './link-protocol.ts'
import type { SessionId } from './protocol.ts'
import type { JsonValue } from './upstream.ts'
import type { ReadLimits, CatalogPage, ImageLease } from './read-protocol.ts'
import { validateReadLimits } from './read-protocol.ts'
import { id } from './protocol.ts'
import { jsonPayload } from './wire.ts'
import { Buffer } from 'node:buffer'

/** Native-selected durable image location; messageSeq is checked against the canonical page, never treated as a path. */
export interface ImageSelection { readonly sessionId: SessionId; readonly messageId: import('./upstream.ts').RichSnapshot['scope']['messageId']; readonly messageSeq: number; readonly throughSeq: number; readonly attachmentId: ImageAttachmentRef['attachmentId'] }
/** Complete read seam; source composition remains explicitly synthetic and guarded. */
export interface ReadServicePorts {
  projects(signal: AbortSignal): Promise<readonly WorkspaceView[]>
  sessions(signal: AbortSignal): Promise<SessionListValue>
  history(request: SessionPageRequest, signal: AbortSignal): Promise<SessionPage>
  imageReference(selection: ImageSelection, signal: AbortSignal): Promise<ImageAttachmentRef | null>
  image(ref: ImageAttachmentRef, signal: AbortSignal): Promise<StoredImageAttachment>
}
interface Snapshot { readonly commandId: MobileCommand['commandId']; readonly deviceId: DeviceId; readonly epoch: number; readonly scope: CatalogPage['scope']; readonly kind: CatalogPage['kind']; readonly id: CatalogPage['snapshotId']; readonly expiresAt: number; readonly pageSize: number; readonly items: CatalogPage['items']; readonly offsets: ReadonlyMap<string, number> }
interface Handle { readonly commandId: MobileCommand['commandId']; readonly deviceId: DeviceId; readonly epoch: number; readonly lease: ImageLease; readonly ref: ImageAttachmentRef; image?: Promise<StoredImageAttachment> }
/** Bounded volatile cursor/handle owner; revoke and close release local capability state without cancelling desktop work. */
export class RestrictedReads {
  private readonly snapshots = new Map<string, Snapshot>()
  private readonly handles = new Map<string, Handle>()
  private readonly active = new Map<AbortController, DeviceId>()
  private pendingSnapshots = 0
  private pendingHandles = 0
  private readonly stopRevoke: () => void
  private closed = false
  /** @param services - existing canonical API owners. @param devices - shared authorization owner. @param limits - explicit memory/expiry policy. @param clock - trusted time. @param token - native opaque identity factory. */
  constructor(private readonly services: ReadServicePorts, private readonly devices: MockDeviceRegistry, readonly limits: ReadLimits, private readonly clock: () => number, private readonly token: () => string) {
    validateReadLimits(limits)
    this.stopRevoke = devices.onRevoke(async deviceId => { for (const [key, value] of this.snapshots) if (value.deviceId === deviceId) this.snapshots.delete(key); for (const [key, value] of this.handles) if (value.deviceId === deviceId) this.handles.delete(key); for (const [controller, owner] of this.active) if (owner === deviceId) controller.abort() })
  }
  /** @returns local resource counts, without credential or host data. */
  get counts(): { snapshots: number; handles: number; active: number } { return { snapshots: this.snapshots.size, handles: this.handles.size, active: this.active.size } }
  private scope(command: MobileCommand, candidate: unknown): SessionId { const sessionId = id<'SessionId'>(text(candidate)); this.devices.authorize(command, sessionId); return sessionId }
  private prune(): void { for (const [key, value] of this.snapshots) if (value.expiresAt <= this.clock()) this.snapshots.delete(key); for (const [key, value] of this.handles) if (value.lease.expiresAt <= this.clock()) this.handles.delete(key) }
  private mint(proposed: ReadonlySet<string> = new Set()): string {
    const value = text(this.token())
    if (proposed.has(value) || this.handles.has(value) || this.snapshots.has(value) || [...this.snapshots.values()].some(snapshot => snapshot.offsets.has(value))) throw new LinkError('id-conflict')
    return value
  }
  /** Release only resources newly minted by an undeliverable command; an older continuation remains owned. @param command - failed reply owner. */
  discardUndelivered(command: MobileCommand): void {
    const owned = (value: Snapshot | Handle): boolean => value.commandId === command.commandId && value.deviceId === command.deviceId && value.epoch === command.grantEpoch
    for (const [key, value] of this.snapshots) if (owned(value)) this.snapshots.delete(key)
    for (const [key, value] of this.handles) if (owned(value)) this.handles.delete(key)
  }
  /** @param command - previously admitted native packet. @returns bounded read value; every path is read-only and scope-checked before source access. */
  async handle(command: MobileCommand): Promise<JsonValue> {
    if (this.closed) throw new LinkError('closed')
    if (!['read.projects', 'read.sessions', 'read.history', 'image.open', 'image.read', 'image.close'].includes(command.operation)) throw new LinkError('scope-denied')
    this.devices.authorize(command); this.prune()
    if (this.active.size >= this.limits.maxInFlight) throw new LinkError('queue-full')
    const catalog = command.operation.startsWith('read.') && command.operation !== 'read.history' && command.payload.cursor === null, image = command.operation === 'image.open'
    if (catalog && this.snapshots.size + this.pendingSnapshots >= this.limits.maxSnapshots || image && this.handles.size + this.pendingHandles >= this.limits.maxImageHandles) throw new LinkError('queue-full')
    if (catalog) this.pendingSnapshots++; if (image) this.pendingHandles++
    const life = new AbortController(); this.active.set(life, command.deviceId)
    try {
      const result = await this.read(command, life.signal)
      this.devices.authorize(command); life.signal.throwIfAborted()
      return result
    } catch (error) { this.discardUndelivered(command); throw error }
    finally { this.active.delete(life); if (catalog) this.pendingSnapshots--; if (image) this.pendingHandles-- }
  }
  private async read(command: MobileCommand, signal: AbortSignal): Promise<JsonValue> {
    if (command.operation === 'read.projects' || command.operation === 'read.sessions') {
      const payload = fields(command.payload, command.operation === 'read.projects' ? ['cursor', 'limit'] : ['cursor', 'limit', 'projectId'])
      const kind = command.operation === 'read.projects' ? 'projects' : 'sessions', scope = kind === 'projects' ? 'projects' : id<'WorkspaceId'>(text(payload.projectId)), limit = natural(payload.limit)
      if (limit < 1 || limit > this.limits.maxPageItems) throw new LinkError('queue-full')
      let snapshot: Snapshot | undefined, offset = 0
      if (payload.cursor !== null) {
        const cursor = text(payload.cursor)
        snapshot = [...this.snapshots.values()].find(value => value.offsets.has(cursor))
        if (snapshot === undefined) throw new LinkError('read-expired')
        if (snapshot.deviceId !== command.deviceId || snapshot.epoch !== command.grantEpoch || snapshot.scope !== scope || snapshot.kind !== kind) throw new LinkError('scope-denied')
        if (limit !== snapshot.pageSize) throw new LinkError('invalid-packet')
        offset = snapshot.offsets.get(cursor)!
      } else {
        if (this.snapshots.size >= this.limits.maxSnapshots) throw new LinkError('queue-full')
        const grant = this.devices.authorize(command), workspaces = await this.services.projects(signal)
        if (workspaces.length > this.limits.maxSourceItems) throw new LinkError('queue-full')
        const projects = workspaces.filter(row => row.sessionIds.some(sessionId => grant.sessions.includes(sessionId)))
        let items: CatalogPage['items']
        if (kind === 'projects') items = projects.map(row => ({ projectId: row.workspaceId, title: row.title, sessionCount: row.sessionIds.filter(sessionId => grant.sessions.includes(sessionId)).length }))
        else {
          const project = projects.find(row => row.workspaceId === scope)
          if (project === undefined) throw new LinkError('scope-denied')
          const listed = await this.services.sessions(signal)
          if (listed.items.length > this.limits.maxSourceItems) throw new LinkError('queue-full')
          items = listed.items.filter(row => grant.sessions.includes(row.sessionId) && project.sessionIds.includes(row.sessionId)).map(row => ({ sessionId: row.sessionId, updatedAt: row.updatedAt, running: row.running, agentAvailable: row.agentAvailable, formatStatus: row.formatStatus === undefined ? 'unknown' : row.formatStatus }))
        }
        if (new TextEncoder().encode(JSON.stringify(items)).byteLength > this.limits.maxSnapshotBytes) throw new LinkError('queue-full')
        const offsets = new Map<string, number>(); for (let at = limit; at < items.length; at += limit) offsets.set(this.mint(new Set(offsets.keys())), at)
        snapshot = { commandId: command.commandId, deviceId: command.deviceId, epoch: command.grantEpoch, scope, kind, id: id<'mobile-read-snapshot'>(this.mint(new Set(offsets.keys()))), expiresAt: this.clock() + this.limits.snapshotTtlMs, pageSize: limit, items, offsets }
        signal.throwIfAborted(); this.devices.authorize(command)
        this.snapshots.set(snapshot.id, snapshot)
      }
      const nextAt = Math.min(offset + limit, snapshot.items.length), next = nextAt === snapshot.items.length ? null : [...snapshot.offsets].find(([, at]) => at === nextAt)?.[0]
      if (next === undefined) throw new LinkError('invalid-packet')
      return jsonPayload({ protocol: 'dsh-mobile-read/1', kind, scope, snapshotId: snapshot.id, expiresAt: snapshot.expiresAt, next, items: snapshot.items.slice(offset, nextAt) })
    }
    if (command.operation === 'read.history') {
      const payload = fields(command.payload, ['sessionId', 'throughSeq', 'beforeSeq', 'maxMessages']), sessionId = this.scope(command, payload.sessionId), throughSeq = payload.throughSeq === -1 ? -1 : natural(payload.throughSeq), maxMessages = natural(payload.maxMessages)
      if (maxMessages < 1 || maxMessages > this.limits.maxPageItems) throw new LinkError('queue-full')
      const beforeSeq = payload.beforeSeq === null ? undefined : natural(payload.beforeSeq)
      const page = await this.services.history({ address: { kind: 'session', sessionId }, throughSeq, ...(beforeSeq === undefined ? {} : { beforeSeq }), maxMessages }, signal)
      if (page.records.length > this.limits.maxHistoryEvents || new TextEncoder().encode(JSON.stringify(page)).byteLength > this.limits.maxSnapshotBytes) throw new LinkError('queue-full')
      return jsonPayload({ protocol: 'dsh-mobile-read/1', sessionId, throughSeq, beforeSeq: beforeSeq ?? null, ...page })
    }
    if (command.operation === 'image.open') {
      const payload = fields(command.payload, ['sessionId', 'messageId', 'messageSeq', 'throughSeq', 'attachmentId']), sessionId = this.scope(command, payload.sessionId)
      if (this.handles.size >= this.limits.maxImageHandles) throw new LinkError('queue-full')
      const ref = await this.services.imageReference({ sessionId, messageId: id<'MessageId'>(text(payload.messageId)), messageSeq: natural(payload.messageSeq), throughSeq: natural(payload.throughSeq), attachmentId: id<'AttachmentId'>(text(payload.attachmentId)) }, signal)
      if (ref === null) throw new LinkError('scope-denied')
      if (ref.bytes > this.limits.maxImageBytes || ref.width > this.limits.maxImageDimension || ref.height > this.limits.maxImageDimension || ref.width * ref.height > this.limits.maxImagePixels) throw new LinkError('queue-full')
      const lease: ImageLease = { protocol: 'dsh-mobile-read/1', handle: id<'mobile-image-handle'>(this.mint()), sessionId, attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height, expiresAt: this.clock() + this.limits.imageTtlMs }
      signal.throwIfAborted(); this.devices.authorize(command, sessionId)
      this.handles.set(lease.handle, { commandId: command.commandId, deviceId: command.deviceId, epoch: command.grantEpoch, lease, ref }); return jsonPayload(lease)
    }
    const payload = fields(command.payload, command.operation === 'image.read' ? ['handle', 'offset', 'length'] : ['handle']), handle = text(payload.handle), owned = this.handles.get(handle)
    if (owned === undefined) { if (command.operation === 'image.close') return { closed: true }; throw new LinkError('read-expired') }
    if (owned.deviceId !== command.deviceId || owned.epoch !== command.grantEpoch) throw new LinkError('scope-denied')
    this.devices.authorize(command, owned.lease.sessionId)
    if (command.operation === 'image.close') { this.handles.delete(handle); return { closed: true } }
    if (command.operation !== 'image.read') throw new LinkError('scope-denied')
    const offset = natural(payload.offset), length = natural(payload.length)
    if (length < 1 || length > this.limits.maxImageChunkBytes || offset >= owned.ref.bytes) throw new LinkError('queue-full')
    owned.image ??= this.services.image(owned.ref, signal)
    const image = await owned.image
    if (image.data.byteLength !== owned.ref.bytes || image.ref.attachmentId !== owned.ref.attachmentId) throw new LinkError('invalid-packet')
    const chunk = image.data.subarray(offset, Math.min(offset + length, image.data.byteLength))
    return { handle, offset, total: image.data.byteLength, data: Buffer.from(chunk).toString('base64') }
  }
  /** Abort reads and forget volatile cursors/handles; source owners retain durable content. */
  close(): void { this.closed = true; this.stopRevoke(); for (const life of this.active.keys()) life.abort(); this.snapshots.clear(); this.handles.clear() }
}

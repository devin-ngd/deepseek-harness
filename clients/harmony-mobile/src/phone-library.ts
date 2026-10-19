/** Trusted read/cache orchestration; it shares SemanticPhone history and never dispatches a task or grants guest image access. */
import type { MobileOperation } from './link-protocol.ts'
import type { JsonValue } from './upstream.ts'
import type { SemanticPhone, MessageView } from './semantic-phone.ts'
import type { CatalogPage, ReadLimits, ImageLease } from './read-protocol.ts'
import { decodeCatalog, decodeImageLease, readBound, validateReadLimits } from './read-protocol.ts'
import { object, integer, string } from './domain.ts'
import { canonical, id } from './protocol.ts'
import { jsonPayload, TransportError } from './wire.ts'

/** Native operation allowlist owner, retained outside all generated HTML realms. */
export interface ReadRequestOwner { request(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): Promise<JsonValue> }
/** Platform storage reads must check file length before allocation; writes replace one app-owned cache atomically. */
export interface CacheStorage {
  read(maxBytes: number): Promise<string | null>
  write(text: string): Promise<void>
  clear(): Promise<void>
}
/** Images have explicit metadata-backed placeholder states; errors never expose provider paths or raw exception text. */
export type ImageView = { readonly state: 'ready'; readonly width: number; readonly height: number; readonly dataUrl: string } | { readonly state: 'unavailable'; readonly width: number; readonly height: number; readonly error: string }
/** Shared catalogue/history layer; native code selects scopes and supplies bounded local storage. */
export class PhoneLibrary {
  private readonly catalogs = new Map<string, CatalogPage>()
  private readonly busy = new Set<string>()
  private readonly images = new Map<string, ImageView>()
  private cacheErrorValue: string | null = null
  /** @param owner - trusted native request dispatcher. @param model - current native Session selection. @param limits - explicit read/memory caps. @param clock - trusted expiry clock. @param epoch - active native grant generation. @param cacheAgeMs - offline display age cap. */
  constructor(private readonly owner: ReadRequestOwner, readonly model: SemanticPhone, readonly limits: ReadLimits, private readonly clock: () => number, private readonly epoch: number, private readonly cacheAgeMs: number) {
    validateReadLimits(limits); integer(epoch, 1); integer(cacheAgeMs, 1)
  }
  /** @returns detached list snapshots; restored rows have no reusable continuation. */
  get lists(): readonly CatalogPage[] { return structuredClone([...this.catalogs.values()]) }
  /** @returns localized UI key for cache refusal; stale/malformed caches do not modify admitted state. */
  get cacheError(): string | null { return this.cacheErrorValue }
  private async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (this.busy.has(key) || this.busy.size >= this.limits.maxInFlight) throw new TransportError('read-busy')
    this.busy.add(key); try { return await work() } finally { this.busy.delete(key) }
  }
  /** @param kind - project or Session list. @param scope - projects or native-selected project id. @param cursor - server snapshot continuation; null starts a fresh list. @param limit - bounded page size. @returns merged stable-identity catalogue snapshot. */
  async page(kind: CatalogPage['kind'], scope: string, cursor: string | null, limit: number): Promise<CatalogPage> {
    const key = kind + '/' + scope
    return this.exclusive(key, async () => {
      const value = await this.owner.request(kind === 'projects' ? 'read.projects' : 'read.sessions', { cursor, limit, ...(kind === 'sessions' ? { projectId: scope } : {}) })
      const page = decodeCatalog(value, kind, scope, this.limits), old = this.catalogs.get(key)
      if (page.expiresAt <= this.clock()) throw new TransportError('read-expired')
      let merged = page
      if (cursor !== null) {
        if (old === undefined || old.snapshotId !== page.snapshotId || old.next !== cursor) throw new TransportError('read-conflict')
        const identities = (row: CatalogPage['items'][number]) => 'projectId' in row ? row.projectId : row.sessionId
        for (const row of page.items) if (old.items.some(previous => identities(previous) === identities(row))) throw new TransportError('read-conflict')
        if (old.items.length + page.items.length > this.limits.maxSourceItems) throw new TransportError('read-too-large')
        merged = { ...page, items: [...old.items, ...page.items] }
      }
      readBound(jsonPayload(merged), this.limits.maxSnapshotBytes); this.catalogs.set(key, merged)
      if (this.catalogs.size > this.limits.maxSnapshots) { this.catalogs.delete(key); throw new TransportError('read-too-large') }
      return structuredClone(merged)
    })
  }
  /** @param maxMessages - native-selected page size. @returns new older history admission, preserving live/wire cursors and task ownership. */
  history(maxMessages: number): Promise<boolean> {
    return this.exclusive('history', async () => {
      const beforeSeq = this.model.firstSeq, throughSeq = this.model.view.cursor
      const value = await this.owner.request('read.history', { sessionId: this.model.owner.sessionId, beforeSeq, throughSeq, maxMessages })
      const page = object(value); if (page.beforeSeq !== beforeSeq || page.throughSeq !== throughSeq) throw new TransportError('scope-denied')
      return this.model.history(value)
    })
  }
  /** @param message - current persisted display row. @param attachmentId - one image in that row. @returns trusted image bytes or a size-preserving localized error placeholder; no URL is given to a guest. */
  image(message: MessageView, attachmentId: string): Promise<ImageView> {
    return this.exclusive('image/' + attachmentId, async () => {
      const row = this.model.view.messages.find(item => item.id === message.id && item.seq === message.seq), part = row?.parts.find(item => item.kind === 'image' && item.attachmentId === attachmentId)
      if (part?.kind !== 'image') throw new TransportError('scope-denied')
      if (this.images.size >= this.limits.maxImageHandles && !this.images.has(attachmentId)) throw new TransportError('read-too-large')
      let lease: ImageLease | undefined, rawHandle: string | undefined, result: ImageView
      try {
        const raw = await this.owner.request('image.open', { sessionId: this.model.owner.sessionId, messageId: message.id, messageSeq: message.seq, throughSeq: this.model.view.cursor, attachmentId })
        rawHandle = id<'mobile-image-handle'>(string(object(raw).handle, 128))
        lease = decodeImageLease(raw, this.model.owner.sessionId, attachmentId, this.limits)
        if (lease.expiresAt <= this.clock() || lease.width !== part.width || lease.height !== part.height || lease.mediaType !== part.mediaType) throw new TransportError('read-expired')
        const bytes = new Uint8Array(lease.bytes)
        for (let offset = 0; offset < bytes.length;) {
          if (lease.expiresAt <= this.clock()) throw new TransportError('read-expired')
          const length = Math.min(this.limits.maxImageChunkBytes, bytes.length - offset), reply = object(await this.owner.request('image.read', { handle: lease.handle, offset, length }))
          if (reply.handle !== lease.handle || integer(reply.offset) !== offset || integer(reply.total) !== lease.bytes) throw new TransportError('scope-denied')
          const encoded = string(reply.data, Math.ceil(length / 3) * 4)
          let decoded: string
          try { decoded = atob(encoded) } catch (error) { throw new TransportError('image-invalid', { cause: error }) }
          if (decoded.length !== length || btoa(decoded) !== encoded) throw new TransportError('image-invalid')
          bytes.set(Uint8Array.from(decoded, char => char.charCodeAt(0)), offset); offset += length
        }
        let encoded = ''; for (let offset = 0; offset < bytes.length; offset += 4096) encoded += String.fromCharCode(...bytes.subarray(offset, offset + 4096))
        result = { state: 'ready', width: lease.width, height: lease.height, dataUrl: 'data:' + lease.mediaType + ';base64,' + btoa(encoded) }
      } catch (error) {
        const allowed = ['scope-denied', 'read-expired', 'read-version-unsupported', 'read-too-large', 'image-invalid', 'queue-full', 'revoked', 'grant-expired', 'transport-lost', 'request-timeout', 'cancelled', 'closed']
        const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && allowed.includes(error.code) ? error.code : 'image-unavailable'
        result = { state: 'unavailable', width: part.width, height: part.height, error: code }
      }
      finally { if (rawHandle !== undefined) { const reply = object(await this.owner.request('image.close', { handle: rawHandle })); if (reply.closed !== true) throw new TransportError('image-cleanup-unknown') } }
      this.images.set(attachmentId, result); return structuredClone(result)
    })
  }
  /** Release local decoded image memory when rows leave the native viewport. @param keep - current persisted image identities. */
  releaseImages(keep: readonly string[]): void { for (const key of this.images.keys()) if (!keep.includes(key)) this.images.delete(key) }
  /** @param storage - native app cache. Store source facts and drafts; transport leases, credentials, cursors, image data and task retries are excluded. */
  async save(storage: CacheStorage): Promise<void> {
    const value = jsonPayload({ schema: 'mobile-offline-cache/1', owner: this.model.owner, epoch: this.epoch, savedAt: this.clock(), semantic: this.model.cache(), catalogs: [...this.catalogs.values()].map(page => ({ ...page, snapshotId: 'offline-cache', expiresAt: this.clock(), next: null })) })
    readBound(value, this.limits.maxSnapshotBytes); await storage.write(JSON.stringify(value) + '\n')
  }
  /** @param storage - bounded native app cache. @returns whether a current, correctly scoped cache restored offline display; refusal preserves current state. */
  async restore(storage: CacheStorage): Promise<boolean> {
    try {
      const text = await storage.read(this.limits.maxSnapshotBytes); if (text === null) return false
      let value: JsonValue
      try { value = jsonPayload(JSON.parse(text)) } catch (error) { throw new TransportError('cache-invalid', { cause: error }) }
      const cache = object(readBound(value, this.limits.maxSnapshotBytes))
      if (cache.schema !== 'mobile-offline-cache/1') throw new TransportError('cache-version-unsupported')
      if (canonical(cache.owner) !== canonical(this.model.owner) || cache.epoch !== this.epoch) throw new TransportError('scope-denied')
      const age = this.clock() - integer(cache.savedAt); if (age < 0 || age > this.cacheAgeMs) throw new TransportError('cache-expired')
      if (!Array.isArray(cache.catalogs) || cache.catalogs.length > this.limits.maxSnapshots) throw new TransportError('cache-invalid')
      const catalogs = cache.catalogs.map(value => { const page = object(value); if (page.kind !== 'projects' && page.kind !== 'sessions') throw new TransportError('cache-invalid'); return decodeCatalog(value, page.kind, string(page.scope, 128), { ...this.limits, maxPageItems: this.limits.maxSourceItems }) })
      if (new Set(catalogs.map(page => page.kind + '/' + page.scope)).size !== catalogs.length) throw new TransportError('cache-invalid')
      this.model.restore(cache.semantic!); this.catalogs.clear(); for (const page of catalogs) this.catalogs.set(page.kind + '/' + page.scope, { ...page, next: null }); this.images.clear(); this.cacheErrorValue = null; return true
    } catch (error) { this.cacheErrorValue = error instanceof TransportError ? error.code : 'cache-unavailable'; return false }
  }
}
/** Bounded native message viewport preserves ids and a visible anchor when history is prepended or the user reads away from the tail. */
export class MessageWindow {
  private rows: readonly MessageView[] = []
  private start = 0
  private anchor: { readonly id: string; readonly offset: number } | null = null
  private tail = true
  /** @param maxRows - explicit native DOM/LazyForEach retention limit. */
  constructor(readonly maxRows: number) { integer(maxRows, 1) }
  /** @param id - visible persisted message identity. @param offset - within-row scroll offset. @param atTail - whether new messages should follow the tail. */
  position(id: string, offset: number, atTail: boolean): void { integer(offset); this.anchor = { id, offset }; this.tail = atTail }
  /** @param messages - detached semantic rows. @returns bounded rows, stable restoration anchor and explicit anchor eviction notice. */
  update(messages: readonly MessageView[]): { readonly rows: readonly MessageView[]; readonly anchor: { readonly id: string; readonly offset: number } | null; readonly anchorMissing: boolean; readonly total: number } {
    const ids = new Set(messages.map(row => row.id)); if (ids.size !== messages.length) throw new TransportError('read-conflict')
    const index = this.anchor === null ? -1 : messages.findIndex(row => row.id === this.anchor!.id), missing = this.anchor !== null && index === -1
    this.start = this.tail ? Math.max(0, messages.length - this.maxRows) : index >= 0 ? index : Math.min(this.start, Math.max(0, messages.length - this.maxRows))
    this.rows = messages.slice(this.start, this.start + this.maxRows)
    return { rows: structuredClone(this.rows), anchor: missing ? null : this.anchor, anchorMissing: missing, total: messages.length }
  }
}

/** App-private durable records, keyed by the saved pairing and selected Session. */
import { z } from 'zod'
import { deviceHistoryHashSchema, deviceOpeningHistory } from './device-carrier-protocol.ts'
import { fields } from './link-protocol.ts'
import { canonical, id } from './protocol.ts'
import type { PhoneView, SemanticPhone } from './semantic-phone.ts'
import type { JsonValue } from './upstream.ts'
import { jsonPayload, TransportError } from './wire.ts'
import type { DeviceBinding } from './device-binding-protocol.ts'
import { deviceSessionRowSchema, type DeviceSessionRow } from './device-session-directory.ts'

/** Storage is bounded and atomically replaced by the native file owner. */
export interface DeviceHistoryStorage {
  readonly maxBytes: number
  readonly maxSessions: number
  read(maxBytes: number): Promise<string | null>
  write(raw: string): Promise<void>
  clear(): Promise<void>
}

interface OlderPage { readonly beforeSeq: number; readonly value: JsonValue }
const previewSchema = z.object({
  header: z.object({ id: z.string(), version: z.number().int().positive(), createdAt: z.number().int().nonnegative(), isSeeded: z.boolean() }),
  hasMore: z.boolean(),
})
interface Opening { readonly hash: string; readonly cursor: number; readonly records: readonly JsonValue[]; readonly preview?: z.infer<typeof previewSchema> | undefined }
interface CachedHistory { readonly opening: Opening; readonly older: readonly OlderPage[]; readonly row?: DeviceSessionRow | undefined; readonly rich?: readonly JsonValue[] | undefined; readonly unavailable?: boolean | undefined }
const cacheSchema = z.object({ version: z.literal(1), sessions: z.array(z.object({
  scope: z.string().min(1).max(2048),
  opening: z.object({ hash: deviceHistoryHashSchema, cursor: z.number().int().min(-1), records: z.array(z.json()), preview: previewSchema.optional() }).strict(),
  older: z.array(z.object({ beforeSeq: z.number().int().positive(), value: z.json() }).strict()),
  row: deviceSessionRowSchema.optional(), rich: z.array(z.json()).optional(), unavailable: z.boolean().optional(),
}).strict()) }).strict()
const eventRecordSchema = z.object({ type: z.literal('event'), event: z.object({ seq: z.number().int().nonnegative() }).passthrough() }).strict()
const historyPageSchema = z.object({ protocol: z.literal('dsh-mobile-read/1'), sessionId: z.string(), beforeSeq: z.number().int().positive(),
  throughSeq: z.number().int().nonnegative(), records: z.array(z.json()), hasMore: z.boolean() }).strict()

function recordSequences(records: readonly JsonValue[]): readonly number[] | undefined {
  const result: number[] = []
  for (const record of records) {
    const parsed = eventRecordSchema.safeParse(record)
    if (!parsed.success || result.length > 0 && parsed.data.event.seq !== result[result.length - 1]! + 1) return undefined
    result.push(parsed.data.event.seq)
  }
  return result
}

function compatibleRecords(current: readonly JsonValue[], previous: readonly JsonValue[]): boolean {
  const currentSeq = recordSequences(current), previousSeq = recordSequences(previous)
  if (currentSeq === undefined || previousSeq === undefined) return false
  const old = new Map(previousSeq.map((seq, index) => [seq, previous[index]!]))
  return currentSeq.every((seq, index) => !old.has(seq) || canonical(current[index]!) === canonical(old.get(seq)!))
}

/** @param binding - verified original device binding. @param sessionId - selected desktop Session. @returns the existing durable cache scope. */
export function deviceHistoryScope(binding: DeviceBinding, sessionId: string): string {
  return JSON.stringify([binding.bindingId, binding.epoch, binding.desktopId, binding.profileId, sessionId])
}

/** A selected view can use older pages after the desktop confirms its opening window. */
export class DeviceSessionHistory {
  private confirmed = false
  private row: DeviceSessionRow | undefined
  constructor(private current: CachedHistory | undefined, private readonly persist: (entry: CachedHistory) => void) {}

  /** @returns a verified on-disk hash, or a cache offer without any saved records. */
  get hint(): string | null { return this.current?.opening.hash ?? null }

  /** Keep the authenticated directory label for later offline selection. */
  bindRow(row: DeviceSessionRow): void {
    this.row = row
    if (this.current !== undefined && JSON.stringify(this.current.row) !== JSON.stringify(row)) {
      this.current = { ...this.current, row }
      this.persist(this.current)
    }
  }

  /** @param model - disposable projection for the exact selected scope. @returns locally validated durable history without a live stream. */
  preview(model: SemanticPhone): PhoneView | undefined {
    const saved = this.current?.opening
    if (saved?.preview === undefined) return undefined
    try {
      model.accept({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...model.owner, instance: id<'mobile-wire-instance'>('offline-cache'), relayCursor: 0,
        kind: 'reset', payload: jsonPayload({ type: 'snapshot', ...saved.preview, cursor: saved.cursor, records: saved.records, projections: { asOfSeq: saved.cursor, values: {} } }) })
      return model.view
    } catch (error) {
      if (!(error instanceof TransportError)) throw error
      console.info('DSH_DEVICE_HISTORY=opening-preview-invalid')
      return undefined
    }
  }

  /** Restore locally checked records read-only; unavailable Rich snapshots do not hide text history. */
  restore(model: SemanticPhone): boolean {
    const saved = this.current?.opening
    if (saved?.preview === undefined || saved.preview.header.id !== model.owner.sessionId) return false
    try {
      const events = saved.records.map(record => eventRecordSchema.parse(record).event)
      model.restore(jsonPayload({ schema: 'mobile-semantic-cache/1', owner: model.owner, version: saved.preview.header.version,
        cursor: saved.cursor, seeded: saved.preview.header.isSeeded, hasMore: saved.preview.hasMore, events, rich: [] }))
      this.restoreRich(model)
      return true
    } catch (error) {
      void error
      console.info('DSH_DEVICE_HISTORY=offline-restore-invalid')
      return false
    }
  }

  /** Restore only snapshots whose source message is admitted in this history window. */
  restoreRich(model: SemanticPhone): void {
    for (const value of this.current?.rich ?? []) {
      try {
        const candidate = z.object({ scope: z.object({ messageId: z.string(), blockId: z.string() }).passthrough() }).passthrough().parse(value)
        const reference = model.view.messages.flatMap(message => message.rich).find(item => item.messageId === candidate.scope.messageId && item.blockId === candidate.scope.blockId)
        if (reference !== undefined) model.richSnapshot(value, reference)
      } catch (error) { void error; console.info('DSH_DEVICE_HISTORY=offline-rich-invalid') }
    }
  }

  /** Persist one already admitted Rich snapshot for read-only offline rendering. */
  rememberRich(value: JsonValue, maxSnapshots: number): void {
    if (!this.confirmed || this.current === undefined) return
    const candidate = z.object({ scope: z.object({ messageId: z.string(), blockId: z.string() }).passthrough() }).passthrough().parse(value)
    const existing = (this.current.rich ?? []).find(item => {
      const parsed = z.object({ scope: z.object({ messageId: z.string(), blockId: z.string() }).passthrough() }).passthrough().safeParse(item)
      return parsed.success && parsed.data.scope.messageId === candidate.scope.messageId && parsed.data.scope.blockId === candidate.scope.blockId
    })
    if (existing !== undefined && canonical(existing) === canonical(value)) return
    const rich = (this.current.rich ?? []).filter(item => {
      const parsed = z.object({ scope: z.object({ messageId: z.string(), blockId: z.string() }).passthrough() }).passthrough().safeParse(item)
      return !parsed.success || parsed.data.scope.messageId !== candidate.scope.messageId || parsed.data.scope.blockId !== candidate.scope.blockId
    })
    this.current = { ...this.current, rich: [...rich, value].slice(-maxSnapshots) }
    this.persist(this.current)
  }

  /** @param value - authenticated frame. @returns the standard frame with admitted durable records restored on a hit. */
  expand(value: JsonValue): JsonValue {
    if (value === null || typeof value !== 'object' || !('historyHash' in value)) return value
    const reply = fields(value, ['historyHash', 'reused', 'frame'])
    const hash = deviceHistoryHashSchema.parse(reply.historyHash), frame = jsonPayload(reply.frame), opening = deviceOpeningHistory(frame)
    if (opening === undefined || typeof reply.reused !== 'boolean') throw new TransportError('invalid-frame')
    const saved = this.current
    const matches = saved !== undefined && saved.opening.hash === hash && saved.opening.cursor === opening.cursor
    if (reply.reused && (!matches || opening.records.length !== 0)) throw new TransportError('cache-invalid')
    const records = reply.reused && saved !== undefined ? saved.opening.records : opening.records
    const preview = previewSchema.safeParse(opening.payload)
    if (!matches || preview.success && saved.opening.preview === undefined) {
      let older: readonly OlderPage[] = matches ? saved.older : []
      let compatible = matches
      if (!matches && saved?.opening.preview !== undefined && preview.success
        && saved.opening.preview.header.id === preview.data.header.id && saved.opening.preview.header.version === preview.data.header.version
        && opening.cursor >= saved.opening.cursor && compatibleRecords(records, saved.opening.records)
        && saved.older.every(page => { const parsed = historyPageSchema.safeParse(page.value); return parsed.success && compatibleRecords(records, parsed.data.records) })) {
        compatible = true
        older = saved.older
        const seqs = recordSequences(saved.opening.records)
        if (seqs !== undefined && seqs.length > 0 && seqs[seqs.length - 1] === saved.opening.cursor) {
          const beforeSeq = saved.opening.cursor + 1
          const value = jsonPayload({ protocol: 'dsh-mobile-read/1', sessionId: saved.opening.preview.header.id, beforeSeq,
            throughSeq: saved.opening.cursor, records: saved.opening.records, hasMore: saved.opening.preview.hasMore })
          older = [{ beforeSeq, value }, ...older.filter(page => page.beforeSeq !== beforeSeq)]
        }
      }
      this.current = { opening: { hash, cursor: opening.cursor, records, ...(preview.success ? { preview: preview.data } : {}) }, older,
        ...((this.row ?? saved?.row) === undefined ? {} : { row: this.row ?? saved?.row }), ...(compatible && saved?.rich !== undefined ? { rich: saved.rich } : {}) }
      this.persist(this.current)
    }
    this.confirmed = true
    console.info('DSH_DEVICE_HISTORY=' + (reply.reused ? 'opening-hit' : 'opening-transfer'))
    return reply.reused ? jsonPayload({ ...opening.frame, payload: { ...opening.payload, records } }) : frame
  }

  /** @returns a contiguous cached older window at the current confirmed log cut. */
  older(beforeSeq: number, throughSeq: number, offline = false): JsonValue | undefined {
    const current = this.current
    if ((!this.confirmed && !offline) || current?.opening.preview === undefined || throughSeq < current.opening.cursor) return undefined
    for (const candidate of current.older) {
      const parsed = historyPageSchema.safeParse(candidate.value)
      if (!parsed.success || parsed.data.sessionId !== current.opening.preview.header.id || parsed.data.beforeSeq !== candidate.beforeSeq) continue
      const page = parsed.data, seqs = recordSequences(page.records), end = seqs?.indexOf(beforeSeq - 1) ?? -1
      if (seqs === undefined || end < 0 || seqs[seqs.length - 1] !== page.beforeSeq - 1) continue
      return jsonPayload({ ...page, beforeSeq, throughSeq, records: page.records.slice(0, end + 1) })
    }
    return undefined
  }

  /** Store a remote older page after the phone's semantic owner has validated and admitted it. */
  remember(beforeSeq: number, throughSeq: number, value: JsonValue): void {
    const current = this.current
    if (!this.confirmed || current === undefined || throughSeq < current.opening.cursor || current.older.some(page => page.beforeSeq === beforeSeq)) return
    this.current = { ...current, older: [...current.older, { beforeSeq, value }] }
    this.persist(this.current)
  }
}

/** A bounded, serially written cache. File failures leave the remote read path available. */
export class DeviceHistoryCache {
  private readonly entries = new Map<string, CachedHistory>()
  private loaded: Promise<void> | undefined
  private writing: Promise<void> = Promise.resolve()
  private active = true
  private revision = 0
  private persistedRevision = 0
  private saving = false
  constructor(private readonly storage: DeviceHistoryStorage, private readonly digest: (raw: string) => Promise<string>) {
    if (![storage.maxBytes, storage.maxSessions].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('device history cache budget denied')
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.storage.read(this.storage.maxBytes)
      if (raw === null || !this.active) return
      const parsed = cacheSchema.parse(JSON.parse(raw))
      if (parsed.sessions.length > this.storage.maxSessions || new Set(parsed.sessions.map(row => row.scope)).size !== parsed.sessions.length) throw new Error('device history cache scope denied')
      for (const row of parsed.sessions) this.entries.set(row.scope, row)
    } catch {
      console.info('DSH_DEVICE_HISTORY=cache-read-failed')
    }
  }

  /** @param scope - native-owned pairing and Session identity. @returns a view with a checked opening hash. */
  async open(scope: string): Promise<DeviceSessionHistory> {
    await (this.loaded ??= this.load())
    let current = this.active ? this.entries.get(scope) : undefined
    if (current?.unavailable === true) current = undefined
    if (current !== undefined) {
      try {
        if (await this.digest(JSON.stringify([current.opening.cursor, current.opening.records])) !== current.opening.hash) current = undefined
      } catch {
        current = undefined
      }
    }
    return new DeviceSessionHistory(current, entry => this.save(scope, { ...entry, unavailable: this.entries.get(scope)?.unavailable ?? entry.unavailable }))
  }

  /** Save labels only for already cached Sessions from the verified current directory. */
  async rememberDirectory(binding: DeviceBinding, rows: readonly DeviceSessionRow[]): Promise<void> {
    await (this.loaded ??= this.load())
    if (!this.active) return
    const admitted = new Map(rows.map(row => [deviceHistoryScope(binding, row.sessionId), row]))
    for (const [scope, current] of [...this.entries]) {
      let parts: unknown
      try { parts = JSON.parse(scope) } catch (error) { void error; continue }
      if (!Array.isArray(parts) || parts.length !== 5 || typeof parts[4] !== 'string' || deviceHistoryScope(binding, parts[4]) !== scope) continue
      const row = admitted.get(scope), unavailable = row === undefined
      if (current.unavailable !== unavailable || row !== undefined && JSON.stringify(current.row) !== JSON.stringify(row)) {
        this.save(scope, { ...current, ...(row === undefined ? {} : { row }), unavailable })
      }
    }
  }

  /** @returns cached Sessions belonging to the exact verified local binding. */
  async sessions(binding: DeviceBinding): Promise<readonly DeviceSessionRow[]> {
    await (this.loaded ??= this.load())
    if (!this.active) return []
    const result: DeviceSessionRow[] = []
    for (const [scope, entry] of this.entries) {
      let parts: unknown
      try { parts = JSON.parse(scope) } catch (error) { void error; continue }
      if (entry.unavailable === true || !Array.isArray(parts) || parts.length !== 5 || typeof parts[4] !== 'string' || deviceHistoryScope(binding, parts[4]) !== scope) continue
      const history = await this.open(scope)
      if (!this.active || this.entries.get(scope)?.unavailable === true || history.hint === null || entry.opening.preview?.header.id !== parts[4]) continue
      const row = entry.row ?? deviceSessionRowSchema.parse({ profileId: 'desktop', sessionId: parts[4], title: '', projectId: null })
      if (row.sessionId === parts[4]) result.push({ ...row, running: false })
    }
    return result
  }

  private save(scope: string, entry: CachedHistory): void {
    if (!this.active) return
    this.entries.delete(scope)
    this.entries.set(scope, entry)
    while (this.entries.size > this.storage.maxSessions) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) return
      this.entries.delete(oldest)
    }
    this.revision++
    this.scheduleWrite()
  }

  private scheduleWrite(): void {
    if (this.saving) return
    this.saving = true
    this.writing = this.writing.then(async () => {
      do {
        await new Promise<void>(resolve => setTimeout(resolve, 0))
        const revision = this.revision
        const serialize = () => JSON.stringify({ version: 1, sessions: [...this.entries].map(([scope, value]) => ({ scope, ...value })) })
        let raw = serialize()
        while (new TextEncoder().encode(raw).byteLength > this.storage.maxBytes) {
          const oldest = this.entries.keys().next().value
          if (oldest === undefined) throw new Error('device history cache budget too small')
          const entry = this.entries.get(oldest)!
          if (entry.older.length > 0) this.entries.set(oldest, { ...entry, older: entry.older.slice(0, -1) })
          else if ((entry.rich?.length ?? 0) > 0) this.entries.set(oldest, { ...entry, rich: entry.rich!.slice(1) })
          else this.entries.delete(oldest)
          raw = serialize()
        }
        await this.storage.write(raw)
        this.persistedRevision = revision
      } while (this.persistedRevision !== this.revision)
    }).catch(() => { this.persistedRevision = this.revision; console.info('DSH_DEVICE_HISTORY=cache-write-failed') }).finally(() => {
      this.saving = false
      if (this.persistedRevision !== this.revision) this.scheduleWrite()
    })
  }

  /** Retire cache publication and await the app-private write queue. */
  async close(): Promise<void> { this.active = false; do { await this.writing } while (this.saving) }
  /** Drop app-owned history when its saved device authorization is revoked. */
  async clear(): Promise<void> {
    await this.close()
    this.entries.clear()
    await this.storage.clear()
  }
}

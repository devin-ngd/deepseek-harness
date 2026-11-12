/** Correlation and per-view connection ownership for the fixed encrypted device carrier. */
import type { ProductConnection } from './paired-product-transport.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import { fields } from './link-protocol.ts'
import { object, string } from './domain.ts'
import { TransportError, jsonPayload } from './wire.ts'
import type { DeviceSessionRoute } from './mobile-device-product.ts'
import type { DeviceSessionAction, DeviceSessionRow } from './device-session-directory.ts'
import type { DeviceSessionHistory } from './device-history-cache.ts'
import type { WorkspaceRequest } from './workspace-protocol.ts'
interface Wait { readonly workspace: boolean; resolve(value: unknown): void; reject(error: Error): void; stop(): void }
/** Existing native connection is shared; each selected Session has independent correlation ids and an owned subscriber. */
export class DeviceProductRpc {
  private readonly pending = new Map<string, Wait>()
  private readonly views = new Map<string, (raw: string) => void>()
  private counter = 0
  private closed = false
  /** @param network - verified native device carrier. @param scheduler - explicit native request timers. @param timeoutMs - finite wait budget. @param maxPending - reserved narrow native request capacity. @param prefix - fresh native application/view identity, never an authorization field. @param maxWorkspacePending - separately reserved workspace capacity; omission disables workspace requests. */
  constructor(private readonly network: ProductConnection, private readonly scheduler: CleanupScheduler, private readonly timeoutMs: number, private readonly maxPending: number, private readonly prefix: string, private readonly maxWorkspacePending = 0) { if (![timeoutMs, maxPending].every(value => Number.isSafeInteger(value) && value > 0) || !Number.isSafeInteger(maxWorkspacePending) || maxWorkspacePending < 0 || !/^[A-Za-z0-9_.:-]{1,128}$/.test(prefix)) throw new Error('device RPC configuration denied') }
  /** @param raw - bounded decrypted result/frame from the verified native carrier. No caller may select a different view by desktop foreground state. */
  receive(raw: string): void {
    if (this.closed) return
    const value = jsonPayload(JSON.parse(raw)), data = object(value), kind = data.kind
    const packet = fields(data, kind === 'result' || kind === 'frame' ? ['kind', 'id', 'value'] : kind === 'error' ? ['kind', 'id', 'code'] : ['kind', 'id'])
    if (!['result', 'frame', 'end', 'error'].includes(String(kind)) || typeof packet.id !== 'string') throw new Error('device RPC response denied')
    const pending = this.pending.get(packet.id)
    if (pending !== undefined) {
      if (kind !== 'result' && kind !== 'error') throw new Error('device RPC unary response denied')
      this.pending.delete(packet.id); pending.stop()
      if (kind === 'error') {
        const code = packet.code === 'history-too-large' || pending.workspace && packet.code === 'workspace-grant-required' ? packet.code : 'unknown-outcome'
        pending.reject(new TransportError(code))
      } else pending.resolve(packet.value)
      return
    }
    for (const [prefix, receive] of this.views) if (packet.id.startsWith(prefix)) { receive(raw); return }
  }
  /** @param value - fixed device or workspace request constructed by native code. @returns acknowledged public result. A missing workspace grant rejects before workspace dispatch. Timeout never retries the operation. */
  call(value: { readonly method: 'metadata'; readonly argument: null } | { readonly method: 'creation-options' } | { readonly method: 'select'; readonly route: DeviceSessionRoute } | { readonly method: 'history'; readonly route: DeviceSessionRoute; readonly argument: { readonly beforeSeq: number; readonly throughSeq: number } } | { readonly method: 'manage'; readonly action: DeviceSessionAction } | { readonly method: 'workspace'; readonly argument: WorkspaceRequest }, signal?: AbortSignal): Promise<unknown> {
    const workspace = value.method === 'workspace', limit = workspace ? this.maxWorkspacePending : this.maxPending
    if (this.closed || [...this.pending.values()].filter(wait => wait.workspace === workspace).length >= limit) return Promise.reject(new TransportError('queue-full'))
    if (signal?.aborted) return Promise.reject(new TransportError('cancelled'))
    const id = this.prefix + '-rpc-' + ++this.counter
    return new Promise((resolve, reject) => {
      const abort = () => {
        const wait = this.pending.get(id)
        if (wait === undefined) return
        this.pending.delete(id); wait.stop(); reject(new TransportError('cancelled'))
        void this.network.stop(id).catch(error => { void error })
      }
      // Stream waits are bounded by cancellation and the authenticated channel heartbeat, rather than a unary deadline.
      const streaming = value.method === 'workspace' && ['stream-next', 'stream-write', 'stream-end'].includes(value.argument.operation)
      const cancelTimer = streaming ? () => {} : this.scheduler.after(this.timeoutMs, () => { this.pending.delete(id); signal?.removeEventListener('abort', abort); reject(new TransportError('timeout')); void this.network.stop(id).catch(error => { void error }) })
      const stop = () => { cancelTimer(); signal?.removeEventListener('abort', abort) }
      this.pending.set(id, { workspace, resolve, reject, stop })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      else void this.network.request(id, JSON.stringify(value)).catch(error => { const pending = this.pending.get(id); if (pending === undefined) return; this.pending.delete(id); pending.stop(); reject(error) })
    })
  }
  /** @param route - desktop-acknowledged Session route. @param row - entry from the directory used for that selection. @param received - original PhoneCore transport response sink. @returns a borrowed native connection with local metadata scoped to the selected Session. */
  view(route: DeviceSessionRoute, row: DeviceSessionRow, received: (raw: string) => void, history?: DeviceSessionHistory): ProductConnection {
    if (this.closed) throw new TransportError('closed')
    if (row.sessionId !== route.sessionId || row.profileId !== route.profileId) throw new TransportError('scope-denied')
    const metadata = {
      desktopId: route.desktopId, profileId: route.profileId,
      catalog: { projects: [], sessions: [{ sessionId: row.sessionId, title: string(row.title, 65536), projectId: row.projectId }] },
    }
    const prefix = this.prefix + '-view-' + ++this.counter + ':', ids = new Map<string, string>(); let closed = false
    this.views.set(prefix, raw => {
      if (closed) return
      const data = object(JSON.parse(raw)), id = typeof data.id === 'string' ? data.id : '', selected = ids.get(id)
      if (selected === undefined) return
      if (data.kind === 'result' || data.kind === 'end' || data.kind === 'error') ids.delete(id)
      const packet = data.kind === 'frame' && history !== undefined ? { ...data, value: history.expand(jsonPayload(data.value)) } : data
      received(JSON.stringify({ ...packet, id: selected }))
    })
    return {
      request: async (id, raw) => {
        if (closed || this.closed) throw new TransportError('closed')
        const value = fields(JSON.parse(raw), ['method', 'argument']); if (value.method !== 'metadata' && value.method !== 'request') throw new TransportError('scope-denied')
        const key = prefix + id; if (ids.has(key)) throw new TransportError('invalid-packet')
        if (value.method === 'metadata') {
          if (value.argument !== null) throw new TransportError('invalid-packet')
          received(JSON.stringify({ kind: 'result', id, value: metadata }))
          return
        }
        ids.set(key, id)
        try { await this.network.request(key, JSON.stringify({ ...value, route })) } catch (error) { ids.delete(key); throw error }
      },
      follow: async (id, raw) => { if (closed || this.closed) throw new TransportError('closed'); const value = fields(JSON.parse(raw), ['argument', 'resume']), key = prefix + id; if (ids.has(key)) throw new TransportError('invalid-packet'); ids.set(key, id); try { await this.network.follow(key, JSON.stringify({ ...value, route, ...(history === undefined ? {} : { historyHash: history.hint }) })) } catch (error) { ids.delete(key); throw error } },
      stop: async id => { const key = prefix + id; if (ids.delete(key)) await this.network.stop(key) },
      close: async () => { if (closed) return; closed = true; this.views.delete(prefix); const keys = [...ids.keys()]; ids.clear(); const results = await Promise.allSettled(keys.map(id => this.network.stop(id))); if (results.some(result => result.status === 'rejected')) throw new Error('device view wait cleanup failed') },
    }
  }
  /** Reject pending waits and detach every view. Shared network lifetime remains with its native owner. */
  close(): void { if (this.closed) return; this.closed = true; for (const wait of this.pending.values()) { wait.stop(); wait.reject(new TransportError('closed')) }; this.pending.clear(); this.views.clear() }
}

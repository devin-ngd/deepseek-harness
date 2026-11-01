/** Correlation and per-view connection ownership for the fixed encrypted device carrier. */
import type { ProductConnection } from './paired-product-transport.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import { fields } from './link-protocol.ts'
import { object, string } from './domain.ts'
import { TransportError, jsonPayload } from './wire.ts'
import type { DeviceSessionRoute } from './mobile-device-product.ts'
interface Wait { resolve(value: unknown): void; reject(error: Error): void; stop(): void }
/** Existing native connection is shared; each selected Session has independent correlation ids and an owned subscriber. */
export class DeviceProductRpc {
  private readonly pending = new Map<string, Wait>()
  private readonly views = new Map<string, (raw: string) => void>()
  private counter = 0
  private closed = false
  /** @param network - verified native device carrier. @param scheduler - explicit native request timers. @param timeoutMs - finite wait budget. @param maxPending - local concurrent request cap. @param prefix - fresh native application/view identity, never an authorization field. */
  constructor(private readonly network: ProductConnection, private readonly scheduler: CleanupScheduler, private readonly timeoutMs: number, private readonly maxPending: number, private readonly prefix: string) { if (![timeoutMs, maxPending].every(value => Number.isSafeInteger(value) && value > 0) || !/^[A-Za-z0-9_.:-]{1,128}$/.test(prefix)) throw new Error('device RPC configuration denied') }
  /** @param raw - bounded decrypted result/frame from the verified native carrier. No caller may select a different view by desktop foreground state. */
  receive(raw: string): void {
    if (this.closed) return
    const value = jsonPayload(JSON.parse(raw)), data = object(value), kind = data.kind
    const packet = fields(data, kind === 'result' || kind === 'frame' ? ['kind', 'id', 'value'] : kind === 'error' ? ['kind', 'id', 'code'] : ['kind', 'id'])
    if (!['result', 'frame', 'end', 'error'].includes(String(kind)) || typeof packet.id !== 'string') throw new Error('device RPC response denied')
    const pending = this.pending.get(packet.id)
    if (pending !== undefined) { if (kind !== 'result' && kind !== 'error') throw new Error('device RPC unary response denied'); this.pending.delete(packet.id); pending.stop(); if (kind === 'error') pending.reject(new TransportError('unknown-outcome')); else pending.resolve(packet.value); return }
    for (const [prefix, receive] of this.views) if (packet.id.startsWith(prefix)) { receive(raw); return }
  }
  /** @param value - fixed metadata/select request only, constructed by native code. @returns acknowledged public result; timeout never retries the operation. */
  call(value: { readonly method: 'metadata'; readonly argument: null } | { readonly method: 'select'; readonly route: DeviceSessionRoute }): Promise<unknown> {
    if (this.closed || this.pending.size >= this.maxPending) return Promise.reject(new TransportError('queue-full'))
    const id = this.prefix + '-rpc-' + ++this.counter
    return new Promise((resolve, reject) => {
      const stop = this.scheduler.after(this.timeoutMs, () => { this.pending.delete(id); reject(new TransportError('timeout')); void this.network.stop(id).catch(error => { void error }) })
      this.pending.set(id, { resolve, reject, stop })
      void this.network.request(id, JSON.stringify(value)).catch(error => { const pending = this.pending.get(id); if (pending === undefined) return; this.pending.delete(id); pending.stop(); reject(error) })
    })
  }
  /** @param route - explicit immutable selected owner. @param received - original PhoneCore transport response sink. @returns a borrowed native connection whose close affects only its requests/followers, never another Session or the shared channel. */
  view(route: DeviceSessionRoute, received: (raw: string) => void): ProductConnection {
    if (this.closed) throw new TransportError('closed')
    const prefix = this.prefix + '-view-' + ++this.counter + ':', ids = new Map<string, { original: string; metadata: boolean }>(); let closed = false
    this.views.set(prefix, raw => {
      if (closed) return
      const data = object(JSON.parse(raw)), id = typeof data.id === 'string' ? data.id : '', selected = ids.get(id)
      if (selected === undefined) return
      let value = data.value
      if (selected.metadata && data.kind === 'result') {
        const catalog = fields(value, ['desktopId', 'profileId', 'sessions'])
        if (catalog.desktopId !== route.desktopId || catalog.profileId !== route.profileId || !Array.isArray(catalog.sessions)) throw new Error('device catalogue identity denied')
        const sessions = catalog.sessions.map(object).filter(row => row.sessionId === route.sessionId).map(row => ({ sessionId: string(row.sessionId, 256), title: string(row.title, 65536), projectId: row.projectId === null ? null : string(row.projectId, 256) }))
        if (sessions.length !== 1) throw new Error('selected device Session no longer visible')
        value = { desktopId: route.desktopId, profileId: route.profileId, catalog: { projects: [], sessions } }
      }
      if (data.kind === 'result' || data.kind === 'end' || data.kind === 'error') ids.delete(id)
      received(JSON.stringify({ ...data, id: selected.original, ...(data.kind === 'result' || data.kind === 'frame' ? { value } : {}) }))
    })
    return {
      request: async (id, raw) => {
        if (closed || this.closed) throw new TransportError('closed')
        const value = fields(JSON.parse(raw), ['method', 'argument']); if (value.method !== 'metadata' && value.method !== 'request') throw new TransportError('scope-denied')
        const key = prefix + id; if (ids.has(key)) throw new TransportError('invalid-packet'); ids.set(key, { original: id, metadata: value.method === 'metadata' })
        try { await this.network.request(key, JSON.stringify(value.method === 'metadata' ? value : { ...value, route })) } catch (error) { ids.delete(key); throw error }
      },
      follow: async (id, raw) => { if (closed || this.closed) throw new TransportError('closed'); const value = fields(JSON.parse(raw), ['argument', 'resume']), key = prefix + id; if (ids.has(key)) throw new TransportError('invalid-packet'); ids.set(key, { original: id, metadata: false }); try { await this.network.follow(key, JSON.stringify({ ...value, route })) } catch (error) { ids.delete(key); throw error } },
      stop: async id => { const key = prefix + id; if (ids.delete(key)) await this.network.stop(key) },
      close: async () => { if (closed) return; closed = true; this.views.delete(prefix); const keys = [...ids.keys()]; ids.clear(); const results = await Promise.allSettled(keys.map(id => this.network.stop(id))); if (results.some(result => result.status === 'rejected')) throw new Error('device view wait cleanup failed') },
    }
  }
  /** Reject pending waits and detach every view. Shared network lifetime remains with its native owner. */
  close(): void { if (this.closed) return; this.closed = true; for (const wait of this.pending.values()) { wait.stop(); wait.reject(new TransportError('closed')) }; this.pending.clear(); this.views.clear() }
}

/** One owned synthetic half-duplex byte budget and RTT for offline workspace measurements. */
import type { WorkspaceWireHost } from '../desktop-plugin/src/workspace-wire.ts'

/** Zero byte rate means unlimited throughput for the explicit baseline. */
export interface WorkspaceLinkProfile { readonly rttMs: number; readonly bytesPerSecond: number; readonly maxPending: number }
/** @param host - actual serialized Host dispatcher. @param profile - fixed measurement conditions. @returns request carrier, raw counters and an awaited cancellation owner. */
export function workspaceLinkFixture(host: Pick<WorkspaceWireHost, 'request'>, profile: WorkspaceLinkProfile) {
  const lifetime = new AbortController(), work = new Set<Promise<unknown>>()
  let nextByteTime = 0, requests = 0, requestBytes = 0, responseBytes = 0
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
  const transmit = async (bytes: number, signal: AbortSignal) => {
    const now = performance.now()
    nextByteTime = Math.max(now, nextByteTime) + (profile.bytesPerSecond === 0 ? 0 : bytes * 1000 / profile.bytesPerSecond)
    const delay = profile.rttMs / 2 + Math.max(0, nextByteTime - now)
    if (delay > 0) await wait(delay, signal); else signal.throwIfAborted()
  }
  return {
    async request(value: Parameters<WorkspaceWireHost['request']>[0], signal: AbortSignal) {
      if (lifetime.signal.aborted || work.size >= profile.maxPending) throw new Error('fixture link unavailable')
      const combined = AbortSignal.any([signal, lifetime.signal])
      const operation = (async () => {
        const sent = Buffer.byteLength(JSON.stringify(value)); requests++; requestBytes += sent
        await transmit(sent, combined)
        const result = await host.request(value, combined), received = Buffer.byteLength(JSON.stringify(result))
        responseBytes += received; await transmit(received, combined); return result
      })()
      work.add(operation)
      try { return await operation } finally { work.delete(operation) }
    },
    reset() { if (work.size !== 0) throw new Error('fixture link still active'); nextByteTime = 0; requests = 0; requestBytes = 0; responseBytes = 0 },
    metrics: () => ({ requests, requestBytes, responseBytes, profile }),
    async drain() { await Promise.allSettled([...work]) },
    async close() { lifetime.abort(); await Promise.allSettled(work); work.clear() },
  }
}

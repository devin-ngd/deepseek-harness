/** Guest preload exposes only a registered mount's JSON transport, never Electron or host APIs. */
import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import type { DesktopRichBootstrap } from './rich-types.ts'

if (process.isMainFrame && location.protocol === 'dsh-app:') {
  const bootstrap: unknown = ipcRenderer.sendSync(DESKTOP_IPC.richBootstrap)
  if (typeof bootstrap !== 'object' || bootstrap === null || !('mountId' in bootstrap) || !('mountNonce' in bootstrap)
    || typeof bootstrap.mountId !== 'string' || typeof bootstrap.mountNonce !== 'string') {
    throw new Error('desktop rich: unregistered guest document')
  }
  const identity: DesktopRichBootstrap = { mountId: bootstrap.mountId, mountNonce: bootstrap.mountNonce }
  const listeners = new Set<(packet: Record<string, unknown>) => void>()
  let packetWindow = 0
  let packetCount = 0
  ipcRenderer.on(DESKTOP_IPC.richToGuest, (_event, packet: Record<string, unknown>) => {
    for (const listener of [...listeners]) {
      try { listener(packet) }
      catch (error) { console.error('Rich content listener failed', error) }
    }
  })
  contextBridge.exposeInMainWorld('richGuest', {
    send(packet: Record<string, unknown>): void {
      const now = Date.now()
      if (now - packetWindow >= 1000) { packetWindow = now; packetCount = 0 }
      if (++packetCount > 100) {
        if (packetCount === 101) ipcRenderer.send(DESKTOP_IPC.richFromGuest, { ...identity, packet: { type: 'native.packet-limit' } })
        return
      }
      if (new TextEncoder().encode(JSON.stringify(packet)).byteLength > 128 * 1024) throw new Error('RICH_GUEST_PACKET_TOO_LARGE')
      ipcRenderer.send(DESKTOP_IPC.richFromGuest, { ...identity, packet })
    },
    subscribe(listener: (packet: Record<string, unknown>) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
}

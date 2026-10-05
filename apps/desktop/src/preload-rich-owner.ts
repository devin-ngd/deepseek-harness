/** Lease-scoped native transport owned by the application preload. */
import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { RICH_NATIVE_LIMITS } from './rich-limits.ts'
import type { DesktopRichBridge } from './rich-types.ts'

/** @returns JSON-only rich guest operations, without exposing native IPC. */
export function createDesktopRichBridge(): DesktopRichBridge {
  const listeners = new Map<string, Set<(packet: Record<string, unknown>) => void>>()
  ipcRenderer.on(DESKTOP_IPC.richPacket, (_event, event: unknown) => {
    if (typeof event !== 'object' || event === null || !('lease' in event) || !('packet' in event)
      || typeof event.lease !== 'string' || typeof event.packet !== 'object' || event.packet === null || Array.isArray(event.packet)) return
    const packet = event.packet as Record<string, unknown>
    for (const listener of [...(listeners.get(event.lease) ?? [])]) {
      try { listener(packet) }
      catch (error) { console.error('Rich host listener failed', error) }
    }
  })
  return {
    limits: RICH_NATIVE_LIMITS,
    acquire: request => ipcRenderer.invoke(DESKTOP_IPC.richAcquire, request) as ReturnType<DesktopRichBridge['acquire']>,
    send: (lease, packet) => ipcRenderer.invoke(DESKTOP_IPC.richSend, lease, packet) as Promise<void>,
    release: lease => ipcRenderer.invoke(DESKTOP_IPC.richRelease, lease) as Promise<void>,
    subscribe(lease, listener) {
      let callbacks = listeners.get(lease)
      if (callbacks === undefined) { callbacks = new Set(); listeners.set(lease, callbacks) }
      callbacks.add(listener)
      return () => { callbacks.delete(listener); if (callbacks.size === 0 && listeners.get(lease) === callbacks) listeners.delete(lease) }
    },
  }
}

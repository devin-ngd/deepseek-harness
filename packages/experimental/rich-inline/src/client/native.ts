/** Narrow optional Desktop IPC adapter; generated content receives none of this object. */

/** One main-process authorized, non-persistent guest reservation. */
export interface RichReservation { readonly lease: string; readonly partition: string; readonly src: string }
/** Main-owned directional byte budgets, not generated-content permission declarations. */
export interface NativeRichLimits {
  readonly documentBytes: number
  readonly sdkBytes: number
  readonly guestPacketBytes: number
  readonly hostPacketBytes: number
}
/** Native owner accepts bounded content bytes, never a guest-selected URL or preload. */
export interface NativeRichBridge {
  /** Fixed resource limits supplied by the trusted preload. */
  readonly limits: NativeRichLimits
  /** @param request - host-derived identity and committed content. @returns the isolated guest lease. */
  acquire(this: void, request: {
    mountId: string
    mountNonce: string
    html: string
    css: string
    js: string
    sdk?: string
  }): Promise<RichReservation>
  /** @param lease - registered lease. @param packet - protocol envelope. */
  send(this: void, lease: string, packet: Record<string, unknown>): Promise<void>
  /** @param lease - registered lease. @param listener - bounded guest-intent handler. @returns unsubscribe. */
  subscribe(this: void, lease: string, listener: (packet: Record<string, unknown>) => void): () => void
  /** @param lease - registered lease to revoke and terminate. */
  release(this: void, lease: string): Promise<void>
}

/**
 * Find the trusted preload's optional rich adapter.
 * @returns no capability on ordinary Web clients.
 */
export function nativeRich(): NativeRichBridge | undefined {
  const carrier = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion: number; rich?: NativeRichBridge }
  }).dshDesktop
  return carrier?.protocolVersion === 1 ? carrier.rich : undefined
}

/** Fixed transport budgets disclosed only to the trusted application renderer. */
export interface DesktopRichLimits {
  readonly documentBytes: number
  readonly sdkBytes: number
  readonly guestPacketBytes: number
  readonly hostPacketBytes: number
}

/** JSON-only operations available to the trusted application renderer. */
export interface DesktopRichRequest {
  readonly mountId: string
  readonly mountNonce: string
  readonly html: string
  readonly css: string
  readonly js: string
  /** Separate SDK script so a syntax error in authored code cannot suppress diagnostics. */
  readonly sdk?: string
}

/** One disposable native guest; its source is fixed by the main process. */
export interface DesktopRichReservation {
  readonly lease: string
  readonly partition: string
  readonly src: string
}

/** Native transport only; the feature plugin validates its business protocol. */
export interface DesktopRichBridge {
  readonly limits: DesktopRichLimits
  acquire(request: DesktopRichRequest): Promise<DesktopRichReservation>
  send(lease: string, packet: Record<string, unknown>): Promise<void>
  subscribe(lease: string, listener: (packet: Record<string, unknown>) => void): () => void
  release(lease: string): Promise<void>
}

/** Main-owned mount identity, without host paths, credentials or application APIs. */
export interface DesktopRichBootstrap {
  readonly mountId: string
  readonly mountNonce: string
}

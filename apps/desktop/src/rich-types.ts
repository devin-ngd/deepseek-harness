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
  /** Localized copy UI, absent for inert streaming previews. */
  readonly copy?: DesktopRichCopyLabels
}

/** Copy controls receive their complete localized wording from the owning client plugin. */
export interface DesktopRichCopyLabels {
  readonly text: string
  readonly image: string
  readonly copied: string
  readonly failed: string
}

/** Only a trusted activation in the isolated preload can submit these clipboard bytes. */
export type DesktopRichCopyValue = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'image'; readonly data: string }

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
  readonly copy?: DesktopRichCopyLabels
}

/** Fixed native budgets, safe to import into the sandboxed application preload. */
import type { DesktopRichLimits } from './rich-types.ts'

/** Immutable process-owned budgets for document bootstrap and both IPC directions. */
export const RICH_NATIVE_LIMITS: DesktopRichLimits = Object.freeze({
  documentBytes: 2 * 1024 * 1024 + 64 * 1024,
  sdkBytes: 64 * 1024,
  guestPacketBytes: 128 * 1024,
  hostPacketBytes: 16 * 1024 * 1024,
})

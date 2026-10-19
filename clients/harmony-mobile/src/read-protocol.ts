/** Bounded mobile reads project current DSH APIs without exposing host paths or arbitrary attachment selectors to guests. */
import type { JsonValue } from './upstream.ts'
import type { SessionId } from './protocol.ts'
import { id } from './protocol.ts'
import { object, integer, string, boolean } from './domain.ts'
import { TransportError } from './wire.ts'

/** Ephemeral catalogue continuation; it is never a network credential. */
export type ReadCursor = import('./upstream.ts').Branded<'mobile-read-cursor'>
/** Immutable volatile catalogue identity, distinct from a continuation. */
export type ReadSnapshotId = import('./upstream.ts').Branded<'mobile-read-snapshot'>
/** Disposable image lease bound to a native device and Session. */
export type ImageHandle = import('./upstream.ts').Branded<'mobile-image-handle'>
/** Server and client receive explicit deployment limits. */
export interface ReadLimits {
  readonly maxSourceItems: number; readonly maxPageItems: number; readonly maxSnapshots: number; readonly maxSnapshotBytes: number; readonly snapshotTtlMs: number
  readonly maxHistoryEvents: number; readonly maxImageBytes: number; readonly maxImageDimension: number; readonly maxImagePixels: number
  readonly maxImageHandles: number; readonly imageTtlMs: number; readonly maxImageChunkBytes: number; readonly maxInFlight: number
}
/** Project grouping contains only granted Session count, with no directory path. */
export interface ProjectRow { readonly projectId: import('@deepseek-ai/dsh-workspace/types').WorkspaceId; readonly title: string; readonly sessionCount: number }
/** Current upstream list metadata; unsupported formats remain visible and read-only. */
export interface SessionRow { readonly sessionId: SessionId; readonly updatedAt: number; readonly running: boolean; readonly agentAvailable: boolean; readonly formatStatus: 'current' | 'migration-required' | 'unknown' }
/** One page belongs to an immutable, expiring catalogue snapshot. */
export interface CatalogPage { readonly protocol: 'dsh-mobile-read/1'; readonly kind: 'projects' | 'sessions'; readonly scope: 'projects' | ProjectRow['projectId']; readonly snapshotId: ReadSnapshotId; readonly expiresAt: number; readonly next: ReadCursor | null; readonly items: readonly (ProjectRow | SessionRow)[] }
/** Trusted image metadata contains no host filename, URL or bearer credential. */
export interface ImageLease { readonly protocol: 'dsh-mobile-read/1'; readonly handle: ImageHandle; readonly sessionId: SessionId; readonly attachmentId: import('@deepseek-ai/dsh-attachment/types').AttachmentId; readonly mediaType: string; readonly bytes: number; readonly width: number; readonly height: number; readonly expiresAt: number }
/** @param limits - deployment resource policy. Reject invalid configurations before any service read. */
export function validateReadLimits(limits: ReadLimits): void { for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new TransportError('invalid-config') }
/** @param value - decoded JSON. @param max - byte ceiling. @returns original value after admission. */
export function readBound(value: JsonValue, max: number): JsonValue { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > max) throw new TransportError('read-too-large'); return value }
/** @param value - wire page. @param kind - native requested list. @param scope - native requested grouping. @param limits - response bounds. @returns a complete path-free page. */
export function decodeCatalog(value: JsonValue, kind: CatalogPage['kind'], scope: string, limits: ReadLimits): CatalogPage {
  const page = object(readBound(value, limits.maxSnapshotBytes))
  if (page.protocol !== 'dsh-mobile-read/1') throw new TransportError('read-version-unsupported')
  if (page.kind !== kind || page.scope !== scope || !Array.isArray(page.items) || page.items.length > limits.maxPageItems) throw new TransportError('scope-denied')
  const items = page.items.map(candidate => {
    const row = object(candidate)
    if (kind === 'projects') { if (Object.keys(row).some(key => !['projectId', 'title', 'sessionCount'].includes(key))) throw new TransportError('domain-invalid'); return { projectId: id<'WorkspaceId'>(string(row.projectId, 128)), title: string(row.title, 4096), sessionCount: integer(row.sessionCount) } }
    if (Object.keys(row).some(key => !['sessionId', 'updatedAt', 'running', 'agentAvailable', 'formatStatus'].includes(key)) || !['current', 'migration-required', 'unknown'].includes(String(row.formatStatus))) throw new TransportError('domain-invalid')
    return { sessionId: id<'SessionId'>(string(row.sessionId, 128)), updatedAt: integer(row.updatedAt), running: boolean(row.running), agentAvailable: boolean(row.agentAvailable), formatStatus: row.formatStatus as SessionRow['formatStatus'] }
  })
  const identities = items.map(row => 'projectId' in row ? row.projectId : row.sessionId)
  if (new Set(identities).size !== identities.length) throw new TransportError('read-conflict')
  return { protocol: 'dsh-mobile-read/1', kind, scope: kind === 'projects' ? 'projects' : id<'WorkspaceId'>(scope), snapshotId: id<'mobile-read-snapshot'>(string(page.snapshotId, 128)), expiresAt: integer(page.expiresAt), next: page.next === null ? null : id<'mobile-read-cursor'>(string(page.next, 128)), items }
}
/** @param value - wire lease. @param sessionId - native-selected Session. @param attachmentId - persisted image identity. @param limits - encoded and decoded memory bounds. @returns admitted immutable metadata. */
export function decodeImageLease(value: JsonValue, sessionId: SessionId, attachmentId: string, limits: ReadLimits): ImageLease {
  const lease = object(value), bytes = integer(lease.bytes), width = integer(lease.width, 1), height = integer(lease.height, 1)
  if (lease.protocol !== 'dsh-mobile-read/1') throw new TransportError('read-version-unsupported')
  if (lease.sessionId !== sessionId || lease.attachmentId !== attachmentId) throw new TransportError('scope-denied')
  if (bytes > limits.maxImageBytes || width > limits.maxImageDimension || height > limits.maxImageDimension || width * height > limits.maxImagePixels || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(lease.mediaType))) throw new TransportError('image-too-large')
  return { protocol: 'dsh-mobile-read/1', handle: id<'mobile-image-handle'>(string(lease.handle, 128)), sessionId, attachmentId: id<'AttachmentId'>(attachmentId), mediaType: string(lease.mediaType, 128), bytes, width, height, expiresAt: integer(lease.expiresAt) }
}

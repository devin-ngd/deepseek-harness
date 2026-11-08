/** Versioned messages for the trusted standard workspace; rich guests never receive this port. */
import { z } from 'zod'
import { id } from './protocol.ts'

/** Carrier stream for the standard Client Modules graph and rebuild notifications. */
export const WORKSPACE_PLUGIN_EVENTS = 'harmony-workspace/plugin-events'
/** Standard HMR Fetch route; its browser protocol remains SSE. */
export const WORKSPACE_PLUGIN_EVENTS_PATH = '/plugins/events'
/** Response header the desktop channel sets when a path under `/api` is not served to a phone; its value is `unregistered` or `owner-only`. */
export const WORKSPACE_ROUTE_HEADER = 'x-dsh-workspace-route'

/** @param method - the admitted Fetch request method. @param status - the final Fetch response status. @returns whether a body is permitted on the response. */
export function workspaceAllowsResponseBody(method: string, status: number): boolean {
  return method !== 'HEAD' && status !== 204 && status !== 205 && status !== 304
}

const handle = z.string().min(1).max(256).transform(value => id<'harmony-workspace-handle'>(value))
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const headers = z.array(z.tuple([z.string().max(256), z.string().max(8192)])).max(128)
const encoded = z.string().max(1398104).regex(/^[A-Za-z0-9_-]*$/)
/** A body is pulled in ordered bounded pieces; an interrupted mutation is never resent. */
export const workspaceBodySchema = z.object({ id: handle, bytes }).strict()
/** Validated request vocabulary carried inside the existing encrypted unary device channel. */
export const workspaceRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('bootstrap') }).strict(),
  z.object({ operation: z.literal('manifest') }).strict(),
  z.object({ operation: z.literal('close') }).strict(),
  z.object({ operation: z.literal('fetch'), url: z.string().max(8192), method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']), headers, body: encoded.optional() }).strict(),
  z.object({ operation: z.literal('read'), id: handle, offset: bytes }).strict(),
  z.object({ operation: z.literal('release'), id: handle }).strict(),
  z.object({ operation: z.literal('stream-open'), endpoint: z.string().min(1).max(512), payload: z.unknown() }).strict(),
  z.object({ operation: z.literal('stream-next'), id: handle }).strict(),
  z.object({ operation: z.literal('stream-write'), id: handle, value: z.unknown() }).strict(),
  z.object({ operation: z.literal('stream-end'), id: handle }).strict(),
  z.object({ operation: z.literal('stream-close'), id: handle }).strict(),
])
/** Decrypted input is parsed before dispatch and is never a desktop permission grant. */
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>
/** Opaque transfer/stream identifier owned by a single workspace connection generation. */
export type WorkspaceHandle = z.infer<typeof handle>
/** Response metadata is separate from potentially large binary bytes. */
export const workspaceResponseSchema = z.object({ status: z.number().int().min(200).max(599), headers, body: workspaceBodySchema }).strict()
/** An ordered resource piece; offset and total size are checked again by the receiver. */
export const workspaceChunkSchema = z.object({ offset: bytes, body: encoded, done: z.boolean() }).strict()
/** One stream result is itself a bounded transfer, preserving large standard JSON frames. */
export const workspaceNextSchema = z.discriminatedUnion('done', [
  z.object({ done: z.literal(true), failure: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }).strict().optional() }).strict(),
  z.object({ done: z.literal(false), body: workspaceBodySchema }).strict(),
])
/** Opened stream identity, distinct from its transient frame transfers. */
export const workspaceStreamSchema = z.object({ id: handle }).strict()
const resourcePath = z.string().min(1).max(8192).refine(value => {
  if (!value.startsWith('/') || value.startsWith('//') || /[#\\\u0000-\u0020]/.test(value)) return false
  const url = new URL(value, 'https://workspace.dsh.invalid')
  return url.pathname + url.search === value && !url.pathname.startsWith('/api/') && url.pathname !== WORKSPACE_PLUGIN_EVENTS_PATH
})
/** Versioned standard shell inventory for native cache consistency; paths contain no Host filesystem locations. */
export const workspaceShellManifestSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  resources: z.array(z.object({ path: resourcePath, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes, mediaType: z.string().min(1).max(256) }).strict()).max(20000).refine(rows => new Set(rows.map(row => row.path)).size === rows.length),
}).strict()

/** Message-port vocabulary shared by the verified workspace document and its native owner. */
import { z } from 'zod'
import { workspaceRichPolicySchema } from './workspace-rich-protocol.ts'
const correlation = z.string().regex(/^[0-9]{1,16}$/)
const workspaceLoadFailure = z.enum(['renderer-boot', 'navigation', 'native-reply', 'script-error', 'promise-rejection'])
/** Fixed diagnostic stage from the document. Error messages and payloads stay off the port. */
export type WorkspaceLoadFailure = z.infer<typeof workspaceLoadFailure>
/** The document's port can request only the separately granted workspace or cancel its own wait. */
export const workspacePortMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace.request'), id: correlation, request: z.string() }).strict(),
  z.object({ kind: z.literal('workspace.rich-request'), id: correlation, request: z.string() }).strict(),
  z.object({ kind: z.literal('workspace.cancel'), id: correlation }).strict(),
  z.object({ kind: z.literal('workspace.selection'), sessionId: z.string().min(1).max(256).nullable() }).strict(),
  z.object({ kind: z.literal('workspace.ready') }).strict(),
  z.object({ kind: z.literal('workspace.failed'), stage: workspaceLoadFailure.optional() }).strict(),
])
/** @param raw - untrusted Web message. @param maxBytes - native message budget. @returns normalized strict envelope JSON, without authorizing an operation. */
export function workspacePortMessage(raw: string, maxBytes: number): string {
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('workspace port capacity')
  return JSON.stringify(workspacePortMessageSchema.parse(JSON.parse(raw)))
}
/** Browser-owned native initialization; it contains public presentation limits and a navigation target only. */
export const workspaceDocumentInitSchema = z.object({
  protocol: z.literal('harmony-workspace/1'), sessionId: z.string().max(256), plugin: z.string().max(256).optional(),
  limits: z.object({ origin: z.string(), maxRequestBytes: z.number().int().positive(), maxResponseBytes: z.number().int().positive(),
    maxChunkBytes: z.number().int().positive(), maxPending: z.number().int().positive(), maxPacketBytes: z.number().int().positive() }).strict(),
  rich: workspaceRichPolicySchema.optional(),
}).strict()
/** Browser reply echoes correlation and keeps JSON payload validation with its operation owner. */
export const workspacePortReplySchema = z.object({ kind: z.literal('workspace.reply'), id: correlation,
  value: z.string(), error: z.boolean() }).strict()
/** Native rich packets carry a native-selected lease; workspace closure revokes every document wait. */
export const workspaceNativeMessageSchema = z.union([workspacePortReplySchema,
  z.object({ kind: z.literal('workspace.rich-packet'), lease: z.string().min(1).max(256), id: correlation.optional(), packet: z.string() }).strict(),
  z.object({ kind: z.literal('workspace.closed') }).strict(),
])

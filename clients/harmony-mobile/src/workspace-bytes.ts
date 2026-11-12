/** Shared bounded resource assembly for browser and native workspace owners. */
import { workspaceBodySchema, workspaceChunkSchema, type WorkspaceRequest } from './workspace-protocol.ts'

/** Codec and request ownership stay with the platform carrier. */
export interface WorkspaceBytePorts {
  request(value: WorkspaceRequest): Promise<unknown>
  release(value: WorkspaceRequest): Promise<unknown>
  decode(value: string): Uint8Array
}
/** @param candidate - untrusted transfer descriptor. @param ports - admitted requests and maintained byte decoder. @param limits - explicit assembly/chunk limits. @returns exact-length bytes after ordered reads; failed reads release their retained Host body. */
export async function readWorkspaceBytes(candidate: unknown, ports: WorkspaceBytePorts,
  limits: { readonly maxBytes: number; readonly maxChunkBytes: number }): Promise<Uint8Array<ArrayBuffer>> {
  const body = workspaceBodySchema.parse(candidate)
  let complete = false
  try {
    if (body.bytes > limits.maxBytes) throw new Error('workspace response too large')
    const bytes = new Uint8Array(body.bytes)
    let offset = 0
    while (true) {
      const chunk = workspaceChunkSchema.parse(await ports.request({ operation: 'read', id: body.id, offset }))
      const piece = chunk.body.length === 0 ? new Uint8Array(0) : ports.decode(chunk.body)
      if (chunk.offset !== offset || piece.byteLength > limits.maxChunkBytes || piece.byteLength > body.bytes - offset
        || (!chunk.done && piece.byteLength === 0)) throw new Error('workspace transfer invalid')
      bytes.set(piece, offset); offset += piece.byteLength
      if (chunk.done) {
        if (offset !== body.bytes) throw new Error('workspace transfer incomplete')
        complete = true
        return bytes
      }
    }
  } finally { if (!complete) await ports.release({ operation: 'release', id: body.id }) }
}

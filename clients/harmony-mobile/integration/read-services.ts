/** Read-only canonical services for an isolated sourceComposition; no prompt, upload, path projection or installed application access. */
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment/types'
import type { ReadServicePorts } from '../src/read-adapter.ts'
import { object, integer, string } from '../src/domain.ts'
import { id } from '../src/protocol.ts'

/** @param ctx - isolated synthetic source context. @returns existing Workspace, Session list/page and verified attachment reads under the offline dispatch guard. */
export function realReadPorts(ctx: Context): ReadServicePorts {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('Read fixture requires dispatch hard-block')
  return {
    projects: async signal => { signal.throwIfAborted(); return ctx.workspaceRegistry.list().map(row => ({ workspaceId: row.id, title: row.title, path: row.path, sessionIds: row.sessionIds, createdAt: row.createdAt, updatedAt: row.updatedAt })) },
    sessions: signal => ctx.sessionController.list({}, signal),
    history: (request, signal) => ctx.sessionController.page(request, signal),
    image: (ref, signal) => ctx.attachments.readImage(ref, signal),
    imageReference: async (selection, signal) => {
      const page = await ctx.sessionController.page({ address: { kind: 'session', sessionId: selection.sessionId }, throughSeq: selection.throughSeq, beforeSeq: selection.messageSeq + 1, maxMessages: 1 }, signal)
      for (const record of page.records) {
        const event = record.event; if (event.seq !== selection.messageSeq || !['user/message', 'assistant/message'].includes(event.type)) continue
        const data = object(event.data), message = event.type === 'user/message' ? data : object(data.message)
        if (message.id !== selection.messageId || !Array.isArray(message.content)) continue
        for (const candidate of message.content) {
          const block = object(candidate); if (block.type !== 'image') continue
          const ref = object(block.attachment); if (ref.attachmentId !== selection.attachmentId) continue
          const mediaType = ref.mediaType
          if (mediaType !== 'image/png' && mediaType !== 'image/jpeg' && mediaType !== 'image/webp' && mediaType !== 'image/gif') throw new Error('Invalid persisted image media type')
          const image: ImageAttachmentRef = { attachmentId: id<'AttachmentId'>(string(ref.attachmentId, 128)), mediaType, bytes: integer(ref.bytes), width: integer(ref.width, 1), height: integer(ref.height, 1) }
          return image
        }
      }
      return null
    },
  }
}

/** Content-free diagnostics for one standard history request. */
import { z } from 'zod'
import type { WorkspaceRequest } from '../../src/workspace-protocol.ts'

const cursor = z.number().int().nonnegative()
const requestSchema = z.object({
  type: z.literal('client-request'),
  method: z.literal('session/page'),
  payload: z.object({ args: z.object({ request: z.object({ beforeSeq: cursor.optional() }) }) }),
})
const resultSchema = z.object({
  type: z.literal('server-response'),
  result: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: z.object({ records: z.array(z.unknown()), hasMore: z.boolean() }) }),
    z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
  ]),
})
const recordSchema = z.object({ type: z.literal('event'), event: z.object({ seq: cursor }) })

type PageOutcome = 'advanced' | 'no-progress' | 'empty' | 'initial' | 'scope-denied' | 'bad-request' | 'gateway-error' | 'http-error' | 'unrecognized'
/** Fixed outcome and aggregate size from a bounded, already assembled Host response. */
export type WorkspacePageDiagnostic = {
  readonly outcome: PageOutcome
  readonly status: number
  readonly bytes: number
  readonly records?: number
  readonly hasMore?: boolean
}

/** @param request - validated carrier operation. @returns whether tracing should classify this standard pagination request. */
export function isWorkspaceSessionPage(request: WorkspaceRequest): boolean {
  return request.operation === 'fetch' && request.method === 'POST'
    && /^https:\/\/[^/?#]+\/api\/session\/page(?:\?[^#]*)?$/.test(request.url)
}

/** @param input - bounded Gateway request bytes. @param status - HTTP response status. @param body - bounded response bytes. @returns a fixed classification without request fields, text, or raw error data. */
export function workspacePageDiagnostic(input: Uint8Array | undefined, status: number, body: Uint8Array): WorkspacePageDiagnostic {
  const bytes = body.byteLength
  if (status !== 200) return { outcome: 'http-error', status, bytes }
  const unrecognized = { outcome: 'unrecognized', status, bytes } as const
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const response = resultSchema.safeParse(JSON.parse(decoder.decode(body)))
    if (!response.success) return unrecognized
    const result = response.data.result
    if (!result.ok) {
      const { code } = result.error
      const outcome = code === 'remote-access/denied' ? 'scope-denied' : code === 'gateway/bad-request' ? 'bad-request' : 'gateway-error'
      return { outcome, status, bytes }
    }
    if (input === undefined) return unrecognized
    const request = requestSchema.safeParse(JSON.parse(decoder.decode(input)))
    if (!request.success) return unrecognized
    const { beforeSeq } = request.data.payload.args.request
    const { records, hasMore } = result.value
    const aggregate = { status, bytes, records: records.length, hasMore }
    if (records.length === 0) return { outcome: hasMore ? 'no-progress' : 'empty', ...aggregate }
    if (beforeSeq === undefined) return { outcome: 'initial', ...aggregate }
    const first = recordSchema.safeParse(records[0])
    const last = recordSchema.safeParse(records.at(-1))
    if (!first.success || !last.success) return unrecognized
    return { outcome: first.data.event.seq < beforeSeq && last.data.event.seq === beforeSeq - 1 ? 'advanced' : 'no-progress', ...aggregate }
  } catch (error) {
    void error
    return unrecognized
  }
}

/** Bounded file carrier for original-browser replay qualification; available only inside the closed synthetic restart fixture. */
import type { Context } from '@deepseek-ai/cordis'
import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { MobileOperation } from '../../src/link-protocol.ts'
import type { SessionId } from '../../src/protocol.ts'
const envelope = z.discriminatedUnion('kind', [z.object({ kind: z.literal('request'), raw: z.string().min(1).max(1048576) }).strict(), z.object({ kind: z.literal('finish') }).strict()])
const packet = z.object({ kind: z.literal('rich.request'), id: z.string().min(1).max(128), operation: z.enum(['rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status']), payload: z.record(z.string(), z.unknown()) }).strict()
const receiptSchema = z.object({ accepted: z.boolean(), actionId: z.string().uuid() }).passthrough()
/** Actual SDK identity and canonical settlement observations; no caller-selected action id exists in the fixture configuration. */
export interface BrowserFixtureResult { readonly actionId: string; readonly richCompleted: true; readonly richDuplicate: true; readonly invokeCalls: number; readonly canonicalCompletedActionIds: readonly string[] }
/** @param ctx - guarded canonical services. @param home - fresh synthetic profile home. @param sessionId - exact fixed Session. @param mount - unmodified service mount result. @param request - existing scoped executor. @param signal - profile cleanup signal. @param waitMs - validated bounded fixture lifetime. @returns after original browser input completes and its byte-identical duplicate is acknowledged. */
export async function serveBrowserFixture(ctx: Context, home: string, sessionId: SessionId, mount: { readonly mountId: string }, request: (operation: MobileOperation, payload: Readonly<Record<string, unknown>>) => Promise<unknown>, signal: AbortSignal, waitMs: number): Promise<BrowserFixtureResult> {
  if (process.env.DSH_HARMONY_OFFLINE_PROFILE !== 'restart-four-v1' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('closed browser replay guard required')
  const save = (name: string, value: unknown) => writeFileAtomic(join(home, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  await save('browser-mount.json', { pid: process.pid, mount })
  let sequence = 1, actionId: string | undefined, completed = false, duplicate = false, invokeCalls = 0, originalPacket: string | undefined, originalReceipt: string | undefined
  let canonicalCompletedActionIds: string[] = [], completedSnapshot: unknown
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const path = join(home, 'browser-request-' + sequence + '.json')
    let raw: string | undefined
    try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error('browser fixture file refused'); raw = await readFile(path, 'utf8'); if (Buffer.byteLength(raw) > 1048576) throw new Error('browser fixture capacity') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
    if (raw !== undefined) {
      const input = envelope.parse(JSON.parse(raw))
      if (input.kind === 'finish') {
        if (actionId === undefined || !completed || !duplicate || invokeCalls !== 2 || canonicalCompletedActionIds.length !== 1 || canonicalCompletedActionIds[0] !== actionId) throw new Error('original browser completion evidence incomplete')
        await save('browser-response-' + sequence + '.json', { finished: true })
        return { actionId, richCompleted: true, richDuplicate: true, invokeCalls, canonicalCompletedActionIds }
      }
      const call = packet.parse(JSON.parse(input.raw)); if (call.payload.mountId !== mount.mountId) throw new Error('browser fixture mount refused')
      const value = await request(call.operation, call.payload)
      if (call.operation === 'rich.invoke') {
        const receipt = receiptSchema.parse(value); if (!receipt.accepted) throw new Error('original form not admitted')
        invokeCalls++
        if (actionId === undefined) { actionId = receipt.actionId; originalPacket = input.raw; originalReceipt = JSON.stringify(value) }
        else { if (receipt.actionId !== actionId || input.raw !== originalPacket || JSON.stringify(value) !== originalReceipt) throw new Error('original SDK duplicate changed'); duplicate = true }
      }
      await save('browser-response-' + sequence + '.json', { kind: 'rich.reply', id: call.id, value }); sequence++
    }
    if (actionId !== undefined && !completed) {
      const status = z.object({ state: z.string() }).passthrough().parse(await request('rich.status', { mountId: mount.mountId, actionId }))
      if (status.state === 'completed') {
        await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush()
        const inspection = await ctx.sessionController.inspect(sessionId)
        canonicalCompletedActionIds = inspection.events.flatMap(event => event.type !== 'assistant/message' ? [] : event.data.message.content.flatMap(block => block.type === 'tool-call' && block.name === 'rich_inline_complete' ? [z.object({ actionId: z.string() }).passthrough().parse(JSON.parse(block.arguments)).actionId] : []))
        completedSnapshot = await request('rich.snapshot', { mountId: mount.mountId })
        completed = true
      }
    }
    if (actionId !== undefined) await save('browser-observed.json', { actionId, completed, duplicate, invokeCalls, canonicalCompletedActionIds, completedSnapshot, realModels: ctx.llm.getOfflineReplayCounts().realCalls })
    await new Promise<void>(accept => setTimeout(accept, 20))
  }
  throw new Error('original browser replay deadline')
}

/** Exactly four offline responses: one direct answer, a parent delegation, a child answer and the parent's completion. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AssistantStreamAccumulator, createAssistantMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'

const answer = (text: string): StreamChunk[] => [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }]
/** @param ctx - synthetic Host with no account or real provider access. @param world - unique scenario directory. @returns replay counter and observed model inputs; the child uses the canonical persisted stream format. */
export async function installWorkspaceDevflowReplay(ctx: Context, world: string) {
  const file = join(world, 'workflow-parent.json'), child = join(world, 'workflow-child.jsonl')
  const args = JSON.stringify({ prompt: 'Return WORKSPACE_CHILD_OK without using tools.', purpose: 'code', access: 'readonly', contextMode: 'spawn' })
  const callId = ToolCallId('workspace-delegation')
  const tool: StreamChunk[] = [{ type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name: 'devflow_delegate', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'devflow_delegate', arguments: args } }, { type: 'finish', reason: { kind: 'tool-calls' } }]
  await writeFile(file, JSON.stringify([answer('WORKSPACE_DIRECT_OK'), tool, answer('WORKSPACE_PARENT_OK')].map(chunks => ({ kind: 'chunks', chunks }))) + '\n')
  const stream = new AssistantStreamAccumulator(), chunks = answer('WORKSPACE_CHILD_OK')
  for (const [index, chunk] of chunks.entries()) stream.push({ time: index, chunk })
  await writeFile(child, [
    { type: 'session', version: SESSION_FORMAT_VERSION, id: 'workspace-child-fixture', createdAt: 1, isSeeded: false, delegationDepth: 0 },
    { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 0, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: 2, time: chunks.length, data: { turn: 1, step: 1, stream: [...stream.snapshot()],
      message: createAssistantMessage({ content: [{ type: 'text', text: 'WORKSPACE_CHILD_OK' }], source: { provider: 'workspace-replay', model: 'worker' } }) }, surfaceOp: 'append' },
    { type: 'step/end', seq: 3, time: chunks.length + 1, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: 4, time: chunks.length + 2, data: { turn: 1, reason: { kind: 'completed' } } },
  ].map(value => JSON.stringify(value)).join('\n') + '\n')
  const calls: GenerateOptions<string>[] = []
  const stop = ctx.on('llm-replay/request', options => { calls.push(options) })
  const handle = installLlmReplay(ctx, { file, overrideFile: file, childFiles: [child], offline: true, providers: [{ id: 'workspace-replay', models: [
    { id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }, { id: 'worker', contextWindow: 100000, defaultMaxTokens: 1000, reasoningEfforts: ['low', 'high'] },
  ] }] })
  return { calls, count: () => calls.length, assertConsumed() { handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed(); ctx.llm.assertZeroRealCalls() }, dispose() { stop(); handle.dispose() } }
}

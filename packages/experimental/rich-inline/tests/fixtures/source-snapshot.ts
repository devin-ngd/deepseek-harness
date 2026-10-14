/** Synthetic state provider; actual SDK requests pass through the production tools and projection. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { RichBlockId } from '../../src/shared/types.ts'
import { installRichTools } from '../../src/host/tools.ts'
import { installRichSourceOffload, readRichSource } from '../../src/host/source.ts'
import { RICH_APPEARANCE_GUIDANCE, RICH_AUTHORING_GUIDANCE, RICH_OUTPUT_FORMAT_GUIDANCE, richAppearanceReminder } from '../../src/host/guidance.ts'

export const name = 'rich-source-snapshot'
export const inject = ['sessions', 'tools', 'agents', 'llm', 'systemPrompt']
/** Mount a fixed revision provider and verify the actual replay adapter requests.
 * @param ctx - real SDK profile services; no external model or native renderer.
 */
export function apply(ctx: Context): void {
  const blockId = brandString<RichBlockId>('rich-synthetic')
  let dataRevision = 0
  installRichTools(ctx, {
    async publish(_sessionId, input) {
      assert.equal(input.blockId, undefined)
      dataRevision = 1
      return { blockId, renderRevision: 1, dataRevision, marker: '[[rich-inline:rich-synthetic]]' }
    },
    async updateData(_sessionId, input) {
      if (input.blockId !== blockId || input.expectedRenderRevision !== 1 || input.expectedDataRevision !== dataRevision) throw new Error('STALE_DATA')
      return { blockId, dataRevision: ++dataRevision }
    },
    async prepareCompletion() { throw new Error('fixture has no interaction action') },
    async readSource(sessionId, request) {
      const session = ctx.sessions.get(sessionId)
      assert.ok(session)
      return readRichSource(session.snapshotEvents(), request, 8192)
    },
  }, 131072)
  installRichSourceOffload(ctx, 1, async (sessionId) => {
    const session = ctx.sessions.get(sessionId)
    assert.ok(session)
    return session.snapshotEvents()
  })
  // Keep the output rule in this tool-only fixture while unrelated optional runtime context stays disabled.
  ctx.systemPrompt.context({ name: 'rich-inline:output-format', required: true,
    order: ctx.systemPrompt.getContextOrder('APPROVAL_POLICY') + 1,
    text: RICH_OUTPUT_FORMAT_GUIDANCE + '\n' + richAppearanceReminder({ theme: 'cyber', accent: 'auto' }) })
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.restrict({ allow: ['rich_inline_complete', 'rich_inline_progress', 'rich_inline_publish', 'rich_inline_read', 'rich_inline_update'] })
    agent.ctx.systemPrompt.section({ name: 'rich-source-fixture', order: 0, complete: true,
      text: 'You are an AI agent powered by DeepSeek Harness.\n\nSynthetic rich-inline source projection verification.\n\n'
        + RICH_AUTHORING_GUIDANCE + '\n\n' + RICH_APPEARANCE_GUIDANCE })
    return undefined
  })
  ctx.provide('richSourceSnapshotReady', true)
  const requests: object[] = []
  const rawRequests: object[] = []
  const references = new Map<string, string>()
  let completed = false
  const recordCounts = (phase: string): void => {
    if (completed) return
    if (process.env.DSH_RICH_COUNTS_FILE !== undefined) writeFileSync(process.env.DSH_RICH_COUNTS_FILE,
      JSON.stringify({ phase, requests: requests.length, ...ctx.llm.getOfflineReplayCounts() }, null, 2) + '\n')
  }
  recordCounts('fixture-mounted')
  ctx.on('llm/adapters-updated', () => { recordCounts('adapter-registration') })
  const golden = fileURLToPath(new URL('../../../../../snapshots/sdk/rich-inline-source/requests.expected.json', import.meta.url))
  ctx.on('llm-replay/request', (options) => {
    const calls = options.messages.flatMap(message => message.content.flatMap((part) => {
      if (part.type !== 'tool-call') return []
      const input = JSON.parse(part.arguments) as { richSource?: { sourceRef: string } }
      if (input.richSource !== undefined) {
        const ref = input.richSource.sourceRef
        assert.match(ref, /^source-[a-f0-9]{64}$/u)
        if (!references.has(ref)) references.set(ref, `{{source:${references.size + 1}}}`)
        input.richSource.sourceRef = references.get(ref)!
      }
      return [{ id: part.id, name: part.name, arguments: input }]
    }))
    requests.push({ calls, results: options.messages.filter(message => message.role === 'tool')
      .map(message => ({ callId: message.toolCallId, isError: message.isError === true })),
    tools: options.tools?.map(tool => tool.name).filter(name => name.startsWith('rich_inline_')).sort() })
    rawRequests.push({ messages: options.messages, tools: options.tools?.map(tool => tool.name) })
    recordCounts('adapter-request')
    if (process.env.DSH_RICH_REQUESTS_FILE !== undefined) writeFileSync(process.env.DSH_RICH_REQUESTS_FILE,
      JSON.stringify({ signatures: requests, adapterRequests: rawRequests }, null, 2) + '\n')
    assert.deepEqual(requests, (JSON.parse(readFileSync(golden, 'utf8')) as object[]).slice(0, requests.length), 'independent SDK adapter request oracle')
    assert.ok(options.messages.some(message => message.source?.kind === 'runtime-context'
      && message.content.some(part => part.type === 'text' && part.text.includes('Current working directory: '))), 'required working directory reaches every adapter request')
    assert.ok(options.messages.some(message => message.role === 'system'
      && message.content.some(part => part.type === 'text' && part.text.includes(RICH_AUTHORING_GUIDANCE))), 'HTML authoring guidance reaches the adapter')
    assert.ok(options.messages.some(message => message.source?.kind === 'runtime-context'
      && message.content.some(part => part.type === 'text' && part.text.includes(RICH_OUTPUT_FORMAT_GUIDANCE))), 'HTML output reminder reaches every adapter request')
    const text = JSON.stringify(options.messages)
    assert.ok(!text.includes('<p>Mnemo synthetic rows</p>'), 'published HTML must be absent from actual later requests')
    assert.ok(!text.includes('window.localFilter'), 'published JS must be absent from actual later requests')
    if (requests.length === 4) assert.ok(options.messages.some(message => message.role === 'tool'
      && message.isError === true && JSON.stringify(message.content).includes('STALE_DATA')), 'failed tool result remains visible')
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const counts = ctx.llm.getOfflineReplayCounts()
    const completionVerified = event.data.reason.kind === 'completed'
    if (completionVerified) ctx.llm.assertOfflineReplayConsumed()
    if (process.env.DSH_RICH_COUNTS_FILE !== undefined) writeFileSync(process.env.DSH_RICH_COUNTS_FILE,
      JSON.stringify({ phase: 'turn/end', sessionId: session.id, turnEnd: event.data, completionVerified,
        requests: requests.length, ...counts }, null, 2) + '\n')
    completed = true
  })
}

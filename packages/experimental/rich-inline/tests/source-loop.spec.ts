/** Real AgentLoop request construction with an in-process fixed adapter; no provider calls. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { installRichSourceOffload, readRichSource } from '../src/host/source.ts'

describe('source offload model requests', () => {
  it('sends a shorter second request, preserves admission fields and records replay semantics', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(AgentRegistry)
      await ctx.plugin(AgentLoop, { agents: [] })
      const source = { key: 'result', html: '<p>Synthetic ISP ROI image comparison</p>'.repeat(150),
        css: 'p{color:CanvasText}', js: 'window.localZoom = value => value', fallbackText: 'Synthetic ROI comparison', stateSchemaVersion: 1 }
      const authored = '```rich-html\n' + JSON.stringify(source) + '\n```'
      const adapter = new MockAdapter([textResponse(authored), textResponse('Follow-up fixture')])
      ctx.llm.registerAdapter(['fixed'], adapter)
      installRichSourceOffload(ctx, 1, async (sessionId) => {
        const session = ctx.sessions.get(sessionId)
        if (session === undefined) throw new Error('missing fixture Session')
        return session.snapshotEvents()
      })
      ctx.on('agent/pre-step', async (_payload, next) => {
        const decision = await next()
        return decision.kind === 'enter' ? { ...decision, startsRequestSeries: true } : decision
      })
      const agent = await ctx.agentLoop.create(SessionId('source-loop-fixed'), { provider: 'fixed', model: 'fixed' })
      for (const task of ['Make a synthetic ROI comparison', 'Change the comparison label']) {
        agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' } }))
        await agent.whenIdle()
      }
      expect(adapter.requests, JSON.stringify(agent.session.snapshotEvents())).toHaveLength(2)
      const request = adapter.requests[1]
      if (request === undefined) throw new Error('missing second request')
      const assistant = request.messages.find(message => message.role === 'assistant')
      if (assistant?.role !== 'assistant') throw new Error('missing historical Assistant')
      const actual = JSON.stringify(assistant.content)
      expect(actual).not.toContain(source.html)
      expect(actual).not.toContain(source.js)
      expect(actual).toContain('sourceRef')
      expect(actual.length).toBeLessThan(authored.length)
      const events = agent.session.snapshotEvents()
      const original = events.find(event => event.type === 'assistant/message')
      expect(original?.type === 'assistant/message' ? original.data.message.id : null).toBe(assistant.id)
      expect({ originalContentBytes: original?.type === 'assistant/message' ? Buffer.byteLength(JSON.stringify(original.data.message.content)) : null,
        projectedContentBytes: Buffer.byteLength(actual) }).toMatchInlineSnapshot(`
          {
            "originalContentBytes": 6378,
            "projectedContentBytes": 258,
          }
        `)
      expect(JSON.stringify(events)).toContain(source.html)
      const declaration = events.find(event => event.type === 'rich-inline/source-offload')
      if (declaration?.type !== 'rich-inline/source-offload' || declaration.data.targets[0] === undefined) throw new Error('missing source declaration')
      expect(readRichSource(events, { sourceRef: declaration.data.targets[0].sourceRef, field: 'js', offset: 0, length: 100 }, 100).text).toBe(source.js)
      expect(events.filter(event => event.type === 'request/header' && (event.data.startsSeries === true || event.data.reason === 'series'))).toHaveLength(2)
    } finally { await ctx.fiber.dispose() }
  })
})

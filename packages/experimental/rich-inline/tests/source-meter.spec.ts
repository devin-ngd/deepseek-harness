/** Historical source projections keep provider anchors identical across replay cadences. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AssistantStreamAccumulator, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { canonicalHeader, isSurfaceEvent, Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { offloadRichSources, richSourceProjection } from '../src/host/source.ts'

describe('source offload token measurement', () => {
  it('retains the projection prefix at each usage anchor during cold and partial replay', async () => {
    const ctx = new Context()
    try {
      new SessionProjectionRegistry(ctx)
      const meter = new TokenMeter(ctx)
      const projections = [richSourceProjection]
      const session = Session.create(SessionId('source-meter'), undefined, undefined, undefined, projections)
      const header = canonicalHeader({ config: { provider: 'fixed', model: 'fixed' } })
      const content = ['first', 'second'].map(key => ({ type: 'text' as const,
        text: '```rich-html\n' + JSON.stringify({ key, html: `<p>${key}</p>`.repeat(500), css: '', js: '',
          fallbackText: key, stateSchemaVersion: 1 }) + '\n```' }))
      session.append('step/start', { turn: 1, step: 1 })
      session.append('request/header', { header, reason: 'initial' })
      const source = session.append('assistant/message', { turn: 1, step: 1, stream: [],
        message: createAssistantMessage({ content, source: header.config }) }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 1, step: 1 })
      const selection = Session.create(session.id, session.snapshotEvents(), undefined, undefined, [richSourceProjection])
      expect(offloadRichSources(selection, selection.snapshotEvents(), 1)).toBe(2)
      const decision = selection.snapshotEvents().find(event => event.type === 'rich-inline/source-offload')
      if (decision?.type !== 'rich-inline/source-offload') throw new Error('missing source decisions')
      const [first, second] = decision.data.targets
      if (first === undefined || second === undefined) throw new Error('missing source targets')
      session.append('rich-inline/source-offload', { targets: [first] })
      session.append('session/end-seed', {})
      meter.measure(session)
      const restore = () => Session.fromRestore(session.id, session.snapshotEvents(), session.header,
        session.inheritedEventCount, 'shared-frozen', [richSourceProjection])
      const partial = restore()
      meter.measure(partial)

      const usage = { inputTokens: 50_000, outputTokens: 1 }
      const stream = new AssistantStreamAccumulator()
      stream.push({ time: 0, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
      stream.push({ time: 1, chunk: { type: 'text-delta', index: 0, text: 'ok' } })
      stream.push({ time: 2, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } } })
      stream.push({ time: 3, chunk: { type: 'usage', usage } })
      stream.push({ time: 4, chunk: { type: 'finish', reason: { kind: 'stop' } } })
      session.append('step/start', { turn: 2, step: 1 })
      session.append('assistant/message', { turn: 2, step: 1, stream: [...stream.snapshot()], usage,
        message: createAssistantMessage({ content: [{ type: 'text', text: 'ok' }], source: header.config }) }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 2, step: 1 })
      const anchored = meter.measure(session)
      expect(anchored.baseline).toMatchObject({ kind: 'usage', tokens: 50_001 })
      session.append('rich-inline/source-offload', { targets: [second] })
      session.append('session/end-seed', {})
      const warm = meter.measure(session)
      expect(warm.baseline).toEqual(anchored.baseline)
      expect(warm.surfaceDeltaTokens).toBeLessThan(anchored.surfaceDeltaTokens)
      expect(warm.nodes[0]?.seq).toBe(source.seq)
      const cold = restore()
      expect(meter.measure(cold)).toEqual(warm)
      for (const event of session.snapshotEvents(partial.seq)) {
        if (isSurfaceEvent(event)) partial.append(event.type, event.data, event)
        else partial.append(event.type, event.data)
      }
      expect(meter.measure(partial)).toEqual(warm)
      projections.length = 0
      expect(() => meter.measure(session)).toThrow(/was removed or replaced/)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

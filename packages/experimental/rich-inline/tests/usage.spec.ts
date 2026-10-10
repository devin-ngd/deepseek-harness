/** Fixed provider samples exercise successful, retried, cancelled, and replayed accounting. */
import { describe, expect, it } from 'vitest'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { deriveRichTaskUsage } from '../src/shared/usage.ts'

const usage: TokenUsage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 0,
  reasoningTokens: 8, totalTokens: 60 }
function fixture() {
  const sessionId = SessionId('usage-fixed')
  const session = Session.create(sessionId)
  const message = (sample?: TokenUsage, interrupted = false) => session.append('assistant/message', {
    turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: 'Fixture' }], source: { provider: 'fixed', model: 'fixed' } }),
    stream: [{ type: 'chunk', time: 1, chunk: { type: 'usage', usage: { ...usage, inputTokens: 1 } } },
      { type: 'chunk', time: 2, chunk: { type: 'usage', usage } }],
    ...sample === undefined ? {} : { usage: sample }, ...interrupted ? { interrupted: true } : {},
  }, { surfaceOp: 'append' })
  const attempt = () => session.append('assistant/attempt', { turn: 1, step: 1,
    stream: [{ type: 'chunk', time: 1, chunk: { type: 'usage', usage: { ...usage, inputTokens: 1 } } },
      { type: 'chunk', time: 2, chunk: { type: 'usage', usage } }],
  })
  const inspect = () => ({ sessionId, events: session.snapshotEvents() })
  return { session, message, attempt, inspect }
}

describe('task settlement accounting', () => {
  it('keeps unsafe counts, aggregate overflow and invalid reasoning subsets unavailable', () => {
    const f = fixture()
    f.message({ inputTokens: -1, outputTokens: 0, reasoningTokens: 1 })
    expect(deriveRichTaskUsage([f.inspect()])).toMatchObject({ uncachedInputTokens: { reported: null, missing: 1 },
      reasoningTokens: { reported: null, missing: 1 } })
    const overflowing = fixture()
    overflowing.message({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0 })
    overflowing.message({ inputTokens: 1, outputTokens: 0 })
    expect(deriveRichTaskUsage([overflowing.inspect()]).uncachedInputTokens).toEqual({ reported: null, missing: 2 })
  })
  it('uses top-level usage once and keeps cache buckets and reasoning separate', () => {
    const f = fixture()
    f.message({ ...usage, inputTokens: 15, totalTokens: 65 })
    expect(deriveRichTaskUsage([f.inspect()])).toEqual({ settlements: 1, messages: 1, attempts: 0, interruptedMessages: 0,
      uncachedInputTokens: { reported: 15, missing: 0 }, outputTokens: { reported: 20, missing: 0 },
      cacheReadTokens: { reported: 30, missing: 0 }, cacheWriteTokens: { reported: 0, missing: 0 },
      reasoningTokens: { reported: 8, missing: 0 }, totalTokens: { reported: 65, missing: 0 }, cost: null, qualityScore: null })
  })
  it('counts retry and cancelled settlements from the last stream usage, without step/end usage', () => {
    const f = fixture()
    f.attempt()
    f.message(undefined, true)
    f.session.append('step/end', { turn: 1, step: 1 })
    expect(deriveRichTaskUsage([f.inspect()])).toMatchObject({ settlements: 2, attempts: 1, interruptedMessages: 1,
      uncachedInputTokens: { reported: 20, missing: 0 }, outputTokens: { reported: 40, missing: 0 },
      reasoningTokens: { reported: 16, missing: 0 } })
  })
  it('keeps absent usage and cache fields unknown', () => {
    const f = fixture()
    f.message({ inputTokens: 10, outputTokens: 20 })
    f.session.append('assistant/attempt', { turn: 1, step: 2, stream: [] })
    expect(deriveRichTaskUsage([f.inspect()])).toMatchObject({ settlements: 2,
      uncachedInputTokens: { reported: 10, missing: 1 }, cacheReadTokens: { reported: null, missing: 2 },
      totalTokens: { reported: null, missing: 2 }, cost: null })
  })
  it('deduplicates repeated inspection and replay while excluding inherited fork billing', () => {
    const f = fixture()
    f.attempt()
    f.message()
    const inspected = f.inspect()
    const replay = Session.create(inspected.sessionId, inspected.events)
    expect(deriveRichTaskUsage([inspected, { ...inspected, events: replay.snapshotEvents() }]).settlements).toBe(2)
    expect(deriveRichTaskUsage([{ ...inspected, sessionId: SessionId('fork'), inheritedEventCount: inspected.events.length }]).settlements).toBe(0)
    expect(deriveRichTaskUsage([inspected, { ...inspected, sessionId: SessionId('independent') }]).settlements).toBe(4)
  })
})

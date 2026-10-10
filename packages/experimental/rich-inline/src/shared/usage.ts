/** Read-only task accounting from durable Assistant settlements, including failed attempts. */
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { TokenUsage } from '@deepseek-ai/dsh-llm/types'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'

/** One inspected Session; inherited fork events were billed to their original Session. */
export interface RichUsageSession {
  readonly sessionId: SessionId
  readonly events: readonly SessionEvent[]
  readonly inheritedEventCount?: number
}

/** Reported subtotal and the number of settlements whose bucket is unavailable. */
export interface RichUsageCount {
  readonly reported: number | null
  readonly missing: number
}

/** Task disclosure without inferred prices, cache traffic, reasoning charges, or quality scores. */
export interface RichTaskUsage {
  readonly settlements: number
  readonly messages: number
  readonly attempts: number
  readonly interruptedMessages: number
  readonly uncachedInputTokens: RichUsageCount
  readonly outputTokens: RichUsageCount
  readonly cacheReadTokens: RichUsageCount
  readonly cacheWriteTokens: RichUsageCount
  /** A subset of outputTokens; never added to the output total. */
  readonly reasoningTokens: RichUsageCount
  readonly totalTokens: RichUsageCount
  readonly cost: null
  readonly qualityScore: null
}

function count(samples: readonly (TokenUsage | undefined)[], field: keyof TokenUsage): RichUsageCount {
  let reported: number | null = null
  let missing = 0
  for (const sample of samples) {
    const value = sample?.[field]
    if (value === undefined || !Number.isSafeInteger(value) || value < 0
      || field === 'reasoningTokens' && value > (sample?.outputTokens ?? -1)) {
      missing++
      continue
    }
    const next: number = (reported ?? 0) + value
    if (!Number.isSafeInteger(next)) return { reported: null, missing: samples.length }
    reported = next
  }
  return { reported, missing }
}

/**
 * Count each Session and settlement sequence once, using the final provider sample.
 * @param sessions - immutable inspection results; repeated reads may overlap.
 * @returns reported subtotals with explicit missing counts; no monetary or quality estimate.
 */
export function deriveRichTaskUsage(sessions: readonly RichUsageSession[]): RichTaskUsage {
  const seen = new Set<string>()
  const samples: (TokenUsage | undefined)[] = []
  let messages = 0
  let attempts = 0
  let interruptedMessages = 0
  for (const session of sessions) {
    for (const event of session.events) {
      if (event.seq < (session.inheritedEventCount ?? 0)
        || event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
      const key = `${session.sessionId}:${event.seq}`
      if (seen.has(key)) continue
      seen.add(key)
      if (event.type === 'assistant/message') {
        messages++
        if (event.data.interrupted === true) interruptedMessages++
      } else attempts++
      samples.push(event.type === 'assistant/message' && event.data.usage !== undefined
        ? event.data.usage : lastAssistantStreamChunk(event.data.stream, 'usage')?.usage)
    }
  }
  return { settlements: samples.length, messages, attempts, interruptedMessages,
    uncachedInputTokens: count(samples, 'inputTokens'), outputTokens: count(samples, 'outputTokens'),
    cacheReadTokens: count(samples, 'cacheReadTokens'), cacheWriteTokens: count(samples, 'cacheWriteTokens'),
    reasoningTokens: count(samples, 'reasoningTokens'), totalTokens: count(samples, 'totalTokens'),
    cost: null, qualityScore: null }
}

/** No-socket fault injection can run even when loopback permission is unavailable. */
import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FollowJournal } from '../integration/mobile-bff.ts'
import { startLoopbackBff, writeLine } from '../integration/loopback-bff.ts'
import type { WritablePort, CarrierMetrics } from '../integration/loopback-bff.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionFollowFrame } from '../src/upstream.ts'
import { id } from '../src/protocol.ts'

const metrics = (): CarrierMetrics => ({ requests: 0, follows: 0, active: 0, drainWaits: 0, disconnected: 0, gatewayErrors: 0 })
function stalled() {
  const events = new EventEmitter(), lines: string[] = []
  const port: WritablePort = { write: line => { lines.push(line); return false }, once: (event, callback) => { events.once(event, callback) }, removeListener: (event, callback) => { events.removeListener(event, callback) } }
  return { events, lines, port }
}
it('backpressure awaits drain before reading or writing another frame and cleans its listeners', async () => {
  const sink = stalled(), count = metrics(), life = new AbortController()
  let completed = false
  const task = writeLine(sink.port, 'one\n', life.signal, 1000, count).then(() => { completed = true })
  await Promise.resolve(); expect(completed).toBe(false); expect(sink.lines).toEqual(['one\n'])
  sink.events.emit('drain'); await task
  expect(completed).toBe(true); expect(count.drainWaits).toBe(1); expect(sink.events.eventNames()).toEqual([])
})
it('stalled drain timeout and cancellation visibly stop output without hidden buffers', async () => {
  const sink = stalled(), life = new AbortController()
  await expect(writeLine(sink.port, 'one\n', life.signal, 5, metrics())).rejects.toMatchObject({ code: 'backpressure-timeout' })
  expect(sink.events.eventNames()).toEqual([])
  const cancelled = writeLine(sink.port, 'two\n', life.signal, 1000, metrics())
  life.abort(); await expect(cancelled).rejects.toMatchObject({ code: 'cancelled' }); expect(sink.events.eventNames()).toEqual([])
})
it('bounded follow history rejects old, expired and future cursors, and abort releases waiters', async () => {
  let now = 1000
  const sid = SessionId('journal-session'), journal = new FollowJournal(sid, { clock: () => now, ttlMs: 10, maxFrames: 2, maxBytes: 10000, maxFrameBytes: 10000 })
  // A typed canonical terminal frame avoids manufacturing Session wire event envelopes.
  const frame: SessionFollowFrame = { type: 'assistant-stream', frame: { type: 'end', attemptId: id<'LlmAttemptId'>('fixture-attempt'), revision: 1, index: 0, outcome: { kind: 'abandoned' } } }
  journal.publish(sid, frame); journal.publish(sid, frame); journal.publish(sid, frame)
  expect(() => journal.read(-1)).toThrow('reset-required'); expect(journal.read(0)).toHaveLength(2)
  expect(() => journal.read(3)).toThrow('cursor-ahead')
  now += 11; expect(() => journal.read(0)).toThrow('reset-required')
  const life = new AbortController(), waiting = journal.wait(journal.cursor, life.signal)
  life.abort(); await expect(waiting).rejects.toMatchObject({ code: 'cancelled' })
  const closing = journal.wait(journal.cursor, new AbortController().signal); journal.close()
  await expect(closing).rejects.toMatchObject({ code: 'closed' })
})
it('invalid retention and carrier limits refuse before opening any listener', async () => {
  expect(() => new FollowJournal(SessionId('empty-journal'), { clock: () => 0, ttlMs: 1, maxFrames: 0, maxBytes: 100, maxFrameBytes: 100 })).toThrow('invalid-config')
  const ctx = new Context()
  try {
    await expect(startLoopbackBff(ctx, { enabled: true, host: '127.0.0.1', port: 0, maxRequestBytes: 0, maxFrameBytes: 1024,
      writeHighWaterMark: 1, drainTimeoutMs: 100, requestTimeoutMs: 100, followSegmentMs: 33, maxConnections: 1, maxActiveRequests: 1 })).rejects.toMatchObject({ code: 'invalid-config' })
  } finally { await ctx.fiber.dispose() }
})
it('fixed ports require the native acceptance owner and invalid port values refuse before listen', async () => {
  const ctx = new Context()
  const config = { enabled: true as const, host: '127.0.0.1' as const, port: 18081, maxRequestBytes: 1024, maxFrameBytes: 1024,
    writeHighWaterMark: 1, drainTimeoutMs: 100, requestTimeoutMs: 100, followSegmentMs: 33, maxConnections: 1, maxActiveRequests: 1 }
  try {
    vi.stubEnv('DSH_HARMONY_NATIVE_ACCEPTANCE', '')
    await expect(startLoopbackBff(ctx, config)).rejects.toMatchObject({ code: 'scope-denied' })
    vi.stubEnv('DSH_HARMONY_NATIVE_ACCEPTANCE', 'approved-phase13')
    for (const port of [-1, 65536, 1.5, Number.NaN]) await expect(startLoopbackBff(ctx, { ...config, port })).rejects.toMatchObject({ code: 'scope-denied' })
  } finally { vi.unstubAllEnvs(); await ctx.fiber.dispose() }
})

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { compactionEntryProjection } from '../src/entry-projection.ts'

describe('compaction transaction entry projection', () => {
  it('rebuilds missing, incompatible, and malformed checkpoint rows from the same Session history', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const handle = await ctx.sessionProjections.registerPrepared(compactionEntryProjection)
    const source = Session.create(SessionId('compaction-checkpoint-source'))
    source.append('turn/start', { turn: 7 })
    source.append('compaction/start', { turn: 7, compactionId: CompactionId('checkpoint-lock') })
    const events = source.snapshotEvents()
    try {
      const rows = [
        {},
        { basicCompactionEntry: { ver: 99, seq: SessionSeq(1), val: {} } },
        { basicCompactionEntry: { ver: 1, seq: SessionSeq(1), val: { turn: 'bad' } } },
      ]
      const results = rows.map((checkpoint, index) => {
        const session = ctx.sessions.prepare(SessionId(`compaction-checkpoint-${String(index)}`), { seed: events }, (subject, cut) => {
          ctx.sessionProjections.prepare(subject, checkpoint, cut)
        })
        return handle.stateOf(session)
      })
      expect(results[1]).toEqual(results[0])
      expect(results[2]).toEqual(results[0])
      expect(results[0]).toMatchObject({ turn: { kind: 'open', value: 7 }, unmatchedStart: 1, latestSeed: 2 })
    } finally {
      await handle.dispose()
      await ctx.fiber.dispose()
    }
  })
})

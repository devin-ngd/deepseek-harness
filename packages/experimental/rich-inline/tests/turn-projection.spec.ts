import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { richTurnProjection } from '../src/host/turn-projection.ts'

describe('Rich Inline latest turn projection', () => {
  it('rebuilds incompatible and malformed checkpoints and advances their suffix', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const handle = await ctx.sessionProjections.registerPrepared(richTurnProjection)
    const original = Session.create(SessionId('rich-turn-checkpoint-source'))
    original.append('turn/start', { turn: 0 })
    original.append('turn/start', null as never)
    original.append('turn/start', { turn: 3 })
    const events = original.snapshotEvents()
    try {
      const checkpoints = [
        {},
        { richInlineLatestTurn: { ver: 99, seq: SessionSeq(1), val: {} } },
        { richInlineLatestTurn: { ver: 1, seq: SessionSeq(1), val: { kind: 'invalid' } } },
        { richInlineLatestTurn: { ver: 1, seq: SessionSeq(0), val: { kind: 'turn', value: 0 } } },
      ]
      const results = checkpoints.map((checkpoint, index) => {
        const session = ctx.sessions.prepare(SessionId(`rich-turn-checkpoint-${String(index)}`), { seed: events }, (subject, cut) => {
          ctx.sessionProjections.prepare(subject, checkpoint, cut)
        })
        return handle.stateOf(session)
      })
      expect(results).toEqual(checkpoints.map(() => ({ kind: 'turn', value: 3 })))
    } finally {
      await handle.dispose()
      await ctx.fiber.dispose()
    }
  })
})

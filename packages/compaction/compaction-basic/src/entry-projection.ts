/** Recover the facts needed to admit a compaction transaction. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const stateSchema = z.object({
  turn: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('closed') }),
    z.object({ kind: z.literal('open'), value: z.number() }),
    z.object({ kind: z.literal('compatibility') }),
  ]),
  unmatchedStart: z.number().int().nonnegative().nullable(),
  latestSeed: z.number().int().nonnegative().nullable(),
})

/** Fixed-size transaction entry facts; malformed active turns use the compatibility reader. */
export type CompactionEntryProjection = z.infer<typeof stateSchema>

/** Host-only projection of turn, compaction-bracket, and seed-boundary facts. */
export const compactionEntryProjection = {
  key: 'basicCompactionEntry',
  stateVersion: 1,
  stateSchema,
  init: () => ({ turn: { kind: 'closed' }, unmatchedStart: null, latestSeed: null }),
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start': {
        const data: unknown = event.data
        const turn = data === null || typeof data !== 'object'
          ? undefined : Object.getOwnPropertyDescriptor(data, 'turn')
        if (turn === undefined || !('value' in turn) || typeof turn.value !== 'number'
          || !Number.isFinite(turn.value) || Object.is(turn.value, -0)) {
          return { ...state, turn: { kind: 'compatibility' } }
        }
        return { ...state, turn: { kind: 'open', value: turn.value } }
      }
      case 'turn/end':
        return { ...state, turn: { kind: 'closed' } }
      case 'compaction/start':
        return { ...state, unmatchedStart: event.seq }
      case 'compaction/end':
        return { ...state, unmatchedStart: null }
      case 'session/end-seed':
        return { ...state, latestSeed: event.seq }
      default:
        return state
    }
  },
} satisfies ProjectionDefinition<'basicCompactionEntry', CompactionEntryProjection>

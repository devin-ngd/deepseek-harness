/** The latest turn start needed by the Rich Inline event observer. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const turnStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('turn'), value: z.number() }),
  z.object({ kind: z.literal('compatibility') }),
])

/** State for reading the most recent turn without replaying older starts. */
export type RichTurnState = z.infer<typeof turnStateSchema>

/** Keep malformed starts available to the legacy reader at the observation point. */
export const richTurnProjection = {
  key: 'richInlineLatestTurn',
  stateVersion: 1,
  stateSchema: turnStateSchema,
  init: () => ({ kind: 'none' }),
  apply: (state, event) => {
    if (event.type !== 'turn/start') return state
    const data: unknown = event.data
    if (data === null || typeof data !== 'object') return { kind: 'compatibility' }
    let turn: PropertyDescriptor | undefined
    try {
      turn = Object.getOwnPropertyDescriptor(data, 'turn')
    } catch (_error: unknown) {
      return { kind: 'compatibility' }
    }
    if (turn === undefined || !('value' in turn) || typeof turn.value !== 'number'
      || !Number.isFinite(turn.value) || Object.is(turn.value, -0)) return { kind: 'compatibility' }
    return { kind: 'turn', value: turn.value }
  },
} satisfies ProjectionDefinition<'richInlineLatestTurn', RichTurnState>

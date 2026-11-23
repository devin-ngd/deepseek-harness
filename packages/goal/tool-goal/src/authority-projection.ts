/** Recover current-turn goal-tool authority from committed Session events. */
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

const goalRoundSchema = z.object({ goalId: z.string(), revision: z.number(), round: z.number() }).strict()
const stateSchema = z.object({
  active: z.boolean(),
  directHuman: z.boolean(),
  rounds: z.array(goalRoundSchema),
}).strict()

/** Facts required to authorize goal operations during the current turn. */
export type GoalAuthorityState = z.infer<typeof stateSchema>

/** Host-only projection retaining one entry per distinct goal source in the active turn. */
export const goalAuthorityProjection = {
  key: 'goalToolAuthority',
  stateVersion: 1,
  stateSchema,
  init: () => ({ active: false, directHuman: false, rounds: [] }),
  apply: (state, event) => {
    if (event.type === 'turn/start') return { active: true, directHuman: false, rounds: [] }
    if (event.type === 'turn/end') return { active: false, directHuman: false, rounds: [] }
    if (!state.active || event.type !== 'user/message') return state
    const source = event.data.source
    if (source.kind === 'user') return state.directHuman ? state : { ...state, directHuman: true }
    if (source.kind !== 'goal' || typeof source.goalId !== 'string'
      || typeof source.revision !== 'number' || !Number.isFinite(source.revision)
      || typeof source.round !== 'number' || !Number.isFinite(source.round)) return state
    if (state.rounds.some(round => round.goalId === source.goalId
      && round.revision === source.revision && round.round === source.round)) return state
    return { ...state, rounds: [...state.rounds, { goalId: source.goalId, revision: source.revision, round: source.round }] }
  },
} satisfies ProjectionDefinition<'goalToolAuthority', GoalAuthorityState>

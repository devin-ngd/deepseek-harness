/** Execution-time authority checks for the model-facing goal tools. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { GoalAuthorityState } from './authority-projection.ts'

/** The calling agent plus the current-turn authority captured for one tool call. */
export interface GoalToolExecution {
  readonly agent: Agent
  readonly authority: GoalAuthorityState
}

/** Hard authority granted to one state-changing call. */
export type GoalToolAuthority =
  | { readonly kind: 'direct-human' }
  | { readonly kind: 'goal-round'; readonly goal: GoalView }

/** Throw one structured tool-policy failure. */
function reject(message: string, code = 'GOAL_TOOL_AUTHORITY_REQUIRED'): never {
  throw new HarnessError(message, code)
}

/**
 * Resolve and authenticate the calling agent and its driver boundary.
 * @param ctx - Context carrying the live agent registry.
 * @param exec - Tool execution metadata supplied by the registry.
 * @param readAuthority - synchronous reader for the Session's current-turn facts.
 * @returns The authenticated agent and its current-turn authority facts.
 */
export function goalToolExecution(
  ctx: Context,
  exec: ToolRunContext,
  readAuthority: (session: Session) => GoalAuthorityState,
): GoalToolExecution {
  const agent = exec.agent
  if (agent === undefined) {
    return reject('goal tools require a calling agent', 'GOAL_TOOL_AGENT_REQUIRED')
  }
  if (ctx.agents.get(agent.id) !== agent || agent.status !== 'running'
    || ctx.agents.currentInitiator() !== agent) {
    return reject(
      'goal tools require the exact live calling agent inside its active driver',
      'GOAL_TOOL_DRIVER_REQUIRED',
    )
  }
  if (ctx.agents.turnBoundaryOf(agent.session).openTurnStartSeq === null) {
    return reject('goal tools require an open model turn', 'GOAL_TOOL_DRIVER_REQUIRED')
  }
  const authority = readAuthority(agent.session)
  if (!authority.active) throw new Error('goal tool authority projection is inconsistent with the open turn')
  return { agent, authority }
}

/**
 * Whether host-attested human input appears in the current root-agent turn.
 * An omitted `Agent.followup()` / `steer()` source resolves to `user`, so non-human
 * producers must supply their own source rather than inheriting this authority.
 */
function hasDirectHumanInput(ctx: Context, execution: GoalToolExecution): boolean {
  if (ctx.agents.get(execution.agent.id) !== execution.agent || execution.agent.session.header.origin === 'subagent') return false
  return execution.authority.directHuman
}

/** Whether this turn is the current goal's exact admitted round. */
function isMatchingGoalRound(execution: GoalToolExecution, goal: GoalView): boolean {
  return execution.authority.rounds.some(round => round.goalId === goal.id
    && round.revision === goal.revision && round.round === goal.roundsStarted)
}

/**
 * Require authority originating in a human message accepted by a runtime root.
 * @param ctx - Context carrying the live agent graph.
 * @param execution - Authenticated current tool execution.
 */
export function requireDirectHuman(ctx: Context, execution: GoalToolExecution): void {
  if (hasDirectHumanInput(ctx, execution)) return
  reject('this goal operation requires a direct human turn on a top-level agent')
}

/**
 * Resolve completion authority from either direct human input or the exact goal round.
 * @param ctx - Context carrying live agents and goal state.
 * @param execution - Authenticated current tool execution.
 * @returns The direct-human or exact-goal-round authority grant.
 */
export function completionAuthority(ctx: Context, execution: GoalToolExecution): GoalToolAuthority {
  if (hasDirectHumanInput(ctx, execution)) return { kind: 'direct-human' }
  const goal = ctx.goals.get(execution.agent)
  if (goal !== undefined && isMatchingGoalRound(execution, goal)) {
    return { kind: 'goal-round', goal }
  }
  return reject('complete and blocked require a direct human turn or the current goal round')
}

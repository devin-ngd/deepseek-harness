/** Exact project defaults applied before a fresh blank Session starts, without changing resumed histories. */
import { realpathSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

/** Identify child ownership independently of a user's ordinary fork lineage.
 * @param agent - exact live Agent, or an agentless inspection.
 * @returns whether rich authoring and its runtime policies must be excluded.
 */
export function isRichChild(agent?: Agent): boolean {
  if (agent === undefined) return false
  const registry = agent.ctx.get('agents')
  return agent.session.header.origin === 'subagent' || registry !== undefined && registry.get(agent.id) === agent && !registry.roots().includes(agent)
}

/** Install project defaults through the normal durable blank-session selection operation.
 * @param ctx - plugin owner; listeners unwind with its fiber.
 * @param defaults - existing project directories and declared preset identities.
 */
export function installProjectDefaults(ctx: Context, defaults: readonly { readonly path: string; readonly preset: string }[]): void {
  const projects = new Map<string, string>()
  for (const item of defaults) {
    const path = realpathSync(item.path)
    if (projects.has(path)) throw new Error(`rich-inline: duplicate project default for ${path}`)
    projects.set(path, item.preset)
  }
  if (projects.size === 0) return
  ctx.on('agent/created', async ({ agent, source }) => {
    if (source !== 'startup' || isRichChild(agent) || agent.session.header.cwd === undefined) return
    const preset = projects.get(agent.session.header.cwd)
    if (preset === undefined) return
    const registry = ctx.get('agentPresets')
    const projections = ctx.get('sessionProjections')
    if (registry === undefined || projections === undefined) throw new Error('rich-inline: projectDefaults requires agent preset and session projection services')
    const boundary = projections.stateOf(agent.session, 'turnBoundary')
    if (boundary === undefined || boundary.lastTurn > 0 || boundary.openTurnStartSeq !== null) return
    if (registry.composedPreset(agent.ctx) !== registry.defaultId) return
    await registry.select(agent, preset)
  })
}

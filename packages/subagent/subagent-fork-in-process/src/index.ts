/**
 * The in-process FORK subagent backend: registers a {@link SubagentProvider} on
 * `ctx.subagents` that runs each child as an Agent seeded with a prefix of the
 * parent's session log — so the child inherits the parent's conversation context instead of
 * starting fresh. The seed ends at the last `turn/end`: the current tool-call turn is
 * unbalanced and cannot be replayed as a valid child session.
 * @module @deepseek-ai/dsh-subagent-fork-in-process
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  ContinuableCreateRequest,
  ContinuableCreateSpec,
  SubagentCapabilities,
  SubagentProvider,
} from '@deepseek-ai/dsh-subagent'

export const name = 'subagent-fork-in-process'
// `tools` is deliberately NOT injected — same rationale as subagent-spawn-in-process: the
// per-run structured runtime gates its capture-tool registration on `tools`
// itself, so this backend's apply timing (and the delegation tool's position
// in the model-visible tool list) is unchanged by structured output.
export const inject = ['subagents']

/** Config: the registry name to register the provider under. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `fork`). */
  providerName: string
}

export const Config: z<Config> = z.object({
  providerName: z.string().default('fork'),
})

/**
 * The fork provider. Supports `depthLimit` and `outputSchema` (via the shared
 * in-process structured runtime), `agentOptions` (merged over the parent
 * route). The child inherits its parent's preset composition.
 */
class ForkInProcessProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true,
    agentPreset: false,
    outputSchema: true,
    depthLimit: true,
  }
  // Context contract: a forked child IS seeded with the parent's completed-turn prefix.
  readonly inheritsParentContext = true

  constructor(readonly name: string) {}

  async prepareContinuable({ parent, signal }: ContinuableCreateRequest): Promise<ContinuableCreateSpec> {
    const session = parent.session
    const seed: SessionEvent[] = []
    for await (const page of session.readHistoryPages({
      toSeqExclusive: session.completedTurnEndOffset, signal,
    })) {
      seed.push(...page)
    }
    return seed.length > 0 ? { seed } : {}
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new ForkInProcessProvider(config.providerName))
}

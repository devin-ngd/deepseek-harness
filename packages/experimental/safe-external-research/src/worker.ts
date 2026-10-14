/** Independent worker without parent composition. @module dsh-experimental-safe-external-research/worker */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionId as ParentSessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { SessionHandle, SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { ResearchAccess } from './access.ts'
import { validateResult } from './contract.ts'
import { renderResearchJson, ResearchError } from './policy.ts'
import type { ResearchAudit, ResearchConfig, ResearchRequest, ResearchResult } from './types.ts'

const readArgs = z.strictObject({ id: z.string().regex(/^s[1-9][0-9]*$/u).max(8) })
const emptyArgs = z.strictObject({})
const submitArgs = z.strictObject({ result: z.unknown() })

/** Fixed worker-only guidance, appended to the verified shared Skill. */
export const WORKER_GUIDANCE = 'You are external-research-worker. Use research_read with host source ids; '
  + 'research_search searches the original public question once. Submit the shared result v1 with research_submit. '
  + 'Only successful reads are sources; copy their id, url and locator exactly. Free-text completion is not delivered.'

/** Explicit runtime dependencies; no parent Agent or parent Context enters this object. */
export interface WorkerInputs {
  llm: LlmRuntime
  persistence?: SessionPersistence
  parentSession?: ParentSessionId
  config: ResearchConfig
  request: ResearchRequest
  skill: string
  signal: AbortSignal
  access: ResearchAccess
  audit: (record: ResearchAudit) => void
}

/**
 * Build a deny-by-default guard that checks the actual worker and current tool definition.
 * @param agent - sole authorized worker identity.
 * @param tools - worker-owned registry.
 * @param definitions - closed set of authorized definitions.
 * @param signal - operation lifetime.
 * @param audit - content-free refusal sink.
 * @returns monotonic execution check, including PTC sub-dispatches.
 */
export function workerGuard(
  agent: Agent,
  tools: ToolRuntime,
  definitions: ReadonlyMap<string, ToolDefinition>,
  signal: AbortSignal,
  audit: WorkerInputs['audit'],
): (execution: Readonly<ToolExecution>) => string | undefined {
  return (execution) => {
    let code: string | undefined
    if (signal.aborted) code = 'RESEARCH_CONTROLS_INACTIVE'
    else if (execution.agent !== agent || execution.parent !== undefined) code = 'RESEARCH_CALLER'
    else if (!definitions.has(execution.name) || tools.get(execution.name, agent) !== definitions.get(execution.name)) code = 'RESEARCH_TOOL_DENIED'
    else {
      const schema = execution.name === 'research_read' ? readArgs : execution.name === 'research_search' ? emptyArgs : submitArgs
      if (!schema.safeParse(execution.arguments).success) code = 'RESEARCH_TOOL_ARGUMENTS'
    }
    if (code !== undefined) audit({ operation: 'tool', target: definitions.has(execution.name) ? execution.name : 'unapproved-tool', code, protection: 'research-tool-policy' })
    return code
  }
}

/**
 * Run one clean logged worker to quiescence and return only its validated submission.
 * @param input - explicit trusted runtime dependencies and minimal public task.
 * @returns host worker identity and validated result; raw completion is never forwarded.
 */
export async function runWorker(input: WorkerInputs): Promise<{ workerId: string; result: ResearchResult }> {
  const worker = new Context()
  let agent: Agent | undefined
  let journal: SessionHandle | undefined
  let writes = Promise.resolve()
  const logging = { failed: false }
  const checkActive = (): void => { if (input.signal.aborted) throw new ResearchError('RESEARCH_CANCELLED') }
  const cancel = (): void => { agent?.cancel({ kind: 'user' }) }
  input.signal.addEventListener('abort', cancel, { once: true })
  try {
    worker.provide('llm', input.llm)
    await worker.plugin(SessionStore)
    await worker.plugin(SessionProjectionRegistry)
    await worker.plugin(SystemPrompt, {})
    await worker.plugin(ToolRuntime, { mode: 'native', maxParallelSubCalls: 1 })
    await worker.plugin(AgentRegistry)
    await worker.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 })
    let submitted: ResearchResult | undefined
    let submissions = 0
    let steps = 0
    const definitions = new Map<string, ToolDefinition>()
    const output = {
      schema: { type: 'json' as const },
      render: (_args: unknown, value: unknown) => renderResearchJson(value),
    }
    const register = (definition: ToolDefinition): void => {
      definitions.set(definition.name, definition)
      worker.tools.register(definition)
    }
    register(defineTool({
      name: 'research_read', description: 'Read one host-approved public source id.',
      parameters: { id: { type: 'string', required: true } }, output,
      execute: async args => input.access.read(readArgs.parse(args).id),
    }))
    register(defineTool({
      name: 'research_search', description: 'Search once using the original public question and return approved source ids.',
      parameters: {}, output,
      execute: async (args) => { emptyArgs.parse(args); return input.access.search() },
    }))
    register(defineTool({
      name: 'research_submit', description: 'Submit the shared research result v1 JSON for validation and finish.',
      parameters: { result: { type: 'json', required: true } }, output,
      execute: (args, exec) => {
        if (++submissions > 2 || submitted !== undefined) throw new ResearchError('RESEARCH_SUBMISSION_LIMIT')
        try {
          submitted = validateResult(submitArgs.parse(args).result, input.access.reads)
        } catch (error: unknown) {
          input.audit({ operation: 'result', target: 'submission', code: error instanceof ResearchError ? error.code : 'RESEARCH_RESULT_SCHEMA', protection: 'research-tool-policy' })
          throw error
        }
        exec.concludeTurn()
        return Promise.resolve({ accepted: true })
      },
    }))
    const handle = await worker.agents.create({
      sessionId: SessionId(`research-${randomUUID()}`),
      meta: { agentPreset: 'external-research-worker', origin: 'subagent', ...input.parentSession === undefined ? {} : { parentSession: input.parentSession } },
      agentOptions: { provider: input.config.provider, model: input.config.model, maxTokens: input.config.maxTokens },
      signal: input.signal,
      async setup(ctx, created) {
        agent = created
        if (input.persistence !== undefined) {
          const storage = await input.persistence.create(created.session.header, { signal: input.signal })
          journal = storage
          ctx.on('session/event', (_session, event) => {
            writes = writes.then(async () => {
              if (!logging.failed) await storage.append([event])
            }).catch((_error: unknown) => {
              // Storage failures cancel the worker without exposing backend error text to the model.
              logging.failed = true
              created.cancel({ kind: 'user' })
            })
          })
          ctx.on('session/flush', async () => {
            await writes
            if (logging.failed) throw new ResearchError('RESEARCH_LOG_FAILED')
            await storage.flush()
          })
        }
        ctx.tools.restrict({ allow: [...definitions.keys()] })
        worker.tools.guard(workerGuard(created, worker.tools, definitions, input.signal, input.audit))
        ctx.systemPrompt.section({ name: 'research:trusted-skill', order: 0, complete: true, interpolate: false, text: `${WORKER_GUIDANCE}\n\n${input.skill}` })
        ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
          const resolved = await next()
          return { ...resolved, tools: assembly.tools.filter(tool => definitions.has(tool.name)), contexts: [] }
        })
        ctx.on('agent/pre-step', async (_current, next) => {
          checkActive()
          if (logging.failed) throw new ResearchError('RESEARCH_LOG_FAILED')
          if (++steps > input.request.budget.steps) throw new ResearchError('RESEARCH_STEP_BUDGET')
          return next()
        })
      },
    })
    checkActive()
    handle.agent.followup(createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: JSON.stringify({ question: input.request.question, sources: input.access.inventory(), search: input.request.search, budget: input.request.budget }) }],
    }))
    await handle.agent.whenIdle()
    await writes
    if (logging.failed) throw new ResearchError('RESEARCH_LOG_FAILED')
    checkActive()
    if (submitted === undefined) throw new ResearchError('RESEARCH_NO_VALID_RESULT')
    return { workerId: handle.agent.id, result: submitted }
  } finally {
    input.signal.removeEventListener('abort', cancel)
    try { await worker.fiber.dispose() } finally {
      await writes
      await journal?.close()
    }
  }
}

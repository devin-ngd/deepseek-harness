/** Host-only native selection revision, serial comparison, and exact-Agent lifetime behavior. */

import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { SessionModelSelectionSnapshot } from '@deepseek-ai/dsh-api-session-controller'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter, ReasoningEffortId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { installModelSelectionProjection } from '../src/model-selection-projection.ts'
import { createSessionTestController } from './test-remote.ts'

class SelectionAdapter extends LlmAdapter {
  override listModels(provider: string) {
    return Promise.resolve(['base', 'director', 'user'].map(id => ({ provider, id, name: id })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider, id: model, name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('high'), name: 'High' }], defaultEffort: ReasoningEffortId('high') },
    })
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('selection tests must not call a model')
  }
}

async function harness() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await mountAgentLoopTestHarness(ctx)
  ctx.llm.registerAdapter(['selection'], new SelectionAdapter())
  const handle = await ctx.agents.create({ sessionId: SessionId('selection-cas'), meta: { cwd: process.cwd() } })
  const saveDefault = vi.fn()
  const controller = createSessionTestController(ctx, {
    cwd: process.cwd(),
    defaultModelSelection: () => ({ provider: 'selection', model: 'base' }),
    saveDefaultModelSelection: saveDefault,
  })
  return { ctx, handle, agent: handle.agent, controller, saveDefault }
}

const director = { provider: 'selection', model: 'director' }
const user = { provider: 'selection', model: 'user' }

function pauseValidation(ctx: Context) {
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const original = ctx.llm.resolveCallConfig.bind(ctx.llm)
  const spy = vi.spyOn(ctx.llm, 'resolveCallConfig').mockImplementationOnce(async (...args) => {
    entered.resolve(undefined)
    await release.promise
    return original(...args)
  })
  const operations: Promise<unknown>[] = []
  onTestFinished(async () => {
    release.resolve(undefined)
    await Promise.allSettled(operations)
    spy.mockRestore()
  })
  return { entered: entered.promise, release: () => { release.resolve(undefined) }, operations }
}

describe('Host native model selection comparison', () => {
  it('reads a live native default and exposes no new Remote methods or wire projection', async () => {
    const { ctx, agent, controller } = await harness()
    const snapshot: SessionModelSelectionSnapshot = await ctx.sessionController.readModelSelection({ sessionId: agent.id })
    expect(snapshot).toEqual({
      selected: { provider: 'selection', model: 'base' }, selectionRevision: -1,
    })
    expect(controller.readModelSelectionForAgent(agent).selectionRevision).toBe(-1)
    const remoteNames = remoteMethods(controller).map(method => method.exportName ?? method.method)
    for (const method of ['compareAndSelectModel', 'readModelSelection', 'compareAndSelectModelForAgent', 'readModelSelectionForAgent']) {
      expect(remoteNames).not.toContain(method)
    }
    expect(ctx.sessionProjections.snapshot(agent.session).values).not.toHaveProperty('modelSelectionRevision')
  })

  it('advances on repeated identical selections and effort-only intent without writing defaults', async () => {
    const { agent, controller, saveDefault } = await harness()
    const first = await controller.compareAndSelectModel({ sessionId: agent.id, expectedSelectionRevision: -1, selection: director })
    expect(first).toMatchObject({ applied: true, selected: { ...director, reasoningEffort: 'high' } })
    const second = await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: first.selectionRevision, selection: first.selected,
    })
    expect(second.applied).toBe(true)
    expect(second.selectionRevision).toBeGreaterThan(first.selectionRevision)
    const thirdRevision = agent.session.append('model/selection', director).seq
    expect(controller.readModelSelectionForAgent(agent).selectionRevision).toBe(thirdRevision)
    expect(saveDefault).not.toHaveBeenCalled()
  })

  it('keeps revision through request consumption and feeds the same native assembly and request route', async () => {
    const { ctx, agent, controller } = await harness()
    const selected = await controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    expect((await ctx.systemPrompt.assemble({ scope: agent })).variables).toMatchObject(director)
    await expect(agentEvents(ctx, agent).waterfall('agent/request', {
      turn: 1, step: 1, signal: new AbortController().signal,
    }, () => Promise.resolve({ provider: 'seed', model: 'seed' }))).resolves.toMatchObject(director)
    agent.session.append('request/header', {
      header: { config: { ...director, reasoningEffort: ReasoningEffortId('high') } }, reason: 'initial',
    })
    expect(controller.readModelSelectionForAgent(agent)).toEqual({
      selected: { ...director, reasoningEffort: 'high' }, selectionRevision: selected.selectionRevision,
    })
  })

  it('allows only one queued writer with the same expected revision', async () => {
    const { agent, controller } = await harness()
    const [first, second] = await Promise.all([
      controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director }),
      controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: user }),
    ])
    expect(first.applied).toBe(true)
    expect(second).toEqual({ ...first, applied: false })
    expect(agent.session.snapshotEvents().filter(event => event.type === 'model/selection')).toHaveLength(1)
  })

  it('retains a newer native user choice and refuses restoring an older override', async () => {
    const { agent, controller, saveDefault } = await harness()
    const original = controller.readModelSelectionForAgent(agent)
    const override = await controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    await controller.selectModel({ sessionId: agent.id, ...user })
    const current = controller.readModelSelectionForAgent(agent)
    expect(await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: override.selectionRevision, selection: original.selected,
    })).toEqual({ applied: false, ...current })
    expect(current.selected).toMatchObject(user)
    expect(saveDefault).toHaveBeenCalledOnce()
  })

  it('restores an unchanged override but respects a repeated identical user selection', async () => {
    const { agent, controller } = await harness()
    const original = controller.readModelSelectionForAgent(agent)
    const first = await controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    const restored = await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: first.selectionRevision, selection: original.selected,
    })
    expect(restored).toMatchObject({ applied: true, selected: original.selected })
    const second = await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: restored.selectionRevision, selection: director,
    })
    await controller.selectModel({ sessionId: agent.id, ...second.selected })
    expect(await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: second.selectionRevision, selection: original.selected,
    })).toMatchObject({ applied: false, selected: second.selected })
  })

  it('rechecks after asynchronous validation when another native owner appends intent', async () => {
    const { ctx, agent, controller } = await harness()
    const barrier = pauseValidation(ctx)
    const operation = controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    barrier.operations.push(operation)
    await barrier.entered
    const event = agent.session.append('model/selection', user)
    barrier.release()
    expect(await operation).toMatchObject({ applied: false, selectionRevision: event.seq })
    expect(agent.session.snapshotEvents().filter(entry => entry.type === 'model/selection')).toEqual([event])
  })

  it('serializes a user selection queued during validation ahead of later override restoration', async () => {
    const { ctx, agent, controller } = await harness()
    const barrier = pauseValidation(ctx)
    const override = controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    barrier.operations.push(override)
    await barrier.entered
    const userSelection = controller.selectModel({ sessionId: agent.id, ...user })
    barrier.operations.push(userSelection)
    barrier.release()
    const temporary = await override
    await userSelection
    expect(await controller.compareAndSelectModelForAgent(agent, {
      expectedSelectionRevision: temporary.selectionRevision, selection: { provider: 'selection', model: 'base' },
    })).toMatchObject({ applied: false, selected: user })
  })

  it('rejects an exact Agent replaced while capability validation is awaiting', async () => {
    const { ctx, agent, handle, controller } = await harness()
    const barrier = pauseValidation(ctx)
    const operation = controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director })
    barrier.operations.push(operation)
    const rejected = expect(operation).rejects.toMatchObject({ code: 'session/agent-busy' })
    await barrier.entered
    await handle.dispose()
    const replacement = await ctx.agents.create({ sessionId: agent.id })
    barrier.release()
    await rejected
    expect(replacement.agent.session.snapshotEvents().some(event => event.type === 'model/selection')).toBe(false)
  })

  it('rejects catalog and unsupported effort failures without selection or default changes', async () => {
    const { agent, controller, saveDefault } = await harness()
    for (const selection of [{ ...director, model: 'missing' }, { ...director, reasoningEffort: 'unsupported' }]) {
      await expect(controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection }))
        .rejects.toMatchObject({ code: 'session/model-unavailable' })
    }
    expect(controller.readModelSelectionForAgent(agent).selectionRevision).toBe(-1)
    expect(saveDefault).not.toHaveBeenCalled()
  })

  it('does not update execution cache when the selection append rejects', async () => {
    const { agent, controller } = await harness()
    const before = controller.readModelSelectionForAgent(agent)
    const append = vi.spyOn(agent.session, 'append').mockImplementationOnce(() => { throw new Error('append refused') })
    onTestFinished(() => { append.mockRestore() })
    await expect(controller.compareAndSelectModelForAgent(agent, { expectedSelectionRevision: -1, selection: director }))
      .rejects.toThrow('append refused')
    expect(controller.readModelSelectionForAgent(agent)).toEqual(before)
  })

  it('rebuilds the Host revision from existing history after late registration and removes it on disposal', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await mountAgentLoopTestDependencies(ctx)
    const session = ctx.sessions.create()
    session.append('model/selection', director)
    const latest = session.append('model/selection', director)
    const fiber = ctx.plugin({ name: 'selection-projection-fixture', inject: ['sessionProjections'], apply: installModelSelectionProjection })
    await fiber
    expect(ctx.sessionProjections.stateOf(session, 'modelSelectionRevision')).toBe(latest.seq)
    await fiber.dispose()
    expect(ctx.sessionProjections.stateOf(session, 'modelSelectionRevision')).toBeUndefined()
  })
})

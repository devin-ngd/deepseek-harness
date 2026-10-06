/** Project defaults use the real preset registry and Agent creation lifecycle. */
import { realpathSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it } from 'vitest'
import { harness, declare } from '../../../preset/agent-preset-registry/tests/harness.ts'
import { installProjectDefaults } from '../src/host/project-defaults.ts'

const owners: Context[] = []
afterEach(async () => { for (const ctx of owners.splice(0)) await ctx.fiber.dispose() })

it('defaults only fresh project sessions, allows manual Standard selection, and removes its listener on unload', async () => {
  const ctx = await harness()
  owners.push(ctx)
  await declare(ctx, { id: 'standard', plugins: [] })
  await declare(ctx, { id: 'lumina', name: 'Lumina', plugins: [] })
  const cwd = realpathSync(process.cwd())
  const fiber = await ctx.plugin({ apply(child: Context) { installProjectDefaults(child, [{ path: cwd, preset: 'lumina' }]) } })
  const create = async (id: string, project?: string) => (await ctx.agents.create({
    sessionId: SessionId(id), meta: project === undefined ? {} : { cwd: project },
    setup: async (agentCtx: Context) => { await ctx.agentPresets.mount(agentCtx, 'standard') },
  })).agent
  const project = await create('rich-project-default', cwd)
  expect(ctx.agentPresets.composedPreset(project.ctx)).toBe('lumina')
  expect(ctx.sessionProjections.stateOf(project.session, 'agentPreset')).toBe('lumina')
  await ctx.agentPresets.select(project, 'standard')
  expect(ctx.agentPresets.composedPreset(project.ctx)).toBe('standard')
  const other = await create('rich-other-project')
  expect(ctx.agentPresets.composedPreset(other.ctx)).toBe('standard')
  await ctx.agentPresets.select(other, 'lumina')
  expect(ctx.agentPresets.composedPreset(other.ctx)).toBe('lumina')
  await fiber.dispose()
  expect(ctx.agentPresets.composedPreset((await create('rich-after-unload', cwd)).ctx)).toBe('standard')
})

it('rejects invalid or duplicate project directories before registering listeners', () => {
  const ctx = new Context()
  owners.push(ctx)
  expect(() => { installProjectDefaults(ctx, [{ path: '\0', preset: 'lumina' }]) }).toThrow()
  const cwd = realpathSync(process.cwd())
  expect(() => { installProjectDefaults(ctx, [{ path: cwd, preset: 'lumina' }, { path: cwd, preset: 'standard' }]) }).toThrow('duplicate project default')
})

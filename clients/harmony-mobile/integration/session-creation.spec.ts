/** Native creation uses the desktop's real preset and Session-local model owners with a call-free replay catalog. */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { expect, it, onTestFinished } from 'vitest'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { loadProfileServices } from './profile-services.ts'
import { deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import { deviceSessionActionSchema, deviceSessionDirectory } from '../src/device-session-directory.ts'
import { sessionCreationOptionsSchema } from '../src/session-creation.ts'
import { id } from '../src/protocol.ts'

async function fixture() {
  const parent = process.env.DSH_HARMONY_WORKSPACE_WORLD
  assert.ok(parent)
  const world = await mkdtemp(join(parent, 'creation-'))
  const ctx = await loadProfileServices(world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('profileContext', { name: 'desktop', dir: world, patchPath: join(world, 'patch.yml'),
    cwd: world, home: world, installAnchor: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Presets, { default: 'standard' })
  await ctx.agentPresets.register({ id: 'standard', name: 'Standard', plugins: [] })
  await ctx.agentPresets.register({ id: 'devin', name: 'Devin', plugins: [] })
  const file = join(world, 'responses.json')
  await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({
    kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }],
  }))) + '\n')
  await installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{
    id: 'rich-inline-replay', models: [
      { id: 'rich-inline-fixed', contextWindow: 100000, defaultMaxTokens: 1000 },
      { id: 'worker-model', contextWindow: 100000, defaultMaxTokens: 1000, reasoningEfforts: ['low', 'high'] },
    ],
  }] })
  return { ctx, world, ports: deviceProfileSessionPorts(ctx), signal: new AbortController().signal }
}

it('reads desktop choices and creates the requested preset/model without changing deployment defaults or starting a turn', async () => {
  const f = await fixture()
  const before = f.ctx.agentDefaultModel.currentSelection()
  const options = sessionCreationOptionsSchema.parse(await f.ports.creationOptions!(f.signal))
  expect(options.presets).toEqual([
    { id: 'devin', name: 'Devin', isDefault: false },
    { id: 'standard', name: 'Standard', isDefault: true },
  ])
  expect(options.models).toContainEqual(expect.objectContaining({ model: 'worker-model', efforts: ['low', 'high'] }))
  const model = { provider: 'rich-inline-replay', model: 'worker-model', reasoningEffort: 'high' }
  const created = await f.ports.manage!({ action: 'create', projectId: null, agentPreset: 'devin', model }, f.signal)
  const session = f.ctx.sessions.get(id<'SessionId'>(created.sessionId))!
  expect(f.ctx.sessionProjections.stateOf(session, 'agentPreset')).toBe('devin')
  expect((await f.ctx.sessionController.readModelSelection({ sessionId: session.id })).selected).toEqual(model)
  expect(f.ctx.agentDefaultModel.currentSelection()).toEqual(before)
  expect(session.snapshotEvents().filter(event => event.type === 'turn/start')).toEqual([])
  await writeFile(join(process.env.DSH_HARMONY_WORKSPACE_WORLD!, 'observed.json'), JSON.stringify({
    preset: 'devin', model, defaultUnchanged: true, modelTurns: 0, nativeUi: false,
  }, null, 2) + '\n')
})

it('rejects missing models and efforts before creating a Session and keeps legacy metadata/default creation readable', async () => {
  const f = await fixture()
  const before = (await f.ctx.sessionController.list({}, f.signal)).items.length
  for (const model of [
    { provider: 'rich-inline-replay', model: 'missing' },
    { provider: 'rich-inline-replay', model: 'worker-model', reasoningEffort: 'unsupported' },
  ]) {
    await expect(f.ports.manage!({ action: 'create', projectId: null, model }, f.signal)).rejects.toThrow('model unavailable')
  }
  expect((await f.ctx.sessionController.list({}, f.signal)).items).toHaveLength(before)
  await expect(f.ports.manage!({ action: 'create', projectId: null, agentPreset: 'missing' }, f.signal)).rejects.toThrow()
  const legacy = deviceSessionActionSchema.parse({ action: 'create', projectId: null })
  const created = await f.ports.manage!(legacy, f.signal)
  expect(created.sessionId).toBeTruthy()
  expect(deviceSessionDirectory({ desktopId: 'old', profileId: 'desktop', sessions: [], projects: [] }, 'old')).toEqual({ sessions: [], projects: [] })
  expect(f.ctx.agentDefaultModel.currentSelection()).toMatchObject({ model: 'rich-inline-fixed' })
})

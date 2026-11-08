/** Actual ArkUI Index acceptance against synthetic desktop creation owners; no pairing or model turn. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { it } from 'vitest'
import { z } from 'zod'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { loadProfileServices } from './profile-services.ts'
import { deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import { deviceSessionActionSchema } from '../src/device-session-directory.ts'
import { sessionCreationOptionsSchema } from '../src/session-creation.ts'
import { id } from '../src/protocol.ts'

const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('meta'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('creation-options'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('creation-directory'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('creation-manage'), id: z.string().min(1), generation: z.literal(1), raw: z.string().max(8192) }).strict(),
])
it('creates the preset and model selected in the actual native Index without a model turn', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD; assert.ok(world)
  const clientRoot = resolve(import.meta.dirname, '..')
  const ctx = await loadProfileServices(world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
  const lifetime = new AbortController(), tasks = new Set<Promise<void>>(), errors: string[] = [], actions: object[] = []
  const server = createServer()
  try {
    ctx.provide('profileContext', { name: 'desktop', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, home: world, installAnchor: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
    await ctx.plugin(Presets, { default: 'standard' })
    await ctx.agentPresets.register({ id: 'standard', name: 'Standard', plugins: [] })
    await ctx.agentPresets.register({ id: 'devin', name: 'Devin', plugins: [] })
    const file = join(world, 'responses.json')
    await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
    let modelCalls = 0; ctx.on('llm-replay/request', () => { modelCalls++ })
    installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'rich-inline-replay', models: [
      { id: 'rich-inline-fixed', contextWindow: 100000, defaultMaxTokens: 1000 },
      { id: 'worker-model', contextWindow: 100000, defaultMaxTokens: 1000, reasoningEfforts: ['low', 'high'] },
    ] }] })
    const ports = deviceProfileSessionPorts(ctx), before = ctx.agentDefaultModel.currentSelection()
    const baseline = await ctx.sessionController.create({ cwd: world })
    const options = sessionCreationOptionsSchema.parse(await ports.creationOptions!(lifetime.signal))
    const configuration = z.object({ schema: z.literal('harmony-workspace-native-fixture/1'), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(await readFile(join(clientRoot, '.build/workspace-native-review-configuration.json'), 'utf8')))
    let createdId: string | undefined
    server.on('request', (request, response) => {
      const task = (async () => {
        if (request.method !== 'POST' || request.url !== '/native' || request.headers['x-workspace-fixture'] !== configuration.token) { response.writeHead(403).end(); return }
        let raw = ''; for await (const bytes of request) { raw += bytes; if (Buffer.byteLength(raw) > 16384) throw new Error('creation fixture request too large') }
        const input = inputSchema.parse(JSON.parse(raw)); let value: object
        if (input.operation === 'meta') value = { sessionId: baseline.sessionId, origin: 'https://workspace.dsh.invalid', generation: 1 }
        else if (input.operation === 'creation-options') value = sessionCreationOptionsSchema.parse(await ports.creationOptions!(lifetime.signal))
        else if (input.operation === 'creation-directory') value = { sessions: await ports.list(lifetime.signal), projects: await ports.projects!(lifetime.signal) }
        else {
          const action = deviceSessionActionSchema.parse(JSON.parse(input.raw)); assert.equal(action.action, 'create'); assert.equal(actions.length, 0, 'Only one native create is authorized')
          actions.push(action); const result = await ports.manage!(action, lifetime.signal); createdId = result.sessionId; value = result
        }
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ state: 'ready', value: JSON.stringify(value) }))
      })().catch((error: unknown) => { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end() })
      tasks.add(task); void task.finally(() => tasks.delete(task))
    })
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    await writeFile(join(clientRoot, 'evidence/workspace-emulator-active.json'), JSON.stringify({ world, hostPort: address.port, devicePort: 18082, sessionId: baseline.sessionId, startedAt: new Date().toISOString(), app: 'local.dsh.mobile.workspacecheck', scenario: 'creation', options }, null, 2) + '\n')
    let finish: object | undefined
    const deadline = Date.now() + 20 * 60 * 1000
    while (Date.now() < deadline) {
      await writeFile(join(world, 'live.next.json'), JSON.stringify({ responses: modelCalls, errors, createdId }) + '\n'); await rename(join(world, 'live.next.json'), join(world, 'live.json'))
      try { finish = JSON.parse(await readFile(join(world, 'finish.json'), 'utf8')) as object; break }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
      await delay(500)
    }
    ctx.llm.assertZeroRealCalls(); assert.equal(modelCalls, 0); assert.deepEqual(errors, []); assert.ok(createdId)
    const session = ctx.sessions.get(id<'SessionId'>(createdId))!; assert.ok(session)
    const selection = (await ctx.sessionController.readModelSelection({ sessionId: session.id })).selected
    assert.equal(ctx.sessionProjections.stateOf(session, 'agentPreset'), 'devin')
    assert.deepEqual(selection, { provider: 'rich-inline-replay', model: 'worker-model', reasoningEffort: 'high' })
    assert.deepEqual(ctx.agentDefaultModel.currentSelection(), before); assert.equal(actions.length, 1)
    assert.equal(session.snapshotEvents().filter(event => event.type === 'turn/start').length, 0)
    assert.equal((await ports.list(lifetime.signal)).length, 2); await ctx.sessionPersistence.flush()
    await writeFile(join(world, 'observed.json'), JSON.stringify({ nativeUi: true, nativePage: 'Index', fixtureProductProvider: true, carrier: 'test-only HTTP loopback', preset: 'devin', selection, createdId, actions, defaultUnchanged: true, modelTurns: 0, realModels: 0, errors, finish }, null, 2) + '\n')
    assert.ok(finish && 'passed' in finish && finish.passed === true, 'Native Index acceptance must explicitly pass')
  } finally {
    lifetime.abort(); server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept())); await Promise.all(tasks); await ctx.fiber.dispose()
  }
}, 21 * 60 * 1000)

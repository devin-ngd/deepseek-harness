/** Verify sealed device command registration and inactive workspace readback on private installed services. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { z } from 'zod'
import type * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { id } from '../src/protocol.ts'

const services = ['commands', 'userQuestions', 'connection', 'agents', 'sessionController', 'sessionPersistence', 'credentials', 'authorization', 'remoteAccess', 'profileContext', 'typert', 'typertGateway', 'richInline', 'workspaceRegistry', 'storageDomain'] as const
const packagesSchema = z.array(z.object({ id: z.string(), stage: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
/** Installed services are borrowed by a separate Cordis root; only Client Modules comes from a removable sibling provider. */
export const inject = ['appReady', 'appExit', 'llm', 'clientModules', ...services]
async function waitFor(test: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 45000
  do { if (test()) return; await delay(50) } while (Date.now() < deadline)
  throw new Error('Installed device command state not reached: ' + label)
}
/** @param ctx - private profile services running through the copied installed dsh CLI. */
export function apply(ctx: Context): void {
  const world = process.env.DSH_HARMONY_WORKSPACE_INSTALLED_WORLD
  if (!world || process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('isolated installed replay profile required')
  const verifyReadback = process.env.DSH_HARMONY_WORKSPACE_INSTALLED_CASE === 'device-command-complete'
  let operation = Promise.resolve()
  ctx.effect(() => ctx.appReady!.onReady(() => {
    operation = (async () => {
      const budget = join(world, 'four-responses.json')
      await writeFile(budget, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
      const replay = installLlmReplay(ctx, { file: budget, overrideFile: budget, offline: true, providers: [{ id: 'workspace-command-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
      const child = new Context()
      child.accessor('invocation', { get: () => ctx.invocation })
      let calls = 0
      const stopCalls = ctx.on('llm-replay/request', () => { calls++ })
      try {
        for (const key of services) {
          const value = ctx.get(key); assert.ok(value, 'Installed service required: ' + key)
          child.provide(key, key === 'profileContext' ? { ...ctx.profileContext, name: 'desktop', dir: world, cwd: world } : value)
        }
        const packages = packagesSchema.parse(JSON.parse(process.env.DSH_HARMONY_WORKSPACE_INSTALLED_PACKAGES ?? 'null'))
        const mobile = packages.find(entry => entry.id === 'harmony-mobile'); assert.ok(mobile)
        const local = relative(world, mobile.stage); assert.ok(local && !local.startsWith('..') && !isAbsolute(local), 'The command package must be inside the private probe')
        const entryPath = join(mobile.stage, 'lib/device.js'), entry: typeof DeviceCommand = await import(pathToFileURL(entryPath).href)
        const options: DeviceCommand.DeviceCommandOptions = JSON.parse(await readFile(join(mobile.stage, 'device.enabled.example.json'), 'utf8'))
        options.enabled = true; options.connectionMode = 'window'
        options.desktopId = 'installed-command-desktop'; options.deviceId = 'installed-command-phone'
        options.workspace = { ttlMs: 60000, channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
          wire: { maxChunkBytes: 65536, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: 2097152 } }
        if (verifyReadback) {
          options.identityAlias = 'installed-command-no-identity'
          options.audience = 'relay.example'; options.wss.host = 'relay.example'
          const { workspace }: Pick<DeviceCommand.DeviceCommandOptions, 'workspace'> = JSON.parse(await readFile(join(mobile.stage, 'workspace.enabled.example.json'), 'utf8'))
          assert.ok(workspace?.shell)
          options.workspace = { ...workspace, shell: { ...workspace.shell, distIndex: join(mobile.stage, 'workspace-shell/index.html') } }
        }
        const session = await ctx.sessionController.create({ cwd: world }), agent = ctx.agents.get(id<'SessionId'>(session.sessionId)); assert.ok(agent)
        const present = () => ctx.commands.list(agent).some(command => command.name === 'harmony-device')
        const signal = new AbortController().signal
        const run = (verb: string) => ctx.commands.execute(agent, '/harmony-device ' + verb, [], signal)
        const expectInactive = async (verb: string) => {
          const response = await run(verb)
          assert.ok(response?.result.kind === 'success' && response.result.text !== undefined, JSON.stringify(response))
          assert.deepEqual(JSON.parse(response.result.text), { profileId: 'desktop', sessionId: session.sessionId, state: 'workspace-disabled', publicResult: { enabled: false, expiresAt: null } })
        }
        assert.equal(present(), false, 'The daily command must not be loaded in this private profile')
        const provideModules = () => child.plugin({ name: 'installed-command-client-modules', apply: inner => { inner.provide('clientModules', ctx.clientModules) } })
        const modules = provideModules(); await modules
        const command = child.plugin(entry, options); await command
        await waitFor(present, 'command registered')
        if (verifyReadback) {
          await expectInactive('workspace-status')
          await expectInactive('workspace-stop')
        }
        const graph = ctx.clientModules.graph(); assert.ok(graph.batches.length > 0)
        await modules.dispose()
        await waitFor(() => !present(), 'command removed after Client Modules provider disposal')
        const restored = provideModules(); await restored
        await waitFor(present, 'command restored after Client Modules provider replacement')
        if (verifyReadback) await expectInactive('workspace-status')
        await command.dispose(); await waitFor(() => !present(), 'command disposed')
        await restored.dispose()
        const { workspace: unusedWorkspace, ...nativeOptions } = options; void unusedWorkspace
        const native = child.plugin(entry, nativeOptions); await native
        await waitFor(present, 'native-only command without Client Modules')
        if (verifyReadback) assert.deepEqual((await run('workspace-status'))?.result, { kind: 'error', text: 'Standard workspace is not enabled in this deployment.' })
        await native.dispose(); await waitFor(() => !present(), 'native-only command disposed')
        assert.equal(calls, 0); ctx.llm.assertZeroRealCalls(); await ctx.sessionPersistence.flush()
        await writeFile(join(world, 'observed.json'), JSON.stringify({ passed: true, scenario: process.env.DSH_HARMONY_WORKSPACE_INSTALLED_CASE,
          installedServices: true, importedEntry: entryPath, archiveSha256: mobile.sha256, siblingModulesProvider: true, registration: true,
          dependencyUnload: true, dependencyRestore: true, nativeOnlyWithoutModules: true, commandExecuted: verifyReadback, identitiesOpened: false,
          inactiveReadbackWithoutIdentity: verifyReadback,
          socketsOpenedByCommand: false, modelCalls: calls, realModels: 0, replayBudget: 4, graphBatches: graph.batches.length, userProfile: false }, null, 2) + '\n')
      } finally { await child.fiber.dispose(); stopCalls(); replay.dispose() }
    })().then(async () => {
      await writeFile(join(world, 'probe.json'), await readFile(join(world, 'observed.json'))); ctx.appExit!(0)
    }, async error => {
      await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: false, error: String(error), stack: error instanceof Error ? error.stack : undefined }) + '\n'); ctx.appExit!(1)
    })
  }))
  ctx.effect(() => () => operation)
}

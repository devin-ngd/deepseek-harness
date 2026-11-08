/** Synthetic app plugin launched only through the copied installed dsh profile; no user profile, provider account or model turn. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'

/** Capabilities are required before the launcher's successful-startup callback. */
export const inject = ['appReady', 'appExit', 'llm', 'sessionController', 'sessionPersistence', 'agentPresets', 'clientModules']
/** @param ctx - copied installed services in an isolated profile. */
export function apply(ctx: Context): void {
  const world = process.env.DSH_HARMONY_WORKSPACE_INSTALLED_WORLD
  if (world === undefined || process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('isolated installed probe required')
  let operation = Promise.resolve()
  ctx.effect(() => ctx.appReady!.onReady(() => {
    operation = (async () => {
      const file = join(world, 'four-responses.json')
      await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
      const replay = installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'workspace-installed-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
      try {
        assert.equal(typeof ctx.clientModules.fetchBundle, 'function', 'Installed Client Modules must serve standard bundles')
        assert.equal(typeof ctx.clientModules.graph, 'function')
        assert.equal(typeof ctx.sessionController.modelCatalog, 'function')
        assert.equal(typeof ctx.sessionController.compareAndSelectModel, 'function')
        const catalogue = await ctx.sessionController.modelCatalog(), presets = await ctx.agentPresets.remoteExportList()
        const session = await ctx.sessionController.create({ cwd: world })
        const before = await ctx.sessionController.readModelSelection({ sessionId: session.sessionId })
        const selected = await ctx.sessionController.compareAndSelectModel({ sessionId: session.sessionId, expectedSelectionRevision: before.selectionRevision,
          selection: { provider: 'workspace-installed-replay', model: 'main' } })
        assert.equal(selected.applied, true)
        const after = await ctx.sessionController.readModelSelection({ sessionId: session.sessionId })
        assert.equal(after.selected?.model, 'main'); await ctx.sessionPersistence.flush(); ctx.llm.assertZeroRealCalls()
        await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: true, installedServices: true, modelSelection: after,
          presets: presets.presets.map(row => row.id), modelGroups: catalogue.groups.map(row => row.id), batches: ctx.clientModules.graph().batches.length,
          modelCalls: 0, replayBudget: 4, uploads: 0, userProfile: false }, null, 2) + '\n')
      } finally { replay.dispose() }
    })().then(() => { ctx.appExit!(0) }, async error => { await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: false, error: String(error), stack: error instanceof Error ? error.stack : undefined }) + '\n'); ctx.appExit!(1) })
  }))
  ctx.effect(() => () => operation)
}

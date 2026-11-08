/** Source profile adapter for the shared native emulator acceptance fixture. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { z } from 'zod'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { runWorkspaceEmulator } from './workspace-emulator-fixture.ts'

it('serves a finite synthetic workspace only to the independent emulator application', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD, rich = process.env.DSH_HARMONY_WORKSPACE_RICH
  const navigation = process.env.DSH_HARMONY_WORKSPACE_NAVIGATION, devflow = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW
  assert.ok(world && rich && navigation && devflow)
  const clientRoot = resolve(import.meta.dirname, '..'), root = resolve(clientRoot, '../..')
  const panelTarget = process.env.DSH_HARMONY_WORKSPACE_PLUGIN_TARGET === '1'
  const staged = JSON.parse(await readFile(join(clientRoot, panelTarget ? 'evidence/workspace-plugin-host-native-review-project.json' : 'evidence/workspace-native-review-project.json'), 'utf8')) as { fixtureConfiguration: string }
  const packageName = panelTarget ? z.object({ name: z.string().min(1).max(256) }).parse(JSON.parse(await readFile(join(devflow, 'package.json'), 'utf8'))).name : undefined
  const scaffold = await launchWebScaffold({ firstUse: true, toolsMode: 'native', extraOverlayPath: join(world, 'workspace.overlay.yml'),
    profile: { hmr: false, packages: [{ dir: rich, enabled: true }, { dir: navigation, enabled: true }, { dir: devflow, enabled: true }] } })
  try {
    await runWorkspaceEmulator(scaffold.ctx, { world, clientRoot, shellIndex: join(root, 'apps/web/dist/index.html'), fixtureConfiguration: staged.fixtureConfiguration,
      workflowRun: process.env.DSH_HARMONY_WORKSPACE_EMULATOR_FLOW === '1', ...(packageName === undefined ? {} : { panelTargetPackage: packageName }) })
  } finally { await scaffold.close() }
}, 21 * 60 * 1000)

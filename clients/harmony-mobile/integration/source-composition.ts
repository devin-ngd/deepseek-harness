/** Actual source-mode services behind counted fixture preflight and the maintained runtime dispatch guard. */
import { readFile } from 'node:fs/promises'
import { loadProfileServices } from './profile-services.ts'

/** Fixed route and budget already used by the upstream offline preflight tests. */
export const route = { provider: 'rich-inline-replay', model: 'rich-inline-fixed', expectedCalls: 4 }

/**
 * Load only the service providers exercised by this test after all offline declarations pass.
 * @param world - test-owned absolute directory; no user Session or DSH home is read.
 * @param assets - explicit packaged fixture/config text; source tests may use the owned source files.
 * @returns a real Loader context with SessionController/RichInline and an uninstalled replay handle.
 */
export async function sourceComposition(world: string, assets?: { readonly fixture: string; readonly config: string }) {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('Explicit replay mode and runtime dispatch hard-block required')
  const { prepareOfflineSnapshot } = await import('../../../packages/test-support/session-snapshot/src/offline.ts')
  const fixture = assets?.fixture ?? await readFile(new URL('../../../packages/test-support/llm-replay/tests/fixtures/offline-four.v4.jsonl', import.meta.url), 'utf8')
  const prepared = prepareOfflineSnapshot({ ...route, fixtures: [fixture], cwd: world })
  if (prepared.expectedCalls !== 4) throw new Error('Exact four-response fixture required before service construction')
  return loadProfileServices(world, assets?.config ?? await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
}

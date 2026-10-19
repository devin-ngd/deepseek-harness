/** Exercise the unmodified DSH preset with a two-module dynamic-import fixture and either compiler installation. */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { clientBundle } from '../../../../../../Temp/dsh-harmony-alpha4-source-20261016/packages/client/tsdown.client.ts'
const project = resolve(import.meta.dirname, '..'), isolated = 'D:/Temp/dsh-harmony-alpha4-source-20261016', primary = 'D:/workspace/agents/deepseek-harness', hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const helper = 'packages/client/tsdown.client.ts', baseline = execFileSync('git', ['show', 'HEAD:' + helper], { cwd: isolated, maxBuffer: 1048576 })
const current = await readFile(join(isolated, helper)), original = await readFile(join(primary, helper))
assert.equal(hash(current), hash(baseline)); assert.equal(hash(current), hash(original))
await mkdir(join(isolated, '.artifacts'), { recursive: true })
const directory = await mkdtemp(join(isolated, '.artifacts/phase64-preset-')), id = '@deepseek-ai/dsh-experimental-phase64-fixture'
await mkdir(join(directory, 'lib/types/client'), { recursive: true })
await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version: '0.0.0', type: 'module', dsh: { client: { external: [] } } }) + '\n')
await writeFile(join(directory, 'lib/types/client/index.js'), "export async function loadFixture() { return import('./lazy.js') }\n")
await writeFile(join(directory, 'lib/types/client/lazy.js'), 'export const value = 42;\n')
const cases = []
for (const [label, root] of [['primary-engine', primary], ['isolated-engine', isolated]]) {
  const engine = await import(pathToFileURL(join(root, 'node_modules/tsdown/dist/index.mjs')).href)
  const configs = clientBundle(directory, ['lib/types/index.js'])({ env: { DSH_BUILD_FACE: 'client' } })
  const client = configs.find(config => config.name === id + '/client')
  if (client === undefined) throw new Error('Actual preset client face unavailable')
  let failure = null
  try { await engine.build({ ...client, cwd: directory, config: false, workspace: false, write: false, report: false, logLevel: 'silent' }) }
  catch (error) { failure = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined } }
  cases.push({ engine: label, success: failure === null, failure })
}
assert.equal(cases[0]?.success, false); assert.match(cases[0]?.failure?.message ?? '', /Missing field `code`/); assert.equal(cases[1]?.success, true)
const hap = 'D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap', sha256 = hash(await readFile(hap))
assert.equal(sha256, 'e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858')
await writeFile(join(project, 'evidence/phase64-preset-repro.json'), JSON.stringify({ at: new Date().toISOString(), directory, unchangedPresetSha256: hash(current), unchangedFromBase: true, primaryMatchesIsolatedPreset: true, applicationSourceUsed: false, outputWritten: false, cases, candidateSha256Unchanged: sha256 }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ unchangedPreset: true, cases: cases.map(value => ({ engine: value.engine, success: value.success })), candidateUnchanged: true }))

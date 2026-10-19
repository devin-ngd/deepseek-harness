/** Isolate native MagicString instance compatibility without application code, filesystem inputs or network. */
import { readFile, writeFile, copyFile, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const project = resolve(import.meta.dirname, '..'), primary = 'D:/workspace/agents/deepseek-harness', isolated = 'D:/Temp/dsh-harmony-alpha4-source-20261016', evidence = join(project, 'evidence')
const primaryModule = await import(pathToFileURL(join(primary, 'node_modules/tsdown/dist/index.mjs')).href)
const isolatedModule = await import(pathToFileURL(join(isolated, 'node_modules/tsdown/dist/index.mjs')).href)
const versions = {}
for (const [label, root] of [['primary', primary], ['isolated', isolated]]) {
  const tsdown = JSON.parse(await readFile(join(root, 'node_modules/tsdown/package.json'), 'utf8'))
  const requireRoot = createRequire(await realpath(join(root, 'node_modules/tsdown/package.json')))
  const rolldown = JSON.parse(await readFile(requireRoot.resolve('rolldown/package.json'), 'utf8'))
  versions[label] = { tsdown: tsdown.version, rolldown: rolldown.version, cliSha256: createHash('sha256').update(await readFile(join(root, 'node_modules/tsdown/dist/run.mjs'))).digest('hex') }
}
assert.deepEqual(versions.primary, versions.isolated)
const cases = []
for (const [engineName, engine] of [['primary', primaryModule.Rolldown], ['isolated', isolatedModule.Rolldown]]) {
  for (const [magicName, magic] of [['primary', primaryModule.Rolldown], ['isolated', isolatedModule.Rolldown]]) {
    let bundle, failure = null, code = null
    try {
      bundle = await engine.rolldown({ input: 'virtual:phase64-entry', plugins: [{ name: 'phase64-static-fixture', resolveId: source => source === 'virtual:phase64-entry' ? source : null, load: id => id === 'virtual:phase64-entry' ? 'export const value = 1;' : null, renderChunk(source) { const changed = new magic.RolldownMagicString(source); changed.append('\n// synthetic changed chunk\n'); return changed } }] })
      const result = await bundle.generate({ format: 'cjs' }); code = result.output.find(value => value.type === 'chunk')?.code ?? null
    } catch (error) { failure = { name: error.name, message: error.message, stack: error.stack } }
    finally { if (bundle !== undefined) await bundle.close() }
    cases.push({ engine: engineName, magicString: magicName, success: failure === null, containsFixture: code?.includes('synthetic changed chunk') ?? false, failure })
  }
}
const candidate = 'D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap', sha256 = createHash('sha256').update(await readFile(candidate)).digest('hex')
assert.equal(sha256, 'e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858')
await copyFile(join(project, '.build/phase63-isolated-artifacts-toolpath.log'), join(evidence, 'phase64-original-client-error.log'), constants.COPYFILE_EXCL)
const report = { at: new Date().toISOString(), node: process.version, sourceBase: 'b23972eb7145ab0bb923c45dc28ffcd9f6556412', versions, magicStringClassesIdentical: primaryModule.Rolldown.RolldownMagicString === isolatedModule.Rolldown.RolldownMagicString, cases, applicationSourceUsed: false, models: 0, network: false, signed: false, installed: false, candidateSha256Unchanged: sha256 }
await writeFile(join(evidence, 'phase64-rolldown-repro.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ versions, classesIdentical: report.magicStringClassesIdentical, cases: cases.map(value => ({ engine: value.engine, magicString: value.magicString, success: value.success, error: value.failure?.message ?? null })), candidateUnchanged: true }))

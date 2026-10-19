/** Build matching public-only maintenance tools for the inactive native-origin proposal; no public trust is initialized. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), stage = resolve('.build/phase68-public-tools'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
await mkdir(stage)
const entries = []
for (const [entry, file] of [['prepare-public-config.ts', 'prepare-public-config.mjs'], ['provision.ts', 'initialize-public-trust.mjs']]) {
  const built = await esbuild.build({ entryPoints: [resolve('standalone-relay/src/' + entry)], outfile: join(stage, file), bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true })
  for (const output of Object.values(built.metafile.outputs)) for (const imported of output.imports) assert.ok(isBuiltin(imported.path))
  entries.push({ file, sha256: hash(await readFile(join(stage, file))), sourceInputs: await Promise.all(Object.keys(built.metafile.inputs).map(async path => ({ path, sha256: hash(await readFile(path)) }))) })
}
await copyFile('.build/first-use-relay-tools.3/relay-endpoint-timers.json', join(stage, 'relay-endpoint-timers.json'))
await copyFile('.build/phase68-relay-candidate/config.networkkit.proposal.json', join(stage, 'config.first-use.proposal.json'))
await writeFile(join(stage, 'package.json'), JSON.stringify({ private: true, type: 'module', version: '0.0.0-phase68' }, null, 2) + '\n')
const record = { at: new Date().toISOString(), stage, entries, initialized: false, deployed: false, network: false, sameExistingTimerLimits: true, newPairOrGrant: false }
await writeFile(join(stage, 'build-info.json'), JSON.stringify(record, null, 2) + '\n'); await writeFile('evidence/phase68-public-tools.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ stage, tools: 2, initialized: false }))

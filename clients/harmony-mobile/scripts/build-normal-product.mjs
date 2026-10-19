/** Compile the inactive normal-profile entry and audit its inputs; no archive, install, activation or application launch. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'

const project = resolve('.')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const output = resolve('.build/normal-product-entry/product.js')
const result = await esbuild.build({
  entryPoints: { product: resolve('desktop-plugin/src/product.ts'), pairing: resolve('desktop-plugin/src/pairing.ts') }, outdir: resolve('.build/normal-product-entry'),
  bundle: true, format: 'esm', platform: 'node', target: 'node22', external: ['@deepseek-ai/*', 'ws'],
  metafile: true, tsconfig: await projectionTsconfig(project, root), absWorkingDir: root,
})
const inputs = []
for (const name of Object.keys(result.metafile.inputs)) {
  const path = resolve(root, name)
  assert.doesNotMatch(path, /(?:replay-profile|replay-host|llm-replay|profile-services|source-composition|host-fixture|native-sdk|phase\d+-fixture)/)
  inputs.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
}
const manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8'))
assert.equal(manifest.exports['./product'].default, './lib/product.js')
assert.equal(manifest.exports['./pairing'].default, './lib/pairing.js')
assert.equal(manifest.dependencies.ws, '8.21.3')
const bytes = await readFile(output)
const pairingBytes = await readFile(resolve('.build/normal-product-entry/pairing.js'))
assert.doesNotMatch(bytes.toString('utf8'), /rich-inline-replay|rich-inline-fixed|replay-profile|installLlmReplay/)
assert.doesNotMatch(pairingBytes.toString('utf8'), /rich-inline-replay|rich-inline-fixed|replay-profile|installLlmReplay/)
await mkdir('evidence', { recursive: true })
await writeFile('evidence/normal-product-build.json', JSON.stringify({
  at: new Date().toISOString(), output, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), inputs,
  pairing: { output: resolve('.build/normal-product-entry/pairing.js'), bytes: pairingBytes.length, sha256: createHash('sha256').update(pairingBytes).digest('hex') },
  runtimeExternals: [...new Set(Object.values(result.metafile.outputs).flatMap(value => value.imports.filter(entry => entry.external).map(entry => entry.path)))],
  replayInputs: 0, archived: false, installed: false, activated: false, deviceQualified: false,
}, null, 2) + '\n')
console.log(`PASS: normal-profile ESM entry; ${inputs.length} inputs; zero replay inputs; no archive or activation`)

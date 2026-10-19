/** Build an installable default-disabled bundle from source; installs nothing and records all consumed inputs. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises'
import { resolve, dirname, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), ts = require('typescript')
const stage = resolve('.build/phase32-package/package')
await mkdir(join(stage, 'lib'), { recursive: true }); await mkdir(join(stage, 'licenses'), { recursive: true })
const manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8'))
const baseConfig = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile)
if (baseConfig.error) throw new Error(ts.flattenDiagnosticMessageText(baseConfig.error.messageText, '\n'))
const paths = baseConfig.config.compilerOptions.paths
for (const name of Object.keys(manifest.peerDependencies)) {
  let file
  if (name === '@deepseek-ai/dsh') file = join(root, 'apps/cli/package.json')
  else {
    const entry = paths[name]?.[0]; assert.ok(entry, name)
    let current = resolve(root, entry)
    while (true) {
      assert.ok(!relative(root, current).startsWith('..'), name)
      const candidate = join(current, 'package.json')
      try { const data = JSON.parse(await readFile(candidate, 'utf8')); if (data.name === name) { file = candidate; break } }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
      if (current === resolve(root)) throw new Error('Peer manifest not found: ' + name)
      current = dirname(current)
    }
  }
  const peer = JSON.parse(await readFile(file, 'utf8')); assert.equal(peer.name, name)
  manifest.peerDependencies[name] = peer.version
}
await writeFile('desktop-plugin/package.json', JSON.stringify(manifest, null, 2) + '\n')
await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
for (const file of ['cordis.patch.yml', 'README.md']) await copyFile('desktop-plugin/' + file, join(stage, file))
await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'))
const result = await esbuild.build({ entryPoints: { index: resolve('desktop-plugin/src/index.ts'), admission: resolve('desktop-plugin/src/admission.ts'), transport: resolve('desktop-plugin/src/transport.ts') }, outdir: join(stage, 'lib'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', external: ['@deepseek-ai/*'], metafile: true, tsconfig: await projectionTsconfig(project, root), absWorkingDir: root, legalComments: 'linked' })
const inputs = []
for (const name of Object.keys(result.metafile.inputs)) {
  const path = resolve(root, name), bytes = await readFile(path)
  if (/host-fixture|mock\.ts|relay\.ts|replay-host|source-composition|loopback-bff|native|credentials[\\/].*src/.test(path)) throw new Error('Fixture/native/credential runtime entered installable bundle: ' + path)
  inputs.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const config = ts.readConfigFile('.build/tsconfig.check.json', ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve('.build'))
const declarationRoot = resolve('.build/phase32-declarations')
const sourceCommonRoot = 'D:/'
const program = ts.createProgram({ rootNames: ['index.ts', 'admission.ts', 'transport.ts'].map(file => resolve('desktop-plugin/src/' + file)), options: { ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, rootDir: sourceCommonRoot, outDir: declarationRoot }, projectReferences: parsed.projectReferences })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => project, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
const emitted = program.emit(undefined, (path, content) => { if (resolve(path).startsWith(declarationRoot)) ts.sys.writeFile(path, content) }, undefined, true)
if (emitted.emitSkipped) throw new Error('Declaration emission skipped')
const clientDeclarations = join(declarationRoot, relative(sourceCommonRoot, project))
async function copyDeclarations(from, to) {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyDeclarations(join(from, entry.name), join(to, entry.name))
    else if (entry.name.endsWith('.d.ts')) await copyFile(join(from, entry.name), join(to, entry.name))
  }
}
await copyDeclarations(clientDeclarations, join(stage, 'lib/types'))
const zod = dirname(require.resolve('zod'))
await writeFile(join(stage, 'licenses/zod.txt'), (await readFile(join(zod, 'LICENSE'), 'utf8')).trimEnd() + '\n')
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ schema: 'harmony-desktop-build/1', package: manifest.name, version: manifest.version, peers: manifest.peerDependencies, sourceInputs: inputs, sourceRootDirty: true, sourceOnlyCompatibility: true, installedDesktopVerified: false, defaultDisabled: true, lifecycleScripts: false, models: 0, uploads: 0 }, null, 2) + '\n')
await writeFile('evidence/phase32-build.json', JSON.stringify({ stage, package: manifest.name, version: manifest.version, inputs, peers: manifest.peerDependencies, esm: true, declarations: true, network: false, installed: false }, null, 2) + '\n')
console.log('PASS: installable disabled bundle ESM/declarations; ' + inputs.length + ' source inputs; no fixture runtime')

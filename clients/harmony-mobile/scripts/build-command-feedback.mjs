/** Build the browser face with DSH's official factory preset and a separate strict client program. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { projectionTsconfig } from './projection-source.mjs'

/** @param stage - new isolated output directory. @returns client files and exact input hashes; no installed profile is opened. */
export async function buildCommandFeedback(stage) {
  const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
  const require = createRequire(join(root, 'package.json')), ts = require('typescript'), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
  const manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')), hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const world = await mkdtemp(resolve('.build/feedback-types-' + manifest.version + '-')), declarations = join(world, 'declarations'), drive = resolve(root).slice(0, 3)
  const compilerConfig = { extends: join(root, 'tsconfig.base.client.json'), compilerOptions: { noEmit: false, composite: false, incremental: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, noUnusedLocals: true, noUnusedParameters: true, rootDir: drive, outDir: declarations }, files: [resolve('desktop-plugin/client/index.ts'), join(root, 'packages/client/ui-conversation/src/css-modules.d.ts')], references: ['vendor/cordis', 'packages/api/session-controller/tsconfig.client.json', 'packages/client/ui-commands/tsconfig.json', 'packages/client/ui-conversation/tsconfig.client.json', 'packages/client/locale/tsconfig.client.json', 'packages/client/ui-slots/tsconfig.json'].map(path => ({ path: join(root, path) })) }
  await writeFile(join(world, 'tsconfig.json'), JSON.stringify(compilerConfig, null, 2) + '\n')
  const parsed = ts.parseJsonConfigFileContent(compilerConfig, ts.sys, client)
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  await writeFile(join(world, 'typecheck.json'), JSON.stringify({ diagnostics: diagnostics.map(item => ({ file: item.file?.fileName, code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n') })) }, null, 2) + '\n')
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => client, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
  assert.equal(program.emit(undefined, (path, text) => { if (resolve(path).startsWith(declarations)) ts.sys.writeFile(path, text) }, undefined, true).emitSkipped, false)
  const copyTypes = async (from, to) => { await mkdir(to, { recursive: true }); for (const entry of await readdir(from, { withFileTypes: true })) if (entry.isDirectory()) await copyTypes(join(from, entry.name), join(to, entry.name)); else if (entry.name.endsWith('.d.ts')) await writeFile(join(to, entry.name), await readFile(join(from, entry.name))) }
  await copyTypes(join(declarations, relative(drive, client)), join(stage, 'lib/client-types'))
  const helperSource = join(root, 'packages/client/tsdown.client.ts'), helperOutput = join(world, 'official-client-preset.mjs')
  await esbuild.build({ entryPoints: [helperSource], outfile: helperOutput, bundle: true, platform: 'node', format: 'esm', packages: 'external', absWorkingDir: root, define: { 'import.meta.url': JSON.stringify(pathToFileURL(helperSource).href) }, banner: { js: "import { createRequire as helperRequire } from 'node:module'; const require = helperRequire(import.meta.url);" }, logLevel: 'warning' })
  const { clientBundle } = await import(pathToFileURL(helperOutput).href), { build } = await import(pathToFileURL(require.resolve('tsdown')).href)
  const config = clientBundle(resolve('desktop-plugin'), [])({ env: {} }).find(item => item.name === manifest.name + '/client')
  assert.ok(config)
  await build({ ...config, config: false, cwd: resolve('desktop-plugin'), entry: { client: resolve('desktop-plugin/client/index.ts') }, outDir: join(stage, 'lib'), tsconfig: join(root, 'tsconfig.base.client.json'), exports: false })
  await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(stage, 'cordis.patch.yml'), await readFile('desktop-plugin/cordis.patch.yml'))
  const inputs = ['desktop-plugin/client/index.ts', 'desktop-plugin/client/feedback.ts', 'desktop-plugin/client/control-model.ts', 'desktop-plugin/client/control-panel.tsx', 'desktop-plugin/client/control-panel-entry.ts', 'desktop-plugin/client/control-panel.module.css', 'desktop-plugin/package.json', 'desktop-plugin/cordis.patch.yml', 'src/device-route-protocol.ts', 'src/device-binding-protocol.ts', 'src/device-operations.ts', 'src/signing-bytes.ts', 'tests/command-feedback.test.mjs', 'tests/control-panel.test.mjs', 'scripts/build-command-feedback.mjs', 'scripts/check-command-feedback.mjs'].map(path => resolve(path)).concat(helperSource)
  const sourceInputs = await Promise.all(inputs.map(async path => ({ path, sha256: hash(await readFile(path)) })))
  const files = []
  const visit = async (directory, prefix = '') => { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name), name = prefix + entry.name; if (entry.isDirectory()) await visit(path, name + '/'); else files.push({ path: name, sha256: hash(await readFile(path)) }) } }
  await visit(stage)
  return { version: manifest.version, stage, sourceInputs, files, compilerFace: 'client-only', typeDiagnostics: 0, typecheck: join(world, 'typecheck.json'), officialPreset: helperSource }
}

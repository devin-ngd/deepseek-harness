/** Build a same-package rich client carrier seam from the isolated checkout; keep the original Host bytes. */
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, realpath, readdir } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const checkout = resolve('.build/workspace-core-checkout'), packagePath = 'packages/experimental/rich-inline', source = join(checkout, packagePath)
const world = await mkdtemp(resolve('.build/workspace-rich-')), stage = join(world, 'package')
// This client artifact consumes the unchanged, already built Host wire descriptors and their package self-exports.
await cp(join(root, packagePath, 'lib'), join(source, 'lib'), { recursive: true })
const require = createRequire(join(root, 'package.json')), ts = require('typescript')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const leaf = JSON.parse(await readFile(join(root, packagePath, 'tsconfig.client.json'), 'utf8'))
const declarations = join(world, 'declarations'), drive = resolve(root).slice(0, 3)
const config = { extends: join(root, 'tsconfig.base.client.json'), compilerOptions: { noEmit: false, composite: false,
  incremental: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false,
  rootDir: drive, outDir: declarations, noUnusedLocals: true, noUnusedParameters: true },
  include: [join(source, 'src/client/**/*.ts'), join(source, 'src/client/**/*.tsx'), join(source, 'src/shared/**/*.ts'), join(source, 'src/css-modules.d.ts')],
  references: leaf.references.map(item => ({ path: resolve(root, packagePath, item.path) })) }
await writeFile(join(world, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n')
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, project)
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => project, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
assert.equal(program.emit(undefined, (path, value) => { assert.ok(resolve(path).startsWith(declarations)); ts.sys.writeFile(path, value) }, undefined, true).emitSkipped, false)
await mkdir(stage)
// Resolve each existing dependency before linking: pnpm's relative links cannot be relocated through a parent junction.
const dependencyRoot = join(root, packagePath, 'node_modules')
for (const name of await readdir(dependencyRoot)) {
  if (name.startsWith('.')) continue
  const entries = name.startsWith('@') ? (await readdir(join(dependencyRoot, name))).map(child => name + '/' + child) : [name]
  for (const entry of entries) {
    const target = await realpath(join(dependencyRoot, entry)), link = join(stage, 'node_modules', entry)
    await mkdir(resolve(link, '..'), { recursive: true }); await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
}
await cp(join(root, packagePath, 'lib'), join(stage, 'lib'), { recursive: true })
await cp(join(declarations, relative(drive, source), 'src'), join(stage, 'lib/types'), { recursive: true })
for (const file of ['package.json', 'cordis.patch.yml']) await cp(join(source, file), join(stage, file))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const helperSource = join(root, 'packages/client/tsdown.client.ts'), helper = join(world, 'official-client-preset.mjs')
await esbuild.build({ entryPoints: [helperSource], outfile: helper, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  absWorkingDir: root, define: { 'import.meta.url': JSON.stringify(pathToFileURL(helperSource).href) },
  banner: { js: "import { createRequire as helperRequire } from 'node:module'; const require = helperRequire(import.meta.url);" }, logLevel: 'warning' })
const { clientBundle } = await import(pathToFileURL(helper).href), { build } = await import(pathToFileURL(require.resolve('tsdown')).href)
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
const bundle = clientBundle(source, [])({ env: {} }).find(value => value.name === manifest.name + '/client')
assert.ok(bundle)
await build({ ...bundle, config: false, cwd: source, entry: { client: join(source, 'src/client/index.ts') },
  outDir: join(stage, 'lib'), tsconfig: join(root, 'tsconfig.base.client.json'), exports: false })
const hostFiles = ['lib/index.js', 'lib/typert.host.js', 'lib/typert.remote-client.js'], hostSha256 = {}
for (const file of hostFiles) { const original = hash(await readFile(join(root, packagePath, file))); assert.equal(hash(await readFile(join(stage, file))), original); hostSha256[file] = original }
const sourceInputs = {}
for (const file of program.getSourceFiles().filter(item => item.fileName.replaceAll('\\', '/').startsWith(source.replaceAll('\\', '/') + '/src/'))) sourceInputs[file.fileName] = hash(await readFile(file.fileName))
const report = { stage, checkout, typeDiagnostics: 0, clientSha256: hash(await readFile(join(stage, 'lib/client.js'))), sourceInputs, hostSha256,
  installed: false, realModels: 0, nativeExecuted: false }
await writeFile(join(world, 'build.json'), JSON.stringify(report, null, 2) + '\n')
await writeFile('evidence/workspace-rich-build.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ stage, typeDiagnostics: 0, hostUnchanged: true, evidence: 'evidence/workspace-rich-build.json' }))

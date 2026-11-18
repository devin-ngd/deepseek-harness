/** Build every standard desktop entry and its client face from lab source; do not inspect or change an installed profile. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
import { buildCommandFeedback } from './build-command-feedback.mjs'

const explicitReport = process.argv[2]?.match(/^--report=(evidence\/workspace-desktop-[\w-]+\.json)$/)?.[1]
assert.ok(process.argv.length === 2 || process.argv.length === 3 && explicitReport !== undefined)
const reportPath = explicitReport ?? 'evidence/workspace-desktop-build.json'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const web = join(root, 'apps/web/dist'), webIndex = join(web, 'index.html')
const environment = join(root, '.dsh-build/client-build-environment.json')
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const release = host.version
const webBuild = JSON.parse(await readFile(environment, 'utf8'))
assert.equal(webBuild.environment.DSH_CLIENT_VERSION, release, 'Run the DSH build:artifacts task for the current Web release.')
const indexBytes = await readFile(webIndex)
assert.ok(indexBytes.byteLength > 0, 'The DSH Web build has no usable index.html.')
const require = createRequire(join(root, 'package.json')), ts = require('typescript'), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const world = await mkdtemp(resolve('.build/workspace-desktop-')), stage = join(world, 'package')
const browser = await buildCommandFeedback(stage)
const manifest = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'))
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-workspace'], release)
assert.ok(manifest.files.includes('workspace-shell'))
await cp(web, join(stage, 'workspace-shell'), { recursive: true, force: false, errorOnExist: true })
assert.deepEqual(await readFile(join(stage, 'workspace-shell/index.html')), indexBytes)
manifest.dependencies.zod = host.devDependencies.zod
const entries = ['index', 'admission', 'transport', 'paired-provider', 'relay-lifecycle', 'product', 'pairing', 'test-session', 'device-binding-command']
for (const entry of entries.slice(3).filter(value => value !== 'device-binding-command')) manifest.exports['./' + entry] = { types: './lib/types/desktop-plugin/src/' + entry + '.d.ts', default: './lib/' + entry + '.js' }
await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
const built = await esbuild.build({ entryPoints: Object.fromEntries(entries.map(entry => [entry === 'device-binding-command' ? 'device' : entry, resolve('desktop-plugin/src/' + entry + '.ts')])),
  outdir: join(stage, 'lib'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*', 'ws', 'zod'],
  tsconfig: await projectionTsconfig(client, root), absWorkingDir: root, metafile: true, legalComments: 'linked' })
const sourceInputs = [...browser.sourceInputs]
for (const input of Object.keys(built.metafile.inputs)) {
  const path = resolve(root, input)
  assert.doesNotMatch(path, /replay-profile|replay-host|source-composition|profile-services|host-fixture|native-sdk|phase\d+-fixture/)
  sourceInputs.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
}
const config = ts.readConfigFile('.build/tsconfig.check.json', ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve('.build'))
const declarations = join(world, 'declarations'), drive = resolve(root).slice(0, 3)
const program = ts.createProgram({ rootNames: entries.map(entry => resolve('desktop-plugin/src/' + entry + '.ts')),
  options: { ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, rootDir: drive, outDir: declarations }, projectReferences: parsed.projectReferences })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => client, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
assert.equal(program.emit(undefined, (path, text) => { if (resolve(path).startsWith(declarations)) ts.sys.writeFile(path, text) }, undefined, true).emitSkipped, false)
const copyTypes = async (from, to) => { await mkdir(to, { recursive: true }); for (const entry of await readdir(from, { withFileTypes: true })) {
  if (entry.isDirectory()) await copyTypes(join(from, entry.name), join(to, entry.name))
  else if (entry.name.endsWith('.d.ts')) await writeFile(join(to, entry.name), await readFile(join(from, entry.name)))
} }
await copyTypes(join(declarations, relative(drive, client)), join(stage, 'lib/types'))
for (const value of Object.values(manifest.exports)) if (typeof value === 'object') for (const field of ['types', 'default']) if (value[field] !== undefined) assert.ok((await readFile(join(stage, value[field]))).byteLength)
const report = { stage, sourceInputs, typeDiagnostics: 0, entries: entries.length, client: browser, defaultDisabled: true,
  workspaceShell: { release, index: 'workspace-shell/index.html', sha256: createHash('sha256').update(indexBytes).digest('hex') },
  installedRuntimeQualified: false, installed: false, activated: false, archived: false, models: 0 }
await writeFile(join(world, 'build.json'), JSON.stringify(report, null, 2) + '\n')
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', explicitReport === undefined ? undefined : { flag: 'wx' })
console.log(JSON.stringify({ stage, entries: entries.length, typeDiagnostics: 0, installed: false, evidence: reportPath }))

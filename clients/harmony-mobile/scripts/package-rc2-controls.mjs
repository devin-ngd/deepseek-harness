/** Create one local rc.2-only plugin artifact after installed-API qualification; never install, activate or overwrite an existing release. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, readdir, access, rename, mkdtemp } from 'node:fs/promises'
import { resolve, join, dirname, relative } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
import { installedRc2 } from './installed-rc2.mjs'

const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), ts = require('typescript'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const version = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).version
assert.match(version, /^0\.0\.0-rc2\.[0-9]+$/)
const artifact = resolve('.build/artifacts/dsh-experimental-harmony-mobile-' + version + '.tgz')
await mkdir(dirname(artifact), { recursive: true })
const stage = join(await mkdtemp(resolve('.build/rc2-controls-package-' + version + '-')), 'package')
const artifactReport = 'evidence/rc2-controls-artifacts-' + version + '.json'
const options = process.argv.slice(2), reports = new Map(); let refresh = false
for (let index = 0; index < options.length; index++) { const key = options[index]; if (key === '--refresh-owned-draft') { if (refresh) throw new Error('Duplicate draft option'); refresh = true; continue }; if (!['--feedback-report', '--controls-report', '--api-report'].includes(key) || reports.has(key) || options[index + 1] === undefined) throw new Error('Select local feedback/controls/API reports only'); reports.set(key, options[++index]) }
const feedbackReport = reports.get('--feedback-report') ?? 'evidence/command-feedback-tests-' + version + '.json', controlsReport = reports.get('--controls-report') ?? 'evidence/rc2-controls-tests.json', apiReport = reports.get('--api-report') ?? 'evidence/rc2-controls-api-' + version + '.json'
assert.equal(dirname(resolve(feedbackReport)), resolve('evidence'))
assert.equal(dirname(resolve(controlsReport)), resolve('evidence'))
assert.equal(dirname(resolve(apiReport)), resolve('evidence'))
let previousDraft
try {
  await access(artifact)
  if (!refresh) throw new Error('This release already exists; preserve it and select a successor version.')
  previousDraft = JSON.parse(await readFile(artifactReport, 'utf8'))
  assert.equal(previousDraft.version, version); assert.equal(previousDraft.installed, false); assert.equal(previousDraft.activated, false); assert.equal(previousDraft.artifact.path, artifact)
  assert.equal(hash(await readFile(artifact)), previousDraft.artifact.sha256)
  const userInstalled = JSON.parse(await readFile('C:/Users/wpdev/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-experimental-harmony-mobile/package.json', 'utf8'))
  assert.notEqual(userInstalled.version, version, 'An installed release is immutable')
} catch (error) { if (error.code !== 'ENOENT' || refresh) throw error }
const api = JSON.parse(await readFile(apiReport, 'utf8'))
assert.equal(api.passed, true, 'Installed rc.2 API execution must pass before packaging')
assert.equal(api.version, version); assert.equal(api.packagedEntries, false)
assert.ok(Array.isArray(api.sourceInputs) && api.sourceInputs.length > 0)
for (const input of api.sourceInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'Host input changed after API qualification: ' + input.path)
const tests = JSON.parse(await readFile(controlsReport, 'utf8')); assert.equal(tests.success, true); assert.equal(tests.timedOut, false); assert.equal(tests.signal, null); assert.equal(tests.failed, 0); assert.equal(tests.passed, 5)
const installed = await installedRc2(root), manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8'))
assert.equal(manifest.version, version); assert.equal(manifest.bin, undefined); assert.equal(manifest.scripts, undefined)
for (const [name, expected] of Object.entries(manifest.peerDependencies)) assert.equal(require('semver').satisfies(name === installed.rich.name ? installed.rich.version : installed.descriptor.sharedPackages.find(row => row.name === name)?.version, expected), true, 'Installed peer satisfies: ' + name)
manifest.dependencies.zod = '4.4.3'
const entries = ['index', 'admission', 'transport', 'paired-provider', 'relay-lifecycle', 'product', 'pairing', 'test-session', 'device-binding-command']
for (const entry of entries.slice(3).filter(entry => entry !== 'device-binding-command')) manifest.exports['./' + entry] = { types: './lib/types/desktop-plugin/src/' + entry + '.d.ts', default: './lib/' + entry + '.js' }
await mkdir(join(stage, 'lib'), { recursive: true })
await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
for (const name of ['cordis.patch.yml', 'README.md', 'pairing.enabled.example.json', 'test-session.enabled.example.json', 'device.enabled.example.json']) await copyFile('desktop-plugin/' + name, join(stage, name))
await copyFile('docs/device-route-rc2.7.md', join(stage, 'ROUTE-RECOVERY.md'))
await copyFile('docs/control-panel-rc2.16.md', join(stage, 'CONTROL-PANEL.md'))
await writeFile(join(stage, 'README.md'), (await readFile(join(stage, 'README.md'), 'utf8')).replaceAll('../docs/device-route-rc2.7.md', 'ROUTE-RECOVERY.md').replaceAll('../docs/control-panel-rc2.16.md', 'CONTROL-PANEL.md'))
await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'))
const built = await esbuild.build({ entryPoints: Object.fromEntries(entries.map(entry => [entry === 'device-binding-command' ? 'device' : entry, resolve('desktop-plugin/src/' + entry + '.ts')])), outdir: join(stage, 'lib'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*', 'ws', 'zod'], tsconfig: await projectionTsconfig(client, root), absWorkingDir: root, metafile: true, legalComments: 'linked' })
const sourceInputs = []
for (const name of Object.keys(built.metafile.inputs)) { const path = resolve(root, name); assert.doesNotMatch(path, /replay-profile|replay-host|source-composition|profile-services|host-fixture|native-sdk|phase\d+-fixture/); sourceInputs.push({ path, sha256: hash(await readFile(path)) }) }
for (const name of ['index', 'product', 'pairing']) assert.doesNotMatch(await readFile(join(stage, 'lib', name + '.js'), 'utf8'), /HARMONY_TEST_|Synthetic mobile link form|fixed-three/)
const raw = ts.readConfigFile('.build/product.tsconfig.json', ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, resolve('.build'))
const declarations = resolve('.build/rc2-controls-declarations-' + version), drive = resolve(root).slice(0, 3)
const program = ts.createProgram({ rootNames: entries.map(entry => resolve('desktop-plugin/src/' + entry + '.ts')), options: { ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, rootDir: drive, outDir: declarations }, projectReferences: parsed.projectReferences })
const diagnostics = ts.getPreEmitDiagnostics(program); if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => client, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
assert.equal(program.emit(undefined, (path, content) => { if (resolve(path).startsWith(declarations)) ts.sys.writeFile(path, content) }, undefined, true).emitSkipped, false)
const copyTypes = async (from, to) => { await mkdir(to, { recursive: true }); for (const entry of await readdir(from, { withFileTypes: true })) if (entry.isDirectory()) await copyTypes(join(from, entry.name), join(to, entry.name)); else if (entry.name.endsWith('.d.ts')) { const text = await readFile(join(from, entry.name), 'utf8'); assert.doesNotMatch(text, /@local\//); await writeFile(join(to, entry.name), text) } }
await copyTypes(join(declarations, relative(drive, client)), join(stage, 'lib/types'))
const feedback = JSON.parse(await readFile(feedbackReport, 'utf8'))
assert.equal(feedback.passed, true); assert.equal(feedback.qualification.version, version); assert.equal(feedback.qualification.typeDiagnostics, 0)
for (const input of feedback.qualification.sourceInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'Client input changed after qualification: ' + input.path)
for (const file of feedback.qualification.files.filter(file => file.path.startsWith('lib/'))) {
  const bytes = await readFile(join(feedback.qualification.stage, file.path)); assert.equal(hash(bytes), file.sha256)
  const output = join(stage, file.path); await mkdir(dirname(output), { recursive: true })
  try { assert.equal(hash(await readFile(output)), file.sha256, 'Host and Client declaration collision: ' + file.path) } catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(output, bytes) }
}
for (const input of feedback.qualification.sourceInputs) if (!sourceInputs.some(previous => previous.path === input.path)) sourceInputs.push(input)
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ version, installedApiRelease: api.release, descriptorSha256: api.descriptorSha256, sourceInputs, defaultDisabled: true, passiveClientFeedback: true, separateTestExport: true, productContainsFixedReplies: false, installed: false, signed: false, network: false }, null, 2) + '\n')
const files = []
const visit = async (directory, prefix) => { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { assert.equal(entry.isSymbolicLink(), false); const path = join(directory, entry.name), name = prefix + entry.name; if (entry.isDirectory()) await visit(path, name + '/'); else { assert.doesNotMatch(name, /node_modules|\.env|\.(?:p12|pfx|pem|key|hap)$/); const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) }) } } }
await visit(stage, 'package/')
const tar = require('tar')
const pending = artifact + '.draft.tmp'
try { await access(pending); throw new Error('Retain an unknown pending artifact for inspection') } catch (error) { if (error.code !== 'ENOENT') throw error }
await tar.create({ file: pending, gzip: true, cwd: dirname(stage), portable: true }, ['package'])
const contents = new Map(), reads = []
await tar.list({ file: pending, strict: true, onReadEntry: entry => {
  if (entry.type === 'Directory') return
  assert.equal(entry.type, 'File'); assert.equal(contents.has(entry.path), false, 'Duplicate archive entry')
  contents.set(entry.path, undefined)
  const chunks = []
  reads.push(new Promise((accept, reject) => { entry.on('data', bytes => chunks.push(bytes)); entry.once('error', reject); entry.once('end', () => { contents.set(entry.path, Buffer.concat(chunks)); accept() }) }))
} })
await Promise.all(reads)
assert.deepEqual([...contents.keys()].sort(), files.map(file => file.path).sort())
for (const file of files) { const bytes = contents.get(file.path); assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256) }
if (previousDraft !== undefined) assert.equal(hash(await readFile(artifact)), previousDraft.artifact.sha256)
await rename(pending, artifact)
const report = { at: new Date().toISOString(), version, stage, previousUninstalledDraftSha256: previousDraft?.artifact.sha256, artifact: { path: artifact, bytes: (await readFile(artifact)).length, sha256: hash(await readFile(artifact)) }, files, sourceInputs, exactPeerCount: Object.keys(manifest.peerDependencies).length, installedApiEvidence: apiReport, syntheticTests: controlsReport, feedbackTests: feedbackReport, passiveClientFeedback: true, separateTestExport: true, productionFixedReplies: false, defaultDisabled: true, nativePackaged: false, installed: false, activated: false, remoteIo: false, realModels: 0 }
await writeFile(artifactReport, JSON.stringify(report, null, 2) + '\n', { flag: refresh ? 'w' : 'wx' })
console.log(JSON.stringify({ plugin: report.artifact, nativePackaged: false, exactPeers: report.exactPeerCount, installed: false }))

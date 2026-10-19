/** Create one local alpha.4-only plugin artifact after installed-API qualification; never install, activate or overwrite an existing release. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, readdir, access, rename } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve, join, dirname, relative } from 'node:path'
import { constants } from 'node:fs'
import { projectionTsconfig } from './projection-source.mjs'
import { installedAlpha4 } from './installed-alpha4.mjs'

const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), ts = require('typescript'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const version = '0.0.0-normal-controls.1', artifact = 'D:/Temp/dsh-experimental-harmony-mobile-' + version + '.tgz', stage = resolve('.build/normal-controls-package/package')
const refresh = process.argv.slice(2).length === 1 && process.argv[2] === '--refresh-owned-draft'
if (process.argv.length > 2 && !refresh) throw new Error('Only --refresh-owned-draft is supported')
let previousDraft
try {
  await access(artifact)
  if (!refresh) throw new Error('This release already exists; preserve it and select a successor version.')
  previousDraft = JSON.parse(await readFile('evidence/normal-controls-artifacts.json', 'utf8'))
  assert.equal(previousDraft.version, version); assert.equal(previousDraft.installed, false); assert.equal(previousDraft.activated, false); assert.equal(previousDraft.artifact.path, artifact)
  assert.equal(hash(await readFile(artifact)), previousDraft.artifact.sha256)
  const userInstalled = JSON.parse(await readFile('C:/Users/wpdev/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-experimental-harmony-mobile/package.json', 'utf8'))
  assert.notEqual(userInstalled.version, version, 'An installed release is immutable')
} catch (error) { if (error.code !== 'ENOENT' || refresh) throw error }
const api = JSON.parse(await readFile('evidence/normal-controls-alpha4.json', 'utf8'))
assert.equal(api.passed, true, 'Installed alpha.4 API execution must pass before packaging')
const tests = JSON.parse(await readFile('evidence/normal-controls-tests.json', 'utf8')); assert.equal(tests.failed, 0); assert.equal(tests.passed, 5)
const installed = await installedAlpha4(root), manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8'))
assert.equal(manifest.version, version); assert.equal(manifest.bin, undefined); assert.equal(manifest.scripts, undefined)
for (const [name, expected] of Object.entries(manifest.peerDependencies)) assert.equal(name === installed.rich.name ? installed.rich.version : installed.descriptor.sharedPackages.find(row => row.name === name)?.version, expected, 'Exact installed peer: ' + name)
manifest.dependencies.zod = '4.4.3'
const entries = ['index', 'admission', 'transport', 'paired-provider', 'relay-lifecycle', 'product', 'pairing', 'test-session']
for (const entry of entries.slice(3)) manifest.exports['./' + entry] = { types: './lib/types/desktop-plugin/src/' + entry + '.d.ts', default: './lib/' + entry + '.js' }
await mkdir(join(stage, 'lib'), { recursive: true })
await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
for (const name of ['cordis.patch.yml', 'README.md', 'pairing.enabled.example.json', 'test-session.enabled.example.json']) await copyFile('desktop-plugin/' + name, join(stage, name))
await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'))
const built = await esbuild.build({ entryPoints: Object.fromEntries(entries.map(entry => [entry, resolve('desktop-plugin/src/' + entry + '.ts')])), outdir: join(stage, 'lib'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*', 'ws', 'zod'], tsconfig: await projectionTsconfig(client, root), absWorkingDir: root, metafile: true, legalComments: 'linked' })
const sourceInputs = []
for (const name of Object.keys(built.metafile.inputs)) { const path = resolve(root, name); assert.doesNotMatch(path, /replay-profile|replay-host|source-composition|profile-services|host-fixture|native-sdk|phase\d+-fixture/); sourceInputs.push({ path, sha256: hash(await readFile(path)) }) }
for (const name of ['index', 'product', 'pairing']) assert.doesNotMatch(await readFile(join(stage, 'lib', name + '.js'), 'utf8'), /HARMONY_TEST_|Synthetic mobile link form|fixed-three/)
const raw = ts.readConfigFile('.build/product.tsconfig.json', ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, resolve('.build'))
const declarations = resolve('.build/normal-controls-declarations'), drive = resolve(root).slice(0, 3)
const program = ts.createProgram({ rootNames: entries.map(entry => resolve('desktop-plugin/src/' + entry + '.ts')), options: { ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, rootDir: drive, outDir: declarations }, projectReferences: parsed.projectReferences })
const diagnostics = ts.getPreEmitDiagnostics(program); if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => client, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
assert.equal(program.emit(undefined, (path, content) => { if (resolve(path).startsWith(declarations)) ts.sys.writeFile(path, content) }, undefined, true).emitSkipped, false)
const copyTypes = async (from, to) => { await mkdir(to, { recursive: true }); for (const entry of await readdir(from, { withFileTypes: true })) if (entry.isDirectory()) await copyTypes(join(from, entry.name), join(to, entry.name)); else if (entry.name.endsWith('.d.ts')) { const text = await readFile(join(from, entry.name), 'utf8'); assert.doesNotMatch(text, /@local\//); await writeFile(join(to, entry.name), text) } }
await copyTypes(join(declarations, relative(drive, client)), join(stage, 'lib/types'))
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ version, installedApiRelease: api.release, descriptorSha256: api.descriptorSha256, sourceInputs, defaultDisabled: true, separateTestExport: true, productContainsFixedReplies: false, installed: false, signed: false, network: false }, null, 2) + '\n')
const files = []
const visit = async (directory, prefix) => { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { assert.equal(entry.isSymbolicLink(), false); const path = join(directory, entry.name), name = prefix + entry.name; if (entry.isDirectory()) await visit(path, name + '/'); else { assert.doesNotMatch(name, /node_modules|\.env|\.(?:p12|pfx|pem|key|hap)$/); const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) }) } } }
await visit(stage, 'package/')
const tar = 'C:/Windows/System32/tar.exe', run = args => { const result = spawnSync(tar, args, { windowsHide: true, env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'D:/Temp', TMP: 'D:/Temp' }, maxBuffer: 16777216 }); if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr.toString('utf8')); return result.stdout }
const pending = artifact + '.draft.tmp'
try { await access(pending); throw new Error('Retain an unknown pending artifact for inspection') } catch (error) { if (error.code !== 'ENOENT') throw error }
run(['-czf', pending, '-C', dirname(stage), 'package'])
assert.deepEqual(run(['-tf', pending]).toString('utf8').trim().split(/\r?\n/).filter(path => !path.endsWith('/')).sort(), files.map(file => file.path).sort())
for (const file of files) { const bytes = run(['-xOf', pending, file.path]); assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256) }
if (previousDraft !== undefined) assert.equal(hash(await readFile(artifact)), previousDraft.artifact.sha256)
await rename(pending, artifact)
const native = JSON.parse(await readFile('evidence/normal-product-controls-validation.json', 'utf8')).native
for (const [path, expected] of Object.entries(native.sourceHashes)) assert.equal(hash(await readFile(join('harmony', path))), expected, 'Current native source: ' + path)
const unsigned = 'D:/Temp/dsh-harmony-mobile-normal-controls-unsigned.hap'
try { await copyFile(native.artifact.path, unsigned, constants.COPYFILE_EXCL) } catch (error) { if (error.code !== 'EEXIST') throw error; assert.equal(hash(await readFile(unsigned)), native.artifact.sha256) }
assert.equal(hash(await readFile(unsigned)), native.artifact.sha256)
const report = { at: new Date().toISOString(), version, stage, previousUninstalledDraftSha256: previousDraft?.artifact.sha256, artifact: { path: artifact, bytes: (await readFile(artifact)).length, sha256: hash(await readFile(artifact)) }, files, sourceInputs, exactPeerCount: Object.keys(manifest.peerDependencies).length, installedApiEvidence: 'normal-controls-alpha4.json', syntheticTests: 'normal-controls-tests.json', separateTestExport: true, productionFixedReplies: false, defaultDisabled: true, native: { path: unsigned, sha256: native.artifact.sha256, bytes: native.artifact.bytes, sourceHashesMatch: true, officialCompileEvidence: native.evidence, signed: false, rebuiltWithoutSourceChanges: false }, installed: false, activated: false, remoteIo: false, realModels: 0 }
await writeFile('evidence/normal-controls-artifacts.json', JSON.stringify(report, null, 2) + '\n', { flag: refresh ? 'w' : 'wx' })
console.log(JSON.stringify({ plugin: report.artifact, native: report.native, exactPeers: report.exactPeerCount, installed: false }))

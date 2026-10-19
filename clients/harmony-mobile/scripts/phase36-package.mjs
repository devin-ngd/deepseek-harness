/** Build and verify a default-disabled private npm artifact, using installed dependencies only. No install, registry, lifecycle, listener or app launch. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const stage = resolve('.build/phase36-relay-package/package'), artifact = 'D:/Temp/dsh-experimental-harmony-relay-0.0.0-phase36.1.tgz'
try { await access(artifact); throw new Error('Preserve existing artifact') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
await mkdir(join(stage, 'lib'), { recursive: true })
const pkg = JSON.parse(await readFile('relay-plugin/package.json', 'utf8')); assert.equal(pkg.bin, undefined); assert.equal(pkg.scripts, undefined); assert.equal(pkg.private, true)
const ws = join(root, 'node_modules/.pnpm/ws@8.21.3/node_modules/ws'), wsManifest = JSON.parse(await readFile(join(ws, 'package.json'), 'utf8')); assert.equal(wsManifest.version, pkg.dependencies.ws)
const webManifest = JSON.parse(await readFile(join(root, 'packages/host/webserver/package.json'), 'utf8')); assert.equal(webManifest.version, pkg.dependencies[webManifest.name])
const built = await esbuild.build({ entryPoints: [resolve('relay-plugin/src/index.ts')], outfile: join(stage, 'lib/index.js'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)], metafile: true })
const inputs = []
for (const file of Object.keys(built.metafile.inputs)) inputs.push({ file, sha256: createHash('sha256').update(await readFile(resolve(file))).digest('hex') })
for (const file of ['package.json', 'cordis.patch.yml', 'README.md']) await writeFile(join(stage, file), await readFile('relay-plugin/' + file))
await writeFile(join(stage, 'LICENSE'), await readFile(join(root, 'LICENSE')))
const buildInfo = { phase: 36, private: true, sourceInputs: inputs, ws: '8.21.3 external maintained dependency', defaultDisabled: true, installed: false, activated: false, dependenciesInstalled: false, packageBins: false, publicListenerCreated: false, buildOnly: true }
await writeFile(join(stage, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n')
let smokeSource = await readFile(join(stage, 'lib/index.js'), 'utf8')
for (const [name, file] of [['@deepseek-ai/cordis', join(root, 'vendor/cordis/lib/index.js')], ['@deepseek-ai/schemastery', join(root, 'vendor/schemastery/lib/index.mjs')], ['ws', join(ws, 'wrapper.mjs')]]) smokeSource = smokeSource.replaceAll(JSON.stringify(name), JSON.stringify(pathToFileURL(file).href))
await writeFile('.build/phase36-packed-smoke.js', smokeSource)
const smoke = await import(new URL('../.build/phase36-packed-smoke.js', import.meta.url))
smoke.apply(new Proxy({}, { get() { throw new Error('Disabled artifact touched Context') } }), smoke.Config({ enabled: false }))
const files = []
async function visit(directory, prefix) { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { assert.equal(entry.isSymbolicLink(), false); if (/node_modules|\.env|\.pem$|\.key$|\.p12$|\.hap$/.test(entry.name)) throw new Error('Forbidden package entry'); const path = join(directory, entry.name), name = prefix + entry.name; if (entry.isDirectory()) await visit(path, name + '/'); else { const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) } } }
await visit(stage, 'package/')
const run = args => { const result = spawnSync('C:/Windows/System32/tar.exe', args, { windowsHide: true, env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'D:/Temp', TMP: 'D:/Temp' }, maxBuffer: 4194304 }); if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr.toString()); return result.stdout }
run(['-czf', artifact, '-C', resolve('.build/phase36-relay-package'), 'package'])
const names = run(['-tf', artifact]).toString().trim().split(/\r?\n/).filter(x => !x.endsWith('/')); assert.deepEqual([...names].sort(), files.map(x => x.path).sort())
for (const file of files) assert.equal(createHash('sha256').update(run(['-xOf', artifact, file.path])).digest('hex'), file.sha256)
const bytes = await readFile(artifact), report = { path: artifact, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), files, entries: files.length, esmBuiltSmoke: 'shipped ESM lib with dependency locators redirected to existing version-matched built artifacts; Config disabled; no Context read or source aliases', externalDependencies: pkg.dependencies, externalPeers: pkg.peerDependencies, serverRuntimeCompatibilityVerified: false, installed: false, activated: false, listeners: 0, realModels: 0 }
await writeFile('evidence/phase36-relay-artifact.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ artifact, bytes: report.bytes, sha256: report.sha256, entries: files.length, installed: false }))

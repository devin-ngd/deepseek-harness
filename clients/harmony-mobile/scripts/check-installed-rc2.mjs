/** Bundle and execute the installed Host's public APIs in one temporary synthetic profile, without launching or modifying the app. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, join, dirname, basename } from 'node:path'
import { installedRc2 } from './installed-rc2.mjs'
import { createHash } from 'node:crypto'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const version = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).version
const installed = await installedRc2(root), world = await mkdtemp(join(client, '.build/rc2-normal-check-' + version + '-')), output = join(world, 'smoke.mjs')
const args = process.argv.slice(2), packageMode = args[0] === '--package'
if (packageMode) args.shift()
const selectedReport = args.length === 2 && args[0] === '--report' && /^evidence\/[a-z0-9.-]+\.json$/.test(args[1]) ? args[1] : undefined
if (args.length && selectedReport === undefined) throw new Error('Only --package and --report evidence/<name>.json are supported')
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), redirects = new Set()
let packageArtifact, packageStage
if (packageMode) {
  const artifact = JSON.parse(await readFile('evidence/rc2-controls-artifacts-' + version + '.json', 'utf8'))
  if (hash(await readFile(artifact.artifact.path)) !== artifact.artifact.sha256) throw new Error('Packaged artifact changed')
  for (const file of artifact.files) if (hash(await readFile(join(dirname(artifact.stage), file.path))) !== file.sha256) throw new Error('Packaged entry changed: ' + file.path)
  if (artifact.version !== version) throw new Error('Packaged version does not match the selected manifest')
  packageArtifact = artifact.artifact; packageStage = artifact.stage
}
const packageRedirect = { name: 'packaged-normal-controls', setup(build) { build.onResolve({ filter: /desktop-plugin[\\/]src[\\/](?:product|pairing|test-session|transport|device-binding-command)\.ts$/ }, args => { if (!packageMode) return undefined; const path = resolve(dirname(args.importer), args.path), name = basename(path).replace(/\.ts$/, '.js').replace('device-binding-command.js', 'device.js'); redirects.add(name); return { path: resolve(packageStage, 'lib', name) } }) } }
const built = await esbuild.build({ entryPoints: [resolve('integration/normal-controls-installed.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24', tsconfigRaw: { compilerOptions: { experimentalDecorators: false } }, plugins: [packageRedirect, installed.plugin], banner: { js: "import { createRequire as compatibilityRequire } from 'node:module'; const require = compatibilityRequire(import.meta.url);" }, metafile: true, logLevel: 'warning' })
if (packageMode && redirects.size !== 5) throw new Error('Every consumed package entry must replace its source import')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', DSH_SNAPSHOT: 'replay', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world, DSH_HARMONY_CLIENT_ROOT: client })
const child = spawn(process.execPath, [output], { cwd: client, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
const label = (packageMode ? 'rc2-controls-package-smoke-' : 'rc2-controls-api-') + version
const evidence = selectedReport ?? 'evidence/' + label + '.json'
await writeFile(evidence.replace(/\.json$/, '.log'), log.trimEnd() + '\n', { flag: 'wx' })
const sourceInputs = await Promise.all(Object.keys(built.metafile.inputs).filter(path => !path.startsWith('installed-asar:')).map(async path => ({ path: resolve(client, path), sha256: hash(await readFile(resolve(client, path))) })))
const record = { at: new Date().toISOString(), version, code, passed: code === 0, packagedEntries: packageMode, packageArtifact, consumedPackageEntries: [...redirects], sourceInputs, release: installed.descriptor.release, archive: installed.archive, descriptorSha256: installed.descriptorSha256, richVersion: installed.rich.version, publicInputs: [...installed.inputs.values()], world, output, realModels: 0, userProfileOpened: false, credentialAccess: false, network: false, installed: false }
await writeFile(evidence, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ code, publicInputs: record.publicInputs.length, packagedEntries: packageMode, evidence, world })); console.log(log.trimEnd()); process.exitCode = code ?? 1

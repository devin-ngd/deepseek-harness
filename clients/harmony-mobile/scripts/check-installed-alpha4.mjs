/** Bundle and execute the installed Host's public APIs in one temporary synthetic profile, without launching or modifying the app. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, join, dirname, basename } from 'node:path'
import { installedAlpha4 } from './installed-alpha4.mjs'
import { createHash } from 'node:crypto'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const installed = await installedAlpha4(root), world = await mkdtemp(join(client, '.build/alpha4-normal-check-')), output = join(world, 'smoke.mjs')
const packageMode = process.argv.length === 3 && process.argv[2] === '--package'
if (process.argv.length > 2 && !packageMode) throw new Error('Only --package is supported')
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), redirects = new Set()
let packageArtifact
if (packageMode) {
  const artifact = JSON.parse(await readFile('evidence/normal-controls-artifacts.json', 'utf8'))
  if (hash(await readFile(artifact.artifact.path)) !== artifact.artifact.sha256) throw new Error('Packaged artifact changed')
  for (const file of artifact.files) if (hash(await readFile(join(dirname(artifact.stage), file.path))) !== file.sha256) throw new Error('Packaged entry changed: ' + file.path)
  packageArtifact = artifact.artifact
}
const packageRedirect = { name: 'packaged-normal-controls', setup(build) { build.onResolve({ filter: /desktop-plugin[\\/]src[\\/](?:product|pairing|test-session|transport)\.ts$/ }, args => { if (!packageMode) return undefined; const path = resolve(dirname(args.importer), args.path), name = basename(path).replace(/\.ts$/, '.js'); redirects.add(name); return { path: resolve('.build/normal-controls-package/package/lib', name) } }) } }
await esbuild.build({ entryPoints: [resolve('integration/normal-controls-installed.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24', tsconfigRaw: { compilerOptions: { experimentalDecorators: false } }, plugins: [packageRedirect, installed.plugin], banner: { js: "import { createRequire as compatibilityRequire } from 'node:module'; const require = compatibilityRequire(import.meta.url);" }, logLevel: 'warning' })
if (packageMode && redirects.size !== 4) throw new Error('Every consumed package entry must replace its source import')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', DSH_SNAPSHOT: 'replay', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world, DSH_HARMONY_CLIENT_ROOT: client })
const child = spawn(process.execPath, [output], { cwd: client, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
const label = packageMode ? 'normal-controls-package-smoke' : 'normal-controls-alpha4'
await writeFile('evidence/' + label + '.log', log.trimEnd() + '\n')
const record = { at: new Date().toISOString(), code, passed: code === 0, packagedEntries: packageMode, packageArtifact, consumedPackageEntries: [...redirects], release: installed.descriptor.release, archive: installed.archive, descriptorSha256: installed.descriptorSha256, richVersion: installed.rich.version, publicInputs: [...installed.inputs.values()], world, output, realModels: 0, userProfileOpened: false, credentialAccess: false, network: false, installed: false }
await writeFile('evidence/' + label + '.json', JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify({ code, publicInputs: record.publicInputs.length, packagedEntries: packageMode, world })); console.log(log.trimEnd()); process.exitCode = code ?? 1

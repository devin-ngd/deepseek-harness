/** Bundle only closed public maintenance commands; never activates a service or trust state. */
import { createRequire, isBuiltin } from 'node:module'
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const argv = process.argv.slice(2)
const options = new Map()
for (let index = 0; index < argv.length; index += 2) {
  const key = argv[index], value = argv[index + 1]
  if (!['--output-dir', '--version'].includes(key) || !value || options.has(key)) throw new Error('explicit output directory and local version only')
  options.set(key, value)
}
const version = options.get('--version') ?? '0.0.0-first-use.4'
if (!/^0\.0\.0-(?:first-use|rc2)\.[0-9]+$/.test(version)) throw new Error('local public maintenance version required')
const buildRoot = resolve('.build'), stage = resolve(options.get('--output-dir') ?? '.build/first-use-relay-tools.4')
if (!stage.startsWith(buildRoot + sep)) throw new Error('maintenance outputs must stay in this client build directory')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await mkdir(stage)
const outputs = []
for (const [entry, name] of [['prepare-public-config.ts', 'prepare-public-config.mjs'], ['provision.ts', 'initialize-public-trust.mjs'], ['revoke-public-trust.ts', 'revoke-public-trust.mjs'], ['check-write-scope.ts', 'check-write-scope.mjs'], ['route-maintenance.ts', 'device-route-maintenance.mjs'], ['endpoint-timers.ts', 'endpoint-timers.mjs']]) {
  const built = await esbuild.build({ entryPoints: [resolve('standalone-relay/src/' + entry)], outfile: join(stage, name), bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true })
  for (const output of Object.values(built.metafile.outputs)) for (const imported of output.imports) if (imported.external && !isBuiltin(imported.path)) throw new Error('unclosed public maintenance dependency')
  const bytes = await readFile(join(stage, name))
  outputs.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), inputs: await Promise.all(Object.keys(built.metafile.inputs).map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))) })
}
const { relayEndpointTimers } = await import(pathToFileURL(join(stage, 'endpoint-timers.mjs')))
const timerInputs = await Promise.all(['desktop-plugin/device.enabled.example.json', 'product.config.json'].map(async path => {
  const bytes = await readFile(path)
  return { path: resolve(path), sha256: createHash('sha256').update(bytes).digest('hex'), configuration: JSON.parse(bytes.toString('utf8')) }
}))
await writeFile(join(stage, 'relay-endpoint-timers.json'), JSON.stringify(relayEndpointTimers(timerInputs[0].configuration, timerInputs[1].configuration), null, 2) + '\n', { flag: 'wx' })
await cp('standalone-relay/config.first-use.proposal.json', join(stage, 'config.first-use.proposal.json'))
await cp('standalone-relay/FIRST-USE-TOOLS.md', join(stage, 'FIRST-USE.md'))
await writeFile(join(stage, 'package.json'), JSON.stringify({ private: true, type: 'module', version }, null, 2) + '\n', { flag: 'wx' })
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ schema: 'harmony-public-maintenance-build/1', outputs, timerInputs: timerInputs.map(({path,sha256}) => ({path,sha256})), startsService: false, network: false, identityGeneration: false, initialized: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ built: stage, commands: outputs.map(row => row.file), startsService: false, network: false }))

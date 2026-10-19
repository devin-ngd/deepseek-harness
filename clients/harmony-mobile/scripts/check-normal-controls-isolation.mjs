/** Execute only the credential-group isolation check against immutable installed alpha.4 modules. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { installedAlpha4 } from './installed-alpha4.mjs'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const installed = await installedAlpha4(root), world = await mkdtemp(join(client, '.build/normal-controls-isolation-')), output = join(world, 'check.mjs')
await esbuild.build({ entryPoints: [resolve('integration/normal-controls-isolation.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24', plugins: [installed.plugin], banner: { js: "import { createRequire as compatibilityRequire } from 'node:module'; const require = compatibilityRequire(import.meta.url);" }, logLevel: 'warning' })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const child = spawn(process.execPath, [output], { cwd: world, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
await writeFile('evidence/normal-controls-isolation.log', log.trimEnd() + '\n')
const report = { at: new Date().toISOString(), code, passed: code === 0, world, installedRelease: installed.descriptor.release, publicModules: installed.inputs.size, originalProviderIsolationOnly: true, realCredentialFilesRead: false, userProfileChanged: false, grantStarted: false, modelCalls: 0, network: false }
await writeFile('evidence/normal-controls-isolation.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report)); console.log(log.trimEnd()); process.exitCode = code ?? 1

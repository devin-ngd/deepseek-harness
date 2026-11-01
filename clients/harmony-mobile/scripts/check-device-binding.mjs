/** Reproducible source-only device lifecycle qualification; no installed profile, identity store or network is opened. */
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
if (process.argv.length !== 2) throw new Error('No activation or installation arguments are supported')
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), hash = bytes => createHash('sha256').update(bytes).digest('hex')
await mkdir('.build', { recursive: true }); await mkdir('evidence', { recursive: true })
const world = await mkdtemp(resolve('.build/device-binding-core-'))
const entry = "export * from './desktop-plugin/src/device-binding.ts';export * from './src/device-binding-client.ts';export * from './src/device-binding-protocol.ts';export * from './src/mobile-device-product.ts';"
const node = await esbuild.build({ stdin: { contents: entry, resolveDir: project, sourcefile: 'device-binding-entry.ts' }, outfile: join(world, 'core.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true })
const native = await esbuild.build({ stdin: { contents: "export * from './src/device-binding-client.ts';export * from './src/mobile-device-product.ts';", resolveDir: project, sourcefile: 'device-native-entry.ts' }, outfile: join(world, 'native.mjs'), bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', metafile: true })
if (Object.values(native.metafile.outputs).flatMap(output => output.imports).length !== 0) throw new Error('Native device candidate imports an external runtime')
const sourceInputs = await Promise.all([...new Set([...Object.keys(node.metafile.inputs), ...Object.keys(native.metafile.inputs), 'tests/device-binding.test.mjs', 'scripts/check-device-binding.mjs'])].filter(path => path !== 'device-binding-entry.ts' && path !== 'device-native-entry.ts').map(async path => ({ path: resolve(path), sha256: hash(await readFile(path)) })))
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_HARMONY_DEVICE_BINDING_MODULE: join(world, 'core.mjs') })
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', 'tests/device-binding.test.mjs'], { cwd: project, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = '', timedOut = false
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
const outcome = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) }).finally(() => clearTimeout(timer))
await writeFile(join(world, 'tests.tap'), log)
const count = name => Number(log.match(new RegExp('^# ' + name + ' (\\d+)', 'm'))?.[1] ?? 0)
const passed = !timedOut && outcome.code === 0 && count('pass') > 0 && count('fail') === 0
const report = { at: new Date().toISOString(), passed, outcome, timedOut, tests: { passed: count('pass'), failed: count('fail') }, world, sourceInputs,
  outputs: await Promise.all(['core.mjs', 'native.mjs'].map(async path => ({ path: join(world, path), sha256: hash(await readFile(join(world, path))) }))),
  nativeRuntimeImports: [], installed: false, realIdentityAccess: false, realBindings: 0, models: 0, network: false, productEntriesIntegrated: false }
await writeFile(join(world, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
const evidence = 'evidence/device-binding-core-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed, tests: report.tests, world, evidence, timedOut, installed: false, productEntriesIntegrated: false }))
if (!passed) console.error(log.slice(-7000))
process.exitCode = passed ? 0 : 1

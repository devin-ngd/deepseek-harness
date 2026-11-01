/** Run native route restoration against isolated SDK files and fixture keys; never opens a device or network. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { projectionTsconfig } from './projection-source.mjs'
import assert from 'node:assert/strict'

const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const world = await mkdtemp(resolve('.build/route-restore-'))
const build = JSON.parse(await readFile('evidence/route-restore-core-build.json', 'utf8'))
const core = build.reports.find(row => row.output === 'harmony/entry/src/main/ets/product/ProductCore.js')
assert.ok(core, 'Build ProductCore with --report=route-restore-core-build.json before this check')
for (const [file, expected] of Object.entries(core.sourceHashes)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), expected, 'Stale ProductCore input: ' + file)
assert.equal(createHash('sha256').update(await readFile(core.output)).digest('hex'), core.sha256, 'ProductCore differs from the recorded build')
const testsToRun = ['tests/route-restore/native.test.mjs', 'tests/device-startup-diagnostics.test.mjs']
const inputs = [...new Set([...Object.keys(core.sourceHashes), core.output, 'harmony/entry/src/main/ets/product/NativeDeviceProductOwner.ets', 'harmony/entry/src/main/ets/pages/Index.ets', 'tests/helpers/product-native-sdk.mjs', ...testsToRun, 'scripts/check-route-restore.mjs'])]
const hashes = async () => Object.fromEntries(await Promise.all(inputs.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
const before = await hashes()
const contents = "export {NativeDeviceProductOwner} from './harmony/entry/src/main/ets/product/NativeDeviceProductOwner.ets';export {NativePublicTrustFile} from './harmony/entry/src/main/ets/product/NativePublicTrustFile.ets';export * from './src/device-startup-diagnostic.ts';export * from './tests/helpers/product-native-sdk.mjs';export {phoneKey,desktopKey} from './integration/phase39-fixture.ts';export {nodeE2EPrimitives} from './integration/p256-channel.ts';export {deviceBindingBytes} from './src/device-binding-protocol.ts';export {deviceRouteOfferBytes} from './src/device-route-protocol.ts';export {deviceGrantOperations} from './src/device-operations.ts';"
await esbuild.build({ stdin: { contents, resolveDir: project }, outfile: join(world, 'api.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], tsconfig: await projectionTsconfig(project, root), plugins: [{ name: 'memory-sdk', setup(build) { build.onResolve({ filter: /^@kit\.|^@ohos\.util$/ }, () => ({ path: resolve('tests/helpers/product-native-sdk.mjs') })) } }] })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
Object.assign(env, { TEMP: world, TMP: world, DSH_ROUTE_RESTORE_MODULE: join(world, 'api.mjs'), DSH_STARTUP_DIAGNOSTICS_MODULE: join(world, 'api.mjs') })
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...testsToRun], { cwd: project, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = '', timedOut = false, spawnError = null
for (const stream of [child.stdout, child.stderr]) { stream.setEncoding('utf8'); stream.on('data', bytes => { log += bytes }) }
child.once('error', error => { spawnError = error.code ?? 'spawn-error' })
const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
const termination = await new Promise(done => child.once('close', (code, signal) => done({ code, signal }))).finally(() => clearTimeout(timer))
await writeFile(join(world, 'tests.tap'), log, { flag: 'wx' })
const count = key => Number(log.match(new RegExp('^# ' + key + ' (\\d+)', 'm'))?.[1] ?? -1)
const tests = { passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled') }, after = await hashes()
const inputsUnchanged = JSON.stringify(before) === JSON.stringify(after)
const passed = termination.code === 0 && termination.signal === null && !timedOut && spawnError === null && tests.passed > 0 && [tests.failed, tests.skipped, tests.cancelled].every(n => n === 0) && inputsUnchanged
const report = { at: new Date().toISOString(), passed, ...termination, timedOut, spawnError, tests, inputsUnchanged, sha256: before, world, realDevice: false, realKeys: false, network: false, installed: false }
const evidence = 'evidence/route-restore-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed, ...termination, timedOut, spawnError, tests, inputsUnchanged, inputCount: inputs.length, world, evidence })); if (!passed) console.error(log.slice(-5500)); process.exitCode = passed ? 0 : 1

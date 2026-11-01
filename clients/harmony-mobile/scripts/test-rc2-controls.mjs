/** Run only the synthetic test-entry cases with scrubbed environment and a fresh temporary profile. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { controlsTestResult } from './controls-test-result.mjs'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const args = process.argv.slice(2), evidence = args.length === 0 ? 'evidence/rc2-controls-tests.json' : args.length === 2 && args[0] === '--report' ? args[1] : ''
if (!/^evidence\/[a-z0-9-]+\.json$/.test(evidence)) throw new Error('Select one local evidence report')
await mkdir(join(client, '.build'), { recursive: true })
const world = await mkdtemp(join(client, '.build/rc2-controls-')), output = join(world, 'report.json')
const require = createRequire(join(root, 'package.json')), ts = require('typescript'), helper = join(world, 'vitest-shared.mjs')
await writeFile(helper, ts.transpileModule(await readFile(join(root, 'vitest.shared.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true }, fileName: join(root, 'vitest.shared.ts') }).outputText)
const config = join(world, 'config.mjs')
await writeFile(config, 'import {projectionAliases} from ' + JSON.stringify(pathToFileURL(join(client, 'scripts/projection-source.mjs')).href) + ';import {standardDecoratorPlugin,vitestExecArgv} from ' + JSON.stringify(pathToFileURL(helper).href) + ';export default {root:' + JSON.stringify(root) + ',cacheDir:' + JSON.stringify(join(world, 'cache')) + ',resolve:{alias:await projectionAliases(' + JSON.stringify(client) + ',' + JSON.stringify(root) + ')},plugins:[standardDecoratorPlugin()],test:{name:"normal-controls",environment:"node",pool:"forks",execArgv:vitestExecArgv,include:["clients/harmony-mobile/integration/normal-controls.spec.ts"],maxWorkers:1,fileParallelism:false,testTimeout:20000,hookTimeout:20000,teardownTimeout:15000}};\n')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', config, '--reporter=default', '--reporter=json', '--outputFile=' + output], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
let timedOut = false, spawnError = null
const timer = setTimeout(() => { timedOut = true; child.kill() }, 180000)
const termination = await new Promise(accept => { child.once('error', error => { spawnError = error.code ?? 'spawn-failed' }); child.once('close', (code, signal) => accept({ code, signal, timedOut, spawnError })) }).finally(() => clearTimeout(timer))
await writeFile(evidence.replace(/\.json$/, '.log'), log.trimEnd() + '\n', { flag: 'wx' })
const result = await controlsTestResult(termination, output)
await writeFile(evidence, JSON.stringify({ at: new Date().toISOString(), ...result, report: output, world, liveModels: 0, phoneIo: false, remoteIo: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, world })); if (!result.success) console.error(log.split('\n').slice(-70).join('\n'))
process.exitCode = result.success ? 0 : 1

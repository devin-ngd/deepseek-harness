/** Focused current-source services/ArkTS/HTML qualification. Only fixed replay, SDK substitutes and ephemeral loopback IO. */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), ts = require('typescript')
const legacy = process.argv.length === 3 && process.argv[2] === '--legacy'
const cases = new Map([
  ['encrypted', 'new native facade performs actual encrypted'], ['deadline', 'room issuance respects absolute'],
  ['journal', 'admission journal'], ['paired', 'paired startup reuses'], ['panel-recovery', 'phone connection panel resumes a saved pairing'],
])
const focus = process.argv.length === 4 && process.argv[2] === '--case' && cases.has(process.argv[3]) ? process.argv[3] : undefined
if (process.argv.length > 2 && !legacy && focus === undefined) throw new Error('Only --legacy or --case ' + [...cases.keys()].join('/') + ' is supported; real devices and models are not accepted')
await mkdir('.build', { recursive: true })
const world = await mkdtemp(join(client, '.build/device-integration-')), helper = resolve('.build/device-integration-vitest.mjs')
await writeFile(helper, ts.transpileModule(await readFile(join(root, 'vitest.shared.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, fileName: join(root, 'vitest.shared.ts') }).outputText)
const suite = 'clients/harmony-mobile/integration/' + (legacy ? 'normal-product-controls' : 'device-binding') + '.spec.ts'
const config = 'import {defineConfig} from ' + JSON.stringify(pathToFileURL(require.resolve('vitest/config')).href) + ';import {standardDecoratorPlugin,vitestExecArgv} from ' + JSON.stringify(pathToFileURL(helper).href) + ';import {projectionAliases} from ' + JSON.stringify(pathToFileURL(resolve('scripts/projection-source.mjs')).href) + ';export default defineConfig({root:' + JSON.stringify(root) + ',cacheDir:' + JSON.stringify(join(world, 'cache')) + ',resolve:{alias:await projectionAliases(' + JSON.stringify(client) + ',' + JSON.stringify(root) + ')},plugins:[standardDecoratorPlugin()],test:{environment:"node",pool:"forks",execArgv:vitestExecArgv,include:[' + JSON.stringify(suite) + '],maxWorkers:1,fileParallelism:false,testTimeout:30000,hookTimeout:20000,teardownTimeout:15000}});'
await writeFile(join(world, 'config.mjs'), config)
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const run = async (args, cwd) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8'); process.stdout.write(bytes) })
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
  return { code, log }
}
const preparation = await run(['scripts/product-native-substitute.mjs'], client)
if (preparation.code !== 0) throw new Error('Synthetic SDK composition failed')
const outcome = await run([join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(world, 'config.mjs'), ...(focus === undefined ? [] : ['--testNamePattern', cases.get(focus)]), '--reporter=default', '--reporter=json', '--outputFile=' + join(world, 'report.json')], root)
await writeFile(join(world, 'test.log'), outcome.log)
const tests = JSON.parse(await readFile(join(world, 'report.json'), 'utf8')), evidence = 'evidence/device-integration-' + (legacy ? 'legacy-' : '') + Date.now() + '.json'
const record = { at: new Date().toISOString(), code: outcome.code, passed: tests.numPassedTests, failed: tests.numFailedTests, focusedCase: focus, world, report: join(world, 'report.json'), sdkSubstituted: true, loopbackOnly: true, realIdentityAccess: false, realModels: 0, remoteRelay: false, installed: false, deviceAccepted: false }
await writeFile(evidence, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ ...record, evidence }))
process.exitCode = outcome.code ?? 1

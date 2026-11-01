/** Run only virtual-time connection deadlines and configuration refusals in an isolated offline world. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const world = await mkdtemp(resolve('.build/connection-lifetime-')), report = join(world, 'vitest.json')
const base = pathToFileURL(resolve('integration/phase39.vitest.config.mjs')).href
const config = join(world, 'config.mjs')
await writeFile(config, `import base from ${JSON.stringify(base)};export default {...base,cacheDir:${JSON.stringify(join(world,'cache'))},test:{...base.test,include:['clients/harmony-mobile/integration/connection-lifetime.spec.ts','clients/harmony-mobile/integration/endpoint-timers.spec.ts']}};\n`)
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: world, TMP: world, NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', config, '--reporter=json', '--outputFile=' + report], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
let log = '', timedOut = false
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const timer = setTimeout(() => { timedOut = true; child.kill() }, 120000)
const outcome = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) }).finally(() => clearTimeout(timer))
await writeFile(join(world, 'test.log'), log)
const tests = JSON.parse(await readFile(report, 'utf8'))
const result = { at: new Date().toISOString(), ...outcome, timedOut, passed: outcome.code === 0 && !timedOut && tests.numPassedTests > 0 && tests.numFailedTests === 0, tests: { passed: tests.numPassedTests, failed: tests.numFailedTests }, world, network: false, installed: false, realModels: 0 }
const evidence = 'evidence/connection-lifetime-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, evidence }))
if (!result.passed) { console.error(log.slice(-6000)); process.exitCode = 1 }

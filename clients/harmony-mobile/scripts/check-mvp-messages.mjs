/** Offline UI protocol and page-guard regression. No device or service is discovered or opened. */
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const tests = ['tests/mvp-message-flow.test.mjs', 'tests/mvp-window-budget.test.mjs', 'tests/mvp-route-admission.test.mjs', 'tests/mvp-message-phone-port.test.mjs', 'tests/mvp-message-journal.test.mjs', 'tests/mvp-page.test.mjs', 'tests/product-layout.test.mjs', 'tests/device-connection-page.test.mjs', 'tests/connection-hdc-port.test.mjs']
const sources = ['operations/mvp-message-flow.mjs', 'operations/mvp-window-budget.mjs', 'operations/mvp-verified-start.mjs', 'operations/mvp-message-phone-port.mjs', 'operations/mvp-message-journal.mjs', 'operations/connection-ui-adapters.mjs', 'operations/connection-ui-start.mjs', 'operations/desktop-connection-observation.mjs', 'operations/prepared-connection-start.mjs', 'operations/connection-hdc-port.mjs', 'scripts/connection-deployment-lib.mjs', 'scripts/check-mvp-messages.mjs', 'tests/helpers/connection-ui-fixture.mjs', 'tests/helpers/mvp-message-fixture.mjs', 'tests/helpers/mvp-journal-worker.mjs', 'harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/ets/components/TaskState.ets', 'harmony/entry/src/main/resources/base/element/string.json', ...tests]
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(resolve(project, file))).digest('hex')])))
const before = await hashes(), world = await mkdtemp(resolve(project, '.build/mvp-messages-'))
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
Object.assign(env, { TEMP: world, TMP: world })
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: project, windowsHide: true, shell: false, env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = '', timedOut = false, spawnError = null
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString('utf8') })
const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
child.once('error', error => { spawnError = error.code ?? 'spawn-error' })
const termination = await new Promise(yes => child.once('close', (code, signal) => yes({ code, signal }))).finally(() => clearTimeout(timer))
await writeFile(join(world, 'test.tap'), log, { flag: 'wx' })
const after = await hashes(), inputsUnchanged = JSON.stringify(before) === JSON.stringify(after)
const count = name => Number(log.match(new RegExp('^# ' + name + ' (\\d+)', 'm'))?.[1] ?? -1)
const counts = { passed: count('pass'), failed: count('fail'), cancelled: count('cancelled'), skipped: count('skipped') }
const passed = termination.code === 0 && termination.signal === null && !timedOut && spawnError === null && inputsUnchanged && counts.passed > 0 && [counts.failed, counts.cancelled, counts.skipped].every(n => n === 0)
const evidence = 'evidence/mvp-message-offline-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json'
const report = { at: new Date().toISOString(), passed, ...termination, timedOut, spawnError, counts, inputsUnchanged, sha256: before, tests, log: join(world, 'test.tap'), nativeDevice: false, modelCalls: 0, connectionWindows: 0, installation: false, evidence }
await writeFile(resolve(project, evidence), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed, counts, inputsUnchanged, evidence }))
if (!passed) console.error(log.slice(-6000))
process.exitCode = passed ? 0 : 1

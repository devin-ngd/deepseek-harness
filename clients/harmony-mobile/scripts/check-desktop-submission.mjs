/** Offline desktop submission, paired dispatch and message admission checks; never discovers an installed app or phone. */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

const project = fileURLToPath(new URL('../', import.meta.url)), root = JSON.parse(await readFile(resolve(project, 'source.json'), 'utf8')).dshRoot
const world = await mkdtemp(resolve(project, '.build/desktop-submission-'))
const tests = ['tests/desktop-postclick.test.mjs', 'tests/desktop-confirmation.test.mjs', 'tests/connection-ui-start.test.mjs', 'tests/prepared-connection-start.test.mjs', 'tests/connection-observation.test.mjs', 'tests/connection-hdc-port.test.mjs', 'tests/mvp-message-flow.test.mjs', 'tests/mvp-window-budget.test.mjs', 'tests/mvp-route-admission.test.mjs', 'tests/mvp-message-phone-port.test.mjs', 'tests/mvp-message-journal.test.mjs', 'tests/mvp-page.test.mjs', 'tests/product-layout.test.mjs', 'tests/device-connection-page.test.mjs']
const modules = ['operations/desktop-postclick-submission.mjs', 'operations/desktop-connection-observation.mjs', 'operations/connection-ui-adapters.mjs', 'operations/connection-ui-start.mjs', 'operations/connection-hdc-port.mjs', 'operations/mvp-verified-start.mjs', 'operations/mvp-window-budget.mjs']
const sources = [...modules, 'operations/prepared-connection-start.mjs', 'operations/mvp-message-flow.mjs', 'operations/mvp-message-journal.mjs', 'operations/mvp-message-phone-port.mjs', 'scripts/connection-deployment-lib.mjs', 'scripts/check-desktop-submission.mjs', 'tests/helpers/connection-ui-fixture.mjs', 'tests/helpers/mvp-message-fixture.mjs', 'tests/helpers/mvp-journal-worker.mjs', 'integration/connection-stagger.test.mjs', ...tests]
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(resolve(project, file))).digest('hex')])))
const before = await hashes(), runs = []
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
Object.assign(env, { TEMP: world, TMP: world })
async function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: project, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = '', timedOut = false, spawnError = null
  for (const stream of [child.stdout, child.stderr]) { stream.setEncoding('utf8'); stream.on('data', chunk => { log += chunk }) }
  child.once('error', error => { spawnError = error.code ?? 'spawn-error' })
  const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
  const termination = await new Promise(done => child.once('close', (code, signal) => done({ code, signal }))).finally(() => clearTimeout(timer))
  await writeFile(join(world, name + '.tap'), log, { flag: 'wx' })
  const count = key => Number(log.match(new RegExp('^# ' + key + ' (\\d+)', 'm'))?.[1] ?? -1)
  const counts = { passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled') }
  const passed = termination.code === 0 && termination.signal === null && !timedOut && spawnError === null && counts.passed > 0 && [counts.failed, counts.skipped, counts.cancelled].every(n => n === 0)
  const result = { name, args, ...termination, timedOut, spawnError, counts, passed }; runs.push(result)
  if (!passed) console.error(log.slice(-6000))
}
await run('unit', ['--test', '--test-reporter=tap', ...tests])
await run('control-integration', ['--import', 'tsx/esm', '--test', '--test-reporter=tap', 'integration/connection-stagger.test.mjs'])
const require = createRequire(join(root, 'package.json')), ts = require('typescript')
const program = ts.createProgram({ rootNames: modules.map(file => resolve(project, file)), options: { allowJs: true, checkJs: false, strict: true, noEmit: true, skipLibCheck: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2024, types: ['node'], typeRoots: [join(root, 'node_modules/@types')] } })
const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ({ file: d.file?.fileName, line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : undefined, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }))
const typecheck = { passed: diagnostics.length === 0, strict: true, modules, diagnostics }
await writeFile(join(world, 'typecheck.json'), JSON.stringify(typecheck, null, 2) + '\n', { flag: 'wx' })
const after = await hashes(), inputsUnchanged = JSON.stringify(before) === JSON.stringify(after)
const report = { at: new Date().toISOString(), passed: runs.every(r => r.passed) && typecheck.passed && inputsUnchanged, runs, typecheck, inputsUnchanged, sha256: before, world, liveWindow: false, installedAppAccess: false, hdcStarted: false, modelCalls: 0 }
const evidence = 'evidence/desktop-submission-offline-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json'
await writeFile(resolve(project, evidence), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: report.passed, tests: runs.map(r => ({ name: r.name, ...r.counts })), typecheck: typecheck.passed, inputsUnchanged, evidence }))
if (!typecheck.passed) console.error(JSON.stringify(diagnostics))
process.exitCode = report.passed ? 0 : 1

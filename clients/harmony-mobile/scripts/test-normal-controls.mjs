/** Run only the synthetic test-entry cases with scrubbed environment and a fresh temporary profile. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const world = await mkdtemp(join(client, '.build/normal-controls-')), output = join(world, 'report.json')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(client, 'integration/normal-controls.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + output], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
await writeFile('evidence/normal-controls-tests.log', log.trimEnd() + '\n')
const report = JSON.parse(await readFile(output, 'utf8'))
await writeFile('evidence/normal-controls-tests.json', JSON.stringify({ at: new Date().toISOString(), code, passed: report.numPassedTests, failed: report.numFailedTests, report: output, world, liveModels: 0, phoneIo: false, remoteIo: false }, null, 2) + '\n')
console.log(JSON.stringify({ code, passed: report.numPassedTests, failed: report.numFailedTests, world })); if (code !== 0) console.error(log.split('\n').slice(-70).join('\n'))
process.exitCode = code ?? 1

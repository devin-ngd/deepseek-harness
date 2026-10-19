/** Run fixed memory control/history cases with a scrubbed environment; no field home, phone or external endpoint is selected. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, world = await mkdtemp(join(project, '.build/phase76-tests-')), output = join(world, 'vitest.json')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const args = [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/phase76-control.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + output], child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }), label = basename(world), report = JSON.parse(await readFile(output, 'utf8'))
await writeFile('evidence/' + label + '.log', log.trimEnd() + '\n', { flag: 'wx' }); await writeFile('evidence/' + label + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
const summary = { at: new Date().toISOString(), code, tests: report.numPassedTests, failed: report.numFailedTests, log: 'evidence/' + label + '.log', report: 'evidence/' + label + '.json', sdkSubstitute: true, memoryOnly: true, phoneIo: false, remoteIo: false, realGrantCreated: false, realModels: 0 }
await writeFile('evidence/phase76-integration-latest.json', JSON.stringify(summary, null, 2) + '\n'); console.log(JSON.stringify(summary)); if (code !== 0) console.error(log.split('\n').slice(-45).join('\n')); process.exitCode = code ?? 1

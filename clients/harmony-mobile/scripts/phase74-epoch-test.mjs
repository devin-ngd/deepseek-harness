/** Run one synthetic original-owner test with a scrubbed replay-only environment and unique evidence. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, world = await mkdtemp(join(client, '.build/phase74-epoch-'))
const report = join(world, 'vitest.json'), child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(client, 'integration/phase74-epoch.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }), suffix = world.split(/[\\/]/).at(-1)
await writeFile('evidence/' + suffix + '.log', log.trimEnd() + '\n', { flag: 'wx' })
const result = JSON.parse(await readFile(report, 'utf8')), summary = { observedAt: new Date().toISOString(), world, report, code, tests: result.numPassedTests, failed: result.numFailedTests, originalHomeRead: false, phoneIo: false, remoteIo: false, realModels: 0 }
await writeFile('evidence/' + suffix + '.json', JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' }); await writeFile('evidence/phase74-epoch-latest.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary)); if (code !== 0) process.stderr.write(log.split('\n').slice(-18).join('\n')); process.exitCode = code

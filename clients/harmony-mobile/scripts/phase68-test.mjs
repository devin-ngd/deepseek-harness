/** Selected deterministic tests with scrubbed environment, fixed replay guard and local-only fixtures. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, world = await mkdtemp(join(project, '.build/phase68-connection-')), report = join(world, 'vitest.json')
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/phase68-connection.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8'); if (process.argv.includes('--verbose')) process.stdout.write(bytes) })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
const suffix = process.argv.includes('--baseline') ? 'baseline' : 'regression'
await writeFile('evidence/phase68-' + suffix + '-tests.log', log.trimEnd() + '\n'); await writeFile('evidence/phase68-' + suffix + '-vitest.json', await readFile(report)); console.log(JSON.stringify({ report, code, passed: JSON.parse(await readFile(report, 'utf8')).numPassedTests })); if (code !== 0) process.stderr.write(log.split('\n').slice(-35).join('\n')); process.exitCode = code

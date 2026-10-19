/** Bounded opt-in phase5 test processes; fixed replay and scrubbed environment before constructing services. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const project = resolve('.'), source = JSON.parse(await readFile('source.json', 'utf8'))
await mkdir('.build', { recursive: true })
const world = await mkdtemp(join(project, '.build/phase5-world-')), report = join(world, 'vitest-report.json')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec,
  TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world }
const child = spawn(process.execPath, [join(source.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', 'clients/harmony-mobile/network-tests/phase5.spec.ts', '--configLoader', 'native', '--config', join(project, 'network-tests/vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: source.dshRoot, env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { if (signal !== null) reject(new Error('Phase5 test terminated: ' + signal)); else resolve(code ?? 1) }) })
await writeFile('evidence/phase5-vitest.json', (await readFile(report, 'utf8')).trimEnd() + '\n')
if (code === 0) console.log('PASS: actual BFF → shared phone domain → Chrome scoped rich form; replay four, real/upload zero; listener closed')
process.exitCode = code

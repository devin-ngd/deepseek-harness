/** Offline scoped memory runner; scrub all model/auth environment and never contact a server or installed profile. */
import { spawn } from 'node:child_process'
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
await mkdir('.build', { recursive: true })
const world = await mkdtemp(join(project, '.build/phase36-world-')), report = join(world, 'report.json')
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/phase36.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
let log = ''
for (const source of [child.stdout, child.stderr]) source.on('data', bytes => { log += bytes.toString('utf8'); process.stdout.write(bytes) })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
await writeFile('evidence/phase36-tests.log', log.trimEnd() + '\n'); await writeFile('evidence/phase36-vitest.json', (await readFile(report, 'utf8')).trimEnd() + '\n'); process.exitCode = code

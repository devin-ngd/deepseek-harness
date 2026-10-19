/** Fixed-replay source launcher: one selected in-process test file, no secrets, listeners, installed profile or models. */
import { spawn } from 'node:child_process'
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
await mkdir('.build', { recursive: true })
const world = await mkdtemp(join(project, '.build/phase34-world-')), report = join(world, 'report.json')
const args = [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/vitest.config.mjs'), 'clients/harmony-mobile/integration/phase34-device-auth.spec.ts', '--reporter=default', '--reporter=json', '--outputFile=' + report]
const child = spawn(process.execPath, args, { cwd: root, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
for (const source of [child.stdout, child.stderr]) source.on('data', bytes => { log += bytes.toString('utf8'); process.stdout.write(bytes) })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
await writeFile('evidence/phase34-tests.log', log.trimEnd() + '\n')
await writeFile('evidence/phase34-vitest.json', (await readFile(report, 'utf8')).trimEnd() + '\n')
process.exitCode = code

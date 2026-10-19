/** Isolated test launcher: no inherited provider secrets, no installs, no product application entrypoint. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
await mkdir(join(project, '.build'), { recursive: true })
await mkdir(join(project, 'evidence'), { recursive: true })
const world = await mkdtemp(join(project, '.build/phase3-world-'))
const report = join(world, 'vitest-report.json')
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec,
  TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1',
  DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world,
}
const args = [join(config.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native',
  '--config', join(project, 'integration/vitest.config.mjs'), '--reporter=default', '--reporter=json',
  '--outputFile=' + report]
const child = spawn(process.execPath, args, { cwd: config.dshRoot, env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', (code, signal) => {
  if (signal !== null) reject(new Error('integration worker terminated: ' + signal)); else accept(code ?? 1)
}) })
// Keep the reporter payload unchanged apart from owned text-file formatting; never copy a previous run's report.
await writeFile(join(project, 'evidence/phase3-vitest.json'), (await readFile(report, 'utf8')).trimEnd() + '\n')
process.exitCode = code

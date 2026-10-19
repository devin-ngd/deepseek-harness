/** Shared bounded synthetic process owners; all application launches use the exact guarded public dsh profile. */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
/** @param directory - fresh isolated profile home. @param point - closed fixture checkpoint. @param phase - create/write or reopen/read. @param world - exact synthetic storage owner. @returns prepared home; no app is launched. */
export async function fixtureHome(directory, point, phase, world) {
  const profile = join(directory, 'profiles/harmony-mobile-replay'); await mkdir(profile, { recursive: true }); await mkdir(join(directory, 'agents')); await mkdir(join(directory, 'tmp')); await mkdir(join(directory, 'invocation'))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'dsh-profile-harmony-mobile-replay', private: true, dependencies: {}, dsh: { profile: { bundles: ['@local/dsh-harmony-replay'] } } }) + '\n')
  for (const name of ['cordis.yml', 'cordis.snapshot.yml', 'cordis.patch.yml']) await writeFile(join(profile, name), '[]\n')
  await writeFile(join(directory, 'restart-fixture.json'), JSON.stringify({ schema: 'harmony-restart-fixture/1', fixture: 'public-fixed-replay-only', phase, point, world, checkpointWaitMs: 30000 }) + '\n')
  return directory
}
/** @param candidate - unmodified extracted candidate. @param home - prepared synthetic home. @returns exact child, joinable completion and lifecycle state; output is bounded and every failure can be awaited. */
export function startFixture(candidate, home) {
  const child = spawn(process.execPath, [join(candidate, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'harmony-mobile-replay'], { cwd: join(home, 'invocation'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, ComSpec: process.env.ComSpec, TEMP: join(home, 'tmp'), TMP: join(home, 'tmp'), DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_OFFLINE_PROFILE: 'restart-four-v1', DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' } })
  let log = '', exited = false
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { if (log.length + bytes.length > 2097152) child.kill('SIGKILL'); else log += bytes.toString('utf8') })
  const done = new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => { exited = true; clearTimeout(timer); void writeFile(join(home, 'process.log'), log.trimEnd() + '\n').then(() => accept({ code, signal }), reject) }) })
  void done.catch(() => {})
  return { child, done, get exited() { return exited } }
}
/** @param home - owned fixture home. @param name - exact generated result filename. @param process - corresponding owned child. @param waitMs - bounded evidence deadline. @returns parsed atomic JSON or a visible refusal; never treats another IO error as missing. */
export async function fixtureFile(home, name, process, waitMs = 30000) {
  const until = Date.now() + waitMs
  while (Date.now() < until) { try { return JSON.parse(await readFile(join(home, name), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }; if (process.exited) throw new Error('fixture exited before ' + name + ': ' + home); await delay(20) }
  throw new Error('fixture deadline for ' + name + ': ' + home)
}

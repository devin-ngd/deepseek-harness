/** Opt-in loopback test runner: fixed replay, scrubbed environment and two separate test processes. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
await mkdir(join(project, '.build'), { recursive: true })
const world = await mkdtemp(join(project, '.build/phase4-world-')), report = join(world, 'vitest-report.json')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec,
  TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world }
const offlineOnly = process.argv.includes('--offline-only')
const child = spawn(process.execPath, [join(source.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', ...(offlineOnly ? ['clients/harmony-mobile/network-tests/flow-control.spec.ts'] : []), '--configLoader', 'native',
  '--config', join(project, 'network-tests/vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report],
{ cwd: source.dshRoot, env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => {
  if (signal !== null) reject(new Error('Network test worker terminated: ' + signal)); else resolve(code ?? 1)
}) })
await writeFile(join(project, offlineOnly ? 'evidence/phase4-offline-vitest.json' : 'evidence/phase4-vitest.json'), (await readFile(report, 'utf8')).trimEnd() + '\n')
if (code === 0 && !offlineOnly) {
  const result = JSON.parse(await readFile(join(project, 'evidence/phase4-network.json'), 'utf8'))
  console.log(`本地固定回放闭环：服务 PID ${result.serverProcessId}，手机测试 PID ${result.phone.processId}；连接状态已验证；action ${result.phone.finalAction.state}；回放 ${result.modelRequests} 次；真实调用 ${result.counts.realCalls}；listener 已关闭。`)
}
process.exitCode = code

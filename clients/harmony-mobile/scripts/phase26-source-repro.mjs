/** Reproduce one read-only source snapshot in an ephemeral loopback test, with credentials excluded and no native resources. */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, mkdir, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = JSON.parse(await readFile('source.json', 'utf8'))
const world = await mkdtemp('D:/Temp/dsh-harmony-phase26-sentinel-')
await cp('D:/Temp/dsh-harmony-phase26-native-20261013-round8-resume2/services', join(world, 'services'), { recursive: true, force: false, errorOnExist: true })
const output = resolve('evidence/phase26-source-repro-' + new Date().toISOString().replaceAll(':', '-')); await mkdir(output)
const child = spawn(process.execPath, [resolve(source.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', 'clients/harmony-mobile/network-tests/phase26-sentinel.spec.ts', '--configLoader', 'native', '--config', resolve('network-tests/vitest.config.mjs'), '--reporter=default'], { cwd: source.dshRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, PATHEXT: process.env.PATHEXT, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
let log = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString(); process.stdout.write(bytes); if (Buffer.byteLength(log) > 2097152) child.kill() })
const timer = setTimeout(() => child.kill(), 60000)
const exit = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) }).finally(() => clearTimeout(timer))
await writeFile(join(output, 'tests.log'), log.replaceAll('\r\n', '\n').trimEnd() + '\n')
if (exit.code === 0 && !exit.signal) await writeFile(join(output, 'source-reset.json'), await readFile(join(world, 'source-reset.json')))
await writeFile(join(output, 'summary.json'), JSON.stringify({ world, ...exit, passed: exit.code === 0 && !exit.signal, role: 'source sentinel reproduction, not native acceptance', nativeStarted: false, installed: false, forwardCreated: false, realModels: 0, uploads: 0 }, null, 2) + '\n')
console.log('Source reproduction report: ' + output)
if (exit.code !== 0 || exit.signal) process.exitCode = 1

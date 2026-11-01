/** Finite Origin-admission and durable-revocation regressions; synthetic loopback only. */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const world = await mkdtemp(join(project, '.build/connection-feasibility-'))
const config = 'import base from ' + JSON.stringify(pathToFileURL(resolve('integration/phase68-connection.vitest.config.mjs')).href) + ';export default {...base,cacheDir:' + JSON.stringify(join(world, 'cache')) + ',test:{...base.test,name:"connection-feasibility",include:["clients/harmony-mobile/integration/phase68-connection.spec.ts"],testNamePattern:/(Origin|origin|NetworkKit|compatibility mode)/}};'
await writeFile(join(world, 'config.mjs'), config, { flag: 'wx' })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world, HARMONY_PUBLIC_TOOLS_DIR: '.build/first-use-relay-tools-recovery.5' })
async function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
  return { code, log }
}
const report = join(world, 'origin-vitest.json')
const origin = await run([join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(world, 'config.mjs'), '--reporter=json', '--outputFile=' + report], root)
await writeFile(join(world, 'origin.log'), origin.log)
const revoked = await run(['--test', 'tests/public-relay-maintenance.test.mjs'], project)
await writeFile(join(world, 'revoked.tap'), revoked.log)
const tests = JSON.parse(await readFile(report, 'utf8'))
const passed = origin.code === 0 && tests.numPassedTests > 0 && tests.numFailedTests === 0 && revoked.code === 0
const sources = ['integration/relay-upgrade.ts', 'standalone-relay/src/config.ts', 'standalone-relay/src/public-trust.ts', 'standalone-relay/src/room-broker.ts', 'desktop-plugin/src/device-binding-command.ts', 'desktop-plugin/src/device-binding-relay.ts', 'src/native-device-bridge.ts', 'harmony/entry/src/main/ets/native/NativeRelaySocket.ets', 'tests/public-relay-maintenance.test.mjs']
const receipt = { at: new Date().toISOString(), passed, world, origin: { code: origin.code, passed: tests.numPassedTests, failed: tests.numFailedTests, skipped: tests.numPendingTests }, revocation: { code: revoked.code, passed: Number(revoked.log.match(/^# pass (\d+)/m)?.[1] ?? 0), failed: Number(revoked.log.match(/^# fail (\d+)/m)?.[1] ?? 0) }, sourceInputs: await Promise.all(sources.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))), remote: false, realIdentities: false, realModelCalls: 0, realTicketsIssued: false, deviceHeaderCapture: false }
const path = 'evidence/connection-feasibility-' + Date.now() + '.json'
await writeFile(path, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...receipt, sourceInputs: undefined, evidence: path }))
if (!passed) { console.error(origin.log.slice(-2500)); console.error(revoked.log.slice(-2500)); process.exitCode = 1 }

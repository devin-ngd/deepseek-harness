/** Test-only owner for focused source/real-service replay; child environment contains no model credentials. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = JSON.parse(await readFile('source.json', 'utf8')), world = await mkdtemp('D:/Temp/dsh-harmony-phase15-')
const output = resolve('evidence/phase15-focused-' + new Date().toISOString().replaceAll(':', '-')); await mkdir(output)
const records = []
for (const [name, config, file] of [['source', 'integration', 'projection.spec.ts'], ['services', 'network-tests', 'phase15.spec.ts']]) {
  const report = join(output, name + '.json')
  const child = spawn(process.execPath, [resolve(source.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', 'clients/harmony-mobile/' + config + '/' + file, '--configLoader', 'native', '--config', resolve(config, 'vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: source.dshRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
  let log = '', exceeded = false, timedOut = false
  const append = bytes => { if (Buffer.byteLength(log) + bytes.length > 2097152) { exceeded = true; child.kill(); return } log += bytes.toString(); process.stdout.write(bytes) }
  child.stdout.on('data', append); child.stderr.on('data', append)
  const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
  const exit = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) }).finally(() => clearTimeout(timer))
  try { await writeFile(report, JSON.stringify(JSON.parse(await readFile(report, 'utf8')), null, 2) + '\n') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await writeFile(join(output, name + '.log'), log.replaceAll('\r\n', '\n').trimEnd() + '\n')
  records.push({ name, ...exit, exceeded, timedOut })
  if (exit.code !== 0 || exit.signal || exceeded || timedOut) break
}
const passed = records.length === 2 && records.every(value => value.code === 0 && !value.signal && !value.exceeded && !value.timedOut)
await writeFile(join(output, 'summary.json'), JSON.stringify({ passed, world, output, records, nativeActivated: false }, null, 2) + '\n')
console.log('Focused evidence: ' + output); if (!passed) process.exitCode = 1

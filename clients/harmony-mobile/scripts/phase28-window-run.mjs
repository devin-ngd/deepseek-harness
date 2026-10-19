/** Approved ninth-window dispatch: readiness and driver run consecutively; original checks and cleanup remain unchanged. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const world = resolve(process.argv[2] ?? '')
if (process.env.DSH_HARMONY_NATIVE_ACCEPTANCE !== 'approved-phase28' || !world.startsWith('D:\\Temp\\dsh-harmony-phase28-native-')) throw Error('Matching ninth-round approval and world required')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, PATHEXT: process.env.PATHEXT, TEMP: 'D:/Temp', TMP: 'D:/Temp', DSH_HARMONY_NATIVE_ACCEPTANCE: 'approved-phase28' }
const run = async (script, args) => {
  const child = spawn(process.execPath, [script, world, ...args], { env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] })
  return new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) })
}
const json = async name => JSON.parse(await readFile(join(world, name), 'utf8'))
try {
  const readiness = await run('scripts/phase18-native-readiness.mjs', ['--execute-readiness', '--checkpoint-proof'])
  if (readiness.code !== 0 || readiness.signal) throw Error('Prewindow readiness failed; no forward request')
  const ready = await json('prewindow-ready.json')
  if (Date.now() - Date.parse(ready.checkedAt) > 60000) throw Error('Original readiness freshness expired')
  await writeFile(join(world, 'window.open.request'), 'Ninth window authorized; v27 readiness confirmed; original budget and criterion retained.\n', { flag: 'wx' })
  const deadline = Date.now() + 15000
  let active
  while (Date.now() < deadline) {
    try { active = await json('forward-active.json'); if (active.active) break } catch (error) { if (error.code !== 'ENOENT') throw error }
    await delay(100)
  }
  if (!active?.active) throw Error('Exact forward not confirmed')
  console.log(JSON.stringify({ lease: await json('forward-lease.json'), active }))
  const driver = await run('scripts/phase17-native-driver.mjs', ['--execute', '--checkpoint-proof'])
  console.log(JSON.stringify({ driver }))
  if (driver.code !== 0 || driver.signal) process.exitCode = 1
} catch (error) {
  await writeFile(join(world, 'window-dispatch-failure.json'), JSON.stringify({ at: new Date().toISOString(), error: error.message, originalChecksRetained: true }, null, 2) + '\n')
  await writeFile(join(world, 'cleanup.request'), 'Ninth-window preparation or dispatch failed; close every owned resource.\n')
  throw error
}

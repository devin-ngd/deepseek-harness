/** Five bounded read-only observations of the already selected HDC server; never starts a server, changes permissions or retries a side effect. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
const rows = [], hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
for (let attempt = 1; attempt <= 5; attempt++) {
  const value = spawnSync(hdc, ['-p', '-s', '127.0.0.1:8710', 'list', 'targets'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }), targets = (value.stdout ?? '').trim().split(/\r?\n/).filter(row => row && row !== '[Empty]').map(row => 'target-' + createHash('sha256').update(row).digest('hex').slice(0, 8))
  const row = { at: new Date().toISOString(), attempt, status: value.status, code: value.error?.code ?? null, targets, selectedOriginalAvailable: value.status === 0 && targets.length === 1 && targets[0] === 'target-54cfb7ac' }
  rows.push(row); console.log(JSON.stringify(row))
  if (row.selectedOriginalAvailable || attempt === 5) break
  await delay(30000)
}
await writeFile('D:/Temp/dsh-harmony-phase76-operation/phone-availability.json', JSON.stringify({ observations: rows, intervalMs: 30000, sideEffectsRetried: false, hdcServerStarted: false }, null, 2) + '\n', { flag: 'wx' })

/** Query only the shared HDC target list; never launch an app, start a daemon or project device identifiers. */
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const result = spawnSync('D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', ['-p', '-s', '127.0.0.1:8710', 'list', 'targets'], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }, windowsHide: true, encoding: 'utf8', timeout: 20000 })
const lines = result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : [], approved = lines.filter(value => createHash('sha256').update(value).digest('hex').startsWith('54cfb7ac'))
const report = { at: new Date().toISOString(), hostCommandSucceeded: result.status === 0, exactApprovedTargetAvailable: lines.length === 1 && approved.length === 1, approvedTargetPresent: approved.length === 1, scope: 'shared HDC list only', rawIdentifiersRetained: false, deviceCommandsExecuted: false, appLaunched: false }
await writeFile('evidence/phase58-phone-availability.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

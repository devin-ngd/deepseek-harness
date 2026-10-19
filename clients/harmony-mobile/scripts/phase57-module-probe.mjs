/** Count only known module-loader failure categories for this app PID; raw log text is neither saved nor printed. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), owned = JSON.parse(await readFile('.build/phase57-device-process.json', 'utf8')), hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710']
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world }
function run(args) { const result = spawnSync(hdc, args, { env, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4194304 }); assert.equal(result.status, 0, 'scoped HDC read failed; raw output withheld'); return result.stdout }
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/); assert.equal(targets.length, 1); assert.equal(createHash('sha256').update(targets[0]).digest('hex').slice(0, 8), '54cfb7ac')
const device = (...args) => run([...base, '-t', targets[0], ...args]); assert.equal(device('shell', 'pidof', owned.bundle).trim(), owned.pid)
const lines = device('shell', 'hilog', '-P', owned.pid, '-x').split(/\r?\n/), count = pattern => lines.filter(line => pattern.test(line)).length
const report = { at: new Date().toISOString(), pid: owned.pid, wrongKitModuleMentions: count(/@ohos:ArkTS|@kit\.ArkTS/), missingUtilExportCategory: count(/indirect export.*util|export.*util.*(?:not found|not exist)/i), missingArkTsModuleCategory: count(/(?:not found|not exist|cannot find).*ArkTS|ArkTS.*(?:not found|not exist)/i), rawLogRetained: false, rawMessagesProjected: false }
await writeFile('evidence/phase57-module-load-summary.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

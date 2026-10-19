/** Project only known HUKS operation categories and numeric result codes for this app; raw log lines never leave memory. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), owned = JSON.parse(await readFile('.build/phase58-device-process.json', 'utf8')), hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710']
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world }
function run(args) { const result = spawnSync(hdc, args, { env, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4194304 }); assert.equal(result.status, 0, 'scoped HDC read failed; raw output withheld'); return result.stdout }
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/); assert.equal(targets.length, 1); assert.equal(createHash('sha256').update(targets[0]).digest('hex').slice(0, 8), '54cfb7ac')
const device = (...args) => run([...base, '-t', targets[0], ...args]); assert.equal(device('shell', 'pidof', owned.bundle).trim(), owned.pid)
const lines = device('shell', 'hilog', '-P', owned.pid, '-x').split(/\r?\n/), records = []
for (const line of lines.filter(line => /huks|hks|initSession|finishSession|updateSession/i.test(line))) {
  const operation = /(?:initSession|HksInit|HuksInit)/i.test(line) ? 'init' : /(?:updateSession|HksUpdate)/i.test(line) ? 'update' : /(?:finishSession|HksFinish|HksSign)/i.test(line) ? 'finish' : /(?:abortSession|HksAbort)/i.test(line) ? 'abort' : 'other-huks'
  const codes = [...line.matchAll(/(?:result|ret|code|err(?:or)?(?:Code)?|status)\s*(?:is\s*)?[:=]\s*(-?\d{1,10})/gi)].map(match => Number(match[1])); if (codes.length) records.push({ operation, codes })
}
const report = { at: new Date().toISOString(), pid: owned.pid, records: records.slice(-64), rawLogRetained: false, rawMessagesProjected: false, signaturesProjected: false, keysProjected: false }
await writeFile('evidence/phase58-huks-result-categories.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

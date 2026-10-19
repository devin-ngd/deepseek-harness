/** Start the existing official SDK HDC once on its original loopback endpoint; never restart, elevate device mode or change settings. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const previous = JSON.parse(await readFile('evidence/phase66-host-processes.json', 'utf8'))
assert.equal(previous.hdcProcessCount, 0)
assert.equal(previous.originalLoopback8710Listeners.length, 0)
assert.ok(Date.now() - Date.parse(previous.at) < 300000)
const executable = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
const args = ['-s', '127.0.0.1:8710', 'start']
const startedAt = new Date().toISOString()
await writeFile('evidence/phase66-hdc-start-attempt.json', JSON.stringify({ at: startedAt, executable, args, normalStartOnly: true, restart: false, rootDeviceMode: false, existingHelperPreviouslyAbsent: true, unknownUntilObserved: true }, null, 2) + '\n', { flag: 'wx' })
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
const result = spawnSync(executable, args, { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 })
const output = ((result.stdout ?? '') + (result.stderr ?? '')).replace(/\b[A-Z0-9]{14,}\b/g, '[identifier omitted]')
const report = { startedAt, completedAt: new Date().toISOString(), executable, args, hostExitCode: result.status, signal: result.signal, processError: result.error?.code ?? null, output, explicitAccessRefused: /access denied|permission denied|not permitted|拒绝访问|访问被拒绝/i.test(output), settingsChanged: false, driverInstalled: false, restart: false, followupStateRequired: true, automaticRetry: false }
await writeFile('evidence/phase66-hdc-start-result.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(report))
if (result.status !== 0 || report.explicitAccessRefused) process.exitCode = 1

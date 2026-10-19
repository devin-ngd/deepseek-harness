/** One controlled launch of the installed approved app, with bounded PID observations and public declaration fields only. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710'], bundle = 'local.dsh.mobile.offlineproduct', env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }, installed = JSON.parse(await readFile('evidence/phase65-installation.json', 'utf8'))
assert.equal(installed.success, true)
const run = args => spawnSync(hdc, args, { env, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 1048576 }), targets = run([...base, 'list', 'targets']).stdout.trim().split(/\r?\n/).filter(Boolean)
assert.equal(targets.length, 1); assert.equal(createHash('sha256').update(targets[0]).digest('hex').slice(0, 8), '54cfb7ac')
const own = args => run([...base, '-t', targets[0], 'shell', ...args]), before = own(['pidof', bundle]).stdout.trim(); assert.equal(before, '', 'app already running; do not launch again')
const raw = own(['bm', 'dump', '-n', bundle]).stdout, metadata = JSON.parse(raw.slice(raw.indexOf('{'))), declarations = { publicFields: Object.keys(metadata), enabled: metadata.applicationInfo?.enabled, process: metadata.applicationInfo?.process, mainEntry: metadata.mainEntry, modules: (metadata.hapModuleInfos ?? []).map(row => ({ name: row.name, moduleName: row.moduleName, mainAbility: row.mainAbility, mainElementName: row.mainElementName, abilities: (row.abilityInfos ?? []).map(ability => ({ name: ability.name, enabled: ability.enabled, process: ability.process, exported: ability.exported })) })) }
await writeFile('evidence/phase66-launch-probe-attempt.json', JSON.stringify({ at: new Date().toISOString(), bundle, previousPidEmpty: true, originalLaunchOutcomeNotObserved: true, identityOperation: false, grantCreated: false }, null, 2) + '\n', { flag: 'wx' })
const started = own(['aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility']), observations = []
for (let index = 0; index < 4; index++) { if (index) await new Promise(accept => setTimeout(accept, 500)); const result = own(['pidof', bundle]); const pid = result.stdout.trim(); observations.push({ at: new Date().toISOString(), hostExitCode: result.status, pid: /^\d+$/.test(pid) ? pid : '' }) }
const output = ((started.stdout ?? '') + (started.stderr ?? '')).replaceAll(targets[0], '[approved target]'), report = { at: new Date().toISOString(), bundle, launchHostExitCode: started.status, publicLaunchOutput: output.slice(0, 4096), declarations, observations, currentPid: observations.at(-1).pid, settingsChanged: false, keyOperation: false, grantCreated: false }
if (/^\d+$/.test(report.currentPid)) await writeFile('.build/phase66-device-process.json', JSON.stringify({at:report.at,pid:report.currentPid,bundle,ownedByLaunchProbe:true}) + '\n', {flag:'wx'});
await writeFile('evidence/phase66-launch-probe.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

/** Verify the exact authorized input and only the previously approved phone; perform no device mutations. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const candidate = 'D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap'
const bytes = await readFile(candidate)
assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
assert.equal(bytes.length, 5268759)
assert.equal(hash(bytes), 'e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858')
const old = JSON.parse(await readFile('evidence/phase59-signed-build.json', 'utf8'))
assert.equal(hash(await readFile(old.artifact.path)), old.artifact.sha256)
const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
const base = ['-p', '-s', '127.0.0.1:8710']
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
const run = args => spawnSync(hdc, [...base, ...args], { env, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 4194304 })
const list = run(['list', 'targets'])
const targets = list.status === 0 ? list.stdout.trim().split(/\r?\n/).filter(value => value && value !== '[Empty]') : []
const approved = targets.length === 1 && hash(targets[0]).startsWith('54cfb7ac')
const report = { schema: 'harmony-phase66-preflight/1', at: new Date().toISOString(), candidate: { path: candidate, bytes: bytes.length, sha256: hash(bytes) }, hostExitCode: list.status, stdoutBytes: Buffer.byteLength(list.stdout ?? ''), stderrBytes: Buffer.byteLength(list.stderr ?? ''), targetCount: targets.length, exactApprovedTarget: approved, targetReference: approved ? 'target-54cfb7ac' : null, oldSignedArtifactUnchanged: true, deviceMutation: false, signingAttempted: false, installationAttempted: false }
if (!approved) {
  const help = run(['-h'])
  report.help = { exitCode: help.status, stdoutBytes: Buffer.byteLength(help.stdout ?? ''), stderrBytes: Buffer.byteLength(help.stderr ?? ''), processError: help.error?.code ?? null }
  report.listProcessError = list.error?.code ?? null
}
if (approved) {
  const own = args => { const result = run(['-t', targets[0], 'shell', ...args]); assert.equal(result.status, 0, 'read-only approved-device query failed'); return result.stdout.trim() }
  report.model = own(['param', 'get', 'const.product.model'])
  report.api = own(['param', 'get', 'const.ohos.apiversion'])
  report.os = own(['param', 'get', 'const.ohos.fullname'])
  assert.equal(report.model, 'CMM-AL10'); assert.equal(report.api, '26')
  const raw = own(['bm', 'dump', '-n', 'local.dsh.mobile.offlineproduct'])
  const metadata = JSON.parse(raw.slice(raw.indexOf('{')))
  report.application = { bundleName: metadata.applicationInfo?.bundleName ?? metadata.name, versionName: metadata.versionName, versionCode: metadata.versionCode, requestedPermissions: metadata.reqPermissions ?? metadata.applicationInfo?.permissions ?? [], metadataKeys: Object.keys(metadata) }
  assert.equal(report.application.bundleName, 'local.dsh.mobile.offlineproduct')
  assert.equal(report.application.versionName, '0.0.0'); assert.equal(report.application.versionCode, 1)
  report.pidBefore = own(['pidof', 'local.dsh.mobile.offlineproduct'])
}
await writeFile('evidence/phase66-preflight-' + report.at.replaceAll(':', '-').replaceAll('.', '-') + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
await writeFile('.build/phase66-preflight-current.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
if (!approved) process.exitCode = 2

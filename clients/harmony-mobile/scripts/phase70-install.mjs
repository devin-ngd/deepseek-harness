/** Install only the verified alpha.4 HAP on the original phone, once, preserving the same bundle and application data. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const approval = await json('evidence/phase70-authorization.json'), signed = await json('evidence/phase70-signed-build.json')
assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
assert.equal(approval.evidence, 'Sentinel_ba30e73d8ea081919058993e42fafead')
assert.equal(signed.authorization, approval.evidence); assert.equal(signed.pagesInfoSdkDerived, true); assert.equal((await json('evidence/phase70-signing-identity-match.json')).originalSigningIdentityMatched, true)
assert.equal(signed.officialVerifyAppExitCode, 0); assert.equal(signed.officialVerifyProfileExitCode, 0)
assert.equal(signed.extractedProfileExactlyMatchesExistingApprovedMaterial, true)
assert.equal(signed.applicationEntriesExactlyMatch, true); assert.equal(signed.exactApprovedInputSigned, true)
assert.equal(signed.inputArtifact.sha256, approval.candidate.sha256)
assert.equal(signed.artifact.path, 'D:/Temp/dsh-harmony-mobile-20261017-phase69.1-signed.hap')
assert.equal(signed.artifact.bytes, 5234434)
assert.equal(signed.artifact.sha256, '59b6e99e8ddf6d09cde450144c674848b48aa345bde8e853084b9b034e23bf4a')
assert.equal(hash(await readFile(signed.artifact.path)), signed.artifact.sha256)
assert.equal(hash(await readFile(approval.candidate.path)), approval.candidate.sha256)
assert.equal(signed.metadata.bundleName, 'local.dsh.mobile.offlineproduct')
assert.equal(signed.metadata.versionName, '0.0.0'); assert.equal(signed.metadata.versionCode, 1)
assert.deepEqual(signed.metadata.permissions, ['ohos.permission.INTERNET'])
const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710']
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
const run = (args, timeout = 15000) => spawnSync(hdc, [...base, ...args], { env, windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 4194304 })
const list = run(['list', 'targets'])
assert.equal(list.status, 0)
const targets = list.stdout.trim().split(/\r?\n/).filter(value => value && value !== '[Empty]')
assert.equal(targets.length, 1); assert.ok(hash(targets[0]).startsWith('54cfb7ac'))
const own = args => { const result = run(['-t', targets[0], 'shell', ...args]); assert.equal(result.status, 0); return result.stdout.trim() }
assert.equal(own(['param', 'get', 'const.product.model']), 'CMM-AL10')
assert.equal(own(['param', 'get', 'const.ohos.apiversion']), '26')
const bundle = signed.metadata.bundleName, raw = own(['bm', 'dump', '-n', bundle]), before = JSON.parse(raw.slice(raw.indexOf('{')))
assert.equal(before.applicationInfo?.bundleName ?? before.name, bundle)
assert.equal(before.versionName, signed.metadata.versionName); assert.equal(before.versionCode, signed.metadata.versionCode)
const pidBefore = own(['pidof', bundle])
await writeFile('evidence/phase70-install-attempt.json', JSON.stringify({ at: new Date().toISOString(), authorization: approval.evidence, artifact: signed.artifact, targetReference: 'target-54cfb7ac', priorVersion: { name: before.versionName, code: before.versionCode }, pidBefore, inPlaceOnly: true, unknownUntilCompletion: true }, null, 2) + '\n', { flag: 'wx' })
const result = run(['-t', targets[0], 'install', '-r', signed.artifact.path.replaceAll('/', '\\')], 90000)
const success = result.status === 0 && /install bundle successfully/.test(result.stdout)
const report = { startedAt: (await json('evidence/phase70-install-attempt.json')).at, completedAt: new Date().toISOString(), authorization: approval.evidence, artifact: signed.artifact, targetReference: 'target-54cfb7ac', hostExitCode: result.status, processError: result.error?.code ?? null, success, output: ((result.stdout ?? '') + (result.stderr ?? '')).replaceAll(targets[0], '[approved target]').slice(0, 8192), inPlace: true, uninstall: false, dataCleared: false, newPermissions: false, materialsRegenerated: false, launch: false, huksOperation: false, realModels: 0, userProjectOperations: 0, automaticRetry: false }
await writeFile('evidence/phase70-installation.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
assert.equal(success, true, 'Unknown or failed installation: inspect state; do not retry automatically')
console.log(JSON.stringify(report))

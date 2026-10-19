/** Approved deployment preparation: verify current artifacts, preserve configuration and probe only the original HDC target. No grant or model is created. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const approval = { evidence: 'Sentinel_e2d971bb3abc8191b9b8f261d185e4fb', at: '2026-10-18T03:39:00Z', response: '允许', proposal: 'Sentinel_e59e13d2b694819184894d333e98f09c', scope: 'Install and enable normal-controls.1 in current desktop; original-certificate data-preserving phone upgrade; dedicated ordinary synthetic Session, at most three fixed responses, no real model; original HUKS/DPAPI identity; one new scope at most 30 minutes; exact six-public-field relay upload and bounded service/burst changes; revoke and restore at end or failure.' }
const candidate = await json('evidence/normal-controls-final.json')
assert.equal(candidate.version, '0.0.0-normal-controls.1')
assert.equal(hash(await readFile(candidate.plugin.path)), candidate.plugin.sha256)
assert.equal(hash(await readFile(candidate.unsignedHap.path)), candidate.unsignedHap.sha256)
let run
try { await access('evidence/normal-controls-deployment.json'); throw new Error('Existing deployment state must be resumed, not recreated') } catch (error) { if (error.code !== 'ENOENT') throw error }
run = await mkdtemp('D:/Temp/dsh-harmony-normal-controls-20261018-')
const profile = 'C:/Users/wpdev/.dsh/profiles/desktop', backup = join(run, 'private-backup')
await mkdir(backup)
const files = []
for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.yml', 'cordis.patch.yml']) {
  const source = join(profile, name), bytes = await readFile(source), destination = join(backup, name)
  await copyFile(source, destination); assert.equal(hash(await readFile(destination)), hash(bytes)); files.push({ source, backup: destination, sha256: hash(bytes) })
}
const originalCredentials = 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/home/.field-credentials.yaml'
const encryptedBackup = join(backup, 'original-field-credentials.yaml')
await copyFile(originalCredentials, encryptedBackup)
const credentialFileHash = hash(await readFile(encryptedBackup)); assert.equal(hash(await readFile(originalCredentials)), credentialFileHash)
const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
const probe = spawnSync(hdc, ['-p', '-s', '127.0.0.1:8710', 'list', 'targets'], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
const targets = (probe.stdout ?? '').trim().split(/\r?\n/).filter(row => row && row !== '[Empty]').map(row => 'target-' + hash(Buffer.from(row)).slice(0, 8))
const state = { at: new Date().toISOString(), approval, run, profile, candidates: { plugin: candidate.plugin, unsignedHap: candidate.unsignedHap }, backups: files, originalIdentity: { alias: 'harmony-phase54-desktop', phoneAlias: 'harmony-phase54-phone', desktopFingerprint: 'p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc', phoneFingerprint: 'p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99', credentialsFile: originalCredentials, encryptedBackup, originalFileSha256: credentialFileHash, unprotectedPrivateBytesRead: false }, phone: { hdc, server: '127.0.0.1:8710', targetRef: 'target-54cfb7ac', probeCode: probe.status, observedTargets: targets, originalAvailable: probe.status === 0 && targets.length === 1 && targets[0] === 'target-54cfb7ac' }, oldFieldEpoch: 10, grantStarted: false, installedPlugin: false, installedPhone: false, signed: false, modelCalls: 0, uploaded: false }
await writeFile(join(run, 'approval.json'), JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/normal-controls-deployment.json', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ run, artifactsMatched: true, configurationBackupFiles: files.length, originalEncryptedIdentityBackupVerified: true, originalPhoneAvailable: state.phone.originalAvailable, observedTargets: targets, hdcServerStarted: false, grantStarted: false }))

/** Sign the exact approved HAP once with installed official SDK helpers; an interrupted result can only resume verification. */
import { readFile, writeFile, copyFile, mkdir, access, constants } from 'node:fs/promises'
import { join, dirname, resolve, delimiter } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { verifyHapEntries } from './phase59-hap-entries.mjs'
const json = async path => JSON.parse(await readFile(path, 'utf8')), hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--verify-existing', 'only verification recovery is supported')
const approval = await json('evidence/phase59-authorization.json'), sealed = await json('evidence/phase58-deliverables.json'), marker = await json('.build/phase54-active.json'), previous = await json('evidence/phase58-signed-build.json'), candidate = sealed.huksUnsigned, sourceBytes = await readFile(candidate.path)
assert.equal(approval.evidence, 'Sentinel_d48d1df92240819189504e899e9fc290'); assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK'); assert.equal(candidate.path, 'D:/Temp/dsh-harmony-mobile-20261015-huks-sign-purpose-unsigned.hap'); assert.equal(sourceBytes.length, 5272033); assert.equal(hash(sourceBytes), '14cd20fcb88d80c9fbde50ef61bb7d057debdee0950752deb28618f8eabee016')
for (const row of sealed.records) assert.equal(hash(await readFile(row.path)), row.sha256, 'sealed input changed: ' + row.path)
assert.equal(hash(await readFile(sealed.source.path)), sealed.source.sha256); assert.equal(hash(await readFile(previous.artifact.path)), previous.artifact.sha256)
const ide = 'D:/Program Files/HuaWei/DevEco Studio', project = 'D:/Temp/dsh-harmony-layout-fix-signing-20261014', configPath = join(project, 'build-profile.json5'), configBytes = await readFile(configPath), config = JSON.parse(configBytes.toString('utf8')), selected = config.app.signingConfigs.find(row => row.name === 'default')
assert.ok(selected); assert.equal(config.app.products.find(row => row.name === 'default').signingConfig, 'default')
const material = { ...selected.material }; for (const key of ['storeFile', 'profile', 'certpath']) material[key] = resolve(project, material[key])
const profileBytes = await readFile(material.profile); assert.equal(hash(profileBytes), hash(await readFile(join(marker.world, 'phase58-signature-verification/profile.p7b'))))
const directory = join(marker.world, 'phase59-signature-verification'), signed = join(directory, 'exact-candidate-signed.hap'), destination = 'D:/Temp/dsh-harmony-mobile-20261015-huks-sign-purpose-signed.hap', attemptPath = 'evidence/phase59-sign-attempt.json', resultPath = 'evidence/phase59-signed-build.json'
for (const path of [destination, resultPath]) { try { await access(path); throw new Error('verified signed output already exists') } catch (error) { if (error.code !== 'ENOENT') throw error } }
const env = { PATH: [join(ide, 'jbr/bin'), process.env.SystemRoot + '/System32'].join(delimiter), SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world, USERPROFILE: process.env.USERPROFILE }, java = join(ide, 'jbr/bin/java.exe'), jar = join(ide, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar'), startedAt = new Date().toISOString()
await mkdir(directory, { recursive: true })
if (!process.argv.includes('--verify-existing')) {
  try { await access(signed); throw new Error('unverified output exists; inspect before verification recovery') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const sdkUserHome = resolve('.build/phase59-sign-sdk-user'); await mkdir(sdkUserHome, { recursive: true }); process.env.HVIGOR_USER_HOME = sdkUserHome
  const plugin = join(ide, 'tools/hvigor/hvigor-ohos-plugin'), require = createRequire(join(plugin, 'package.json')), { DecipherUtil } = require(join(plugin, 'src/utils/decipher-util.js')), { SigningOptionsV2 } = require(join(plugin, 'src/builder/inner-java-command-builder/signing-options-v2.js'))
  await writeFile(attemptPath, JSON.stringify({ at: startedAt, authorization: approval.evidence, input: candidate, exactInput: true, unknownUntilVerified: true, rawArgumentsProjected: false }, null, 2) + '\n', { flag: 'wx' })
  const storePassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.storePassword, configPath), keyPassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.keyPassword, configPath)
  const args = new SigningOptionsV2().sign().addMode('localSign').addKeyStoreFile(material.storeFile).addKeyStorePwd(storePassword).addKeyAlias(material.keyAlias).addKeyPwd(keyPassword).addSignAlg(material.signAlg).addProfileFile(material.profile).addAppCertFile(material.certpath).addInputFile(candidate.path).addOutputFile(signed).addCalledJarFile(jar).build()
  assert.equal(args[0], 'java'); const result = spawnSync(java, args.slice(1), { env, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 4194304 })
  await writeFile('evidence/phase59-sign-result.json', JSON.stringify({ at: new Date().toISOString(), hostExitCode: result.status, signal: result.signal, rawOutputRetained: false, rawArgumentsProjected: false, exactInputSha256: hash(sourceBytes) }, null, 2) + '\n', { flag: 'wx' })
  assert.equal(result.status, 0, 'official exact-input signing did not complete; inspect bounded result and owned process before any recovery')
} else { const attempt = await json(attemptPath); assert.equal(attempt.input.sha256, candidate.sha256); await access(signed) }
function verify(args) { const result = spawnSync(java, ['-jar', jar, ...args], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304 }); assert.equal(result.status, 0, 'official verification failed; raw output withheld'); return result.status }
const appCode = verify(['verify-app', '-inFile', signed, '-outCertChain', join(directory, 'certificate-chain.cer'), '-outProfile', join(directory, 'profile.p7b')]), profileCode = verify(['verify-profile', '-inFile', join(directory, 'profile.p7b'), '-outFile', join(directory, 'verified-profile.json')])
assert.equal(hash(await readFile(join(directory, 'profile.p7b'))), hash(profileBytes), 'profile changed from original approved material')
const payloadPath = join(directory, 'public-payload-report.json'), payload = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve('scripts/phase59-hap-payload.ps1')], { env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_UNSIGNED_HAP: candidate.path, DSH_SIGNED_HAP: signed, DSH_PUBLIC_PAYLOAD_REPORT: payloadPath }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
assert.equal(payload.status, 0, 'public payload verification failed; do not install before verification recovery')
const publicPayload = await json(payloadPath), entryVerification = verifyHapEntries(publicPayload.inputEntries, publicPayload.signedEntries)
assert.equal(publicPayload.metadata.bundleName, 'local.dsh.mobile.offlineproduct'); assert.equal(publicPayload.metadata.versionCode, 1); assert.equal(publicPayload.metadata.versionName, '0.0.0'); assert.deepEqual(publicPayload.metadata.permissions, ['ohos.permission.INTERNET'])
assert.equal(hash(await readFile(candidate.path)), candidate.sha256); assert.equal(hash(await readFile(configPath)), hash(configBytes)); assert.equal(hash(await readFile(previous.artifact.path)), previous.artifact.sha256)
await copyFile(signed, destination, constants.COPYFILE_EXCL); const bytes = await readFile(destination)
await writeFile('evidence/phase59-public-payload.json', JSON.stringify(publicPayload, null, 2) + '\n', { flag: 'wx' })
const report = { schema: 'harmony-approved-exact-input-signing/1', authorization: approval.evidence, signingStartedAt: (await json(attemptPath)).at, verificationStartedAt: startedAt, packageSignerExecutions: 1, verificationRecovery: process.argv.includes('--verify-existing'), completedAt: new Date().toISOString(), inputArtifact: candidate, exactApprovedInputSigned: true, artifact: { path: destination, bytes: bytes.length, sha256: hash(bytes) }, officialVerifyAppExitCode: appCode, officialVerifyProfileExitCode: profileCode, ...entryVerification, originalSigningConfigurationUnchanged: true, extractedProfileExactlyMatchesExistingApprovedMaterial: true, metadata: publicPayload.metadata, existingMaterialsReused: true, materialsRegenerated: false, rawSignerOutputProjected: false, privateKeyContentInspected: false, rebuiltCandidate: false, signingProjectSourceChanged: false, predecessorArtifactsUnchanged: true, installed: false, realModels: 0, userProjectOperations: 0 }
await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

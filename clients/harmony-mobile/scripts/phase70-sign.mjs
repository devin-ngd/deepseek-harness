/** Sign the exact alpha.4 input once with original official SDK materials; unknown results permit verification only. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, constants, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyHapEntries } from './phase70-hap-entries.mjs'

const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const absent = async path => { try { await access(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }; throw new Error('Existing operation state requires review') }
let stage = 'preflight'
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--verify-existing')
  assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
  const approval = await json('evidence/phase70-authorization.json'), candidate = approval.candidate
  assert.equal(approval.evidence, 'Sentinel_ba30e73d8ea081919058993e42fafead'); const device = await json('.build/phase70-preflight-current.json'); assert.equal(device.exactApprovedTarget, true); assert.equal(device.model, 'CMM-AL10'); assert.equal(device.api, '26')
  assert.equal(candidate.path, 'D:/Temp/dsh-harmony-mobile-20261016-phase69.1-unsigned.hap')
  const input = await readFile(candidate.path)
  assert.equal(input.length, 5174313); assert.equal(candidate.bytes, input.length)
  assert.equal(hash(input), '47adef3561e01fb19b32472133b20712e62ede72310a574e4d3b1b3675f68e81')
  assert.equal(hash(input), candidate.sha256)
  const marker = await json('.build/phase54-active.json'), previous = await json('evidence/phase65-signed-build.json')
  assert.equal(hash(await readFile(previous.artifact.path)), previous.artifact.sha256)
  const ide = 'D:/Program Files/HuaWei/DevEco Studio', signingProject = 'D:/Temp/dsh-harmony-layout-fix-signing-20261014'
  const configPath = join(signingProject, 'build-profile.json5'), configBytes = await readFile(configPath), config = JSON.parse(configBytes.toString('utf8'))
  const selected = config.app.signingConfigs.find(value => value.name === 'default')
  assert.ok(selected); assert.equal(config.app.products.find(value => value.name === 'default').signingConfig, 'default')
  const material = { ...selected.material }
  for (const key of ['storeFile', 'profile', 'certpath']) material[key] = resolve(signingProject, material[key])
  const profileBytes = await readFile(material.profile)
  assert.equal(hash(profileBytes), hash(await readFile(join(marker.world, 'phase59-signature-verification/profile.p7b'))))
  const directory = resolve('.build/phase70-signature-verification'), signed = join(directory, 'exact-candidate-signed.hap')
  const destination = 'D:/Temp/dsh-harmony-mobile-20261017-phase69.1-signed.hap'
  const attemptPath = 'evidence/phase70-sign-attempt.json', resultPath = 'evidence/phase70-signed-build.json'
  await absent(destination); await absent(resultPath)
  const jar = join(ide, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar')
  assert.equal(hash(await readFile(jar)), (await json('evidence/phase59-pages-info-sdk.json')).officialJarSha256)
  const java = join(ide, 'jbr/bin/java.exe'), env = { PATH: [join(ide, 'jbr/bin'), process.env.SystemRoot + '/System32'].join(delimiter), SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world, USERPROFILE: process.env.USERPROFILE }
  await mkdir(directory, { recursive: true })
  if (!process.argv.includes('--verify-existing')) {
    await absent(signed); await absent(attemptPath)
    stage = 'official-module-load'
    process.env.HVIGOR_USER_HOME = resolve('.build/phase70-sign-sdk-user')
    await mkdir(process.env.HVIGOR_USER_HOME, { recursive: true })
    const plugin = join(ide, 'tools/hvigor/hvigor-ohos-plugin'), require = createRequire(join(plugin, 'package.json'))
    const { DecipherUtil } = require(join(plugin, 'src/utils/decipher-util.js'))
    const { SigningOptionsV2 } = require(join(plugin, 'src/builder/inner-java-command-builder/signing-options-v2.js'))
    await writeFile(attemptPath, JSON.stringify({ at: new Date().toISOString(), authorization: approval.evidence, input: candidate, unknownUntilVerified: true, materialsReused: true, rawArgumentsProjected: false }, null, 2) + '\n', { flag: 'wx' })
    stage = 'official-signing'
    const storePassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.storePassword, configPath)
    const keyPassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.keyPassword, configPath)
    const args = new SigningOptionsV2().sign().addMode('localSign').addKeyStoreFile(material.storeFile).addKeyStorePwd(storePassword).addKeyAlias(material.keyAlias).addKeyPwd(keyPassword).addSignAlg(material.signAlg).addProfileFile(material.profile).addAppCertFile(material.certpath).addInputFile(candidate.path).addOutputFile(signed).addCalledJarFile(jar).build()
    assert.equal(args[0], 'java')
    const result = spawnSync(java, args.slice(1), { env, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 4194304 })
    await writeFile('evidence/phase70-sign-result.json', JSON.stringify({ at: new Date().toISOString(), hostExitCode: result.status, signal: result.signal, processError: result.error?.code ?? null, rawArgumentsProjected: false, rawOutputRetained: false, exactInputSha256: hash(input) }, null, 2) + '\n', { flag: 'wx' })
    assert.equal(result.status, 0)
  } else {
    const attempt = await json(attemptPath)
    assert.equal(attempt.input.sha256, candidate.sha256); await access(signed)
  }
  const verify = args => { const result = spawnSync(java, ['-jar', jar, ...args], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304 }); assert.equal(result.status, 0); return result.status }
  stage = 'verify-app'
  const appCode = verify(['verify-app', '-inFile', signed, '-outCertChain', join(directory, 'certificate-chain.cer'), '-outProfile', join(directory, 'profile.p7b')])
  stage = 'verify-profile'
  const profileCode = verify(['verify-profile', '-inFile', join(directory, 'profile.p7b'), '-outFile', join(directory, 'verified-profile.json')])
  assert.equal(hash(await readFile(join(directory, 'profile.p7b'))), hash(profileBytes))
  stage = 'public-payload-comparison'
  const payloadPath = join(directory, 'public-payload-report.json')
  const payload = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve('scripts/phase59-hap-payload.ps1')], { env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_UNSIGNED_HAP: candidate.path, DSH_SIGNED_HAP: signed, DSH_PUBLIC_PAYLOAD_REPORT: payloadPath }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  assert.equal(payload.status, 0)
  const derived = spawnSync(java, ['-cp', jar, resolve('.build/Phase70PageInfoVerify.java'), candidate.path, signed], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 }); assert.equal(derived.status, 0, 'official SDK page-bitmap regeneration failed'); await writeFile('evidence/phase70-sdk-page-bitmap.json', JSON.stringify({ at: new Date().toISOString(), officialJarSha256: hash(await readFile(jar)), SDKApi: 'Zip.alignment(4096) + PageInfoGenerator.generateBitMap', unsignedInput: candidate.sha256, code: derived.status, output: derived.stdout, signerReexecuted: false, privateKeyAccess: false }, null, 2) + '\n'); const publicPayload = await json(payloadPath), entries = verifyHapEntries(publicPayload.inputEntries, publicPayload.signedEntries, await readFile('.build/phase70-pages-info-derived.bin'))
  assert.equal(publicPayload.metadata.bundleName, 'local.dsh.mobile.offlineproduct')
  assert.equal(publicPayload.metadata.versionCode, 1); assert.equal(publicPayload.metadata.versionName, '0.0.0')
  assert.deepEqual(publicPayload.metadata.permissions, ['ohos.permission.INTERNET'])
  assert.equal(hash(await readFile(candidate.path)), candidate.sha256)
  assert.equal(hash(await readFile(configPath)), hash(configBytes))
  assert.equal(hash(await readFile(previous.artifact.path)), previous.artifact.sha256)
  stage = 'seal-verified-output'
  await copyFile(signed, destination, constants.COPYFILE_EXCL)
  const bytes = await readFile(destination)
  await writeFile('evidence/phase70-public-payload.json', JSON.stringify(publicPayload, null, 2) + '\n', { flag: 'wx' })
  const report = { schema: 'harmony-approved-exact-input-signing/1', authorization: approval.evidence, signingStartedAt: (await json(attemptPath)).at, completedAt: new Date().toISOString(), packageSignerExecutions: 1, verificationRecovery: process.argv.includes('--verify-existing'), inputArtifact: candidate, exactApprovedInputSigned: true, artifact: { path: destination, bytes: bytes.length, sha256: hash(bytes) }, officialJarSha256: hash(await readFile(jar)), officialVerifyAppExitCode: appCode, officialVerifyProfileExitCode: profileCode, ...entries, originalSigningConfigurationUnchanged: true, extractedProfileExactlyMatchesExistingApprovedMaterial: true, metadata: publicPayload.metadata, existingMaterialsReused: true, materialsRegenerated: false, rawSignerOutputProjected: false, privateKeyContentInspected: false, rebuiltCandidate: false, signingProjectSourceChanged: false, predecessorArtifactsUnchanged: true, installed: false, realModels: 0, userProjectOperations: 0 }
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(report))
} catch (error) {
  const failure = { at: new Date().toISOString(), stage, category: error?.code ?? error?.name ?? 'unclassified', messageAndRawOutputRetained: false, automaticSigningRetryAllowed: false }
  await writeFile('evidence/phase70-sign-refusal-' + Date.now() + '.json', JSON.stringify(failure, null, 2) + '\n', { flag: 'wx' })
  console.error(JSON.stringify(failure)); process.exitCode = 1
}

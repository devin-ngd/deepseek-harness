/** Sign the approved current HAP once with the original SDK materials; recovery only verifies the existing output. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire, Module } from 'node:module'
import { access, constants, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const absent = async path => { try { await access(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }; throw new Error('Existing operation state requires review') }
let stage = 'preflight'
try {
  assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--verify-existing')
  assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
  const state = await json('evidence/normal-controls-deployment.json'), candidate = state.candidates.unsignedHap
  assert.equal(state.approval.evidence, 'Sentinel_e2d971bb3abc8191b9b8f261d185e4fb')
  const input = await readFile(candidate.path)
  assert.equal(input.length, 5219655); assert.equal(candidate.bytes, input.length)
  assert.equal(hash(input), 'bc4fb0d6a2a1e99dddbee1997759012a45ae26bbdabd11f5b551cf4994afb316')
  assert.equal(hash(input), candidate.sha256)
  const marker = await json('.build/phase54-active.json')
  const previous = 'D:/Temp/dsh-harmony-mobile-20261017-phase76-signed.hap'
  assert.equal(hash(await readFile(previous)), 'a25381696f7e0c5e88cce5bd6390663df407f940ee422fed1a7d73acb8d42a6a')
  const ide = 'D:/Program Files/HuaWei/DevEco Studio', signingProject = 'D:/Temp/dsh-harmony-layout-fix-signing-20261014'
  const configPath = join(signingProject, 'build-profile.json5'), configBytes = await readFile(configPath), config = JSON.parse(configBytes.toString('utf8'))
  const selected = config.app.signingConfigs.find(value => value.name === 'default')
  assert.ok(selected); assert.equal(config.app.products.find(value => value.name === 'default').signingConfig, 'default')
  const material = { ...selected.material }
  for (const key of ['storeFile', 'profile', 'certpath']) material[key] = resolve(signingProject, material[key])
  const profileBytes = await readFile(material.profile)
  assert.equal(hash(profileBytes), hash(await readFile(join(marker.world, 'phase59-signature-verification/profile.p7b'))))
  const directory = join(state.run, 'signature-verification'), signed = join(directory, 'exact-candidate-signed.hap')
  const destination = 'D:/Temp/dsh-harmony-mobile-normal-controls-signed.hap'
  const attemptPath = 'evidence/normal-controls-sign-attempt.json', resultPath = 'evidence/normal-controls-signed-build.json'
  await absent(destination); await absent(resultPath)
  const jar = join(ide, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar')
  assert.equal(hash(await readFile(jar)), (await json('evidence/phase59-pages-info-sdk.json')).officialJarSha256)
  const java = join(ide, 'jbr/bin/java.exe'), env = { PATH: [join(ide, 'jbr/bin'), process.env.SystemRoot + '/System32'].join(delimiter), SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: state.run, TMP: state.run, USERPROFILE: process.env.USERPROFILE }
  await mkdir(directory, { recursive: true })
  if (!process.argv.includes('--verify-existing')) {
    await absent(signed); await absent(attemptPath)
    stage = 'official-module-load'
    process.env.HVIGOR_USER_HOME = join(state.run, 'sign-sdk-user')
    await mkdir(process.env.HVIGOR_USER_HOME, { recursive: true })
    process.env.NODE_PATH = resolve('.build/native-control-diagnostics-project/node_modules')
    Module._initPaths()
    const plugin = join(ide, 'tools/hvigor/hvigor-ohos-plugin'), require = createRequire(join(plugin, 'package.json'))
    const { DecipherUtil } = require(join(plugin, 'src/utils/decipher-util.js'))
    const { SigningOptionsV2 } = require(join(plugin, 'src/builder/inner-java-command-builder/signing-options-v2.js'))
    await writeFile(attemptPath, JSON.stringify({ at: new Date().toISOString(), authorization: state.approval.evidence, input: candidate, unknownUntilVerified: true, materialsReused: true, rawArgumentsProjected: false }, null, 2) + '\n', { flag: 'wx' })
    stage = 'official-signing'
    const storePassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.storePassword, configPath)
    const keyPassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.keyPassword, configPath)
    const args = new SigningOptionsV2().sign().addMode('localSign').addKeyStoreFile(material.storeFile).addKeyStorePwd(storePassword).addKeyAlias(material.keyAlias).addKeyPwd(keyPassword).addSignAlg(material.signAlg).addProfileFile(material.profile).addAppCertFile(material.certpath).addInputFile(candidate.path).addOutputFile(signed).addCalledJarFile(jar).build()
    assert.equal(args[0], 'java')
    const result = spawnSync(java, args.slice(1), { env, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 4194304 })
    await writeFile('evidence/normal-controls-sign-result.json', JSON.stringify({ at: new Date().toISOString(), hostExitCode: result.status, signal: result.signal, processError: result.error?.code ?? null, rawArgumentsProjected: false, rawOutputRetained: false, exactInputSha256: hash(input) }, null, 2) + '\n', { flag: 'wx' })
    assert.equal(result.status, 0)
  } else {
    assert.equal((await json(attemptPath)).input.sha256, candidate.sha256); await access(signed)
  }
  const verify = args => { const result = spawnSync(java, ['-jar', jar, ...args], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304 }); assert.equal(result.status, 0); return result.status }
  stage = 'verify-app'
  const appCode = verify(['verify-app', '-inFile', signed, '-outCertChain', join(directory, 'certificate-chain.cer'), '-outProfile', join(directory, 'profile.p7b')])
  assert.equal(hash(await readFile(join(directory, 'certificate-chain.cer'))), '83cccc2f34814563cc606e36f8e78b67273a33265fcc2cd56843627d30d46bd9')
  stage = 'verify-profile'
  const profileCode = verify(['verify-profile', '-inFile', join(directory, 'profile.p7b'), '-outFile', join(directory, 'verified-profile.json')])
  assert.equal(hash(await readFile(join(directory, 'profile.p7b'))), hash(profileBytes))
  stage = 'public-payload-comparison'
  const payloadPath = join(directory, 'public-payload-report.json')
  const payload = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve('scripts/phase59-hap-payload.ps1')], { env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_UNSIGNED_HAP: candidate.path, DSH_SIGNED_HAP: signed, DSH_PUBLIC_PAYLOAD_REPORT: payloadPath }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  assert.equal(payload.status, 0)
  const derivedSource = (await readFile('.build/Phase70PageInfoVerify.java', 'utf8')).replaceAll('Phase70PageInfoVerify', 'NormalControlsPageInfoVerify').replace('Path.of(".build/phase70-pages-info-derived.bin")', 'Path.of(args[2])').replace('for (String input : args)', 'for (String input : new String[]{args[0], args[1]})')
  const derivedPath = join(directory, 'NormalControlsPageInfoVerify.java'), bitmapPath = join(directory, 'pages-info-derived.bin')
  await writeFile(derivedPath, derivedSource)
  const derived = spawnSync(java, ['-cp', jar, derivedPath, candidate.path, signed, bitmapPath], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 })
  assert.equal(derived.status, 0, 'official SDK page-bitmap regeneration failed')
  const publicPayload = await json(payloadPath), bitmap = await readFile(bitmapPath)
  const { inputEntries, signedEntries } = publicPayload
  assert.equal(new Set(inputEntries.map(row => row.path)).size, inputEntries.length)
  assert.equal(new Set(signedEntries.map(row => row.path)).size, signedEntries.length)
  const before = new Map(inputEntries.map(row => [row.path, row])), after = new Map(signedEntries.map(row => [row.path, row]))
  assert.equal(before.has('.pages.info'), false)
  for (const row of inputEntries) assert.deepEqual(after.get(row.path), row, 'approved application entry changed')
  const addition = { path: '.pages.info', bytes: bitmap.length, sha256: hash(bitmap) }
  assert.deepEqual(signedEntries.filter(row => !before.has(row.path)), [addition])
  assert.equal(publicPayload.metadata.bundleName, 'local.dsh.mobile.offlineproduct')
  assert.equal(publicPayload.metadata.versionCode, 1); assert.equal(publicPayload.metadata.versionName, '0.0.0')
  assert.deepEqual(publicPayload.metadata.permissions, ['ohos.permission.INTERNET'])
  assert.equal(hash(await readFile(candidate.path)), candidate.sha256)
  assert.equal(hash(await readFile(configPath)), hash(configBytes))
  assert.equal(hash(await readFile(previous)), 'a25381696f7e0c5e88cce5bd6390663df407f940ee422fed1a7d73acb8d42a6a')
  stage = 'seal-verified-output'
  await copyFile(signed, destination, constants.COPYFILE_EXCL)
  const bytes = await readFile(destination)
  const report = { schema: 'harmony-approved-exact-input-signing/1', authorization: state.approval.evidence, signingStartedAt: (await json(attemptPath)).at, completedAt: new Date().toISOString(), packageSignerExecutions: 1, verificationRecovery: process.argv.includes('--verify-existing'), inputArtifact: candidate, exactApprovedInputSigned: true, artifact: { path: destination, bytes: bytes.length, sha256: hash(bytes) }, officialJarSha256: hash(await readFile(jar)), officialVerifyAppExitCode: appCode, officialVerifyProfileExitCode: profileCode, certificateChainSha256: hash(await readFile(join(directory, 'certificate-chain.cer'))), applicationEntriesExactlyMatch: true, applicationEntryCount: inputEntries.length, signingMetadataAddition: addition, pagesInfoSdkDerived: true, originalSigningConfigurationUnchanged: true, extractedProfileExactlyMatchesExistingApprovedMaterial: true, metadata: publicPayload.metadata, existingMaterialsReused: true, materialsRegenerated: false, rawSignerOutputProjected: false, privateKeyContentInspected: false, rebuiltCandidate: false, predecessorArtifactsUnchanged: true, installed: false, realModels: 0 }
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  state.signed = true; state.signedArtifact = report.artifact
  await writeFile('evidence/normal-controls-deployment.json', JSON.stringify(state, null, 2) + '\n')
  console.log(JSON.stringify(report))
} catch (error) {
  const failure = { at: new Date().toISOString(), stage, category: error?.code ?? error?.name ?? 'unclassified', messageAndRawOutputRetained: false, automaticSigningRetryAllowed: false }
  await writeFile('evidence/normal-controls-sign-refusal-' + Date.now() + '.json', JSON.stringify(failure, null, 2) + '\n', { flag: 'wx' })
  console.error(JSON.stringify(failure)); process.exitCode = 1
}

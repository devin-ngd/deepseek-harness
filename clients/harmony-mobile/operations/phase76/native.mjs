/** Exact-input signing and data-retaining install, inactive until the enclosing operator's fresh approval/TTY checks. */
import assert from 'node:assert/strict'
import { copyFile, constants, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, dirname, resolve, delimiter } from 'node:path'
import { PLAN, hash, reviewPhoneState, reviewPrevious, deny } from './policy.mjs'
import { bytes, json, absent, exists, record, run } from './io.mjs'
import { desktopState } from './local.mjs'
const ide = 'D:/Program Files/HuaWei/DevEco Studio', r = PLAN.local.run
const java = join(ide, 'jbr/bin/java.exe'), jar = join(ide, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar')
const hdc = join(ide, 'sdk/default/openharmony/toolchains/hdc.exe'), hdcArgs = ['-p', '-s', '127.0.0.1:8710']
/** @returns the original public signature-verification file beside the selected home; it is outside the synthetic Session world. */
export function originalSigningProfile() {
  return { path: join(dirname(PLAN.local.home), 'phase59-signature-verification/profile.p7b'), sha256: 'b1bde9b3aa532b1236fe99684edeed466bb7efee7798781c24757bd93490c1aa' }
}
/** @param output - AA stdout; process exit0 alone does not establish launch. @param pid - original bundle's post-launch PID. @returns after refusing OS rejection or absent process; never changes keyguard state. */
export function verifyNativeLaunch(output, pid) {
  const code = /Error Code:\s*(\d+)/.exec(output)?.[1]
  if (code !== undefined || /failed to start ability/i.test(output) || !/^\d+$/.test(pid)) deny('native-launch-refused-' + (code ?? 'no-process'))
}
/** @param report - public application ZIP inventory. @param bitmap - independently SDK-derived signer metadata. @returns after comparing every application entry and the single admitted addition. */
export function reviewPayload(report, bitmap) {
  const { inputEntries, signedEntries, metadata } = report
  for (const rows of [inputEntries, signedEntries]) assert.equal(new Set(rows.map(row => row.path)).size, rows.length)
  assert.equal(metadata.bundleName, PLAN.native.bundle); assert.equal(metadata.versionCode, 1); assert.equal(metadata.versionName, '0.0.0'); assert.deepEqual(metadata.permissions, PLAN.native.permissions)
  const input = new Map(inputEntries.map(row => [row.path, row])); assert.equal(input.has('.pages.info'), false)
  const signed = new Map(signedEntries.map(row => [row.path, row])); for (const row of inputEntries) assert.deepEqual(signed.get(row.path), row)
  assert.deepEqual(signedEntries.filter(row => !input.has(row.path)), [{ path: '.pages.info', bytes: bitmap.length, sha256: hash(bitmap) }])
}
async function sdk() { assert.equal(hash(await bytes(jar, 33554432)), 'a434b6747e6c5d0b14e73837a46b39f4816ab25b42d1833d6f767bf867cf616d') }
async function target() {
  const targets = run(hdc, [...hdcArgs, 'list', 'targets']).trim().split(/\r?\n/).filter(value => value && value !== '[Empty]')
  assert.equal(targets.length, 1); assert.ok(hash(targets[0]).startsWith(PLAN.native.targetRef.slice(7)))
  const own = args => run(hdc, [...hdcArgs, '-t', targets[0], 'shell', ...args]).trim()
  assert.equal(own(['param', 'get', 'const.product.model']), PLAN.native.model); assert.equal(own(['param', 'get', 'const.ohos.apiversion']), PLAN.native.api)
  return { token: targets[0], own }
}
async function verifySigned(directory, _location) {
  await sdk(); const attempt = await json(join(r, 'sign-attempt.json')), signed = join(r, 'signed-candidate.hap')
  assert.equal(attempt.inputSha256, PLAN.native.sha256)
  const verifyDirectory = join(r, 'signature-verification-' + Date.now()); await mkdir(verifyDirectory)
  run(java, ['-jar', jar, 'verify-app', '-inFile', signed, '-outCertChain', join(verifyDirectory, 'certificate-chain.cer'), '-outProfile', join(verifyDirectory, 'profile.p7b')])
  run(java, ['-jar', jar, 'verify-profile', '-inFile', join(verifyDirectory, 'profile.p7b'), '-outFile', join(verifyDirectory, 'profile.json')])
  assert.equal(hash(await bytes(join(verifyDirectory, 'certificate-chain.cer'), 1048576)), PLAN.native.certificateChainSha256)
  assert.equal(hash(await bytes(join(verifyDirectory, 'profile.p7b'), 1048576)), attempt.profileSha256)
  const reportPath = join(verifyDirectory, 'payload.json'), bitmapPath = join(verifyDirectory, 'pages-info.bin')
  run(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', join(directory, 'hap-payload.ps1')], { env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_UNSIGNED_HAP: PLAN.native.hap, DSH_SIGNED_HAP: signed, DSH_PUBLIC_PAYLOAD_REPORT: reportPath } })
  run(java, ['-cp', jar, join(directory, 'Phase74PageInfoVerify.java'), PLAN.native.hap, signed, bitmapPath])
  const payload = await json(reportPath), bitmap = await bytes(bitmapPath, 1048576); reviewPayload(payload, bitmap)
  if (await exists(PLAN.native.signedOutput)) assert.equal(hash(await bytes(PLAN.native.signedOutput, 33554432)), hash(await bytes(signed, 33554432)))
  else await copyFile(signed, PLAN.native.signedOutput, constants.COPYFILE_EXCL)
  const data = await bytes(PLAN.native.signedOutput, 33554432), result = { observedAt: Date.now(), path: PLAN.native.signedOutput, bytes: data.length, sha256: hash(data), inputSha256: PLAN.native.sha256, certificateMatched: true, profileMatched: true, applicationEntriesMatched: true, permissions: PLAN.native.permissions }
  if (await exists(join(r, 'signed.json'))) { const previous = await json(join(r, 'signed.json')); assert.equal(previous.sha256, result.sha256); assert.equal(previous.inputSha256, result.inputSha256); return { ...result, verificationOnly: true } }
  await record(join(r, 'signed.json'), result); return result
}
/** @param command - sign, verification-only recovery, install or launch. @param directory - sealed operator directory. @param location - original locator. @param args - fresh public-read receipt for sign/install. @returns public evidence only; unknown attempts cannot be replayed. */
export async function nativeOperation(command, directory, location, args) {
  assert.equal(process.platform, 'win32'); assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
  if (command === 'sign' || command === 'install') {
    assert.equal(args.length, 1); const observation = await json(args[0]); reviewPhoneState(observation, Date.now())
    const raw = (await bytes(observation.documentPath, 32768)).toString('utf8'); assert.equal(hash(raw), observation.documentSha256)
    await reviewPrevious(raw, await desktopState(location), Date.now(), (await bytes(PLAN.local.retainedPublicPath, 32768)).toString('utf8'))
  }
  if (command === 'sign') {
    await sdk(); await absent(join(r, 'sign-attempt.json')); await absent(join(r, 'signed-candidate.hap')); await absent(PLAN.native.signedOutput)
    const input = await bytes(PLAN.native.hap, 33554432); assert.equal(hash(input), PLAN.native.sha256); assert.equal(input.length, PLAN.native.bytes)
    const project = 'D:/Temp/dsh-harmony-layout-fix-signing-20261014', configPath = join(project, 'build-profile.json5'), before = await bytes(configPath, 65536), config = JSON.parse(before.toString('utf8'))
    const selected = config.app.signingConfigs.find(value => value.name === 'default'); assert.ok(selected); assert.equal(config.app.products.find(value => value.name === 'default').signingConfig, 'default')
    const material = { ...selected.material }; for (const key of ['storeFile', 'profile', 'certpath']) material[key] = resolve(project, material[key])
    const originalProfile = originalSigningProfile(), profileSha256 = hash(await bytes(material.profile, 1048576))
    assert.equal(hash(await bytes(originalProfile.path, 1048576)), originalProfile.sha256); assert.equal(profileSha256, originalProfile.sha256)
    const require = createRequire(join(ide, 'tools/hvigor/hvigor-ohos-plugin/package.json'))
    process.env.HVIGOR_USER_HOME = join(r, 'sdk-user'); await mkdir(process.env.HVIGOR_USER_HOME, { recursive: true })
    process.env.NODE_PATH = join(location.clientRoot, '.build/native-control-diagnostics-project/node_modules'); require('node:module').Module._initPaths()
    const plugin = join(ide, 'tools/hvigor/hvigor-ohos-plugin'), { DecipherUtil } = require(join(plugin, 'src/utils/decipher-util.js')), { SigningOptionsV2 } = require(join(plugin, 'src/builder/inner-java-command-builder/signing-options-v2.js'))
    await record(join(r, 'sign-attempt.json'), { at: Date.now(), inputSha256: PLAN.native.sha256, profileSha256, outcome: 'unknown', originalMaterialsOnly: true })
    const storePassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.storePassword, configPath), keyPassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.keyPassword, configPath)
    const args = new SigningOptionsV2().sign().addMode('localSign').addKeyStoreFile(material.storeFile).addKeyStorePwd(storePassword).addKeyAlias(material.keyAlias).addKeyPwd(keyPassword).addSignAlg(material.signAlg).addProfileFile(material.profile).addAppCertFile(material.certpath).addInputFile(PLAN.native.hap).addOutputFile(join(r, 'signed-candidate.hap')).addCalledJarFile(jar).build()
    assert.equal(args[0], 'java')
    run(java, args.slice(1), { timeout: 60000, env: { PATH: [join(ide, 'jbr/bin'), process.env.SystemRoot + '/System32'].join(delimiter), SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: r, TMP: r, USERPROFILE: process.env.USERPROFILE } })
    assert.equal(hash(await bytes(configPath, 65536)), hash(before)); return verifySigned(directory, location)
  }
  if (command === 'verify-sign') return verifySigned(directory, location)
  assert.ok(['install', 'launch', 'launch-existing'].includes(command)); const selected = await target()
  if (command === 'launch-existing') {
    const output = run(hdc, [...hdcArgs, '-t', selected.token, 'shell', 'aa', 'start', '-b', PLAN.native.bundle, '-m', 'entry', '-a', 'EntryAbility'])
    verifyNativeLaunch(output, selected.own(['pidof', PLAN.native.bundle]))
    const result = { observedAt: Date.now(), launchedExisting: true, targetRef: PLAN.native.targetRef, pairingAutomatic: false }; await record(join(r, 'launch-existing-' + Date.now() + '.json'), result); return result
  }
  const signed = await json(join(r, 'signed.json')); assert.equal(signed.path, PLAN.native.signedOutput); assert.equal(hash(await bytes(signed.path, 33554432)), signed.sha256); assert.equal(signed.inputSha256, PLAN.native.sha256)
  assert.equal(signed.certificateMatched, true); assert.equal(signed.profileMatched, true); assert.equal(signed.applicationEntriesMatched, true); assert.deepEqual(signed.permissions, PLAN.native.permissions)
  const raw = selected.own(['bm', 'dump', '-n', PLAN.native.bundle]), bundle = JSON.parse(raw.slice(raw.indexOf('{')))
  assert.equal(bundle.applicationInfo?.bundleName ?? bundle.name, PLAN.native.bundle); assert.equal(bundle.versionCode, 1); assert.equal(bundle.versionName, '0.0.0')
  if (command === 'install') {
    await absent(join(r, 'install-attempt.json')); assert.equal(selected.own(['pidof', PLAN.native.bundle]), '')
    await record(join(r, 'install-attempt.json'), { at: Date.now(), artifact: signed, targetRef: PLAN.native.targetRef, outcome: 'unknown', inPlace: true })
    const output = run(hdc, [...hdcArgs, '-t', selected.token, 'install', '-r', signed.path.replaceAll('/', '\\')], { timeout: 90000 })
    assert.match(output, /install bundle successfully/); const result = { observedAt: Date.now(), installed: true, inPlace: true, dataCleared: false, newPermissions: false, sha256: signed.sha256 }
    await record(join(r, 'install-result.json'), result); return result
  }
  assert.equal((await json(join(r, 'install-result.json'))).installed, true)
  const output = run(hdc, [...hdcArgs, '-t', selected.token, 'shell', 'aa', 'start', '-b', PLAN.native.bundle, '-m', 'entry', '-a', 'EntryAbility'])
  verifyNativeLaunch(output, selected.own(['pidof', PLAN.native.bundle]))
  const result = { observedAt: Date.now(), launched: true, targetRef: PLAN.native.targetRef, identityCreated: false, pairingAutomatic: false }; await record(join(r, 'launch-' + Date.now() + '.json'), result); return result
}

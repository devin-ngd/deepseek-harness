/** Build the unsigned synthetic HAP with an already installed official toolchain; never install dependencies, sign, deploy or start a daemon. */
import { readFile, writeFile, mkdir, stat, realpath, symlink, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join, isAbsolute, delimiter } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { verifyWireFields } from './wire-fields-verify.mjs'
import { auditProductLayout, productLayoutParser } from './product-layout-audit.mjs'
import { verifyNativeJsImports } from './native-js-imports.mjs'

const client = resolve(import.meta.dirname, '..')
const projectArgs = process.argv.slice(2).filter(value => value.startsWith('--project='))
if (projectArgs.length > 1 || projectArgs.some(value => !/^--project=\.build[\\/]native-controls-[A-Za-z0-9_-]+$/.test(value))) throw new Error('Select one isolated native controls compile directory.')
const variantArgs = process.argv.slice(2).filter(value => !value.startsWith('--project='))
if (projectArgs.length > 0 && variantArgs.length > 0) throw new Error('A controls compile directory cannot select a historical variant.')
const variants = new Set(['--network-test', '--crypto-test', '--pairing-test', '--pairing-flow-test', '--paired-product-test', '--product-test', '--first-use-wiring', '--first-use-test', '--identity-presence', '--enrollment-diagnostics', '--enrollment-parser-diagnostics', '--native-util-binding', '--huks-sign-purpose', '--candidate-mobile', '--connection-diagnostics', '--renewal-candidate', '--data-channel-candidate'])
variants.add('--data-channel-order-candidate')
variants.add('--history-candidate')
variants.add('--control-diagnostics-candidate')
if (variantArgs.some(value => !variants.has(value)) || variantArgs.length > 1) throw new Error('Select one declared native build variant.')
const networkTest = process.argv.includes('--network-test')
const cryptoTest = process.argv.includes('--crypto-test')
const pairingTest = process.argv.includes('--pairing-test')
const pairingFlowTest = process.argv.includes('--pairing-flow-test')
const pairedProductTest = process.argv.includes('--paired-product-test')
const productTest = process.argv.includes('--product-test') || projectArgs.length > 0
const firstUseWiring = process.argv.includes('--first-use-wiring')
const identityPresence = process.argv.includes('--identity-presence')
const enrollmentDiagnostics = process.argv.includes('--enrollment-diagnostics')
const enrollmentParserDiagnostics = process.argv.includes('--enrollment-parser-diagnostics')
const nativeUtilBinding = process.argv.includes('--native-util-binding')
const renewalCandidate = process.argv.includes('--renewal-candidate')
const historyCandidate = process.argv.includes('--history-candidate')
const controlDiagnosticsCandidate = process.argv.includes('--control-diagnostics-candidate')
const dataChannelOrderCandidate = process.argv.includes('--data-channel-order-candidate')
const dataChannelCandidate = process.argv.includes('--data-channel-candidate') || dataChannelOrderCandidate
const connectionDiagnostics = process.argv.includes('--connection-diagnostics')
const candidateMobile = process.argv.includes('--candidate-mobile') || connectionDiagnostics || renewalCandidate || dataChannelCandidate || historyCandidate || controlDiagnosticsCandidate
const huksSignPurpose = process.argv.includes('--huks-sign-purpose') || candidateMobile
const firstUseTest = process.argv.includes('--first-use-test') || firstUseWiring || identityPresence || enrollmentDiagnostics || enrollmentParserDiagnostics || nativeUtilBinding || huksSignPurpose
if ([networkTest, cryptoTest, pairingTest, pairingFlowTest, pairedProductTest, productTest, firstUseTest].filter(Boolean).length > 1) throw new Error('Select one isolated native test variant.')
const native = projectArgs.length > 0 ? resolve(client, projectArgs[0].slice('--project='.length)) : join(client, controlDiagnosticsCandidate ? '.build/native-control-diagnostics-project' : historyCandidate ? '.build/native-history-candidate-project' : dataChannelOrderCandidate ? ".build/native-data-channel-order-project" : dataChannelCandidate ? ".build/native-data-channel-project" : renewalCandidate ? '.build/native-renewal-candidate-project' : connectionDiagnostics ? '.build/native-connection-diagnostics-project' : candidateMobile ? '.build/native-candidate-mobile-project' : huksSignPurpose ? '.build/native-huks-sign-purpose-project' : nativeUtilBinding ? '.build/native-util-binding-project' : enrollmentParserDiagnostics ? '.build/native-enrollment-parser-project' : enrollmentDiagnostics ? '.build/native-enrollment-diagnostics-project' : identityPresence ? '.build/native-identity-presence-project' : firstUseWiring ? '.build/native-first-use-wiring-project' : firstUseTest ? '.build/native-first-use-project' : productTest ? '.build/native-offline-product-project' : pairedProductTest ? '.build/native-paired-product-project' : pairingFlowTest ? '.build/native-pairing-flow-project' : pairingTest ? '.build/native-pairing-project' : cryptoTest ? '.build/native-crypto-project' : networkTest ? '.build/native-network-project' : 'harmony')
await verifyWireFields(client, native)
const platform = JSON.parse(await readFile(join(native, 'platform.json'), 'utf8'))
if (!platform.installedToolchainConfirmed || !isAbsolute(platform.installedIdeDirectory ?? '')) {
  throw new Error('Native build requires an explicitly confirmed installed official toolchain.')
}
const ide = platform.installedIdeDirectory
const product = JSON.parse(await readFile(join(ide, 'product-info.json'), 'utf8'))
const sdk = JSON.parse(await readFile(join(ide, 'sdk/default/sdk-pkg.json'), 'utf8')).data
if (product.version !== platform.installedIdeVersion || sdk.version !== platform.installedSdkVersion || Number(sdk.apiVersion) !== platform.installedSdkApi) {
  throw new Error('Installed IDE/SDK differs from the recorded versions; inspect and record it before building.')
}
if (firstUseTest || productTest) auditProductLayout(await productLayoutParser(), await readFile(join(native, 'entry/src/main/ets/pages/Index.ets'), 'utf8'))
const module = JSON.parse(await readFile(join(native, 'entry/src/main/module.json5'), 'utf8'))
const profile = JSON.parse(await readFile(join(native, 'build-profile.json5'), 'utf8'))
const app = JSON.parse(await readFile(join(native, 'AppScope/app.json5'), 'utf8'))
const expectedPermissions = networkTest || firstUseTest || productTest || !cryptoTest && !pairingTest && !pairingFlowTest && !pairedProductTest ? [{ name: 'ohos.permission.INTERNET' }] : []
if (JSON.stringify(module.module.requestPermissions) !== JSON.stringify(expectedPermissions) || profile.app.signingConfigs.length !== 0 || app.app.bundleName !== (productTest || firstUseTest ? 'local.dsh.mobile.offlineproduct' : pairedProductTest ? 'local.dsh.mobile.pairedproductcheck' : pairingFlowTest ? 'local.dsh.mobile.pairingflowcheck' : pairingTest ? 'local.dsh.mobile.pairingcheck' : cryptoTest ? 'local.dsh.mobile.cryptocheck' : networkTest ? 'local.dsh.mobile.netreplay' : 'local.dsh.mobile.lab')) {
  throw new Error('Build accepts only the default permission-free app or the isolated INTERNET-only unsigned replay variant.')
}
const scope = join(native, 'node_modules/@ohos')
await mkdir(scope, { recursive: true })
for (const name of ['hvigor', 'hvigor-ohos-plugin']) {
  const target = join(ide, 'tools/hvigor', name)
  const declared = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
  const expected = name === 'hvigor' ? platform.hvigorVersion : platform.ohosPluginVersion
  if (declared.name !== '@ohos/' + name || declared.version !== expected) throw new Error('Installed Hvigor package version differs: ' + name)
  const link = join(scope, name)
  if (existsSync(link)) {
    if (await realpath(link) !== await realpath(target)) throw new Error('Existing package link points to a different toolchain: ' + name)
  } else await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}
const cache = join(client, controlDiagnosticsCandidate ? '.build/native-control-diagnostics-user' : historyCandidate ? '.build/native-history-candidate-user' : dataChannelOrderCandidate ? ".build/native-data-channel-order-user" : dataChannelCandidate ? ".build/native-data-channel-user" : renewalCandidate ? '.build/native-renewal-candidate-user' : candidateMobile ? '.build/native-candidate-mobile-user' : huksSignPurpose ? '.build/native-huks-sign-purpose-user' : nativeUtilBinding ? '.build/native-util-binding-user' : enrollmentParserDiagnostics ? '.build/native-enrollment-parser-user' : enrollmentDiagnostics ? '.build/native-enrollment-diagnostics-user' : identityPresence ? '.build/native-identity-presence-hvigor-user' : firstUseWiring ? '.build/native-first-use-wiring-hvigor-user' : firstUseTest ? '.build/native-first-use-hvigor-user' : productTest ? '.build/native-offline-product-hvigor-user' : pairedProductTest ? '.build/native-paired-product-hvigor-user' : pairingFlowTest ? '.build/native-pairing-flow-hvigor-user' : pairingTest ? '.build/native-pairing-hvigor-user' : cryptoTest ? '.build/native-crypto-hvigor-user' : networkTest ? '.build/native-network-hvigor-user' : '.build/native-hvigor-user')
const evidenceDir = join(client, 'evidence/native-build')
await mkdir(cache, { recursive: true })
await mkdir(evidenceDir, { recursive: true })
const startedAt = new Date().toISOString()
const label = startedAt.replaceAll(':', '-').replaceAll('.', '-')
const sourceHashes = async () => {
  const hashes = {}
  const collect = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) await collect(file)
      else hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
    }
  }
  for (const directory of ['AppScope', 'entry/src']) await collect(join(native, directory))
  for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'hvigor/hvigor-config.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
    hashes[join(native, file)] = createHash('sha256').update(await readFile(join(native, file))).digest('hex')
  }
  return hashes
}
const inputs = await sourceHashes()
const args = [join(ide, 'tools/hvigor/hvigor/bin/hvigor.js'), '--mode', 'module', '-p', 'module=entry@default',
  '-p', 'product=default', '-p', 'buildMode=debug', '--no-daemon', '--type-check', 'assembleHap']
const env = { PATH: [join(ide, 'tools/node'), join(ide, 'jbr/bin'), join(ide, 'sdk/default/openharmony/toolchains'), process.env.SystemRoot + '/System32'].join(delimiter),
  SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT,
  TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE,
  HVIGOR_USER_HOME: cache, NODE_PATH: join(native, 'node_modules'), DEVECO_SDK_HOME: join(ide, 'sdk'), JAVA_HOME: join(ide, 'jbr') }
const child = spawn(join(ide, 'tools/node/node.exe'), args, { cwd: native, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { const text = chunk.toString(); output += text; process.stdout.write(text) })
const code = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept) })
const inputsUnchangedDuringBuild = JSON.stringify(inputs) === JSON.stringify(await sourceHashes())
// oxlint-disable-next-line no-control-regex -- Compiler ANSI escape sequences must be removed from retained text diagnostics.
const log = output.replace(/\u001b\[[0-9;]*m/g, '').trimEnd() + '\n'
await writeFile(join(evidenceDir, label + '.log'), log)
const packagePath = join(native, 'entry/build/default/outputs/default/entry-default-unsigned.hap')
let nativeJsImportAudit = { passed: false, records: [], failure: 'compile-not-successful' }
if (code === 0) {
  try { nativeJsImportAudit = await verifyNativeJsImports(native, firstUseTest || productTest ? ['ProductCore.js', 'PairedCore.js'] : pairedProductTest ? ['PairedCore.js'] : []) }
  catch (error) { nativeJsImportAudit = { passed: false, records: [], failure: error.message }; console.error('Native JavaScript import audit failed: ' + error.message) }
}
let artifact = null
if (code === 0 && inputsUnchangedDuringBuild && nativeJsImportAudit.passed && existsSync(packagePath)) {
  artifact = { type: 'unsigned HAP', path: packagePath, bytes: (await stat(packagePath)).size,
    sha256: createHash('sha256').update(await readFile(packagePath)).digest('hex'), installableOnDeviceClaimed: false }
}
const evidence = { startedAt, completedAt: new Date().toISOString(), exitCode: code, cwd: native, executable: join(ide, 'tools/node/node.exe'), args,
  toolchain: { ide: product.version, sdk: sdk.version, api: Number(sdk.apiVersion), hvigor: platform.hvigorVersion, plugin: platform.ohosPluginVersion },
  sourceArkTsCompiled: code === 0 && inputsUnchangedDuringBuild && /CompileArkTS.*(?:Finished|UP-TO-DATE)|(?:Finished|UP-TO-DATE).*CompileArkTS/.test(log),
  sourceHashes: inputs, inputsUnchangedDuringBuild, nativeJsImportAudit,
  artifact, daemon: false, signingConfigs: [], requestPermissions: expectedPermissions, pairing: false, desktopConnection: false, networkTest,
  realModelCalls: 0, sessionUploads: 0, simulatorValidated: false, arkWebValidated: false, deviceValidated: false, controlDiagnosticsCandidate, historyCandidate, firstUseTest, identityPresence, enrollmentDiagnostics, enrollmentParserDiagnostics, nativeUtilBinding, huksSignPurpose, candidateMobile, cryptoTest, pairingTest, pairingFlowTest, nativeKeyOperationsExecuted: false,
  ideFirstStartDialogVerified: false }
await writeFile(join(evidenceDir, label + '.json'), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify({ evidence: 'evidence/native-build/' + label + '.json', exitCode: code, artifact }))
process.exitCode = code === 0 && artifact ? 0 : 1

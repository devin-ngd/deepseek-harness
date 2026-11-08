/** Stage a separate unsigned emulator application using the actual native workspace and a fixed loopback fixture. */
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const cipherKeyboard = process.argv.length === 4 && new Set(process.argv.slice(2)).size === 2 && process.argv.slice(2).every(value => ['--cipher', '--keyboard'].includes(value))
const productBuildPath = process.argv[4]?.match(/^--from-build=(evidence\/native-build\/[\w-]+\.json)$/)?.[1]
const exactProductCore = (process.argv.length === 4 || process.argv.length === 5 && productBuildPath !== undefined) && process.argv[2] === '--cipher-diagnostic' && process.argv[3] === '--exact-product-core'
const diagnostic = exactProductCore || process.argv.length === 3 && process.argv[2] === '--cipher-diagnostic'
const cipher = diagnostic || cipherKeyboard || process.argv.length === 3 && process.argv[2] === '--cipher'
const resources = process.argv.length === 3 && process.argv[2] === '--resources'
const focus = process.argv.length === 3 && process.argv[2] === '--keyboard-focus'
const keyboard = cipherKeyboard || focus || process.argv.length === 3 && process.argv[2] === '--keyboard'
assert.ok(process.argv.length === 2 || keyboard || cipher || resources)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const candidate = productBuildPath === undefined ? undefined : JSON.parse(await readFile(productBuildPath, 'utf8'))
let candidateLabel
if (candidate !== undefined) {
  assert.ok(exactProductCore && candidate.exitCode === 0 && candidate.sourceArkTsCompiled && candidate.inputsUnchangedDuringBuild)
  assert.deepEqual(candidate.signingConfigs, [])
  const app = JSON.parse(await readFile(join(candidate.cwd, 'AppScope/app.json5'), 'utf8')).app
  const suffix = app.versionName.match(/^0\.0\.0-rc2\.(\d+)$/)?.[1]; assert.ok(suffix)
  candidateLabel = 'rc2-' + suffix
  assert.equal(candidate.cwd, resolve('.build/native-controls-device-' + candidateLabel))
  assert.equal(app.bundleName, 'local.dsh.mobile.offlineproduct')
  assert.equal(sha(await readFile(candidate.artifact.path)), candidate.artifact.sha256)
  for (const [file, expected] of Object.entries(candidate.sourceHashes)) assert.equal(sha(await readFile(file)), expected, file)
}
const source = candidate?.cwd ?? resolve('harmony')
const target = resolve(candidateLabel ? '.build/native-controls-cipher-diagnostic-' + candidateLabel + '-review' : diagnostic ? '.build/native-controls-cipher-diagnostic-boot-review' : resources ? '.build/native-controls-resource-review' : cipherKeyboard ? '.build/native-controls-cipher-keyboard-review' : cipher ? '.build/native-controls-cipher-review' : focus ? '.build/native-controls-keyboard-focus-review' : keyboard ? '.build/native-controls-keyboard-review' : '.build/native-controls-workspace-review')
const configurationPath = candidateLabel ? '.build/workspace-cipher-diagnostic-' + candidateLabel + '-native-review-configuration.json' : diagnostic ? '.build/workspace-cipher-diagnostic-boot-native-review-configuration.json' : resources ? '.build/workspace-resource-native-review-configuration.json' : cipherKeyboard ? '.build/workspace-cipher-keyboard-native-review-configuration.json' : cipher ? '.build/workspace-cipher-native-review-configuration.json' : focus ? '.build/workspace-focus-native-review-configuration.json' : keyboard ? '.build/workspace-keyboard-native-review-configuration.json' : '.build/workspace-native-review-configuration.json'
let configuration
try { configuration = await readFile(configurationPath, 'utf8') }
catch (error) { if (error.code !== 'ENOENT') throw error }
if (configuration === undefined) { configuration = JSON.stringify({ schema: 'harmony-workspace-native-fixture/1', token: randomBytes(32).toString('hex') }) + '\n'; await writeFile(configurationPath, configuration, { flag: 'wx' }) }
const parsedConfiguration = JSON.parse(configuration)
assert.equal(parsedConfiguration.schema, 'harmony-workspace-native-fixture/1'); assert.match(parsedConfiguration.token, /^[a-f0-9]{64}$/)
const product = JSON.parse(await readFile('product.config.json', 'utf8'))
assert.equal(product.enabled, false); assert.equal(product.core.enabled, false)
if (candidate === undefined) {
  const rebuilt = await promisify(execFile)(process.execPath, ['scripts/build-product-core.mjs', '--report=workspace-native-core-build.json'], { cwd: resolve('.'), windowsHide: true })
  process.stdout.write(rebuilt.stdout)
}
const generated = await readFile(join(source, 'entry/src/main/ets/product/ProductConfiguration.ets'), 'utf8')
const nativeConfiguration = JSON.parse(generated.slice(generated.indexOf(' = ') + 3))
assert.deepEqual(JSON.parse(nativeConfiguration.corePolicyJson), product.core)
await mkdir(target, { recursive: true })
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
  await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file)))
}
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8'))
app.app.bundleName = 'local.dsh.mobile.workspacecheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const ets = join(target, 'entry/src/main/ets'), fixture = join(ets, 'fixture'); await mkdir(fixture, { recursive: true })
if (cipher && !exactProductCore) {
  const corePath = join(ets, 'product/ProductCore.js'), core = await readFile(corePath, 'utf8')
  const catalog = 'catalog: async () => deviceSessionDirectory(await calls.call({ method: "metadata", argument: null }), registration.desktopId),'
  assert.equal(core.split(catalog).length, 2)
  await writeFile(corePath, core.replace(catalog, 'catalog: async () => { try { return deviceSessionDirectory(await calls.call({ method: "metadata", argument: null }), registration.desktopId) } catch (error) { console.error("WORKSPACE_CIPHER_CATALOG_FAILURE " + error.message); throw error } },'))
}
for (const name of [resources ? 'WorkspaceResourceProduct' : cipher ? 'WorkspaceCipherProduct' : 'WorkspaceFixtureProduct', 'WorkspaceReview']) {
  let original = await readFile('integration/native/' + name + '.ets', 'utf8')
  if (resources && name === 'WorkspaceReview') {
    original = original.replaceAll('WorkspaceFixtureProduct', 'WorkspaceResourceProduct')
    const row = original.split('\n').find(line => line.includes("Button('Network')")); assert.ok(row)
    original = original.replace(row, `        Button('Fail root').id('workspace-fixture-root-failure').enabled(!this.busy).onClick(() => this.run(async () => { this.product?.failRoot(); await this.open() }))`)
  }
  if (cipher && name === 'WorkspaceReview') {
    original = original.replaceAll('WorkspaceFixtureProduct', 'WorkspaceCipherProduct')
    original = original.replace('    this.observing = false', '    void this.product?.close().catch((error: Error) => { console.error("WORKSPACE_CIPHER_CLOSE " + error.message) })\n    this.observing = false')
  }
  if (focus && name === 'WorkspaceReview') {
    const row = original.split('\n').find(line => line.includes("Button('Network')")); assert.ok(row)
    original = original.replace(row, `        Button('Focus web').id('workspace-fixture-focus').onClick(() => this.run(async () => { this.owner?.controller.requestFocus(); await this.inspect() }))\n        Button('Activate web').id('workspace-fixture-active').onClick(() => this.run(async () => { this.owner?.controller.onActive(); await this.inspect() }))`)
    const old = 'body:document.body.innerText.slice(0,2500)'; assert.equal(original.split(old).length, 2)
    original = original.replace(old, 'active:(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return{tag:e.tagName,type:e.type,inputMode:e.inputMode,readOnly:e.readOnly,disabled:e.disabled,policy:e.virtualKeyboardPolicy,hasFocus:document.hasFocus(),label:e.getAttribute("aria-label"),bounds:{x:r.x,y:r.y,width:r.width,height:r.height},innerHeight,visualHeight:visualViewport?.height,dpr:devicePixelRatio}})(),body:document.body.innerText.slice(0,400)')
  }
  await writeFile(join(fixture, name + '.ets'), original.replaceAll('../../harmony/entry/src/main/ets/', '../'))
}
const ability = join(ets, 'entryability/EntryAbility.ets'), original = await readFile(ability, 'utf8')
assert.equal(original.split("stage.loadContent('pages/Index'").length, 2)
await writeFile(ability, original.replace("stage.loadContent('pages/Index'", "stage.loadContent('fixture/WorkspaceReview'"))
await writeFile(join(target, 'entry/src/main/resources/base/profile/main_pages.json'), JSON.stringify({ src: ['pages/Index', 'fixture/WorkspaceReview'] }) + '\n')
await writeFile(join(target, 'entry/src/main/resources/rawfile/workspace-fixture.json'), configuration)
const indexPath = join(ets, 'generated/NativeAssetIndex.ets'), index = await readFile(indexPath, 'utf8')
assert.ok(index.endsWith(']\n'))
let extraAssets = `  new NativeAssetEntry('workspace-fixture.json', ${Buffer.byteLength(configuration)}, '${createHash('sha256').update(configuration).digest('hex')}'),\n`
if (resources) {
  const html = await readFile('integration/native/workspace-resource-document.html')
  await writeFile(join(target, 'entry/src/main/resources/rawfile/workspace-resource-document.html'), html)
  extraAssets += `  new NativeAssetEntry('workspace-resource-document.html', ${html.byteLength}, '${createHash('sha256').update(html).digest('hex')}'),\n`
}
await writeFile(indexPath, index.slice(0, -2) + extraAssets + ']\n')
const surfacePath = join(ets, 'product/WorkspaceSurface.ets'), surface = await readFile(surfacePath, 'utf8')
const consoleStart = '.onConsole((event: OnConsoleEvent) => {'
const observedSurface = surface.includes(consoleStart)
  ? surface.replace(consoleStart, consoleStart + ' console.info("WORKSPACE_FIXTURE_CONSOLE " + event.message.getMessage());')
  : surface.replace('.onRenderExited(', '.onConsole((event: OnConsoleEvent) => { console.info("WORKSPACE_FIXTURE_CONSOLE " + event.message.getMessage()); return false }).onRenderExited(')
await writeFile(surfacePath, observedSurface.replace('.onRenderExited(() => this.owner.exited(this.generation))', '.onRenderExited(() => { console.info("WORKSPACE_FIXTURE_RENDER_EXITED"); this.owner.exited(this.generation) })'))
if (cipher && candidate === undefined) {
  const ownerPath = join(ets, 'product/NativeWorkspaceOwner.ets'), owner = await readFile(ownerPath, 'utf8')
  const resourceFailure = "void error\n      response.setResponseCode(502)"
  assert.equal(owner.split(resourceFailure).length, 2)
  await writeFile(ownerPath, owner.replace(resourceFailure, 'console.info("WORKSPACE_FIXTURE_RESOURCE_FAILURE " + String(error).slice(0, 320))\n      response.setResponseCode(502)'))
}
const report = { target, bundleName: app.app.bundleName, fixtureConfiguration: join(target, 'entry/src/main/resources/rawfile/workspace-fixture.json'), productionEntryUnchanged: true,
  projectionRebuilt: candidate === undefined, projectionReport: candidate === undefined ? 'evidence/workspace-native-core-build.json' : undefined,
  productBuildPath, productHapSha256: candidate?.artifact.sha256, workspaceMaxChunkBytes: product.core.workspace.maxChunkBytes,
  productConfigSha256: createHash('sha256').update(await readFile('product.config.json')).digest('hex'),
  keyboardDiagnostics: keyboard, focusDiagnostics: focus, nativeCipher: cipher, resourceDiagnostics: resources, rpcDiagnostics: diagnostic, exactProductCore, installed: false }
await writeFile(candidateLabel ? 'evidence/workspace-cipher-diagnostic-' + candidateLabel + '-native-review-project.json' : diagnostic ? 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json' : resources ? 'evidence/workspace-resource-native-review-project.json' : cipherKeyboard ? 'evidence/workspace-cipher-keyboard-native-review-project.json' : cipher ? 'evidence/workspace-cipher-native-review-project.json' : focus ? 'evidence/workspace-focus-native-review-project.json' : keyboard ? 'evidence/workspace-keyboard-native-review-project.json' : 'evidence/workspace-native-review-project.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

/** Stage the actual native Index with its product provider replaced by a synthetic loopback or local presentation fixture. */
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
const productCoreOption = process.argv[3]?.match(/^--product-core-from=(evidence\/device-native-project-rc2\.\d+\.json)$/)?.[1]
const productBuildOption = process.argv[3]?.match(/^--from-build=(evidence\/native-build\/[\w-]+\.json)$/)?.[1]
const pluginCipher = process.argv[2] === '--plugin-target-cipher' && (process.argv.length === 3 || process.argv.length === 4 && productCoreOption !== undefined)
const exactCreation = process.argv.length === 4 && process.argv[2] === '--cipher' && (productCoreOption !== undefined || productBuildOption !== undefined)
const cipher = pluginCipher || exactCreation || process.argv.length === 3 && process.argv[2] === '--cipher'
const pluginHost = process.argv.length === 3 && process.argv[2] === '--plugin-target-host'
const startupRecovery = process.argv.length === 4 && process.argv[2] === '--startup-recovery' && productCoreOption !== undefined
const pluginTarget = pluginCipher || pluginHost || startupRecovery || process.argv.length === 3 && process.argv[2] === '--plugin-target'
assert.ok(process.argv.length === 2 || cipher || pluginTarget)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const startupVersion = startupRecovery ? productCoreOption.match(/rc2\.(\d+)\.json$/)[1] : undefined
const nativeBuild = exactCreation && productBuildOption !== undefined ? JSON.parse(await readFile(productBuildOption, 'utf8')) : undefined
const creationLabel = !exactCreation ? undefined : nativeBuild === undefined ? 'rc2-' + productCoreOption.match(/rc2\.(\d+)\.json$/)[1]
  : /[/\\]native-controls-device-(rc2-\d+)$/.exec(nativeBuild.cwd)?.[1]
assert.ok(!exactCreation || creationLabel !== undefined)
const source = resolve(creationLabel ? '.build/native-controls-device-' + creationLabel : 'harmony')
const target = resolve(creationLabel ? '.build/native-controls-creation-cipher-' + creationLabel + '-review' : startupRecovery ? '.build/native-controls-workspace-startup-rc2-' + startupVersion : pluginCipher ? '.build/native-controls-plugin-cipher-review' : pluginHost ? '.build/native-controls-plugin-host-review' : pluginTarget ? '.build/native-controls-plugin-review' : cipher ? '.build/native-controls-creation-cipher-review' : '.build/native-controls-creation-review')
let workspaceMaxChunkBytes, productCore
if (nativeBuild !== undefined) {
  assert.ok(nativeBuild.exitCode === 0 && nativeBuild.sourceArkTsCompiled && nativeBuild.inputsUnchangedDuringBuild)
  assert.deepEqual(nativeBuild.signingConfigs, [])
  assert.equal(nativeBuild.cwd, source)
  const app = JSON.parse(await readFile(join(source, 'AppScope/app.json5'), 'utf8')).app
  assert.equal(app.bundleName, 'local.dsh.mobile.offlineproduct')
  assert.equal(app.versionName, '0.0.0-' + creationLabel.replace(/-(\d+)$/, '.$1'))
  assert.equal(sha(await readFile(nativeBuild.artifact.path)), nativeBuild.artifact.sha256)
  for (const [path, digest] of Object.entries(nativeBuild.sourceHashes)) assert.equal(sha(await readFile(path)), digest, path)
} else if (exactCreation) {
  const candidate = JSON.parse(await readFile(productCoreOption, 'utf8'))
  assert.equal(candidate.version, '0.0.0-' + creationLabel.replace(/-(\d+)$/, '.$1'))
  assert.equal(candidate.target, source); assert.equal(candidate.signing, false); assert.equal(candidate.installed, false)
  for (const file of ['entry/src/main/ets/pages/Index.ets', 'entry/src/main/ets/product/NativeWorkspaceOwner.ets', 'entry/src/main/resources/rawfile/workspace-document.js']) {
    const captured = candidate.nativeInputs.find(row => row.path === join(candidate.source, file))
    assert.ok(captured, file); assert.equal(sha(await readFile(join(source, file))), captured.sha256, file)
  }
  const core = candidate.reports.find(row => row.entry === 'src/native-product-facade.ts' && row.output === 'entry/src/main/ets/product/ProductCore.js')
  assert.ok(core); assert.equal(sha(await readFile(join(source, core.output))), core.sha256)
}
if (exactCreation) {
  const config = await readFile(join(source, 'entry/src/main/ets/product/ProductConfiguration.ets'), 'utf8')
  workspaceMaxChunkBytes = JSON.parse(JSON.parse(config.slice(config.indexOf(' = ') + 3)).corePolicyJson).workspace.maxChunkBytes
  assert.ok(workspaceMaxChunkBytes >= 524288)
}
if (pluginCipher) {
  const sealed = JSON.parse(await readFile('evidence/workspace-boot-rc242-validation.json', 'utf8'))
  assert.equal(sealed.version, '0.0.0-rc2.42'); assert.equal(sealed.passed, true)
  const buildReceipt = Object.keys(sealed.references).find(file => file.startsWith('evidence/native-build/'))
  assert.ok(buildReceipt)
  const bytes = await readFile(buildReceipt); assert.equal(sha(bytes), sealed.references[buildReceipt])
  const build = JSON.parse(bytes)
  const corePath = 'entry/src/main/ets/product/ProductCore.js'
  const sealedFiles = ['entry/src/main/ets/pages/Index.ets', 'entry/src/main/ets/product/NativeWorkspaceOwner.ets', corePath, 'entry/src/main/resources/rawfile/workspace-document.js']
  for (const path of sealedFiles.filter(file => file !== corePath)) assert.equal(sha(await readFile(join(source, path))), build.sourceHashes[join(build.cwd, path)], path)
  productCore = await readFile(join(build.cwd, corePath))
  assert.equal(sha(productCore), build.sourceHashes[join(build.cwd, corePath)], corePath)
  if (productCoreOption !== undefined) {
    const receipt = JSON.parse(await readFile(productCoreOption, 'utf8'))
    assert.match(receipt.version, /^0\.0\.0-rc2\.\d+$/)
    assert.equal(receipt.target, resolve('.build/native-controls-device-' + receipt.version.slice(6).replaceAll('.', '-')))
    assert.equal(receipt.signing, false); assert.equal(receipt.installed, false)
    for (const path of sealedFiles.filter(file => file !== corePath)) assert.equal(sha(await readFile(join(receipt.target, path))), build.sourceHashes[join(build.cwd, path)], path)
    const bundle = receipt.reports.find(row => row.entry === 'src/native-product-facade.ts' && row.output === corePath)
    productCore = await readFile(join(receipt.target, corePath)); assert.equal(sha(productCore), bundle?.sha256)
  }
  const configPath = 'entry/src/main/ets/product/ProductConfiguration.ets'
  const policy = async dir => {
    const source = await readFile(join(dir, configPath), 'utf8')
    return JSON.parse(JSON.parse(source.slice(source.indexOf(' = ') + 3)).corePolicyJson)
  }
  const current = await policy(source)
  assert.deepEqual(current, await policy(build.cwd))
  workspaceMaxChunkBytes = current.workspace.maxChunkBytes
  assert.ok(workspaceMaxChunkBytes >= 524288)
}
await mkdir(target, { recursive: true })
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
  await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file)))
}
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8'))
app.app.bundleName = 'local.dsh.mobile.workspacecheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const ets = join(target, 'entry/src/main/ets'), fixture = join(ets, 'fixture'); await mkdir(fixture, { recursive: true })
if (productCore !== undefined) await writeFile(join(ets, 'product/ProductCore.js'), productCore)
const provider = cipher ? 'CreationCipherProduct' : pluginHost ? 'PluginTargetHostProduct' : pluginTarget ? 'PluginTargetFixtureProduct' : 'CreationFixtureProduct'
for (const name of cipher ? ['WorkspaceCipherProduct', provider] : pluginHost || !pluginTarget ? ['WorkspaceFixtureProduct', provider] : [provider]) await writeFile(join(fixture, name + '.ets'), (await readFile('integration/native/' + name + '.ets', 'utf8')).replaceAll('../../harmony/entry/src/main/ets/', '../'))
const indexPath = join(ets, 'pages/Index.ets'), original = await readFile(indexPath, 'utf8')
const declaration = 'private product: NativeProductOwner = new NativeProductOwner(productConfiguration)'
assert.equal(original.split(declaration).length, 2)
if (startupRecovery) {
  const candidate = JSON.parse(await readFile(productCoreOption, 'utf8'))
  assert.equal(candidate.version, '0.0.0-rc2.' + startupVersion)
  assert.equal(candidate.target, resolve('.build/native-controls-device-rc2-' + startupVersion))
  assert.equal(candidate.signing, false); assert.equal(candidate.installed, false)
  for (const file of ['entry/src/main/ets/pages/Index.ets', 'entry/src/main/ets/product/NativeWorkspaceOwner.ets', 'entry/src/main/resources/rawfile/workspace-document.js']) {
    const captured = candidate.nativeInputs.find(row => row.path === join(source, file))
    assert.ok(captured, file)
    assert.equal(sha(await readFile(join(candidate.target, file))), captured.sha256)
    assert.equal(sha(await readFile(join(target, file))), captured.sha256)
  }
}
await writeFile(indexPath, `import { ${provider} } from '../fixture/${provider}'\n` + original.replace(declaration, `private product: NativeProductOwner = new ${provider}(productConfiguration${pluginCipher || startupRecovery ? ', true' : ''})`))
const configurationPath = creationLabel ? '.build/creation-cipher-' + creationLabel + '-native-review-configuration.json' : pluginCipher ? '.build/workspace-plugin-cipher-native-review-configuration.json' : pluginHost ? '.build/workspace-plugin-host-native-review-configuration.json' : pluginTarget ? '.build/workspace-plugin-native-review-configuration.json' : cipher ? '.build/creation-cipher-native-review-configuration.json' : '.build/workspace-native-review-configuration.json'
let configuration
try { configuration = await readFile(configurationPath, 'utf8') }
catch (error) { if ((!cipher && !pluginTarget) || error.code !== 'ENOENT') throw error; configuration = JSON.stringify({ schema: 'harmony-workspace-native-fixture/1', token: randomBytes(32).toString('hex') }) + '\n'; await writeFile(configurationPath, configuration, { flag: 'wx' }) }
const parsed = JSON.parse(configuration); assert.equal(parsed.schema, 'harmony-workspace-native-fixture/1'); assert.match(parsed.token, /^[a-f0-9]{64}$/)
await writeFile(join(target, 'entry/src/main/resources/rawfile/workspace-fixture.json'), configuration)
const assetsPath = join(ets, 'generated/NativeAssetIndex.ets'), assets = await readFile(assetsPath, 'utf8'); assert.ok(assets.endsWith(']\n'))
let extra = `  new NativeAssetEntry('workspace-fixture.json', ${Buffer.byteLength(configuration)}, '${sha(configuration)}'),\n`
if (pluginTarget && !pluginHost && !pluginCipher) {
  const html = await readFile('integration/native/workspace-plugin-target.html')
  await writeFile(join(target, 'entry/src/main/resources/rawfile/workspace-plugin-target.html'), html)
  extra += `  new NativeAssetEntry('workspace-plugin-target.html', ${html.byteLength}, '${sha(html)}'),\n`
}
await writeFile(assetsPath, assets.slice(0, -2) + extra + ']\n')
const report = { target, bundleName: app.app.bundleName, page: 'pages/Index', productionUiSourceSha256: sha(original), dataProviderOverride: provider, nativeCipher: cipher, pluginTarget, pluginHost, pluginCipher, startupRecovery, workspaceMaxChunkBytes, productCoreReceipt: productCoreOption, productBuildPath: productBuildOption, productHapSha256: nativeBuild?.artifact.sha256, productCoreSha256: productCore === undefined ? undefined : sha(productCore), fixtureConfiguration: join(target, 'entry/src/main/resources/rawfile/workspace-fixture.json'), installed: false }
await writeFile(creationLabel ? 'evidence/creation-cipher-' + creationLabel + '-native-review-project.json' : startupRecovery ? 'evidence/workspace-startup-native-review-project.json' : pluginCipher ? 'evidence/workspace-plugin-cipher-native-review-project.json' : pluginHost ? 'evidence/workspace-plugin-host-native-review-project.json' : pluginTarget ? 'evidence/workspace-plugin-native-review-project.json' : cipher ? 'evidence/creation-cipher-native-review-project.json' : 'evidence/creation-native-review-project.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

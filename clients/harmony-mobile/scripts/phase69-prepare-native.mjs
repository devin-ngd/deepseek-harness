/** Preserve phase68 sealed inputs; stage the merged unsigned successor candidate without device or signing IO. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, copyFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve('.'), previous = resolve('.build/native-connection-diagnostics-project'), target = resolve('.build/native-renewal-candidate-project'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const seal = JSON.parse(await readFile('evidence/phase68.2-unsigned-candidate.json', 'utf8')), old = JSON.parse(await readFile(seal.buildEvidence, 'utf8'))
assert.equal(hash(await readFile(seal.path)), seal.sha256)
for (const [path, digest] of Object.entries(old.sourceHashes)) assert.equal(hash(await readFile(path)), digest)
await mkdir(target)
for (const file of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(previous, file), join(target, file), { recursive: true, errorOnExist: true, force: false })
const changed = ['entry/src/main/ets/product/NativeProductOwner.ets', 'entry/src/main/ets/product/ProductCore.d.ts', 'entry/src/main/ets/product/ProductView.ets', 'entry/src/main/ets/pages/Index.ets', 'entry/src/main/resources/base/element/string.json', 'entry/src/main/ets/generated/NativeAssetIndex.ets'], runtime = JSON.parse(await readFile('evidence/phase69-core-build.json', 'utf8'))
for (const entry of runtime.reports) { assert.equal(hash(await readFile(entry.output)), entry.sha256); changed.push(relative(join(root, 'harmony'), resolve(entry.output))) }
for (const file of new Set(changed)) await copyFile(join(root, 'harmony', file), join(target, file))
const profile = JSON.parse(await readFile(join(target, 'build-profile.json5'), 'utf8')), module = JSON.parse(await readFile(join(target, 'entry/src/main/module.json5'), 'utf8')), app = JSON.parse(await readFile(join(target, 'AppScope/app.json5'), 'utf8'))
assert.deepEqual(profile.app.signingConfigs, []); assert.deepEqual(module.module.requestPermissions, [{ name: 'ohos.permission.INTERNET' }]); assert.equal(app.app.bundleName, 'local.dsh.mobile.offlineproduct')
const report = { at: new Date().toISOString(), previous, target, previousUnsignedHash: seal.sha256, changedInputs: await Promise.all([...new Set(changed)].map(async path => ({ path, sha256: hash(await readFile(join(target, path))) }))), signing: false, installation: false, fieldGrant: false, nativeDeviceIo: false, bundle: app.app.bundleName, permissions: module.module.requestPermissions }
await writeFile('evidence/phase69-native-inputs.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

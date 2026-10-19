/** Stage reviewed prior native inputs plus current scoped diagnostics; no signing materials, installation or device IO. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, copyFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve('.'), previous = resolve('.build/native-candidate-mobile-project'), target = resolve('.build/native-connection-diagnostics-project'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const old = JSON.parse(await readFile('evidence/native-build/2026-10-16T10-23-01-338Z.json', 'utf8'))
assert.equal(old.artifact.sha256, 'e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858')
for (const [path, digest] of Object.entries(old.sourceHashes)) assert.equal(hash(await readFile(path)), digest, 'reviewed native source changed: ' + relative(previous, path))
await mkdir(target)
for (const file of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(previous, file), join(target, file), { recursive: true, errorOnExist: true, force: false })
const changed = ['entry/src/main/ets/native/NativeRelaySocket.ets', 'entry/src/main/ets/pages/Index.ets', 'entry/src/main/resources/base/element/string.json', 'entry/src/main/ets/generated/NativeAssetIndex.ets']
const runtime = JSON.parse(await readFile('evidence/phase68-core-build.json', 'utf8'))
for (const entry of runtime.reports) { const bytes = await readFile(entry.output); assert.equal(hash(bytes), entry.sha256); changed.push(relative(join(root, 'harmony'), resolve(entry.output))) }
for (const file of changed) await copyFile(join(root, 'harmony', file), join(target, file))
const profile = JSON.parse(await readFile(join(target, 'build-profile.json5'), 'utf8')), module = JSON.parse(await readFile(join(target, 'entry/src/main/module.json5'), 'utf8')), app = JSON.parse(await readFile(join(target, 'AppScope/app.json5'), 'utf8'))
assert.deepEqual(profile.app.signingConfigs, []); assert.deepEqual(module.module.requestPermissions, [{ name: 'ohos.permission.INTERNET' }]); assert.equal(app.app.bundleName, 'local.dsh.mobile.offlineproduct')
const record = { at: new Date().toISOString(), previous, target, previousUnsignedHash: old.artifact.sha256, changedInputs: await Promise.all(changed.map(async path => ({ path, sha256: hash(await readFile(join(target, path))) }))), signing: false, installation: false, nativeDeviceIo: false, fieldGrant: false, sameBundle: app.app.bundleName, permissions: module.module.requestPermissions }
await writeFile('evidence/phase68-candidate-inputs.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ target, changedInputs: changed.length, signing: false, installation: false }))

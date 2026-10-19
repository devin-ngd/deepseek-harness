/** Stage a separate default-disabled unsigned project, preserving all sealed field candidates and credentials. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const previous = resolve('.build/native-data-channel-order-project'), target = resolve('.build/native-history-candidate-project'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const seal = JSON.parse(await readFile('evidence/phase73.1-unsigned-candidate.json', 'utf8')), build = JSON.parse(await readFile(seal.buildEvidence, 'utf8'))
assert.equal(hash(await readFile(seal.path)), seal.sha256)
for (const [file, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(file)), digest)
await mkdir(target)
for (const file of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(previous, file), join(target, file), { recursive: true, errorOnExist: true, force: false })
const changed = ['entry/src/main/ets/product/NativeProductOwner.ets', 'entry/src/main/ets/product/ProductCore.d.ts', 'entry/src/main/ets/product/ProductCore.js']
for (const file of changed) await copyFile(join('harmony', file), join(target, file))
const profile = JSON.parse(await readFile(join(target, 'build-profile.json5'), 'utf8')), module = JSON.parse(await readFile(join(target, 'entry/src/main/module.json5'), 'utf8'))
assert.deepEqual(profile.app.signingConfigs, []); assert.deepEqual(module.module.requestPermissions, [{ name: 'ohos.permission.INTERNET' }])
assert.equal(hash(await readFile(join(previous, 'entry/src/main/ets/product/ProductConfiguration.ets'))), hash(await readFile(join(target, 'entry/src/main/ets/product/ProductConfiguration.ets'))))
const report = { at: new Date().toISOString(), previous, target, changedInputs: await Promise.all(changed.map(async file => ({ file, sha256: hash(await readFile(join(target, file))) }))), original73_1HapPreserved: true, existingProductConfigPreserved: true, signing: false, installation: false, deviceIo: false, remoteIo: false, realGrantCreated: false, permissions: module.module.requestPermissions }
await writeFile('evidence/phase75-native-inputs.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

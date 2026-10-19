/** Clone the sealed phase75 native sources and replace only control diagnostics/error handling; no signing, device or remote IO. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const previous = resolve('.build/native-history-candidate-project'), target = resolve('.build/native-control-diagnostics-project'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const candidate = JSON.parse(await readFile('evidence/phase75-candidate.json', 'utf8')), build = JSON.parse(await readFile(candidate.native.buildEvidence, 'utf8'))
assert.equal(hash(await readFile(candidate.native.path)), candidate.native.sha256)
for (const [file, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(file)), digest)
await mkdir(target)
for (const file of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(previous, file), join(target, file), { recursive: true, errorOnExist: true, force: false })
const changed = ['entry/src/main/ets/native/NativePairedConnectionOwner.ets', 'entry/src/main/ets/native/NativeRelaySocket.ets', 'entry/src/main/ets/native/NativeDeviceKeys.ets', 'entry/src/main/ets/native/NativeExistingIdentitySigner.ets', 'entry/src/main/ets/paired/PairedCore.d.ts', 'entry/src/main/ets/paired/PairedCore.js']
for (const file of changed) await copyFile(join('harmony', file), join(target, file))
assert.deepEqual(JSON.parse(await readFile(join(target, 'build-profile.json5'), 'utf8')).app.signingConfigs, [])
assert.deepEqual(JSON.parse(await readFile(join(target, 'entry/src/main/module.json5'), 'utf8')).module.requestPermissions, [{ name: 'ohos.permission.INTERNET' }])
assert.equal(hash(await readFile(join(target, 'entry/src/main/ets/product/ProductConfiguration.ets'))), hash(await readFile(join(previous, 'entry/src/main/ets/product/ProductConfiguration.ets'))))
await writeFile('evidence/phase76-native-inputs.json', JSON.stringify({ at: new Date().toISOString(), previous, target, changed: await Promise.all(changed.map(async file => ({ file, before: hash(await readFile(join(previous, file))), after: hash(await readFile(join(target, file))) }))), phase75InputsPreserved: true, permissionsUnchanged: true, signing: false, installation: false, phoneIo: false, remoteIo: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ target, changed: changed.length, originalSourcesPreserved: true }))

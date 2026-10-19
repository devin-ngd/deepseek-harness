/** Verify the actual generated trusted entry and inactive ArkTS host without pretending to compile an SDK program. */
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const bundlePath = 'harmony/entry/src/main/resources/rawfile/trusted-phone-core.js', bundle = await readFile(bundlePath, 'utf8')
assert.match(bundle, /DisabledNativeProvider/)
assert.doesNotMatch(bundle, /MockDeviceRegistry|MockDesktop|SyntheticHost|class NetworkPhone|registerJavaScriptProxy|node:/)
const module = JSON.parse(await readFile('harmony/entry/src/main/module.json5', 'utf8')), platform = JSON.parse(await readFile('harmony/platform.json', 'utf8'))
const preflight = JSON.parse(await readFile('evidence/phase6-native-preflight.json', 'utf8'))
assert.ok(preflight.commands.find(row => row.name === 'node').paths.length > 0, 'Native tool discovery must find the Node executable used by this run')
assert.deepEqual(module.module.requestPermissions, [])
const keys = ['compileSdkVersion', 'compatibleSdkVersion', 'targetSdkVersion', 'hvigorVersion', 'ohosPluginVersion']
if (platform.installedToolchainConfirmed) {
  for (const key of keys) assert.equal(typeof platform[key], 'string')
  const profile = JSON.parse(await readFile('harmony/build-profile.json5', 'utf8'))
  assert.deepEqual(profile.app.signingConfigs, [])
  for (const key of keys.slice(0, 3)) assert.equal(profile.app.products[0][key], platform[key])
} else {
  for (const key of keys) assert.equal(platform[key], null)
  for (const path of ['harmony/build-profile.json5', 'harmony/oh-package.json5']) await assert.rejects(access(path), error => error.code === 'ENOENT')
}
const preview = await readFile('harmony/entry/src/main/ets/components/RichPreview.ets', 'utf8'), provider = await readFile('harmony/entry/src/main/ets/provider/MobileProvider.ets', 'utf8')
assert.match(preview, /javaScriptAccess\(false\)/)
assert.doesNotMatch(preview + provider, /registerJavaScriptProxy|runJavaScript|fetch|http\.createHttp|createWebSocket/)
await writeFile('evidence/native-source-handoff.json', JSON.stringify({ passed: true, layer: 'static generated ESM and inactive native provider checks; compilation evidence is separate', bundlePath, sha256: createHash('sha256').update(bundle).digest('hex'), mockIdentityExcluded: true, liveNetworkImplementationExcluded: true, defaultUnpairedProvider: true, requestPermissions: [], installedToolchainRecorded: platform.installedToolchainConfirmed, sdkVersions: Object.fromEntries(keys.map(key => [key, platform[key]])), arkTsCompiled: false, hapBuilt: false, arkWebQualified: false, actualRuntimeContainer: false }, null, 2) + '\n')
console.log('PASS: trusted entry excludes mock identity/network; unsigned metadata and disabled native provider checked without claiming platform qualification')

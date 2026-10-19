import { projectionTsconfig } from './projection-source.mjs'
/** Bundle only the explicit offline ESM face and generate a closed native resource index; installs nothing. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const config = JSON.parse(await readFile('source.json', 'utf8')), root = resolve(config.dshRoot)
const require = createRequire(resolve(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [resolve(root, 'node_modules/.pnpm')] }))
const policy = JSON.parse(await readFile('harmony/native-policy.json', 'utf8'))
assert.equal(policy.schema, 'dsh-native-offline-policy/1'); assert.equal(policy.nativeHttp.enabled, false); assert.equal(policy.nativeHttp.url, '')
assert.equal(policy.nativeHttpIo.enabled, false); assert.equal(policy.nativeHttpIo.baseUrl, ''); assert.ok(policy.nativeHttpIo.timeoutMs < policy.host.port.timeoutMs)
const raw = 'harmony/entry/src/main/resources/rawfile/', generated = 'harmony/entry/src/main/ets/generated/'
const built = await esbuild.build({ entryPoints: [resolve('src/native-offline-entry.ts')], outfile: resolve(raw, 'native-offline-core.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', tsconfig: await projectionTsconfig(resolve('.'), root), absWorkingDir: root, metafile: true })
assert.ok(Object.keys(built.metafile.inputs).every(path => !/network-phone|node:|llm-provider|credentials|native-identity/.test(path)))
await writeFile(raw + 'native-policy.json', JSON.stringify(policy, null, 2) + '\n')
const placeholder = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'"><title>DSH offline runtime</title>\n'
await writeFile(raw + 'native-runtime-placeholder.html', placeholder)
const resources = []
for (const name of ['native-offline-core.js', 'native-policy.json', 'native-runtime-placeholder.html']) {
  const bytes = await readFile(raw + name)
  assert.ok(bytes.length <= policy.maxResourceBytes)
  resources.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(generated + 'NativeAssetIndex.ets', '/** HAP-owned resource allowlist; generated from local sources, never from guest paths. */\nexport class NativeAssetEntry {\n  name: string\n  bytes: number\n  sha256: string\n  constructor(name: string, bytes: number, sha256: string) { this.name = name; this.bytes = bytes; this.sha256 = sha256 }\n}\nexport const nativeAssets: NativeAssetEntry[] = [\n' + resources.map(row => `  new NativeAssetEntry(${JSON.stringify(row.name)}, ${row.bytes}, ${JSON.stringify(row.sha256)}),`).join('\n') + '\n]\n')
const hashes = {}
for (const path of Object.keys(built.metafile.inputs)) { const absolute = resolve(root, path); hashes[absolute] = createHash('sha256').update(await readFile(absolute)).digest('hex') }
await writeFile(raw + 'native-runtime-source-manifest.json', JSON.stringify({ schema: 'dsh-native-resources/1', mode: 'explicit-offline-synthetic', productionEnabled: false, resources, sourceHashes: hashes, nativeExecuted: false, arkWebQualified: false }, null, 2) + '\n')
console.log('PASS: HAP-owned offline ESM/resource index; production/network entry remains closed; generation is not ArkWeb evidence')

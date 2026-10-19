/** Actual ETS source compiled only with memory SDK substitutes. No real HUKS/network instance is made. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const names = ['NativeDeviceKeys', 'NativeDeviceKeyPolicy', 'NativeCryptoPrimitives', 'NativeExistingIdentitySigner', 'NativePairingPresenter', 'NativePairingConsent']
await writeFile('.build/phase37-native-entry.ts', ['NativeDeviceKeys', 'NativeCryptoPrimitives', 'NativeExistingIdentitySigner', 'NativePairingPresenter', 'NativePairingConsent'].map(name => `export * from '../harmony/entry/src/main/ets/native/${name}.ets';`).join('\n') + "\nexport * from '../tests/helpers/phase37-native-sdk.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase37-native-entry.ts')], outfile: resolve('.build/phase37-native.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'memory-sdk-only', setup(build) { build.onResolve({ filter: /^@kit\./ }, () => ({ path: resolve('tests/helpers/phase37-native-sdk.mjs') })) } }] })
console.log(JSON.stringify({ actualEtsClasses: names, nativeExecution: false, keyGeneration: false, fixtureOnly: true }))

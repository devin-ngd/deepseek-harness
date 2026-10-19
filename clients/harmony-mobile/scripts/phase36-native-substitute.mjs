/** Compile actual new ETS adapters against fake NetworkKit only. Results are not native execution or TLS/HUKS evidence. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await writeFile('.build/phase36-native-entry.ts', "export * from '../harmony/entry/src/main/ets/native/NativePairingConsent.ets';\nexport * from '../harmony/entry/src/main/ets/native/NativeRelaySocket.ets';\nexport * from '../tests/helpers/phase36-native-sdk.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase36-native-entry.ts')], outfile: resolve('.build/phase36-native.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'fake-network-only', setup(build) { build.onResolve({ filter: /^@kit.NetworkKit$/ }, () => ({ path: resolve('tests/helpers/phase36-native-sdk.mjs') })) } }] })
console.log('PASS: actual ETS consent/WSS source with memory SDK substitute; no native execution')

/** Bundle actual native owners with fixed SDK substitutes for tests only; no native execution or installed file mutation. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await writeFile('.build/phase40-native-entry.ts', "export * from '../harmony/entry/src/main/ets/native/NativePairedConnectionOwner.ets';\nexport * from '../tests/helpers/phase40-native-sdk.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase40-native-entry.ts')], outfile: resolve('.build/phase40-native.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'synthetic-kit-only', setup(build) { build.onResolve({ filter: /^@kit\.(NetworkKit|CryptoArchitectureKit|UniversalKeystoreKit|ArkTS)$/ }, () => ({ path: resolve('tests/helpers/phase40-native-sdk.mjs') })) } }] }); console.log('PASS: actual ETS paired owner and shared JS against synthetic SDK only')

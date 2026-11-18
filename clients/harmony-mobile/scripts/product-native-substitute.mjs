/** Actual native product/paired/storage/rich ownership code against test SDK ports; no device or installed application is run. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await writeFile('.build/product-native-entry.ts', `export * from '../harmony/entry/src/main/ets/product/NativeProductOwner.ets';
export * from '../harmony/entry/src/main/ets/product/NativePublicTrustFile.ets';
export * from '../harmony/entry/src/main/ets/product/NativeProductRichOwner.ets';
export * from '../harmony/entry/src/main/ets/product/NativeWorkspaceOwner.ets';
export * from '../harmony/entry/src/main/ets/product/NativeWorkspaceCache.ets';
export * from '../harmony/entry/src/main/ets/product/NativeWorkspaceRich.ets';
export * from '../harmony/entry/src/main/ets/product/NativeWorkspaceRichGuest.ets';
export { NativeDeviceProductFacade } from '../harmony/entry/src/main/ets/product/ProductCore.js';
export * from '../harmony/entry/src/main/ets/native/NativeAssets.ets';
export * from '../harmony/entry/src/main/ets/native/NativeLifecycle.ets';
export * from '../harmony/entry/src/main/ets/native/NativePairedConnectionOwner.ets';
export * from '../harmony/entry/src/main/ets/native/NativeEndpointSelection.ets';
export * from '../harmony/entry/src/main/ets/native/NativeReverseLan.ets';
export * from '../harmony/entry/src/main/ets/native/NativeRelaySocket.ets';
export * from '../tests/helpers/product-native-sdk.mjs';
`)
await esbuild.build({
  entryPoints: [resolve('.build/product-native-entry.ts')], outfile: resolve('.build/product-native.js'), bundle: true,
  format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'],
  tsconfig: await projectionTsconfig(resolve('.'), root),
  plugins: [{ name: 'synthetic-kit-only', setup(build) {
    build.onResolve({ filter: /^@kit\.|^@ohos\.(util|url)$/ }, () => ({ path: resolve('tests/helpers/product-native-sdk.mjs') }))
    build.onResolve({ filter: /\/ProductCore(?:\.js)?$/ }, () => ({ path: resolve('src/native-product-facade.ts') }))
    build.onResolve({ filter: /\/PairedCore(?:\.js)?$/ }, () => ({ path: resolve('src/native-paired-bridge.ts') }))
  } }],
})
console.log('PASS: actual ETS product owners against explicit synthetic SDK ports')

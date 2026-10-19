/** Compile the staged acceptance .ets sources against in-memory SDK substitutes; no SDK executable or network is called. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const source = JSON.parse(await readFile('source.json', 'utf8'))
const require = createRequire(resolve(source.dshRoot, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
await writeFile('.build/phase25-sdk-entry.ts', "export * from './native-network-project/entry/src/main/ets/native/NativeByteStream.ets';\nexport * from './native-network-project/entry/src/main/ets/native/NativeRuntimeOwner.ets';\nexport * from '../tests/helpers/native-sdk-fake.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase25-sdk-entry.ts')], outfile: resolve('.build/phase25-sdk.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'sdk-test-only', setup(build) { build.onResolve({ filter: /^@kit\./ }, () => ({ path: resolve('tests/helpers/native-sdk-fake.mjs') })) } }] })
console.log('PASS: staged acceptance .ets adapters under SDK substitutes only; no native execution')

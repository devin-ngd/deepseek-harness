/** Build the same staged acceptance .ets adapters with SDK substitutes; native execution is excluded. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
const source = JSON.parse(await readFile('source.json', 'utf8'))
const require = createRequire(resolve(source.dshRoot, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
await writeFile('.build/phase27-sdk-entry.ts', "export * from './native-network-project/entry/src/main/ets/native/NativeByteStream.ets';\nexport * from './native-network-project/entry/src/main/ets/native/NativeRuntimeOwner.ets';\nexport * from '../tests/helpers/native-sdk-fake.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase27-sdk-entry.ts')], outfile: resolve('.build/phase27-sdk.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'sdk-test-only', setup(build) { build.onResolve({ filter: /^@kit\./ }, () => ({ path: resolve('tests/helpers/native-sdk-fake.mjs') })) } }] })
await esbuild.build({ entryPoints: [resolve('integration/native-follow-faults.ts')], outfile: resolve('.build/phase27-faults.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', tsconfig: await projectionTsconfig(resolve('.'), source.dshRoot), absWorkingDir: source.dshRoot })
console.log('PASS: phase27 acceptance .ets adapters under SDK substitutes; no native execution')

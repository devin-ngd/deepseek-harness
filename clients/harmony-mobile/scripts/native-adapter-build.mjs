/** Compile plain ArkTS adapters for fault injection with SDK substitutes; this does not qualify native FS, HTTP or ArkWeb execution. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const source = JSON.parse(await readFile('source.json', 'utf8'))
const require = createRequire(resolve(source.dshRoot, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
await mkdir('.build', { recursive: true })
const entry = '.build/native-adapter-entry.ts', native = '../harmony/entry/src/main/ets/native/'
await writeFile(entry, ['NativeCacheFile', 'NativeByteStream', 'NativeHttpIo', 'NativeAssets', 'NativeRuntimeOwner'].map(name => `export * from '${native}${name}.ets';`).join('\n') + "\nexport * from '../tests/helpers/native-sdk-fake.mjs';\n")
await esbuild.build({ entryPoints: [resolve(entry)], outfile: resolve('.build/native-adapters.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets', '.ts', '.mjs', '.js'], plugins: [{ name: 'sdk-test-only', setup(build) { build.onResolve({ filter: /^@kit\./ }, () => ({ path: resolve('tests/helpers/native-sdk-fake.mjs') })) } }] })
console.log('PASS: actual plain .ets adapter sources prepared for SDK-substitute fault injection; no native execution claim')

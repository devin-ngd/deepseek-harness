/** Build current native owners plus a faithful util facade substitute, then run focused refusal, codec and actual-import checks. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
await import('./product-native-substitute.mjs')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await esbuild.build({ entryPoints: [resolve('harmony/entry/src/main/ets/product/ProductCore.js')], outfile: resolve('.build/phase57-util-core-probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', alias: { '@ohos.util': resolve('tests/helpers/product-native-sdk.mjs') } })
await writeFile('.build/phase57-native-codecs-entry.mjs', "export * from '../src/native-protocol-shims.mjs';\nexport { state } from '../tests/helpers/phase57-native-util-sdk.mjs';\n")
await esbuild.build({ entryPoints: [resolve('.build/phase57-native-codecs-entry.mjs')], outfile: resolve('.build/phase57-native-codecs.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', alias: { '@ohos.util': resolve('tests/helpers/phase57-native-util-sdk.mjs') } })
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }, result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/phase57-enrollment-parser.test.mjs', 'tests/phase56-enrollment-lines.test.mjs', 'tests/phase57-native-codecs.test.mjs', 'tests/phase57-native-imports.test.mjs'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 }), output = result.stdout + result.stderr
const sourceHashes = {}; for (const path of ['src/native-protocol-shims.mjs', 'harmony/entry/src/main/ets/product/ProductCore.js', 'harmony/entry/src/main/ets/paired/PairedCore.js', 'harmony/entry/src/main/ets/product/NativeProductOwner.ets', 'scripts/native-js-imports.mjs', 'tests/helpers/product-native-sdk.mjs', 'tests/helpers/phase57-native-util-sdk.mjs']) sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
await writeFile('evidence/phase58-util-tests.log', output); await writeFile('evidence/phase58-util-tests.json', JSON.stringify({ sourceHashes, exitCode: result.status, tests: Number(output.match(/# tests (\d+)/)?.[1]), nativeExecution: false, realModels: 0, phoneKeysTouched: false }, null, 2) + '\n'); console.log(output); if (result.status !== 0) throw new Error('native util binding regression failed')

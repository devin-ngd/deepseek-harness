/** Build actual owner/core with test SDK ports and verify content-free refusal reporting; never writes earlier-phase evidence. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
await import('./product-native-substitute.mjs')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await esbuild.build({ entryPoints: [resolve('harmony/entry/src/main/ets/product/ProductCore.js')], outfile: resolve('.build/phase55-public-core-probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', alias: { '@kit.ArkTS': resolve('tests/helpers/product-native-sdk.mjs') } })
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/phase55-enrollment-diagnostic.test.mjs'], { encoding: 'utf8', windowsHide: true, timeout: 60000 }), output = result.stdout + result.stderr
await writeFile('evidence/phase55-diagnostic-tests.log', output); await writeFile('evidence/phase55-diagnostic-tests.json', JSON.stringify({ exitCode: result.status, tests: Number(output.match(/# tests (\d+)/)?.[1]), nativeExecution: false, realModels: 0, phoneKeysTouched: false }, null, 2) + '\n'); console.log(output); if (result.status !== 0) throw new Error('enrollment diagnostic regression failed')

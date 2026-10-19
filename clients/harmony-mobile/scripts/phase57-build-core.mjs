/** Rebuild both shared native runtime faces using the supported JavaScript SDK module, without writing predecessor evidence. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), reports = []
for (const [entry, output] of [['src/native-product-facade.ts', 'harmony/entry/src/main/ets/product/ProductCore.js'], ['src/native-paired-bridge.ts', 'harmony/entry/src/main/ets/paired/PairedCore.js']]) {
  const built = await esbuild.build({ entryPoints: [resolve(entry)], outfile: resolve(output), bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', external: ['@ohos.util'], inject: [resolve('src/native-protocol-shims.mjs')], tsconfig: await projectionTsconfig(resolve('.'), root), metafile: true })
  const imports = Object.values(built.metafile.outputs).flatMap(row => row.imports); if (imports.some(row => row.path !== '@ohos.util')) throw new Error('unexpected native runtime import')
  const sourceHashes = {}; for (const path of Object.keys(built.metafile.inputs)) sourceHashes[path] = createHash('sha256').update(await readFile(resolve(path))).digest('hex')
  const bytes = await readFile(output); reports.push({ entry, output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceHashes, externalImports: imports.map(row => row.path) })
}
await writeFile('evidence/phase57-util-core-build.json', JSON.stringify({ at: new Date().toISOString(), reports, nativeExecuted: false, webGuestChanged: false }, null, 2) + '\n'); console.log('PASS: both shared native runtime faces rebuilt with default @ohos.util')

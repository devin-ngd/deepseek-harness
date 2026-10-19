/** Generate only the maintained native product facade and phase56 metadata; earlier evidence and installed artifacts remain unchanged. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), output = 'harmony/entry/src/main/ets/product/ProductCore.js'
const built = await esbuild.build({ entryPoints: [resolve('src/native-product-facade.ts')], outfile: resolve(output), bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', external: ['@kit.ArkTS'], inject: [resolve('src/native-protocol-shims.mjs')], tsconfig: await projectionTsconfig(resolve('.'), root), metafile: true })
const sourceHashes = {}; for (const path of Object.keys(built.metafile.inputs)) sourceHashes[path] = createHash('sha256').update(await readFile(resolve(path))).digest('hex')
const bytes = await readFile(output), report = { at: new Date().toISOString(), entry: 'src/native-product-facade.ts', output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceHashes, nativeExecuted: false, diagnosticsOnly: true }
await writeFile('evidence/phase56-parser-core-build.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, bytes: report.bytes, diagnosticsOnly: true }))

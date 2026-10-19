/** Generate a native JS import module from shared TS owners. No Web guest, socket, identity or model is activated. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), output = resolve('harmony/entry/src/main/ets/paired/PairedCore.js')
const built = await esbuild.build({ entryPoints: [resolve('src/native-paired-bridge.ts')], outfile: output, bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', external: ['@kit.ArkTS'], inject: [resolve('src/native-protocol-shims.mjs')], tsconfig: await projectionTsconfig(resolve('.'), root), metafile: true })
if (Object.values(built.metafile.outputs).flatMap(value => value.imports).some(item => item.path !== '@kit.ArkTS')) throw new Error('unexpected native runtime import')
const sourceHashes = {}; for (const path of Object.keys(built.metafile.inputs)) sourceHashes[path] = createHash('sha256').update(await readFile(resolve(path))).digest('hex')
await writeFile('evidence/phase40-native-core.json', JSON.stringify({ generated: 'harmony/entry/src/main/ets/paired/PairedCore.js', bytes: (await readFile(output)).length, sha256: createHash('sha256').update(await readFile(output)).digest('hex'), sourceHashes, external: ['@kit.ArkTS'], nativeExecuted: false, webGuestExposed: false }, null, 2) + '\n'); console.log('PASS: native shared import module generated, with source hashes')

/** Compile actual shared transport for deterministic in-memory frame tests; no profile or network starts. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
const root=JSON.parse(await readFile('source.json','utf8')).dshRoot,require=createRequire(join(root,'package.json')),esbuild=require(require.resolve('esbuild',{paths:[join(root,'node_modules/.pnpm')]}))
await esbuild.build({stdin:{contents:"export { EncryptedRelayConnection } from './integration/e2e-socket.ts'; export { P256SecureChannel, ImportedP256Agreement, nodeE2EPrimitives } from './integration/p256-channel.ts';",resolveDir:resolve('.')},outfile:resolve('.build/phase73-transport.js'),bundle:true,format:'esm',platform:'node',target:'es2022',tsconfig:await projectionTsconfig(resolve('.'),root)})
await writeFile('.build/phase73-transport-ready.json',JSON.stringify({at:new Date().toISOString(),actualSource:true,listener:false,realModels:0})+'\n');console.log('PASS: shared transport compiled for memory-only frame tests')

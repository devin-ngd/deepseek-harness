/** Prepare actual .ets sources with a test-only SDK substitute; no result from this script qualifies native crypto execution. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json','utf8')).dshRoot, require=createRequire(resolve(root,'package.json')), esbuild=require(require.resolve('esbuild',{paths:[resolve(root,'node_modules/.pnpm')]}))
const entry='.build/phase35-native-crypto-entry.ts'
await writeFile(entry,['NativeDeviceKeys','NativeCryptoPrimitives','NativeTransientAgreement'].map(name=>`export * from '../harmony/entry/src/main/ets/native/${name}.ets';`).join('\n')+"\nexport * from '../tests/helpers/phase35-native-sdk.mjs';\n")
await esbuild.build({entryPoints:[resolve(entry)],outfile:resolve('.build/phase35-native-crypto.js'),bundle:true,format:'esm',platform:'node',target:'es2022',loader:{'.ets':'ts'},resolveExtensions:['.ets','.ts','.mjs','.js'],plugins:[{name:'fixture-sdk-only',setup(build){build.onResolve({filter:/^@kit\./},()=>({path:resolve('tests/helpers/phase35-native-sdk.mjs')}))}}]})
const shared=await esbuild.build({entryPoints:[resolve('src/e2e-channel.ts')],outfile:resolve('.build/phase35-browser-channel.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',tsconfig:await projectionTsconfig(resolve('.'),root),metafile:true})
if(Object.keys(shared.metafile.inputs).some(path=>path.includes('p256-channel.ts')||path.includes('device-auth.ts')))throw Error('Host backend entered portable runtime')
await writeFile('evidence/phase35-browser-bundle.json',JSON.stringify({portable:true,inputs:Object.keys(shared.metafile.inputs),hostBackendIncluded:false,nativeExecution:false},null,2)+'\n')
console.log('PASS: ETS SDK-substitute bundle; no actual native crypto or key-store operation')

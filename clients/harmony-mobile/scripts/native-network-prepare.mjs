import { projectionTsconfig } from './projection-source.mjs'
import './wire-fields-generate.mjs'
/** Prepare only the approved INTERNET-only emulator test variant; the default app and installed lab remain untouched. */
import assert from 'node:assert/strict'
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const source=JSON.parse(await readFile('source.json','utf8')),require=createRequire(resolve(source.dshRoot,'package.json'))
const esbuild=require(require.resolve('esbuild',{paths:[resolve(source.dshRoot,'node_modules/.pnpm')]})),destination=resolve('.build/native-network-project'),acceptance=process.argv.includes('--phase17')
async function copy(directory,relative=''){
  for(const item of await readdir(directory,{withFileTypes:true})){
    if(item.isSymbolicLink()||['node_modules','.hvigor','oh_modules','build'].includes(item.name))continue
    const next=join(relative,item.name),output=join(destination,next)
    if(item.isDirectory()){await mkdir(output,{recursive:true});await copy(join(directory,item.name),next)}else await writeFile(output,await readFile(join(directory,item.name)))
  }
}
await mkdir(destination,{recursive:true});await copy('harmony')
const json=async path=>JSON.parse(await readFile(join(destination,path),'utf8'))
const save=async(path,value)=>writeFile(join(destination,path),JSON.stringify(value,null,2)+'\n')
const app=await json('AppScope/app.json5');app.app.bundleName='local.dsh.mobile.netreplay';await save('AppScope/app.json5',app)
const module=await json('entry/src/main/module.json5');module.module.requestPermissions=[{name:'ohos.permission.INTERNET'}];await save('entry/src/main/module.json5',module)
const policy=await json('native-policy.json');assert.equal(policy.nativeHttpIo.enabled,false)
policy.schema='dsh-native-approved-replay-policy/1';policy.host.port.maxPending=16;policy.host.port.timeoutMs=65000;policy.host.chunkBytes=65536;policy.host.maxIntents=512;policy.host.maxFrames=1024;policy.host.follow={mode:'bounded',maxSegments:256,maxFailures:4,retryDelayMs:acceptance?500:100}
Object.assign(policy.nativeHttpIo,{enabled:true,baseUrl:'http://127.0.0.1:18081/',maxStreams:8,timeoutMs:60000,maxChunks:1024,maxQueuedBytes:1048576,maxTotalBytes:4194304})
await save('native-policy.json',policy)
const generated='entry/src/main/ets/generated/',raw='entry/src/main/resources/rawfile/'
await writeFile(join(destination,generated,'NativeBuildMode.ets'),'/** Isolated fixed-replay test variant; installation/start requires its own approval. */\nexport const NATIVE_REPLAY_TEST: boolean = true\nexport const NATIVE_ACCEPTANCE_TEST: boolean = '+acceptance+'\n')
let index=await readFile(join(destination,'entry/src/main/ets/pages/Index.ets'),'utf8')
index=index.replaceAll("'mock-session-a'","'phase11-session'").replaceAll("'mock-session-b'","'phase11-session'")
index=index.replace("util.generateRandomUUID(false), 'Fixed native synthetic task'","'phase13-task', 'Fixed native replay task'")
index=index.replace("        Button($r('app.string.cancel')).fontSize", "        Button($r('app.string.native_fixed_cancel_task')).fontSize(12).layoutWeight(1).enabled(!this.view().readOnly && !this.runtimeBusy).onClick(() => { this.runtime.command('submit', '', 'phase13-cancel', 'Fixed cancellable replay task') })\n        Button($r('app.string.cancel')).fontSize")
for(const [name,key] of Object.entries({native_demo_a:'connect',native_demo_b:'reconnect',native_cache_save:'cache-save',native_cache_restore:'cache-restore',native_disconnect:'disconnect',native_fixed_submit:'fixed-task',native_fixed_cancel_task:'cancel-task',cancel:'cancel'})){
  const text="Button($r('app.string."+name+"'))"
  if(!index.includes(text))throw new Error('Required native control missing: '+name)
  index=index.replace(text,text+".id('dsh-acceptance-"+key+"')")
}
await writeFile(join(destination,'entry/src/main/ets/pages/Index.ets'),index)
const strings=await json('entry/src/main/resources/base/element/string.json')
const replacement={title:'DSH 原生回放联调',native_demo_a:'连接回放',native_demo_b:'重连回放',native_fixed_submit:'固定回放任务',native_fixed_cancel_task:'固定取消任务'}
for(const[name,value]of Object.entries(replacement)){const row=strings.string.find(item=>item.name===name);if(row)row.value=value;else strings.string.push({name,value})}
await save('entry/src/main/resources/base/element/string.json',strings)
const built=await esbuild.build({entryPoints:[resolve(acceptance?'src/native-acceptance-entry.ts':'src/native-replay-entry.ts')],outfile:join(destination,raw,'native-offline-core.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',tsconfig:await projectionTsconfig(resolve('.'), source.dshRoot),absWorkingDir:source.dshRoot,metafile:true})
const code=await readFile(join(destination,raw,'native-offline-core.js'),'utf8')
assert.ok(!code.includes('globalThis.fetch')&&!/\bfetch\(/.test(code));assert.ok(Object.keys(built.metafile.inputs).every(path=>!/node:|native-offline\.ts|host-fixture|llm-provider|credentials/.test(path)))
await writeFile(join(destination,raw,'native-policy.json'),JSON.stringify(policy,null,2)+'\n')
const resources=[]
for(const name of ['native-offline-core.js','native-policy.json','native-runtime-placeholder.html']){const bytes=await readFile(join(destination,raw,name));assert.ok(bytes.length<=policy.maxResourceBytes);resources.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}
const declaration=await readFile('harmony/'+generated+'NativeAssetIndex.ets','utf8'),header=declaration.slice(0,declaration.indexOf('export const nativeAssets'))
await writeFile(join(destination,generated,'NativeAssetIndex.ets'),header+'export const nativeAssets: NativeAssetEntry[] = [\n'+resources.map(row=>`  new NativeAssetEntry(${JSON.stringify(row.name)}, ${row.bytes}, ${JSON.stringify(row.sha256)}),`).join('\n')+'\n]\n')
const hashes={};for(const input of Object.keys(built.metafile.inputs)){const path=resolve(source.dshRoot,input);hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex')}
const manifest={schema:'dsh-native-resources/1',mode:'approved-emulator-fixed-replay',productionEnabled:false,resources,sourceHashes:hashes,nativeExecuted:false,arkWebQualified:false}
await writeFile(join(destination,raw,'native-runtime-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
const evidenceDirectory='evidence/native-variants';await mkdir(evidenceDirectory,{recursive:true})
const evidenceFile=join(evidenceDirectory,new Date().toISOString().replaceAll(':','-').replaceAll('.','-')+'.json')
await writeFile(evidenceFile,JSON.stringify({destination,bundleName:app.app.bundleName,requestPermissions:module.module.requestPermissions,signingConfigs:[],nativeHttpIo:policy.nativeHttpIo,manifest,installed:false,forwardCreated:false},null,2)+'\n',{flag:'wx'})
console.log('PASS: separate INTERNET-only unsigned emulator replay source; default offline app unchanged, no fetch/mock provider')

/** Materialize one independent unsigned device-mode candidate with no installation or activation. */
import assert from 'node:assert/strict'
import {cp,readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {resolve,join,extname} from 'node:path'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {parseArgs} from 'node:util'
import {projectionTsconfig} from './projection-source.mjs'
import {isDeviceLanEndpoint,isDeviceLanPort,isDeviceTailnetAddress} from '../src/device-lan-address.ts'
const {values}=parseArgs({options:{version:{type:'string',default:'0.0.0-rc2.5'},'lan-address':{type:'string'},'lan-port':{type:'string'},'tailnet-address':{type:'string'},rendezvous:{type:'boolean'},'reconnect-ms':{type:'string'},'request-timeout-ms':{type:'string'},'catalog-refresh-ms':{type:'string'},'paged-history':{type:'boolean'},'history-cache':{type:'boolean'}}})
const version=values.version, lanAddress=values['lan-address'], lanPort=values['lan-port'], tailnetAddress=values['tailnet-address']
if(!/^0\.0\.0-rc2\.[0-9]+$/.test(version))throw new Error('Select an explicit local rc.2 candidate version only')
const deviceLan=lanAddress===undefined&&lanPort===undefined&&tailnetAddress===undefined?undefined:{address:lanAddress,port:Number(lanPort),tailnetAddress,inspectNetwork:lanAddress!=='127.0.0.1',rendezvous:values.rendezvous}
if(values.rendezvous&&(lanPort===undefined||lanAddress!==undefined||tailnetAddress!==undefined))throw new Error('Rendezvous requires only the discovery port and cannot embed desktop IP addresses')
if(deviceLan!==undefined&&(!isDeviceLanPort(deviceLan.port)||deviceLan.address!==undefined&&!isDeviceLanEndpoint(deviceLan.address,deviceLan.port)))throw new Error('Supply a LAN port and, optionally, a fixed private IPv4 address')
if(tailnetAddress!==undefined&&(!isDeviceTailnetAddress(tailnetAddress)||lanAddress==='127.0.0.1'))throw new Error('Supply the desktop tailnet IPv4 address for a non-loopback candidate')
function milliseconds(option, fallback) {
  const value=values[option]
  if(value===undefined)return fallback
  const ms=Number(value)
  if(!/^\d+$/.test(value)||!Number.isInteger(ms)||ms<=0||ms>0x7fffffff)throw new Error('Supply positive milliseconds for --'+option)
  return ms
}
const requestTimeoutMs=milliseconds('request-timeout-ms',undefined), catalogRefreshMs=milliseconds('catalog-refresh-ms',5000)
const reconnectMs=milliseconds('reconnect-ms',values.rendezvous?30000:5000)
const label=version.slice('0.0.0-'.length), source=resolve('harmony'), target=resolve('.build/native-controls-device-'+label.replaceAll('.','-'))
await mkdir(target)
for(const directory of ['AppScope','entry/src','hvigor']) await cp(join(source,directory),join(target,directory),{recursive:true,dereference:false,force:false,errorOnExist:true})
for(const file of ['platform.json','build-profile.json5','hvigorfile.ts','oh-package.json5','entry/hvigorfile.ts','entry/build-profile.json5','entry/oh-package.json5']) {await mkdir(resolve(target,file,'..'),{recursive:true});await writeFile(join(target,file),await readFile(join(source,file)))}
const appPath=join(target,'AppScope/app.json5'),app=JSON.parse(await readFile(appPath,'utf8'));app.app.bundleName='local.dsh.mobile.offlineproduct';app.app.versionName=version;app.app.versionCode=2;await writeFile(appPath,JSON.stringify(app,null,2)+'\n')
const config=JSON.parse(await readFile('product.config.json','utf8')); if(config.enabled!==false||config.core.enabled!==false)throw new Error('source must remain disabled')
config.core.transport.timeoutMs=requestTimeoutMs??config.core.transport.timeoutMs
if(values['paged-history'])config.core.pagedHistory=true
if(values['history-cache'])config.deviceHistoryCache={maxBytes:12*1024*1024,maxSessions:8}
Object.assign(config,{deviceBindingMode:true,deviceAutoConnect:true,deviceReconnectMs:reconnectMs,deviceRoutingTtlMs:86400000,deviceCatalogRefreshMs:catalogRefreshMs})
if(deviceLan!==undefined)config.deviceLan=deviceLan
if(deviceLan?.inspectNetwork){
  const modulePath=join(target,'entry/src/main/module.json5'), module=JSON.parse(await readFile(modulePath,'utf8'))
  assert.deepEqual(module.module.requestPermissions,[{name:'ohos.permission.INTERNET'}])
  module.module.requestPermissions.push({name:'ohos.permission.GET_NETWORK_INFO'})
  await writeFile(modulePath,JSON.stringify(module,null,2)+'\n')
}
await writeFile(join(target,'entry/src/main/ets/product/ProductConfiguration.ets'),"/** Independent default-disabled device-mode candidate. */\nimport {NativeProductConfiguration} from './NativeProductOwner'\nexport const productConfiguration: NativeProductConfiguration = "+JSON.stringify({...config,core:undefined,corePolicyJson:JSON.stringify(config.core)},null,2)+'\n')

const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),project=resolve('.'),root=JSON.parse(await readFile('source.json','utf8')).dshRoot,require=createRequire(join(root,'package.json')),esbuild=require(require.resolve('esbuild',{paths:[join(root,'node_modules/.pnpm')]})),tsconfig=await projectionTsconfig(project,root)
const nativeInputs=[]
async function rememberNative(directory){for(const entry of await readdir(join(source,directory),{withFileTypes:true})){const name=join(directory,entry.name);if(entry.isDirectory())await rememberNative(name);else{assert.equal(entry.isSymbolicLink(),false);nativeInputs.push({path:join(source,name),sha256:hash(await readFile(join(source,name)))})}}}
for(const directory of ['AppScope','entry/src','hvigor'])await rememberNative(directory)
for(const name of ['platform.json','build-profile.json5','hvigorfile.ts','oh-package.json5','entry/hvigorfile.ts','entry/build-profile.json5','entry/oh-package.json5','../product.config.json'])nativeInputs.push({path:resolve(source,name),sha256:hash(await readFile(resolve(source,name)))})
// All three bundles consume the same captured bytes; each live input is checked again before sealing.
const captured=new Map(),plugins=[{name:'phone-candidate-source-snapshot',setup(build){build.onLoad({filter:/\.(?:[cm]?js|tsx?|json)$/},async args=>{let bytes=captured.get(args.path);if(bytes===undefined){bytes=await readFile(args.path);captured.set(args.path,bytes)}const extension=extname(args.path).slice(1),loader=extension==='mjs'||extension==='cjs'?'js':extension;return{contents:bytes,loader,resolveDir:resolve(args.path,'..')}})}}],reports=[]
for(const[entry,output,platform]of [['src/native-product-facade.ts','entry/src/main/ets/product/ProductCore.js','neutral'],['src/native-paired-bridge.ts','entry/src/main/ets/paired/PairedCore.js','neutral'],['src/product-rich-document.ts','entry/src/main/resources/rawfile/product-rich-document.js','browser']]){
 const built=await esbuild.build({entryPoints:[resolve(entry)],outfile:join(target,output),bundle:true,platform,format:'esm',target:'es2022',external:platform==='neutral'?['@ohos.util','@ohos.url']:[],inject:platform==='neutral'?[resolve('src/native-protocol-shims.mjs')]:[],tsconfig,plugins,metafile:true})
 const imports=Object.values(built.metafile.outputs).flatMap(value=>value.imports);assert.ok(imports.every(value=>value.path==='@ohos.util'||value.path==='@ohos.url'),'Unexpected native runtime import')
 const bytes=await readFile(join(target,output));reports.push({entry,output,bytes:bytes.length,sha256:hash(bytes),externalImports:imports.map(value=>value.path),inputs:Object.keys(built.metafile.inputs).map(path=>resolve(path))})
}
const resource=reports.find(row=>row.platform==='browser'||row.output.endsWith('product-rich-document.js')),index=join(target,'entry/src/main/ets/generated/NativeAssetIndex.ets'),before=await readFile(index,'utf8')
assert.match(before,/new NativeAssetEntry\('product-rich-document\.js',/)
await writeFile(index,before.replace(/  new NativeAssetEntry\('product-rich-document\.js',[^\n]+/,`  new NativeAssetEntry('product-rich-document.js', ${resource.bytes}, '${resource.sha256}'),`))
await mkdir(join(target,'input-snapshot'))
const sourceInputs=[]
for(const[path,bytes]of captured){const sha256=hash(bytes),snapshot='input-snapshot/'+sha256+extname(path);assert.equal(hash(await readFile(path)),sha256,'Source changed while preparing candidate: '+path);await writeFile(join(target,snapshot),bytes);sourceInputs.push({path,bytes:bytes.length,sha256,snapshot})}
const sdk=resolve(root,'packages/experimental/rich-inline/src/client/guest-sdk.ts');assert.ok(captured.has(sdk),'Candidate must consume the current shared guest SDK')
for(const input of nativeInputs)assert.equal(hash(await readFile(input.path)),input.sha256,'Native input changed while preparing candidate: '+input.path)
const manifest={at:new Date().toISOString(),source,target,version,deviceBindingMode:true,deviceLan,enabled:false,coreEnabled:false,signing:false,installed:false,sourceInputs,nativeInputs,reports,sharedSdk:{path:sdk,sha256:hash(captured.get(sdk))}}
await writeFile(join(target,'input-snapshot/manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
await writeFile('evidence/device-native-project-'+label+'.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(target)

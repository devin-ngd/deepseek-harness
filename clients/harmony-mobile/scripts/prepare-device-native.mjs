/** Materialize one independent unsigned device-mode candidate with no installation or activation. */
import assert from 'node:assert/strict'
import {cp,readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {resolve,join,extname} from 'node:path'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {parseArgs} from 'node:util'
import {projectionTsconfig} from './projection-source.mjs'
const {values}=parseArgs({options:{version:{type:'string',default:'0.0.0-rc2.5'},'paged-history':{type:'boolean'},'history-cache':{type:'boolean'}}})
const version=values.version
if(!/^0\.0\.0-rc2\.[0-9]+$/.test(version))throw new Error('Select an explicit local rc.2 candidate version only')
const label=version.slice('0.0.0-'.length), source=resolve('harmony'), target=resolve('.build/native-controls-device-'+label.replaceAll('.','-'))
await mkdir(target)
for(const directory of ['AppScope','entry/src','hvigor']) await cp(join(source,directory),join(target,directory),{recursive:true,dereference:false,force:false,errorOnExist:true})
for(const file of ['platform.json','build-profile.json5','hvigorfile.ts','oh-package.json5','entry/hvigorfile.ts','entry/build-profile.json5','entry/oh-package.json5']) {await mkdir(resolve(target,file,'..'),{recursive:true});await writeFile(join(target,file),await readFile(join(source,file)))}
const appPath=join(target,'AppScope/app.json5'),app=JSON.parse(await readFile(appPath,'utf8'));app.app.bundleName='local.dsh.mobile.offlineproduct';app.app.versionName=version;app.app.versionCode=2;await writeFile(appPath,JSON.stringify(app,null,2)+'\n')
const config=JSON.parse(await readFile('product.config.json','utf8')); if(config.enabled!==false||config.core.enabled!==false)throw new Error('source must remain disabled')
if(values['paged-history'])config.core.pagedHistory=true
if(values['history-cache'])config.deviceHistoryCache={maxBytes:12*1024*1024,maxSessions:8}
Object.assign(config,{deviceBindingMode:true,deviceAutoConnect:true,deviceReconnectMs:5000,deviceRoutingTtlMs:86400000,deviceCatalogRefreshMs:5000})
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
const manifest={at:new Date().toISOString(),source,target,version,deviceBindingMode:true,enabled:false,coreEnabled:false,signing:false,installed:false,sourceInputs,nativeInputs,reports,sharedSdk:{path:sdk,sha256:hash(captured.get(sdk))}}
await writeFile(join(target,'input-snapshot/manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
await writeFile('evidence/device-native-project-'+label+'.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(target)

/** Reproduce retained public-route capacity with fixed keys and memory storage; no device or model access. */
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawn} from 'node:child_process'
const project=resolve('.'),root=JSON.parse(await readFile('source.json','utf8')).dshRoot,require=createRequire(join(root,'package.json')),esbuild=require(require.resolve('esbuild',{paths:[join(root,'node_modules/.pnpm')]}))
const world=await mkdtemp(resolve('.build/route-history-'))
await esbuild.build({stdin:{contents:"export {DeviceRouteOwner} from './src/device-route-owner.ts';export {ProductRouteStorage} from './src/product-route-storage.ts';export {desktopKey,phoneKey,fixtureSource} from './integration/phase39-fixture.ts';export {nodeE2EPrimitives} from './integration/p256-channel.ts';export {deviceBindingBytes} from './src/device-binding-protocol.ts';export {deviceGrantOperations} from './src/device-operations.ts';",resolveDir:project},outfile:join(world,'api.mjs'),bundle:true,platform:'node',format:'esm',target:'node22'})
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(env,{DSH_ROUTE_HISTORY_MODULE:join(world,'api.mjs'),TEMP:world,TMP:world})
const child=spawn(process.execPath,['--test','--test-reporter=tap','tests/route-history-capacity.test.mjs'],{cwd:project,windowsHide:true,env,stdio:['ignore','pipe','pipe']})
let log='',timedOut=false;for(const s of[child.stdout,child.stderr])s.on('data',b=>{log+=b.toString('utf8')})
const timer=setTimeout(()=>{timedOut=true;child.kill()},60000)
const code=await new Promise((yes,no)=>{child.once('error',no);child.once('close',yes)}).finally(()=>clearTimeout(timer))
await writeFile(join(world,'test.tap'),log)
const count=n=>Number(log.match(new RegExp('^# '+n+' (\\d+)','m'))?.[1]??0),result={at:new Date().toISOString(),code,timedOut,tests:{passed:count('pass'),failed:count('fail')},world,network:false,installed:false,realKeys:false}
const evidence='evidence/route-history-'+Date.now()+'.json';await writeFile(evidence,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...result,evidence}));if(code!==0)console.error(log.slice(-5500));process.exitCode=code===0&&count('pass')>0&&!timedOut?0:1

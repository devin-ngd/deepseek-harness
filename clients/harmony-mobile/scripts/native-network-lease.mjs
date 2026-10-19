/** Inactive command owner for the approved single emulator reverse forward; launch only after protocol approval and task-owned emulator startup. */
import {spawn} from 'node:child_process'
import {readFile,writeFile,rename} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {createConnection} from 'node:net'
import {auditEmulatorMetadata} from './emulator-metadata-audit.mjs'
import {nativePreparationBudget} from './native-window-policy.mjs'

const world=resolve(process.argv[2]??'')
const resumeAt=process.argv.indexOf('--resume-window'),resumeWorld=resumeAt<0?null:resolve(process.argv[resumeAt+1]??'')
let originalLease
if(resumeWorld){
  const approved=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE,matching=approved==='approved-phase18'&&resumeWorld.startsWith('D:\\Temp\\dsh-harmony-phase18-native-')&&world.startsWith('D:\\Temp\\dsh-harmony-phase18-native-')||approved==='approved-phase20'&&resumeWorld.startsWith('D:\\Temp\\dsh-harmony-phase20-native-')&&world.startsWith('D:\\Temp\\dsh-harmony-phase20-native-')
  const seventhMatching=approved==='approved-phase24'&&resumeWorld.startsWith('D:\\Temp\\dsh-harmony-phase24-native-')&&world.startsWith('D:\\Temp\\dsh-harmony-phase24-native-')
  const eighthMatching=approved==='approved-phase26'&&resumeWorld.startsWith('D:\\Temp\\dsh-harmony-phase26-native-')&&world.startsWith('D:\\Temp\\dsh-harmony-phase26-native-')
  const ninthMatching=approved==='approved-phase28'&&resumeWorld.startsWith('D:\\Temp\\dsh-harmony-phase28-native-')&&world.startsWith('D:\\Temp\\dsh-harmony-phase28-native-')
  if(!matching&&!seventhMatching&&!eighthMatching&&!ninthMatching)throw new Error('Only the same matching approved window may resume')
  originalLease=JSON.parse(await readFile(join(resumeWorld,'forward-lease.json'),'utf8'))
  const priorCleanup=JSON.parse(await readFile(join(resumeWorld,'forward-cleanup.json'),'utf8'))
  if((originalLease.mappingActivations??1)>=3||priorCleanup.failure!==null||!priorCleanup.cleanup.every(row=>row.ok)||Date.now()>=Date.parse(originalLease.cleanupAt))throw new Error('Original cleanup or remaining window does not permit bounded continuation')
}
const sixth=world.startsWith('D:\\Temp\\dsh-harmony-phase22-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase22'
const ninth=world.startsWith('D:\\Temp\\dsh-harmony-phase28-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase28'
const eighth=world.startsWith('D:\\Temp\\dsh-harmony-phase26-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase26'
const seventh=world.startsWith('D:\\Temp\\dsh-harmony-phase24-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase24'
const legacy=world.startsWith('D:\\Temp\\dsh-harmony-phase13-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase13'
const second=world.startsWith('D:\\Temp\\dsh-harmony-phase16-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase16'
const next=world.startsWith('D:\\Temp\\dsh-harmony-phase17-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase17'||world.startsWith('D:\\Temp\\dsh-harmony-phase18-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase18'||world.startsWith('D:\\Temp\\dsh-harmony-phase20-native-')&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase20'
if(!legacy&&!second&&!next&&!sixth&&!seventh&&!eighth&&!ninth)throw new Error('Approved task-owned phase13 world required (or an explicitly approved native round)')
try { await readFile(join(world,'forward-lease.json'),'utf8'); throw new Error('Existing forwarding lease must not reset its original window') }
catch(error) { if(error.code!=='ENOENT')throw error }
const marker=JSON.parse(await readFile(join(world,'emulator-owner.json'),'utf8'))
if(marker.instance!=='DSHOfflineAPI26'||!(marker.target==='127.0.0.1:16311'||(second||next||sixth||seventh||eighth||ninth)&&marker.target==='127.0.0.1:5555'&&marker.verifiedActualProcess===true)||marker.emulatorStartedByTask!==true)throw new Error('Task-owned running emulator required')
if((next||sixth||seventh||eighth||ninth)&&marker.netreplayInitiallyAbsent!==true)throw new Error('Independent acceptance bundle absence must be verified before creating a lease')
const state=JSON.parse(await readFile(join(world,'state.json'),'utf8')),url=new URL(state.url)
if(!state.ready||url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!Number.isInteger(Number(url.port))||Number(url.port)<1||Number(url.port)>65535)throw new Error('Exact ephemeral loopback carrier required')
const hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',emulator='D:/Program Files/HuaWei/DevEco Studio/tools/emulator/Emulator.exe'
const connection=['-p','-s','127.0.0.1:8710','-t',marker.target],rule='tcp:18081 tcp:'+url.port,records=[]
const run=async(exe,args,expectedMissingBundle=false)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',overflow=false
  const append=bytes=>{if(output.length+bytes.length>131072){overflow=true;child.kill();return}output+=bytes.toString('utf8')}
  child.stdout.on('data',append);child.stderr.on('data',append)
  const timer=setTimeout(()=>child.kill(),15000)
  const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))}).finally(()=>clearTimeout(timer))
  const record={at:new Date().toISOString(),exe,args,...result,output,overflow};records.push(record)
  if(result.code!==0||result.signal||overflow)throw new Error('Native test command failed: '+args.join(' '))
  if(!expectedMissingBundle&&/^(?:\[(?:Fail|Error)\]|error:)/im.test(output))throw new Error('Native test command reported failure: '+args.join(' '))
  return output
}
const save=async(name,value)=>writeFile(join(world,name),JSON.stringify(value,null,2)+'\n')
const refused=port=>new Promise((accept,reject)=>{
  const socket=createConnection({host:'127.0.0.1',port}),timer=setTimeout(()=>{socket.destroy();reject(new Error('Listener closure unknown'))},1000)
  socket.once('connect',()=>{clearTimeout(timer);socket.destroy();reject(new Error('Owned listener remains active'))})
  socket.once('error',error=>{clearTimeout(timer);socket.destroy();if(error.code==='ECONNREFUSED')accept(true);else reject(error)})
})
let startedAt,expiresAt,cleanupAt,monotonicStarted,failure,created=false,proceed=true
await writeFile(join(world,'resource-owner.json'),JSON.stringify({pid:process.pid,prewindow:process.argv.includes('--prewindow'),target:marker.target,startedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'})
try{
  const preparation=nativePreparationBudget(originalLease,{wall:Date.now,monotonic:()=>performance.now()})
  if(process.argv.includes('--prewindow')){
    for(;;){
      preparation.requireTime()
      try{await readFile(join(world,'cleanup.request'),'utf8');proceed=false;break}catch(error){if(error.code!=='ENOENT')throw error}
      try{await readFile(join(world,'window.open.request'),'utf8');break}catch(error){if(error.code!=='ENOENT')throw error}
      await delay(250)
    }
  }
  if(proceed){
  preparation.requireTime()
  const before=await run(hdc,[...connection,'fport','ls'])
  if(before.includes('tcp:18081'))throw new Error('Emulator test port already has a forward; preserve existing task')
  preparation.requireTime()
  startedAt=originalLease?Date.parse(originalLease.startedAt):Date.now();expiresAt=originalLease?Date.parse(originalLease.expiresAt):startedAt+1800000;cleanupAt=expiresAt-180000;monotonicStarted=performance.now()-Math.max(0,Date.now()-startedAt)
  await writeFile(join(world,'forward-lease.json'),JSON.stringify({startedAt:new Date(startedAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),cleanupAt:new Date(cleanupAt).toISOString(),rule,maximumMs:1800000,activationCount:1,before,ownerPid:process.pid,resumedFrom:resumeWorld,mappingActivations:originalLease?(originalLease.mappingActivations??1)+1:1,originalRule:originalLease?.originalRule??originalLease?.rule??rule},null,2)+'\n',{flag:'wx'})
  created=true
  await run(hdc,[...connection,'rport','tcp:18081','tcp:'+url.port])
  const tasks=await run(hdc,[...connection,'fport','ls']);if(!tasks.includes(rule))throw new Error('Exact reverse forward not confirmed')
  await save('forward-active.json',{active:true,rule,tasks,at:new Date().toISOString()})
  while(Date.now()<cleanupAt&&performance.now()-monotonicStarted<1620000){try{await readFile(join(world,'cleanup.request'),'utf8');break}catch(error){if(error.code!=='ENOENT')throw error}await delay(250)}
  }
}catch(error){failure=error}
finally{
  const cleanup=[]
  const attempt=async(name,operation)=>{try{const result=await operation();cleanup.push({name,ok:true,result})}catch(error){cleanup.push({name,ok:false,error:error.message});failure??=error}}
  if(created)await attempt('remove-exact-forward',()=>run(hdc,[...connection,'fport','rm',...rule.split(' ')]))
  await attempt('verify-forward-removed',async()=>{const tasks=await run(hdc,[...connection,'fport','ls']);if(tasks.includes(rule))throw new Error('Forward still present');return tasks})
  await attempt('close-owned-carrier',async()=>{const temporary=join(world,'control.next.json');await save('control.next.json',{seq:Date.now(),operation:'close'});await rename(temporary,join(world,'control.json'));for(let count=0;count<80;count++){try{const exit=JSON.parse(await readFile(join(world,'exit.json'),'utf8'));return exit}catch(error){if(error.code!=='ENOENT')throw error}await delay(250)}throw new Error('Service owner exit not confirmed')})
  await attempt('verify-carrier-listener-closed',()=>refused(Number(url.port)))
  let uninstallConfirmed=false
  await attempt('uninstall-independent-variant',async()=>{const result=await run(hdc,[...connection,'uninstall','local.dsh.mobile.netreplay']);if(!result.includes('uninstall bundle successfully.'))throw new Error('Variant uninstall reply unknown');uninstallConfirmed=true;return result})
  await attempt('verify-variant-absent',async()=>{const result=await run(hdc,[...connection,'shell','bm','dump','-n','local.dsh.mobile.netreplay'],true);const absent=/bundle[^\r\n]*(?:does not exist|not exist|not found)/i.test(result)||result.trim()==='error: failed to get information and the parameters may be wrong.';if(!uninstallConfirmed||!absent)throw new Error('Variant removal unknown; inspect scoped bm result');return{uninstallConfirmed,scopedPostUninstall:result}})
  const licenseRequest={installedDirectory:'D:/Program Files/HuaWei/DevEco Studio/tools/emulator',licenseFile:'C:/Users/wpdev/AppData/Local/Huawei/Emulator26.0/.emu_config'}
  await attempt('license-before-stop',async()=>{const result=await auditEmulatorMetadata(licenseRequest);await save('license-before-stop.json',result);return result.license})
  await attempt('stop-owned-emulator',()=>run(emulator,['-stop','DSHOfflineAPI26','-instancePath','D:/Temp/dsh-harmony-hvd-api26-20261011','-imageRoot','D:/Temp/dsh-harmony-images-api26-20261011']))
  await attempt('license-after-stop',async()=>{const result=await auditEmulatorMetadata(licenseRequest);await save('license-after-stop.json',result);return result.license})
  await attempt('verify-emulator-port-closed',async()=>{for(let count=0;count<40;count++){try{return await refused(Number(marker.target.split(':')[1]))}catch(error){if(error.message!=='Owned listener remains active')throw error}await delay(250)}throw new Error('Owned emulator listener did not close')})
  await save('forward-cleanup.json',{startedAt:startedAt===undefined?null:new Date(startedAt).toISOString(),expiresAt:expiresAt===undefined?null:new Date(expiresAt).toISOString(),completedAt:new Date().toISOString(),deadlineExceeded:expiresAt!==undefined&&Date.now()>expiresAt,windowOpened:created,rule,cleanup,records,failure:failure?.message??null})
}
if(failure)throw failure

/** Inactive finite native UI driver. Default prints the plan; --execute requires a new approved, already-owned unexpired lease. */
import {readFile,writeFile,rename,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {NativeAcceptanceFailure,NativeWindowClock,retryNativeRead,reconcileNativeCase,runIsolatedNativeCases,settleNativeCleanup,nativeWindowPreconditions,nativeControlStatus,observeNativeCheckpointText,sdkFailure} from './native-window-policy.mjs'
import {observeNativeCheckpointProof} from './native-checkpoint-proof.mjs'

const plan=['connect and fixed task; fixture auto-submits one form/action','save cache → disconnect → restore readonly → reconnect','fourth hang → native cancel','same-port service reopen → old mount rejected before forwarding → repeat task receipt','native socket reset and automatic read recovery','invalid/truncated JSON, unknown required event, cursor gap/conflict; readonly UI and zero dispatch','four socket resets exhaust read budget; readonly UI','request exact owned cleanup and retain failed outcomes']
const allScenarios=[{name:'socket reset automatic recovery',fault:'transport-reset'},...['invalid-json','truncated-json','unknown-required','cursor-gap','cursor-conflict'].map(fault=>({name:fault,fault})),{name:'native read recovery budget exhaustion',fault:'recovery-budget'}]
const ninth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase28'
const eighth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase26'
const seventh=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase24'
const sixth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase22'
const checkpointProof=process.argv.includes('--checkpoint-proof')
if((ninth||eighth)&&!checkpointProof)throw Error('Checkpoint window requires sealed checkpoint proof mode')
const scenarios=(ninth||eighth)?allScenarios.filter(row=>row.fault==='transport-reset'):seventh&&process.argv.includes('--socket-only')?allScenarios.filter(row=>row.fault==='transport-reset'):(sixth||seventh||eighth||ninth)?allScenarios.filter(row=>['transport-reset','cursor-gap','cursor-conflict'].includes(row.fault)):allScenarios
if(!process.argv.includes('--execute')){console.log(JSON.stringify({inactive:true,deviceCommands:0,forwardingCreated:false,plan,faultScenarios:scenarios.map(row=>row.name),expectedMinutes:12,driverMaximumMinutes:20},null,2));process.exit(0)}
const fifth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase20',phase=ninth?'28':eighth?'26':seventh?'24':sixth?'22':fifth?'20':'18'
if(process.env.DSH_HARMONY_NATIVE_ACCEPTANCE!=='approved-phase'+phase)throw Error('New explicit phase18 approval required; or the separately approved fifth phase20 window')
const world=resolve(process.argv[2]??'')
if(!world.startsWith('D:\\Temp\\dsh-harmony-phase'+phase+'-native-')||process.platform!=='win32')throw Error('Exact matching owned Windows approved world required')
const json=async path=>JSON.parse(await readFile(path,'utf8'))
const lease=await json(join(world,'forward-lease.json')),marker=await json(join(world,'emulator-owner.json'))
if(lease.maximumMs!==1800000||lease.activationCount!==1||Date.now()>=Date.parse(lease.cleanupAt)||marker.instance!=='DSHOfflineAPI26'||marker.emulatorStartedByTask!==true||marker.verifiedActualProcess!==true||marker.netreplayInitiallyAbsent!==true||!['127.0.0.1:5555','127.0.0.1:16311'].includes(marker.target))throw Error('Fresh owned lease/start/initial bundle absence not established')
const hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',emulator='D:/Program Files/HuaWei/DevEco Studio/tools/emulator/Emulator.exe',connection=['-p','-s','127.0.0.1:8710','-t',marker.target]
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,windir:process.env.windir,PATHEXT:process.env.PATHEXT,TEMP:'D:/Temp',TMP:'D:/Temp'},records=[],steps=[],readRetries=[],artifacts=[]
const driverStarted=Date.now()
let anchor,budget,deadline
let pid,failed,hap,lastFixtureState,caseExpiryBaseline=null
const expiryFailures=[]
async function expiryFailure(){
  const state=await control('status'),last=state.commandExpiry?.last,records=state.commandAudit?.records??[]
  const diagnostic={at:new Date().toISOString(),last,commandClock:state.commandClock??'unreported',records:records.filter(row=>row.outcome==='elapsed'||row.outcome==='future-limit'),faults:state.faults}
  expiryFailures.push(diagnostic);await writeFile(join(world,'expiry-failure-'+Date.now()+'.json'),JSON.stringify(diagnostic,null,2)+'\n')
  throw new NativeAcceptanceFailure('request-expired-'+(last?.reason??'unclassified'),'case-observation')
}
async function rawRun(exe,args,readOnly=false){
  budget.requireTime()
  const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',overflow=false
  for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{if(Buffer.byteLength(output)+bytes.length>4194304){overflow=true;child.kill();return}output+=bytes.toString()})
  const timer=setTimeout(()=>child.kill(),15000),exit=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))}).finally(()=>clearTimeout(timer))
  records.push({at:new Date().toISOString(),exe,args,...exit,overflow,output})
  if(exit.code!==0||exit.signal||overflow||/^(?:\[(?:Fail|Error)\]|error:)/im.test(output))throw sdkFailure(output,readOnly)
  return output
}
const read=operation=>retryNativeRead(operation,{attempts:3,pauseMs:500,budget,sleep:delay},row=>readRetries.push(row))
const run=(exe,args)=>rawRun(exe,args,false),device=(...args)=>run(hdc,[...connection,...args]),deviceRead=(...args)=>read(()=>rawRun(hdc,[...connection,...args],true))
async function control(operation){const seq=Date.now(),pending=join(world,'control-'+seq+'.next.json');await writeFile(pending,JSON.stringify({seq,operation})+'\n');for(let i=0;;i++){try{await rename(pending,join(world,'control.json'));break}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||i>=19)throw error;budget.requireTime();await delay(25)}}const acknowledgement=await wait(async()=>{try{return await json(join(world,'ack-'+seq+'.json'))}catch(error){if(error.code!=='ENOENT')throw error}},10000);lastFixtureState=nativeControlStatus(await json(join(world,'state.json')),acknowledgement,seq);return lastFixtureState}
async function wait(check,ms=45000){const until=Math.min(deadline,Date.now()+ms);while(Date.now()<until){budget.requireTime();const value=await check();if(value)return value;if((sixth||seventh||eighth||ninth)&&caseExpiryBaseline!==null&&(lastFixtureState?.commandExpiry?.elapsed??0)+(lastFixtureState?.commandExpiry?.futureLimit??0)>caseExpiryBaseline){caseExpiryBaseline=null;await expiryFailure()}await delay(250)}throw new NativeAcceptanceFailure('checkpoint-timeout','case-observation')}
async function logs(){return deviceRead('shell','hilog','-P',String(pid),'-x')}
async function logUntil(pattern,before){const anchor=before.trim().split(/\r?\n/).at(-1);return wait(async()=>{const value=await logs();const at=anchor?value.lastIndexOf(anchor):-1;if(anchor&&at<0)throw Error('Scoped native log baseline lost');const suffix=value.slice(at+(anchor?.length??0));if(pattern.test(suffix))return value;if((sixth||seventh||eighth||ninth)&&suffix.includes('error=request-expired')){caseExpiryBaseline=null;await expiryFailure()}})}
async function layout(){
  const tree=join('D:/Temp/dsh-harmony-hvd-api26-20261011/DSHOfflineAPI26/uiLayout','widget_tree.json'),started=Date.now()
  await read(()=>rawRun(emulator,['-instance','DSHOfflineAPI26','-instancePath','D:/Temp/dsh-harmony-hvd-api26-20261011','-imageRoot','D:/Temp/dsh-harmony-images-api26-20261011','-uiLayout','-i'],true))
  await wait(async()=>{try{return(await stat(tree)).mtimeMs>=started}catch(error){if(error.code!=='ENOENT')throw error}},10000)
  const nodes=[];const visit=value=>{for(const node of value){nodes.push(node);if(node.children)visit(node.children)}};visit(await json(tree))
  if(!nodes.some(node=>node.attributes.bundleName==='local.dsh.mobile.netreplay'))throw Error('Layout is not the independent acceptance app')
  return nodes
}
async function click(name){
  const nodes=await layout()
  const matches=nodes.filter(node=>node.attributes.id==='dsh-acceptance-'+name)
  if(matches.length!==1||matches[0].attributes.enabled!=='true'||matches[0].attributes.visible!=='true'||matches[0].attributes.type!=='Button')throw Error('Native control unavailable: '+name)
  const bounds=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(matches[0].attributes.bounds);if(!bounds)throw Error('Native control bounds invalid')
  await device('shell','uitest','uiInput','click',String(Math.floor((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.floor((Number(bounds[2])+Number(bounds[4]))/2)))
}
function noDispatch(state){
  if(!state.ready||state.mode!=='reopen'||state.counts.realCalls!==0||state.uploadCalls!==0||state.promptCalls!==0||state.counts.replay[0]?.calls!==0)throw new NativeAcceptanceFailure('fault-case-state-untrusted','block')
  return{instance:state.instance,promptCalls:state.promptCalls,replayCalls:state.counts.replay[0].calls,realCalls:state.counts.realCalls,uploadCalls:state.uploadCalls}
}
async function isolateFault(){
  caseExpiryBaseline=null
  noDispatch(await control('status'))
  let before=await logs();await click('disconnect');await logUntil(/disconnected.*readOnly=true/,before)
  const cleared=await control('reset-case');noDispatch(cleared)
  if(cleared.faults.armed!==null)throw new NativeAcceptanceFailure('case-injection-not-cleared','block')
  before=await logs();await click('reconnect');await logUntil(/readOnly=false, error=none/,before)
  const state=await control('status');caseExpiryBaseline=(state.commandExpiry?.elapsed??0)+(state.commandExpiry?.futureLimit??0)
  return noDispatch(state)
}
async function blockedControls(){
  const nodes=await layout(),button=nodes.filter(node=>node.attributes.id==='dsh-acceptance-fixed-task')
  if(button.length!==1||button[0].attributes.enabled!=='false')throw new NativeAcceptanceFailure('readonly-submit-control-not-disabled','case-observation')
  return{fixedTaskDisabled:true,submitControl:{id:button[0].attributes.id,enabled:button[0].attributes.enabled,visible:button[0].attributes.visible,type:button[0].attributes.type}}
}
async function step(name,operation){
  const began=new Date().toISOString(),outcome=await reconcileNativeCase(operation,async()=>{
    const state=await control('status')
    const calls=state.counts.replay[0]?.calls
    const safe=state.ready&&state.counts.realCalls===0&&state.uploadCalls===0&&(state.mode==='reopen'&&calls===0&&state.promptCalls===0||state.mode==='create'&&calls===3&&state.promptCalls===2)
    return{safeToContinue:safe,behaviorConfirmed:false,proofMissing:true,reason:'read-only fixture state known; failed case remains failed'}
  })
  steps.push({name,began,completedAt:new Date().toISOString(),...outcome,error:outcome.error?.message??null})
  if(!outcome.continue)throw outcome.error
  console.log((outcome.passed?'PASS':'FAIL with safe independent continuation')+' native checkpoint: '+name)
}
async function capture(name){
  const remote='/data/local/tmp/dsh-phase18-'+name+'.jpeg'
  try{await deviceRead('shell','snapshot_display','-f',remote);await deviceRead('file','recv',remote,join(world,name+'.jpeg'));artifacts.push({name,ok:true})}
  catch(error){if(error instanceof NativeAcceptanceFailure&&error.disposition==='block')throw error;artifacts.push({name,ok:false,error:error.message});console.log('Artifact missing; behavior checks continue: '+name)}
}
try{
  try{anchor=await json(join(world,'driver-anchor.json'))}catch(error){if(error.code!=='ENOENT')throw error;anchor={leaseStartedAt:lease.startedAt,startedAt:new Date(driverStarted).toISOString(),deadline:new Date(Math.min(Date.parse(lease.cleanupAt),driverStarted+1200000)).toISOString()}}
  budget=new NativeWindowClock(lease,anchor,{wall:Date.now,monotonic:()=>performance.now()});deadline=budget.deadline
  try{await writeFile(join(world,'driver-anchor.json'),JSON.stringify(anchor,null,2)+'\n',{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error}
  if(checkpointProof&&!seventh&&!eighth&&!ninth)throw new NativeAcceptanceFailure('checkpoint-proof-round-not-prepared')
  hap=await json(resolve(ninth?'evidence/phase28-hap.json':checkpointProof?'evidence/phase25-hap.json':seventh?'evidence/phase23-hap.json':sixth?'evidence/phase22-hap.json':'evidence/phase17-hap.json'))
  if(checkpointProof&&(hap.checkpointDiagnostics!==1||typeof hap.cancelledTaskText!=='string'||hap.cancelledTaskText.length<1))throw new NativeAcceptanceFailure('checkpoint-proof-hap-not-prepared')
  if(createHash('sha256').update(await readFile(hap.path)).digest('hex')!==hap.sha256||hap.requestPermissions.length!==1||hap.requestPermissions[0].name!=='ohos.permission.INTERNET'||hap.signed||hap.installed)throw new NativeAcceptanceFailure('sealed-hap-differs')
  const ready=await json(join(world,'prewindow-ready.json')),active=await json(join(world,'forward-active.json')),state=await control('status')
  if(checkpointProof&&ready.checkpointDiagnostics!==1)throw new NativeAcceptanceFailure('checkpoint-proof-readiness-not-confirmed','block')
  const owner=await json(join(world,'owner.json'));state.serviceRemainingMs=Date.parse(owner.startedAt)+1800000-Date.now()
  pid=nativeWindowPreconditions({lease,active,marker,ready,state,now:Date.now(),hapSha:hap.sha256})
  const found=(await deviceRead('shell','pidof','local.dsh.mobile.netreplay')).trim();if(found!==String(pid))throw new NativeAcceptanceFailure('prewindow-app-lifecycle-changed','block')
  await wait(async()=>/DSH native core ready/.test(await logs()))
  if(sixth||seventh||eighth||ninth){
    noDispatch(await control('status'));const before=await logs();await click('connect');await logUntil(/readOnly=false, error=none/,before)
  }else if(process.argv.includes('--remaining-only')){
    const completed=await json(join(world,'completed-checkpoints.json'))
    if(completed.steps.filter(row=>row.passed).length<4)throw new NativeAcceptanceFailure('prior-checkpoints-not-confirmed')
    const before=await logs();await click('connect');await logUntil(/readOnly=false, error=none/,before)
  }else{
  await step('initial fixed task/action/source-offload',async()=>{let before=await logs();await click('connect');await logUntil(/readOnly=false, error=none/,before);await click('fixed-task');await wait(async()=>{const state=await control('status');return state.counts.replay[0].calls===3&&state.promptCalls===2&&state.sourceOffloadSeen});await capture('rich-action')})
  await step('native cache after disconnect',async()=>{let before=await logs();await click('cache-save');await logUntil(/DSH native cache saved: true/,before);before=await logs();await click('disconnect');await logUntil(/disconnected.*readOnly=true/,before);before=await logs();await click('cache-restore');await logUntil(/DSH native cache restored: true/,before);await capture('cache-restored');before=await logs();await click('reconnect');await logUntil(/readOnly=false, error=none/,before)})
  await step('fourth fixed cancellation',async()=>{await click('cancel-task');await wait(async()=>{try{await stat((await json(join(world,'state.json'))).cancelReady);return true}catch(error){if(error.code!=='ENOENT')throw error}});const before=await logs();await click('cancel');await logUntil(/cancelled.*readOnly=false/,before)})
  await step('service reopen and old generation',async()=>{const before=await logs();await control('reopen');await logUntil(/DSH native acceptance report: .*"passed":true.*"forwarded":0/,before);await click('fixed-task');const state=await control('status');if(state.promptCalls!==0||state.counts.replay[0].calls!==0)throw Error('Service reopen redispatched');await capture('service-reopened')})
  }
  const matrix=await runIsolatedNativeCases(scenarios,{budget,reset:isolateFault,execute:async scenario=>{
    if(scenario.fault==='transport-reset'){
      const state=await control('status'),count=state.faults.written.length
      await control('fault:transport-reset')
      await wait(async()=>{const value=await control('status');noDispatch(value);return value.faults.written.length>count&&value.carrier.follows>=state.carrier.follows+2})
      const before=await logs(),recovered=await control('status'),checkpoint=recovered.faults.written.length
      await control('fault:reset-snapshot')
      const observed=await wait(async()=>{const value=await control('status'),marker=value.faults.checkpoint;return value.faults.written.length>checkpoint&&value.faults.written.at(-1)==='reset-snapshot'&&typeof marker==='string'&&marker.length<=256&&marker.startsWith('DSH read checkpoint ')&&marker!==recovered.faults.checkpoint?value:undefined})
      await logUntil(/readOnly=false, error=none/,before)
      if(checkpointProof){
        const observations=[]
        try{
          const proof=await observeNativeCheckpointProof(observed.faults.checkpoint,{source:()=>control('status'),logs,layout,latest:async attributes=>{const bounds=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds);await device('shell','uitest','uiInput','click',String(Math.floor((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.floor((Number(bounds[2])+Number(bounds[4]))/2)))},sleep:delay,record:value=>observations.push(value)},{budget,maxPolls:12,pauseMs:250},{task:'cancelled',taskText:hap.cancelledTaskText})
          return{automaticReadsRecovered:true,postRecoverySnapshotAdmitted:true,nativeCheckpointText:observed.faults.checkpoint,proof,...noDispatch(await control('status'))}
        }finally{const file=join(world,'checkpoint-proof-observations-'+Date.now()+'.json');await writeFile(file,JSON.stringify(observations,null,2)+'\n');artifacts.push({name:'checkpoint-proof-observations',path:file,ok:true})}
      }
      const textObservation=await observeNativeCheckpointText(observed.faults.checkpoint,{layout,swipe:(x1,y1,x2,y2)=>device('shell','uitest','uiInput','swipe',String(x1),String(y1),String(x2),String(y2),'400'),sleep:delay},{budget,maxScrolls:4,pauseMs:400}),nativeText=textObservation.attributes
      return{automaticReadsRecovered:true,postRecoverySnapshotAdmitted:true,nativeCheckpointText:observed.faults.checkpoint,nativeText:{text:nativeText.text,originalText:nativeText.originalText,visible:nativeText.visible,type:nativeText.type},checkpointScrolls:textObservation.scrolls,...noDispatch(await control('status'))}
    }
    const before=await logs(),initial=await control('status'),count=initial.faults.written.length
    if(scenario.fault==='recovery-budget'){
      for(let i=0;i<4;i++){const state=await control('status'),taken=state.faults.written.length;await control('fault:transport-reset');await wait(async()=>{const value=await control('status');return value.faults.written.length>taken})}
      await logUntil(/disconnected.*readOnly=true, error=follow-recovery-exhausted/,before)
    }else{
      await control('fault:'+scenario.fault)
      await wait(async()=>{const state=await control('status');return state.faults.written.length>count&&state.faults.written.at(-1)===scenario.fault})
      const code=scenario.fault==='truncated-json'?'truncated-frame':scenario.fault==='invalid-json'?'invalid-frame':scenario.fault
      await logUntil(scenario.fault==='unknown-required'?/, connected,.*readOnly=true, error=none/:new RegExp('disconnected.*readOnly=true, error='+code+'(?:\\r?\\n|$)'),before)
    }
    const controls=await blockedControls();await capture(scenario.fault)
    return{...controls,...noDispatch(await control('status'))}
  }})
  steps.push(...matrix.results)
  if(!matrix.passed||steps.some(row=>!row.passed)||artifacts.some(row=>!row.ok))failed=Error('Native acceptance incomplete; every failed or blocked case is retained')
}catch(error){failed=error}
finally{
  for(const scenario of scenarios)if(!steps.some(row=>row.name===scenario.name))steps.push({name:scenario.name,passed:false,executed:false,status:'blocked',stage:'prerequisite',error:failed?.message??'native-prerequisite-unconfirmed'})
  let cleanup
  const exits=await settleNativeCleanup([
    {name:'best-effort-app-log',run:async()=>{if(pid)await writeFile(join(world,'native-app-driver.log'),(await logs()).replaceAll('\r\n','\n').trimEnd()+'\n')}},
    {name:'request-owned-cleanup',run:()=>writeFile(join(world,'cleanup.request'),'Finite native driver completed or failed; original deadline preserved.\n')},
    {name:'wait-owned-cleanup',run:async()=>{const until=Math.min(Date.parse(lease.expiresAt),Date.now()+120000);while(Date.now()<until){try{cleanup=await json(join(world,'forward-cleanup.json'));return cleanup}catch(error){if(error.code!=='ENOENT')throw error}await delay(250)}throw Error('Cleanup acknowledgement absent')}}
  ])
  const clean=Boolean(cleanup&&cleanup.failure===null&&!cleanup.deadlineExceeded&&cleanup.cleanup.every(row=>row.ok))
  if(!clean)failed??=Error('Native cleanup not confirmed before the original deadline')
  const faults=steps.filter(row=>scenarios.some(scenario=>scenario.name===row.name)),faultSummary={planned:scenarios.length,passed:faults.filter(row=>row.status==='passed').length,failed:faults.filter(row=>row.status==='failed').length,blocked:faults.filter(row=>row.status==='blocked').length}
  await writeFile(join(world,'native-driver-result.json'),JSON.stringify({passed:!failed&&steps.every(row=>row.passed)&&artifacts.every(row=>row.ok)&&clean,steps,faultSummary,records,artifacts,readRetries,expiryFailures,exitOperations:exits,error:failed?.message??null,cleanupPassed:clean,leaseStartedAt:lease.startedAt,originalDeadline:lease.expiresAt,windowReset:false,realModels:lastFixtureState?.counts.realCalls??null,uploads:lastFixtureState?.uploadCalls??null},null,2)+'\n')
}
if(failed)throw failed

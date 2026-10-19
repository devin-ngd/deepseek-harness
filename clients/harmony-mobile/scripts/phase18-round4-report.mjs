/** Seal only owned fourth-window evidence. This offline command starts no subprocess, listener, emulator or device operation. */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'

const root=resolve('.'),output=join(root,'evidence/phase18-round4-native')
const worlds=['round4','round4-resume1','round4-resume2'].map(name=>'D:/Temp/dsh-harmony-phase18-native-20261012-'+name)
const json=async path=>JSON.parse(await readFile(path,'utf8'))
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex')
const hap=await json(join(root,'evidence/phase17-hap.json'))
if(checksum(await readFile(hap.path))!==hap.sha256)throw Error('Sealed v17 HAP differs')
const attempts=[]
for(const world of worlds){
  const driver=await json(join(world,'native-driver-result.json')),lease=await json(join(world,'forward-lease.json')),cleanup=await json(join(world,'forward-cleanup.json')),service=await json(join(world,'service-final.json')),before=await json(join(world,'license-before-start.json')),after=await json(join(world,'license-after-stop.json'))
  if(driver.passed||!driver.cleanupPassed||driver.windowReset||cleanup.failure!==null||cleanup.deadlineExceeded||cleanup.cleanup.some(row=>!row.ok)||!service.closed||service.cleanupFailure!==null||service.realModelCalls!==0||service.uploadCalls!==0)throw Error('Partial outcome or successful bounded cleanup evidence differs')
  if(lease.startedAt!=='2026-10-12T05:50:46.093Z'||lease.expiresAt!=='2026-10-12T06:20:46.093Z'||before.license.sha256!==after.license.sha256||before.license.modifiedUtc!==after.license.modifiedUtc)throw Error('Original deadline or license evidence differs')
  attempts.push({world,driver,lease,cleanup,service,license:after.license})
}
const first=attempts[1],last=attempts[2],passed=first.driver.steps.filter(row=>row.passed)
if(passed.length!==4||last.driver.steps.length!==1||last.driver.error!=='checkpoint-timeout'||last.service.records[0].counts.replay[0].calls!==0||last.service.records[0].promptCalls!==0||!last.service.records[0].faults.consumed.includes('transport-reset'))throw Error('Required partial native checkpoints differ')
const oldMount=(await readFile(join(first.world,'native-app-driver.log'),'utf8')).split(/\r?\n/).find(line=>line.includes('DSH native acceptance report: '))
if(!oldMount||!oldMount.includes('"passed":true')||!oldMount.includes('"forwarded":0'))throw Error('Native old-mount rejection evidence absent')
const resumedLog=await readFile(join(last.world,'native-app-driver.log'),'utf8')
const admitted=resumedLog.split(/\r?\n/).filter(line=>line.includes('DSH native HTTP headers admitted: mobile-protocol'))
if(admitted.length<2)throw Error('Native read recovery observation absent')
const hostCheck=await json(join(root,'evidence/phase18-final-host-check.json'))
if(hostCheck.remainingOwnedProcesses.length||hostCheck.remainingOwnedListeners.length||hostCheck.nativeActivationOccurred)throw Error('Owned resources remain active')
await mkdir(output)
const files={}
const allowed=['native-driver-result.json','forward-lease.json','forward-active.json','forward-cleanup.json','driver-anchor.json','emulator-owner.json','resource-owner.json','prewindow-ready.json','prewindow-commands.json','state.json','service-final.json','exit.json','service.log','license-before-start.json','license-after-start.json','license-before-stop.json','license-after-stop.json','inspection-create.json','inspection-reopen.json','native-app-driver.log','rich-action.jpeg','cache-restored.jpeg','service-reopened.jpeg','prewindow-screen.jpeg','awake-screen.jpeg']
for(const attempt of attempts){
  const name=attempt.world.split('/').at(-1).replace('dsh-harmony-phase18-native-20261012-',''),destination=join(output,name)
  await mkdir(destination)
  for(const file of allowed){
    let original
    try{original=await readFile(join(attempt.world,file))}catch(error){if(error.code==='ENOENT')continue;throw error}
    const bytes=file.endsWith('.jpeg')?original:Buffer.from(original.toString('utf8').replaceAll('\r\n','\n').trimEnd()+'\n')
    await writeFile(join(destination,file),bytes,{flag:'wx'})
    files[name+'/'+file]={bytes:bytes.length,sha256:checksum(bytes),originalBytes:original.length,originalSha256:checksum(original),lineEndingsNormalized:!bytes.equals(original)}
  }
}
const run=last.service.records[0]
const summary={schema:'dsh-native-approved-attempt/2',generatedAt:new Date().toISOString(),passed:false,windowClosed:true,qualification:'four API26 ArkUI/ArkWeb replay checkpoints passed; native socket read recovery observed but complete case failed; remaining fault cases unrun',hap:{path:hap.path,bytes:hap.bytes,sha256:hap.sha256,build:hap.build,toolchain:hap.toolchain,bundle:hap.bundle,permissions:['ohos.permission.INTERNET'],signed:false,installedNow:false,nativeExecuted:true,recompiledDuringFourthWindow:false},startedAt:last.lease.startedAt,originalDeadline:last.lease.expiresAt,cleanupReserveAt:last.lease.cleanupAt,completedAt:last.cleanup.completedAt,elapsedMs:Date.parse(last.cleanup.completedAt)-Date.parse(last.lease.startedAt),driverAnchor:await json(join(last.world,'driver-anchor.json')),mappingActivations:3,maximumSimultaneousMappings:1,windowReset:false,sameWindowBoundedContinuations:2,attempts:attempts.map(row=>({world:row.world,rule:row.lease.rule,driverPassed:row.driver.passed,error:row.driver.error,steps:row.driver.steps,cleanupPassed:row.driver.cleanupPassed,completedAt:row.cleanup.completedAt,serviceExit:(row.cleanup.cleanup.find(operation=>operation.name==='close-owned-carrier')?.result??null)})),nativeCheckpointsPassed:passed,oldMountEvidence:oldMount,socketRecovery:{passed:false,transportRecoveryObserved:true,faultConsumed:run.faults.consumed,carrier:run.carrier,firstHeaders:admitted[0],lastHeaders:admitted.at(-1),newTaskDispatches:run.promptCalls,newReplayCalls:run.counts.replay[0].calls,missingEvidence:'fresh native view matching readOnly=false,error=none after socket cut; no new semantic payload was emitted at the unchanged cursor',driverDefect:'reconciliation read acknowledgement without published ready/url fields; offline normalization fix is not native revalidated'},unrunNativeCases:['invalid-json','truncated-json','unknown-required','cursor-gap','cursor-conflict','read-recovery-budget-exhaustion'],createReplayResponses:first.service.records[0].counts.replay[0].calls,createPromptCalls:first.service.records[0].promptCalls,realModels:0,uploads:0,cleanupPassed:true,licenseUnchanged:true,licenseSha256:last.license.sha256,licenseModifiedUtc:last.license.modifiedUtc,licenseCliInvoked:false,licenseInputSent:false,developerModeChanged:false,ownedEmulatorsStopped:true,sharedHdcStopCommandIssued:false,laterHostCheck:'evidence/phase18-final-host-check.json',sharedHdcLaterObserved:hostCheck.sharedHdc.running,sharedHdcLaterAbsenceCause:'not established; no restart or stop requested',visualReview:{reviewed:['rich-action.jpeg','cache-restored.jpeg','service-reopened.jpeg'],accepted:false,remaining:['cached rich card areas appear blank in screenshot','button labels are ellipsized','form scroll reachability, human input and IME have no native evidence']},offlineFixes:{statusNormalization:true,preparationClippedToOriginalCleanupReserve:true,nativeRevalidated:false,focusedTests:17,evidence:'evidence/phase18-policy-tests-after-window.tap'},previousStableRegression:{independentTests:197,chromeTests:87,evidence:'evidence/regression-final-regression-final-Omgtjq/summary.json',notRepeatedForCurrentOrchestrationChanges:true},notQualified:['real installed DSH profile routing or approval mux','real user Sessions or models','human form editing or IME','old ArkWeb document/private port race','real device','pairing/WAN/TLS/signing'],files}
await writeFile(join(root,'evidence/phase18-round4-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({passed:false,checkpointsPassed:passed.length,elapsedMs:summary.elapsedMs,evidenceFiles:Object.keys(files).length,cleanupPassed:true,realModels:0,uploads:0,reactivated:false}))

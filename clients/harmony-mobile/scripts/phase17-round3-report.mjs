/** Preserve the failed approved v17 startup and successful bounded cleanup; no tool, listener or native activation occurs. */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const world='D:/Temp/dsh-harmony-phase17-native-20261012-round3',output=resolve('evidence/phase17-round3-native')
const json=async name=>JSON.parse(await readFile(join(world,name),'utf8'))
const driver=await json('native-driver-result.json'),cleanup=await json('forward-cleanup.json'),service=await json('service-final.json'),before=await json('license-before-start.json'),after=await json('license-after-stop.json'),hap=JSON.parse(await readFile('evidence/phase17-hap.json','utf8'))
if(driver.passed||driver.steps.length!==0||!driver.cleanupPassed||cleanup.failure!==null||cleanup.deadlineExceeded||cleanup.cleanup.some(row=>!row.ok)||!service.closed)throw Error('Failed startup / successful cleanup evidence differs')
const launch=driver.records.find(row=>row.args.includes('aa')),install=driver.records.find(row=>row.args.includes('install'))
if(!launch?.output.includes('10106102')||!install?.output.includes('install bundle successfully.')||service.records[0].counts.replay[0].calls!==0||service.records[0].promptCalls!==0||service.realModelCalls!==0||service.uploadCalls!==0)throw Error('Required SDK and replay evidence missing')
if(before.license.sha256!==after.license.sha256||before.license.modifiedUtc!==after.license.modifiedUtc)throw Error('License changed')
if(createHash('sha256').update(await readFile(hap.path)).digest('hex')!==hap.sha256)throw Error('Sealed HAP changed')
await mkdir(output)
const files={}
for(const name of ['native-driver-result.json','forward-lease.json','forward-active.json','forward-cleanup.json','emulator-owner.json','bundle-before.json','license-before-start.json','license-after-start.json','license-before-stop.json','license-after-stop.json','service-final.json','exit.json','service.log','state.json','inspection-create.json']){
  const bytes=Buffer.from((await readFile(join(world,name),'utf8')).replaceAll('\r\n','\n').trimEnd()+'\n')
  await writeFile(join(output,name),bytes,{flag:'wx'});files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
}
await writeFile('evidence/phase17-round3-summary.json',JSON.stringify({schema:'dsh-native-approved-attempt/1',generatedAt:new Date().toISOString(),passed:false,qualification:'actual API26 startup/install/forward/cleanup attempt; no v17 application execution or native scenario qualification',world,hap,startedAt:cleanup.startedAt,originalDeadline:cleanup.expiresAt,completedAt:cleanup.completedAt,elapsedMs:Date.parse(cleanup.completedAt)-Date.parse(cleanup.startedAt),mapping:cleanup.rule,mappingActivations:1,windowReset:false,windowReopened:false,installSucceeded:true,launchSucceeded:false,launchErrorCode:10106102,launchFailure:'screen locked; developer mode prevents automatic unlock',nativeScenariosCompleted:0,replayResponsesUsed:0,promptCalls:0,realModels:0,uploads:0,cleanupPassed:true,sharedHdcPid67100Preserved:true,ownedEmulatorPid30788Gone:true,licenseUnchanged:true,licenseSha256:after.license.sha256,licenseModifiedUtc:after.license.modifiedUtc,licenseCliInvoked:false,licenseInputSent:false,developerModeChanged:false,codeFix:'wake moved before aa start; persistent lock still stops without settings changes or retries',codeFixNativeRevalidated:false,nextBlocker:'verify normal screen readiness before consuming a new window; no new window authorized by this report',files},null,2)+'\n',{flag:'wx'})
console.log('PASS: failed locked-screen startup and 57.257-second cleanup preserved; zero native scenarios and replay dispatch; no reactivation')

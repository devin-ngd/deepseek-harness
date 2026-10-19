/** Next bounded native service owner. Explicit future approval is required; normal regression never launches this owner. */
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { CommandEpochClock } from '../src/command-clock.ts'
import { join,resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect,it,vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { nativeAcceptancePublications } from '../integration/native-acceptance-publications.ts'
import { NativeFollowFaults } from '../integration/native-follow-faults.ts'
import type { NativeFollowFault } from '../integration/native-follow-faults.ts'
import { finishNativeReplayLab } from '../integration/native-service-outcome.ts'
import { object,integer,string } from '../src/domain.ts'
import { jsonPayload } from '../src/wire.ts'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

it('approved next native window owns fixed replay, finite wire faults and pre-disposal outcomes',async()=>{
  const parent=resolve(process.env.DSH_HARMONY_NATIVE_WORLD??'')
  const approved=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE,owned=approved==='approved-phase17'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase17-native-')||approved==='approved-phase18'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase18-native-')||approved==='approved-phase20'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase20-native-')
  if(!(owned||approved==='approved-phase22'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase22-native-')||approved==='approved-phase24'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase24-native-')||approved==='approved-phase26'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase26-native-')||approved==='approved-phase28'&&parent.startsWith('D:\\Temp\\dsh-harmony-phase28-native-'))||process.env.DSH_SNAPSHOT_REPLAY_ONLY!=='1')throw Error('New native approval and matching owned world required')
  await mkdir(parent,{recursive:true})
  const faults=new NativeFollowFaults(16),publications=nativeAcceptancePublications(true),records:object[]=[],world=join(parent,'services')
  const initialMode=process.env.DSH_HARMONY_NATIVE_CONTINUE==='1'?'reopen':'create'
  let lab=await nativeReplayLab(world,initialMode,{port:0,clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:3000,publications,faults}),mode:string=initialMode,seq=0,live=true
  let prompt=vi.spyOn(lab.ctx.sessionController,'prompt'),upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw Error('UPLOAD_DISABLED')})
  const report=async()=>{
    lab.ctx.llm.assertZeroRealCalls();expect(upload).not.toHaveBeenCalled()
    const inspection=await lab.ctx.sessionController.inspect(lab.sessionId)
    await writeFile(join(parent,'inspection-'+mode+'.json'),JSON.stringify(inspection,null,2)+'\n')
    return{mode,counts:lab.ctx.llm.getOfflineReplayCounts(),promptCalls:prompt.mock.calls.length,uploadCalls:upload.mock.calls.length,carrier:{...lab.carrier.metrics},faults:faults.report,commandExpiry:lab.ctx.harmonyMobile.commandExpiryReport,commandAudit:lab.audit.report,commandClock:lab.clockAuthority.status,instance:lab.instance,sourceOffloadSeen:inspection.events.some(event=>event.type==='rich-inline/source-offload')}
  }
  const publish=async()=>writeFile(join(parent,'state.json'),JSON.stringify({ready:true,url:lab.carrier.url,sessionId:lab.sessionId,cancelReady:lab.replay.readyFile,...await report()},null,2)+'\n')
  const deadline=Date.now()+2300000
  try{
    await publish()
    while(Date.now()<deadline){
      let command:{seq:number;operation:string}|undefined
      try{const value=object(jsonPayload(JSON.parse(await readFile(join(parent,'control.json'),'utf8'))));if(Object.keys(value).length!==2)throw Error('Invalid private control');command={seq:integer(value.seq,1),operation:string(value.operation,32)}}catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='ENOENT')throw error}
      if(command&&command.seq>seq){
        seq=command.seq
        if(command.operation==='close')break
        if(command.operation==='reopen'){
          await lab.ctx.agents.get(lab.sessionId)?.whenIdle();lab.ctx.llm.assertOfflineReplayConsumed();expect(prompt).toHaveBeenCalledTimes(3)
          const before=await report(),port=Number(new URL(lab.carrier.url).port),closed=await finishNativeReplayLab(lab);live=false;records.push({...before,closedCounts:closed,listenerClosed:true})
          lab=await nativeReplayLab(world,'reopen',{port,clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:3000,publications,faults});live=true;mode='reopen'
          prompt=vi.spyOn(lab.ctx.sessionController,'prompt');upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw Error('UPLOAD_DISABLED')})
        }else if(command.operation==='reset-case'){
          faults.disarm()
        }else if(command.operation.startsWith('fault:')){
          const fault=command.operation.slice(6)
          if(!['transport-reset','reset-snapshot','invalid-json','truncated-json','unknown-required','cursor-gap','cursor-conflict'].includes(fault))throw Error('Unknown fixture fault')
          faults.arm(fault as NativeFollowFault)
        }else if(command.operation!=='status')throw Error('Unknown private operation')
        await publish();await writeFile(join(parent,'ack-'+seq+'.json'),JSON.stringify({seq,...await report()},null,2)+'\n')
      }
      await delay(50)
    }
    expect(mode).toBe('reopen');expect(prompt).not.toHaveBeenCalled();expect(lab.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0)
  }finally{
    let result:object={},failure:unknown
    if(live){
      try{result=await report()}catch(error){failure=error}
      try{const counts=await finishNativeReplayLab(lab);records.push({...result,closedCounts:counts,listenerClosed:true})}catch(error){failure??=error}
    }
    await writeFile(join(parent,'service-final.json'),JSON.stringify({records,closed:failure===undefined,cleanupFailure:failure instanceof Error?failure.message:null,realModelCalls:0,uploadCalls:0},null,2)+'\n')
    if(failure)throw failure
  }
},2400000)

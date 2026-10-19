/** Synthetic native service owner; control remains private files and fixed replay refuses extra dispatch. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { CommandEpochClock } from '../src/command-clock.ts'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { nativeAcceptancePublications } from '../integration/native-acceptance-publications.ts'
import { jsonPayload } from '../src/wire.ts'
import { object, integer, string } from '../src/domain.ts'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

it('second approved API26 round owns exactly four synthetic responses and service recovery',async()=>{
  if(process.env.DSH_HARMONY_NATIVE_ACCEPTANCE!=='approved-phase16'||process.env.DSH_SNAPSHOT_REPLAY_ONLY!=='1')throw Error('Explicit second native round required')
  const parent=resolve(process.env.DSH_HARMONY_NATIVE_WORLD??'')
  if(!parent.startsWith('D:\\Temp\\dsh-harmony-phase16-native-'))throw Error('Owned second-round world required')
  await mkdir(parent,{recursive:true})
  const world=join(parent,'services'),state=join(parent,'state.json'),control=join(parent,'control.json')
  const publications=nativeAcceptancePublications(false)
  let lab=await nativeReplayLab(world,'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:10000,publications}),mode:'create'|'reopen'='create',seen=0
  let prompt=vi.spyOn(lab.ctx.sessionController,'prompt'),upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw Error('UPLOAD_DISABLED')})
  const records:object[]=[]
  const report=async()=>{
    lab.ctx.llm.assertZeroRealCalls();expect(upload).not.toHaveBeenCalled()
    const inspection=await lab.ctx.sessionController.inspect(lab.sessionId)
    await writeFile(join(parent,'inspection-'+mode+'.json'),JSON.stringify(inspection,null,2)+'\n')
    return {mode,counts:lab.ctx.llm.getOfflineReplayCounts(),promptCalls:prompt.mock.calls.length,uploadCalls:upload.mock.calls.length,carrier:{...lab.carrier.metrics},instance:lab.instance,eventTypes:inspection.events.map(event=>event.type),sourceOffloadSeen:inspection.events.some(event=>event.type==='rich-inline/source-offload')}
  }
  const publish=async()=>writeFile(state,JSON.stringify({ready:true,url:lab.carrier.url,sessionId:lab.sessionId,cancelReady:lab.replay.readyFile,...await report()},null,2)+'\n')
  const deadline=Date.now()+2300000
  try{
    await publish()
    while(Date.now()<deadline){
      let command:{seq:number;operation:string}|undefined
      try{const raw=object(jsonPayload(JSON.parse(await readFile(control,'utf8'))));if(Object.keys(raw).length!==2)throw Error('Invalid private control');command={seq:integer(raw.seq,1),operation:string(raw.operation,32)}}catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='ENOENT')throw error}
      if(command&&command.seq>seen){
        seen=command.seq
        if(command.operation==='close')break
        if(command.operation==='reopen'){
          await lab.ctx.agents.get(lab.sessionId)?.whenIdle();lab.replay.handle.assertConsumed();lab.ctx.llm.assertOfflineReplayConsumed();expect(prompt).toHaveBeenCalledTimes(3)
          const old=await report(),port=Number(new URL(lab.carrier.url).port)
          await lab.close();records.push({...old,listenerClosed:true})
          mode='reopen';lab=await nativeReplayLab(world,mode,{port,clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:10000,publications})
          prompt=vi.spyOn(lab.ctx.sessionController,'prompt');upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw Error('UPLOAD_DISABLED')})
        }else if(command.operation!=='status')throw Error('Unknown private control')
        await publish();await writeFile(join(parent,'ack-'+seen+'.json'),JSON.stringify({seen,...await report()},null,2)+'\n')
      }
      await delay(100)
    }
    expect(mode).toBe('reopen');expect(prompt).not.toHaveBeenCalled();lab.ctx.llm.assertZeroRealCalls();expect(lab.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0)
  }finally{
    let result:object={},failure:unknown
    try{result=await report()}catch(error){failure=error}
    try{await lab.close();records.push({...result,listenerClosed:true})}catch(error){failure??=error}
    await writeFile(join(parent,'service-final.json'),JSON.stringify({records,realModelCalls:0,uploadCalls:0,closed:failure===undefined,cleanupFailure:failure instanceof Error?failure.message:failure===undefined?null:'unknown'},null,2)+'\n')
    if(failure!==undefined)throw failure
  }
},2400000)

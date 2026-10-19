/** User-approved emulator service fixture; control is task-owned files, never a network administration endpoint. */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import { CommandEpochClock } from '../src/command-clock.ts'
import {join,resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {expect,it,vi} from 'vitest'
import {nativeReplayLab} from '../integration/native-replay-lab.ts'
import {mobilePublications} from '../integration/mobile-publication.ts'
import {NATIVE_SECURITY_PROGRAM} from '../src/native-security-program.ts'
import {jsonPayload} from '../src/wire.ts'
import {object,integer,string} from '../src/domain.ts'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

it('approved API26 native app consumes actual DSH fixed replay and original receipts after service reopen',async()=>{
  if(process.env.DSH_HARMONY_NATIVE_ACCEPTANCE!=='approved-phase13'||process.env.DSH_SNAPSHOT_REPLAY_ONLY!=='1')throw new Error('Explicit approved native replay owner required')
  const parent=process.env.DSH_HARMONY_NATIVE_WORLD
  if(!parent||!resolve(parent).startsWith('D:\\Temp\\dsh-harmony-phase13-'))throw new Error('Owned native world required')
  await mkdir(parent,{recursive:true});const world=join(parent,'services'),control=join(parent,'control.json'),state=join(parent,'state.json')
  const publications=mobilePublications.map((content,index)=>index===0?{...content,
    html:content.html.replace('phase5-desktop','phase11-desktop')+'<button id="security-run">隔离自检</button><pre id="security-result" aria-live="polite"></pre>',
    js:content.js+';document.querySelector("input[name=title]").value="Final mobile input";document.querySelector("input[name=count]").value="7";'+NATIVE_SECURITY_PROGRAM,
  }:content)
  const initialPort=Number(process.env.DSH_HARMONY_NATIVE_INITIAL_PORT??'0')
  if(!Number.isSafeInteger(initialPort)||initialPort<0||initialPort>65535)throw new Error('Invalid approved initial loopback port')
  let lab=await nativeReplayLab(world,'create',{port:initialPort,clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:20000,publications}),mode:'create'|'reopen'='create',seen=0
  const port=new URL(lab.carrier.url).port,records:object[]=[]
  let finalReplayCalls=-1,finalPromptCalls=-1
  let upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw new Error('UPLOAD_DISABLED')}),prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
  const report=async()=>{lab.ctx.llm.assertZeroRealCalls();expect(upload).not.toHaveBeenCalled();return{mode,counts:lab.ctx.llm.getOfflineReplayCounts(),promptCalls:prompt.mock.calls.length,uploadCalls:upload.mock.calls.length,carrier:lab.carrier.metrics,instance:lab.instance}}
  const publish=async()=>writeFile(state,JSON.stringify({ready:true,url:lab.carrier.url,sessionId:lab.sessionId,cancelReady:lab.replay.readyFile,...await report()},null,2)+'\n')
  const deadline=Date.now()+2100000
  try{
    await publish()
    while(Date.now()<deadline){
      let command:{seq:number;operation:string}|undefined
      try{const raw=object(jsonPayload(JSON.parse(await readFile(control,'utf8'))));if(Object.keys(raw).length!==2)throw new Error('Invalid task control');command={seq:integer(raw.seq,1),operation:string(raw.operation,16)}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
      if(command&&command.seq>seen){
        seen=command.seq
        if(command.operation==='close')break
        if(command.operation==='reopen'){
          await lab.ctx.agents.get(lab.sessionId)?.whenIdle();lab.replay.handle.assertConsumed();lab.ctx.llm.assertOfflineReplayConsumed();expect(prompt).toHaveBeenCalledTimes(3)
          const record=await report();await lab.close();records.push({...record,listenerClosed:true})
          mode='reopen';lab=await nativeReplayLab(world,mode,{port:Number(port),clockAuthority:ownerCommandClock,grantTtlMs:1800000,followSegmentMs:20000,publications})
          upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw new Error('UPLOAD_DISABLED')});prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
        }else if(command.operation!=='status')throw new Error('Unknown task control')
        await publish();await writeFile(join(parent,'ack-'+seen+'.json'),JSON.stringify({seen,...await report()},null,2)+'\n')
      }
      await delay(100)
    }
  }finally{
    let record:object={},failure:unknown
    try{record=await report();finalReplayCalls=lab.ctx.llm.getOfflineReplayCounts().replay[0]?.calls??-1;finalPromptCalls=prompt.mock.calls.length}catch(error){failure=error}
    try{await lab.close();records.push({...record,listenerClosed:true})}catch(error){failure??=error}
    await writeFile(join(parent,'service-final.json'),JSON.stringify({records,realModelCalls:0,uploadCalls:0,closed:failure===undefined,cleanupFailure:failure instanceof Error?failure.message:failure===undefined?null:'unknown'},null,2)+'\n')
    if(failure!==undefined)throw failure
  }
  expect(mode).toBe('reopen');expect(finalPromptCalls).toBe(0);expect(finalReplayCalls).toBe(0)
},2100000)

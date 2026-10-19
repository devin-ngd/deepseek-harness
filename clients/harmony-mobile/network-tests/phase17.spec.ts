/** Actual synthetic source/BFF fixtures rehearse socket and semantic failures; no ArkWeb/emulator is activated. */
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { nativeAcceptancePublications } from '../integration/native-acceptance-publications.ts'
import { NativeFollowFaults } from '../integration/native-follow-faults.ts'
import type { NativeFollowFault } from '../integration/native-follow-faults.ts'
import { finishNativeReplayLab } from '../integration/native-service-outcome.ts'
import { NetworkPhone } from '../src/network-phone.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { PhoneCore } from '../src/phone-core.ts'
import { observeNativeGeneration } from '../src/native-acceptance-probe.ts'
import { id } from '../src/protocol.ts'
import { object } from '../src/domain.ts'
import type { JsonValue } from '../src/upstream.ts'
import type { WireItem } from '../src/wire.ts'
import type { MobileCommand } from '../src/link-protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { CommandEpochClock, resolveCommandLifetime } from '../src/command-clock.ts'
import { NativeAppHost } from '../src/native-app-host.ts'
import type { NativeHostPolicy, NativeHostView } from '../src/native-app-host.ts'
import { readFile } from 'node:fs/promises'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

const limits={maxBytes:1048576,maxEvents:512,maxBlocks:256,maxText:262144,maxRichBlocks:8}
it('test-only case reset accounts for discarded injections without renewing the finite injection cap',()=>{
  const faults=new NativeFollowFaults(2)
  faults.arm('invalid-json');faults.disarm();expect(faults.report).toEqual({armed:null,consumed:[],written:[],discarded:['invalid-json'],checkpoint:null,checkpointFrame:null})
  faults.arm('transport-reset');expect(faults.take()).toBe('transport-reset');faults.disarm()
  expect(faults.report.consumed).toEqual(['transport-reset']);expect(()=>faults.arm('reset-snapshot')).toThrow('fixture-fault-busy')
})
it('read-only post-recovery checkpoint preserves durable records and projects an exact synthetic live marker without mutating the source snapshot',()=>{
  const faults=new NativeFollowFaults(1),reset:WireItem={protocol:'dsh-mobile-wire/1',mode:'fixed-replay',kind:'reset',desktopId:id<'mobile-desktop'>('d'),deviceId:id<'mobile-device'>('p'),sessionId:id<'SessionId'>('s'),instance:id<'mobile-wire-instance'>('i'),relayCursor:0,payload:{type:'snapshot',header:{version:4,id:'s',createdAt:0,isSeeded:false},cursor:-1,records:[],hasMore:false,projections:{asOfSeq:-1,values:{}}}}
  const before=JSON.stringify(reset),bytes=faults.bytes('reset-snapshot',id<'mobile-command'>('read-checkpoint'),reset),lines=bytes.text.trimEnd().split('\n').map(line=>JSON.parse(line))
  const checkpoint=lines[0].value,model=new SemanticPhone({desktopId:reset.desktopId,deviceId:reset.deviceId,sessionId:reset.sessionId},limits,512)
  expect(bytes.resetSocket).toBe(false);expect(lines[1]).toEqual({type:'end',streamId:'read-checkpoint'});expect(checkpoint.payload.records).toEqual([]);expect(checkpoint.relayCursor).toBe(reset.relayCursor)
  expect(model.accept(checkpoint)).toBe(true);expect(model.view.liveText).toBe(faults.report.checkpoint);expect(model.view.readOnly).toBe(false);expect(JSON.stringify(reset)).toBe(before)
})
function phone(url:string,sessionId:ReturnType<typeof id<'SessionId'>>,observer?: (value:JsonValue)=>void,clockOffsetMs=0) {
  const transports:NetworkPhone[]=[]
  const make=(baseUrl:string)=>{const value=new NetworkPhone({enabled:true,mode:'loopback-fixed-replay',baseUrl,maxFrameBytes:1048576,maxReadChunkBytes:1048576,requestTimeoutMs:1000,maxInFlight:8},fetch);transports.push(value);return value}
  let network=make(url)
  const watched=observeNativeGeneration({request:(command,signal)=>network.request(command,signal),follow:(command,resume,signal)=>network.follow(command,resume,signal),close:async()=>{for(const value of transports)await value.close()}},observer??(()=>{})), model=new SemanticPhone({desktopId:id<'mobile-desktop'>('phase11-desktop'),deviceId:id<'mobile-device'>('phase11-phone'),sessionId},limits,512)
  let next=0, failure:unknown
  const clock=new CommandEpochClock({wall:()=>Date.now()+clockOffsetMs,monotonic:()=>performance.now()},1000),lifetime=resolveCommandLifetime(60000,{maxPeerSkewMs:5000,maxWallDriftMs:1000})
  const core=new PhoneCore(watched.provider,model,{follow:{mode:'bounded',maxSegments:256,maxFailures:4,retryDelayMs:100},clock:()=>clock.now(),grantEpoch:1,ttlMs:lifetime.wireTtlMs,maxMounts:4,maxIntents:32,nextCommandId:()=>id<'mobile-command'>('phase17-'+ ++next)})
  watched.observeCore(core)
  const abort=new AbortController(),following=(async()=>{try{for await(const value of core.follow(abort.signal))void value}catch(error){failure=error}})()
  return{core,model,abort,following,repoint(baseUrl:string){network=make(baseUrl)},get failure(){return failure},async close(){abort.abort();await following;await core.close()}}
}
async function until(check:()=>boolean|Promise<boolean>) {for(let i=0;i<1000;i++){if(await check())return;await delay(5)}throw Error('Bounded phase17 rehearsal timed out')}

it.each([-5000,5000])('bounded peer clock offset %ims supports socket read recovery and exact cursor refusal without new dispatch',async(offset:number)=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const faults=new NativeFollowFaults(2),lab=await nativeReplayLab(join(parent,'phase23-skew-'+offset),'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications:nativeAcceptancePublications(false),faults})
  const client=phone(lab.carrier.url,lab.sessionId,undefined,offset),prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
  try{
    await until(()=>client.model.view.connection==='connected')
    const before=lab.carrier.metrics.follows;faults.arm('transport-reset')
    await until(()=>faults.report.written.length===1&&lab.carrier.metrics.follows>=before+2)
    expect(client.failure).toBeUndefined();faults.arm('cursor-conflict')
    await until(()=>client.failure!==undefined)
    expect(client.failure).toMatchObject({code:'cursor-conflict'});expect(client.model.view.readOnly).toBe(true)
    expect(lab.ctx.harmonyMobile.commandExpiryReport).toEqual({elapsed:0,futureLimit:0,last:null});expect(lab.clockAuthority.status).toBe('trusted')
    expect(prompt).not.toHaveBeenCalled();expect(faults.report.written).toEqual(['transport-reset','cursor-conflict'])
  }finally{await client.close();const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0);expect(outcome.replay[0]?.calls).toBe(0)}
})

it('service generation reopen retains the process clock so a small wall rollback cannot revive an expired cancellation',async()=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const world=join(parent,'phase23-clock-reopen');let wallAdjustment=0
  const clockAuthority=new CommandEpochClock({wall:()=>Date.now()+wallAdjustment,monotonic:()=>performance.now()},1000)
  const policy={port:0,clockAuthority,grantTtlMs:180000,followSegmentMs:50,publications:nativeAcceptancePublications(false)}
  let lab=await nativeReplayLab(world,'create',policy),live=true
  const old:MobileCommand={protocol:MOBILE_LINK_PROTOCOL,desktopId:id<'mobile-desktop'>('phase11-desktop'),deviceId:id<'mobile-device'>('phase11-phone'),grantEpoch:1,commandId:id<'mobile-command'>('expired-before-reopen'),expiresAt:clockAuthority.now()+5,operation:'session.cancel',payload:{sessionId:lab.sessionId}}
  try{
    await lab.saveCheckpoint({desktopId:id<'mobile-desktop'>('phase11-desktop'),deviceId:id<'mobile-device'>('phase11-phone'),sessionId:lab.sessionId,sessionFormatVersion:4,lastDurableSeq:-1})
    await delay(10);const initial=await finishNativeReplayLab(lab);live=false;expect(initial.realCalls).toBe(0)
    wallAdjustment=-500;lab=await nativeReplayLab(world,'reopen',policy);live=true
    const cancel=vi.spyOn(lab.ctx.sessionController,'cancel')
    expect(lab.clockAuthority).toBe(clockAuthority)
    await expect(lab.ctx.harmonyMobile.request(JSON.stringify(old),new AbortController().signal)).rejects.toMatchObject({code:'request-expired',timing:{reason:'elapsed'}})
    expect(cancel).not.toHaveBeenCalled();expect(lab.clockAuthority.status).toBe('trusted')
  }finally{if(live){const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0);expect(outcome.replay[0]?.calls).toBe(0)}}
})

it.each(['elapsed','future-limit'] as const)('expiry rejection %s cannot qualify a reserved byte fault; fresh commands still reach the unchanged cursor validator',async(reason:'elapsed'|'future-limit')=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const faults=new NativeFollowFaults(2),lab=await nativeReplayLab(join(parent,'phase21-expiry-'+reason),'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications:nativeAcceptancePublications(false),faults})
  const network=new NetworkPhone({enabled:true,mode:'loopback-fixed-replay',baseUrl:lab.carrier.url,maxFrameBytes:1048576,maxReadChunkBytes:1048576,requestTimeoutMs:1000,maxInFlight:4},fetch)
  const prompt=vi.spyOn(lab.ctx.sessionController,'prompt'),before=Date.now(),expiresAt=before+(reason==='elapsed'?-1:120000)
  const old:MobileCommand={protocol:MOBILE_LINK_PROTOCOL,desktopId:id<'mobile-desktop'>('phase11-desktop'),deviceId:id<'mobile-device'>('phase11-phone'),grantEpoch:1,commandId:id<'mobile-command'>('phase21-rejected-'+reason),expiresAt,operation:'session.sync',payload:{sessionId:lab.sessionId,afterSeq:-1}}
  const consume=async()=>{for await(const item of network.follow(old,{instance:null,relayCursor:-1}))void item}
  let client:ReturnType<typeof phone>|undefined
  try{
    faults.arm('cursor-gap')
    await expect(consume()).rejects.toMatchObject({code:'request-expired'})
    expect(faults.report.consumed).toEqual(['cursor-gap']);expect(faults.report.written).toEqual([])
    const report=lab.ctx.harmonyMobile.commandExpiryReport
    expect(report.last).toMatchObject({reason,expiresAt,maxCommandTtlMs:60000});expect(report.last!.checkedAt).toBeGreaterThanOrEqual(before);expect(report.last!.checkedAt).toBeLessThanOrEqual(Date.now())
    expect(report.elapsed+report.futureLimit).toBe(1)
    expect(lab.audit.report.dropped).toBe(0)
    expect(lab.audit.report.records).toEqual(expect.arrayContaining([
      expect.objectContaining({stage:'received',commandId:old.commandId,expiresAt}),
      expect.objectContaining({stage:'checked',commandId:old.commandId,outcome:reason,at:report.last!.checkedAt}),
      expect.objectContaining({stage:'fault-taken',commandId:old.commandId,fault:'cursor-gap'})
    ]))
    expect(lab.audit.report.records.some(row=>row.stage==='fault-written')).toBe(false)
    faults.arm('cursor-gap');client=phone(lab.carrier.url,lab.sessionId)
    await until(()=>client?.failure!==undefined)
    expect(client.failure).toMatchObject({code:'cursor-gap'});expect(faults.report.written).toEqual(['cursor-gap'])
    await expect(consume()).rejects.toMatchObject({code:'request-expired'})
    expect(lab.ctx.harmonyMobile.commandExpiryReport.elapsed+lab.ctx.harmonyMobile.commandExpiryReport.futureLimit).toBe(2)
    expect(prompt).not.toHaveBeenCalled()
  }finally{await client?.close();await network.close();const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0);expect(outcome.replay[0]?.calls).toBe(0)}
})

it.each(['invalid-json','truncated-json','unknown-required','cursor-gap','cursor-conflict'])('actual BFF byte fault %s leaves the client read-only without dispatch',async(name:string)=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const faults=new NativeFollowFaults(1),fault=name as NativeFollowFault
  const injected=vi.spyOn(faults,'bytes')
  const lab=await nativeReplayLab(join(parent,'phase17-'+name),'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications:nativeAcceptancePublications(false),faults})
  const prompt=vi.spyOn(lab.ctx.sessionController,'prompt'),upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw Error('UPLOAD_DISABLED')})
  faults.arm(fault);const client=phone(lab.carrier.url,lab.sessionId)
  try{
    await until(()=>client.model.view.readOnly||client.failure!==undefined)
    expect(client.model.view.readOnly).toBe(true)
    await expect(client.core.submit('must-refuse','synthetic')).rejects.toMatchObject({code:'read-only'})
    expect(prompt).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(faults.report.consumed).toEqual([fault]);expect(faults.report.written).toEqual([fault])
    const reset=injected.mock.calls[0]?.[2];expect(reset?.kind).toBe('reset')
    if(!reset)throw Error('Expected one captured authorized reset')
    const advances=fault==='cursor-conflict'||fault==='unknown-required'?1:0
    expect(client.model.resume.relayCursor).toBe(reset.relayCursor+advances)
    expect(client.model.view.cursor).toBe(Number(object(reset.payload).cursor)+advances)
    if(fault==='unknown-required')expect(client.model.view.notices).toContain('required-event-unsupported')
    else expect(client.failure).toMatchObject({code:fault==='truncated-json'?'truncated-frame':fault==='invalid-json'?'invalid-frame':fault})
  }finally{await client.close();const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0);expect(outcome.replay[0]?.calls).toBe(0)}
})

it('socket reset recovers; real service reopen refuses the old mount before forwarding and captures replay safety before dispose',async()=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const world=join(parent,'phase17-reopen'),faults=new NativeFollowFaults(1),publications=nativeAcceptancePublications(false)
  let lab=await nativeReplayLab(world,'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications,faults}),live=true
  const reports:JsonValue[]=[],client=phone(lab.carrier.url,lab.sessionId,value=>reports.push(value)),prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
  try{
    await until(()=>client.model.view.connection==='connected')
    await client.core.submit('phase13-task','Fixed native replay task')
    await until(()=>client.model.view.task==='completed'&&client.model.view.messages.some(row=>row.rich.length>0))
    const reference=client.model.view.messages.flatMap(row=>row.rich)[0]!,mount=await client.core.mount(reference),values={title:'Final mobile input',count:'7'}
    await client.core.request('rich.invoke',{mountId:mount.mountId,actionId:'phase3-action',actionName:'submit',targetActionId:null,expectedDataRevision:mount.snapshot.dataRevision,values,fileGrants:[],draft:{baseRevision:mount.snapshot.draft.draftRevision,stateSchemaVersion:1,fields:values,dirty:Object.keys(values)}})
    await until(async()=>object(await client.core.request('rich.status',{mountId:mount.mountId,actionId:'phase3-action'})).state==='completed')
    const previousReads=lab.carrier.metrics.follows
    faults.arm('transport-reset');await until(()=>faults.report.written.length===1&&lab.carrier.metrics.disconnected>0)
    await until(()=>lab.carrier.metrics.follows>=previousReads+2&&client.model.view.connection==='connected');expect(client.failure).toBeUndefined()
    await client.core.submit('phase13-cancel','Fixed cancellable replay task')
    await until(()=>lab.ctx.llm.getOfflineReplayCounts().replay[0]?.calls===4)
    await client.core.cancel();await until(()=>client.model.view.task==='cancelled');await lab.ctx.agents.get(lab.sessionId)?.whenIdle()
    lab.ctx.llm.assertOfflineReplayConsumed();expect(prompt).toHaveBeenCalledTimes(3)
    const initial=await finishNativeReplayLab(lab);live=false;expect(initial.replay[0]?.calls).toBe(4)
    lab=await nativeReplayLab(world,'reopen',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications});live=true;client.repoint(lab.carrier.url)
    const reopenPrompt=vi.spyOn(lab.ctx.sessionController,'prompt')
    await until(()=>reports.some(value=>object(value).probe==='old-mount-generation'));expect(reports.filter(value=>object(value).probe==='old-mount-generation')).toHaveLength(1)
    expect(object(reports.find(value=>object(value).probe==='old-mount-generation')!)).toMatchObject({probe:'old-mount-generation',passed:true,forwarded:0})
    expect(client.failure).toBeUndefined();expect(await client.core.receipt('phase13-task')).toMatchObject({accepted:true})
    expect(reopenPrompt).not.toHaveBeenCalled();const restored=await client.core.mount(reference);expect(restored.snapshot.dataRevision).toBe(2)
  }finally{await client.close();if(live){const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0)}}
},30000)

it('socket recovery carries the unchanged live checkpoint from real BFF bytes through shared admission and native presentation without task dispatch',async()=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD;if(!parent)throw Error('Owned offline world required')
  const faults=new NativeFollowFaults(2),lab=await nativeReplayLab(join(parent,'phase25-checkpoint'),'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:50,publications:nativeAcceptancePublications(false),faults})
  const raw=JSON.parse(await readFile(join(import.meta.dirname,'../harmony/native-policy.json'),'utf8')) as {host:NativeHostPolicy}
  const policy={...raw.host,follow:{mode:'bounded' as const,maxSegments:128,maxFailures:4,retryDelayMs:5}}
  const network=new NetworkPhone({enabled:true,mode:'loopback-fixed-replay',baseUrl:lab.carrier.url,maxFrameBytes:1048576,maxReadChunkBytes:65536,requestTimeoutMs:1000,maxInFlight:8},fetch)
  const reports:JsonValue[]=[],views:NativeHostView[]=[],observed=observeNativeGeneration(network,value=>reports.push(value))
  const host=new NativeAppHost({async request(){throw Error('No cache or native IO expected')},async close(){}},policy,view=>views.push(view),undefined,[lab.sessionId],()=>({...observed,owner:{desktopId:id<'mobile-desktop'>('phase11-desktop'),deviceId:id<'mobile-device'>('phase11-phone'),sessionId:lab.sessionId},mode:'fixed-replay',metrics:()=>({tasks:0,actions:0,mounts:0})}))
  const prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
  try{
    await host.receive(JSON.stringify({protocol:'dsh-native-host/1',kind:'ui',generation:policy.port.generation,id:'phase25-connect',method:'connect.demo',payload:{sessionId:lab.sessionId}}))
    const before=lab.carrier.metrics.follows;faults.arm('transport-reset')
    await until(()=>faults.report.written.length===1&&lab.carrier.metrics.follows>=before+2)
    faults.arm('reset-snapshot')
    await until(()=>faults.report.checkpointFrame!==null&&reports.some(value=>{const record=object(value);return record.probe==='follow-admitted'&&record.commandId===faults.report.checkpointFrame!.commandId}))
    const receipt=faults.report.checkpointFrame!,marker=faults.report.checkpoint!
    expect(reports).toEqual(expect.arrayContaining([
      expect.objectContaining({probe:'follow-decoded',commandId:receipt.commandId,payloadSha256:receipt.payloadSha256,instance:receipt.instance,relayCursor:receipt.relayCursor,kind:'reset'}),
      expect.objectContaining({probe:'follow-admitted',commandId:receipt.commandId,liveTextSha256:receipt.textSha256,liveTextBytes:Buffer.byteLength(marker),domainCursor:receipt.domainCursor,connection:'connected',readOnly:false})
    ]))
    expect(views.at(-1)?.messages.find(message=>message.id==='native-live-'+lab.sessionId)?.text).toBe(marker)
    expect(views.at(-1)).toMatchObject({connection:'connected',readOnly:false,totalMessages:0})
    expect(faults.report.written).toEqual(['transport-reset','reset-snapshot']);expect(prompt).not.toHaveBeenCalled()
  }finally{await host.close();const outcome=await finishNativeReplayLab(lab);expect(outcome.realCalls).toBe(0);expect(outcome.replay[0]?.calls).toBe(0)}
})

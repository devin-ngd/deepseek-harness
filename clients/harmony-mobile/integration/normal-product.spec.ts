/** Existing normal profile services plus a test-injected model; no user data, credentials, carrier, installed profile or live provider. */
import { it, expect, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Approval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { installLlmReplay, type ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import { loadProfileServices } from './profile-services.ts'
import * as Product from '../desktop-plugin/src/product.ts'
import { invokeProfile, followProfile } from '../desktop-plugin/src/transport.ts'
import { deviceRemotePolicy } from '../desktop-plugin/src/device-policy.ts'
import type { AuthenticatedDeviceScope, AuthenticatedDeviceProvider } from '../desktop-plugin/src/admission.ts'
import { id } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { isRichJson } from '../src/upstream.ts'
import { parseWireItem, type WireItem } from '../src/wire.ts'
const desktopId=id<'mobile-desktop'>('normal-desktop'), deviceId=id<'mobile-device'>('normal-phone'), sessionId=id<'SessionId'>('owner-selected-session'), otherId=id<'SessionId'>('other-authorized-session')
const operations=['task.submit','task.receipt','session.sync','session.cancel','rich.mount','rich.snapshot','rich.saveDraft','rich.invoke','rich.status','rich.dispose'] as const
function object(value: unknown) { if (!isRichJson(value)||value===null||typeof value!=='object'||Array.isArray(value)) throw new Error('expected response JSON'); return value }
function textEntry(text: string): ReplayEntry { return {kind:'chunks',chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:text.slice(0,7)},{type:'text-delta',index:0,text:text.slice(7)},{type:'block-end',index:0,block:{type:'text',text}},{type:'finish',reason:{kind:'stop'}}]} }
async function fixture(label: string) {
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD; if(parent===undefined)throw new Error('isolated normal profile test required')
  const world=join(parent,label);await mkdir(world)
  const config=(await readFile(new URL('./cordis.yml',import.meta.url),'utf8')).replace('provider: rich-inline-replay','provider: normal-test-provider').replace('model: rich-inline-fixed','model: normal-test-model')
  const ctx=await loadProfileServices(world,config);await ctx.plugin(Gateway)
  ctx.provide('profileContext',{name:'normal-user-profile',dir:world,patchPath:join(world,'patch.yml'),installAnchor:world,cwd:world,home:world,startedBundles:[],overlays:[],telemetryDisabledEnv:undefined})
  await ctx.sessionController.create({sessionId,cwd:world});await ctx.sessionController.create({sessionId:otherId,cwd:world})
  let grant: AuthenticatedDeviceScope={desktopId,profileId:id<'mobile-profile'>('normal-user-profile'),deviceId,epoch:1,sessions:[sessionId,otherId],operations,expiresAt:Date.now()+60000,revoked:false}
  const callbacks=new Set<(device:typeof deviceId)=>Promise<void>>(), peer=ctx.connection.createPeer({principal:{kind:'harmony-device',desktopId,deviceId,epoch:1},interactions:'none'})
  const provider:AuthenticatedDeviceProvider={current:candidate=>candidate===peer?grant:undefined,onRevoke:callback=>{callbacks.add(callback);return()=>{callbacks.delete(callback)}}}
  ctx.provide('harmonyAuthenticatedDevices',provider);ctx.effect(()=>()=>peer.dispose())
  ctx.effect(()=>ctx.remoteAccess.registerPolicy('harmony-device',deviceRemotePolicy(principal=>principal===peer.principal?grant:undefined,Date.now)))
  let command=0
  const argument=(operation:string,payload:unknown)=>({version:PROFILE_RPC_CODEC,packet:JSON.stringify({protocol:MOBILE_LINK_PROTOCOL,desktopId,deviceId,grantEpoch:1,commandId:label+'-'+ ++command,expiresAt:Date.now()+30000,operation,payload})})
  const request=(operation:string,payload:unknown)=>invokeProfile(ctx,peer,{method:'request',argument:argument(operation,payload)},new AbortController().signal)
  const options={enabled:true,desktopId,profileId:'normal-user-profile',sessionId,journalMode:'create' as const}
  return {ctx,world,peer,request,argument,options,setGrant:(value:AuthenticatedDeviceScope)=>{grant=value},grant:()=>grant,model:async(entries:ReplayEntry[])=>{
    const file=join(world,'test-only-responses.json');await writeFile(file,JSON.stringify(entries)+'\n');return installLlmReplay(ctx,{file,overrideFile:file,offline:true,paceMs:1,providers:[{id:'normal-test-provider',models:[{id:'normal-test-model',contextWindow:100000,defaultMaxTokens:1000}]}]})
  }}
}
async function follow(f:Awaited<ReturnType<typeof fixture>>) {
  const controller=new AbortController(),frames:WireItem[]=[]
  const stream=await followProfile(f.ctx,f.peer,{argument:f.argument('session.sync',{sessionId,afterSeq:-1}),resume:{instance:null,relayCursor:-1}},controller.signal)
  const done=(async()=>{try{for await(const item of stream)frames.push(parseWireItem(item))}catch(error){if(!controller.signal.aborted||!(error instanceof Error)||!('code' in error)||error.code!=='gateway/cancelled')throw error}})()
  await vi.waitFor(()=>expect(frames.some(frame=>frame.kind==='reset')).toBe(true))
  return {frames,close:async()=>{controller.abort();await done}}
}
it('disabled normal product acquires nothing; enabled entry requires an explicit existing Session',async()=>{
  const f=await fixture('normal-config')
  try {await f.ctx.plugin(Product,{});expect(f.ctx.get('harmonyDesktop')).toBeUndefined();await expect(f.ctx.plugin(Product,{enabled:true,desktopId,profileId:'normal-user-profile'})).rejects.toThrow('explicit sessionId');await expect(f.ctx.plugin(Product,{...f.options,sessionId:'missing-session'})).rejects.toThrow();expect(f.ctx.get('harmonyDesktop')).toBeUndefined()}
  finally{await f.ctx.fiber.dispose()}
})
it('normal configuration selects one granted Session, submits and streams a single injected response with durable deduplication',async()=>{
  const f=await fixture('normal-flow');let subscription:Awaited<ReturnType<typeof follow>>|undefined
  try {
    let plugin=f.ctx.plugin(Product,f.options);await plugin
    const meta=object(await invokeProfile(f.ctx,f.peer,{method:'metadata',argument:null},new AbortController().signal));expect(meta.profileId).toBe('normal-user-profile');expect(meta.sessions).toEqual([sessionId]);expect(object(meta.catalog).sessions).toEqual([{sessionId,projectId:null,title:sessionId}])
    const prompt=vi.spyOn(f.ctx.sessionController,'prompt')
    await expect(f.request('task.submit',{sessionId:otherId,requestId:'other',text:'denied despite broad device grant'})).rejects.toMatchObject({code:'scope-denied'});expect(prompt).not.toHaveBeenCalled()
    const model=await f.model([textEntry('Configured normal profile response.')]);subscription=await follow(f)
    const task={sessionId,requestId:'one-normal-request',text:'Run in the configured normal profile.'};expect(await f.request('task.submit',task)).toMatchObject({accepted:true});await f.ctx.agents.get(sessionId)!.whenIdle()
    await vi.waitFor(()=>expect(subscription!.frames.some(frame=>JSON.stringify(frame.payload).includes('Configured normal profile response.'))).toBe(true))
    expect(subscription.frames.some(frame=>JSON.stringify(frame.payload).includes('assistant-stream'))).toBe(true)
    expect(await f.request('task.submit',task)).toMatchObject({accepted:true});expect(prompt).toHaveBeenCalledTimes(1)
    await expect(f.request('task.submit',{...task,text:'different intent'})).rejects.toMatchObject({code:'id-conflict'})
    await subscription.close();subscription=undefined;await plugin.dispose();plugin=f.ctx.plugin(Product,{...f.options,journalMode:'reopen'});await plugin
    expect(await f.request('task.submit',task)).toMatchObject({accepted:true});expect(prompt).toHaveBeenCalledTimes(1)
    model.assertConsumed();f.ctx.llm.assertZeroRealCalls();expect(f.ctx.llm.getOfflineReplayCounts().replay).toEqual([{calls:1,expectedCalls:1,realCalls:0,blockedCalls:0}]);expect(f.ctx.sessions.get(otherId)!.snapshotEvents().some(event=>event.type==='turn/start')).toBe(false)
    await plugin.dispose()
  } finally {await subscription?.close();await f.ctx.fiber.dispose()}
})
it('device revocation, wrong epoch and a grant excluding the selected Session cannot expose metadata or dispatch',async()=>{
  const f=await fixture('normal-permission')
  try {await f.ctx.plugin(Product,f.options);const prompt=vi.spyOn(f.ctx.sessionController,'prompt'),base=f.grant()
    for(const grant of [{...base,sessions:[otherId]},{...base,profileId:id<'mobile-profile'>('wrong-profile')},{...base,revoked:true},{...base,epoch:2},{...base,expiresAt:Date.now()-1}]){f.setGrant(grant);await expect(f.request('task.submit',{sessionId,requestId:'no-dispatch',text:'denied'})).rejects.toThrow()}
    f.setGrant({...base,sessions:[otherId]});await expect(invokeProfile(f.ctx,f.peer,{method:'metadata',argument:null},new AbortController().signal)).rejects.toMatchObject({code:'scope-denied'});expect(prompt).not.toHaveBeenCalled()
  }finally{await f.ctx.fiber.dispose()}
})
it('a model error remains a canonical failure and does not cause automatic resubmission',async()=>{
  const f=await fixture('normal-error')
  try {const model=await f.model([{kind:'throw',chunks:[],message:'test provider refused',code:'normal-test-error',accepted:true}]);await f.ctx.plugin(Product,f.options);const prompt=vi.spyOn(f.ctx.sessionController,'prompt'),task={sessionId,requestId:'error-request',text:'Trigger the injected error.'}
    expect(await f.request('task.submit',task)).toMatchObject({accepted:true});await f.ctx.agents.get(sessionId)!.whenIdle();expect(await f.request('task.submit',task)).toMatchObject({accepted:true});expect(prompt).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(f.ctx.sessions.get(sessionId)!.snapshotEvents())).toContain('test provider refused');model.assertConsumed();f.ctx.llm.assertZeroRealCalls()
  }finally{await f.ctx.fiber.dispose()}
})
it('a real desktop approval wait is streamed and cannot be answered or bypassed by the mobile entry',async()=>{
  const f=await fixture('normal-approval'), decision=Promise.withResolvers<ApprovalOutcome>();let executed=0,asked=false,subscription:Awaited<ReturnType<typeof follow>>|undefined
  try {
    await f.ctx.plugin(Approval);f.ctx.on('approval/request',()=>{asked=true;return decision.promise})
    f.ctx.effect(()=>f.ctx.tools.register(defineTool({name:'normal_test_permission',description:'Test-only permission gate',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(_args,exec)=>{
      if(exec.agent===undefined)throw new Error('test approval requires Agent');const outcome=await f.ctx.approval.request({agent:exec.agent,toolName:'normal_test_permission'});if(outcome!=='allowed-once')throw new Error('test approval denied');executed++;return 'approved'
    }})))
    const model=await f.model([{kind:'chunks',chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId('normal-approval-call'),name:'normal_test_permission',arguments:'{}'}},{type:'finish',reason:{kind:'tool-calls'}}]},textEntry('Desktop approval was denied.')]);await f.ctx.plugin(Product,f.options);subscription=await follow(f)
    expect(await f.request('task.submit',{sessionId,requestId:'approval-request',text:'Ask the desktop owner first.'})).toMatchObject({accepted:true});await vi.waitFor(()=>expect(asked).toBe(true));expect(executed).toBe(0)
    await vi.waitFor(()=>expect(subscription!.frames.some(frame=>JSON.stringify(frame.payload).includes('approval/asked'))).toBe(true))
    await expect(f.request('approval.respond',{sessionId,decision:'allowed-once'})).rejects.toThrow();expect(executed).toBe(0);expect(f.ctx.sessions.get(sessionId)!.snapshotEvents().some(event=>event.type==='turn/end')).toBe(false)
    decision.resolve('rejected');await f.ctx.agents.get(sessionId)!.whenIdle();expect(executed).toBe(0);model.assertConsumed();f.ctx.llm.assertZeroRealCalls()
  }finally{decision.resolve('cancelled');await subscription?.close();await f.ctx.fiber.dispose()}
})

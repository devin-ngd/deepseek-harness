/** Real DSH persistence and replay are exercised through the same byte decoder intended for native HTTP, with SDK substitutes explicitly labelled. */
import { spawn } from 'node:child_process'
import { CommandEpochClock } from '../src/command-clock.ts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { mobilePublications } from '../integration/mobile-publication.ts'
import { jsonPayload } from '../src/wire.ts'
import { object } from '../src/domain.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'

const ownerCommandClock = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)

it('the loopback wire marker accompanies only HTTP 200 protocol responses and never origin rejection',async()=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD
  if(!parent)throw new Error('Owned offline launcher required')
  const lab=await nativeReplayLab(join(parent,'phase14-marker'),'create',{port:0,clockAuthority:ownerCommandClock,grantTtlMs:60000,followSegmentMs:20000,publications:mobilePublications})
  try{
    const denied=await fetch(lab.carrier.url+'mobile/command',{method:'POST',headers:{'content-type':'application/json',origin:'https://guest.invalid'},body:'{}'})
    expect(denied.status).toBe(403);expect(denied.headers.get('x-dsh-mobile-stream')).toBeNull();await denied.text()
    const protocol=await fetch(lab.carrier.url+'mobile/command',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
    expect(protocol.status).toBe(200);expect(protocol.headers.get('content-type')).toBe('application/x-ndjson');expect(protocol.headers.get('x-dsh-mobile-stream')).toBe('dsh-mobile-wire/1;status=200')
    expect(JSON.parse((await protocol.text()).trim()).ok).toBe(false);lab.ctx.llm.assertZeroRealCalls()
  }finally{await lab.close()}
})

it('native byte core drives actual DSH replay services and durable reopen without task/action redispatch',async()=>{
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (!parent) throw new Error('Owned offline launcher required')
  const world=join(parent,'phase11-native-bytes'); await mkdir(world,{recursive:true})
  const records=[]
  for (const mode of ['create','reopen'] as const) {
    const lab=await nativeReplayLab(world,mode,{port:0,clockAuthority:ownerCommandClock,grantTtlMs:180000,followSegmentMs:20000,publications:mobilePublications})
    try {
      const upload=vi.spyOn(lab.ctx.deepseekLlmApiExtensions,'prepare').mockImplementation(async()=>{throw new Error('UPLOAD_DISABLED')})
      const prompt=vi.spyOn(lab.ctx.sessionController,'prompt')
      const report=join(world,'phone-'+mode+'.json')
      const child=spawn(process.execPath,['--test','--test-isolation=none',fileURLToPath(new URL('./phase11-phone.test.mjs',import.meta.url))],{
        cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],
        env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,windir:process.env.windir,ComSpec:process.env.ComSpec,TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_PHONE_URL:lab.carrier.url,DSH_HARMONY_PHONE_REPORT:report,DSH_HARMONY_CANCEL_READY:lab.replay.readyFile,DSH_HARMONY_PHASE11_MODE:mode},
      })
      let log='',timedOut=false,exceeded=false
      const append=(chunk:Buffer)=>{if(Buffer.byteLength(log)+chunk.length>131072){exceeded=true;child.kill();return}log+=chunk.toString('utf8')}
      child.stdout.on('data',append);child.stderr.on('data',append)
      const timer=setTimeout(()=>{timedOut=true;child.kill()},45000)
      const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))}).finally(()=>clearTimeout(timer))
      await writeFile(new URL('../evidence/phase11-phone-'+mode+'.txt',import.meta.url),log.replaceAll('\r\n','\n').trimEnd()+'\n')
      expect({...exit,timedOut,exceeded},log).toEqual({code:0,signal:null,timedOut:false,exceeded:false})
      const phone=object(jsonPayload(JSON.parse(await readFile(report,'utf8'))))
      expect(phone.processId).toBe(child.pid);expect(phone.processId).not.toBe(process.pid)
      await lab.ctx.agents.get(lab.sessionId)?.whenIdle()
      lab.ctx.llm.assertZeroRealCalls();expect(upload).not.toHaveBeenCalled()
      const counts=lab.ctx.llm.getOfflineReplayCounts()
      if(mode==='create'){lab.replay.handle.assertConsumed();lab.ctx.llm.assertOfflineReplayConsumed();expect(prompt).toHaveBeenCalledTimes(3);expect(counts.replay[0]?.calls).toBe(4)}
      else{expect(prompt).not.toHaveBeenCalled();expect(counts.replay[0]?.calls).toBe(0);expect(()=>lab.ctx.llm.assertOfflineReplayConsumed()).toThrow()}
      expect(counts.realCalls).toBe(0);expect(counts.replay[0]?.blockedCalls).toBe(0)
      await lab.close();expect(lab.carrier.metrics.active).toBe(0)
      records.push({mode,serverProcessId:process.pid,phone,counts,promptCalls:prompt.mock.calls.length,uploadCalls:upload.mock.calls.length,instance:lab.instance,listener:lab.carrier.url,listenerClosed:true,metrics:lab.carrier.metrics})
    } finally {await lab.close()}
  }
  expect(records[0]?.instance).not.toBe(records[1]?.instance)
  await writeFile(new URL('../evidence/phase11-real-services.json',import.meta.url),JSON.stringify({layer:'actual SessionController/agent-loop/RichInline/JSONL/StorageDomain/Gateway; distinct Node phone plus SDK substitute, not emulator',world,records,actualDesktopInstalled:false,nativeHttpQualified:false,arkWebQualified:false,realModelCalls:0,uploadCalls:0},null,2)+'\n')
},110000)

it('approved acceptance owner reopens the original loopback port and durable admission without task redispatch', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (!parent) throw new Error('Owned offline launcher required')
  const world = join(parent, 'phase13-port-reopen')
  const first = await nativeReplayLab(world, 'create', { port: 0, clockAuthority:ownerCommandClock,grantTtlMs:10000,followSegmentMs:20000, publications: mobilePublications })
  const port = Number(new URL(first.carrier.url).port), instance = first.instance
  const packet = (commandId: string) => JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId: 'phase11-desktop', deviceId: 'phase11-phone', grantEpoch: 1,
    commandId, expiresAt: Date.now() + 5000, operation: 'task.submit', payload: { sessionId: first.sessionId, requestId: 'phase13-port-task', text: 'Fixed port recovery task' } })
  try {
    await first.ctx.typertGateway.invoke({ peer: first.ctx.connection.browserPeer, namespace: 'harmonyMobile', method: 'request', args: { packet: packet('phase13-seed') } })
    await first.ctx.agents.get(first.sessionId)?.whenIdle()
    first.ctx.llm.assertZeroRealCalls()
  } finally { await first.close() }
  vi.stubEnv('DSH_HARMONY_NATIVE_ACCEPTANCE', 'approved-phase13')
  try {
    const reopened = await nativeReplayLab(world, 'reopen', { port, clockAuthority:ownerCommandClock,grantTtlMs:10000,followSegmentMs:20000, publications: mobilePublications })
    try {
      expect(reopened.carrier.url).toBe('http://127.0.0.1:' + port + '/')
      expect(reopened.instance).not.toBe(instance)
      const prompt = vi.spyOn(reopened.ctx.sessionController, 'prompt')
      await reopened.ctx.typertGateway.invoke({ peer: reopened.ctx.connection.browserPeer, namespace: 'harmonyMobile', method: 'request', args: { packet: packet('phase13-repeat') } })
      expect(prompt).not.toHaveBeenCalled()
      expect(reopened.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(0)
      reopened.ctx.llm.assertZeroRealCalls()
    } finally { await reopened.close() }
  } finally { vi.unstubAllEnvs() }
},30000)

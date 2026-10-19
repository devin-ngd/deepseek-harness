/** Native HTTP adapter logic under SDK substitutes; real byte parsing is shared and no native/device success is claimed. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ByteNetworkPhone } from '../.build/network-phone.js'
import { NativeHttpBytePort } from '../.build/native-http-port.js'
import { NativeHttpStream, NativeStreamPolicy, sdk, resetSdk } from '../.build/native-adapters.js'
const tick=()=>new Promise(accept=>setImmediate(accept))
const config={enabled:true,mode:'loopback-fixed-replay',baseUrl:'http://127.0.0.1:32123/',maxFrameBytes:1024,maxReadChunkBytes:64,requestTimeoutMs:200,maxInFlight:4}
const command={protocol:'dsh-mobile-link/1',desktopId:'desk',deviceId:'phone',grantEpoch:1,commandId:'native-http-command',expiresAt:Date.now()+60000,operation:'session.sync',payload:{sessionId:'session',afterSeq:-1}}
function createPort(maxQueuedBytes=1024){return new NativeHttpBytePort({maxQueuedBytes,maxChunks:1024,create:url=>new NativeHttpStream(new NativeStreamPolicy(true,url,1024,4096,200))})}
function deliver(request,text){request.emit('headersReceive',{'content-type':'application/x-ndjson'});request.respond(200);return tick().then(()=>{const bytes=new TextEncoder().encode(text);for(let offset=0;offset<bytes.length;offset+=7)request.emit('dataReceive',bytes.slice(offset,offset+7).buffer);request.emit('dataEnd')})}

test('disabled native byte network rejects before creating SDK work and configured HTTPS remains unavailable',async()=>{
  resetSdk();const phone=new ByteNetworkPhone({enabled:false},createPort())
  await assert.rejects(phone.request(command),error=>error.code==='disabled');assert.equal(sdk.requests.length,0)
  assert.throws(()=>new ByteNetworkPhone({...config,mode:'configured-https'},createPort()),error=>error.code==='live-provider-unavailable')
  await phone.close()
})
test('native unary byte path decodes UTF8 using shared reply parser and disposes SDK callbacks',async()=>{
  resetSdk();const phone=new ByteNetworkPhone(config,createPort()),result=phone.request(command);await tick()
  const request=sdk.requests[0];await deliver(request,JSON.stringify({protocol:'dsh-mobile-wire/1',mode:'fixed-replay',commandId:command.commandId,ok:true,value:{text:'共享原生🙂'}})+'\n')
  assert.deepEqual(await result,{text:'共享原生🙂'});assert.equal(phone.state.connection,'connected');assert.equal(request.destroyed,true);assert.equal(request.listeners.size,0)
  assert.equal(request.options.url,'http://127.0.0.1:32123/mobile/command');assert.equal(request.options.usingProxy,false);assert.equal(request.options.maxRedirects,0);await phone.close()
})
test('native byte scope refuses guest endpoints before factory and ignores caller-shaped URL authority',async()=>{
  resetSdk();const port=createPort()
  for(const url of ['http://127.0.0.1:32123/api','https://example.invalid/mobile/command','http://x:y@127.0.0.1:32123/mobile/command','http://127.0.0.1:32123/mobile/follow?q=1'])await assert.rejects(port.open(new URL(url),'{}',new AbortController().signal),error=>error.code==='scope-denied')
  assert.equal(sdk.requests.length,0)
})
test('native shared follow rejects foreign Session and releases its SDK request without reconnect',async()=>{
  resetSdk();const phone=new ByteNetworkPhone(config,createPort()),iterator=phone.follow(command,{instance:null,relayCursor:-1})[Symbol.asyncIterator](),result=iterator.next();await tick()
  const request=sdk.requests[0];await deliver(request,JSON.stringify({type:'item',streamId:command.commandId,value:{protocol:'dsh-mobile-wire/1',mode:'fixed-replay',kind:'reset',desktopId:'desk',deviceId:'phone',sessionId:'foreign',instance:'owner',relayCursor:0,payload:null}})+'\n')
  await assert.rejects(result,error=>error.code==='scope-denied');assert.equal(request.destroyed,true);assert.equal(phone.state.connection,'disconnected');assert.equal(sdk.requests.length,1);await phone.close()
})
test('native callback queue overflow destroys the request and exposes failure rather than partial data',async()=>{
  resetSdk();const phone=new ByteNetworkPhone(config,createPort(3)),result=phone.request(command);await tick()
  const request=sdk.requests[0];await deliver(request,'0123456\n');await assert.rejects(result,error=>error.code==='native-byte-queue-full');assert.equal(request.destroyed,true);await phone.close()
})
test('native byte EOF with incomplete NDJSON refuses and caller abort never resubmits',async()=>{
  resetSdk();const phone=new ByteNetworkPhone(config,createPort()),abort=new AbortController(),result=phone.request(command,abort.signal);await tick()
  await deliver(sdk.requests[0],'{}');await assert.rejects(result,error=>error.code==='truncated-frame')
  const pending=phone.request(command,abort.signal);await tick();abort.abort();await assert.rejects(pending,error=>error.code==='cancelled');assert.equal(sdk.requests.length,2);assert.ok(sdk.requests.every(request=>request.destroyed));await phone.close()
})
test('native SDK permission denial remains explicit and causes no retry or returned domain bytes',async()=>{
  resetSdk();const phone=new ByteNetworkPhone(config,createPort()),result=phone.request(command);await tick()
  sdk.requests[0].reject(Object.assign(new Error('permission'),{code:201}));await assert.rejects(result,error=>error.code==='stream-permission-denied');assert.equal(sdk.requests.length,1);assert.equal(sdk.requests[0].destroyed,true);await phone.close()
})

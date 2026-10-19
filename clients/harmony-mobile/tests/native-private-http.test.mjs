/** SDK substitutes exercise native leases and the real private-port/shared decoder chain; no native execution claim. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {NativeHttpIo,NativeHttpIoPolicy,NativeRuntimeOwner,NATIVE_DOCUMENT,sdk,resetSdk,context} from '../.build/native-adapters.js'
import {ByteNetworkPhone} from '../.build/network-phone.js'
import {NativePortHttpBytePort} from '../.build/native-port-http.js'
import {privateHttpPort} from './helpers/native-private-http.mjs'
const tick=()=>new Promise(accept=>setImmediate(accept)),base='http://127.0.0.1:32123/'
const policy=(queue=1024,chunks=64,timeout=200)=>new NativeHttpIoPolicy(true,base,1024,4096,queue,chunks,4,timeout)
const config={enabled:true,mode:'loopback-fixed-replay',baseUrl:base,maxFrameBytes:1024,maxReadChunkBytes:1024,requestTimeoutMs:500,maxInFlight:4}
const command={protocol:'dsh-mobile-link/1',desktopId:'desk',deviceId:'phone',grantEpoch:1,commandId:'private-command',expiresAt:Date.now()+60000,operation:'session.sync',payload:{sessionId:'session',afterSeq:-1}}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await tick()}throw new Error('Bounded callback wait failed')}
async function deliver(request,text){request.emit('headersReceive',{'content-type':'application/x-ndjson'});request.respond(200);await tick();const bytes=new TextEncoder().encode(text);for(let offset=0;offset<bytes.length;offset+=7)request.emit('dataReceive',bytes.slice(offset,offset+7).buffer);request.emit('dataEnd')}

test('private port pulls UTF8 bytes from compiled SDK owner into shared reply decoder without transmitting a URL',async()=>{
  resetSdk();const native=new NativeHttpIo(policy()),adapter=privateHttpPort(native,base),phone=new ByteNetworkPhone(config,adapter.port)
  try{const result=phone.request(command);await until(()=>sdk.requests.length===1)
    await deliver(sdk.requests[0],JSON.stringify({protocol:'dsh-mobile-wire/1',mode:'fixed-replay',commandId:command.commandId,ok:true,value:{text:'原生字节🌕'}})+'\n')
    assert.deepEqual(await result,{text:'原生字节🌕'});assert.ok(adapter.calls.some(call=>call.method==='http.read'));assert.equal(adapter.calls.filter(call=>call.method==='http.close').length,1)
    assert.deepEqual(adapter.calls.find(call=>call.method==='http.begin').payload,{endpoint:'command',body:JSON.stringify(command)})
    assert.ok(sdk.requests[0].destroyed);assert.equal(sdk.requests[0].listeners.size,0)
  }finally{await phone.close();await adapter.close()}
})
test('private endpoint selector cannot activate disabled native HTTP, choose an address or use a foreign handle',async()=>{
  resetSdk();const disabled=new NativeHttpIo(new NativeHttpIoPolicy(false,'',64,128,64,4,1,50))
  assert.throws(()=>disabled.begin('command','{}'),error=>error.code==='stream-disabled');assert.equal(sdk.requests.length,0);await disabled.close()
  const native=new NativeHttpIo(policy())
  for(const endpoint of ['http://example.invalid/','command?x=1','shell.exec'])assert.throws(()=>native.begin(endpoint,'{}'),error=>error.code==='native-http-endpoint-denied')
  await assert.rejects(native.read('foreign'),error=>error.code==='native-http-handle-denied');await assert.rejects(native.closeHandle('foreign'),error=>error.code==='native-http-handle-denied');assert.equal(sdk.requests.length,0)
  const port=new NativePortHttpBytePort({request(){throw new Error('No call expected')},async close(){}},{baseUrl:base,maxChunkBytes:64})
  for(const url of ['http://127.0.0.1:32124/mobile/command',base+'mobile/command?x=1',base+'mobile/other'])await assert.rejects(port.open(new URL(url),'{}',new AbortController().signal),error=>error.code==='scope-denied')
  await native.close()
})
test('native byte leases cap simultaneous requests and pending reads, then release every SDK callback on retirement',async()=>{
  resetSdk();const native=new NativeHttpIo(new NativeHttpIoPolicy(true,base,128,512,128,8,1,200)),handle=native.begin('follow','{}'),pending=native.read(handle)
  assert.throws(()=>native.begin('command','{}'),error=>error.code==='native-http-busy');await assert.rejects(native.read(handle),error=>error.code==='native-http-read-busy')
  const rejected=assert.rejects(pending,error=>error.code==='native-http-closed');await native.close();await rejected
  assert.equal(sdk.requests.length,1);assert.ok(sdk.requests[0].destroyed);assert.equal(sdk.requests[0].listeners.size,0);assert.throws(()=>native.begin('command','{}'),error=>error.code==='native-http-retired')
})
test('slow private consumer overflow and absolute lease deadline close SDK work without retries',async()=>{
  resetSdk();const native=new NativeHttpIo(policy(3)),handle=native.begin('follow','{}');await deliver(sdk.requests[0],'01234567\n')
  await assert.rejects(native.read(handle),error=>error.code==='native-http-queue-full');await native.close();assert.equal(sdk.requests.length,1);assert.ok(sdk.requests[0].destroyed)
  resetSdk();const expiring=new NativeHttpIo(policy(1024,64,20)),lease=expiring.begin('follow','{}')
  await assert.rejects(expiring.read(lease),error=>error.code==='native-http-lease-expired'||error.code==='stream-timeout');await expiring.close();assert.ok(sdk.requests[0].destroyed)
})
test('private abort awakens an outstanding read and awaits one native close without resubmission',async()=>{
  resetSdk();const native=new NativeHttpIo(policy()),adapter=privateHttpPort(native,base),phone=new ByteNetworkPhone(config,adapter.port),abort=new AbortController()
  try{const result=phone.request(command,abort.signal),rejected=assert.rejects(result,error=>error.code==='cancelled'||error.code==='native-http-closed');await until(()=>adapter.calls.some(call=>call.method==='http.read'));abort.abort();await rejected
    assert.equal(sdk.requests.length,1);assert.ok(sdk.requests[0].destroyed);assert.equal(adapter.calls.filter(call=>call.method==='http.close').length,1)
  }finally{await phone.close();await adapter.close()}
})
test('private SDK status, MIME, permission and truncated EOF failures reach shared transport without returned domain data',async()=>{
  for(const failure of ['status','mime','permission','eof']){
    resetSdk();const native=new NativeHttpIo(policy()),adapter=privateHttpPort(native,base),phone=new ByteNetworkPhone(config,adapter.port)
    try{const result=phone.request(command),rejected=assert.rejects(result,error=>error.code===({status:'stream-http-rejected',mime:'stream-content-type-invalid',permission:'stream-permission-denied',eof:'truncated-frame'})[failure]);await until(()=>sdk.requests.length===1);const request=sdk.requests[0]
      if(failure==='status')request.respond(503)
      else if(failure==='mime')request.emit('headersReceive',{'content-type':'text/html'})
      else if(failure==='permission')request.reject(Object.assign(new Error('permission'),{code:201}))
      else await deliver(request,'{}')
      await rejected;assert.ok(request.destroyed);assert.equal(sdk.requests.length,1)
    }finally{await phone.close();await adapter.close()}
  }
})
test('malformed private byte reply rejects and native close failure remains visible',async()=>{
  const io={async request(method){if(method==='http.begin')return{handle:'lease'};if(method==='http.read')return{kind:'chunk',base64:'AB=='};return true},async close(){}}
  const port=new NativePortHttpBytePort(io,{baseUrl:base,maxChunkBytes:64}),response=await port.open(new URL(base+'mobile/command'),'{}',new AbortController().signal)
  await assert.rejects(response.body[Symbol.asyncIterator]().next(),error=>error.code==='native-http-reply-invalid')
  const failed=new NativePortHttpBytePort({...io,async request(method){if(method==='http.close')return false;return io.request(method)}},{baseUrl:base,maxChunkBytes:64}),closing=await failed.open(new URL(base+'mobile/command'),'{}',new AbortController().signal)
  await assert.rejects(closing.close(),error=>error.code==='native-http-close-unconfirmed')
})
test('native SDK disposal failure remains visible and retirement drains sibling leases before reporting failure',async()=>{
  resetSdk();const native=new NativeHttpIo(policy()),first=native.begin('follow','{}'),second=native.begin('command','{}')
  sdk.faults.set('http.off',1)
  await assert.rejects(native.closeHandle(first),error=>error.code==='stream-cleanup-failed')
  await assert.rejects(native.read(first),error=>error.code==='stream-cleanup-failed')
  await assert.rejects(native.close(),error=>error.code==='native-http-cleanup-failed')
  assert.ok(sdk.requests.every(request=>request.destroyed));await assert.rejects(native.read(second),error=>error.code==='native-http-handle-denied')
})
test('actual native private owner rejects HTTP activation and stale generations with the unchanged empty-permission HAP',async()=>{
  resetSdk();const manifest=JSON.parse(await readFile('harmony/entry/src/main/resources/rawfile/native-runtime-source-manifest.json','utf8'))
  for(const entry of manifest.resources)sdk.resources.set(entry.name,await readFile('harmony/entry/src/main/resources/rawfile/'+entry.name))
  globalThis.canIUse=()=>true;const errors=[],owner=new NativeRuntimeOwner();owner.initialize(context(),()=>{},code=>errors.push(code),()=>{});owner.load();owner.bind(NATIVE_DOCUMENT)
  const port=owner.controller.ports[0],packet={protocol:'dsh-native-host/1',kind:'io',id:'probe',generation:1,method:'http.begin',payload:{endpoint:'command',body:'{}'}}
  port.emit(JSON.stringify(packet));await tick();assert.equal(JSON.parse(port.posted.at(-1)).code,'stream-disabled');assert.equal(sdk.requests.length,0)
  port.emit(JSON.stringify({...packet,id:'stale',generation:2}));await tick();assert.ok(!port.posted.some(raw=>JSON.parse(raw).id==='stale'));await owner.close();assert.ok(port.closed)
})

test('documented SDK receive and timeout failures remain retryable reads while permission, certificate and parameter failures stop',async()=>{
  for(const [code,expected] of [[2300056,'transport-lost'],[2300018,'transport-lost'],[2300007,'transport-lost'],[2300028,'timeout'],[201,'stream-permission-denied'],[401,'stream-request-failed'],[2300060,'stream-request-failed'],[2300999,'stream-request-failed']]){
    resetSdk();const native=new NativeHttpIo(policy()),adapter=privateHttpPort(native,base),phone=new ByteNetworkPhone(config,adapter.port)
    try{
      const result=phone.request(command),rejected=assert.rejects(result,error=>error.code===expected)
      await until(()=>sdk.requests.length===1);sdk.requests[0].reject(Object.assign(new Error('SDK fixed failure'),{code}));await rejected
      assert.equal(sdk.requests.length,1);assert.equal(adapter.calls.filter(call=>call.method==='http.close').length,1)
    }finally{await phone.close();await adapter.close()}
  }
})

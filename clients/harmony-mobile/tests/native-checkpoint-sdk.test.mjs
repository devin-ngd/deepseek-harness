/** Staged acceptance .ets parsing, byte diagnostics and private native publication under SDK substitutes; no ArkUI qualification. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { NativeHttpStream, NativeStreamPolicy, NativeRuntimeOwner, NATIVE_DOCUMENT, sdk, resetSdk, context } from '../.build/phase27-sdk.js'
const tick=()=>new Promise(accept=>setImmediate(accept))
const marker='DSH read checkpoint staged-sdk'
globalThis.canIUse=()=>true

test('actual staged byte provider correlates successful delivery and retained transport failure to command id',async()=>{
  const messages=[],old=console.info;console.info=value=>messages.push(value)
  try{
    for(const success of [true,false]){
      resetSdk();const commandId=success?'read-9':'read-reset',stream=new NativeHttpStream(new NativeStreamPolicy(true,'http://127.0.0.1:18081/mobile/follow',65536,1048576,1000)),sink={chunks:[],errors:[],chunk(bytes){this.chunks.push(bytes)},end(){},failed(code){this.errors.push(code)}}
      const work=stream.open(JSON.stringify({command:{commandId,expiresAt:Date.now()+53000,operation:'session.sync'}}),sink),request=sdk.requests[0],bytes=new TextEncoder().encode(marker+'\n')
      request.emit('headersReceive',{'content-type':'application/x-ndjson','x-dsh-mobile-stream':'dsh-mobile-wire/1;status=200'});request.emit('dataReceive',bytes.buffer)
      if(success){request.emit('dataEnd');request.respond(200)}else request.reject({code:2300018})
      await work
      const records=messages.filter(value=>value.startsWith('DSH native byte delivery: ')).map(value=>JSON.parse(value.slice('DSH native byte delivery: '.length))),record=records.find(value=>value.commandId===commandId)
      assert.equal(record.receivedBytes,bytes.length);assert.equal(record.deliveredBytes,bytes.length);assert.equal(record.ended,success);assert.equal(record.code,success?'':'transport-lost');assert.equal(request.destroyed,true)
    }
  }finally{console.info=old}
})
test('actual staged private native owner publishes the exact live text and rejects malformed admission diagnostics',async()=>{
  resetSdk();const root='.build/native-network-project/entry/src/main/resources/rawfile/',manifest=JSON.parse(await readFile(root+'native-runtime-source-manifest.json','utf8'))
  for(const item of manifest.resources)sdk.resources.set(item.name,await readFile(root+item.name))
  const messages=[],views=[],errors=[],old=console.info;console.info=value=>messages.push(value)
  const owner=new NativeRuntimeOwner()
  try{
    owner.initialize(context(),view=>views.push(view),code=>errors.push(code),()=>{});owner.load();owner.bind(NATIVE_DOCUMENT)
    const port=owner.controller.ports[0]
    port.deliver=raw=>{const call=JSON.parse(raw);if(call.kind==='ui')queueMicrotask(()=>port.emit(JSON.stringify({protocol:call.protocol,kind:'ui.reply',generation:call.generation,id:call.id,ok:true,value:{connected:true,closed:true}})))}
    port.emit(JSON.stringify({protocol:'dsh-native-host/1',kind:'ready',generation:1}));await tick();owner.command('connect.demo','phase11-session');await tick()
    port.emit(JSON.stringify({protocol:'dsh-native-host/1',kind:'view',generation:1,view:{sessionId:'phase11-session',desktopId:'phase11-desktop',task:'cancelled',connection:'connected',error:'',readOnly:false,messages:[{id:'native-live-phase11-session',role:'assistant',text:marker,hasRich:false,hasImage:false,imageWidth:0,imageHeight:0}],hasMore:false,totalMessages:0,offline:false}}));await tick()
    assert.equal(views.at(-1).messages[0].text,marker)
    const published=messages.find(value=>value.startsWith('DSH native live message admitted: '));assert(published);assert.equal(JSON.parse(published.slice('DSH native live message admitted: '.length)).text,marker)
    const diagnostic={probe:'follow-decoded',commandId:'read-9',instance:'instance',relayCursor:-1,kind:'reset',payloadSha256:'a'.repeat(64)}
    const packet=value=>JSON.stringify({protocol:'dsh-native-host/1',kind:'ui.reply',generation:1,id:'native-acceptance-report',ok:true,value})
    port.emit(packet(diagnostic));await tick();assert(messages.some(value=>value.startsWith('DSH native follow diagnostic: ')))
    port.emit(packet({...diagnostic,payloadSha256:'invalid'}));await tick();assert.equal(owner.diagnosticFailures,1);assert.equal(errors.includes('native-port-failed'),false)
  }finally{await owner.close();console.info=old}
})

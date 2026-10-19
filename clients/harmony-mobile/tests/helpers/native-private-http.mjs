/** Node MessageChannel + compiled .ets owner logic; this is a private-carrier substitute, not ArkWeb/native HTTP evidence. */
import { NativePortClient } from '../../.build/native-port.js'
import { NativePortHttpBytePort } from '../../.build/native-port-http.js'

/** @param native - compiled SDK-substitute lease owner. @param baseUrl - exact test-only loopback base. @param maxChunkBytes - decoded reply cap. @returns private carrier plus awaited retirement. */
export function privateHttpPort(native, baseUrl, maxChunkBytes = 65536) {
  const channel = new MessageChannel(), generation = 7, calls = [], work = new Set()
  const carrier = new NativePortClient(channel.port1, {generation, maxBytes:2097152, maxPending:8, timeoutMs:25000})
  channel.port2.onmessage = event => {
    const call = JSON.parse(event.data)
    if(call.protocol!=='dsh-native-host/1'||call.kind!=='io'||call.generation!==generation)throw new Error('Private test packet invalid')
    calls.push(call)
    const task = (async()=>{
      const reply={protocol:call.protocol,kind:'io.reply',id:call.id,generation,ok:false}
      try{
        if(call.method==='http.begin')reply.value={handle:native.begin(call.payload.endpoint,call.payload.body)}
        else if(call.method==='http.read')reply.value=await native.read(call.payload.handle)
        else if(call.method==='http.close')reply.value=await native.closeHandle(call.payload.handle)
        else throw new Error('Private test method denied')
        reply.ok=true
      }catch(error){reply.code=error.code??'native-io-failed'}
      channel.port2.postMessage(JSON.stringify(reply))
    })()
    work.add(task);void task.then(()=>work.delete(task),()=>work.delete(task))
  }
  channel.port2.start()
  return{port:new NativePortHttpBytePort(carrier,{baseUrl,maxChunkBytes}),calls,carrier,
    async close(){let failure;try{await native.close()}catch(error){failure=error}finally{await Promise.all([...work]);await carrier.close();channel.port2.close()}if(failure)throw failure}}
}

/** Actual ETS socket callback handling with a NetworkKit substitute; no real connection or grant. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeRelaySocket, NativeRelayPolicy, network, resetProductSdk } from '../.build/product-native.js'
import { connectionMarkers } from '../scripts/phase68-connection-lines.mjs'
for(const status of ['403','503'])for(const callbackStyle of ['direct','async'])test('HTTP '+status+' refusal occurs before E2E frames: '+callbackStyle,async()=>{
  resetProductSdk();const callbacks=new Map(),lines=[],info=console.info;let closes=0,frames=0
  console.info=value=>lines.push(value);network.factory=()=>({on:(name,callback)=>callbacks.set(name,callback),connect:async()=>true,send:async()=>true,close:async()=>{closes++;return true}})
  const authority={},socket=new NativeRelaySocket(new NativeRelayPolicy(authority,'relay.fixture.example',26,10000,4096,8192))
  try{await socket.connectNative(authority,'fixed-room-123456','phone','2'.repeat(64),()=>{frames++},()=>{});const failure={code:200,data:status,message:'private network message'};callbacks.get('error')(...(callbackStyle==='direct'?[failure]:[undefined,failure]));await socket.closeNative(authority);assert.equal(frames,0);assert.equal(closes,1);assert.deepEqual(connectionMarkers(lines.join('\n')).at(-1),{role:'phone',plane:'data',stage:'socket-error',code:200,httpStatus:Number(status)});assert.equal(lines.join().includes('private network'),false)}finally{await socket.closeNative(authority);console.info=info}
})

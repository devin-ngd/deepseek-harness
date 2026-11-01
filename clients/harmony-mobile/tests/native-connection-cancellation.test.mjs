/** Controlled acquisition and handshake gates; no device, real identity, sockets or wall-clock expiry. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const api=await import(pathToFileURL(process.env.DSH_PHONE_DIAGNOSTIC_MODULE).href)
const policy=JSON.parse(await readFile('product.config.json','utf8'))
function gate(){let resolve;const promise=new Promise(yes=>{resolve=yes});return{promise,resolve}}
function mobile(connect){const authority={},views=[],product=new api.DeviceBoundMobileProduct(authority,{load:async()=>({}),ticket:async()=>({expiresAt:5000})},{connect},()=>1000,{after:()=>()=>{}},view=>views.push(view));return{product,authority,views}}
function connection(close=async()=>{}){return{authentication:'native',route:{routeId:'fixture-route',routeEpoch:1,expiresAt:5000},binding:{id:'fixture-channel',remoteCredentialId:'fixture',signal:new AbortController().signal},readyTicket:async()=>({}),catalog:async()=>[],select:async()=>{throw Error('unused')},close}}

function selectedMobile(options={}){
 const events=[],stops=[],m=mobile(async()=>makeConnection());let opens=0
 function makeConnection(){
  const id=++opens,abort=new AbortController();let open=true
  const rpc=new api.DeviceProductRpc({request:async()=>{},follow:async()=>{},stop:async key=>{events.push('view-stop-'+id);await options.release?.();if(!open)throw Error('provider closed before consumer');stops.push(key)}},{after:()=>()=>{}},100,8,'fixture')
  const route={desktopId:'fixture',profileId:'desktop',sessionId:'fixture-session'},value=connection(async()=>{events.push('channel-close-'+id);open=false;abort.abort();rpc.close();await options.close?.()})
  value.binding={...value.binding,id:'fixture-'+id,signal:abort.signal};value.catalog=async()=>[{profileId:'desktop',sessionId:route.sessionId,title:'Fixture',projectId:null}]
  value.select=async(_route,_ticket,publish,lifetime)=>{const view=rpc.view(route,()=>{});await view.follow('follow','{"argument":{},"resume":null}');await options.select?.({publish,lifetime});return{richRequest:async()=>'',close:()=>view.close()}}
  return value
 }
 return{...m,events,stops,opens:()=>opens}
}

test('an established Session retires its actual RPC view before its channel and the same owner reconnects',async()=>{
 const f=selectedMobile()
 try{
  await f.product.connect(f.authority);await f.product.select(f.authority,'fixture-session')
  await f.product.disconnect(f.authority)
  assert.deepEqual(f.events,['view-stop-1','channel-close-1']);assert.equal(f.stops.length,1)
  await f.product.connect(f.authority);assert.equal(f.opens(),2);assert.equal(f.product.view.state,'connected')
 }finally{await f.product.close()}
})

test('reconnect waits for the selected RPC consumer to finish before releasing its provider',async()=>{
 const entered=gate(),released=gate(),f=selectedMobile({release:async()=>{entered.resolve();await released.promise}})
 await f.product.connect(f.authority);await f.product.select(f.authority,'fixture-session')
 const stopping=f.product.disconnect(f.authority),outcome=stopping.then(()=>null,error=>error)
 const replacement=f.product.connect(f.authority),replacementOutcome=replacement.then(()=>null,error=>error)
 try{
  await entered.promise;assert.deepEqual(f.events,['view-stop-1']);assert.equal(f.opens(),1)
  released.resolve();assert.equal(await outcome,null);assert.equal(await replacementOutcome,null)
  assert.equal(f.opens(),2);assert.equal(f.product.view.state,'connected')
 }finally{released.resolve();await outcome;await replacementOutcome;await f.product.close()}
})

test('a late selected RPC view is retired before its channel and cannot publish into a replacement',async()=>{
 const entered=gate(),release=gate();let prior
 const f=selectedMobile({select:async value=>{prior=value;entered.resolve();await release.promise}})
 await f.product.connect(f.authority);const selected=f.product.select(f.authority,'fixture-session'),rejected=assert.rejects(selected);await entered.promise
 const stopped=f.product.disconnect(f.authority),replacement=f.product.connect(f.authority)
 try{
  assert.equal(prior.lifetime.aborted,true);assert.equal(f.opens(),1);assert.deepEqual(f.events,[])
  release.resolve();await rejected;await stopped;await replacement
  assert.deepEqual(f.events,['view-stop-1','channel-close-1']);assert.equal(f.stops.length,1)
  const view=f.product.view;prior.publish('late old content');assert.deepEqual(f.product.view,view);assert.equal(view.state,'connected')
 }finally{release.resolve();await rejected;await stopped;await replacement;await f.product.close()}
})

test('a real RPC consumer cleanup failure still releases the channel and permanently denies reconnect',async()=>{
 const f=selectedMobile({release:async()=>{throw Error('synthetic unsubscribe refusal')}})
 try{
  await f.product.connect(f.authority);await f.product.select(f.authority,'fixture-session')
  await assert.rejects(f.product.disconnect(f.authority),/cleanup failed/)
  assert.deepEqual(f.events,['view-stop-1','channel-close-1']);assert.equal(f.product.view.state,'blocked')
  await assert.rejects(f.product.connect(f.authority),/operation denied/);assert.equal(f.opens(),1)
 }finally{await f.product.close()}
})

test('terminal close also retires the RPC consumer before its provider',async()=>{
 const f=selectedMobile();await f.product.connect(f.authority);await f.product.select(f.authority,'fixture-session')
 await f.product.close();assert.deepEqual(f.events,['view-stop-1','channel-close-1']);assert.equal(f.product.view.state,'closed')
 await assert.rejects(f.product.connect(f.authority),/operation denied/)
})

test('disconnect waits for late acquisition and release before admitting a replacement',async()=>{
 const entered=gate(),acquired=gate(),closing=gate(),released=gate(),events=[];let signal,opens=0
 const old=connection(async()=>{events.push('old-close-start');closing.resolve();await released.promise;events.push('old-close-end')})
 const f=mobile(async(_record,lifetime)=>{if(++opens===1){signal=lifetime;entered.resolve();await acquired.promise;return old}events.push('new-open');return connection()})
 const pending=f.product.connect(f.authority),rejected=assert.rejects(pending);await entered.promise
 const stopped=f.product.disconnect(f.authority),replacement=f.product.connect(f.authority)
 try{assert.equal(signal?.aborted,true);acquired.resolve();await closing.promise;assert.equal(opens,1);released.resolve();await stopped;await rejected;await replacement;assert.deepEqual(events,['old-close-start','old-close-end','new-open']);assert.equal(f.product.view.state,'connected')}
 finally{acquired.resolve();released.resolve();await rejected;await stopped;await replacement;await f.product.close()}
})

test('late acquisition cleanup failure blocks reconnect and is visible to disconnect',async()=>{
 const entered=gate(),acquired=gate();const f=mobile(async()=>{entered.resolve();await acquired.promise;return connection(async()=>{throw Error('private fixture cleanup failure')})})
 const pending=f.product.connect(f.authority),rejected=assert.rejects(pending);await entered.promise
 const stopped=f.product.disconnect(f.authority),stopRejected=assert.rejects(stopped)
 acquired.resolve();await rejected;await stopRejected
 assert.equal(f.product.view.state,'blocked');assert.equal(f.product.view.error,'connection-cleanup-failed');assert.equal(f.product.view.diagnostic.cleanupFailed,true)
 await assert.rejects(f.product.connect(f.authority),/operation denied/);assert.doesNotMatch(JSON.stringify(f.views),/private fixture/);await f.product.close()
})

test('disconnect closes an acquired channel while its ticket is pending exactly once',async()=>{
 const entered=gate(),ticket=gate();let closes=0
 const value=connection(async()=>{closes++});value.readyTicket=async()=>{entered.resolve();await ticket.promise;return{}}
 const f=mobile(async()=>value),pending=f.product.connect(f.authority),rejected=assert.rejects(pending);await entered.promise
 const stopped=f.product.disconnect(f.authority)
 try{assert.equal(closes,1)}finally{ticket.resolve();await rejected;await stopped;await f.product.close()}
 assert.equal(closes,1);assert.equal(f.product.view.state,'closed')
})

async function nativeFixture(options={}){
 const{phoneKey,desktopKey,nodeE2EPrimitives:p}=api,authority={},timers=new Set(),views=[],entered=gate(),socket=new api.FixturePort()
 const unsigned={schema:'harmony-device-binding/1',bindingId:'fixture-binding',desktopId:'fixture-desktop',profileId:'desktop',deviceId:'fixture-phone',identityAlias:'fixture-original',desktopPublicSpki:desktopKey.publicSpki,phonePublicSpki:phoneKey.publicSpki,desktopCredentialId:await p.credentialId(desktopKey.publicSpki),credentialId:await p.credentialId(phoneKey.publicSpki),audience:api.audience,scope:{kind:'all-visible-sessions',profileId:'desktop'},operations:['session.sync'],epoch:1,createdAt:1,revoked:false}
 const binding={...unsigned,signature:p.encode(await desktopKey.sign(api.deviceBindingBytes(unsigned)))},offerBody={schema:'harmony-device-route-offer/1',binding,routeId:'fixture-route',routeEpoch:1,nonce:'A'.repeat(43),issuedAt:1,expiresAt:5000},offer={...offerBody,signature:p.encode(await desktopKey.sign(api.deviceRouteOfferBytes(offerBody)))},route={schema:'harmony-device-route/1',offer,signature:p.encode(await phoneKey.sign(api.deviceRouteReplyBytes(offer)))}
 const scheduler={after:(_ms,callback)=>{timers.add(callback);return()=>timers.delete(callback)}},counts={acquire:0,open:0,close:0,authenticated:0}
 const network={ports:{control:socket,signer:phoneKey,primitives:p,remotePublicSpki:desktopKey.publicSpki,scheduler,clock:()=>1000,agreement:async()=>{if(options.agreement)return options.agreement();throw Error('no peer')},data:async()=>{if(options.data)return options.data();throw Error('no room')}},open:async()=>{counts.open++;entered.resolve();await options.open?.()},authenticated:()=>{counts.authenticated++},close:async()=>{counts.close++;socket.terminate();await options.close?.()}}
 const facade=new api.NativeDeviceProductFacade(authority,JSON.stringify({...policy.core,enabled:true}),'fixture-original',api.audience,5000,policy.relay,{read:async()=>null,write:async()=>{},close:async()=>{}},{signer:phoneKey,primitives:p},scheduler,()=>1000,async()=>{counts.acquire++;await options.acquire?.();return network},view=>views.push(view),100)
 facade.connectionApproved=true;facade.routes={current:async()=>{await options.route?.();return route},close:async()=>{}}
 const lifetime=new api.NativeAbortController(),pending=()=>facade.connection(binding,{},lifetime.signal)
 return{facade,binding,route,network,counts,timers,views,entered,lifetime,pending,cleanup:async()=>{socket.terminate();await facade.close()}}
}

test('cancelling a pending route read never acquires native ports',async()=>{
 const entered=gate(),release=gate(),f=await nativeFixture({route:async()=>{entered.resolve();await release.promise},acquire:async()=>{throw Error('cancelled route must not acquire')}}),pending=f.pending(),rejected=assert.rejects(pending);await entered.promise
 try{f.lifetime.abort();release.resolve();await rejected;assert.equal(f.counts.acquire,0);assert.equal(f.counts.open,0)}finally{release.resolve();await rejected;await f.cleanup()}
})

test('native ports returned after cancellation are released without opening WSS',async()=>{
 const entered=gate(),release=gate(),f=await nativeFixture({acquire:async()=>{entered.resolve();await release.promise},open:async()=>{throw Error('cancelled acquisition must not open')}}),pending=f.pending(),rejected=assert.rejects(pending);await entered.promise
 try{f.lifetime.abort();release.resolve();await rejected;assert.deepEqual(f.counts,{acquire:1,open:0,close:1,authenticated:0});assert.equal(f.timers.size,0)}finally{release.resolve();await rejected;await f.cleanup()}
})

for(const phase of ['open','handshake'])test('native '+phase+' cancellation closes the original resources and retires timers',async t=>{
 const release=gate(),ready=gate(),original=api.NativeDeviceCore.prototype.ready
 if(phase==='handshake'){api.NativeDeviceCore.prototype.ready=function(){ready.resolve();return original.call(this)};t.after(()=>{api.NativeDeviceCore.prototype.ready=original})}
 const f=await nativeFixture(phase==='open'?{open:()=>release.promise}:{}),pending=f.pending(),rejected=assert.rejects(pending);await(phase==='open'?f.entered.promise:ready.promise)
 try{f.lifetime.abort();assert.equal(f.counts.close,1);release.resolve();await rejected;assert.equal(f.counts.close,1);assert.equal(f.counts.authenticated,0);assert.equal(f.timers.size,0);assert.equal(f.network.ports.control.frames.size,0);assert.equal(f.network.ports.control.ends.size,0);assert.equal(f.lifetime.signal.listeners.size,0)}finally{release.resolve();await f.cleanup();await rejected}
})

test('handshake cancellation waits for cleanup before public reconnect and ignores the old endpoint',async()=>{
 const closeStarted=gate(),released=gate(),f=await nativeFixture({close:async()=>{closeStarted.resolve();await released.promise}});let attempts=0
 const m=mobile((_record,lifetime)=>++attempts===1?f.facade.connection(f.binding,{},lifetime):Promise.resolve(connection()))
 const pending=m.product.connect(m.authority),rejected=assert.rejects(pending);await f.entered.promise
 const stopped=m.product.disconnect(m.authority),replacement=m.product.connect(m.authority)
 try{await closeStarted.promise;assert.equal(attempts,1);released.resolve();await stopped;await rejected;await replacement;const current=m.product.view;f.network.ports.control.terminate();assert.deepEqual(m.product.view,current);assert.equal(current.state,'connected');assert.equal(f.counts.close,1);assert.equal(f.timers.size,0)}finally{released.resolve();await rejected;await stopped;await replacement;await m.product.close();await f.cleanup()}
})

test('native cleanup refusal after cancellation keeps the public product blocked',async()=>{
 const release=gate(),f=await nativeFixture({open:()=>release.promise,close:async()=>{throw Error('private native cleanup failure')}}),m=mobile((_record,lifetime)=>f.facade.connection(f.binding,{},lifetime)),pending=m.product.connect(m.authority),rejected=assert.rejects(pending);await f.entered.promise
 const stopRejected=assert.rejects(m.product.disconnect(m.authority));release.resolve();await rejected;await stopRejected
 assert.equal(m.product.view.state,'blocked');assert.equal(m.product.view.diagnostic.cleanupFailed,true);assert.equal(f.counts.close,1);assert.equal(f.timers.size,0);await assert.rejects(m.product.connect(m.authority));await m.product.close();await f.cleanup()
})

test('terminal public close waits for native acquisition and never opens the returned ports',async()=>{
 const entered=gate(),released=gate(),f=await nativeFixture({acquire:async()=>{entered.resolve();await released.promise}}),m=mobile((_record,lifetime)=>f.facade.connection(f.binding,{},lifetime)),pending=m.product.connect(m.authority),rejected=assert.rejects(pending);await entered.promise
 const closing=m.product.close();released.resolve();await rejected;await closing;assert.equal(m.product.view.state,'closed');assert.equal(f.counts.open,0);assert.equal(f.counts.close,1);assert.equal(f.timers.size,0);await assert.rejects(m.product.connect(m.authority));await f.cleanup()
})

for(const phase of ['agreement','data'])test('cancelling encrypted '+phase+' acquisition releases late resources after real signed control proofs',async()=>{
 const entered=gate(),released=gate(),data=new api.FixturePort(),phoneServer=new api.FixturePort(),desktopServer=new api.FixturePort(),desktopSocket=new api.FixturePort();let keyCloses=0,f
 const material={key:{publicSpki:api.phoneKey.publicSpki,derive:async()=>{throw Error('cancelled material must not derive')},close:()=>{keyCloses++}},nonce:new Uint8Array(32)}
 const broker=api.brokerFixture({...api.rawBroker,pairs:[{...api.rawBroker.pairs[0],pairId:'fixture-route',expiresAt:5000}]})
 const desktopLifetime=new api.NativeAbortController(),desktop=new api.RelayControlClient(desktopSocket,{pairId:'fixture-route',epoch:1,role:'desktop',audience:api.audience,credentialId:await api.nodeE2EPrimitives.credentialId(api.desktopKey.publicSpki),expiresAt:5000},api.desktopKey,api.nodeE2EPrimitives,()=>1000,16,8192,100,500,broker.clock,()=>{},desktopLifetime.signal)
 desktopServer.remote=desktopSocket;desktopSocket.remote=desktopServer
 f=await nativeFixture({agreement:async()=>{if(phase==='agreement'){entered.resolve();await released.promise}return material},data:async()=>{entered.resolve();await released.promise;return data},open:async()=>{phoneServer.remote=f.network.ports.control;f.network.ports.control.remote=phoneServer;broker.broker.attach('fixture-route','desktop',desktopServer);broker.broker.attach('fixture-route','phone',phoneServer)}})
 const pending=f.pending(),rejected=assert.rejects(pending)
 try{await entered.promise;f.lifetime.abort();released.resolve();await rejected;assert.equal(keyCloses,1);assert.equal(f.counts.close,1);assert.equal(f.counts.authenticated,0);assert.equal(f.timers.size,0);assert.equal(f.lifetime.signal.listeners.size,0);if(phase==='data')assert.equal(data.closed,true)}finally{released.resolve();desktop.close();await desktop.settled();broker.close();await f.cleanup();await rejected}
})

const native=await import('./helpers/product-native-harness.mjs')
test('actual ETS owner closes pending original-key acquisition without creating a key or socket',async()=>{
 native.resetProductSdk();native.state.aliases.add('fixture-original');const entered=gate(),released=gate(),original=native.huks.exportKeyItem,authority={},owner=new native.NativePairedConnectionOwner(authority,new native.NativePairedPolicy('relay.example','fixture-route','fixture-original',2,26,65536,4194304,policy.relay))
 native.huks.exportKeyItem=async(...args)=>{entered.resolve();await released.promise;return original(...args)}
 const pending=owner.acquireDevicePortsNative(authority,'desktop'),rejected=assert.rejects(pending);await entered.promise
 try{const closed=owner.closeNative(authority);released.resolve();await rejected;await closed;assert.equal(native.network.sockets.length,0);assert.equal(native.state.calls.includes('create'),false);assert.equal(native.state.calls.includes('remove'),false);assert.equal(owner.ports.length,0)}finally{released.resolve();native.huks.exportKeyItem=original;await rejected;await owner.closeNative(authority)}
})

test('actual ETS socket releases a late successful dial after its owner was closed',async()=>{
 native.resetProductSdk();native.state.aliases.add('fixture-original');const entered=gate(),released=gate(),authority={},owner=new native.NativePairedConnectionOwner(authority,new native.NativePairedPolicy('relay.example','fixture-route','fixture-original',2,26,65536,4194304,policy.relay));let closes=0
 native.network.factory=()=>({on(){},connect:async()=>{entered.resolve();return released.promise},close:async()=>{closes++;return true},send:async()=>true})
 try{await owner.acquireDevicePortsNative(authority,'desktop');const opened=owner.openDeviceControlNative(authority),rejected=assert.rejects(opened);await entered.promise;await owner.closeNative(authority);released.resolve(true);await rejected;assert.equal(closes,2);assert.equal(native.network.sockets.length,1);assert.equal(native.state.calls.includes('create'),false)}finally{released.resolve(true);await owner.closeNative(authority);native.network.factory=undefined}
})

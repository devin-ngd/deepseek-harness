/** Real shared owners and isolated native ports; never actual identity, sockets or authorization. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const api=await import(pathToFileURL(process.env.DSH_PHONE_DIAGNOSTIC_MODULE).href),secret='fixture-PRIVATE-TICKET-KEY-CREDENTIAL'
const raw=()=>Object.assign(new Error(secret),{token:secret,stack:secret}),policy=JSON.parse(await readFile('product.config.json','utf8'))
function fixture(changes={}){const authority={},views=[],controller=new AbortController(),proof={load:async()=>({}),ticket:async()=>({expiresAt:5000})},connection={authentication:'native',route:{routeId:'fixture',routeEpoch:1,expiresAt:5000},binding:{id:'fixture',remoteCredentialId:'fixture',signal:controller.signal},readyTicket:async()=>({}),catalog:async()=>({sessions:[],projects:null}),select:async()=>{throw raw()},close:async()=>{}};Object.assign(proof,changes.proof);Object.assign(connection,changes.connection);const app=new api.DeviceBoundMobileProduct(authority,proof,{connect:changes.connect??(async()=>connection)},()=>1000,changes.scheduler??{after:()=>()=>{}},view=>views.push(view));return{app,authority,views,proof,connection}}
for(const[name,changes,stage]of[
 ['identity read',{proof:{load:async()=>{throw raw()}}},'identity-read'],
 ['native channel',{connect:async()=>{throw raw()}},'native-channel'],
 ['ticket validation',{proof:{ticket:async()=>{throw raw()}}},'ticket'],
 ['first catalogue',{connection:{catalog:async()=>{throw raw()}}},'first-catalog']
])test(name+' projects only a safe fixed stage',async()=>{const f=fixture(changes);let failure;try{await f.app.connect(f.authority)}catch(error){failure=error}assert.deepEqual(f.app.view.diagnostic,{stage,category:'unavailable',cleanupFailed:false});assert.equal(failure.cause.message,secret);assert.equal(f.app.view.state,'blocked');assert.equal(f.views.some(view=>view.state==='connected'),false);assert.doesNotMatch(JSON.stringify(f.views),/PRIVATE|TICKET|CREDENTIAL/);await f.app.close()})
test('known RPC timeout uses its type, not arbitrary error properties',async()=>{const f=fixture({connection:{catalog:async()=>{throw new api.TransportError('timeout',{cause:raw()})}}});await assert.rejects(f.app.connect(f.authority));assert.equal(f.app.view.diagnostic.category,'timeout');await f.app.close()})
test('cleanup failure preserves first cause and fail-closed retry policy',async()=>{const primary=raw(),f=fixture({connection:{catalog:async()=>{throw primary},close:async()=>{throw raw()}}});let error;try{await f.app.connect(f.authority)}catch(value){error=value}assert.equal(error.cause,primary);assert.deepEqual(f.app.view.diagnostic,{stage:'first-catalog',category:'unavailable',cleanupFailed:true});assert.equal(f.app.view.error,'connection-cleanup-failed');await assert.rejects(f.app.connect(f.authority),/operation denied/)})
test('nested protocol failure survives an outer phase',async()=>{const primary=new api.DeviceConnectionFailure('control-handshake','timeout',raw()),f=fixture({connect:async()=>{throw primary}});await assert.rejects(f.app.connect(f.authority),error=>error===primary);assert.equal(f.app.view.diagnostic.stage,'control-handshake');assert.equal(f.app.view.diagnostic.category,'timeout');await f.app.close()})
test('explicit retry clears stale diagnostics without payloads',async()=>{const f=fixture({connection:{catalog:async()=>{throw raw()}}});await assert.rejects(f.app.connect(f.authority));f.connection.catalog=async()=>({sessions:[],projects:null});await f.app.connect(f.authority);assert.equal(f.app.view.state,'connected');assert.equal(f.app.view.diagnostic,undefined);await f.app.close()})
test('retired asynchronous failure cannot overwrite a newer view',async()=>{let reject;const f=fixture({proof:{load:()=>new Promise((_resolve,no)=>{reject=no})}});const pending=f.app.connect(f.authority);await Promise.resolve();await f.app.disconnect(f.authority);reject(raw());await assert.rejects(pending);assert.equal(f.app.view.state,'disconnected');assert.deepEqual(f.app.view.diagnostic,{stage:'local-stop',category:'closed',cleanupFailed:false})})

function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes});return{promise,resolve}}
test('local stop during identity read prevents the retired attempt from opening a channel',async()=>{
 const entered=deferred(),registration=deferred();let opened=0
 const f=fixture({proof:{load:()=>{entered.resolve();return registration.promise}},connect:async()=>{opened++;return f.connection}})
 const pending=f.app.connect(f.authority),rejected=assert.rejects(pending);await entered.promise
 try{await f.app.disconnect(f.authority);const stopped=f.app.view;registration.resolve({});await rejected;assert.equal(opened,0);assert.deepEqual(f.app.view,stopped)}finally{registration.resolve({});await rejected;await f.app.close()}
})
test('a retired identity read cannot open or close the replacement connection',async()=>{
 const entered=deferred(),registration=deferred();let reads=0,opened=0,closed=0
 const f=fixture({proof:{load:()=>{if(++reads===1){entered.resolve();return registration.promise}return Promise.resolve({})}},connect:async()=>{opened++;return f.connection},connection:{close:async()=>{closed++}}})
 const pending=f.app.connect(f.authority),rejected=assert.rejects(pending);await entered.promise
 try{await f.app.disconnect(f.authority);await f.app.connect(f.authority);const connected=f.app.view;registration.resolve({});await rejected;assert.equal(opened,1);assert.equal(closed,0);assert.deepEqual(f.app.view,connected)}finally{registration.resolve({});await rejected;await f.app.close()}
 assert.equal(closed,1)
})
function nativeCore(){const record={schema:'harmony-device-binding/1',bindingId:'fixture-binding',desktopId:'fixture-desktop',profileId:'desktop',deviceId:'fixture-phone',identityAlias:'fixture-original',desktopPublicSpki:'desktop',phonePublicSpki:'phone',desktopCredentialId:'p256-sha256-'+'0'.repeat(64),credentialId:'p256-sha256-'+'1'.repeat(64),audience:'relay.example',scope:{kind:'all-visible-sessions',profileId:'desktop'},operations:['session.sync'],epoch:1,createdAt:1,revoked:false,signature:'signature'};const ports={clock:()=>1000,remotePublicSpki:'desktop',signer:{publicSpki:'phone'},primitives:{}};return new api.NativeDeviceCore(JSON.stringify(record),5000,policy.relay,ports,()=>{},()=>{},{})}
for(const[name,facts,expected]of[
 ['control signature refusal',[['controlFact','failure-sign:refused']],['identity-read','refused']],
 ['control deadline',[['controlFact','challenge-deadline']],['control-handshake','timeout']],
 ['encrypted deadline',[['controlFact','room-validated'],['encryptedFact','handshake-deadline']],['encrypted-handshake','timeout']],
 ['ticket rejection',[['controlFact','room-validated'],['phase','ticket'],['encryptedFact','failure-data:signature-denied']],['ticket','refused']]
])test('native core preserves '+name+' across closure',async()=>{const core=nativeCore();for(const[method,value]of facts){if(method==='phase')core.phase=value;else core[method](value)}core.fail('closed');const error=await core.ready().catch(value=>value);assert.deepEqual([error.diagnostic.stage,error.diagnostic.category],expected);assert.equal(core.connectionFailure(raw(),'native-channel'),error);await core.close().catch(()=>{})})
test('public text rejects unknown stages and categories',()=>{const failure=new api.DeviceConnectionFailure('ticket','refused',raw());assert.equal(api.deviceConnectionDiagnosticText(failure.diagnostic),'ticket/refused');failure.cleanupFailed();assert.equal(api.deviceConnectionDiagnosticText(failure.diagnostic),'ticket/refused / cleanup-failed');assert.equal(api.deviceConnectionDiagnosticText({stage:secret,category:'refused',cleanupFailed:false}),'');assert.equal(api.deviceConnectionDiagnosticText({stage:'ticket',category:secret,cleanupFailed:false}),'')})
test('actual Facade separates route refusal from original native identity read',async()=>{const authority={},f=new api.NativeDeviceProductFacade(authority,JSON.stringify({...policy.core,enabled:true}),'fixture-original','relay.example',5000,policy.relay,{read:async()=>null,write:async()=>{},close:async()=>{}},{signer:{},primitives:{}},{after:()=>()=>{}},()=>1000,async(_raw,diagnostic)=>{diagnostic('identity-read');throw raw()},()=>{},100);f.connectionApproved=true;f.routes={current:async()=>null};await assert.rejects(f.connection({},{},new AbortController().signal),error=>error.diagnostic.stage==='route-verify');f.routes={current:async()=>({offer:{routeId:'fixture-route',routeEpoch:1,expiresAt:5000}})};await assert.rejects(f.connection({},{},new AbortController().signal),error=>error.diagnostic.stage==='identity-read')})

// These execute the actual ETS acquisition owner against the existing fixed-key SDK substitute.
const native=await import('../tests/helpers/product-native-harness.mjs')
test('real native ports forward only allowlisted content-free control and E2E facts',async()=>{
 native.resetProductSdk();native.state.aliases.add('fixture-original');const authority={},facts=[],logs=[],owner=new native.NativePairedConnectionOwner(authority,new native.NativePairedPolicy('relay.example','fixture-route','fixture-original',2,26,65536,4194304,policy.relay)),original=console.info;console.info=value=>logs.push(value)
 try{const ports=await owner.acquireDevicePortsNative(authority,'desktop',fact=>facts.push(fact));assert.deepEqual(facts,['identity-read','native-channel']);ports.diagnostic('peer-verified');ports.controlDiagnostic('challenge-validated');ports.diagnostic(secret);ports.controlDiagnostic(secret);assert.deepEqual(logs,['DSH_E2E_STAGE=phone-peer-verified','DSH_CONTROL_STAGE=phone-challenge-validated']);assert.equal(native.network.requests.length,0);assert.equal(native.state.calls.includes('create'),false)}finally{console.info=original;await owner.closeNative(authority)}
})
test('real native identity failure stays at identity-read without creating or replacing a key',async()=>{
 native.resetProductSdk();const authority={},facts=[],owner=new native.NativePairedConnectionOwner(authority,new native.NativePairedPolicy('relay.example','fixture-route','fixture-missing',2,26,65536,4194304,policy.relay))
 try{await assert.rejects(owner.acquireDevicePortsNative(authority,'desktop',fact=>facts.push(fact)));assert.equal(facts[0],'identity-read');assert.equal(facts.includes('native-channel'),false);assert.equal(native.state.calls.includes('create'),false);assert.equal(native.network.requests.length,0)}finally{await owner.closeNative(authority)}
})

test('successful catalogue followed by asynchronous channel loss retains a fixed diagnostic',async()=>{
 const controller=new AbortController(),f=fixture({connection:{binding:{id:'fixture',remoteCredentialId:'fixture',signal:controller.signal},catalog:async()=>({sessions:[{profileId:'desktop',sessionId:'test-session',title:'Test',projectId:null}],projects:null})}})
 await f.app.connect(f.authority);assert.equal(f.app.view.state,'connected');assert.equal(f.app.view.sessions.length,1)
 controller.abort();await f.app.disconnecting;assert.equal(f.app.view.state,'disconnected');assert.equal(f.app.view.sessions.length,0);assert.equal(f.app.view.diagnostic.stage,'active-channel');assert.equal(f.app.view.diagnostic.category,'closed');assert.equal(f.app.view.diagnostic.cleanupFailed,false);await f.app.close()
})
test('late protocol first cause survives successful connection and resource cleanup',async()=>{
 const controller=new AbortController(),primary=new api.DeviceConnectionFailure('active-channel','refused',raw()),f=fixture({connection:{binding:{id:'fixture',remoteCredentialId:'fixture',signal:controller.signal},close:async()=>{},failure:()=>primary}})
 await f.app.connect(f.authority);controller.abort();await f.app.disconnecting;assert.deepEqual(f.app.view.diagnostic,primary.diagnostic);assert.equal(primary.diagnostic.cleanupFailed,false);assert.doesNotMatch(JSON.stringify(f.views),/PRIVATE|TICKET|CREDENTIAL/);await f.app.close()
})
test('resource cleanup failure annotates rather than replaces the original active-channel cause',async()=>{
 const controller=new AbortController(),primary=new api.DeviceConnectionFailure('active-channel','refused',raw()),f=fixture({connection:{binding:{id:'fixture',remoteCredentialId:'fixture',signal:controller.signal},failure:()=>primary,close:async()=>{throw raw()}}})
 await f.app.connect(f.authority);controller.abort();await assert.rejects(f.app.disconnecting);assert.deepEqual(f.app.view.diagnostic,{stage:'active-channel',category:'refused',cleanupFailed:true});assert.equal(f.app.view.state,'blocked');await assert.rejects(f.app.connect(f.authority),/operation denied/)
})
test('explicit local stop differs from ticket expiry and unexpected closure',async()=>{
 const f=fixture();await f.app.connect(f.authority);await f.app.disconnect(f.authority);assert.deepEqual(f.app.view.diagnostic,{stage:'local-stop',category:'closed',cleanupFailed:false});assert.equal(f.app.view.error,'');await f.app.close()
 const g=fixture();await g.app.connect(g.authority);await g.app.disconnect(g.authority,new api.DeviceConnectionFailure('connection-expiry','timeout'));assert.equal(g.app.view.diagnostic.stage,'connection-expiry');assert.equal(g.app.view.diagnostic.cleanupFailed,false);await g.app.close()
})
test('protocol timeout alone does not manufacture a resource cleanup failure',async()=>{
 const core=nativeCore();core.fail('timeout');const primary=await core.ready().catch(error=>error);await core.close();assert.equal(primary.diagnostic.cleanupFailed,false);assert.equal(primary.diagnostic.category,'timeout')
})
test('active-channel diagnostic remains owned after authorization, including late failure during teardown',async()=>{
 const core=nativeCore();core.phase='active-channel';core.receipt={};core.encryptedFact('failure-data:decrypt-failed');assert.equal(core.connectionFailure(raw(),'native-channel').diagnostic.stage,'active-channel');await core.close()
 const late=nativeCore();late.phase='active-channel';late.unexpectedClose=true;await late.close();late.encryptedFact('failure-data:sequence');assert.deepEqual(late.connectionFailure(raw(),'native-channel').diagnostic,{stage:'active-channel',category:'refused',cleanupFailed:false})
})

test('actual ticket timer retires the connection with expiry disposition',async()=>{let expire;const f=fixture({scheduler:{after:(_ms,callback)=>{expire=callback;return()=>{}}}});await f.app.connect(f.authority);expire();await f.app.disconnecting;assert.deepEqual(f.app.view.diagnostic,{stage:'connection-expiry',category:'timeout',cleanupFailed:false});assert.equal(f.app.view.state,'disconnected');await f.app.close()})

test('protocol rejection and resource-release failure remain orthogonal at the real endpoint boundary',async()=>{const protocol=nativeCore();protocol.endpoint={close(){},settled:async()=>{throw new api.PairedRelayFailure(true,false)}};await protocol.close();const cleanup=nativeCore();cleanup.endpoint={close(){},settled:async()=>{throw new api.PairedRelayFailure(true,true)}};await assert.rejects(cleanup.close(),error=>error.cleanupFailed===true);const unknown=nativeCore();unknown.endpoint={close(){},settled:async()=>{throw raw()}};await assert.rejects(unknown.close())})
test('real native port send refusal does not manufacture a socket release failure',async()=>{native.resetProductSdk();native.state.aliases.add('fixture-original');const authority={},owner=new native.NativePairedConnectionOwner(authority,new native.NativePairedPolicy('relay.example','fixture-route','fixture-original',2,26,65536,4194304,policy.relay));const ports=await owner.acquireDevicePortsNative(authority,'desktop');ports.control.send(new TextEncoder().encode('{}'));await ports.control.tail;await owner.closeNative(authority);assert.equal(native.network.requests.length,0);assert.equal(native.state.calls.includes('create'),false)})

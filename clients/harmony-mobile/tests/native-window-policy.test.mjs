/** Offline deterministic lifecycle/clock/cleanup tests; no SDK subprocess, listener or native device exists here. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeAcceptanceFailure,NativeWindowClock,nativePreparationBudget,retryNativeRead,reconcileNativeCase,settleNativeCleanup,sdkFailure,nativeWindowPreconditions,nativeControlStatus} from '../scripts/native-window-policy.mjs'
import {prepareNativeReadiness} from '../scripts/native-prewindow-readiness.mjs'

const started='2026-10-12T00:00:00.000Z',lease={startedAt:started,expiresAt:'2026-10-12T00:30:00.000Z',cleanupAt:'2026-10-12T00:27:00.000Z',maximumMs:1800000,rule:'tcp:18081 tcp:12345'}
const anchor={leaseStartedAt:started,startedAt:'2026-10-12T00:01:00.000Z',deadline:'2026-10-12T00:21:00.000Z'}
function clock(){let wall=Date.parse(anchor.startedAt),mono=0;const budget=new NativeWindowClock(lease,anchor,{wall:()=>wall,monotonic:()=>mono});return{budget,advance(ms){wall+=ms;mono+=ms},wallBack(ms){wall-=ms}}}
const retryPolicy=budget=>({attempts:3,pauseMs:1,budget,sleep:async()=>{}})
test('wall-clock rollback and repeated steps cannot extend the original driver cutoff or cleanup reserve',()=>{
  const c=clock();c.advance(1200000);c.wallBack(600000);assert.equal(c.budget.remaining(),0);assert.throws(()=>c.budget.requireTime(),error=>error.code==='window-deadline')
  assert.throws(()=>new NativeWindowClock(lease,{...anchor,deadline:lease.expiresAt},{wall:()=>0,monotonic:()=>0}),error=>error.code==='window-anchor-invalid')
})
test('resumed prewindow waiting cannot exceed the unchanged cleanup reserve even if wall time moves backward',()=>{
  let wall=Date.parse(lease.cleanupAt)-1000,mono=0
  const budget=nativePreparationBudget(lease,{wall:()=>wall,monotonic:()=>mono})
  assert.equal(budget.wallDeadline,Date.parse(lease.cleanupAt));budget.requireTime()
  wall-=600000;mono+=1000;assert.throws(()=>budget.requireTime(),error=>error.code==='prewindow-deadline')
  assert.throws(()=>nativePreparationBudget({...lease,cleanupAt:'invalid'},{wall:()=>wall,monotonic:()=>mono}),error=>error.code==='window-anchor-invalid')
})
test('read-only transport observations retry finitely; authentication, locks and unknown effects do not',async()=>{
  let calls=0;const rows=[],c=clock();const value=await retryNativeRead(async()=>{if(++calls<3)throw sdkFailure('Target offline',true);return 'ready'},retryPolicy(c.budget),row=>rows.push(row))
  assert.equal(value,'ready');assert.equal(calls,3);assert.equal(rows.length,2)
  for(const output of['Error Code:10106102 screen locked','Permission denied','Unexpected failure']){calls=0;await assert.rejects(retryNativeRead(async()=>{calls++;throw sdkFailure(output,true)},retryPolicy(c.budget),()=>{}));assert.equal(calls,1)}
  assert.equal(sdkFailure('Connection lost',false).disposition,'reconcile')
})
test('unknown submission is reconciled without replay and a failed case can preserve safe independent continuation',async()=>{
  let writes=0;const result=await reconcileNativeCase(async()=>{writes++;throw new NativeAcceptanceFailure('lost-effect','reconcile')},async()=>({safeToContinue:true,behaviorConfirmed:false,proofMissing:true}))
  assert.equal(writes,1);assert.equal(result.passed,false);assert.equal(result.continue,true)
  const blocked=await reconcileNativeCase(async()=>{throw sdkFailure('screen locked',true)},()=>{throw Error('No reconciliation for a lock')});assert.equal(blocked.continue,false)
})
test('evidence write failure cannot prevent cleanup requests and independent closure checks',async()=>{
  const calls=[],outcomes=await settleNativeCleanup([{name:'log',run:()=>{throw Error('disk full')}},{name:'request',run:()=>calls.push('request')},{name:'verify',run:()=>calls.push('verify')}])
  assert.deepEqual(calls,['request','verify']);assert.deepEqual(outcomes.map(row=>row.ok),[false,true,true])
})
function controlFixture(){
  const state={ready:true,url:'http://127.0.0.1:19490/',sessionId:'synthetic',instance:'generation-1',mode:'reopen',promptCalls:9}
  const acknowledgement={seq:7,instance:'generation-1',mode:'reopen',counts:{realCalls:0,replay:[{calls:0,expectedCalls:4}]},promptCalls:0,uploadCalls:0,carrier:{follows:16},faults:{consumed:['transport-reset']}}
  return{state,acknowledgement}
}
test('acknowledged counters retain published readiness so a missing observation remains failed with safe independent continuation',async()=>{
  const f=controlFixture(),status=nativeControlStatus(f.state,f.acknowledgement,7)
  assert.equal(status.ready,true);assert.equal(status.promptCalls,0);assert.equal(status.url,f.state.url)
  let effects=0
  const result=await reconcileNativeCase(async()=>{effects++;throw new NativeAcceptanceFailure('checkpoint-timeout','case-observation')},async()=>({safeToContinue:status.ready&&status.mode==='reopen'&&status.promptCalls===0&&status.counts.realCalls===0&&status.uploadCalls===0,behaviorConfirmed:false,proofMissing:true}))
  assert.equal(effects,1);assert.equal(result.passed,false);assert.equal(result.continue,true)
  assert.equal(nativeControlStatus({...f.state,ready:false},f.acknowledgement,7).ready,false)
})
test('private control status rejects stale sequence/generation and missing or non-loopback readiness',()=>{
  const f=controlFixture()
  for(const acknowledgement of[{...f.acknowledgement,seq:6},{...f.acknowledgement,instance:'old'},{...f.acknowledgement,mode:'create'},{...f.acknowledgement,promptCalls:-1}])assert.throws(()=>nativeControlStatus(f.state,acknowledgement,7),error=>error.code==='service-status-not-confirmed')
  for(const state of[{...f.state,ready:undefined},{...f.state,url:undefined},{...f.state,url:'https://example.com/'},{...f.state,url:'http://user:secret@127.0.0.1:19490/'}])assert.throws(()=>nativeControlStatus(state,f.acknowledgement,7),error=>error.code==='service-status-not-confirmed')
})
function readinessFixture(){
  let pidReads=0,logReads=0;const commands=[],c=clock()
  const status={ready:true,counts:{realCalls:0,replay:[{expectedCalls:4,calls:0}]},promptCalls:0,uploadCalls:0,serviceRemainingMs:1600000,url:'http://127.0.0.1:12345/'}
  const ports={wall:()=>Date.parse(anchor.startedAt),sleep:async()=>{},device:async(...args)=>{commands.push(args);if(args[1]==='param')return'26';if(args[1]==='pidof')return++pidReads===1?'':'42';return'accepted'},appLog:async()=>++logReads===1?'loading':'DSH native core ready',appLayout:async()=>[{attributes:{bundleName:'local.dsh.mobile.netreplay',visible:'true'},children:[{attributes:{id:'dsh-acceptance-connect',type:'Button',visible:'true',enabled:'true'}}]}],serviceStatus:async()=>status}
  const policy={budget:c.budget,pauseMs:1,hapPath:'sealed.hap',hapSha256:'sealed-hash',target:'127.0.0.1:5555',forwardExists:false}
  return{ports,policy,commands,status}
}
test('prewindow readiness waits for delayed PID and private document, and requires visible app controls before any forward',async()=>{
  const f=readinessFixture(),ready=await prepareNativeReadiness(f.ports,f.policy);assert.equal(ready.appPid,42);assert.equal(ready.forwardCreated,false);assert.equal(ready.retries.length,2)
  assert.ok(!f.commands.some(args=>args.includes('rport')||args.includes('settings')))
})
test('locked startup, wrong foreground and insufficient service lifetime block before consuming a resource window',async()=>{
  const f=readinessFixture();f.ports.appLayout=async()=>[];await assert.rejects(prepareNativeReadiness(f.ports,f.policy),error=>error.code==='screen-or-foreground-not-ready')
  const expired=readinessFixture();expired.status.serviceRemainingMs=60000;await assert.rejects(prepareNativeReadiness(expired.ports,expired.policy),error=>error.code==='service-prewindow-not-ready')
  const locked=readinessFixture();locked.ports.device=async(...args)=>{if(args[1]==='aa')throw sdkFailure('10106102 screen locked',false);return'26'};await assert.rejects(prepareNativeReadiness(locked.ports,locked.policy),error=>error.code==='screen-not-ready')
})
test('live window validates mapping identity and fresh prewindow proof rather than stale ready files',async()=>{
  const f=readinessFixture(),ready=await prepareNativeReadiness(f.ports,f.policy),proof={lease,active:{active:true,rule:lease.rule,tasks:'127.0.0.1:5555 '+lease.rule},marker:{instance:'DSHOfflineAPI26',target:'127.0.0.1:5555',emulatorStartedByTask:true,verifiedActualProcess:true,netreplayInitiallyAbsent:true},ready,state:f.status,now:Date.parse(ready.checkedAt),hapSha:'sealed-hash'}
  assert.equal(nativeWindowPreconditions(proof),42)
  assert.throws(()=>nativeWindowPreconditions({...proof,active:{...proof.active,rule:'tcp:18081 tcp:999'}}),error=>error.code==='forward-mapping-unverified')
  assert.throws(()=>nativeWindowPreconditions({...proof,now:proof.now+60001}),error=>error.code==='prewindow-app-not-ready')
})

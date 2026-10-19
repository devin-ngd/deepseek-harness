/** Fault scheduling regression uses injected operations only; no SDK, listener, installation or native resource is started. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeAcceptanceFailure,runIsolatedNativeCases,settleNativeCleanup,sdkFailure} from '../scripts/native-window-policy.mjs'

const scenarios=['socket','invalid-json','truncated-json','unknown-required','cursor-gap','cursor-conflict','recovery-budget'].map(name=>({name}))
function fixture(execute,reset=async()=>({freshCore:true,armed:null,dispatches:0})){
  const executions=[],resets=[],cleanup=[]
  return{executions,resets,cleanup,ports:{budget:{requireTime(){}},reset:async scenario=>{resets.push(scenario.name);return reset(scenario)},execute:async scenario=>{executions.push(scenario.name);return execute(scenario)}}}
}
test('socket observation timeout retains a failed result while all six reset-independent cases execute once and finally cleans up',async()=>{
  const f=fixture(async scenario=>{if(scenario.name==='socket')throw new NativeAcceptanceFailure('checkpoint-timeout','case-observation');return{readOnly:true,dispatches:0}})
  let result,closed
  try{result=await runIsolatedNativeCases(scenarios,f.ports)}finally{closed=await settleNativeCleanup([{name:'logs',run(){throw Error('evidence unavailable')}},{name:'request',run:()=>f.cleanup.push('request')},{name:'verify',run:()=>f.cleanup.push('verify')}])}
  assert.deepEqual(f.executions,scenarios.map(row=>row.name));assert.deepEqual(f.resets,f.executions)
  assert.equal(result.passed,false);assert.equal(result.results[0].status,'failed');assert.equal(result.results[0].error,'checkpoint-timeout')
  assert.equal(result.results.filter(row=>row.passed).length,6);assert.deepEqual(f.cleanup,['request','verify']);assert.deepEqual(closed.map(row=>row.ok),[false,true,true])
  assert.equal(JSON.parse(JSON.stringify(result)).passed,false)
})
test('ordinary assertion failure does not become a pass through successful isolation or later cases',async()=>{
  const f=fixture(async scenario=>{if(scenario.name==='invalid-json')assert.equal('writable','read-only');return{observed:true}})
  const result=await runIsolatedNativeCases(scenarios,f.ports)
  assert.equal(result.results.length,7);assert.equal(result.results[1].status,'failed');assert.equal(result.passed,false)
  assert.equal(result.results[2].status,'passed');assert.equal(f.executions.filter(name=>name==='invalid-json').length,1)
})
test('an unconfirmed reset blocks every remaining case explicitly instead of executing against contaminated state',async()=>{
  let resets=0
  const f=fixture(async()=>{throw new NativeAcceptanceFailure('checkpoint-timeout','case-observation')},async()=>{if(++resets===2)throw Error('reset-not-confirmed');return{freshCore:true}})
  const result=await runIsolatedNativeCases(scenarios,f.ports)
  assert.deepEqual(f.executions,['socket']);assert.equal(result.results.length,7)
  assert.equal(result.results[0].status,'failed');assert.equal(result.results[1].stage,'reset')
  assert.ok(result.results.slice(1).every(row=>row.status==='blocked'&&!row.executed&&row.error==='reset-not-confirmed'));assert.equal(result.passed,false)
})
test('permission refusal stops isolation attempts, reports all blocked cases and still reaches the global cleanup owner',async()=>{
  const f=fixture(async()=>{throw sdkFailure('Permission denied',true)})
  let result
  try{result=await runIsolatedNativeCases(scenarios,f.ports)}finally{await settleNativeCleanup([{name:'cleanup',run:()=>f.cleanup.push('cleanup')}])}
  assert.deepEqual(f.executions,['socket']);assert.deepEqual(f.resets,['socket']);assert.deepEqual(f.cleanup,['cleanup'])
  assert.equal(result.results[0].status,'failed');assert.ok(result.results.slice(1).every(row=>row.status==='blocked'))
})
test('original time budget expiry prevents further resets and records the full unrun remainder',async()=>{
  let checks=0
  const f=fixture(async()=>({observed:true}));f.ports.budget.requireTime=()=>{if(++checks>2)throw new NativeAcceptanceFailure('window-deadline')}
  const result=await runIsolatedNativeCases(scenarios,f.ports)
  assert.deepEqual(f.executions,['socket']);assert.deepEqual(f.resets,['socket']);assert.equal(result.results.length,7)
  assert.equal(result.results[0].status,'passed');assert.ok(result.results.slice(1).every(row=>row.status==='blocked'&&row.error==='window-deadline'));assert.equal(result.passed,false)
})

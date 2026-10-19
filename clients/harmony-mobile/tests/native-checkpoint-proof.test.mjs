/** Exact cross-layer proof rejects absent delivery, stale projections, wrong text and clipped native content. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { nativeCheckpointProof, observeNativeCheckpointProof } from '../scripts/native-checkpoint-proof.mjs'

const expected='DSH read checkpoint command-9',sha256=createHash('sha256').update(expected).digest('hex')
const record={commandId:'command-9',instance:'instance',relayCursor:5,domainCursor:13,bytes:512,payloadSha256:'a'.repeat(64),textSha256:sha256}
const source={faults:{checkpoint:expected,checkpointFrame:record},commandAudit:{records:[{stage:'fault-written',commandId:'command-9',fault:'reset-snapshot'}]}}
const delivery={commandId:'command-9',receivedBytes:512,deliveredBytes:512,ended:true,code:''}
const decoded={probe:'follow-decoded',commandId:'command-9',kind:'reset',instance:'instance',relayCursor:5,payloadSha256:'a'.repeat(64)}
const admitted={probe:'follow-admitted',commandId:'command-9',instance:'instance',relayCursor:5,domainCursor:13,liveTextBytes:Buffer.byteLength(expected),liveTextSha256:sha256,connection:'connected',readOnly:false}
const published={sessionId:'session',messageId:'native-live-session',text:expected,connection:'connected',readOnly:false,task:'cancelled'}
const log=(parts=[delivery,decoded,admitted,published])=>parts.map(value=>((value===delivery?'DSH native byte delivery: ':value===published?'DSH native live message admitted: ':'DSH native follow diagnostic: ')+JSON.stringify(value))).join('\n')
const list={attributes:{type:'List',visible:'true',bounds:'[48,835][1032,1044]'}}
const text={attributes:{type:'Text',id:'dsh-message-native-live-session',text:expected,originalText:expected,visible:'true',bounds:'[48,880][1032,1000]'}}
const task={attributes:{type:'Text',id:'dsh-task-state',text:'演示已取消',visible:'true'}},state={task:'cancelled',taskText:'演示已取消'}

test('only complete matching native delivery, admission, publication and fully visible original text qualify',()=>{
  const proof=nativeCheckpointProof(expected,source,log(),[list,text,task],state)
  assert.equal(proof.passed,true);assert.equal(proof.missing,null);assert.equal(proof.commandId,'command-9')
  for(const [stage,parts] of [['delivered',[decoded,admitted,published]],['decoded',[delivery,admitted,published]],['admitted',[delivery,decoded,published]],['published',[delivery,decoded,admitted]]]){
    const missing=nativeCheckpointProof(expected,source,log(parts),[list,text,task],state);assert.equal(missing.passed,false);assert.equal(missing.missing,stage)
  }
})
test('a write, row count, diagnostic-only text or partially clipped widget cannot qualify visible text',()=>{
  for(const nodes of [[list], [list,{attributes:{...text.attributes,text:'wrong',originalText:'wrong'}}], [list,{attributes:{...text.attributes,bounds:'[48,1040][1032,1150]'}}], [list,{attributes:{...text.attributes,id:'foreign'}}], [list,list,text]]){
    assert.equal(nativeCheckpointProof(expected,source,log(),nodes,state).missing,'visible')
  }
  assert.equal(nativeCheckpointProof(expected,source,log([delivery]),[list,text],state).passed,false)
  const wrongSource={...source,faults:{...source.faults,checkpointFrame:{...record,textSha256:'b'.repeat(64)}}}
  assert.equal(nativeCheckpointProof(expected,wrongSource,log(),[list,text],state).missing,'built')
})
test('correct live text cannot mask a changed native task status or a missing task label',()=>{
  assert.equal(nativeCheckpointProof(expected,source,log(),[list,text],state).missing,'taskVisible')
  assert.equal(nativeCheckpointProof(expected,source,log(),[list,text,{attributes:{...task.attributes,text:'电脑正在执行'}}],state).passed,false)
  assert.equal(nativeCheckpointProof(expected,source,log(),[list,text,task],{...state,task:'running'}).missing,'published')
})
test('later readonly, disconnect, product error or diagnostic failure cannot reuse an earlier successful publication',()=>{
  for(const changes of [{connection:'disconnected'},{readOnly:true},{error:'native-port-failed'},{task:'failed'},{text:'changed checkpoint'}]){
    const output=log()+'\nDSH native live message admitted: '+JSON.stringify({...published,...changes})
    assert.equal(nativeCheckpointProof(expected,source,output,[list,text,task],state).missing,'published')
  }
  for(const suffix of ['DSH native runtime failure: native-port-failed','DSH native diagnostic failed: native-follow-diagnostic-invalid','DSH native view: session, cancelled, disconnected, rows=1, readOnly=true, error=none','DSH native view: session, cancelled, connected, rows=1, readOnly=false, error=scope-denied']){
    assert.equal(nativeCheckpointProof(expected,source,log()+'\n'+suffix,[list,text,task],state).passed,false)
  }
  // Repeated lines preserve their chronology; a later identical failure cannot be deduplicated away.
  const failure='DSH native live message admitted: '+JSON.stringify({...published,readOnly:true})
  assert.equal(nativeCheckpointProof(expected,source,failure+'\n'+log()+'\n'+failure,[list,text,task],state).passed,false)
})
test('wrong bytes, payload digest or readonly semantic admission stop at their own stage',()=>{
  const prefix=['DSH native byte delivery: ','DSH native follow diagnostic: ','DSH native follow diagnostic: ','DSH native live message admitted: ']
  for(const [stage,index,replacement] of [['delivered',0,{...delivery,deliveredBytes:511}],['delivered',0,{...delivery,code:'transport-lost'}],['decoded',1,{...decoded,payloadSha256:'b'.repeat(64)}],['admitted',2,{...admitted,readOnly:true}],['admitted',2,{...admitted,domainCursor:12}]]){
    const values=[delivery,decoded,admitted,published];values[index]=replacement
    const output=values.map((value,index)=>prefix[index]+JSON.stringify(value)).join('\n')
    assert.equal(nativeCheckpointProof(expected,source,output,[list,text,task],state).missing,stage)
  }
  assert.equal(nativeCheckpointProof(expected,{...source,commandAudit:{records:[]}},log(),[list,text,task],state).missing,'written')
})
test('original round-seven missing probe evidence remains missing under the prepared criterion',async()=>{
  const proof=JSON.parse(await readFile('evidence/phase24-native/round7-resume1/paired-proof.json','utf8'))
  const layout=JSON.parse(await readFile('evidence/phase24-native/round7-resume1/last-checkpoint-layout.json','utf8')),nodes=[]
  const visit=value=>{if(!value||typeof value!=='object')return;if(value.attributes)nodes.push(value);for(const child of Object.values(value))visit(child)};visit(layout)
  const report=nativeCheckpointProof(proof.source.faults.checkpoint,{...proof.source,commandAudit:{records:proof.commandPairs.flatMap(pair=>pair.records)}},proof.nativeViews.join('\n'),nodes,state)
  assert.equal(report.passed,false);assert.equal(report.missing,'built');assert.equal(report.stages.visible,false)
})
test('prepared observation locates the model tail once only after complete native publication and retains original budget',async()=>{
  let navigations=0,reads=0,budgets=0;const records=[]
  const button={attributes:{type:'Button',id:'dsh-transcript-latest',enabled:'true',visible:'true',bounds:'[600,720][960,820]'}}
  const ports={async source(){return source},async logs(){return log()},async layout(){return ++reads===1?[list,button,task]:[list,button,text,task]},async latest(control){assert.equal(control.id,'dsh-transcript-latest');navigations++},async sleep(){},record(value){records.push(value)}}
  const result=await observeNativeCheckpointProof(expected,ports,{maxPolls:3,pauseMs:1,budget:{requireTime(){budgets++}}},state)
  assert.equal(result.passed,true);assert.equal(result.located,true);assert.equal(navigations,1);assert.equal(budgets,3);assert.equal(records[0].proof.missing,'visible')
  await assert.rejects(observeNativeCheckpointProof(expected,{...ports,async logs(){return ''},async latest(){throw Error('No navigation without publication')}},{maxPolls:2,pauseMs:1,budget:{requireTime(){}}},state),error=>error.code==='checkpoint-proof-missing-delivered')
  await assert.rejects(observeNativeCheckpointProof(expected,ports,{maxPolls:3,pauseMs:1,budget:{requireTime(){throw Error('original deadline')}}},state),/original deadline/)
  await assert.rejects(observeNativeCheckpointProof(expected,{...ports,async layout(){return[list,button,button,task]}},{maxPolls:2,pauseMs:1,budget:{requireTime(){}}},state),error=>error.code==='checkpoint-latest-control-not-confirmed')
  await assert.rejects(observeNativeCheckpointProof(expected,ports,{maxPolls:101,pauseMs:1,budget:{requireTime(){}}},state),error=>error.code==='checkpoint-proof-policy-invalid')
})

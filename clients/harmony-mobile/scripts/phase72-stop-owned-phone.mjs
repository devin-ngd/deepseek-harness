/** Retire only this run's owned app after its normal exit reported incomplete cleanup; preserve all private app data and the shared HDC daemon. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const m=JSON.parse(await readFile('.build/phase70-device-process.json','utf8')),layout=JSON.parse(await readFile('evidence/phase70-layout-after-native-exit.json','utf8')),state=JSON.parse(await readFile('.build/phase70-reconcile-current.json','utf8'))
assert.equal(m.pid,'29016');assert.equal(m.bundle,'local.dsh.mobile.offlineproduct');assert.equal(state.activeGrantCount,0);assert.equal(state.grants[0].epoch,4);assert.equal(state.grants[0].revoked,true);assert.ok(layout.nodes.some(row=>row.text==='操作未确认完成。请查看状态；任务可以查询原回执，避免重复发送。'))
const hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',base=['-p','-s','127.0.0.1:8710']
function run(args){const r=spawnSync(hdc,args,{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0);assert.doesNotMatch(r.stdout,/\[Fail\]|\[Error\]/i);return r.stdout}
const targets=run([...base,'list','targets']).trim().split(/\r?\n/).filter(Boolean);assert.equal(targets.length,1);assert.ok(createHash('sha256').update(targets[0]).digest('hex').startsWith('54cfb7ac'));const device=(...args)=>run([...base,'-t',targets[0],...args]);assert.equal(device('shell','pidof',m.bundle).trim(),m.pid)
await writeFile('evidence/phase72-phone-stop-attempt.json',JSON.stringify({at:new Date().toISOString(),ownedPid:m.pid,normalExitAttempted:true,unknownUntilObserved:true})+'\n',{flag:'wx'})
const output=device('shell','aa','force-stop',m.bundle),after=device('shell','pidof',m.bundle).trim();assert.equal(after,'')
const report={at:new Date().toISOString(),ownedPid:m.pid,finalPid:after,normalExitAttempted:true,normalExitCompleted:false,normalExitFailureVisible:true,ownedAppForceStopped:true,output,dataCleared:false,identityDeleted:false,sharedHdcChanged:false};await writeFile('evidence/phase72-phone-cleanup.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))

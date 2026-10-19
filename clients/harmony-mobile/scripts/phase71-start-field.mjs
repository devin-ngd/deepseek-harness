/** One original-world invocation of the frozen dsh profile through its real local TTY; new grant still requires the fresh proof/confirmation. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
const marker=JSON.parse(await readFile('.build/phase71-field-active.json','utf8')),hash=b=>createHash('sha256').update(b).digest('hex'); assert.ok(process.stdin.isTTY&&process.stdout.isTTY); assert.equal(marker.grantMaximumMs,1800000); assert.equal(marker.expectedNewGrantEpoch,3);assert.equal(hash(await readFile(join(marker.home,'field.json'))),marker.configPreparedSha256)
const files=JSON.parse(await readFile('.build/phase69-review-candidate/files.sha256.json','utf8'));for(const f of files.filter(f=>f.file.startsWith('desktop/')))assert.equal(hash(await readFile(join('.build/phase69-review-candidate',f.file))),f.sha256)
const startedAt=new Date().toISOString();await writeFile('evidence/phase71-field-start-attempt.json',JSON.stringify({startedAt,app:marker.app,home:marker.home,grantCreated:false,unknownUntilObserved:true})+'\n',{flag:'wx'})
const child=spawn(process.execPath,[join(marker.app,'field-launch.mjs'),'--home',marker.home],{windowsHide:true,stdio:'inherit'});await writeFile('.build/phase71-field-process.json',JSON.stringify({at:startedAt,launcherPid:child.pid,app:marker.app,home:marker.home,onlyOwnedRuntime:true})+'\n',{flag:'wx'});const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))});await writeFile('evidence/phase71-field-exit.json',JSON.stringify({startedAt,completedAt:new Date().toISOString(),...result})+'\n',{flag:'wx'});process.exitCode=result.code??1

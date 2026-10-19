/** Run only public-fixture/memory-adapter operator tests with a scrubbed environment; no approval record is supplied. */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const label = new Date().toISOString().replaceAll(':','-').replaceAll('.','-'), env = Object.fromEntries(['PATH','SystemRoot','WINDIR','ComSpec'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
Object.assign(env,{TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1'})
const args=['--test','tests/phase75-operations.test.mjs','tests/phase75-operation-security.test.mjs'],child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log=''
for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes.toString('utf8')})
const code=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept)}),path='evidence/phase75-operator-'+label+'.log';await writeFile(path,log.trimEnd()+'\n',{flag:'wx'})
const report={at:new Date().toISOString(),command:[process.execPath,...args],code,passed:Number(/(?:# |ℹ )pass (\d+)/.exec(log)?.[1]??0),failed:Number(/(?:# |ℹ )fail (\d+)/.exec(log)?.[1]??0),log:path,phoneIo:false,remoteIo:false,realGrantCreated:false};await writeFile('evidence/phase75-operator-tests-latest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(code!==0)console.error(log.split('\n').slice(-50).join('\n'));process.exitCode=code??1

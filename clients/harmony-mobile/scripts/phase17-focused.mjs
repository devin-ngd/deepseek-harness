/** Offline fixed-replay fixture rehearsal only; no emulator, install, forward or credentials reach the child. */
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises'
import {join,resolve} from 'node:path'
const source=JSON.parse(await readFile('source.json','utf8')),world=await mkdtemp('D:/Temp/dsh-harmony-phase17-offline-'),output=resolve('evidence/phase17-focused-'+new Date().toISOString().replaceAll(':','-'));await mkdir(output)
const args=[resolve(source.dshRoot,'node_modules/vitest/vitest.mjs'),'run','clients/harmony-mobile/network-tests/phase17.spec.ts','--configLoader','native','--config',resolve('network-tests/vitest.config.mjs'),'--reporter=default','--reporter=json','--outputFile='+join(output,'tests.json')]
const child=spawn(process.execPath,args,{cwd:source.dshRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,windir:process.env.windir,PATHEXT:process.env.PATHEXT,TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_INTEGRATION_WORLD:world}})
let log=''
for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes.toString();process.stdout.write(bytes);if(Buffer.byteLength(log)>2097152)child.kill()})
const timer=setTimeout(()=>child.kill(),60000),exit=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}))}).finally(()=>clearTimeout(timer))
try{const report=join(output,'tests.json');await writeFile(report,JSON.stringify(JSON.parse(await readFile(report,'utf8')),null,2)+'\n')}catch(error){if(error.code!=='ENOENT')throw error}
await writeFile(join(output,'tests.log'),log.replaceAll('\r\n','\n').trimEnd()+'\n');await writeFile(join(output,'summary.json'),JSON.stringify({world,output,args,...exit,passed:exit.code===0&&!exit.signal,nativeActivated:false,installed:false,forwardCreated:false},null,2)+'\n')
console.log('Focused offline report: '+output);if(exit.code!==0||exit.signal)process.exitCode=1

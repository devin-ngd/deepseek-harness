/** Focused phase11 source-service test entry; this is a bounded Vitest test process, never an application launcher. */
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const source=JSON.parse(await readFile('source.json','utf8'))
const world=await mkdtemp('D:/Temp/dsh-harmony-phase11-services-')
const report=resolve('evidence/phase11-focused-vitest.json')
const child=spawn(process.execPath,[resolve(source.dshRoot,'node_modules/vitest/vitest.mjs'),'run','--configLoader','native','--config',resolve('network-tests/vitest.config.mjs'),'-t','native byte core drives actual DSH','--reporter=default','--reporter=json','--outputFile='+report],{
 cwd:source.dshRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],
 env:{PATH:process.env.PATH,PATHEXT:process.env.PATHEXT,SystemRoot:process.env.SystemRoot,windir:process.env.windir,ComSpec:process.env.ComSpec,TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_INTEGRATION_WORLD:world},
})
let log='',exceeded=false,timedOut=false
const append=bytes=>{if(Buffer.byteLength(log)+bytes.length>2097152){exceeded=true;child.kill();return}log+=bytes.toString('utf8');process.stdout.write(bytes)}
child.stdout.on('data',append);child.stderr.on('data',append)
const timer=setTimeout(()=>{timedOut=true;child.kill()},150000)
const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))}).finally(()=>clearTimeout(timer))
await writeFile('evidence/phase11-focused.log',log.replaceAll('\r\n','\n').trimEnd()+'\n')
await writeFile('evidence/phase11-focused.json',JSON.stringify({world,...result,timedOut,exceeded,layer:'focused real services plus native SDK substitute'},null,2)+'\n')
if(result.code!==0||result.signal||timedOut||exceeded)process.exitCode=1

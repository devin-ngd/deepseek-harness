/** Explicit test process owner for approved emulator replay; scrubs model credentials and records a bounded lifetime. */
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
const world=process.argv[2]
if(!world||!resolve(world).startsWith('D:\\Temp\\dsh-harmony-phase13-'))throw new Error('Owned phase13 world required')
const initialPort=process.argv[3]??'0'
if(!/^(?:0|[1-9][0-9]{0,4})$/.test(initialPort)||Number(initialPort)>65535)throw new Error('Bounded task-owned initial port required')
await mkdir(world,{recursive:true});const source=JSON.parse(await readFile('source.json','utf8'))
const child=spawn(process.execPath,[resolve(source.dshRoot,'node_modules/vitest/vitest.mjs'),'run','--configLoader','native','--config',resolve('native-network-tests/vitest.config.mjs'),'--reporter=default'],{cwd:source.dshRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,PATHEXT:process.env.PATHEXT,SystemRoot:process.env.SystemRoot,windir:process.env.windir,ComSpec:process.env.ComSpec,TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_NATIVE_ACCEPTANCE:'approved-phase13',DSH_HARMONY_NATIVE_WORLD:resolve(world),DSH_HARMONY_NATIVE_INITIAL_PORT:initialPort}})
await writeFile(world+'/owner.json',JSON.stringify({launcherPid:process.pid,vitestPid:child.pid,world,startedAt:new Date().toISOString(),testOnly:true},null,2)+'\n')
let log='',exceeded=false,timedOut=false
const append=bytes=>{if(Buffer.byteLength(log)+bytes.length>2097152){exceeded=true;child.kill();return}log+=bytes.toString();process.stdout.write(bytes)}
child.stdout.on('data',append);child.stderr.on('data',append)
const timer=setTimeout(()=>{timedOut=true;child.kill()},2200000)
const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}))}).finally(()=>clearTimeout(timer))
await writeFile(world+'/service.log',log.replaceAll('\r\n','\n').trimEnd()+'\n');await writeFile(world+'/exit.json',JSON.stringify({...result,exceeded,timedOut},null,2)+'\n')
if(result.code!==0||result.signal||exceeded||timedOut)process.exitCode=1

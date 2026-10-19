/** Approved second-round synthetic service owner; no model credentials or user storage reach its child. */
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const world=resolve(process.argv[2]??''),ninth=process.argv.includes('--phase28'),eighth=process.argv.includes('--phase26'),seventh=process.argv.includes('--phase24'),sixth=process.argv.includes('--phase22'),fifth=process.argv.includes('--phase20'),fourth=process.argv.includes('--phase18'),next=ninth||eighth||seventh||sixth||fifth||fourth||process.argv.includes('--phase17'),phase=ninth?'28':eighth?'26':seventh?'24':sixth?'22':fifth?'20':fourth?'18':next?'17':'16'
if(!world.startsWith('D:\\Temp\\dsh-harmony-phase'+phase+'-native-'))throw Error('Explicit owned native world required')
if(next&&process.env.DSH_HARMONY_NATIVE_ACCEPTANCE!=='approved-phase'+phase)throw Error('A new phase'+phase+' approval is required before launching the native service owner')
await mkdir(world,{recursive:true})
const source=JSON.parse(await readFile('source.json','utf8'))
const child=spawn(process.execPath,[resolve(source.dshRoot,'node_modules/vitest/vitest.mjs'),'run','--configLoader','native','--config',resolve('native-network-tests/phase'+(ninth||eighth||seventh||sixth||fifth||fourth?'17':phase)+'.config.mjs'),'--reporter=default'],{cwd:source.dshRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,PATHEXT:process.env.PATHEXT,SystemRoot:process.env.SystemRoot,windir:process.env.windir,ComSpec:process.env.ComSpec,TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_NATIVE_ACCEPTANCE:'approved-phase'+phase,DSH_HARMONY_NATIVE_WORLD:world,DSH_HARMONY_NATIVE_CONTINUE:process.argv.includes('--continue-existing')?'1':'0'}})
await writeFile(join(world,'owner.json'),JSON.stringify({launcherPid:process.pid,vitestPid:child.pid,world,startedAt:new Date().toISOString(),testOnly:true},null,2)+'\n')
let log='',timedOut=false
const append=bytes=>{if(Buffer.byteLength(log)+bytes.length>2097152){child.kill();return}log+=bytes.toString();process.stdout.write(bytes)}
child.stdout.on('data',append);child.stderr.on('data',append)
const timer=setTimeout(()=>{timedOut=true;child.kill()},2400000)
const result=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}))}).finally(()=>clearTimeout(timer))
await writeFile(join(world,'service.log'),log.replaceAll('\r\n','\n').trimEnd()+'\n');await writeFile(join(world,'exit.json'),JSON.stringify({...result,timedOut},null,2)+'\n')
if(result.code!==0||result.signal||timedOut)process.exitCode=1

/** Start only the approved existing emulator, with file-only license snapshots and no dialogue input. */
import {spawn}from'node:child_process'
import {readFile,writeFile}from'node:fs/promises'
import{resolve,join}from'node:path'
import{auditEmulatorMetadata}from'./emulator-metadata-audit.mjs'
const world=resolve(process.argv[2]??'')
if(!world.startsWith('D:\\Temp\\dsh-harmony-phase16-native-'))throw Error('Owned second-round world required')
const request={installedDirectory:'D:/Program Files/HuaWei/DevEco Studio/tools/emulator',licenseFile:'C:/Users/wpdev/AppData/Local/Huawei/Emulator26.0/.emu_config'}
const before=await auditEmulatorMetadata(request)
await writeFile(join(world,'license-before-start.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'})
if(Object.values(before.license.fields).some(value=>value!=='agree'))throw Error('License file is not agreed; no executable started')
const exe=join(request.installedDirectory,'Emulator.exe'),args=['-start','DSHOfflineAPI26','-instancePath','D:/Temp/dsh-harmony-hvd-api26-20261011']
const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
await writeFile(join(world,'emulator-owner.json'),JSON.stringify({instance:'DSHOfflineAPI26',target:'127.0.0.1:16311',emulatorStartedByTask:true,pid:child.pid,startedAt:new Date().toISOString(),exe,args,inputSent:false},null,2)+'\n',{flag:'wx'})
let log=''
const receive=bytes=>{log+=bytes.toString();process.stdout.write(bytes);if(/Do you want to continue|confirm whether agree/i.test(log))void writeFile(join(world,'unexpected-license-dialogue.json'),JSON.stringify({at:new Date().toISOString(),pid:child.pid,inputSent:false,cancelled:false,dependentWorkMustStop:true},null,2)+'\n')}
child.stdout.on('data',receive);child.stderr.on('data',receive)
const result=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}))})
const after=await auditEmulatorMetadata(request)
await writeFile(join(world,'emulator-start.log'),log.replaceAll('\r\n','\n').trimEnd()+'\n')
await writeFile(join(world,'emulator-start-exit.json'),JSON.stringify(result,null,2)+'\n')
await writeFile(join(world,'license-after-start-process-exit.json'),JSON.stringify(after,null,2)+'\n')
process.exitCode=result.code??1

/** Default is inactive; the actual prewindow app check requires the separately approved fourth-round owner. */
import {readFile,writeFile,rename,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {prepareNativeReadiness} from './native-prewindow-readiness.mjs'
import {sdkFailure,NativeAcceptanceFailure,nativeControlStatus} from './native-window-policy.mjs'
if(!process.argv.includes('--execute-readiness')){console.log('INACTIVE: verify app PID/private document/foreground controls and live unused service before any forward');process.exit(0)}
const ninth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase28'
const eighth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase26'
const seventh=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase24',sixth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase22',fifth=process.env.DSH_HARMONY_NATIVE_ACCEPTANCE==='approved-phase20',phase=ninth?'28':eighth?'26':seventh?'24':sixth?'22':fifth?'20':'18'
if(process.env.DSH_HARMONY_NATIVE_ACCEPTANCE!=='approved-phase'+phase)throw Error('New readiness approval required')
const world=resolve(process.argv[2]??'');if(!world.startsWith('D:\\Temp\\dsh-harmony-phase'+phase+'-native-'))throw Error('Matching owned approved world required')
const checkpointProof=process.argv.includes('--checkpoint-proof')
if((ninth||eighth)&&!checkpointProof)throw Error('Checkpoint window requires sealed checkpoint readiness')
if(checkpointProof&&!seventh&&!eighth&&!ninth)throw Error('Checkpoint proof readiness requires its prepared approved round')
const json=async path=>JSON.parse(await readFile(path,'utf8')),marker=await json(join(world,'emulator-owner.json')),hap=await json(ninth?'evidence/phase28-hap.json':checkpointProof?'evidence/phase25-hap.json':seventh?'evidence/phase23-hap.json':sixth?'evidence/phase22-hap.json':'evidence/phase17-hap.json')
if(checkpointProof&&hap.checkpointDiagnostics!==1)throw Error('Sealed checkpoint diagnostics are required')
if(!marker.verifiedActualProcess||!marker.emulatorStartedByTask||!marker.netreplayInitiallyAbsent||marker.instance!=='DSHOfflineAPI26')throw Error('Prewindow ownership/absence proof required')
if(createHash('sha256').update(await readFile(hap.path)).digest('hex')!==hap.sha256)throw Error('Sealed HAP differs')
let forward=false;try{await stat(join(world,'forward-lease.json'));forward=true}catch(error){if(error.code!=='ENOENT')throw error}
const end=Date.now()+120000,monoEnd=performance.now()+120000,records=[]
const budget={remaining:()=>Math.max(0,Math.min(end-Date.now(),monoEnd-performance.now())),requireTime(){if(this.remaining()<=0)throw new NativeAcceptanceFailure('prewindow-deadline')}}
const hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',emulator='D:/Program Files/HuaWei/DevEco Studio/tools/emulator/Emulator.exe',connection=['-p','-s','127.0.0.1:8710','-t',marker.target]
async function run(exe,args,readOnly=true){budget.requireTime();const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,windir:process.env.windir,PATHEXT:process.env.PATHEXT,TEMP:'D:/Temp',TMP:'D:/Temp'}});let output='';for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes.toString();if(Buffer.byteLength(output)>4194304)child.kill()});const timer=setTimeout(()=>child.kill(),15000),exit=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}))}).finally(()=>clearTimeout(timer));records.push({exe,args,...exit,output});if(exit.code!==0||exit.signal||/^(?:error:|\[Fail\]|\[Error\])/im.test(output))throw sdkFailure(output,readOnly);return output}
const device=(...args)=>run(hdc,[...connection,...args],args[0]==='shell'&&['param','pidof','hilog'].includes(args[1]))
async function layout(){const file='D:/Temp/dsh-harmony-hvd-api26-20261011/DSHOfflineAPI26/uiLayout/widget_tree.json',began=Date.now();await run(emulator,['-instance','DSHOfflineAPI26','-instancePath','D:/Temp/dsh-harmony-hvd-api26-20261011','-imageRoot','D:/Temp/dsh-harmony-images-api26-20261011','-uiLayout','-i']);for(let i=0;i<40;i++){budget.requireTime();if((await stat(file)).mtimeMs>=began)return json(file);await delay(250)}throw new NativeAcceptanceFailure('layout-not-yet-current','retry-read')}
async function status(){const seq=Date.now(),file=join(world,'control.next.json');await writeFile(file,JSON.stringify({seq,operation:'status'})+'\n');await rename(file,join(world,'control.json'));for(let i=0;i<40;i++){try{const value=await json(join(world,'ack-'+seq+'.json')),owner=await json(join(world,'owner.json'));return{...nativeControlStatus(await json(join(world,'state.json')),value,seq),serviceRemainingMs:Date.parse(owner.startedAt)+1800000-Date.now()}}catch(error){if(error.code!=='ENOENT')throw error}await delay(250)}throw new NativeAcceptanceFailure('service-status-not-yet-ready','retry-read')}
try{const ready=await prepareNativeReadiness({device,appLog:pid=>device('shell','hilog','-P',String(pid),'-x'),appLayout:layout,serviceStatus:status,wall:Date.now,sleep:delay},{budget,pauseMs:5000,hapPath:resolve(hap.path),hapSha256:hap.sha256,target:marker.target,forwardExists:forward});if(checkpointProof){const nodes=[];const visit=value=>{for(const node of value){nodes.push(node);if(node.children)visit(node.children)}};visit(await layout());const latest=nodes.filter(node=>node.attributes.id==='dsh-transcript-latest'&&node.attributes.type==='Button'&&node.attributes.visible==='true');if(latest.length!==1)throw new NativeAcceptanceFailure('checkpoint-latest-control-not-confirmed','block');ready.checkpointDiagnostics=1}await writeFile(join(world,'prewindow-ready.json'),JSON.stringify(ready,null,2)+'\n',{flag:'wx'});console.log('PASS prewindow readiness: '+ready.appPid)}
catch(error){await writeFile(join(world,'prewindow-failure.json'),JSON.stringify({code:error.code??'unexpected',message:error.message,forwardCreated:false,settingsChanged:false,authenticationAttempted:false},null,2)+'\n');throw error}
finally{await writeFile(join(world,'prewindow-commands.json'),JSON.stringify(records,null,2)+'\n')}

/** Inactive planning and approval guards invoke no SDK commands, emulator or native listener. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {startNativeReplayApp} from '../scripts/native-app-startup.mjs'
const execute=promisify(execFile),script=fileURLToPath(new URL('../scripts/phase17-native-driver.mjs',import.meta.url)),owner=fileURLToPath(new URL('../scripts/phase16-native-services.mjs',import.meta.url))
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:'D:/Temp',TMP:'D:/Temp'}
test('next native driver defaults to a finite inactive plan without reading a device world',async()=>{
  const result=await execute(process.execPath,[script],{env,windowsHide:true}),plan=JSON.parse(result.stdout)
  assert.equal(plan.inactive,true);assert.equal(plan.deviceCommands,0);assert.equal(plan.forwardingCreated,false);assert.ok(plan.driverMaximumMinutes<30)
  assert.equal(plan.faultScenarios.length,7);assert.ok(plan.faultScenarios.includes('cursor-conflict'))
})
test('spent or absent approval refuses the next native driver and service owner before device or child work',async()=>{
  for(const flag of [undefined,'approved-phase16']){
    const scoped=flag?{...env,DSH_HARMONY_NATIVE_ACCEPTANCE:flag}:env
    await assert.rejects(execute(process.execPath,[script,'D:/Temp/dsh-harmony-phase18-native-inactive','--execute'],{env:scoped,windowsHide:true}),error=>error.code===1&&error.stderr.includes('New explicit phase18 approval required'))
    await assert.rejects(execute(process.execPath,[owner,'D:/Temp/dsh-harmony-phase17-native-inactive','--phase17'],{env:scoped,windowsHide:true}),error=>error.code===1&&error.stderr.includes('new phase17 approval'))
  }
})

test('native startup wakes before launching the app and does not change developer or lock settings',async()=>{
  let awake=false,installed=false,launched=false
  const device=async(...args)=>{
    if(args.join(' ')==='shell param get const.ohos.apiversion')return '26\n'
    if(args[0]==='install'){installed=true;return 'installed'}
    if(args.join(' ')==='shell power-shell wakeup'){awake=true;return 'awake'}
    if(args.join(' ')==='shell aa start -b local.dsh.mobile.netreplay -a EntryAbility'){assert.equal(installed,true);assert.equal(awake,true);launched=true;return 'started'}
    throw Error('Unexpected SDK command')
  }
  await startNativeReplayApp(device,'sealed.hap');assert.equal(launched,true)
})

test('a persistent screen lock rejects startup once without bypass or a settings command',async()=>{
  let launches=0
  const device=async(...args)=>{
    if(args.join(' ')==='shell param get const.ohos.apiversion')return '26'
    if(args[0]==='install'||args.join(' ')==='shell power-shell wakeup')return 'accepted'
    if(args[1]==='aa'){launches++;throw Error('10106102 screen locked')}
    throw Error('No settings or bypass command permitted')
  }
  await assert.rejects(startNativeReplayApp(device,'sealed.hap'),/10106102/);assert.equal(launches,1)
})

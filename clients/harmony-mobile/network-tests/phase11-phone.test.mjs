/** Real BFF domain services with actual .ets control logic under a Node-only SDK callback substitute. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, writeFile, access } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { ByteNetworkPhone } from '../.build/network-phone.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { PhoneCore } from '../.build/phone-core.js'
import { PhoneLibrary } from '../.build/phone-library.js'
import { nativeLoopbackPort } from '../tests/helpers/native-http-loopback.mjs'
const limits = { maxBytes: 1048576, maxEvents: 512, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
const readLimits = JSON.parse(await readFile(new URL('../harmony/native-policy.json', import.meta.url), 'utf8')).host.read

test('native byte consumer reaches real replay task/action/cancel/history and original receipts after reconnect', async () => {
  const url = process.env.DSH_HARMONY_PHONE_URL, output = process.env.DSH_HARMONY_PHONE_REPORT
  if (!url || !output) throw new Error('Parent-owned fixture required')
  const adapter = nativeLoopbackPort(url, true)
  const owner = { desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: 'phase11-session' }
  let transport, core, life, following, error, counter = 0
  const views = [], checks = []
  const trace = stage => console.log('phase11 ' + process.env.DSH_HARMONY_PHASE11_MODE + ': ' + stage)
  const connect = async () => {
    trace('connect start')
    transport = new ByteNetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl: url, maxFrameBytes: 1048576, maxReadChunkBytes: 1048576, requestTimeoutMs: 20000, maxInFlight: 4 }, adapter.port)
    const model = new SemanticPhone(owner, limits, 512)
    core = new PhoneCore(transport, model, { follow: { mode: 'once' }, clock: Date.now, grantEpoch: 1, ttlMs: 60000, maxMounts: 4, maxIntents: 128, nextCommandId: () => 'phase11-core-' + ++counter })
    life = new AbortController()
    error = undefined
    following = (async () => { try { for await (const view of core.follow(life.signal)) views.push({task:view.task, connection:view.connection, liveText:view.liveText, messages:view.messages.length}) } catch (value) { if (!life.signal.aborted) error = value } })()
    await until(() => model.view.connection === 'connected')
    trace('connect ready')
    return { model, library: new PhoneLibrary(core, model, readLimits, Date.now, 1, 86400000) }
  }
  const disconnect = async () => { trace('disconnect start'); life?.abort(); await following; await core?.close(); trace('disconnect done') }
  async function until(predicate) { for (let n=0;n<1000;n++) { if(error)throw error; if(predicate())return; await delay(5) } throw new Error('Bounded wait failed') }
  try {
    let { model, library } = await connect()
    if (process.env.DSH_HARMONY_PHASE11_MODE === 'reopen') {
      trace('reopen receipt')
      assert.ok(model.view.messages.length > 0)
      const receipt = await core.receipt('phase11-task')
      assert.equal(receipt.accepted,true)
      trace('reopen mount')
      const reference = model.view.messages.flatMap(row=>row.rich)[0], mount = await core.mount(reference)
      assert.equal((await core.request('rich.status',{mountId:mount.mountId,actionId:'phase3-action'})).state,'completed')
      trace('reopen duplicate submit')
      await core.submit('phase11-task','Fixed native byte task')
      trace('reopen submit settled')
      checks.push('actual JSONL/journal/ledger reopen, original receipt/action without redispatch')
    } else {
      await core.submit('phase11-task','Fixed native byte task')
      await until(()=>model.view.task==='completed' && model.view.messages.some(row=>row.rich.length))
      await core.submit('phase11-task','Fixed native byte task')
      assert.ok(views.some(view=>view.liveText.length>0))
      checks.push('real task stream and duplicate admission')
      const reference = model.view.messages.flatMap(row=>row.rich)[0], mount = await core.mount(reference)
      const values={title:'Final mobile input',count:'7'}
      const intent={mountId:mount.mountId,actionId:'phase3-action',actionName:'submit',targetActionId:null,expectedDataRevision:mount.snapshot.dataRevision,values,fileGrants:[],draft:{baseRevision:mount.snapshot.draft.draftRevision,stateSchemaVersion:1,fields:values,dirty:Object.keys(values)}}
      const first=await core.request('rich.invoke',intent)
      assert.equal(first.accepted,true)
      await until(()=>model.view.task==='completed')
      for(let n=0;n<200;n++){const status=await core.request('rich.status',{mountId:mount.mountId,actionId:'phase3-action'});if(status.state==='completed')break;if(n===199)throw new Error('Action did not settle');await delay(5)}
      assert.deepEqual(await core.request('rich.invoke',intent),first)
      checks.push('actual rich ledger completes original action once')
      let cache
      await library.save({async write(value){cache=value},async read(){return cache},async clear(){cache=undefined}})
      await disconnect()
      ;({model,library}=await connect())
      await core.submit('phase11-task','Fixed native byte task')
      assert.ok(await library.restore({async read(){return cache},async write(){throw new Error('read only')},async clear(){throw new Error('read only')}}))
      assert.equal(model.view.readOnly,true)
      checks.push('retained reconnect, original task receipt and validated read-only cache')
      await disconnect()
      ;({model}=await connect())
      await core.submit('phase11-cancel','Fixed cancellable task')
      await until(()=>model.view.task==='running')
      for(let n=0;n<500;n++){try{await access(process.env.DSH_HARMONY_CANCEL_READY);break}catch(value){if(value.code!=='ENOENT')throw value;await delay(5)}if(n===499)throw new Error('Replay hang not ready')}
      await core.cancel()
      await until(()=>model.view.task==='cancelled')
      checks.push('actual SessionController cancels fourth fixed hang response')
    }
    assert.equal(error,undefined)
    assert.ok(adapter.privateCalls.some(call=>call.method==='http.read'))
    assert.ok(adapter.privateCalls.filter(call=>call.method==='http.begin').every(call=>Object.keys(call.payload).join(',')==='endpoint,body'&&!Object.hasOwn(call.payload,'url')))
    checks.push('private MessagePort begin/read/close with native-issued leases and no caller URL')
    await writeFile(output,JSON.stringify({processId:process.pid,layer:'Node MessageChannel + compiled .ets HTTP lease/control logic over real loopback BFF; not ArkWeb/emulator/native HTTP',checks,views,requests:adapter.requests.length,privateByteCalls:adapter.privateCalls.length,arkWebQualified:false,nativeHttpQualified:false},null,2)+'\n')
  } finally { await disconnect(); await adapter.close() }
})

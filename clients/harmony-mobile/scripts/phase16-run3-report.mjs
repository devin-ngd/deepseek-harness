/** Preserve only the owned completed synthetic native round; never activate tools or rewrite existing evidence. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const world = resolve(process.argv[2] ?? '')
if (world !== 'D:\\Temp\\dsh-harmony-phase16-native-20261012-run3') throw Error('Exact completed native world required')
const json = async name => JSON.parse(await readFile(join(world, name), 'utf8'))
const lease = await json('forward-lease.json'), cleanup = await json('forward-cleanup.json'), service = await json('service-final.json'), exit = await json('exit.json')
const before = (await json('license-before-start.json')).license, after = (await json('license-after-stop.json')).license
const created = service.records.find(row => row.mode === 'create'), reopened = service.records.find(row => row.mode === 'reopen')
if (cleanup.failure !== null || cleanup.deadlineExceeded || cleanup.cleanup.some(row => !row.ok) || !service.closed || !created || !reopened) throw Error('Native cleanup or service records incomplete')
if (created.counts.replay[0].calls !== 4 || created.promptCalls !== 3 || reopened.counts.replay[0].calls !== 0 || reopened.promptCalls !== 0 || service.realModelCalls !== 0 || service.uploadCalls !== 0) throw Error('Synthetic dispatch evidence differs')
if (before.sha256 !== after.sha256 || before.modifiedUtc !== after.modifiedUtc || Object.values(after.fields).some(value => value !== 'agree')) throw Error('License stability not established')
const appLog = await readFile(join(world, 'native-app-final.log'), 'utf8'), serviceLog = await readFile(join(world, 'service.log'), 'utf8')
if (!appLog.includes('cancel_requested') || !appLog.includes('cancelled') || !appLog.includes('native-operation-failed')) throw Error('Required native outcome evidence missing')
if (exit.code !== 1 || !serviceLog.includes("reading 'assertZeroRealCalls'")) throw Error('Original runner failure must remain explicit')
const rich = await json('services/state/rich_inline.json'), admissions = await json('services/state/harmony_mobile_lab.json')
const session = rich.tables.sessions['phase11-session'], action = session.actions['phase3-action']
const blocks = Object.entries(session.blocks).map(([blockId, value]) => ({ blockId, dataRevision: value.dataRevision, draft: value.draft, values: value.values }))
if (action.status.state !== 'completed' || action.status.values.title !== 'Final mobile input' || action.status.values.count !== '7' || Object.keys(session.actions).length !== 1 || Object.keys(admissions.tables.admissions).length !== 2) throw Error('Durable rich/admission evidence differs')
const output = resolve('evidence/phase16-native-run3')
await mkdir(output)
const names = ['forward-lease.json','forward-active.json','forward-cleanup.json','emulator-owner.json','emulator-start.log','license-before-start.json','license-before-stop.json','license-after-stop.json','service-final.json','exit.json','service.log','inspection-create.json','inspection-reopen.json','state.json','native-app-initial.log','native-app-after-cancel.log','native-app-cache-reopen.log','native-app-reconnected.log','native-app-final.log','native-screen.jpeg','after-action.jpeg','reconnected.jpeg','services/state/rich_inline.json','services/state/harmony_mobile_lab.json']
const hashes = {}
for (const name of names) {
  const target = name.replaceAll('/', '__')
  let bytes = await readFile(join(world, name))
  if (!name.endsWith('.jpeg')) bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n').trimEnd()+'\n')
  await writeFile(join(output, target), bytes, { flag: 'wx' })
  hashes[target] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const summary = {
  schema: 'dsh-harmony-native-run/1', generatedAt: new Date().toISOString(), qualification: 'API26 emulator, actual ArkTS/ArkUI/ArkWeb and native NetworkKit; synthetic fixed DSH replay only; partial acceptance',
  world, bundle: 'local.dsh.mobile.netreplay', deviceApi: 26,
  window: { ...lease, completedAt: cleanup.completedAt, elapsedMs: Date.parse(cleanup.completedAt)-Date.parse(lease.startedAt), deadlineExceeded: false, mappingReplaced: false },
  nativePassed: ['private native HTTP reaches real loopback DSH source services','ten-second clean follow segments resume','fixed task, rich form, source-offload and completed action','duplicate task and concurrent same-action submissions cause no extra model dispatch','fourth fixed hang cancels','service reopen and explicit native reconnect restore same session and submitted rich state','original task receipt after service reopen causes zero dispatch','observed parent DOM, host bridge, popup, Worker, WebSocket, fetch, file and shell RPC isolation'],
  nativeFailed: [{ operation: 'save → disconnect → cache.restore', code: 'native-operation-failed', diagnosis: 'disconnect discarded the PhoneLibrary required for restore; repaired after the run with offline regression only' }],
  nativeUnverified: ['cache restore repair on ArkWeb/native filesystem','unexpected transport interruption and automatic retry budget exhaustion','old-generation SDK mount request after service reopen','unknown, malformed, truncated and conflicting frame injection','two overlapping action promises both settling visibly','production dsh profile and installed desktop connection','WebRTC/download/long-running guest resource isolation','WAN, actual pairing, real device and signing'],
  serviceRunner: { ...exit, passed: false, failure: 'post-disposal assertion accessed released ctx.llm; assertion moved before cleanup after this run; no native rerun', cleanupSucceeded: true },
  services: service, persistent: { admissions: admissions.tables.admissions, action, blocks },
  cleanupPassed: true, licenseStable: { sha256: after.sha256, modifiedUtc: after.modifiedUtc, fields: after.fields, rawFileCopied: false, licenseCliInvoked: false },
  sharedResources: { hdcPid: 67100, preserved: true, devEcoIdeClosedByUser: true, ownedEmulatorPid27416Gone: true },
  realModels: 0, uploads: 0, evidence: hashes,
}
await writeFile(resolve('evidence/phase16-native-run3-summary.json'), JSON.stringify(summary,null,2)+'\n', { flag:'wx' })
console.log('PASS: preserved partial native outcome, original failed runner, bounded cleanup and license stability; no native activation')

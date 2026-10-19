/** Deterministic peer skew, transit, replay and clock failure scenarios; no system time or native resources change. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CommandEpochClock, resolveCommandLifetime } from '../.build/command-clock.js'
import { MOBILE_LINK_PROTOCOL, parseCommand } from '../.build/link-protocol.js'
import { PhoneCore } from '../.build/phone-core.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { TransportError } from '../.build/wire.js'
import { RestrictedDesktopAdapter } from '../.build/desktop-adapter.js'
import { MemoryAdmissionJournal } from '../.build/admission-journal.js'
import { createLinkLab } from './helpers/link-lab.mjs'
import { nativeBootstrapPolicy } from '../.build/native-policy.js'
import { readFile } from 'node:fs/promises'

const epoch = 1791801410000, policy = { maxPeerSkewMs: 5000, maxWallDriftMs: 1000 }
const lifetime = resolveCommandLifetime(60000, policy)
function clock(offset = 0, drift = 1000) {
  let elapsed = 0, wallJump = 0
  const value = new CommandEpochClock({ wall: () => epoch + offset + elapsed + wallJump, monotonic: () => elapsed }, drift)
  return { value, advance(ms) { elapsed += ms }, jump(ms) { wallJump += ms } }
}
const packet = expiresAt => JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId: 'd', deviceId: 'p', grantEpoch: 1,
  commandId: 'bounded-read', expiresAt, operation: 'session.sync', payload: { sessionId: 's', afterSeq: -1 } })
const config = clock => ({ clock, maxPacketBytes: 4096, maxCommandTtlMs: 60000, maxCachedCommands: 8, maxMountedBlocks: 2 })
const expiry = reason => error => error.code === 'request-expired' && (reason === undefined || error.timing?.reason === reason)

test('explicit peer and two-owner drift budgets shorten wire validity and impossible budgets reject', () => {
  assert.deepEqual(lifetime, { nominalTtlMs: 60000, safetyBudgetMs: 7000, wireTtlMs: 53000 })
  for (const bad of [{ maxPeerSkewMs: -1, maxWallDriftMs: 0 }, { maxPeerSkewMs: 58000, maxWallDriftMs: 1000 }, { maxPeerSkewMs: Infinity, maxWallDriftMs: 0 }]) assert.throws(() => resolveCommandLifetime(60000, bad), error => error.code === 'invalid-config')
})

test('private HAP policy rejects missing, unknown and exhausted clock budgets before constructing any provider', async () => {
  const original = JSON.parse(await readFile('harmony/native-policy.json', 'utf8')).host
  for (const commandClock of [undefined, { maxPeerSkewMs: 5000, maxWallDriftMs: 1000, extra: 1 }, { maxPeerSkewMs: 58000, maxWallDriftMs: 1000 }]) {
    const candidate = { ...original, commandClock }
    assert.throws(() => nativeBootstrapPolicy(JSON.stringify({ protocol: 'dsh-native-bootstrap/1', policy: candidate })))
  }
})

test('positive/negative peer skew plus realistic network delay admits within the unchanged desktop cap', () => {
  for (const skew of [-5000, -413, 0, 413, 5000]) for (const delay of [0, 1, 400, 12000, 30000]) {
    const phone = clock(skew), desktop = clock(), expiresAt = phone.value.now() + lifetime.wireTtlMs
    desktop.advance(delay)
    assert.equal(parseCommand(packet(expiresAt), config(() => desktop.value.now())).expiresAt, expiresAt)
    assert.ok(expiresAt - desktop.value.now() <= 60000)
  }
})

test('captured sixth-window commands fit when the conservative lifetime is applied without changing server validation', () => {
  for (const [generatedAt, checkedAt] of [[1791801415446,1791801415042],[1791801417107,1791801416732],[1791801422490,1791801422132]]) {
    const expiresAt = generatedAt + lifetime.wireTtlMs
    parseCommand(packet(expiresAt), config(() => checkedAt))
    assert.ok(expiresAt - checkedAt < 60000)
  }
})

test('two-owner drift plus maximum peer wall skew reaches but never exceeds the original future cap', () => {
  const phone = clock(6000), desktop = clock(-1000)
  phone.jump(-1000); desktop.jump(1000)
  const expiresAt = phone.value.now() + lifetime.wireTtlMs
  assert.equal(expiresAt - desktop.value.now(), 60000)
  parseCommand(packet(expiresAt), config(() => desktop.value.now()))
  assert.throws(() => parseCommand(packet(expiresAt + 1), config(() => desktop.value.now())), expiry('future-limit'))
})

test('negative skew and transit can reach an exact expired deadline; excessive future stamps still reject', () => {
  const phone = clock(-5000), desktop = clock(), expiresAt = phone.value.now() + lifetime.wireTtlMs
  desktop.advance(48000)
  assert.throws(() => parseCommand(packet(expiresAt), config(() => desktop.value.now())), expiry('elapsed'))
  desktop.advance(1)
  assert.throws(() => parseCommand(packet(expiresAt), config(() => desktop.value.now())), expiry('elapsed'))
  assert.throws(() => parseCommand(packet(epoch + 8000 + lifetime.wireTtlMs), config(() => epoch)), expiry('future-limit'))
})

test('small positive/negative wall corrections never renew a minted deadline or reverse the admission clock', () => {
  for (const jump of [-1000, 1000]) {
    const desktop = clock(), expiresAt = desktop.value.now() + lifetime.wireTtlMs
    desktop.advance(53000); desktop.jump(jump)
    assert.equal(desktop.value.now(), epoch + 53000)
    assert.throws(() => parseCommand(packet(expiresAt), config(() => desktop.value.now())), expiry('elapsed'))
  }
})

test('large wall jumps and monotonic regressions fail closed permanently even after the wall is corrected', () => {
  for (const jump of [-1001, 1001]) {
    const source = clock(); source.jump(jump)
    assert.throws(() => source.value.now(), error => error.code === 'request-expired' && error.reason === 'wall-jump')
    source.jump(-jump)
    assert.throws(() => source.value.now(), error => error.reason === 'wall-jump')
  }
  const source = clock(); source.advance(10); source.value.now(); source.advance(-1)
  assert.throws(() => source.value.now(), error => error.reason === 'monotonic-regression')
  assert.equal(source.value.status, 'monotonic-regression')
})

test('read recovery and a new service generation mint fresh deadlines, never retry mutations, and reject the old envelope', async () => {
  const owner = { desktopId: 'd', deviceId: 'p', sessionId: 's' }, phone = clock(5000), desktop = clock()
  const model = new SemanticPhone(owner, { maxBytes: 65536, maxEvents: 64, maxBlocks: 64, maxText: 4096, maxRichBlocks: 4 }, 16)
  const reads = [], writes = [], abort = new AbortController(); let next = 0
  const reset = instance => ({ protocol:'dsh-mobile-wire/1',mode:'fixed-replay',...owner,instance,kind:'reset',relayCursor:0,payload:{type:'snapshot',header:{version:4,id:'s',createdAt:0,isSeeded:false},cursor:-1,records:[],hasMore:false,projections:{asOfSeq:-1,values:{}}} })
  const provider = { async *follow(command) {
    reads.push(command); parseCommand(JSON.stringify(command), config(() => desktop.value.now()))
    if (reads.length === 1) { yield reset('first'); phone.advance(60000); desktop.advance(60000); throw new TransportError('transport-lost') }
    assert.throws(() => parseCommand(JSON.stringify(reads[0]), config(() => desktop.value.now())), expiry('elapsed'))
    yield reset('reopened'); abort.abort()
  }, async request(command) { writes.push(command); throw Error('No mutation expected') }, async close() {} }
  const core = new PhoneCore(provider, model, { grantEpoch:1,ttlMs:lifetime.wireTtlMs,clock:()=>phone.value.now(),nextCommandId:()=> 'clock-read-'+ ++next,maxMounts:2,maxIntents:8,follow:{mode:'bounded',maxSegments:3,maxFailures:2,retryDelayMs:1} })
  for await (const view of core.follow(abort.signal)) void view
  assert.equal(model.resume.instance, 'reopened'); assert.notEqual(reads[0].commandId, reads[1].commandId)
  assert.ok(reads[1].expiresAt > reads[0].expiresAt); assert.deepEqual(writes, [])
  await core.close()
})

test('clock failure prevents a fresh read before provider IO and cannot be healed by a new core sharing that clock', async () => {
  const source = clock(); source.jump(1001); let calls = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = new SemanticPhone({desktopId:'d',deviceId:'p',sessionId:'s'},{maxBytes:65536,maxEvents:64,maxBlocks:64,maxText:4096,maxRichBlocks:4},16)
    const core = new PhoneCore({async *follow(){calls++},async request(){calls++;return null},async close(){}},model,{grantEpoch:1,ttlMs:lifetime.wireTtlMs,clock:()=>source.value.now(),nextCommandId:()=> 'failed-clock-'+attempt,maxMounts:2,maxIntents:8,follow:{mode:'once'}})
    await assert.rejects(async()=>{for await(const view of core.follow(new AbortController().signal))void view},error=>error.reason==='wall-jump')
    assert.equal(model.view.readOnly, true); await core.close()
  }
  assert.equal(calls, 0)
})

test('durable intent deduplication survives adapter replacement and expired replay remains rejected', async () => {
  const lab = createLinkLab(), journal = new MemoryAdmissionJournal(16)
  let elapsed = 0, wallJump = 0
  const authority = new CommandEpochClock({wall:()=>1000+elapsed+wallJump,monotonic:()=>elapsed},1000)
  const make = () => new RestrictedDesktopAdapter(lab.peer.desktopId, lab.host, lab.registry, {...lab.adapter.config,clock:()=>authority.now()},journal)
  let adapter = make()
  try {
    const original = lab.phone.command('task.submit', {sessionId:lab.sid,requestId:'stable-intent',text:'Synthetic'})
    await adapter.handle(JSON.stringify(original)); await adapter.handle(JSON.stringify(original)); assert.equal(lab.host.promptCalls, 1)
    await adapter.close(); adapter = make()
    await adapter.handle(JSON.stringify(original)); assert.equal(lab.host.promptCalls, 1)
    elapsed = 501; wallJump = -1000
    await assert.rejects(adapter.handle(JSON.stringify(original)), expiry('elapsed')); assert.equal(lab.host.promptCalls, 1)
  } finally { await adapter.close(); await lab.close() }
})

/** Offline authentication tests use only short-lived deterministic fake proofs and the maintained memory credential provider. */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as DisabledCarrier from './disabled-carrier.ts'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Authorization from '@deepseek-ai/dsh-authorization'
import type { AuthorizationPrompt } from '@deepseek-ai/dsh-authorization/types'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { DeviceAuthorizationOwner, DeviceAuthError, type DeviceAuthOptions, type DeviceChallenge } from './device-auth.ts'
import { connectDeviceChannel } from './device-auth-carrier.ts'
import { ProfilePeerAdmission } from '../desktop-plugin/src/admission.ts'
import * as Plugin from '../desktop-plugin/src/index.ts'
import { sourceComposition } from './source-composition.ts'
import { id } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import type { MobileCommand } from '../src/link-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { isRichJson } from '../src/upstream.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const desktopId = id<'mobile-desktop'>('phase34-desktop'), profileId = id<'mobile-profile'>('phase34-profile'), device = id<'mobile-device'>('phase34-device')
const enrollment = (deviceId: string, credentialId: string) => 'FAKE-ONLY-enrollment:' + deviceId + ':' + credentialId
const signature = (challenge: DeviceChallenge) => 'FAKE-ONLY-signature:' + JSON.stringify(challenge)
function proposal(deviceId = device) { return { deviceId, credentialId: 'phase34-key', proof: enrollment(deviceId, 'phase34-key'), sessions: ['phase34-session'], operations: ['task.receipt', 'session.sync'], grantTtlMs: 1000 } }
async function fixture(overrides: Partial<DeviceAuthOptions> = {}, supplied?: Context) {
  const ctx = supplied ?? new Context(); contexts.push(ctx)
  if (ctx.get('connection') === undefined) await ctx.plugin(DisabledCarrier)
  if (ctx.get('remoteAccess') === undefined) await ctx.plugin(RemoteAccess)
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  let now = Date.now(), challengeId = 0
  const authority = {}
  const options: DeviceAuthOptions = { desktopId, profileId, desktopCredentialId: id<'harmony-device-credential'>('FAKE-ONLY-desktop-fingerprint'), localAuthority: authority, clock: () => now,
    limits: { maxGrantTtlMs: 1000, maxConnectionTtlMs: 100, challengeTtlMs: 50, maxDevices: 2, maxChallengeIssues: 32, maxSessions: 2, maxProofBytes: 4096 },
    identities: { challenge: () => id<'harmony-device-challenge'>('phase34-challenge-' + ++challengeId) },
    verifier: { enrollment: async (candidate, signal) => { signal.throwIfAborted(); return candidate.proof === enrollment(candidate.deviceId, candidate.credentialId) ? { confirmationExpiresAt: now + 50 } : false },
      confirmEnrollment: () => true,
      revoke: () => {}, sweep: () => {}, close: () => {},
      challenge: async (challenge, proof, signal) => { signal.throwIfAborted(); return proof === signature(challenge) } },
    copy: { label: 'Synthetic phone', method: 'Synthetic local confirmation', allow: 'Fingerprints compared; allow synthetic scope', deny: 'Deny', confirm: details => JSON.stringify(details) }, ...overrides }
  let owner: DeviceAuthorizationOwner | undefined
  await ctx.inject(['credentials', 'authorization', 'connection', 'remoteAccess'], inner => { owner = new DeviceAuthorizationOwner(inner, options); inner.provide('harmonyAuthenticatedDevices', owner) })
  if (owner === undefined) throw new Error('Synthetic auth owner missing')
  const captured = owner, transport = { id: id<'harmony-device-channel'>('phase34-transport'), remoteCredentialId: id<'harmony-device-credential'>('phase34-key'), signal: new AbortController().signal }
  async function pair(candidate: unknown = proposal(), answer = 'allow', prompt?: (value: AuthorizationPrompt) => Promise<string>) {
    const flow = captured.offerPairing(authority, candidate), stop = ctx.authorization.registerFlow(flow)
    try { return { key: flow.key, outcome: await ctx.authorization.begin({ key: flow.key, interaction: { notify: () => {}, prompt: prompt ?? (async () => answer) } }) } }
    finally { stop() }
  }
  async function connect() { const challenge = await captured.challenge(device, transport); return captured.authenticate({ challengeId: challenge.challengeId, signature: signature(challenge) }, transport, new AbortController().signal) }
  return { ctx, owner: captured, options, authority, transport, pair, connect, advance: (ms: number) => { now += ms } }
}

it('pairing requires the exact local authority and explicit selected sessions/operations before any Peer', async () => {
  const f = await fixture()
  await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' })
  expect(() => f.owner.offerPairing({}, proposal())).toThrowError(DeviceAuthError)
  for (const candidate of [{ ...proposal(), sessions: [] }, { ...proposal(), sessions: ['*'] }, { ...proposal(), operations: ['approval.respond'] }, { ...proposal(), operations: ['approval.list'] }, { ...proposal(), grantTtlMs: 1001 }, { ...proposal(), cookie: 'fake-operator-cookie' }]) expect(() => f.owner.offerPairing(f.authority, candidate)).toThrowError(DeviceAuthError)
  let shown: AuthorizationPrompt | undefined
  const paired = await f.pair(proposal(), 'allow', async value => { shown = value; return 'allow' }); expect(paired.outcome.status).toBe('authorized')
  if (shown === undefined || shown.kind !== 'select') throw new Error('Missing synthetic confirmation')
  const details: Record<string, unknown> = JSON.parse(shown.message)
  expect(details.confirmationExpiresAt).toBe(f.options.clock() + 50); expect(shown.signal?.aborted).toBe(false)
  expect({ kind: shown.kind, details: { ...details, confirmationExpiresAt: 'signed-offer-deadline' }, options: shown.options }).toEqual(JSON.parse(await readFile(new URL('../tests/fixtures/phase36-pairing-prompt.json', import.meta.url), 'utf8')))
  const lease = await f.connect(), scope = f.owner.current(lease.peer)
  expect(scope).toMatchObject({ deviceId: device, desktopId, epoch: 1, sessions: ['phase34-session'], operations: ['task.receipt', 'session.sync'] })
  expect(scopeOf(lease.peer.ctx)).toBe(lease.peer)
  expect(f.owner.current({ ...lease.peer, dispose: () => lease.peer.dispose() })).toBeUndefined()
  const admission = new ProfilePeerAdmission(f.owner, f.ctx.connection.browserPeer, desktopId, f.options.clock)
  const command: MobileCommand = { protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId: device, grantEpoch: 1, commandId: id<'mobile-command'>('c'), expiresAt: f.options.clock() + 10, operation: 'task.receipt', payload: {} }
  expect(() => admission.bind(lease.peer).authorize(command, SessionId('other'))).toThrow()
  expect(() => admission.bind(lease.peer).authorize({ ...command, operation: 'task.submit' }, SessionId('phase34-session'))).toThrow()
})

it('disposing the actual Peer immediately denies the lease and awaits device-consumer cleanup', async () => {
  const f = await fixture(); await f.pair(); const lease = await f.connect(), cleanup = vi.fn(async () => {})
  f.owner.onRevoke(cleanup)
  expect(lease.peer.principal.kind).toBe('harmony-device'); expect(lease.peer.interactions).toBe('none')
  await lease.peer.dispose()
  expect(f.owner.current(lease.peer)).toBeUndefined(); expect(lease.signal.aborted).toBe(true); expect(cleanup).toHaveBeenCalledOnce()
})

it('declined or cancelled existing authorization flows never commit a grant or admit a connection', async () => {
  const f = await fixture(), denied = await f.pair(proposal(), 'deny')
  expect(denied.outcome.status).toBe('cancelled'); expect(await f.ctx.credentials.readRecord(denied.key)).toBeUndefined()
  const flow = f.owner.offerPairing(f.authority, proposal()), stop = f.ctx.authorization.registerFlow(flow), controller = new AbortController()
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const run = f.ctx.authorization.begin({ key: flow.key, signal: controller.signal, interaction: { notify: () => {}, prompt: async () => { entered(); return new Promise<string>(() => {}) } } })
  await ready; controller.abort(); expect((await run).status).toBe('cancelled'); stop()
  expect(await f.ctx.credentials.readRecord(flow.key)).toBeUndefined(); await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' })
})

it('invalid enrollment proof is refused without a stored record or human success claim', async () => {
  const f = await fixture(), prompt = vi.fn(async () => 'allow')
  await expect(f.pair({ ...proposal(), proof: 'wrong-fake-proof' }, 'allow', prompt)).rejects.toMatchObject({ code: 'proof-denied' })
  expect(prompt).not.toHaveBeenCalled(); expect(await f.ctx.credentials.listRecords()).toHaveLength(0)
})

it('verifier failure reports a stable code without submitted proof content or cookie fallback', async () => {
  const f = await fixture({ verifier: { enrollment: async () => { throw new Error('FAKE_PRIVATE_PROOF_DO_NOT_ECHO') }, confirmEnrollment: () => false, revoke: () => {}, sweep: () => {}, close: () => {}, challenge: async () => false } })
  let failure: unknown
  try { await f.pair() } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(DeviceAuthError)
  if (!(failure instanceof DeviceAuthError)) throw new Error('Structured verifier failure missing')
  expect(failure.code).toBe('verifier-failed'); expect(failure.message).not.toContain('PRIVATE_PROOF'); expect(await f.ctx.credentials.listRecords()).toHaveLength(0)
})

it('challenge response is single-use and binds audience/epoch/key; arbitrary peer and cookie fields reject', async () => {
  const f = await fixture(); await f.pair()
  const challenge = await f.owner.challenge(device, f.transport), altered = { ...challenge, profileId: id<'mobile-profile'>('foreign') }
  await expect(f.owner.authenticate({ challengeId: challenge.challengeId, signature: signature(altered) }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'proof-denied' })
  await expect(f.owner.authenticate({ challengeId: challenge.challengeId, signature: signature(challenge) }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'challenge-stale' })
  const next = await f.owner.challenge(device, f.transport)
  await expect(f.owner.authenticate({ challengeId: next.challengeId, signature: signature(next), peer: 'operator', cookie: 'fake-cookie' }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid' })
  const lease = await f.owner.authenticate({ challengeId: next.challengeId, signature: signature(next) }, f.transport, new AbortController().signal)
  expect(f.owner.current(lease.peer)).toBeDefined()
})

it('expired and oversized proofs reject before authentication, without renewing total grant lifetime', async () => {
  const f = await fixture(); await f.pair()
  const challenge = await f.owner.challenge(device, f.transport); f.advance(50)
  await expect(f.owner.authenticate({ challengeId: challenge.challengeId, signature: signature(challenge) }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'challenge-stale' })
  const fresh = await f.owner.challenge(device, f.transport)
  await expect(f.owner.authenticate({ challengeId: fresh.challengeId, signature: '中'.repeat(1500) }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid' })
  f.advance(950); await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' })
})

it('disconnect/reconnect replaces independent Peer with fresh proof and keeps the bounded grant epoch', async () => {
  const f = await fixture(); await f.pair()
  const first = await f.connect(), original = f.owner.current(first.peer)
  await first.close(); expect(first.signal.aborted).toBe(true); expect(f.owner.current(first.peer)).toBeUndefined()
  const second = await f.connect(); expect(second.peer).not.toBe(first.peer); expect(f.owner.current(second.peer)?.epoch).toBe(original?.epoch)
  f.advance(101); expect(f.owner.current(second.peer)).toBeUndefined(); await f.owner.sweep(); expect(second.signal.aborted).toBe(true)
  const third = await f.connect(); expect(f.owner.current(third.peer)?.epoch).toBe(1)
  f.advance(900); await f.owner.sweep(); expect(third.signal.aborted).toBe(true); await expect(f.connect()).rejects.toMatchObject({ code: 'unpaired' })
})

it('simultaneous completed handshakes serialize replacement so only the newest Peer remains admitted', async () => {
  const f = await fixture(); await f.pair()
  const a = await f.owner.challenge(device, f.transport), b = await f.owner.challenge(device, f.transport)
  const leases = await Promise.all([a, b].map(challenge => f.owner.authenticate({ challengeId: challenge.challengeId, signature: signature(challenge) }, f.transport, new AbortController().signal)))
  expect(leases.map(lease => f.owner.current(lease.peer) !== undefined)).toEqual([false, true]); expect(leases[0]!.signal.aborted).toBe(true)
})

it('revocation denies synchronously, invalidates pending challenges and requires a new local confirmation', async () => {
  const f = await fixture(), paired = await f.pair(), first = await f.connect(), pending = await f.owner.challenge(device, f.transport)
  const cleanup = vi.fn(async () => {}), stop = f.owner.onRevoke(cleanup)
  const revoke = f.owner.revoke(f.authority, device); expect(f.owner.current(first.peer)).toBeUndefined(); expect(first.signal.aborted).toBe(true)
  await revoke; expect(cleanup).toHaveBeenCalledTimes(1); stop()
  expect(await f.ctx.credentials.readRecord(paired.key)).toMatchObject({ payload: { revoked: true, epoch: 2 } })
  await expect(f.owner.authenticate({ challengeId: pending.challengeId, signature: signature(pending) }, f.transport, new AbortController().signal)).rejects.toMatchObject({ code: 'challenge-stale' })
  await expect(f.connect()).rejects.toMatchObject({ code: 'unpaired' }); await f.pair()
  const second = await f.connect(); expect(f.owner.current(second.peer)?.epoch).toBe(3)
})

it('revocation during asynchronous proof verification cannot mint a late Peer', async () => {
  let resolve!: (value: boolean) => void, entered!: () => void
  const ready = new Promise<void>(r => { entered = r }), verification = new Promise<boolean>(r => { resolve = r })
  const f = await fixture({ verifier: { enrollment: async () => ({ confirmationExpiresAt: Date.now() + 1000 }), confirmEnrollment: () => true, revoke: () => {}, sweep: () => {}, close: () => {}, challenge: async () => { entered(); return verification } } }); await f.pair()
  const challenge = await f.owner.challenge(device, f.transport), run = f.owner.authenticate({ challengeId: challenge.challengeId, signature: signature(challenge) }, f.transport, new AbortController().signal)
  await ready; await f.owner.revoke(f.authority, device); resolve(true)
  await expect(run).rejects.toMatchObject({ code: 'unpaired' })
})

it('failed revocation storage write leaves every live lease denied and cold starts never restore the old record', async () => {
  const f = await fixture(); await f.pair(); const lease = await f.connect()
  const write = vi.spyOn(f.ctx.credentials, 'modifyRecord').mockRejectedValueOnce(new Error('FAKE_STORE_FAILURE'))
  await expect(f.owner.revoke(f.authority, device)).rejects.toThrow('FAKE_STORE_FAILURE'); write.mockRestore()
  expect(f.owner.current(lease.peer)).toBeUndefined(); expect(lease.signal.aborted).toBe(true)
  await expect(f.connect()).rejects.toMatchObject({ code: 'unpaired' })
  let cold: DeviceAuthorizationOwner | undefined
  await f.owner.close()
  await f.ctx.inject(['credentials', 'authorization', 'connection', 'remoteAccess'], ctx => { cold = new DeviceAuthorizationOwner(ctx, f.options) })
  if (cold === undefined) throw new Error('Cold fixture missing')
  await expect(cold.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' })
})

it('external owned-record edits deny before cleanup and unrelated credentials are untouched', async () => {
  const f = await fixture(), paired = await f.pair(), lease = await f.connect()
  await f.ctx.credentials.modifyRecord(paired.key, async current => current?.kind === 'grant' ? { kind: 'grant', payload: { replaced: true } } : undefined)
  expect(f.owner.current(lease.peer)).toBeUndefined(); expect(lease.signal.aborted).toBe(true)
  await expect(f.pair()).rejects.toMatchObject({ code: 'invalid' })
})

it('capacity is reserved across concurrent confirmation flows and shutdown refuses further handshakes', async () => {
  const f = await fixture({ limits: { maxGrantTtlMs: 1000, maxConnectionTtlMs: 100, challengeTtlMs: 50, maxDevices: 1, maxChallengeIssues: 1, maxSessions: 2, maxProofBytes: 4096 } })
  let entered!: () => void, answer!: (value: string) => void
  const ready = new Promise<void>(resolve => { entered = resolve }), response = new Promise<string>(resolve => { answer = resolve })
  const pending = f.pair(proposal(), 'allow', async () => { entered(); return response }); await ready
  await expect(f.pair(proposal(id<'mobile-device'>('second-device')))).rejects.toMatchObject({ code: 'capacity' })
  answer('allow'); expect((await pending).outcome.status).toBe('authorized')
  await f.owner.challenge(device, f.transport); await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'capacity' })
  await f.owner.close(); await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'closed' })
})

it('proof cannot cross an identical-looking carrier binding and closing the transport stops its lease', async () => {
  const f = await fixture(); await f.pair()
  const controller = new AbortController(), transport = { id: f.transport.id, remoteCredentialId: f.transport.remoteCredentialId, signal: controller.signal }
  const challenge = await f.owner.challenge(device, transport), proof = { challengeId: challenge.challengeId, signature: signature(challenge) }
  await expect(f.owner.authenticate(proof, { ...transport }, new AbortController().signal)).rejects.toMatchObject({ code: 'proof-denied' })
  const lease = await f.owner.authenticate(proof, transport, new AbortController().signal)
  controller.abort(); expect(f.owner.current(lease.peer)).toBeUndefined(); expect(lease.signal.aborted).toBe(true)
  await lease.close()
})

it('revocation during an admitted credential commit settles with a revoked tombstone and no restored lease', async () => {
  const f = await fixture(), paired = await f.pair(), lease = await f.connect()
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), barrier = new Promise<void>(resolve => { release = resolve })
  const modify = f.ctx.credentials.modifyRecord.bind(f.ctx.credentials)
  const spy = vi.spyOn(f.ctx.credentials, 'modifyRecord').mockImplementationOnce(async (key: Parameters<typeof modify>[0], mutate: Parameters<typeof modify>[1]) => { entered(); await barrier; return modify(key, mutate) })
  const pairing = f.pair(); const observed = expect(pairing).rejects.toMatchObject({ code: 'scope-changed' })
  await ready; const revoke = f.owner.revoke(f.authority, device)
  expect(f.owner.current(lease.peer)).toBeUndefined(); release()
  await observed; await revoke; spy.mockRestore()
  expect(await f.ctx.credentials.readRecord(paired.key)).toMatchObject({ payload: { revoked: true, epoch: 3 } })
  await expect(f.connect()).rejects.toMatchObject({ code: 'unpaired' })
})

it('cleanup failure still attempts every subscriber and Peer disposal while retaining denied state', async () => {
  const f = await fixture(); await f.pair(); const lease = await f.connect(), disposed = vi.fn()
  lease.peer.ctx.effect(() => () => { disposed() })
  const a = f.owner.onRevoke(async () => { throw new Error('FAKE_CLEANUP_FAILURE') }), notified = vi.fn(async () => {}), b = f.owner.onRevoke(notified)
  await expect(f.owner.revoke(f.authority, device)).rejects.toMatchObject({ code: 'cleanup-failed' })
  expect(notified).toHaveBeenCalledTimes(1); expect(disposed).toHaveBeenCalledTimes(1); expect(f.owner.current(lease.peer)).toBeUndefined()
  a(); b(); await expect(f.owner.close()).rejects.toMatchObject({ code: 'cleanup-failed' })
  contexts.splice(contexts.indexOf(f.ctx), 1)
  await Promise.allSettled([f.ctx.fiber.dispose()])
})

it('new authentication owner drives real phase32 Gateway metadata/follow while rejecting foreign/approval/cookie routes with zero model calls', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated phase34 launcher required')
  const world = join(parent, 'phase34-auth-gateway'); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world); await ctx.plugin(Gateway)
  const upload = vi.spyOn(ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('PHASE34_UPLOAD_DISABLED') })
  const f = await fixture({ limits: { maxGrantTtlMs: 1000, maxConnectionTtlMs: 1000, challengeTtlMs: 1000, maxDevices: 1, maxChallengeIssues: 8, maxSessions: 1, maxProofBytes: 4096 } }, ctx)
  const sessionId = SessionId('phase34-session'); await ctx.sessionController.create({ sessionId, cwd: world })
  await f.pair()
  const plugin = ctx.plugin(Plugin, { enabled: true, desktopId, profileId, journalMode: 'create' }); await plugin
  const challenge = await f.owner.challenge(device, f.transport), channel = await connectDeviceChannel(ctx, f.owner, f.transport, { challengeId: challenge.challengeId, signature: signature(challenge) }, new AbortController().signal)
  const signal = new AbortController().signal, metadata = await channel.invoke({ method: 'metadata', argument: null }, signal)
  expect(metadata).toMatchObject({ desktopId, sessions: [sessionId] })
  let serial = 0
  const argument = (operation: string, payload: unknown) => ({ version: PROFILE_RPC_CODEC, packet: JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId: device, grantEpoch: 1, commandId: 'phase34-' + ++serial, expiresAt: Date.now() + 1000, operation, payload }) })
  const request = (operation: string, payload: unknown) => channel.invoke({ method: 'request', argument: argument(operation, payload) }, signal)
  await expect(request('task.receipt', { sessionId, requestId: 'never-submitted' })).resolves.toMatchObject({ accepted: false, state: 'unknown' })
  await expect(request('session.sync', { sessionId: 'foreign', afterSeq: -1 })).rejects.toMatchObject({ code: 'scope-denied' })
  await expect(request('approval.list', { sessionId })).rejects.toMatchObject({ code: 'scope-denied' })
  await expect(request('approval.respond', { sessionId })).rejects.toMatchObject({ code: 'scope-denied' })
  await expect(channel.invoke({ method: 'metadata', argument: null, cookie: 'fake-operator' }, signal)).rejects.toMatchObject({ code: 'invalid-packet' })
  const stream = await channel.follow({ argument: argument('session.sync', { sessionId, afterSeq: -1 }), resume: { instance: null, relayCursor: -1 } }, signal), iterator = stream[Symbol.asyncIterator]()
  const frame = (await iterator.next()).value; expect(isRichJson(frame)).toBe(true); expect(frame).toMatchObject({ kind: 'reset', mode: 'desktop-profile' })
  await f.owner.revoke(f.authority, device); await iterator.return?.()
  expect(() => channel.invoke({ method: 'metadata', argument: null }, signal)).toThrowError(DeviceAuthError)
  await plugin.dispose(); ctx.llm.assertZeroRealCalls()
  expect(upload).not.toHaveBeenCalled()
  expect(ctx.llm.getOfflineReplayCounts().replay).toHaveLength(0)
  expect(ctx.sessions.get(sessionId)!.snapshotEvents().some(event => event.type === 'turn/start')).toBe(false)
  await writeFile(new URL('../evidence/phase62-auth-gateway.json', import.meta.url), JSON.stringify({ layer: 'source real Gateway/phase32 service with new owner, memory credential/authorization seams and deterministic fake proof verifier', metadata: true, sessionReceipt: true, scopedFollow: true, foreignSessionRejected: true, approvalsRejected: true, cookieRejected: true, revokeClosedChannel: true, tasks: 0, replay: 0, realModels: 0, uploads: upload.mock.calls.length, listeners: 0, userPairing: false, cryptographicVerifierQualified: false, installedPluginChanged: false }, null, 2) + '\n')
})

it('close while enrollment verification waits cancels the attempt and never displays a late prompt or writes a grant', async () => {
  let accept!: (value: false | { confirmationExpiresAt: number }) => void, enter!: () => void
  const ready = new Promise<void>(resolve => { enter = resolve }), pending = new Promise<false | { confirmationExpiresAt: number }>(resolve => { accept = resolve })
  const f = await fixture({ verifier: { enrollment: async () => { enter(); return pending }, confirmEnrollment: () => true, revoke: () => {}, sweep: () => {}, close: () => {}, challenge: async () => true } }), prompt = vi.fn(async () => 'allow')
  const pairing = f.pair(proposal(), 'allow', prompt); await ready; await f.owner.close(); accept({ confirmationExpiresAt: f.options.clock() + 50 })
  const result = await pairing; expect(result.outcome.status).toBe('cancelled'); expect(prompt).not.toHaveBeenCalled(); expect(await f.ctx.credentials.readRecord(result.key)).toBeUndefined()
})
it('the signed offer deadline and both full fingerprints appear in confirmation, and a late allow cannot commit', async () => {
  const f = await fixture()
  await expect(f.pair(proposal(), 'allow', async prompt => {
    const details: Record<string, unknown> = JSON.parse(prompt.message); expect(details.desktopCredentialId).toBe(f.options.desktopCredentialId); expect(details.deviceCredentialId).toBe(proposal().credentialId)
    f.advance(50); return 'allow'
  })).rejects.toMatchObject({ code: 'expired' })
  expect(await f.ctx.credentials.listRecords()).toEqual([])
})
it('a differently authenticated E2E identity cannot request the enrolled device proof', async () => {
  const f = await fixture(); await f.pair()
  await expect(f.owner.challenge(device, { ...f.transport, remoteCredentialId: id<'harmony-device-credential'>('other-key') })).rejects.toMatchObject({ code: 'proof-denied' })
})
it('revocation during the final snapshot read cannot restore admission even when the tombstone write fails', async () => {
  const f = await fixture(); let enter!: () => void, release!: () => void, blocked = false
  const ready = new Promise<void>(resolve => { enter = resolve }), pending = new Promise<void>(resolve => { release = resolve }), original = f.ctx.credentials.readRecord.bind(f.ctx.credentials)
  const read = vi.spyOn(f.ctx.credentials, 'readRecord').mockImplementation(async (key: Parameters<typeof original>[0]) => { const value = await original(key); if (value?.kind === 'grant' && !blocked) { blocked = true; enter(); await pending } return value })
  const pairing = f.pair(); await ready
  const write = vi.spyOn(f.ctx.credentials, 'modifyRecord').mockRejectedValueOnce(new Error('synthetic failed tombstone'))
  const revoked = f.owner.revoke(f.authority, device).catch(error => error), denied = expect(pairing).rejects.toMatchObject({ code: 'scope-changed' }); release()
  await denied; expect(await revoked).toBeInstanceOf(Error); await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' }); read.mockRestore(); write.mockRestore()
})
it('an external grant edit during the final snapshot read cannot restore the older admission', async () => {
  const f = await fixture(); let enter!: () => void, release!: () => void, blocked = false
  const ready = new Promise<void>(resolve => { enter = resolve }), pending = new Promise<void>(resolve => { release = resolve }), original = f.ctx.credentials.readRecord.bind(f.ctx.credentials)
  const read = vi.spyOn(f.ctx.credentials, 'readRecord').mockImplementation(async (key: Parameters<typeof original>[0]) => { const value = await original(key); if (value?.kind === 'grant' && !blocked) { blocked = true; enter(); await pending } return value })
  const flow = f.owner.offerPairing(f.authority, proposal()), stop = f.ctx.authorization.registerFlow(flow)
  const pairing = f.ctx.authorization.begin({ key: flow.key, interaction: { notify: () => {}, prompt: async () => 'allow' } }); await ready
  await f.ctx.credentials.deleteRecord(flow.key); const denied = expect(pairing).rejects.toMatchObject({ code: 'scope-changed' }); release(); await denied; await expect(f.owner.challenge(device, f.transport)).rejects.toMatchObject({ code: 'unpaired' }); stop(); read.mockRestore()
})
it('grant revoke, expiry and shutdown coordinate verifier cleanup without deleting native keys', async () => {
  const f = await fixture(), revoke = vi.spyOn(f.options.verifier, 'revoke'), sweep = vi.spyOn(f.options.verifier, 'sweep'), close = vi.spyOn(f.options.verifier, 'close'); await f.pair(); const lease = await f.connect()
  f.advance(1000); await f.owner.sweep(); expect(lease.signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledWith(device); expect(sweep).toHaveBeenCalled(); await f.owner.close(); expect(close).toHaveBeenCalledOnce()
})

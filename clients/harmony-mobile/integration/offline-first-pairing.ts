/** Executable offline composition only. It owns a fresh memory CredentialProvider, fake relay/scheduler and fixed public scalar keys; no installed profile or real dispatch can be selected. */
import { Context } from '@deepseek-ai/cordis'
import * as DisabledCarrier from './disabled-carrier.ts'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { createECDH, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { nativePairingHarness } from '../tests/helpers/phase37-native-harness.mjs'
import { DeviceAuthorizationOwner } from './device-auth.ts'
import type { DeviceTransportBinding, DevicePeerLease } from './device-auth.ts'
import { AuthenticatedDeviceChannel } from './device-auth-carrier.ts'
import { P256EnrollmentVerifier } from './p256-enrollment.ts'
import { RelayRooms, type RelaySocket } from './relay-core.ts'
import { ShortPairingRooms } from './short-room.ts'
import { EncryptedRelayConnection } from './e2e-socket.ts'
import { mountDeviceRelayLifetime } from './device-relay-lifetime.ts'
import { ImportedP256Agreement, P256SecureChannel, nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { PhonePairingOwner, type PhonePairingOffer } from '../src/phone-pairing.ts'
import { readOnlyGrantSchema } from '../src/pairing-protocol.ts'
import { id } from '../src/protocol.ts'
import { jsonPayload } from '../src/wire.ts'
import type { JsonValue } from '../src/upstream.ts'
/** Resolve before any fixture state; true requires the explicit replay-only environment and exact memory mode. */
export interface OfflinePairingOptions { readonly enabled?: boolean; readonly mode?: 'synthetic-memory-only' }
function publicFixtureKey(scalar: number) {
  const bytes = Buffer.alloc(32); bytes[31] = scalar; const ec = createECDH('prime256v1'); ec.setPrivateKey(bytes); const point = ec.getPublicKey()
  const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: bytes.toString('base64url') } })
  return { publicSpki: createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url'), pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }), sign: async (message: Uint8Array) => sign('sha256', message, { key: privateKey, dsaEncoding: 'der' }) }
}
/** Fake scheduler exposes no real timers; advancing triggers exactly owned expiries. */
class MemoryScheduler {
  now = 1000
  private counter = 0
  private readonly tasks = new Map<number, { at: number; callback: () => void }>()
  after(delay: number, callback: () => void): () => void { const key = ++this.counter; this.tasks.set(key, { at: this.now + delay, callback }); return () => { this.tasks.delete(key) } }
  advance(ms: number): void { this.now += ms; for (const [key, task] of [...this.tasks]) if (task.at <= this.now) { this.tasks.delete(key); task.callback() } }
}
class MemorySocket implements RelaySocket {
  readonly frames = new Set<(bytes: Uint8Array, binary: boolean) => void>()
  readonly ends = new Set<() => void>()
  remote: MemorySocket | undefined
  bufferedAmount = 0
  closed = false
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void { this.frames.add(callback); return () => { this.frames.delete(callback) } }
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  ready(): void { this.send(new TextEncoder().encode('{"relay":"ready","v":1}'), false) }
  send(bytes: Uint8Array, binary = true): void { if (this.closed || this.remote === undefined) throw new Error('memory socket closed'); const target = this.remote, copy = Uint8Array.from(bytes); queueMicrotask(() => { if (!target.closed) for (const callback of target.frames) callback(copy, binary) }) }
  terminate(): void { if (this.closed) return; this.closed = true; for (const callback of this.ends) callback(); this.remote?.terminate() }
}
/** @param request - explicit default-disabled test policy. @param supplied - same isolated replay Context for profile/carrier integration tests. @returns synthetic first-pairing world, or undefined before any Context/key-port call; no live profile/key option exists. */
export async function createOfflineFirstPairing(request: OfflinePairingOptions = {}, supplied?: Context) {
  const enabled = request.enabled ?? false
  if (!enabled) return undefined
  if (request.mode !== 'synthetic-memory-only' || process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('offline pairing guard refused')
  const ctx = supplied ?? new Context(); if (ctx.get('connection') === undefined) await ctx.plugin(DisabledCarrier)
  if (ctx.get('remoteAccess') === undefined) await ctx.plugin(RemoteAccess)
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  const authority = {}, phoneAuthority = {}, lifetime = new AbortController(), clock = new MemoryScheduler(), native = await nativePairingHarness(() => clock.now, clock), desktopKey = publicFixtureKey(2)
  const desktopId = id<'mobile-desktop'>('phase37-synthetic-desktop'), profileId = id<'mobile-profile'>('phase37-synthetic-profile'), device = id<'mobile-device'>('phase37-synthetic-phone'), sessions = [id<'SessionId'>('phase37-synthetic-session')], operations = ['session.sync', 'task.receipt'] as const
  let counter = 0
  const verifier = new P256EnrollmentVerifier({ desktopId, profileId, localAuthority: authority, clock: () => clock.now, challengeTtlMs: 200, pinTtlMs: 1000, maxIssues: 8, maxProofBytes: 8192, identities: { challenge: () => id<'harmony-enrollment-challenge'>('phase37-ticket-' + ++counter), nonce: () => Buffer.alloc(32, counter) } })
  const owner = new DeviceAuthorizationOwner(ctx, { desktopId, profileId, desktopCredentialId: p256CredentialId(desktopKey.publicSpki), localAuthority: authority, clock: () => clock.now, verifier, limits: { maxGrantTtlMs: 1000, maxConnectionTtlMs: 1000, challengeTtlMs: 200, maxDevices: 1, maxChallengeIssues: 8, maxSessions: 1, maxProofBytes: 8192 }, identities: { challenge: () => id<'harmony-device-challenge'>('phase37-device-proof-' + ++counter) }, copy: { label: 'Synthetic pairing', method: 'Local fixture comparison', allow: 'Fingerprints compared; allow read-only fixture', deny: 'Deny', confirm: value => JSON.stringify(value) } })
  const relayAuthority = {}, rooms = new RelayRooms(relayAuthority, { maxRooms: 1, maxRoomTtlMs: 500, pairTimeoutMs: 200, maxFrameBytes: 16384, maxBufferedBytes: 32768, maxFrames: 64, idleTimeoutMs: 500 }, () => clock.now)
  const provisioner = new ShortPairingRooms(authority, { publish: plan => rooms.provision(relayAuthority, plan), revoke: room => rooms.revoke(relayAuthority, room) }, () => clock.now, 500, 1, 1)
  const room = provisioner.open(authority, { room: id<'harmony-relay-room'>('phase37-memory-room'), desktopToken: '1'.repeat(64), phoneToken: '2'.repeat(64) }, 500, lifetime.signal)
  const ticket = verifier.issue(authority, device, native.signer.publicSpki), phone = new PhonePairingOwner(phoneAuthority, native.signer, native.primitives, native.confirmation, () => clock.now, 8, lifetime.signal)
  const bootstrap = { ticket, desktopPublicSpki: desktopKey.publicSpki, desktopId, profileId, deviceId: device, sessions, operations, grantTtlMs: 1000 }
  let desktop: EncryptedRelayConnection | undefined, mobile: EncryptedRelayConnection | undefined, desktopBinding: DeviceTransportBinding | undefined, phoneBinding: DeviceTransportBinding | undefined, lease: DevicePeerLease | undefined, channel: AuthenticatedDeviceChannel | undefined
  let approvedOffer: PhonePairingOffer | undefined, connected = false
  const phoneMessages: JsonValue[] = [], desktopMessages: JsonValue[] = [], prompts: string[] = []
  async function settled() { for (let turn = 0; turn < 12; turn++) { await desktop?.settled(); await mobile?.settled() } }
  async function transfer(role: 'phone' | 'desktop', value: unknown) { const connection = role === 'phone' ? mobile : desktop; if (connection === undefined) throw new Error('memory E2E unavailable'); await connection.send(jsonPayload(value)); await settled(); const received = (role === 'phone' ? desktopMessages : phoneMessages).shift(); if (received === undefined) throw new Error('memory delivery absent'); return received }
  return { native, bootstrap, ticket, phone, owner, ctx, room, prompts,
    async prepare() { approvedOffer = await phone.prepare(phoneAuthority, bootstrap); return approvedOffer },
    choosePhone: (compared: boolean, allow: boolean) => native.decide(compared, allow),
    async connect() {
      if (approvedOffer === undefined || connected || lifetime.signal.aborted || approvedOffer.ticket.expiresAt <= clock.now) throw new Error('native pairing confirmation required')
      phone.authorizeConnection(phoneAuthority, approvedOffer)
      connected = true
      const offer = approvedOffer, serverDesktop = new MemorySocket(), clientDesktop = new MemorySocket(), serverPhone = new MemorySocket(), clientPhone = new MemorySocket(); serverDesktop.remote = clientDesktop; clientDesktop.remote = serverDesktop; serverPhone.remote = clientPhone; clientPhone.remote = serverPhone
      const limits = { maxFrameBytes: 16384, maxPlaintextBytes: 8192, maxFrames: 64 }
      desktop = new EncryptedRelayConnection(clientDesktop, new P256SecureChannel('desktop', room.room, new ImportedP256Agreement(publicFixtureKey(3).pkcs8), Buffer.alloc(32, 3), native.signer.publicSpki, limits, nodeE2EPrimitives), desktopKey, 32768, async value => { desktopMessages.push(value) }, binding => { desktopBinding = binding }, clock, 200, lifetime.signal)
      mobile = new EncryptedRelayConnection(clientPhone, new P256SecureChannel('phone', room.room, new ImportedP256Agreement(publicFixtureKey(4).pkcs8), Buffer.alloc(32, 4), offer.desktopPublicSpki, limits, native.primitives), native.signer, 32768, async value => { phoneMessages.push(value) }, binding => { phoneBinding = binding }, clock, 200, lifetime.signal)
      rooms.claim(room.room, 'desktop', room.desktopToken()).attach(serverDesktop); rooms.claim(room.room, 'phone', room.phoneToken()).attach(serverPhone); await settled()
      if (phoneBinding === undefined || desktopBinding === undefined) throw new Error('memory proof not ready'); phone.attach(phoneAuthority, phoneBinding); phoneBinding.signal.addEventListener('abort', () => native.close(), { once: true })
    },
    async grant(desktopAnswer: 'allow' | 'deny' = 'deny') {
      const proof = await phone.enrollment(phoneAuthority, await transfer('desktop', ticket)), received = await transfer('phone', proof)
      const flow = owner.offerPairing(authority, { deviceId: device, credentialId: ticket.credentialId, proof: JSON.stringify(received), sessions, operations, grantTtlMs: 1000 }), stop = ctx.authorization.registerFlow(flow)
      try { const outcome = await ctx.authorization.begin({ key: flow.key, interaction: { notify: () => {}, prompt: async prompt => { prompts.push(prompt.message); return desktopAnswer } } }); if (outcome.status !== 'authorized') throw new Error('desktop denied pairing') } finally { stop() }
      const record = await ctx.credentials.readRecord(flow.key); if (record?.kind !== 'grant') throw new Error('synthetic grant absent'); const grant = readOnlyGrantSchema.parse(record.payload)
      phone.acceptGrant(phoneAuthority, await transfer('desktop', grant)); if (desktopBinding === undefined || desktop === undefined) throw new Error('desktop binding absent')
      const challenge = await owner.challenge(device, desktopBinding), signature = await phone.deviceProof(phoneAuthority, await transfer('desktop', challenge)), response = await transfer('phone', signature)
      lease = await owner.authenticate(response, desktopBinding, lifetime.signal); channel = new AuthenticatedDeviceChannel(ctx, lease, owner); mountDeviceRelayLifetime(ctx, owner, channel, desktop, desktopBinding, clock, 10)
      return { grant, scope: owner.current(lease.peer), challenges: signature, channel }
    },
    async revoke() { try { await owner.revoke(authority, device) } finally { lifetime.abort(); await settled() } },
    async advance(ms: number) { clock.advance(ms); await owner.sweep(); rooms.sweep(); provisioner.sweep(); await settled() },
    currentScope: () => lease === undefined ? undefined : owner.current(lease.peer),
    async close() {
      lifetime.abort()
      const actions = [() => phone.close(), () => native.close(), () => desktop?.close(), () => mobile?.close(), () => owner.close(), () => ctx.fiber.dispose(), () => room.close(), () => provisioner.close(authority), () => rooms.close()]
      const results = await Promise.allSettled(actions.map(async action => { await action() })); if (results.some(value => value.status === 'rejected')) throw new Error('offline world cleanup failed')
    },
  }
}

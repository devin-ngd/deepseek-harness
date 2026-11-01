/** Real normal SessionController/Gateway/rich executor composition with only fixed keys and isolated public MemoryCredentials. */
import { it, expect, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import WebSocket from 'ws'
import { installFourResponses } from './replay-host.ts'
import { submitProductForm } from './product-browser.ts'
import { NativeProductOwner, resetProductSdk, state, sdk, network, context } from '../tests/helpers/product-native-harness.mjs'
import { NativeDeviceProductFacade } from '../src/native-device-product.ts'
import { DeviceBindingDesktopRelay } from '../desktop-plugin/src/device-binding-relay.ts'
import { createStandaloneRelay } from '../standalone-relay/src/host.ts'
import { nodeRelaySocket } from './relay-upgrade.ts'
import { ImportedP256Agreement } from './p256-channel.ts'
import { fixtureKey, hostConfig } from './phase39-fixture.ts'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { credentialKey, parseCredentialKey, isCredentialKeySegment } from '@deepseek-ai/dsh-credentials'
import { loadProfileServices } from './profile-services.ts'
import { desktopKey, phoneKey, fixtureSource } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { id } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { deviceBindingReplyBytes, deviceRelayPairId } from '../src/device-binding-protocol.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { DeviceBindingClient } from '../src/device-binding-client.ts'
import { CredentialDeviceBindingStorage } from '../desktop-plugin/src/device-binding-storage.ts'
import { CredentialDeviceRouteStorage, DeviceRouteStorageError } from '../desktop-plugin/src/device-route-storage.ts'
import { DeviceCommandPreparationError, deviceCommandFailure } from '../desktop-plugin/src/device-command-error.ts'
import { DesktopIdentityError } from '../desktop-plugin/src/identity.ts'
import { DeviceRouteOwner } from '../src/device-route-owner.ts'
import { verifyDeviceRoute, deviceRouteReplyBytes } from '../src/device-route-protocol.ts'
import { PublicTrustStore, type PublicTrustWrites } from '../standalone-relay/src/public-trust.ts'
import { maintainDeviceRoutes, RouteMaintenanceError } from '../standalone-relay/src/route-maintenance.ts'
import { resolveRelayConfig } from '../standalone-relay/src/config.ts'
import { openRelayApplication, type RelayApplication } from '../standalone-relay/src/application.ts'
import type { ControlDiagnostic } from '../src/relay-control-client.ts'
import type { E2EDiagnostic } from './e2e-socket.ts'
import { RoomBroker } from '../standalone-relay/src/room-broker.ts'
import { resolveBrokerPolicy } from '../standalone-relay/src/broker-policy.ts'
import { RelayRooms } from './relay-core.ts'
import { FixturePort } from './phase39-fixture.ts'
import { relayProofBytes } from '../src/relay-control-protocol.ts'
import { DeviceBoundProfileChannel, DeviceBindingProfileProvider, deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import * as Desktop from '../desktop-plugin/src/index.ts'
import { ProfileJournalError, openProfileJournal } from '../desktop-plugin/src/journal.ts'
import { DeviceCommandStepError, deviceCommandStep } from '../desktop-plugin/src/device-command-step.ts'
import { LinkError } from '../src/link-protocol.ts'

it('room issuance respects absolute route expiry when the clock advances between duration calculation and publication', async () => {
  let now = 1000, ticking = false
  const clock = () => { const result = now; if (ticking) now++; return result }, authority = {}, deadline = 1100
  const policy = resolveBrokerPolicy({ ...hostConfig.broker, maxPairs: 1, roomTtlMs: 500, pairs: [{ pairId: 'deadline-route-fixture', desktopPublicSpki: desktopKey.publicSpki, phonePublicSpki: phoneKey.publicSpki, epoch: 1, expiresAt: deadline, revoked: false }] })
  if (!policy.enabled) throw new Error('fixture broker disabled')
  const { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs } = hostConfig
  const rooms = new RelayRooms(authority, { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs }, clock), broker = new RoomBroker(authority, rooms, policy, 'relay.example', clock, fixtureSource()), desktop = new FixturePort(), phone = new FixturePort()
  try {
    broker.attach('deadline-route-fixture', 'desktop', desktop); broker.attach('deadline-route-fixture', 'phone', phone)
    for (const [port, key] of [[desktop, desktopKey], [phone, phoneKey]] as const) {
      const challenge = JSON.parse(new TextDecoder().decode(port.sent[0]!)), signature = Buffer.from(await key.sign(relayProofBytes(challenge))).toString('base64url')
      ticking = true
      for (const receive of port.frames) receive(new TextEncoder().encode(JSON.stringify({ challenge, signature })), false)
    }
    const receipts = [...desktop.sent, ...phone.sent].map(bytes => JSON.parse(new TextDecoder().decode(bytes))).filter(value => value.kind === 'room')
    expect(receipts).toHaveLength(2)
    for (const receipt of receipts) expect(receipt.expiresAt).toBeLessThanOrEqual(deadline)
  } finally { broker.close(); rooms.close() }
})

it('two independent route windows retain one original binding, replay history and cold recovery', async () => {
  const f = await fixture('independent-route-windows')
  const phoneState: { raw: string | null } = { raw: null }, phoneStorage = { read: async () => phoneState.raw, compareAndSet: async (previous: string | null, next: string) => { if (phoneState.raw !== previous) throw new Error('fixture route CAS conflict'); phoneState.raw = next } }
  let desktop: DeviceRouteOwner | undefined, phone: DeviceRouteOwner | undefined, count = 0
  const desktopBinding = async () => { const value = await f.owner.publicRecord(f.authority); if (value === null) throw new Error('fixture binding absent'); return value }
  const source = { id: () => 'independent-window-' + ++count, nonce: () => Buffer.alloc(32, count + 20).toString('base64url') }
  try {
    const original = await f.bind(), originalRaw = await f.storage.read(), store = new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId)
    desktop = new DeviceRouteOwner(f.authority, 'desktop', desktopBinding, store, desktopKey, nodeE2EPrimitives, Date.now, source)
    phone = new DeviceRouteOwner(f.native, 'phone', () => f.client.load(f.native), phoneStorage, phoneKey, nodeE2EPrimitives, Date.now)
    const first = await desktop.offer(f.authority, 30000)
    await expect(desktop.offer(f.authority, 30000)).rejects.toThrow('active window')
    await expect(phone.acceptOffer(f.native, first, false)).rejects.toThrow('approval')
    const signed = await phone.acceptOffer(f.native, first, true); await desktop.confirm(f.authority, signed)
    const context = { routeId: first.routeId, routeEpoch: first.routeEpoch, expiresAt: first.expiresAt }, foreignContext = { ...context, routeId: 'other-signed-window' }
    const wrongChallenge = await f.owner.challenge(f.server, foreignContext)
    await expect(f.client.connectionProof(f.native, f.phone, JSON.stringify(wrongChallenge), context)).rejects.toThrow('route challenge mismatch')
    const challenge = await f.owner.challenge(f.server, context), proof = await f.client.connectionProof(f.native, f.phone, JSON.stringify(challenge), context), ticket = await f.owner.authenticate(f.server, proof, context.expiresAt)
    expect(ticket.route).toEqual(context); expect(ticket.expiresAt).toBeLessThanOrEqual(context.expiresAt)
    await expect(f.client.ticket(f.native, f.phone, ticket, foreignContext)).rejects.toThrow('route ticket mismatch')
    await expect(f.client.ticket(f.native, f.phone, ticket)).rejects.toThrow('route ticket mismatch')
    expect((await f.client.ticket(f.native, f.phone, ticket, context)).ticketId).toBe(ticket.ticketId)
    expect((await desktop.current(f.authority))?.offer.routeId).toBe(first.routeId)
    await desktop.close(); desktop = new DeviceRouteOwner(f.authority, 'desktop', desktopBinding, new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId), desktopKey, nodeE2EPrimitives, Date.now, source)
    expect((await desktop.current(f.authority))?.offer.routeId).toBe(first.routeId)
    await desktop.retire(f.authority); await phone.retire(f.native)
    await expect(desktop.confirm(f.authority, signed)).rejects.toThrow('pending offer absent')
    await expect(phone.acceptOffer(f.native, first, true)).rejects.toThrow('replay')
    const second = await desktop.offer(f.authority, 30000), next = await phone.acceptOffer(f.native, second, true); await desktop.confirm(f.authority, next)
    expect(second.routeId).not.toBe(first.routeId); expect(second.routeEpoch).toBe(1); expect(next.offer.binding).toEqual(original)
    await expect(verifyDeviceRoute({ ...next, offer: { ...next.offer, routeId: first.routeId } }, nodeE2EPrimitives, original, Date.now())).rejects.toThrow('signature')
    await expect(verifyDeviceRoute({ ...next, offer: { ...next.offer, binding: { ...original, deviceId: 'other-device' } } }, nodeE2EPrimitives, original, Date.now())).rejects.toThrow()
    await expect(verifyDeviceRoute({ ...next, offer: { ...next.offer, binding: { ...original, profileId: 'other' } } }, nodeE2EPrimitives, original, Date.now())).rejects.toThrow()
    await expect(verifyDeviceRoute(next, nodeE2EPrimitives, original, second.expiresAt)).rejects.toThrow('lifetime')
    expect(await f.storage.read()).toBe(originalRaw)
    await f.owner.revoke(f.authority); await expect(desktop.current(f.authority)).rejects.toThrow('binding revoked')
    await desktop.retire(f.authority)
  } finally { await desktop?.close(); await phone?.close(); await f.close() }
})

async function fixture(label: string, identity = { desktopId: 'normal-binding-desktop', deviceId: 'normal-binding-phone' }) {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (parent === undefined) throw new Error('isolated binding test required')
  const world = join(parent, label); await mkdir(world)
  const ctx = await loadProfileServices(world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
  ctx.provide('profileContext', { name: 'desktop', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, installAnchor: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Gateway); await ctx.plugin(MemoryCredentials)
  const legacy = credentialKey('harmony-device', 'old-test-epoch-ten')
  await ctx.credentials.modifyRecord(legacy, async () => ({ kind: 'grant', payload: { protocol: 'fixture-old-grant', epoch: 10, revoked: true } }))
  const authority = {}, native = {}, source = fixtureSource(), storage = new CredentialDeviceBindingStorage(ctx, identity.desktopId, identity.deviceId)
  const policy = { desktopId: identity.desktopId, profileId: 'desktop' as const, deviceId: identity.deviceId, identityAlias: 'normal-original-phone', audience: 'relay.example', enrollmentTtlMs: 60000, connectionTtlMs: 60000, challengeTtlMs: 10000, maxChallenges: 1000, maxCatalogRows: 1000, maxPublicBytes: 65536 }
  const owner = new DeviceBindingOwner(authority, policy, storage, desktopKey, deviceProfileSessionPorts(ctx), Date.now, source, { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } })
  let phoneRecord: string | null = null
  const phoneStorage = { read: async () => phoneRecord, compareAndSet: async (old: string | null, next: string) => { if (old !== phoneRecord) throw new Error('test public CAS conflict'); phoneRecord = next } }
  const client = new DeviceBindingClient(native, { ...policy, desktopCredentialId: p256CredentialId(desktopKey.publicSpki), maxProofs: 1000, maxChallengeTtlMs: 60000 }, phoneStorage, phoneKey, nodeE2EPrimitives, Date.now)
  const bind = async () => {
    const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    const reply = JSON.parse(await client.signOffer(native, JSON.stringify(offer), true))
    const record = await owner.confirm(authority, reply, async () => true); await client.accept(native, JSON.stringify(record), true); return record
  }
  const abort = new AbortController(), server = { id: id<'harmony-device-channel'>('normal-binding-channel'), remoteCredentialId: p256CredentialId(phoneKey.publicSpki), signal: abort.signal }, phone = { ...server, remoteCredentialId: p256CredentialId(desktopKey.publicSpki) }
  const connect = async () => { const challenge = await owner.challenge(server), proof = await client.connectionProof(native, phone, JSON.stringify(challenge)), ticket = await owner.authenticate(server, proof); await client.ticket(native, phone, ticket); return ticket }
  return { ctx, world, authority, native, storage, owner, policy, bind, connect, server, phone, client, abort, legacy, close: async () => { abort.abort(); client.close(); await owner.close(); await ctx.fiber.dispose() } }
}
function routeMemory() { let raw: string | null = null; return { read: async () => raw, write: async (next: string) => { raw = next }, close: async () => {} } }
function routesFor(f: Awaited<ReturnType<typeof fixture>>, label: string): DeviceRouteOwner { let count = 0; return new DeviceRouteOwner(f.authority, 'desktop', async () => { const value = await f.owner.publicRecord(f.authority); if (value === null) throw new Error('fixture binding absent'); return value }, new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId), desktopKey, nodeE2EPrimitives, Date.now, { id: () => label + '-' + ++count, nonce: () => Buffer.alloc(32, count + 40).toString('base64url') }) }
// This Windows composition substitutes directory sync only. Linux crash durability remains separate acceptance.
const routeIo: PublicTrustWrites = { append: async (file, bytes) => { let offset = 0; while (offset < bytes.length) { const result = await file.write(bytes, offset, bytes.length - offset, null); if (!result.bytesWritten) throw new Error('fixture zero append'); offset += result.bytesWritten } }, sync: file => file.sync(), directorySync: async () => {} }
async function publicRouteFixture(f: Awaited<ReturnType<typeof fixture>>, binding: Awaited<ReturnType<typeof f.bind>>) {
  const original = { pairId: id<'harmony-relay-pair'>(binding.bindingId), desktopPublicSpki: binding.desktopPublicSpki, phonePublicSpki: binding.phonePublicSpki, epoch: 1, expiresAt: Date.now() + 300000, revoked: false }
  const configuration = { ...hostConfig, publicHost: binding.audience, nativeOrigin: 'networkkit-v1', broker: { ...hostConfig.broker, maxPairs: 1, pairs: [original] }, publicTrust: { path: join(f.world, 'old-trust.jsonl'), maxBytes: 1048576, maxRecords: 64 }, deviceRoutes: { path: join(f.world, 'finite-routes.jsonl'), maxBytes: 1048576, maxRecords: 64 } }
  const parsed = resolveRelayConfig(configuration); if (!parsed.enabled || !parsed.broker.enabled || parsed.publicTrust === undefined) throw new Error('fixture public config denied')
  const authority = {}; await PublicTrustStore.initialize(authority, authority, parsed.publicTrust, parsed.broker, parsed.publicHost, routeIo)
  const store = await PublicTrustStore.reopen(parsed.publicTrust, parsed.broker, parsed.publicHost, routeIo)
  try { await store.commit({ ...original, epoch: 2, revoked: true }) } finally { await store.close() }
  const retained = await readFile(configuration.publicTrust.path)
  expect(await maintainDeviceRoutes(true, 'initialize', configuration, undefined, routeIo)).toMatchObject({ state: 'initialized-empty', verified: true })
  return { configuration, retained }
}

it('public route registration survives two windows and restart while legacy epoch2 and device binding remain separate', async () => {
  const f = await fixture('route-public-two-windows'), authority = {}, sockets: WebSocket[] = []
  let server: RelayApplication | undefined, desktop: DeviceRouteOwner | undefined, phone: DeviceRouteOwner | undefined
  try {
    const binding = await f.bind(), originalBinding = await f.storage.read(), { configuration, retained } = await publicRouteFixture(f, binding)
    desktop = routesFor(f, 'public-window'); let raw: string | null = null
    phone = new DeviceRouteOwner(f.native, 'phone', () => f.client.load(f.native), { read: async () => raw, compareAndSet: async (previous, next) => { if (previous !== raw) throw new Error('fixture phone CAS'); raw = next } }, phoneKey, nodeE2EPrimitives, Date.now)
    const attempts = await Promise.allSettled([desktop.offer(f.authority, 60000), desktop.offer(f.authority, 60000)])
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const firstOffer = attempts.find(item => item.status === 'fulfilled'); if (firstOffer?.status !== 'fulfilled') throw new Error('fixture window absent')
    const first = await desktop.confirm(f.authority, await phone.acceptOffer(f.native, firstOffer.value, true))
    expect(await maintainDeviceRoutes(true, 'register', configuration, first, routeIo)).toMatchObject({ routeId: first.offer.routeId, epoch: 1, verified: true, active: true })
    const opened = async (routeId: string) => new Promise<boolean>((accept, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:' + server!.port() + '/harmony/relay/control/v1', 'harmony-relay-control-v1', { headers: { Host: binding.audience, Origin: 'https://' + binding.audience, 'X-DSH-Relay-Pair': routeId, 'X-DSH-Relay-Role': 'phone' }, handshakeTimeout: 2000 }); sockets.push(socket); socket.on('error', () => {})
      const timer = setTimeout(() => { socket.terminate(); reject(new Error('fixture route handshake timeout')) }, 3000), finish = (value: boolean) => { clearTimeout(timer); socket.terminate(); accept(value) }
      socket.once('open', () => finish(true)); socket.once('unexpected-response', (_request, response) => { response.resume(); finish(false) })
    })
    server = await openRelayApplication(configuration, authority, Date.now, fixtureSource(), routeIo); if (server === undefined) throw new Error('fixture server missing'); await server.start()
    expect(await opened(first.offer.routeId)).toBe(true); expect(await opened(binding.bindingId)).toBe(false)
    await server.revokePair(authority, id<'harmony-relay-pair'>(first.offer.routeId)); await server.close(); server = undefined
    expect(await maintainDeviceRoutes(false, 'verify', configuration, first, routeIo)).toMatchObject({ epoch: 2, revoked: true, active: false, verified: true })
    await expect(maintainDeviceRoutes(true, 'register', configuration, first, routeIo)).rejects.toThrow()
    await desktop.retire(f.authority); await phone.retire(f.native)
    const second = await desktop.confirm(f.authority, await phone.acceptOffer(f.native, await desktop.offer(f.authority, 60000), true))
    await maintainDeviceRoutes(true, 'register', configuration, second, routeIo)
    server = await openRelayApplication(configuration, authority, Date.now, fixtureSource(), routeIo); if (server === undefined) throw new Error('fixture second server missing'); await server.start()
    expect(await opened(first.offer.routeId)).toBe(false); expect(await opened(second.offer.routeId)).toBe(true)
    await server.close(); server = undefined
    expect(await f.storage.read()).toBe(originalBinding); expect(await readFile(configuration.publicTrust.path)).toEqual(retained)
    await desktop.retire(f.authority); await phone.retire(f.native)
    const capturedBeforeRevoke = await desktop.confirm(f.authority, await phone.acceptOffer(f.native, await desktop.offer(f.authority, 60000), true))
    await f.owner.revoke(f.authority); const tombstone = await f.owner.publicRecord(f.authority)
    expect(await maintainDeviceRoutes(true, 'revoke-device', configuration, tombstone, routeIo)).toMatchObject({ epoch: 2, revoked: true, verified: true })
    expect(await maintainDeviceRoutes(false, 'verify', configuration, second, routeIo)).toMatchObject({ revoked: true, active: false })
    await expect(maintainDeviceRoutes(true, 'register', configuration, capturedBeforeRevoke, routeIo)).rejects.toThrow()
    expect(await readFile(configuration.publicTrust.path)).toEqual(retained); f.ctx.llm.assertZeroRealCalls()
  } finally { for (const socket of sockets) socket.terminate(); await server?.close(); await desktop?.close(); await phone?.close(); await f.close() }
})

it('uncertain desktop route commits and relay append failures remain blocked across reopen', async () => {
  const f = await fixture('route-write-unknown'); let desktop: DeviceRouteOwner | undefined, phone: DeviceRouteOwner | undefined
  try {
    const binding = await f.bind(), before = await f.storage.read(), { configuration } = await publicRouteFixture(f, binding)
    desktop = routesFor(f, 'fault-window'); let raw: string | null = null
    phone = new DeviceRouteOwner(f.native, 'phone', () => f.client.load(f.native), { read: async () => raw, compareAndSet: async (previous, next) => { if (previous !== raw) throw new Error('fixture phone CAS'); raw = next } }, phoneKey, nodeE2EPrimitives, Date.now)
    const route = await desktop.confirm(f.authority, await phone.acceptOffer(f.native, await desktop.offer(f.authority, 60000), true)); await desktop.retire(f.authority)
    const original = f.ctx.credentials.modifyRecord.bind(f.ctx.credentials); let writes = 0
    const spy = vi.spyOn(f.ctx.credentials, 'modifyRecord').mockImplementation(async (key, update) => { if (++writes === 2) throw new Error('fixture lost ready acknowledgement'); return original(key, update) })
    try { await expect(desktop.offer(f.authority, 60000)).rejects.toThrow('persistence outcome unknown') } finally { spy.mockRestore() }
    await expect(new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId).read()).rejects.toThrow('outcome unknown')
    expect(await f.storage.read()).toBe(before)
    const interrupted: PublicTrustWrites = { ...routeIo, append: async (file, bytes) => { await routeIo.append(file, bytes.subarray(0, Math.max(1, bytes.length - 1))); throw new Error('fixture interrupted append') } }
    await expect(maintainDeviceRoutes(true, 'register', configuration, route, interrupted)).rejects.toMatchObject({ operationFailed: true, closeFailed: true } satisfies Partial<RouteMaintenanceError>)
    await expect(maintainDeviceRoutes(false, 'verify', configuration, route, routeIo)).rejects.toThrow()
    await expect(maintainDeviceRoutes(true, 'initialize', configuration, undefined, routeIo)).rejects.toThrow()
    expect(await f.storage.read()).toBe(before); f.ctx.llm.assertZeroRealCalls()
  } finally { await desktop?.close(); await phone?.close(); await f.close() }
})
it('actual desktop catalogue includes future Sessions and reuses the narrow Gateway executor across more than sixteen selections', async () => {
  const f = await fixture('binding-normal-services'); let channel: DeviceBoundProfileChannel | undefined
  try {
    const ids = Array.from({ length: 20 }, (_, n) => id<'SessionId'>('normal-binding-session-' + n))
    for (const sessionId of ids) await f.ctx.sessionController.create({ sessionId, cwd: f.world })
    await f.bind(); const ticket = await f.connect(), provider = new DeviceBindingProfileProvider(f.ctx, Date.now)
    const options = { enabled: true, desktopId: f.policy.desktopId, profileId: 'desktop', journalMode: 'create' as const }
    await f.ctx.plugin(Desktop, options)
    const spec = Desktop.resolveOptions(options, Date.now)
    channel = new DeviceBoundProfileChannel(f.ctx, f.owner, provider, f.server, ticket, spec.limits)
    expect((await channel.catalog()).map(row => row.sessionId)).toEqual(expect.arrayContaining(ids))
    const future = id<'SessionId'>('normal-binding-future'); await f.ctx.sessionController.create({ sessionId: future, cwd: f.world })
    expect((await channel.catalog()).some(row => row.sessionId === future)).toBe(true)
    for (const sessionId of [...ids, future]) {
      const route = { desktopId: f.policy.desktopId, profileId: 'desktop' as const, sessionId }
      await channel.select(route)
      const packet = { protocol: MOBILE_LINK_PROTOCOL, desktopId: id<'mobile-desktop'>(f.policy.desktopId), deviceId: id<'mobile-device'>(f.policy.deviceId), commandId: id<'mobile-command'>('normal-read-' + sessionId), grantEpoch: ticket.epoch, expiresAt: Date.now() + 5000, operation: 'session.sync' as const, payload: { sessionId, afterSeq: -1 } }
      const result = await channel.request(route, { version: PROFILE_RPC_CODEC, packet: JSON.stringify(packet) }, new AbortController().signal)
      expect(result).toBeDefined()
    }
    await expect(channel.select({ desktopId: f.policy.desktopId, profileId: 'foreign' as 'desktop', sessionId: future })).rejects.toThrow()
    expect((await f.ctx.credentials.readRecord(f.legacy))?.kind).toBe('grant')
    f.ctx.llm.assertZeroRealCalls()
  } finally { await channel?.close(); await f.close() }
})
it('public storage retains pending markers after lost commit and never silently recovers or touches old grants', async () => {
  const f = await fixture('binding-storage-unknown')
  try {
    const offer = await f.owner.offer(f.authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    const reply = { schema: 'harmony-device-binding-reply/1', offer, signature: Buffer.from(await phoneKey.sign(deviceBindingReplyBytes(offer))).toString('base64url') }
    const original = f.ctx.credentials.modifyRecord.bind(f.ctx.credentials); let calls = 0
    const write = vi.spyOn(f.ctx.credentials, 'modifyRecord').mockImplementation((key, change) => ++calls === 2 ? Promise.reject(new Error('fixture ready acknowledgement failed')) : original(key, change))
    await expect(f.owner.confirm(f.authority, reply, async () => true)).rejects.toThrow('unknown')
    write.mockRestore()
    const cold = new CredentialDeviceBindingStorage(f.ctx, f.policy.desktopId, f.policy.deviceId)
    await expect(cold.read()).rejects.toThrow('transition outcome unknown')
    expect(await f.ctx.credentials.readRecord(f.legacy)).toMatchObject({ kind: 'grant', payload: { protocol: 'fixture-old-grant', epoch: 10, revoked: true } })
    f.ctx.llm.assertZeroRealCalls()
  } finally { await f.close() }
})
it('revocation preserves the previous public generation, invalidates the original channel and remains denied after storage recreation', async () => {
  const f = await fixture('binding-storage-revoke')
  try {
    await f.bind(); const ticket = await f.connect(); await f.owner.revoke(f.authority)
    await expect(f.owner.catalog(f.server, ticket)).rejects.toThrow()
    const cold = new CredentialDeviceBindingStorage(f.ctx, f.policy.desktopId, f.policy.deviceId), value = JSON.parse((await cold.read())!)
    expect(value.revoked).toBe(true); expect(value.epoch).toBe(2)
    expect(await f.ctx.credentials.readRecord(f.legacy)).toMatchObject({ kind: 'grant', payload: { protocol: 'fixture-old-grant', epoch: 10, revoked: true } })
    f.ctx.llm.assertZeroRealCalls()
  } finally { await f.close() }
})

it('new native facade performs actual encrypted local carrier proofs, dynamic selection and canonical snapshots without any model', async () => {
  const f = await fixture('binding-encrypted-native'); const sockets: WebSocket[] = []
  const audit: string[] = [], failures: unknown[] = []
  let app: NativeDeviceProductFacade | undefined, stopDesktop: (() => Promise<void>) | undefined, relay: ReturnType<typeof createStandaloneRelay>, desktopRoutes: DeviceRouteOwner | undefined
  try {
    const first = id<'SessionId'>('encrypted-first'), second = id<'SessionId'>('encrypted-second')
    await f.ctx.sessionController.create({ sessionId: first, cwd: f.world }); await f.ctx.sessionController.create({ sessionId: second, cwd: f.world })
    const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')), policy = { ...base.core, enabled: true, commandPrefix: 'encrypted-native', transport: { ...base.core.transport, timeoutMs: 10000 } }, budgets = { ...base.relay, maxProofs: 64, maxQueuedBytes: 4194304, maxChallengeTtlMs: 10000, maxRoomTtlMs: 60000, handshakeMs: 10000, e2e: { maxFrameBytes: 2097152, maxPlaintextBytes: 1048576, maxFrames: 4096 } }, expiresAt = Date.now() + 120000
    const scheduler = { after: (ms: number, callback: () => void) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
    let record: string | null = null, storageRead = false, acquisitions = 0, agreement = 10
    const storage = { read: async () => { if (storageRead) throw new Error('fixture exclusive native file cannot be reread'); storageRead = true; return record }, write: async (raw: string) => { record = raw }, close: async () => {} }, views: Array<{ selected: string; readOnly: boolean; sessions: Array<{ sessionId: string }>; connection: string; richJson: string; task: string }> = []
    const ws = (path: string, protocol: string, headers: Record<string, string>) => {
      const socket = new WebSocket('ws://127.0.0.1:' + relay!.port() + path, protocol, { headers: { Host: f.policy.audience, ...(headers['X-DSH-Relay-Role'] === 'phone' ? { Origin: 'https://' + f.policy.audience } : {}), ...headers }, perMessageDeflate: false, handshakeTimeout: 2000 }), label = headers['X-DSH-Relay-Role'] + (path.includes('control') ? '-control' : '-data')
      socket.on('error', () => {}); socket.once('upgrade', () => audit.push(label + '-101')); socket.once('unexpected-response', (_request, response) => { audit.push(label + '-http-' + response.statusCode); response.resume() })
      socket.on('message', () => { if (socket.listenerCount('message') === 1) audit.push(label + '-frame-before-consumer') }); socket.once('close', code => audit.push(label + '-closed-' + code))
      sockets.push(socket); return socket
    }
    const ports = (role: 'desktop' | 'phone', pair: string) => ({ control: nodeRelaySocket(ws('/harmony/relay/control/v1', 'harmony-relay-control-v1', { 'X-DSH-Relay-Pair': pair, 'X-DSH-Relay-Role': role }), 64, false), signer: role === 'desktop' ? desktopKey : phoneKey, primitives: nodeE2EPrimitives, remotePublicSpki: (role === 'desktop' ? phoneKey : desktopKey).publicSpki, scheduler, clock: Date.now,
      controlDiagnostic: (stage: ControlDiagnostic) => { audit.push(role + '-control-' + stage) }, diagnostic: (stage: E2EDiagnostic) => { audit.push(role + '-e2e-' + stage) },
      agreement: async () => { const n = ++agreement; return { key: new ImportedP256Agreement(fixtureKey(n).pkcs8), nonce: Buffer.alloc(32, n) } }, data: async (lease: { receipt: { token: string; room: string } }) => nodeRelaySocket(ws('/harmony/relay/v1', 'dsh-relay-v1', { Authorization: 'Bearer ' + lease.receipt.token, 'X-DSH-Relay-Room': lease.receipt.room, 'X-DSH-Relay-Role': role }), 64) })
    app = new NativeDeviceProductFacade(f.native, JSON.stringify(policy), f.policy.identityAlias, f.policy.audience, expiresAt, budgets, storage, { signer: phoneKey, primitives: nodeE2EPrimitives }, scheduler, Date.now, async raw => { acquisitions++; const value = JSON.parse(raw), network = ports('phone', value.offer.routeId); return { ports: network, open: async () => {}, authenticated: () => {}, close: async () => { network.control.terminate() } } }, raw => views.push(JSON.parse(raw)), 50, routeMemory())
    await app.boot(); expect(acquisitions).toBe(0)
    const offer = await f.owner.offer(f.authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    expect(JSON.parse(await app.previewEnrollment(JSON.stringify(offer))).deviceBinding).toBe(true)
    const reply = JSON.parse(await app.signEnrollment(JSON.stringify(offer), true)), binding = await f.owner.confirm(f.authority, reply, async () => true)
    await app.pairWithConnection(JSON.stringify(binding), true, true); expect(acquisitions).toBe(0)
    desktopRoutes = routesFor(f, 'encrypted-route')
    const routeOffer = await desktopRoutes.offer(f.authority, 60000), route = await desktopRoutes.confirm(f.authority, JSON.parse(await app.signRoute(JSON.stringify(routeOffer), true)))
    const relayConfig = (routeId: string, expiry: number) => ({ ...hostConfig, nativeOrigin: 'networkkit-v1', publicHost: f.policy.audience, pairTimeoutMs: 10000, maxRoomTtlMs: 60000, maxFrameBytes: 2097152, maxBufferedBytes: 4194304, maxFrames: 4096, idleTimeoutMs: 60000, broker: { ...hostConfig.broker, pairs: [{ pairId: routeId, desktopPublicSpki: binding.desktopPublicSpki, phonePublicSpki: binding.phonePublicSpki, epoch: 1, expiresAt: expiry, revoked: false }], challengeTtlMs: 10000, roomTtlMs: 60000, maxChallengesPerConnection: 64, maxRoomIssuesPerWindow: 32, maxOwnerRoomIssues: 64 } })
    relay = createStandaloneRelay(relayConfig(route.offer.routeId, route.offer.expiresAt), {}, Date.now, () => {}, fixtureSource())
    if (relay === undefined) throw new Error('local fixture missing'); await relay.start()
    const provider = new DeviceBindingProfileProvider(f.ctx, Date.now), options = { enabled: true, desktopId: f.policy.desktopId, profileId: 'desktop', journalMode: 'create' as const }; await f.ctx.plugin(Desktop, options)
    const spec = Desktop.resolveOptions(options, Date.now)
    let lastMounted: DeviceBindingDesktopRelay | undefined
    const mount = (next: typeof route) => (lastMounted = new DeviceBindingDesktopRelay(f.owner, provider, { desktopId: binding.desktopId, route: next, isRouteCurrent: async () => JSON.stringify(await desktopRoutes!.current(f.authority)) === JSON.stringify(next), trust: { pairId: id<'harmony-relay-pair'>(next.offer.routeId), epoch: next.offer.routeEpoch, role: 'desktop', audience: binding.audience, credentialId: id<'harmony-device-credential'>(binding.desktopCredentialId), expiresAt: next.offer.expiresAt }, policy: budgets, limits: spec.limits, openPorts: () => ports('desktop', next.offer.routeId) })).mount(f.ctx)
    stopDesktop = await mount(route)
    await expect(app.connect(false)).rejects.toThrow('host consent required')
    expect(acquisitions).toBe(0)
    await app.connect(true).catch(error => { throw new Error('isolated routing proof audit: ' + audit.slice(-32).join(' > '), { cause: error }) }); await app.select(first)
    await vi.waitFor(() => expect(views.at(-1)?.selected).toBe(first))
    await vi.waitFor(() => expect(views.at(-1)?.readOnly).toBe(false))
    const future = id<'SessionId'>('encrypted-future'); await f.ctx.sessionController.create({ sessionId: future, cwd: f.world }); await vi.waitFor(() => expect(views.at(-1)?.sessions.some(row => row.sessionId === future)).toBe(true))
    const replay = await installFourResponses(f.ctx, f.world)
    expect(JSON.parse(await app.submit('encrypted-replay-task', 'Show the fixed replay mobile forms.'))).toMatchObject({ accepted: true })
    await f.ctx.agents.get(first)!.whenIdle()
    await vi.waitFor(() => expect(views.at(-1)?.richJson).not.toBe(''), { timeout: 10000 })
    vi.stubGlobal('canIUse', () => true)
    const browser = await submitProductForm(app, views.at(-1)!.richJson, JSON.stringify(policy))
    expect(browser.guestHostDenied).toBe(true); expect(browser.widths).toEqual([360, 480])
    expect(await app.richRequest(browser.packet)).toBe(browser.receipt)
    await f.ctx.agents.get(first)!.whenIdle()
    expect(f.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(3)
    await app.select(future); await vi.waitFor(() => expect(views.at(-1)?.selected).toBe(future)); expect(acquisitions).toBe(1)
    await expect(app.richRequest(browser.packet)).rejects.toThrow()
    await app.stopRoute(); await stopDesktop(); expect(lastMounted?.terminalState).toBe('closed'); stopDesktop = undefined; await desktopRoutes.retire(f.authority); await relay.close()
    const nextOffer = await desktopRoutes.offer(f.authority, 60000), nextRoute = await desktopRoutes.confirm(f.authority, JSON.parse(await app.signRoute(JSON.stringify(nextOffer), true)))
    expect(nextRoute.offer.routeId).not.toBe(route.offer.routeId); expect(nextRoute.offer.binding).toEqual(binding)
    relay = createStandaloneRelay(relayConfig(nextRoute.offer.routeId, nextRoute.offer.expiresAt), {}, Date.now, () => {}, fixtureSource()); if (relay === undefined) throw new Error('second route relay missing'); await relay.start(); stopDesktop = await mount(nextRoute)
    await app.connect(true).catch(error => { throw new Error('isolated second-window proof audit: ' + audit.slice(-32).join(' > '), { cause: error }) }); await app.select(future); await vi.waitFor(() => expect(views.at(-1)?.selected).toBe(future)); expect(acquisitions).toBe(2)
    expect(await f.storage.read()).toBe(JSON.stringify(binding)); expect(f.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(3)
    await app.select(first)
    await vi.waitFor(() => { expect(views.at(-1)?.selected).toBe(first); expect(views.at(-1)?.readOnly).toBe(false) })
    expect(JSON.parse(await app.submit('encrypted-reconnected-task', 'Wait for my stop.'))).toMatchObject({ accepted: true })
    await vi.waitFor(async () => { await readFile(replay.readyFile, 'utf8'); expect(views.at(-1)?.task).toBe('running') })
    await app.cancel(); await f.ctx.agents.get(first)!.whenIdle()
    await vi.waitFor(() => expect(views.at(-1)?.task).toBe('cancelled'))
    expect(f.ctx.llm.getOfflineReplayCounts().replay[0]?.calls).toBe(4)
    void replay; vi.unstubAllGlobals()
    expect(JSON.stringify(views)).not.toContain(f.world); expect(JSON.stringify(views)).not.toContain('harmony-device-ticket/1'); expect(record).toContain('harmony-device-binding/1')
    await writeFile(join(f.world, 'routing-wire-stages.json'), JSON.stringify({ windows: 2, stages: audit, beforeConsumer: audit.filter(stage => stage.includes('before-consumer')), actualDevice: false, realModels: 0 }, null, 2) + '\n', { flag: 'wx' })
    expect(audit.filter(stage => stage.includes('before-consumer'))).toEqual([])
    f.ctx.llm.assertZeroRealCalls()
  } catch (error) { failures.push(error) }
  finally { const results = await Promise.allSettled([app?.close(), stopDesktop?.()]); for (const socket of sockets) socket.terminate(); results.push(...await Promise.allSettled([relay?.close(), desktopRoutes?.close(), f.close()])); for (const result of results) if (result.status === 'rejected') failures.push(result.reason) }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'isolated encrypted fixture and cleanup failed')
})


it('normal device command preserves original identities and old grants, cancels challenges and revokes separate persistent binding without a model', async () => {
  const f = await fixture('binding-normal-command', { desktopId: 'field-replay-desktop', deviceId: 'field-phone' }), protection = new FixedIdentityProtection(), alias = 'normal-original-desktop'
  const unprotect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'unprotect').mockImplementation((value, binding) => protection.unprotect(value, binding))
  try {
    await f.ctx.plugin(Authorization); await f.ctx.plugin(UserQuestions)
    await f.ctx.credentials.modifyRecord(credentialKey('harmony-desktop-identity', alias), async () => fixedProtectedIdentity(alias, desktopKey, protection))
    const original = await f.ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias))
    const session = id<'SessionId'>('device-command-current'); await f.ctx.sessionController.create({ sessionId: session, cwd: f.world })
    f.ctx.on('user-questions/request', async (request, next) => { if (!request.questions.every(q => q.id === 'harmony-device')) return next(); return { answers: request.questions.map(q => ({ id: q.id, selected: ['Allow'] })) } })
    const options = JSON.parse(await readFile(new URL('../desktop-plugin/device.enabled.example.json', import.meta.url), 'utf8'))
    Object.assign(options, { enabled: true, desktopId: f.policy.desktopId, deviceId: f.policy.deviceId, identityAlias: alias, phoneIdentityAlias: f.policy.identityAlias, audience: f.policy.audience, wss: { ...options.wss, host: f.policy.audience } })
    const run = (verb: string) => f.ctx.commands.execute(f.ctx.agents.get(session)!, '/harmony-device ' + verb, [], new AbortController().signal)
    const output = async (verb: string) => { const value = await run(verb); if (value?.result.kind !== 'success' || value.result.text === undefined) throw new Error('fixture command refused: ' + JSON.stringify(value)); return JSON.parse(value.result.text) }
    const disabled = f.ctx.plugin(DeviceCommand, { enabled: false }); await disabled; expect(f.ctx.commands.list(f.ctx.agents.get(session)!).some(row => row.name === 'harmony-device')).toBe(false)
    const plugin = f.ctx.plugin(DeviceCommand, options); await plugin
    expect(await output('status')).toEqual({ profileId: 'desktop', sessionId: session, state: 'not-bound' })
    unprotect.mockRejectedValueOnce(new Error('FIXTURE_PRIVATE_PROTECTION_DIAGNOSTIC'))
    const failedPreparation = await run('route-start')
    expect(failedPreparation?.result.kind).toBe('error'); expect(failedPreparation?.result.text).toContain('identity-open/identity-unavailable'); expect(failedPreparation?.result.text).not.toContain('FIXTURE_PRIVATE_PROTECTION_DIAGNOSTIC')
    expect((await output('status')).state).toBe('not-bound')
    const phone = { identityAlias: f.policy.identityAlias, publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
    expect((await output('start ' + JSON.stringify(phone))).state).toBe('offered'); expect((await output('stop')).state).toBe('stopped'); expect((await output('status')).state).toBe('not-bound')
    const offered = await output('start ' + JSON.stringify(phone)), reply = JSON.parse(await f.client.signOffer(f.native, JSON.stringify(offered.publicResult), true))
    const confirmed = await output('confirm ' + JSON.stringify(reply)); expect(confirmed.publicResult.scope).toEqual({ kind: 'all-visible-sessions', profileId: 'desktop' }); expect(confirmed.publicResult.sessions).toBeUndefined()
    await f.client.accept(f.native, JSON.stringify(confirmed.publicResult), true)
    let phoneRoutesRaw: string | null = null
    const phoneRoutes = new DeviceRouteOwner(f.native, 'phone', () => f.client.load(f.native), { read: async () => phoneRoutesRaw, compareAndSet: async (previous, next) => { if (previous !== phoneRoutesRaw) throw new Error('fixture command route CAS'); phoneRoutesRaw = next } }, phoneKey, nodeE2EPrimitives, Date.now)
    try {
      expect((await output('route-status')).state).toBe('route-required')
      const offeredRoute = await output('route-start'), signedRoute = await phoneRoutes.acceptOffer(f.native, offeredRoute.publicResult, true), acceptedRoute = await output('route-confirm ' + JSON.stringify(signedRoute))
      expect(acceptedRoute.state).toBe('route-ready'); expect(acceptedRoute.relayPair.pairId).toBe(signedRoute.offer.routeId); expect(acceptedRoute.relayPair.pairId).not.toBe(confirmed.publicResult.bindingId)
      expect((await output('directory')).relayPair).toEqual(acceptedRoute.relayPair)
      const policyFailure = vi.spyOn(f.ctx.remoteAccess, 'registerPolicy').mockImplementationOnce(() => { throw new LinkError('scope-denied') })
      try { const refused = await run('connect'); expect(refused?.result.kind).toBe('error'); expect(refused?.result.text).toContain('profile-provider/link-scope-denied'); expect((await output('route-status')).state).toBe('route-ready') } finally { policyFailure.mockRestore() }
      const journalFailure = vi.spyOn(f.ctx.storageDomain, 'open').mockRejectedValueOnce(new ProfileJournalError('journal-already-exists'))
      const noDial = vi.spyOn(DeviceBindingDesktopRelay.prototype, 'mount').mockRejectedValue(new Error('fixture unexpected carrier mount'))
      try { const refused = await run('connect'); expect(refused?.result.kind).toBe('error'); expect(refused?.result.text).toContain('journal-open/journal-already-exists'); expect(noDial).not.toHaveBeenCalled(); expect((await output('status')).state).toBe('bound'); expect((await output('route-status')).state).toBe('route-ready') } finally { journalFailure.mockRestore(); noDial.mockRestore() }
      const mount = vi.spyOn(DeviceBindingDesktopRelay.prototype, 'mount').mockResolvedValue(async () => {})
      try {
        expect((await output('connect')).state).toBe('transport-started')
        const mounted = f.ctx.get('harmonyRelayLifecycle')
        expect(mounted).toBeInstanceOf(DeviceBindingDesktopRelay)
        Object.defineProperty(mounted, 'terminalState', { value: 'closed', configurable: true })
        expect((await output('status')).state).toBe('transport-closed')
        const journalPath = join(f.world, 'state/harmony_mobile_admission.json'), retained = await readFile(journalPath, 'utf8')
        expect((await run('connect'))?.result.kind).toBe('error'); expect(mount).toHaveBeenCalledTimes(1)
        expect((await output('reconnect')).state).toBe('transport-started'); expect(mount).toHaveBeenCalledTimes(2)
        expect(await readFile(journalPath, 'utf8')).toBe(retained)
      } finally { mount.mockRestore() }
      expect((await run('route-start'))?.result.kind).toBe('error')
    } finally { await phoneRoutes.close() }
    expect((await output('stop')).state).toBe('stopped'); expect((await output('status')).state).toBe('bound')
    expect((await output('route-status')).state).toBe('route-required')
    const revoked = await output('revoke'); expect(revoked.state).toBe('revoked'); expect(revoked.publicResult).toMatchObject({ revoked: true, epoch: 2 }); expect(revoked.relayPair).toBeUndefined()
    expect(await f.ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias))).toEqual(original)
    expect(await f.ctx.credentials.readRecord(f.legacy)).toMatchObject({ kind: 'grant', payload: { protocol: 'fixture-old-grant', epoch: 10, revoked: true } })
    expect(f.ctx.sessions.get(session)!.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(0); f.ctx.llm.assertZeroRealCalls()
    await plugin.dispose(); expect(f.ctx.commands.list(f.ctx.agents.get(session)!).some(row => row.name === 'harmony-device')).toBe(false)
  } finally { unprotect.mockRestore(); await f.close() }
})

it('actual ArkTS device delegate preserves original HUKS identity, separate public receipt and cold resume without connecting', async () => {
  const f = await fixture('binding-arkts-owner'); resetProductSdk(); state.aliases.add(f.policy.identityAlias)
  const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
  const app = new NativeProductOwner({ ...base, deviceBindingMode: true, deviceRoutingTtlMs: 86400000, deviceCatalogRefreshMs: 100, corePolicyJson: JSON.stringify(base.core) })
  try {
    const views: Array<{ connectionGeneration: number }> = []
    await app.initialize(context(), raw => views.push(JSON.parse(raw))); expect(state.calls).not.toContain('create'); expect(network.requests).toHaveLength(0)
    const phone = JSON.parse(await app.publicIdentity(f.policy.identityAlias)); expect(phone.publicSpki).toBe(phoneKey.publicSpki)
    const offer = await f.owner.offer(f.authority, phone); expect(JSON.parse(await app.previewEnrollment(JSON.stringify(offer))).deviceBinding).toBe(true)
    const reply = await app.signEnrollment(JSON.stringify(offer), true)
    await expect(app.signEnrollment(JSON.stringify(offer), true)).rejects.toThrow()
    const record = await f.owner.confirm(f.authority, JSON.parse(reply), async () => true)
    await app.pairWithConnection(JSON.stringify(record), true, true); expect(app.connectionEnabled()).toBe(false)
    const routes = routesFor(f, 'arkts-route'), routeOffer = await routes.offer(f.authority, 60000)
    expect(JSON.parse(await app.previewRoute(JSON.stringify(routeOffer))).bindingId).toBe(record.bindingId)
    await expect(app.signRoute(JSON.stringify(routeOffer), false)).rejects.toThrow()
    await routes.confirm(f.authority, JSON.parse(await app.signRoute(JSON.stringify(routeOffer), true))); await routes.close(); expect(app.connectionEnabled()).toBe(true)
    const originalGeneration = views.at(-1)!.connectionGeneration
    expect(app.connectionHost()).toBe(f.policy.audience)
    await app.close(); await app.foreground(); expect(app.connectionEnabled()).toBe(true)
    expect(views.at(-1)!.connectionGeneration).toBeGreaterThan(originalGeneration)
    expect(app.connectionHost()).toBe(f.policy.audience)
    await expect(app.connect(false)).rejects.toThrow('host consent required')
    await expect(app.connect()).rejects.toThrow('host consent required')
    expect(JSON.parse(await app.savedPairing(true)).bindingId).toBe(record.bindingId)
    expect(state.calls).not.toContain('create'); expect(state.calls).not.toContain('remove'); expect(network.requests).toHaveLength(0)
    expect([...sdk.files.keys()].some(path => path.endsWith('/mobile-device-binding-v1.json'))).toBe(true)
    expect([...sdk.files.keys()].some(path => path.endsWith('/mobile-product-public-trust.json'))).toBe(false)
    f.ctx.llm.assertZeroRealCalls()
  } finally { await app.close(); await f.close() }
})

it('verified cold binding never implies network consent and manual retry acquires only on explicit approval', async () => {
  const f = await fixture('binding-cold-host-consent'); let app: NativeDeviceProductFacade | undefined
  try {
    const record = await f.bind(), base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
    let acquisitions = 0, writes = 0
    const views: Array<{ connection: string; error: string }> = []
    app = new NativeDeviceProductFacade(f.native, JSON.stringify({ ...base.core, enabled: true }), f.policy.identityAlias, f.policy.audience, Date.now() + 60000, base.relay,
      { read: async () => JSON.stringify(record), write: async () => { writes++; throw new Error('no binding rewrite expected') }, close: async () => {} },
      { signer: phoneKey, primitives: nodeE2EPrimitives }, { after: () => () => {} }, Date.now,
      async () => { acquisitions++; throw new Error('isolated unavailable transport') }, raw => views.push(JSON.parse(raw)), 100, routeMemory())
    await app.boot(); expect(app.bound()).toBe(true); expect(app.connectionHost()).toBe(f.policy.audience); expect(acquisitions).toBe(0)
    await expect(app.connect(false)).rejects.toThrow('host consent required'); expect(acquisitions).toBe(0)
    await expect(app.connect(true)).rejects.toThrow(); expect(acquisitions).toBe(0)
    const routes = routesFor(f, 'cold-route'), routeOffer = await routes.offer(f.authority, 30000); await routes.confirm(f.authority, JSON.parse(await app.signRoute(JSON.stringify(routeOffer), true))); await routes.close()
    await expect(app.connect(true)).rejects.toThrow(); expect(acquisitions).toBe(1); expect(views.at(-1)).toMatchObject({ connection: 'blocked', error: 'connection-unavailable' })
    await expect(app.connect(false)).rejects.toThrow('host consent required'); expect(acquisitions).toBe(1)
    await expect(app.connect(true)).rejects.toThrow(); expect(acquisitions).toBe(2); expect(writes).toBe(0)
    expect(app.bound()).toBe(true); f.ctx.llm.assertZeroRealCalls()
  } finally { await app?.close(); await f.close() }
})

it('route credential ids obey the real DSH grammar for numeric and alphabetic digests through cold adapters', async () => {
  const f = await fixture('route-key-grammar')
  try {
    const pairs = [{ desktopId: 'field-replay-desktop', deviceId: 'field-phone' }, { desktopId: f.policy.desktopId, deviceId: f.policy.deviceId }], starts = new Set<boolean>()
    for (const pair of pairs) {
      const digest = createHash('sha256').update(JSON.stringify([pair.desktopId, 'desktop', pair.deviceId])).digest('hex'), key = credentialKey('harmony-device-route-v1', 'route-' + digest)
      starts.add(isCredentialKeySegment(digest)); expect(parseCredentialKey(key)).toBe(key)
      if (!isCredentialKeySegment(digest)) expect(() => credentialKey('harmony-device-route-v1', digest)).toThrow(TypeError)
      const store = new CredentialDeviceRouteStorage(f.ctx, pair.desktopId, pair.deviceId)
      expect(await store.read()).toBeNull(); expect(await store.read()).toBeNull()
      await store.compareAndSet(null, 'fixture-history'); expect(await store.read()).toBe('fixture-history')
      const cold = new CredentialDeviceRouteStorage(f.ctx, pair.desktopId, pair.deviceId)
      expect(await cold.read()).toBe('fixture-history'); await cold.compareAndSet('fixture-history', 'fixture-retired-history'); expect(await store.read()).toBe('fixture-retired-history')
      expect(await f.ctx.credentials.readRecord(key)).toMatchObject({ payload: { state: 'ready', current: 'fixture-retired-history' } })
    }
    expect(starts).toEqual(new Set([false, true])); f.ctx.llm.assertZeroRealCalls()
  } finally { await f.close() }
})

it('legal legacy route keys retain history in place and conflicting namespaces refuse without migration', async () => {
  const f = await fixture('route-key-legacy')
  try {
    const digest = createHash('sha256').update(JSON.stringify([f.policy.desktopId, 'desktop', f.policy.deviceId])).digest('hex'), oldKey = credentialKey('harmony-device-route-v1', digest), newKey = credentialKey('harmony-device-route-v1', 'route-' + digest)
    const history = 'fixture-kept-replay-and-retirement-history'
    await f.ctx.credentials.modifyRecord(oldKey, async () => ({ kind: 'grant', payload: { schema: 'harmony-device-route-store/1', state: 'ready', current: history } }))
    const store = new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId)
    expect(await store.read()).toBe(history); expect(await store.read()).toBe(history)
    const cold = new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId); expect(await cold.read()).toBe(history); await cold.compareAndSet(history, history + '-retired')
    expect(await f.ctx.credentials.readRecord(newKey)).toBeUndefined(); expect(await store.read()).toBe(history + '-retired')
    await f.ctx.credentials.modifyRecord(newKey, async () => ({ kind: 'grant', payload: { schema: 'harmony-device-route-store/1', state: 'ready', current: 'must-not-replace-old-history' } }))
    await expect(store.read()).rejects.toMatchObject({ code: 'ambiguous-namespace' }); await expect(new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId).read()).rejects.toMatchObject({ code: 'ambiguous-namespace' })
    expect(await f.ctx.credentials.readRecord(oldKey)).toMatchObject({ payload: { current: history + '-retired' } })
  } finally { await f.close() }
})

it('legacy pending markers and corrupt records refuse without fallback or deletion', async () => {
  const f = await fixture('route-key-refusal')
  try {
    const digest = createHash('sha256').update(JSON.stringify([f.policy.desktopId, 'desktop', f.policy.deviceId])).digest('hex'), oldKey = credentialKey('harmony-device-route-v1', digest), newKey = credentialKey('harmony-device-route-v1', 'route-' + digest)
    const pending = { kind: 'grant' as const, payload: { schema: 'harmony-device-route-store/1', state: 'pending', previous: 'old-retired-history', next: 'unknown-write' } }
    await f.ctx.credentials.modifyRecord(oldKey, async () => pending)
    await expect(new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId).read()).rejects.toMatchObject({ code: 'persistence-unknown' }); expect(await f.ctx.credentials.readRecord(oldKey)).toEqual(pending); expect(await f.ctx.credentials.readRecord(newKey)).toBeUndefined()
    await f.ctx.credentials.modifyRecord(oldKey, async () => ({ kind: 'grant', payload: { malformed: 'private-fixture-output' } }))
    await expect(new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId).read()).rejects.toMatchObject({ code: 'invalid-record' }); expect(await f.ctx.credentials.readRecord(newKey)).toBeUndefined()
  } finally { await f.close() }
})

it('device command failure classification excludes arbitrary messages, causes, stacks and private payloads', () => {
  const secret = 'FIXTURE_PRIVATE_TOKEN_DO_NOT_DISPLAY', nested = new Error(secret, { cause: { token: secret } })
  const errors = [new DeviceCommandPreparationError('identity-open', new DesktopIdentityError('unavailable')), new DeviceCommandPreparationError('owner-create', new DeviceRouteStorageError('ambiguous-namespace')), new DeviceRouteStorageError('persistence-unknown'), nested, { message: secret, code: secret, stack: secret }, new TypeError(secret)]
  for (const error of errors) { const safe = deviceCommandFailure(error, false); expect(safe).not.toContain(secret); expect(safe).not.toContain('stack'); expect(safe).toContain('Inspect local binding and route state') }
  expect(deviceCommandFailure(errors[0], false)).toContain('identity-open/identity-unavailable'); expect(deviceCommandFailure(errors[1], false)).toContain('owner-create/route-storage-ambiguous-namespace'); expect(deviceCommandFailure(errors[2], false)).toContain('operation/route-storage-persistence-unknown'); expect(deviceCommandFailure(nested, true)).toContain('operation/cancelled')
})

it('cold route owners retain a legal legacy ledger and cannot revive its retired signed window', async () => {
  const f = await fixture('route-key-signed-retirement')
  let owner: DeviceRouteOwner | undefined
  try {
    await f.bind(); owner = routesFor(f, 'retained-legacy-route')
    const offer = await owner.offer(f.authority, 30000)
    await owner.confirm(f.authority, { schema: 'harmony-device-route/1', offer, signature: Buffer.from(await phoneKey.sign(deviceRouteReplyBytes(offer))).toString('base64url') })
    await owner.retire(f.authority); await owner.close()
    const digest = createHash('sha256').update(JSON.stringify([f.policy.desktopId, 'desktop', f.policy.deviceId])).digest('hex'), oldKey = credentialKey('harmony-device-route-v1', digest), newKey = credentialKey('harmony-device-route-v1', 'route-' + digest)
    const record = await f.ctx.credentials.readRecord(newKey); expect(record).toBeDefined()
    // Arrange a pre-successor namespace using only the isolated synthetic provider.
    await f.ctx.credentials.modifyRecord(oldKey, async () => record); await f.ctx.credentials.deleteRecord(newKey)
    owner = routesFor(f, 'legacy-successor-route')
    expect(await owner.current(f.authority)).toBeNull()
    await expect(owner.offer(f.authority, 30000)).rejects.toThrow('replay'); await owner.close()
    let generation = 0
    owner = new DeviceRouteOwner(f.authority, 'desktop', async () => { const record = await f.owner.publicRecord(f.authority); if (record === null) throw new Error('fixture binding absent'); return record }, new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId), desktopKey, nodeE2EPrimitives, Date.now, { id: () => 'legacy-fresh-' + ++generation, nonce: () => Buffer.alloc(32, 80 + generation).toString('base64url') })
    const next = await owner.offer(f.authority, 30000); expect(next.routeId).not.toBe(offer.routeId)
    expect(await f.ctx.credentials.readRecord(newKey)).toBeUndefined()
    const stored = await new CredentialDeviceRouteStorage(f.ctx, f.policy.desktopId, f.policy.deviceId).read()
    if (stored === null) throw new Error('fixture retained ledger absent')
    expect(JSON.parse(stored).retired).toContain(offer.routeId); expect(JSON.parse(stored).offers).toHaveLength(2); expect(JSON.parse(stored).routes).toHaveLength(1)
    await owner.retire(f.authority)
    expect(await owner.current(f.authority)).toBeNull(); f.ctx.llm.assertZeroRealCalls()
  } finally { await owner?.close(); await f.close() }
})

it('connection diagnostics identify a refused existing journal without exposing its payload', () => {
  expect(deviceCommandFailure(new ProfileJournalError('journal-already-exists'), false)).toContain('operation/journal-already-exists')
})

it('admission journal create and reopen retain receipts, reject wrong ownership and survive a cold Host recreation', async () => {
  const f = await fixture('journal-create-reopen'), policy = { mode: 'create' as const, desktopId: id<'mobile-desktop'>(f.policy.desktopId), profileId: id<'mobile-profile'>('desktop') }
  const row = { desktopId: policy.desktopId, deviceId: id<'mobile-device'>(f.policy.deviceId), sessionId: id<'SessionId'>('journal-session'), requestId: id<'session-request-id'>('journal-request'), fingerprint: 'fixture-admission-history', state: 'submitting' as const }
  let cold: Awaited<ReturnType<typeof loadProfileServices>> | undefined
  try {
    await expect(openProfileJournal(f.ctx, 10, { ...policy, mode: 'reopen' })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
    const first = await openProfileJournal(f.ctx, 10, policy)
    expect((await first.journal.claim(row)).created).toBe(true); await first.close()
    await expect(openProfileJournal(f.ctx, 10, policy)).rejects.toMatchObject({ code: 'journal-already-exists' })
    await expect(openProfileJournal(f.ctx, 10, { ...policy, mode: 'reopen', desktopId: id<'mobile-desktop'>('wrong-desktop') })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
    const resumed = await openProfileJournal(f.ctx, 10, { ...policy, mode: 'reopen' })
    expect(await resumed.journal.get(row.sessionId, row.requestId)).toEqual(row); await resumed.close(); await f.close()
    cold = await loadProfileServices(f.world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
    const restored = await openProfileJournal(cold, 10, { ...policy, mode: 'reopen' })
    expect(await restored.journal.get(row.sessionId, row.requestId)).toEqual(row); await restored.close()
    await expect(openProfileJournal(cold, 10, policy)).rejects.toMatchObject({ code: 'journal-already-exists' })
  } finally { await cold?.fiber.dispose(); await f.close() }
})

it('connection phases retain the first error and attempt every cleanup without disclosing either payload', async () => {
  const primary = new ProfileJournalError('journal-already-exists'), cleanup = new Error('FIXTURE_PRIVATE_CLEANUP_TOKEN'), calls: string[] = []
  const outcome = await deviceCommandStep('product-activate', () => deviceCommandStep('journal-open', () => { throw primary }), [() => { calls.push('product'); throw cleanup }, () => { calls.push('owner'); throw cleanup }]).catch(error => error)
  expect(outcome).toBeInstanceOf(DeviceCommandStepError); expect(outcome.cause.cause).toBe(primary); expect(calls).toEqual(['product', 'owner'])
  expect(deviceCommandFailure(outcome, false)).toContain('journal-open/journal-already-exists'); expect(deviceCommandFailure(outcome, false)).toContain('[cleanup-failed]'); expect(deviceCommandFailure(outcome, false)).not.toContain('FIXTURE_PRIVATE')
  expect(await deviceCommandStep('binding-read', () => 'fixture-ok', [() => { throw cleanup }])).toBe('fixture-ok')
  for (const [error, code] of [[new LinkError('transport-lost'), 'link-transport-lost'], [new TypeError('FIXTURE_PRIVATE'), 'type-error'], [new SyntaxError('FIXTURE_PRIVATE'), 'syntax-error']] as const) expect(deviceCommandFailure(new DeviceCommandStepError('relay-mount', error, false), false)).toContain('relay-mount/' + code)
  const forged = Object.assign(new LinkError('scope-denied'), { code: 'FIXTURE_PRIVATE_TOKEN' })
  expect(deviceCommandFailure(forged, false)).not.toContain('FIXTURE_PRIVATE'); expect(deviceCommandFailure({ message: 'FIXTURE_PRIVATE', code: 'transport-lost' }, false)).toContain('unclassified-failure')
})


it('admission journal lifecycle resumes only its validated owner across repeat connects and a cold Host', async () => {
  const f = await fixture('journal-managed-lifecycle'), policy = { mode: 'create-or-reopen' as const, desktopId: id<'mobile-desktop'>(f.policy.desktopId), profileId: id<'mobile-profile'>('desktop') }
  const path = join(f.world, 'state/harmony_mobile_admission.json'), row = { desktopId: policy.desktopId, deviceId: id<'mobile-device'>(f.policy.deviceId), sessionId: id<'SessionId'>('repeat-journal-session'), requestId: id<'session-request-id'>('repeat-journal-request'), fingerprint: 'fixture-persisted-intent', state: 'submitting' as const }
  let cold: Awaited<ReturnType<typeof loadProfileServices>> | undefined
  try {
    const first = await openProfileJournal(f.ctx, 10, policy)
    expect((await first.journal.claim(row)).created).toBe(true)
    await expect(openProfileJournal(f.ctx, 10, policy)).rejects.toMatchObject({ code: 'already-open' })
    await first.journal.accept(row); await first.close()
    const bytes = await readFile(path, 'utf8')
    for (let attempt = 0; attempt < 2; attempt++) {
      const resumed = await openProfileJournal(f.ctx, 10, policy)
      expect(await resumed.journal.get(row.sessionId, row.requestId)).toEqual({ ...row, state: 'accepted' })
      expect((await resumed.journal.claim(row)).created).toBe(false); await resumed.close()
      expect(await readFile(path, 'utf8')).toBe(bytes)
    }
    await expect(openProfileJournal(f.ctx, 10, { ...policy, mode: 'create' })).rejects.toMatchObject({ code: 'journal-already-exists' })
    for (const owner of [{ desktopId: id<'mobile-desktop'>('other-desktop') }, { profileId: id<'mobile-profile'>('other-profile') }]) {
      await expect(openProfileJournal(f.ctx, 10, { ...policy, ...owner })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
      expect(await readFile(path, 'utf8')).toBe(bytes)
    }
    await f.close(); cold = await loadProfileServices(f.world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
    const restarted = await openProfileJournal(cold, 10, policy)
    expect((await restarted.journal.claim(row)).created).toBe(false); await restarted.close(); expect(await readFile(path, 'utf8')).toBe(bytes)
  } finally { await cold?.fiber.dispose(); await f.close() }
})

it('admission journal lifecycle refuses missing recovery and corrupt or foreign state without rewriting it', async () => {
  const f = await fixture('journal-managed-refusals'), policy = { mode: 'create-or-reopen' as const, desktopId: id<'mobile-desktop'>(f.policy.desktopId), profileId: id<'mobile-profile'>('desktop') }, path = join(f.world, 'state/harmony_mobile_admission.json')
  try {
    await expect(openProfileJournal(f.ctx, 10, { ...policy, mode: 'reopen' })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    const record = { desktopId: policy.desktopId, deviceId: f.policy.deviceId, sessionId: 'owner-session', requestId: 'owner-request', fingerprint: 'FIXTURE_PRIVATE_INTENT', state: 'submitting' }
    const valid = { unit: { name: 'harmony_mobile_admission', version: 1 }, global: { state: 'ready', desktopId: policy.desktopId, profileId: policy.profileId }, tables: { admissions: { 'owner-session/owner-request': record } } }
    const invalid = [
      'broken-json',
      JSON.stringify({ ...valid, unit: { ...valid.unit, version: 2 } }),
      JSON.stringify({ ...valid, global: { ...valid.global, profileId: 'foreign-profile' } }),
      JSON.stringify({ ...valid, global: { state: 'uninitialized' } }),
      JSON.stringify({ ...valid, tables: { admissions: { 'wrong-key': record } } }),
      JSON.stringify({ ...valid, tables: { admissions: { 'owner-session/owner-request': { ...record, desktopId: 'foreign-desktop' } } } }),
      JSON.stringify({ ...valid, tables: { admissions: { 'owner-session/owner-request': { ...record, secret: 'FIXTURE_PRIVATE_TOKEN' } } } }),
    ]
    for (const bytes of invalid) {
      await writeFile(path, bytes); const outcome = await openProfileJournal(f.ctx, 10, policy).then(value => { void value.close(); throw new Error('fixture unexpectedly opened invalid journal') }, error => error)
      expect(deviceCommandFailure(new DeviceCommandStepError('journal-open', outcome, false), false)).not.toContain('FIXTURE_PRIVATE')
      expect(await readFile(path, 'utf8')).toBe(bytes)
    }
    await writeFile(path, JSON.stringify(valid)); const recovered = await openProfileJournal(f.ctx, 10, policy)
    await expect(recovered.journal.claim({ ...record, desktopId: id<'mobile-desktop'>('foreign-desktop'), deviceId: id<'mobile-device'>(record.deviceId), sessionId: id<'SessionId'>(record.sessionId), requestId: id<'session-request-id'>(record.requestId), state: 'submitting' })).rejects.toMatchObject({ code: 'scope-denied' }); await recovered.close()
  } finally { await f.close() }
})

it('admission journal lifecycle retains the first error and refuses reuse when closing is uncertain', async () => {
  const f = await fixture('journal-managed-cleanup'), policy = { mode: 'create-or-reopen' as const, desktopId: id<'mobile-desktop'>(f.policy.desktopId), profileId: id<'mobile-profile'>('desktop') }
  const backend = f.ctx.storage.backend.get('json').kv!, original = backend.open.bind(backend), primary = new LinkError('unknown-outcome')
  const stub = vi.spyOn(backend, 'open').mockImplementationOnce(async descriptor => {
    const unit = await original(descriptor), close = unit.close.bind(unit)
    vi.spyOn(unit, 'setGlobal').mockRejectedValueOnce(primary)
    vi.spyOn(unit, 'close').mockImplementationOnce(async () => { await close(); throw new Error('FIXTURE_PRIVATE_CLEANUP') })
    return unit
  })
  try {
    const outcome = await openProfileJournal(f.ctx, 10, policy).catch(error => error)
    expect(outcome).toBeInstanceOf(DeviceCommandStepError); expect(outcome.cause).toBe(primary); expect(outcome.cleanupFailed).toBe(true)
    expect(deviceCommandFailure(outcome, false)).toContain('journal-open/link-unknown-outcome'); expect(deviceCommandFailure(outcome, false)).not.toContain('FIXTURE_PRIVATE')
    stub.mockRestore(); await expect(openProfileJournal(f.ctx, 10, policy)).rejects.toMatchObject({ code: 'already-open' })
  } finally { stub.mockRestore(); await f.close() }
})


it('admission journal lifecycle retries initialization only after a clean failed-write close', async () => {
  const f = await fixture('journal-clean-failed-write'), policy = { mode: 'create-or-reopen' as const, desktopId: id<'mobile-desktop'>(f.policy.desktopId), profileId: id<'mobile-profile'>('desktop') }, backend = f.ctx.storage.backend.get('json').kv!, original = backend.open.bind(backend), primary = new LinkError('unknown-outcome')
  const stub = vi.spyOn(backend, 'open').mockImplementationOnce(async descriptor => { const unit = await original(descriptor); vi.spyOn(unit, 'setGlobal').mockRejectedValueOnce(primary); return unit })
  try {
    await expect(openProfileJournal(f.ctx, 10, policy)).rejects.toBe(primary)
    stub.mockRestore(); const retry = await openProfileJournal(f.ctx, 10, policy); await retry.close()
  } finally { stub.mockRestore(); await f.close() }
})


it('paired startup reuses saved devices after retired windows and reconnects without another route exchange', async () => {
  const f = await fixture('paired-startup'), sockets: WebSocket[] = [], audit: string[] = []
  let app: NativeDeviceProductFacade | undefined, relay: RelayApplication | undefined, stop: (() => Promise<void>) | undefined, routes: DeviceRouteOwner | undefined
  try {
    const binding = await f.bind(), pairId = deviceRelayPairId(binding), published = await publicRouteFixture(f, binding)
    routes = routesFor(f, 'retired-personal-window')
    const offer = await routes.offer(f.authority, 60000), signature = nodeE2EPrimitives.encode(await phoneKey.sign(deviceRouteReplyBytes(offer))), oldRoute = await routes.confirm(f.authority, { schema: 'harmony-device-route/1', offer, signature })
    await maintainDeviceRoutes(true, 'register', published.configuration, oldRoute, routeIo)
    await maintainDeviceRoutes(true, 'revoke-route', published.configuration, oldRoute, routeIo)
    const before = await readFile(published.configuration.deviceRoutes.path)
    const configuration = { ...published.configuration, pairedDevices: true, pairTimeoutMs: 10000, maxRoomTtlMs: 60000, maxFrameBytes: 2097152, maxBufferedBytes: 4194304, maxFrames: 4096, idleTimeoutMs: 60000, broker: { ...published.configuration.broker, challengeTtlMs: 10000, roomTtlMs: 60000, maxChallengesPerConnection: 64, maxRoomIssuesPerWindow: 32, maxOwnerRoomIssues: 64 } }
    relay = await openRelayApplication(configuration, {}, Date.now, fixtureSource(), routeIo)
    if (relay === undefined) throw new Error('paired fixture relay missing')
    await relay.start()
      const target = id<'SessionId'>('paired-existing-session'), other = id<'SessionId'>('paired-other-session'); await f.ctx.sessionController.create({ sessionId: target, cwd: f.world }); await f.ctx.sessionController.create({ sessionId: other, cwd: f.world })
    const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')), budgets = { ...base.relay, maxRoomTtlMs: 60000 }
    const scheduler = { after: (ms: number, callback: () => void) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
    let agreement = 30, acquisitions = 0
    const ports = (role: 'desktop' | 'phone') => {
      const ws = (path: string, protocol: string, headers: Record<string, string>) => { const socket = new WebSocket('ws://127.0.0.1:' + relay!.port() + path, protocol, { headers: { Host: binding.audience, ...headers }, perMessageDeflate: false }); socket.on('error', error => audit.push(role + ':socket-' + ('code' in error ? String(error.code) : error.name))); socket.once('upgrade', () => audit.push(role + path + ':101')); socket.once('unexpected-response', (_request, response) => { audit.push(role + path + ':' + response.statusCode); response.resume(); socket.terminate() }); sockets.push(socket); return socket }
      return { control: nodeRelaySocket(ws('/harmony/relay/control/v1', 'harmony-relay-control-v1', { 'X-DSH-Relay-Pair': pairId, 'X-DSH-Relay-Role': role }), 64, false), signer: role === 'desktop' ? desktopKey : phoneKey, primitives: nodeE2EPrimitives, remotePublicSpki: (role === 'desktop' ? phoneKey : desktopKey).publicSpki, scheduler, clock: Date.now, controlDiagnostic: (stage: ControlDiagnostic) => { audit.push(role + ':' + stage) }, diagnostic: (stage: E2EDiagnostic) => { audit.push(role + ':' + stage) }, agreement: async () => { const n = ++agreement; return { key: new ImportedP256Agreement(fixtureKey(n).pkcs8), nonce: Buffer.alloc(32, n) } }, data: async (lease: { receipt: { token: string; room: string } }) => nodeRelaySocket(ws('/harmony/relay/v1', 'dsh-relay-v1', { Authorization: 'Bearer ' + lease.receipt.token, 'X-DSH-Relay-Room': lease.receipt.room, 'X-DSH-Relay-Role': role }), 64) }
    }
      const views: Array<{ connection: string; selected: string; readOnly: boolean; error: string; sessions: Array<{ sessionId: string }> }> = []
    app = new NativeDeviceProductFacade(f.native, JSON.stringify({ ...base.core, enabled: true }), binding.identityAlias, binding.audience, Date.now() + 120000, budgets, { read: async () => JSON.stringify(binding), write: async () => { throw new Error('saved pairing must not be rewritten') }, close: async () => {} }, { signer: phoneKey, primitives: nodeE2EPrimitives }, scheduler, Date.now, async raw => { expect(JSON.parse(raw).schema).toBe('harmony-device-binding/1'); acquisitions++; const value = ports('phone'); return { ports: value, open: async () => {}, authenticated: () => {}, close: async () => value.control.terminate() } }, raw => views.push(JSON.parse(raw)), 50, undefined, true)
    await app.boot(); expect(app.routeReady()).toBe(true)
    const provider = new DeviceBindingProfileProvider(f.ctx, Date.now), options = { enabled: true, desktopId: binding.desktopId, profileId: 'desktop', journalMode: 'create' as const }; await f.ctx.plugin(Desktop, options)
    const limits = Desktop.resolveOptions(options, Date.now).limits
    const mount = () => new DeviceBindingDesktopRelay(f.owner, provider, { paired: binding, desktopId: binding.desktopId, isRouteCurrent: async () => true, trust: { pairId, epoch: binding.epoch, role: 'desktop', audience: binding.audience, credentialId: id<'harmony-device-credential'>(binding.desktopCredentialId), expiresAt: Date.now() + 120000 }, policy: budgets, limits, openPorts: () => ports('desktop') }).mount(f.ctx)
    stop = await mount(); await app.connect(true).catch(error => { throw new Error('paired wire: ' + audit.slice(-32).join(' > '), { cause: error }) })
    expect(views.at(-1)?.sessions.some(row => row.sessionId === target)).toBe(true)
      for (const selected of [target, other, target]) {
        await app.select(selected)
        await expect.poll(() => views.at(-1)?.readOnly).toBe(false)
        expect(views.at(-1)?.selected).toBe(selected); expect(views.at(-1)?.error).toBe('')
      }
    await app.stopRoute(); await stop(); stop = await mount(); await app.connect(true).catch(error => { throw new Error('paired wire: ' + audit.slice(-32).join(' > '), { cause: error }) })
    expect(views.at(-1)?.connection).toBe('connected'); expect(acquisitions).toBe(2)
    expect(await readFile(published.configuration.deviceRoutes.path)).toEqual(before)
    expect(await f.storage.read()).toBe(JSON.stringify(binding))
  } finally { await app?.close(); await stop?.(); for (const socket of sockets) socket.terminate(); await relay?.close(); await routes?.close(); await f.close() }
})

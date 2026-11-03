/** Local emulator connection owner. Loaded only by the installed desktop profile. */
import type { Context } from '@deepseek-ai/cordis'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { createServer } from 'node:https'
import { connect } from 'node:net'
import WebSocket from 'ws'
import { z } from 'zod'
import { DesktopIdentitySigner, DesktopIdentityError } from '../desktop-plugin/src/identity.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { CredentialDeviceBindingStorage } from '../desktop-plugin/src/device-binding-storage.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { deviceProfileSessionPorts, DeviceBindingProfileProvider } from '../desktop-plugin/src/device-binding-profile.ts'
import { DeviceBindingDesktopRelay } from '../desktop-plugin/src/device-binding-relay.ts'
import * as Desktop from '../desktop-plugin/src/index.ts'
import { StandaloneRelay, freshRelayIssueSource } from '../standalone-relay/src/host.ts'
import { resolveRelayConfig } from '../standalone-relay/src/config.ts'
import { nodeRelaySocket } from '../integration/relay-upgrade.ts'
import { freshNodeAgreement, nodeE2EPrimitives } from '../integration/p256-channel.ts'
import { deviceRelayPairId } from '../src/device-binding-protocol.ts'
import { id } from '../src/protocol.ts'
import { AutomaticConnection } from '../src/automatic-connection.ts'
import product from '../product.config.json' with { type: 'json' }

export const name = 'harmony-emulator-local'
export const inject = ['credentials', 'sessionController', 'sessionPersistence', 'connection', 'remoteAccess', 'profileContext', 'typert', 'typertGateway', 'richInline', 'agents', 'workspaceRegistry', 'storageDomain']
const settings = z.object({ directory: z.string(), port: z.number().int().min(1024).max(65535), roomTtlMs: z.number().int().positive().max(600000).default(540000) }).strict()
const command = z.discriminatedUnion('operation', [
  z.object({ seq: z.number().int().positive(), operation: z.enum(['status', 'binding', 'connect']) }).strict(),
  z.object({ seq: z.number().int().positive(), operation: z.literal('offer'), phone: z.object({ identityAlias: z.literal('dsh-emulator'), publicSpki: z.string(), credentialId: z.string() }).strict() }).strict(),
  z.object({ seq: z.number().int().positive(), operation: z.literal('confirm'), reply: z.unknown() }).strict(),
  z.object({ seq: z.number().int().positive(), operation: z.literal('create-test-session') }).strict(),
])
const budgets = { ...product.relay, maxProofs: 256, e2e: { ...product.relay.e2e, maxFrames: 65536 } }

/** @param ctx - installed desktop services with an isolated credentials provider. @param input - task-owned directory and loopback TLS port. @returns after the local file controller is installed. */
export async function apply(ctx: Context, input: unknown): Promise<void> {
  try { await startPlugin(ctx, input) }
  catch (error) {
    const config = settings.parse(input)
    const failures: string[] = []
    for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) failures.push(cause.message)
    await writeFile(join(config.directory, 'startup-failure.json'), JSON.stringify({ failures }, null, 2) + '\n')
    throw error
  }
}
async function startPlugin(ctx: Context, input: unknown): Promise<void> {
  const config = settings.parse(input)
  if (ctx.profileContext.name !== 'desktop') throw new Error('Emulator requires desktop profile')
  const authority = {}, alias = 'dsh-emulator-desktop', desktopId = 'local-emulator-desktop', deviceId = 'local-emulator-phone'
  const protection = new WindowsCurrentUserProtection({ timeoutMs: 10000 })
  let signer: DesktopIdentitySigner
  try { signer = await DesktopIdentitySigner.open(ctx, authority, authority, alias, protection) }
  catch (error) {
    if (!(error instanceof DesktopIdentityError) || error.code !== 'absent') throw error
    await DesktopIdentitySigner.initialize(ctx, authority, authority, alias, true, protection)
    signer = await DesktopIdentitySigner.open(ctx, authority, authority, alias, protection)
  }
  const storage = new CredentialDeviceBindingStorage(ctx, desktopId, deviceId)
  const scheduler = { after: (ms: number, fn: () => void) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer) } }
  const owner = new DeviceBindingOwner(authority, { desktopId, profileId: 'desktop', deviceId, identityAlias: 'dsh-emulator', audience: 'localhost', enrollmentTtlMs: 600000, connectionTtlMs: 600000, challengeTtlMs: 15000, maxChallenges: 100000, maxCatalogRows: 10000, maxPublicBytes: 524288 }, storage, signer, deviceProfileSessionPorts(ctx), Date.now, { id: randomUUID, nonce: () => randomBytes(32).toString('base64url') }, scheduler)
  let stop: (() => Promise<void>) | undefined, relay: StandaloneRelay | undefined, tls: ReturnType<typeof createServer> | undefined
  let state = 'unpaired', seen = 0, running = false, closed = false, testSession = ''
  let automatic: AutomaticConnection | undefined
  const sockets = new Set<import('node:stream').Duplex>()
  const atomic = async (file: string, value: unknown) => { const path = join(config.directory, file); await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path) }
  const start = async () => {
    if (stop !== undefined) return
    const binding = await owner.publicRecord(authority)
    if (binding === null || binding.revoked) return
    const pairId = deviceRelayPairId(binding)
    const relayConfiguration = resolveRelayConfig({ enabled: true, host: '127.0.0.1', port: 0, publicHost: 'localhost', nativeOrigin: 'networkkit-v1', sweepIntervalMs: 1000, maxControlFrames: 256, maxConnections: 16, shutdownTimeoutMs: 5000, requestTimeoutMs: 10000, headersTimeoutMs: 5000, connectionCheckIntervalMs: 1000, maxHeaderBytes: 8192, maxRooms: 8, maxRoomTtlMs: 600000, pairTimeoutMs: 10000, maxFrameBytes: budgets.e2e.maxFrameBytes, maxBufferedBytes: budgets.maxQueuedBytes, maxFrames: 65536, idleTimeoutMs: 60000, broker: { enabled: true, pairs: [{ pairId, desktopPublicSpki: binding.desktopPublicSpki, phonePublicSpki: binding.phonePublicSpki, epoch: binding.epoch, expiresAt: Number.MAX_SAFE_INTEGER - 1, revoked: false }], maxPairs: 1, challengeTtlMs: 10000, roomTtlMs: config.roomTtlMs, maxChallengesPerConnection: 256, maxRoomIssuesPerWindow: 32, issueWindowMs: 60000, maxOwnerRoomIssues: 100000, maxControlPayloadBytes: 65536, maxControlQueuedBytes: budgets.maxQueuedBytes } })
    if (!relayConfiguration.enabled) throw new Error('Local relay disabled')
    // The credential owner has verified the persisted binding before constructing the local broker.
    relay = new StandaloneRelay({ ...relayConfiguration, pairedDevices: true }, authority, Date.now, () => { state = 'failed' }, freshRelayIssueSource())
    await relay.start()
    const ca = await readFile(join(config.directory, 'localhost.crt'))
    tls = createServer({ key: await readFile(join(config.directory, 'localhost.key')), cert: ca, minVersion: 'TLSv1.2', maxHeaderSize: 8192 }, (_request, response) => { response.writeHead(404); response.end() })
    tls.on('upgrade', (request, socket, head) => {
      void atomic('upgrade.json', { host: request.headers.host, origin: request.headers.origin, role: request.headers['x-dsh-relay-role'], path: request.url, protocol: request.headers['sec-websocket-protocol'], pairMatches: request.headers['x-dsh-relay-pair'] === pairId, cookiePresent: request.headers.cookie !== undefined, authPresent: request.headers.authorization !== undefined, fetchMode: request.headers['sec-fetch-mode'], fetchSite: request.headers['sec-fetch-site'] })
      if (!['localhost', 'localhost:18081'].includes(request.headers.host ?? '') || request.headers.origin !== undefined && !['https://localhost:18081', 'https://localhost'].includes(request.headers.origin)) { socket.destroy(); return }
      const upstream = connect(relay!.port(), '127.0.0.1'); sockets.add(socket); sockets.add(upstream)
      upstream.once('data', data => { const status = data.toString('ascii').split('\r\n')[0]; void atomic('upgrade-response.json', { role: request.headers['x-dsh-relay-role'], status }) })
      socket.once('close', () => { sockets.delete(socket); upstream.destroy() }); upstream.once('close', () => { sockets.delete(upstream); socket.destroy() })
      socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy())
      const headers: string[] = []
      for (let i = 0; i < request.rawHeaders.length; i += 2) { const key = request.rawHeaders[i]!, value = request.rawHeaders[i + 1]!; headers.push(key + ': ' + (key.toLowerCase() === 'host' ? 'localhost' : key.toLowerCase() === 'origin' ? 'https://localhost' : value)) }
      upstream.write(request.method + ' ' + request.url + ' HTTP/1.1\r\n' + headers.join('\r\n') + '\r\n\r\n'); if (head.length) upstream.write(head)
      socket.pipe(upstream); upstream.pipe(socket)
    })
    tls.on('tlsClientError', () => {})
    await new Promise<void>((resolve, reject) => { tls!.once('error', reject); tls!.listen(config.port, '127.0.0.1', () => { tls!.off('error', reject); resolve() }) })
    const ws = (path: string, protocol: string, headers: Record<string, string>) => {
      const socket = new WebSocket('wss://localhost:' + config.port + path, protocol, { ca, rejectUnauthorized: true, headers: { Host: 'localhost', ...headers }, perMessageDeflate: false, handshakeTimeout: 10000, maxPayload: budgets.e2e.maxFrameBytes })
      socket.on('error', () => socket.terminate()); return socket
    }
    const provider = new DeviceBindingProfileProvider(ctx, Date.now)
    const options = { enabled: true, desktopId, profileId: 'desktop', journalMode: 'create-or-reopen' as const, maxPacketBytes: product.core.transport.maxPacketBytes, snapshotMaxBytes: product.core.domain.maxBytes, snapshotMaxRecords: product.core.domain.maxEvents }
    await ctx.plugin(Desktop, options)
    let carrierContext: Context | undefined
    await ctx.inject(['harmonyDesktop'], inner => { carrierContext = inner; inner.effect(() => () => automatic?.stop()) })
    if (carrierContext === undefined) throw new Error('Local session executor unavailable')
    const sessionContext = carrierContext
    let lifecycle: DeviceBindingDesktopRelay | undefined
    const mount = async () => { await stop?.(); lifecycle = new DeviceBindingDesktopRelay(owner, provider, { paired: binding, desktopId, isRouteCurrent: async () => JSON.stringify(await owner.publicRecord(authority)) === JSON.stringify(binding), trust: { pairId, epoch: binding.epoch, role: 'desktop', audience: 'localhost', credentialId: id<'harmony-device-credential'>(binding.desktopCredentialId), expiresAt: Date.now() + 86400000 }, policy: budgets, limits: Desktop.resolveOptions(options, Date.now).limits, openPorts: () => ({ control: nodeRelaySocket(ws('/harmony/relay/control/v1', 'harmony-relay-control-v1', { 'X-DSH-Relay-Pair': pairId, 'X-DSH-Relay-Role': 'desktop' }), 256, false), signer, primitives: nodeE2EPrimitives, remotePublicSpki: binding.phonePublicSpki, scheduler, clock: Date.now, agreement: async () => ({ key: freshNodeAgreement(), nonce: randomBytes(32) }), data: async lease => nodeRelaySocket(ws('/harmony/relay/v1', 'dsh-relay-v1', { Authorization: 'Bearer ' + lease.receipt.token, 'X-DSH-Relay-Room': lease.receipt.room, 'X-DSH-Relay-Role': 'desktop' }), 256) }) }); stop = await lifecycle.mount(sessionContext) }
    automatic = new AutomaticConnection({ available: () => !closed, connected: () => lifecycle !== undefined && lifecycle.terminalState === undefined, connect: mount, disconnect: async () => { await stop?.(); stop = undefined }, failed: () => { state = 'retrying' } }, scheduler, 5000)
    await automatic.start(); state = 'listening'
  }
  const poll = async () => {
    if (closed || running) return
    running = true
    try {
      let raw: string
      try { raw = await readFile(join(config.directory, 'request.json'), 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
      const request = command.parse(JSON.parse(raw)); if (request.seq <= seen) return; seen = request.seq
      try {
        let value: unknown = { state, testSession, roomTtlMs: config.roomTtlMs }
        if (request.operation === 'binding') value = await owner.publicRecord(authority)
        if (request.operation === 'connect') { await start(); value = { state } }
        if (request.operation === 'offer') { await owner.cancelOffer(authority); value = await owner.offer(authority, request.phone) }
        if (request.operation === 'confirm') { value = await owner.confirm(authority, request.reply, async () => true); await start() }
        if (request.operation === 'create-test-session') {
          if (testSession !== '') throw new Error('Test session already created')
          const result = await ctx.sessionController.create({ cwd: config.directory }); testSession = result.sessionId; value = { sessionId: testSession }
        }
        await atomic('response.json', { seq: request.seq, ok: true, state, value })
      } catch (error) { const causes: string[] = []; for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) causes.push(cause.message); await atomic('response.json', { seq: request.seq, ok: false, error: error instanceof Error ? error.message : 'Local emulator operation failed', causes }) }
    } finally { running = false }
  }
  try { seen = command.parse(JSON.parse(await readFile(join(config.directory, 'request.json'), 'utf8'))).seq } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const timer = setInterval(() => { void poll().catch(error => { void atomic('failure.json', { error: error.message }) }) }, 500)
  ctx.effect(() => async () => { closed = true; clearInterval(timer); await automatic?.stop(); await stop?.(); for (const socket of sockets) socket.destroy(); if (tls?.listening) await new Promise<void>(resolve => tls!.close(() => resolve())); await relay?.close(); await owner.close(); signer.close() })
  state = await owner.publicRecord(authority) === null ? 'unpaired' : 'bound'; await atomic('ready.json', { state, port: config.port, roomTtlMs: config.roomTtlMs, isolatedCredentials: true })
}

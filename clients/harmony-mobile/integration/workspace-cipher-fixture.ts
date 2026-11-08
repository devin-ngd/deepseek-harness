/** Synthetic device registration and opaque frame bridge for actual native crypto; no HUKS or saved pairing is read. */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { desktopKey, phoneKey, fixtureSource, hostConfig } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { DeviceBindingClient } from '../src/device-binding-client.ts'
import { DeviceBindingDesktopRelay, type DeviceWorkspaceProvider } from '../desktop-plugin/src/device-binding-relay.ts'
import { DeviceBindingProfileProvider, deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import { DeviceWorkspaceAccess } from '../desktop-plugin/src/workspace-access.ts'
import { WorkspaceError } from '../desktop-plugin/src/workspace-channel.ts'
import { workspaceRequestSchema, type WorkspaceRequest } from '../src/workspace-protocol.ts'
import { workspaceDiagnosticOperation } from '../src/workspace-diagnostic.ts'
import { WorkspaceMemoryRelay, type WorkspaceWssTls } from './workspace-memory-relay.ts'
import { startWorkspaceStandaloneWss, type WorkspaceStandaloneWssInputs } from './workspace-standalone-wss.ts'
import type { openDesktopWssPorts } from './desktop-wss.ts'
import { deviceRelayPairId } from '../src/device-binding-protocol.ts'
import { resolveOptions } from '../desktop-plugin/src/index.ts'
import { deviceSnapshotMaxBytes } from '../desktop-plugin/src/session-window.ts'
import { id } from '../src/protocol.ts'
import type { PairedRelayPolicy } from '../src/paired-relay.ts'
import type { EndpointRelayTrust } from '../src/relay-control-client.ts'
import type { RelaySocket } from './relay-core.ts'
import type { CleanupScheduler } from './connection-lifetime.ts'
import type { DeviceSessionAction } from '../src/device-session-directory.ts'

/** Test broker lifetime and independent workspace-grant selection; neither changes the product policy. */
export interface WorkspaceCipherFixtureOptions {
  readonly roomTtlMs?: number
  readonly grantWorkspace?: boolean
  readonly catalogRows?: number
  readonly persistedCatalogRows?: number
  readonly maxChunkBytes?: number
  readonly dataOneWayDelayMs?: number
  readonly desktopRelayCaps?: { readonly maxPlaintextBytes: number; readonly maxFrameBytes: number; readonly maxQueuedBytes: number }
  readonly wireMaxRequestBytes?: number
  readonly rpcDiagnostics?: boolean
  readonly packagedDesktopRelay?: string
  readonly packagedWorkspaceAccess?: boolean
  readonly sourceWorkspaceAccess?: boolean
  readonly hostStdoutProbe?: boolean
  readonly traceWorkspaceRequests?: boolean
  readonly observeWorkspaceResult?: (request: WorkspaceRequest, result: unknown) => void
  readonly nativeWssTls?: WorkspaceWssTls
  readonly standaloneWss?: WorkspaceStandaloneWssInputs
  readonly reconnectReview?: boolean
  readonly creationAckLoss?: boolean
  readonly revocationReview?: boolean
}

const frame = z.object({ bytes: z.string().max(12 * 1024 * 1024), binary: z.boolean() }).strict()
const inputSchema = z.object({ channel: z.enum(['control', 'data']), frames: z.array(frame).max(64),
  join: z.object({ room: z.string().max(256), token: z.string().max(256) }).strict().optional() }).strict()
interface Carrier { socket: RelaySocket; frames: z.infer<typeof frame>[]; bytes: number; closed: boolean; stop(): void }
const memory = () => {
  let raw: string | null = null
  return { read: async () => raw, compareAndSet: async (previous: string | null, next: string) => { assert.equal(raw, previous); raw = next } }
}

/** @param parent - isolated replay profile. @param policy - exact deployment frame capacities. @param shellIndex - sealed workspace entry. @param fixture - explicit test lifetime and grant selection. @returns owned test carrier and public synthetic bootstrap. */
export async function createWorkspaceCipherFixture(parent: Context, policy: PairedRelayPolicy, shellIndex: string, fixture: WorkspaceCipherFixtureOptions = {}) {
  if (fixture.hostStdoutProbe === true) assert.ok(fixture.packagedDesktopRelay !== undefined && fixture.nativeWssTls === undefined)
  if (fixture.traceWorkspaceRequests === true) assert.ok(fixture.packagedDesktopRelay !== undefined && fixture.standaloneWss?.nativeDevicePort === 18083)
  if (fixture.observeWorkspaceResult !== undefined) assert.ok(!fixture.rpcDiagnostics)
  if (fixture.standaloneWss !== undefined) assert.ok(fixture.packagedDesktopRelay !== undefined && fixture.nativeWssTls === undefined
    && (fixture.hostStdoutProbe === true || fixture.standaloneWss.nativeDevicePort === 18083))
  if (fixture.reconnectReview === true) assert.ok(fixture.standaloneWss?.nativeDevicePort === 18083 && fixture.grantWorkspace !== false && fixture.rpcDiagnostics !== true)
  if (fixture.creationAckLoss === true) assert.ok(fixture.reconnectReview === true && !fixture.revocationReview)
  if (fixture.revocationReview === true) assert.ok(fixture.standaloneWss?.nativeDevicePort === 18083 && fixture.grantWorkspace !== false && !fixture.reconnectReview && !fixture.rpcDiagnostics)
  const maxChunkBytes = fixture.maxChunkBytes ?? 65536, wireMaxRequestBytes = fixture.wireMaxRequestBytes ?? 2097152
  const caps = fixture.desktopRelayCaps
  const desktopPolicy: PairedRelayPolicy = caps === undefined ? policy : { ...policy, maxQueuedBytes: caps.maxQueuedBytes,
    e2e: { ...policy.e2e, maxFrameBytes: caps.maxFrameBytes, maxPlaintextBytes: caps.maxPlaintextBytes } }
  assert.ok(Math.ceil(maxChunkBytes * 4 / 3) + 256 <= desktopPolicy.e2e.maxPlaintextBytes && wireMaxRequestBytes <= desktopPolicy.e2e.maxPlaintextBytes)
  const profile = parent.get('profileContext'); assert.ok(profile)
  assert.equal(profile.name, 'workspace-review')
  const ctx = parent.isolate('profileContext')
  ctx.provide('profileContext', { ...profile, name: 'desktop' })
  const clock = () => Date.now(), authority = {}, native = {}
  const scheduler: CleanupScheduler = { after: (ms, run) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer) } }
  const stops: Array<() => void | Promise<void>> = []
  const carriers = new Map<string, Carrier>()
  let sentFrames = 0, receivedFrames = 0, receivedBytes = 0, sentMaxFrameBytes = 0, receivedMaxFrameBytes = 0, closed = false
  const close = async () => {
    if (closed) return
    closed = true
    const results = await Promise.allSettled([...carriers.values()].map(async value => { value.stop(); value.socket.terminate() }))
    for (const stop of stops.reverse()) { try { await stop() } catch (error) { results.push({ status: 'rejected', reason: error }) } }
    if (results.some(result => result.status === 'rejected')) throw new Error('cipher fixture cleanup failed')
  }
  try {
    const nativeWss = fixture.nativeWssTls !== undefined || fixture.standaloneWss?.nativeDevicePort !== undefined
    const options = { desktopId: 'workspace-cipher-desktop', deviceId: 'workspace-cipher-phone', profileId: 'desktop' as const,
      identityAlias: 'workspace-public-fixture-key', audience: nativeWss ? '127.0.0.1' : 'relay.example', enrollmentTtlMs: 60000,
      connectionTtlMs: 1200000, challengeTtlMs: 10000, maxChallenges: 128, maxCatalogRows: 512, maxPublicBytes: 524288 }
    const sessions = deviceProfileSessionPorts(ctx), managedActions: DeviceSessionAction[] = []
    let desktopControl: RelaySocket | undefined, lostCreationAck: string | undefined
    const creationOptions = await sessions.creationOptions!(new AbortController().signal)
    const preflight = { sessions: await sessions.list(new AbortController().signal), projects: await sessions.projects!(new AbortController().signal) }
    if (fixture.persistedCatalogRows !== undefined) {
      assert.equal(preflight.sessions.length, fixture.persistedCatalogRows, 'The installed provider must discover all cold fixtures without padding')
      const stored = await ctx.sessionPersistence.list()
      assert.equal(stored.length, fixture.persistedCatalogRows)
      assert.ok(stored.every(row => (row.sizeBytes ?? 0) > 0))
      const coldRows = preflight.sessions.filter(row => row.sessionId.startsWith('workspace-cold-'))
      assert.equal(coldRows.length, fixture.persistedCatalogRows - 1)
      assert.ok(coldRows.every(row => !row.running && ctx.sessions.get(id<'SessionId'>(row.sessionId)) === undefined))
      console.info('WORKSPACE_CIPHER_DIRECTORY_PREFLIGHT ' + JSON.stringify({ persistedRows: stored.length, projects: preflight.projects.length }))
    } else console.info('WORKSPACE_CIPHER_DIRECTORY_PREFLIGHT ' + JSON.stringify(preflight))
    let catalogScans = 0, catalogTotalMs = 0, catalogMaxMs = 0, catalogPeakRows = preflight.sessions.length
    const owner = new DeviceBindingOwner(authority, options, memory(), desktopKey, { ...sessions, list: async signal => {
      const start = performance.now()
      const rows = await sessions.list(signal), count = fixture.catalogRows ?? rows.length
      const elapsed = performance.now() - start
      catalogScans++; catalogTotalMs += elapsed; catalogMaxMs = Math.max(catalogMaxMs, elapsed)
      catalogPeakRows = Math.max(catalogPeakRows, rows.length)
      assert.ok(Number.isSafeInteger(count) && count >= rows.length && count <= options.maxCatalogRows)
      return [...rows, ...Array.from({ length: count - rows.length }, (_, i) => ({ profileId: 'desktop' as const, sessionId: 'cipher-synthetic-' + i,
        title: 'Synthetic visible Session ' + i, projectId: null, updatedAt: 0, running: false, pinned: false, archived: false, blank: true }))]
    }, manage: async (action, signal) => {
      managedActions.push(action)
      const result = await sessions.manage!(action, signal)
      if (fixture.creationAckLoss === true && action.action === 'create') {
        assert.ok(desktopControl && lostCreationAck === undefined)
        await ctx.sessionPersistence.flush()
        lostCreationAck = result.sessionId
        desktopControl.terminate()
        signal.throwIfAborted()
        await new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      }
      return result
    } }, clock, fixtureSource(), scheduler)
    stops.push(() => owner.close())
    const phone = new DeviceBindingClient(native, { ...options, desktopCredentialId: p256CredentialId(desktopKey.publicSpki),
      maxProofs: policy.maxProofs, maxChallengeTtlMs: policy.maxChallengeTtlMs }, memory(), phoneKey, nodeE2EPrimitives, clock)
    stops.push(() => phone.close())
    const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    const record = await owner.confirm(authority, JSON.parse(await phone.signOffer(native, JSON.stringify(offer), true)), async () => true)
    const workspaceTtlMs = 1200000
    const makeAccess = (Access: typeof DeviceWorkspaceAccess) => new Access(ctx, authority, owner, { ttlMs: workspaceTtlMs,
      channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
      wire: { maxChunkBytes, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: wireMaxRequestBytes },
      shell: { distIndex: shellIndex, limits: { maxFiles: 2000, maxFileBytes: 16777216, maxTotalBytes: 134217728 } },
    }, clock, scheduler)
    const diagnosticFaults: Array<{ failure: 'host-rejected' | 'timeout'; cancelled: boolean; elapsedMs: number }> = []
    let diagnosticError = WorkspaceError
    const standalone = fixture.standaloneWss === undefined ? undefined : await startWorkspaceStandaloneWss(record, desktopPolicy, scheduler, {
      ...fixture.standaloneWss, ...(fixture.dataOneWayDelayMs === undefined ? {} : { desktopDataOneWayDelayMs: fixture.dataOneWayDelayMs }),
    })
    const relay = standalone === undefined ? new WorkspaceMemoryRelay(record, policy, clock, scheduler, { challengeTtlMs: 10000, roomTtlMs: fixture.roomTtlMs ?? 300000 }, fixture.dataOneWayDelayMs) : undefined
    if (standalone !== undefined) stops.push(standalone.close)
    if (relay !== undefined) stops.push(() => relay.close())
    const localWss = fixture.nativeWssTls === undefined ? undefined : await relay!.listenNativeWss(fixture.nativeWssTls, policy.e2e.maxFrameBytes)
    if (localWss !== undefined) stops.push(localWss.close)
    const wss = standalone?.nativeWss ?? localWss
    const provider = new DeviceBindingProfileProvider(ctx, clock); stops.push(() => provider.close())
    assert.equal(ctx.get('harmonyDesktop'), undefined, 'The isolated profile starts without the default-disabled desktop executor')
    const desktopLib = join(dirname(dirname(shellIndex)), 'lib')
    const desktopModule = await import(pathToFileURL(join(desktopLib, 'index.js')).href) as typeof import('../desktop-plugin/src/index.ts')
    const executor = ctx.plugin(desktopModule, {
      enabled: true, relayEnabled: false, desktopId: record.desktopId, profileId: 'desktop', journalMode: 'create',
      snapshotMaxBytes: deviceSnapshotMaxBytes(desktopPolicy.e2e, desktopPolicy.e2e.maxFrameBytes),
    })
    stops.push(() => executor.dispose()); await executor
    assert.ok(ctx.get('harmonyDesktop'), 'The sealed desktop package must mount the native Session executor')
    console.info('WORKSPACE_CIPHER_NATIVE_EXECUTOR_MOUNTED')
    let relayContext: Context | undefined
    const injected = ctx.inject(['harmonyDesktop'], inner => { relayContext = inner })
    stops.push(() => injected.dispose()); await injected
    assert.ok(relayContext, 'Native transport must declare its executor dependency')
    const transportContext = relayContext
    let Relay = DeviceBindingDesktopRelay
    let Access = DeviceWorkspaceAccess
    let sealedDesktopPorts: typeof openDesktopWssPorts | undefined
    if (fixture.packagedDesktopRelay !== undefined) {
      const packaged = await import(pathToFileURL(join(desktopLib, 'device.js')).href) as typeof import('../desktop-plugin/src/device-binding-command.ts')
      assert.equal(packaged.name, '@deepseek-ai/dsh-experimental-harmony-mobile/device')
      await packaged.apply(transportContext)
      const extracted = (standalone === undefined ? await import(pathToFileURL(fixture.packagedDesktopRelay).href) : await standalone.desktopModule(fixture.packagedDesktopRelay)) as {
        DeviceBindingDesktopRelay: typeof DeviceBindingDesktopRelay; DeviceWorkspaceAccess?: typeof DeviceWorkspaceAccess
        WorkspaceError?: typeof WorkspaceError; openDesktopWssPorts?: typeof openDesktopWssPorts
      }
      assert.equal(typeof extracted.DeviceBindingDesktopRelay, 'function')
      Relay = extracted.DeviceBindingDesktopRelay
      if (fixture.hostStdoutProbe === true) { assert.ok(extracted.WorkspaceError); diagnosticError = extracted.WorkspaceError }
      if (standalone !== undefined) { assert.equal(typeof extracted.openDesktopWssPorts, 'function'); sealedDesktopPorts = extracted.openDesktopWssPorts }
      if (!fixture.sourceWorkspaceAccess && (standalone !== undefined || fixture.packagedWorkspaceAccess === true)) {
        assert.ok(extracted.DeviceWorkspaceAccess && extracted.WorkspaceError)
        Access = extracted.DeviceWorkspaceAccess
        diagnosticError = extracted.WorkspaceError
      }
    }
    const access = makeAccess(Access)
    stops.push(() => access.close()); if (fixture.grantWorkspace !== false) await access.allow(authority)
    let reconnects = 0, denials = 0, regranted = false
    let revoked = false, desktopCarrierRetained = false
    const workspace: DeviceWorkspaceProvider = !fixture.rpcDiagnostics && !fixture.reconnectReview && !fixture.revocationReview && fixture.observeWorkspaceResult === undefined ? access : {
      async open(transport, ticket) {
        const wire = await access.open(transport, ticket).catch(error => {
          if ((reconnects === 1 || revoked) && !regranted && error instanceof diagnosticError && error.code === 'workspace-grant-required') denials++
          throw error
        })
        const observe = fixture.observeWorkspaceResult
        if (observe !== undefined) {
          const request = wire.request.bind(wire)
          wire.request = async (candidate, ...args) => {
            const result = await request(candidate, ...args)
            observe(workspaceRequestSchema.parse(candidate), result)
            return result
          }
        }
        if (fixture.rpcDiagnostics !== true) return wire
        const dispatch = wire.request.bind(wire)
        wire.request = async (...args) => {
          const [candidate, signal] = args
          const parsed = workspaceRequestSchema.safeParse(candidate)
          if (!parsed.success || workspaceDiagnosticOperation(parsed.data) !== 'rich-appearance' || diagnosticFaults.length >= 2) return dispatch(...args)
          const row = { failure: diagnosticFaults.length === 0 ? 'host-rejected' as const : 'timeout' as const, cancelled: false, elapsedMs: 0 }
          diagnosticFaults.push(row)
          console.info('WORKSPACE_DIAGNOSTIC_INJECTED ' + row.failure)
          if (row.failure === 'host-rejected') throw new diagnosticError('workspace-denied')
          const started = performance.now()
          return new Promise((_, reject) => {
            const cancel = () => {
              row.cancelled = true
              row.elapsedMs = Math.round(performance.now() - started)
              reject(signal.reason)
            }
            if (signal.aborted) cancel()
            else signal.addEventListener('abort', cancel, { once: true })
          })
        }
        return wire
      },
    }
    let desktop: DeviceBindingDesktopRelay | undefined
    let stopDesktop: (() => Promise<void>) | undefined
    let started = false
    const mountDesktop = async (expiresAt: number) => {
      const trust: EndpointRelayTrust = { pairId: deviceRelayPairId(record), epoch: record.epoch, role: 'desktop', audience: record.audience,
        credentialId: id<'harmony-device-credential'>(record.desktopCredentialId), expiresAt }
      desktop = new Relay(owner, provider, { paired: record, desktopId: record.desktopId,
      workspace, isRouteCurrent: async () => !closed,
      ...((fixture.traceWorkspaceRequests ?? fixture.hostStdoutProbe) ? { traceWorkspaceRequests: true } : {}),
      trust, policy: desktopPolicy,
      limits: resolveOptions({ enabled: true, desktopId: record.desktopId, profileId: 'desktop' }, clock).limits,
      openPorts: () => {
        const ports = sealedDesktopPorts === undefined ? relay!.ports('desktop') : sealedDesktopPorts({ host: trust.audience, handshakeMs: desktopPolicy.handshakeMs,
          maxFrameBytes: desktopPolicy.e2e.maxFrameBytes, maxBufferedBytes: desktopPolicy.maxQueuedBytes,
          maxControlFrames: fixture.standaloneWss?.maxControlFrames ?? hostConfig.maxControlFrames }, trust, desktopKey, record.phonePublicSpki)
        if (fixture.creationAckLoss) desktopControl = ports.control
        return ports
      } })
      stopDesktop = await desktop.mount(transportContext)
    }
    stops.push(() => stopDesktop?.())
    const start = async () => {
      assert.equal(started, false); started = true
      const expiresAt = clock() + 1200000
      await mountDesktop(expiresAt)
      if (wss === undefined && fixture.hostStdoutProbe !== true) attach('control', relay!.phoneControl())
      return { registration: JSON.stringify(record), phonePkcs8: phoneKey.pkcs8.toString('base64url'), expiresAt, relay: policy }
    }
    const attach = (name: string, socket: RelaySocket): Carrier => {
      const value: Carrier = { socket, frames: [], bytes: 0, closed: false, stop() {} }
      const frameStop = socket.onFrame((bytes, binary) => {
        if (value.bytes + bytes.length > policy.maxQueuedBytes || value.frames.length >= 64) { value.closed = true; socket.terminate(); return }
        value.bytes += bytes.length; value.frames.push({ bytes: Buffer.from(bytes).toString('base64url'), binary })
        receivedFrames++; receivedBytes += bytes.length; receivedMaxFrameBytes = Math.max(receivedMaxFrameBytes, bytes.length)
      })
      const endStop = socket.onEnd(() => { value.closed = true })
      value.stop = () => { frameStop(); endStop(); value.frames.length = 0; value.bytes = 0 }
      carriers.set(name, value); return value
    }
    return {
      bootstrap: start,
      creationOptions,
      managedActions,
      wss,
      ...(fixture.reconnectReview === true ? { reconnectReview: {
        desktopClosed: () => desktop?.terminalState === 'closed',
        async reconnect() {
          assert.equal(desktop?.terminalState, 'closed'); assert.equal(reconnects, 0); assert.ok(stopDesktop)
          await stopDesktop()
          assert.equal(access.status(authority).enabled, true)
          await access.revoke(authority)
          assert.deepEqual(access.status(authority), { enabled: false, expiresAt: null })
          await mountDesktop(clock() + 1200000)
          reconnects++
        },
        async regrant() {
          assert.equal(reconnects, 1); assert.equal(denials, 1); assert.equal(regranted, false)
          const expiry = await access.allow(authority)
          assert.deepEqual(access.status(authority), { enabled: true, expiresAt: expiry })
          regranted = true
        },
        observed: () => ({ reconnects, denials, regranted, ...(lostCreationAck === undefined ? {} : { lostCreationAck }) }),
      } } : {}),
      ...(fixture.revocationReview ? { revocationReview: {
        async revoke() {
          assert.ok(desktop && !desktop.terminalState && !revoked && access.status(authority).enabled)
          await access.revoke(authority)
          assert.deepEqual(access.status(authority), { enabled: false, expiresAt: null })
          assert.equal(desktop.terminalState, undefined)
          revoked = true
        },
        async regrant() {
          assert.ok(desktop && !desktop.terminalState && revoked && !regranted && denials === 1)
          const expiry = await access.allow(authority)
          assert.deepEqual(access.status(authority), { enabled: true, expiresAt: expiry })
          assert.equal(desktop.terminalState, undefined)
          desktopCarrierRetained = true
          regranted = true
        },
        observed: () => ({ revoked, regranted, denials, desktopCarrierRetained }),
      } } : {}),
      ...(fixture.hostStdoutProbe === true ? {
        hostPhonePorts: () => { assert.ok(started && !closed); return standalone === undefined ? relay!.ports('phone') : standalone.phonePorts() },
        async grantCurrentWorkspace() {
          assert.notEqual(Access, DeviceWorkspaceAccess)
          const lease = desktop?.workspaceLease
          assert.ok(lease && !access.status(authority).enabled)
          const expiresAt = await access.allow(authority, undefined, lease)
          assert.equal(expiresAt, lease.expiresAt)
          assert.ok(expiresAt < clock() + workspaceTtlMs)
          assert.deepEqual(access.status(authority), { enabled: true, expiresAt })
        },
        holdNextWorkspaceAdmission() {
          const original = owner.connectionLifetime
          const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
          owner.connectionLifetime = async (...args) => {
            owner.connectionLifetime = original
            const signal = await original.apply(owner, args)
            entered.resolve()
            await release.promise
            return signal
          }
          return { entered: entered.promise, resume() { owner.connectionLifetime = original; release.resolve() } }
        },
      } : {}),
      exchange(raw: unknown) {
        assert.ok(!closed && wss === undefined && relay !== undefined, 'HTTP frame transport is unavailable for the WSS fixture')
        const input = inputSchema.parse(raw)
        if (input.join !== undefined) { assert.equal(input.channel, 'data'); assert.equal(carriers.has('data'), false); attach('data', relay.phoneData(input.join.room, input.join.token)) }
        const carrier = carriers.get(input.channel); assert.ok(carrier)
        for (const item of input.frames) {
          const bytes = Buffer.from(item.bytes, 'base64url'); assert.ok(bytes.length <= policy.e2e.maxFrameBytes)
          carrier.socket.send(bytes); sentFrames++; sentMaxFrameBytes = Math.max(sentMaxFrameBytes, bytes.length)
        }
        const frames = carrier.frames.splice(0); carrier.bytes = 0
        return { frames, closed: carrier.closed }
      },
      observed: () => ({ nativeCrypto: true, syntheticPublicKey: true, huks: false, tls: wss !== undefined, nativeExecutor: true, workspaceGranted: fixture.grantWorkspace !== false,
        packagedDesktopRelay: desktop !== undefined && Relay !== DeviceBindingDesktopRelay,
        packagedWorkspaceAccess: Access !== DeviceWorkspaceAccess,
        catalogRows: fixture.catalogRows ?? preflight.sessions.length, persistedCatalogRows: fixture.persistedCatalogRows, paddedDirectoryOnly: fixture.catalogRows !== undefined, maxChunkBytes, wireMaxRequestBytes,
        catalogScans, catalogPeakRows, catalogTotalMs: Math.round(catalogTotalMs), catalogMaxMs: Math.round(catalogMaxMs), dataDelivery: relay?.dataDelivery(),
        desktopRelayCaps: caps, phoneMaxPlaintextBytes: policy.e2e.maxPlaintextBytes, sentMaxFrameBytes, receivedMaxFrameBytes,
        ...(fixture.rpcDiagnostics === true ? { diagnosticFaults } : {}),
        ...(wss === undefined ? {} : { nativeWss: wss.observed }),
        ...(standalone === undefined ? {} : { standaloneWss: standalone.observed(), standaloneControlFrameLimit: fixture.standaloneWss?.maxControlFrames }),
        ...(standalone?.dataDelay === undefined ? {} : { standaloneDataDelay: standalone.dataDelay() }),
        carrier: standalone !== undefined ? 'independent sealed relay with TLS loopback' : wss === undefined ? 'opaque frames over HTTP loopback' : 'native WSS on loopback with desktop memory port', sentFrames, receivedFrames, receivedBytes, desktopState: desktop?.terminalState ?? 'active' }),
      close,
    }
  } catch (error) { await close(); throw error }
}

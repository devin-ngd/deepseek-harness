/** Test broker and E2E carrier with memory ports and an optional native WSS listener. */
import { RelayRooms, type RelaySocket } from './relay-core.ts'
import { createServer } from 'node:https'
import type { Duplex } from 'node:stream'
import { denyRelayUpgrade, RelayUpgrade, relayHeader } from './relay-upgrade.ts'
import { RelayControlUpgrade } from '../standalone-relay/src/control-upgrade.ts'
import { RELAY_CONTROL_PATH } from '../src/relay-control-protocol.ts'
import { RELAY_PATH } from './relay-protocol.ts'
import { RoomBroker } from '../standalone-relay/src/room-broker.ts'
import { resolveBrokerPolicy } from '../standalone-relay/src/broker-policy.ts'
import { desktopKey, phoneKey, fixtureKey, fixtureSource, rawBroker } from './phase39-fixture.ts'
import { ImportedP256Agreement, nodeE2EPrimitives } from './p256-channel.ts'
import { deviceRelayPairId, type DeviceBinding } from '../src/device-binding-protocol.ts'
import type { PairedRelayPorts, PairedRelayPolicy } from '../src/paired-relay.ts'
import type { CleanupScheduler } from './connection-lifetime.ts'

interface DeliveryDelay {
  readonly scheduler: CleanupScheduler
  readonly ms: number
  readonly maxQueuedBytes: number
  delivered(): void
}

/** Ephemeral fixture certificate and private key. */
export interface WorkspaceWssTls { readonly cert: Buffer; readonly key: Buffer }

class Socket implements RelaySocket {
  bufferedAmount = 0
  private readonly frames = new Set<(bytes: Uint8Array, binary: boolean) => void>()
  private readonly ends = new Set<() => void>()
  private readonly held: Array<{ bytes: Uint8Array; binary: boolean }> = []
  private readonly inFlight = new Set<() => void>()
  private closed = false
  remote: Socket | undefined
  constructor(private readonly binary: boolean, private readonly delay?: DeliveryDelay) {}
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void {
    this.frames.add(callback); queueMicrotask(() => this.flush())
    return () => { this.frames.delete(callback) }
  }
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  private receive(bytes: Uint8Array, binary: boolean): void {
    if (this.closed) return
    this.held.push({ bytes: Uint8Array.from(bytes), binary }); queueMicrotask(() => this.flush())
  }
  private flush(): void {
    if (this.closed || this.frames.size === 0) return
    for (const item of this.held.splice(0)) for (const callback of this.frames) callback(item.bytes, item.binary)
  }
  ready(): void { this.remote?.receive(new TextEncoder().encode('{"relay":"ready","v":1}'), false) }
  send(bytes: Uint8Array): void {
    const remote = this.remote, delay = this.delay
    if (this.closed || remote === undefined) throw new Error('fixture socket closed')
    if (delay === undefined) { remote.receive(bytes, this.binary); return }
    if (this.bufferedAmount + bytes.byteLength > delay.maxQueuedBytes) throw new Error('fixture socket capacity exceeded')
    const copy = Uint8Array.from(bytes)
    this.bufferedAmount += copy.byteLength
    const stop = delay.scheduler.after(delay.ms, () => {
      this.inFlight.delete(stop)
      this.bufferedAmount -= copy.byteLength
      delay.delivered()
      remote.receive(copy, this.binary)
    })
    this.inFlight.add(stop)
  }
  terminate(): void {
    if (this.closed) return
    this.closed = true; this.held.length = 0
    for (const stop of this.inFlight) stop()
    this.inFlight.clear(); this.bufferedAmount = 0
    for (const callback of [...this.ends]) callback()
    this.remote?.terminate()
  }
}
function pair(binary: boolean, toClient?: DeliveryDelay, toServer?: DeliveryDelay) {
  const server = new Socket(binary, toClient), client = new Socket(binary, toServer)
  server.remote = client; client.remote = server
  return { server, client }
}

/** Actual broker, room, P-256 and AES-GCM composition with fixed fixture keys. */
export class WorkspaceMemoryRelay {
  private readonly rooms: RelayRooms
  private readonly broker: RoomBroker
  private readonly dataDelay: { toDesktop: DeliveryDelay; fromDesktop: DeliveryDelay } | undefined
  private deliveredToDesktop = 0
  private deliveredFromDesktop = 0
  private agreement = 30
  /** @param binding - synthetic signed registration. @param policy - application E2E capacities. @param clock - fixture clock. @param scheduler - owned timers. @param brokerTtl - fixture lease durations. @param dataOneWayDelayMs - latency added only to frames crossing the desktop data socket. */
  constructor(private readonly binding: DeviceBinding, policy: PairedRelayPolicy,
    private readonly clock: () => number, private readonly scheduler: CleanupScheduler,
    brokerTtl: { challengeTtlMs: number; roomTtlMs: number } = { challengeTtlMs: policy.maxChallengeTtlMs, roomTtlMs: policy.maxRoomTtlMs },
    private readonly dataOneWayDelayMs = 0) {
    if (!Number.isSafeInteger(dataOneWayDelayMs) || dataOneWayDelayMs < 0 || dataOneWayDelayMs >= policy.handshakeMs / 2) throw new Error('fixture data delay exceeds handshake budget')
    if (dataOneWayDelayMs > 0) {
      const options = { scheduler, ms: dataOneWayDelayMs, maxQueuedBytes: policy.maxQueuedBytes }
      this.dataDelay = {
        toDesktop: { ...options, delivered: () => { this.deliveredToDesktop++ } },
        fromDesktop: { ...options, delivered: () => { this.deliveredFromDesktop++ } },
      }
    }
    const authority = {}
    this.rooms = new RelayRooms(authority, { maxRooms: 2, maxRoomTtlMs: policy.maxRoomTtlMs, pairTimeoutMs: policy.handshakeMs,
      maxFrameBytes: policy.e2e.maxFrameBytes, maxBufferedBytes: policy.maxQueuedBytes, maxFrames: policy.e2e.maxFrames,
      idleTimeoutMs: policy.maxRoomTtlMs }, clock)
    if (brokerTtl.challengeTtlMs > policy.maxChallengeTtlMs || brokerTtl.roomTtlMs > policy.maxRoomTtlMs) throw new Error('fixture broker exceeds client TTL ceilings')
    const spec = resolveBrokerPolicy({ ...rawBroker, ...brokerTtl,
      pairs: [{ pairId: deviceRelayPairId(binding), desktopPublicSpki: binding.desktopPublicSpki,
        phonePublicSpki: binding.phonePublicSpki, epoch: binding.epoch, expiresAt: clock() + policy.maxRoomTtlMs, revoked: false }] })
    if (!spec.enabled) throw new Error('fixture broker disabled')
    this.broker = new RoomBroker(authority, this.rooms, spec, binding.audience, clock, fixtureSource())
  }
  /** @param role - original endpoint role. @returns real crypto/broker ports without an external network. */
  ports(role: 'desktop' | 'phone'): PairedRelayPorts {
    const socket = pair(false)
    this.broker.attach(deviceRelayPairId(this.binding), role, socket.server)
    return {
      control: socket.client, signer: role === 'desktop' ? desktopKey : phoneKey,
      primitives: nodeE2EPrimitives, remotePublicSpki: (role === 'desktop' ? phoneKey : desktopKey).publicSpki,
      clock: this.clock, scheduler: this.scheduler,
      agreement: async () => { const scalar = ++this.agreement; return { key: new ImportedP256Agreement(fixtureKey(scalar).pkcs8), nonce: Buffer.alloc(32, scalar) } },
      data: async lease => {
        const socket = role === 'desktop' ? pair(true, this.dataDelay?.toDesktop, this.dataDelay?.fromDesktop) : pair(true)
        this.rooms.claim(lease.receipt.room, role, lease.receipt.token).attach(socket.server)
        return socket.client
      },
    }
  }
  /** @returns the phone control socket for the isolated native HTTP frame carrier. */
  phoneControl(): RelaySocket {
    const socket = pair(false)
    this.broker.attach(deviceRelayPairId(this.binding), 'phone', socket.server)
    return socket.client
  }
  /** @param room - broker-issued room. @param token - broker-issued phone capability. @returns the claimed phone data socket. */
  phoneData(room: string, token: string): RelaySocket {
    const socket = pair(true)
    this.rooms.claim(room, 'phone', token).attach(socket.server)
    return socket.client
  }
  /** @param tls - generated test-only certificate and key. @param maxFrameBytes - exact phone frame limit. @returns the owned loopback TLS listener for the native phone ports. */
  async listenNativeWss(tls: WorkspaceWssTls, maxFrameBytes: number) {
    const host = '127.0.0.1', devicePort = 18083
    if (this.binding.audience !== host || this.dataOneWayDelayMs !== 0) throw new Error('native WSS fixture must use loopback')
    const observed = { tlsProtocols: [] as string[], controlRequests: 0, dataRequests: 0, rejected: 0, terminalFailures: 0 }
    const failed = () => { observed.terminalFailures++ }
    const control = new RelayControlUpgrade(this.broker, host, rawBroker.maxControlPayloadBytes, 128, 'networkkit-v1', failed)
    const data = new RelayUpgrade(this.rooms, { publicHost: host, maxFrameBytes, maxControlFrames: 128, nativeOrigin: 'networkkit-v1' }, failed)
    const sockets = new Set<Duplex>()
    const server = createServer({ ...tls, minVersion: 'TLSv1.2' }, (_request, response) => response.writeHead(403).end())
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
    server.on('secureConnection', socket => { observed.tlsProtocols.push(socket.getProtocol() ?? 'unknown') })
    server.on('tlsClientError', failed)
    server.on('upgrade', (request, socket, head) => {
      try {
        if (relayHeader(request, 'host') !== host + ':' + devicePort || relayHeader(request, 'origin') !== 'https://' + host
          || relayHeader(request, 'x-dsh-relay-role') !== 'phone') throw new Error('invalid fixture ingress')
        // The loopback test port is explicit. Production's default TLS port is absent from Host.
        request.headers.host = host
        if (request.url === RELAY_CONTROL_PATH) { observed.controlRequests++; control.handle(request, socket, head); return }
        if (request.url === RELAY_PATH) { observed.dataRequests++; data.handle(request, socket, head); return }
      } catch (error) { void error /* All invalid fixture ingress gets the same empty denial. */ }
      observed.rejected++; denyRelayUpgrade(socket)
    })
    const close = async () => {
      for (const socket of sockets) socket.destroy()
      const results = await Promise.allSettled([control.close(), data.close(), new Promise<void>((resolve, reject) => {
        server.close(error => { if (error && (!('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING')) reject(error); else resolve() })
      })])
      if (results.some(result => result.status === 'rejected')) throw new Error('native WSS fixture cleanup failed')
    }
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve) })
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('native WSS fixture listener absent')
      return { hostPort: address.port, devicePort, observed, close }
    } catch (error) { await close(); throw error }
  }
  /** @returns imposed data delay and actual deliveries in both directions. */
  dataDelivery() { return { oneWayMs: this.dataOneWayDelayMs, toDesktop: this.deliveredToDesktop, fromDesktop: this.deliveredFromDesktop } }
  /** Run the broker's expiration sweep at the fixture's current time. */
  sweep(): void { this.broker.sweep() }
  /** Close all memory room and control owners. */
  close(): void { this.broker.close(); this.rooms.close() }
}

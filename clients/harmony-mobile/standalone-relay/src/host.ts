/** Independent loopback Node HTTP/ws host. Public pair pins may enable short room issuance; no DSH runtime or message storage exists. */
import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { randomBytes } from 'node:crypto'
import { RelayRooms, type RelayRoomPlan } from '../../integration/relay-core.ts'
import { RelayUpgrade, denyRelayUpgrade } from '../../integration/relay-upgrade.ts'
import { resolveRelayConfig, type EnabledRelay } from './config.ts'
import { RoomBroker, type RelayIssueSource, type PublicPairRevocations } from './room-broker.ts'
import { RelayControlUpgrade } from './control-upgrade.ts'
import { RELAY_CONTROL_PATH, type RelayPairId } from '../../src/relay-control-protocol.ts'
/** Host-local lifecycle capability; no HTTP, CLI, config or guest message creates or invokes it. */
export class StandaloneRelay {
  private readonly rooms: RelayRooms
  private readonly upgrade: RelayUpgrade
  private readonly broker: RoomBroker | undefined
  private readonly control: RelayControlUpgrade | undefined
  private readonly server: Server
  private readonly sockets = new Set<Socket>()
  private timer: ReturnType<typeof setInterval> | undefined
  private state: 'new' | 'starting' | 'running' | 'closing' | 'closed' = 'new'
  private cleanup: Promise<void> | undefined
  private listening: Promise<void> | undefined
  private failure = false
  /** @param config - resolved budgets and explicit loopback address. @param authority - local ephemeral provisioner capability, never serialized. @param clock - absolute expiry clock. @param failed - content-free lifecycle notice. @param source - fresh ephemeral material; fixed only in tests. @param revocations - optional public-only commit port; absence prevents durable revocation success. */
  constructor(private readonly config: EnabledRelay, private readonly authority: object, clock: () => number, failed: () => void, source: RelayIssueSource, revocations?: PublicPairRevocations) {
    this.rooms = new RelayRooms(authority, { maxRooms: config.maxRooms, maxRoomTtlMs: config.maxRoomTtlMs, pairTimeoutMs: config.pairTimeoutMs, maxFrameBytes: config.maxFrameBytes, maxBufferedBytes: config.maxBufferedBytes, maxFrames: config.maxFrames, idleTimeoutMs: config.idleTimeoutMs }, clock)
    const terminal = () => { this.failure = true; void this.close().catch(error => { void error; /* Denial remains terminal; completion reports a stable failure. */ }); try { failed() } catch (error) { void error; /* A notification cannot escape the transport dispatcher. */ } }
    this.upgrade = new RelayUpgrade(this.rooms, { publicHost: config.publicHost, maxFrameBytes: config.maxFrameBytes, maxControlFrames: config.maxControlFrames, nativeOrigin: config.nativeOrigin }, terminal)
    this.broker = config.broker.enabled ? new RoomBroker(authority, this.rooms, config.broker, config.publicHost, clock, source, revocations) : undefined
    this.control = config.broker.enabled && this.broker !== undefined ? new RelayControlUpgrade(this.broker, config.publicHost, config.broker.maxControlPayloadBytes, config.maxControlFrames, config.nativeOrigin, terminal) : undefined
    this.server = createServer({ maxHeaderSize: config.maxHeaderBytes, requestTimeout: config.requestTimeoutMs, headersTimeout: config.headersTimeoutMs, connectionsCheckingInterval: config.connectionCheckIntervalMs }, (_req, response) => { response.writeHead(404, { Connection: 'close', 'Content-Length': '0' }); response.end() })
    this.server.maxConnections = config.maxConnections
    this.server.on('connection', socket => { if (this.state !== 'running' && this.state !== 'starting' || this.sockets.size >= config.maxConnections) { socket.destroy(); return }; this.sockets.add(socket); socket.on('error', () => { socket.destroy() }); socket.once('close', () => this.sockets.delete(socket)) })
    this.server.on('clientError', (_error, socket) => socket.destroy())
    this.server.on('upgrade', (req, socket, head) => { if (this.state !== 'running' || req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') { denyRelayUpgrade(socket); return }; if (req.url === RELAY_CONTROL_PATH && this.control !== undefined) this.control.handle(req, socket, head); else this.upgrade.handle(req, socket, head) })
    this.server.on('error', terminal)
  }
  /** @returns after the owned loopback listener starts; failure cleans all allocated resources before rejection. */
  async start(): Promise<void> {
    if (this.state !== 'new') throw new Error('relay start denied'); this.state = 'starting'
    try {
      this.listening = new Promise<void>((resolve, reject) => { const failure = () => { this.server.off('listening', listening); reject(new Error('relay listen failed')) }, listening = () => { this.server.off('error', failure); resolve() }; this.server.once('error', failure); this.server.once('listening', listening); this.server.listen(this.config.port, this.config.host) })
      await this.listening
      if (this.state !== 'starting') throw new Error('relay start denied'); this.state = 'running'
      this.timer = setInterval(() => { try { this.sweep() } catch (error) { void error; this.failure = true; void this.close().catch(error => { void error; /* Failure remains terminal. */ }) } }, this.config.sweepIntervalMs); this.timer.unref()
    } catch (error) { void error; await this.close(); throw new Error('relay listen failed') }
  }
  /** @returns actual loopback port for local synthetic tests or service checks; it conveys no room capability. */
  port(): number { const address = this.server.address(); if (this.state !== 'running' || address === null || typeof address === 'string') throw new Error('relay unavailable'); return address.port }
  /** @param authority - exact local capability. @param plan - approved short-lived digest-only room. @returns nothing; this method has no remote route and does not issue a desktop grant. */
  provision(authority: object, plan: RelayRoomPlan): void { if (this.state !== 'running' || authority !== this.authority) throw new Error('relay provision denied'); this.rooms.provision(authority, plan) }
  /** @param authority - local provisioner. @param room - room to stop. @returns nothing; associated endpoints are disconnected. */
  revoke(authority: object, room: RelayRoomPlan['room']): void { if (authority !== this.authority) throw new Error('relay revoke denied'); this.rooms.revoke(authority, room) }
  /** @returns nothing; explicitly owned expiry checks share the same core as the existing relay. */
  sweep(): void { this.rooms.sweep(); this.broker?.sweep() }
  /** @param authority - exact local operator. @param pair - approved pair to deny. @returns after public-only revocation persistence; absent writer refuses durable success after live denial. */
  async revokePair(authority: object, pair: RelayPairId): Promise<void> { if (authority !== this.authority || this.broker === undefined) throw new Error('pair revoke denied'); await this.broker.revoke(authority, pair) }
  /** @returns after every HTTP/WS socket and timer stops; repeated close callers share completion and cleanup failures remain visible. */
  close(): Promise<void> {
    if (this.cleanup !== undefined) return this.cleanup
    this.state = 'closing'; if (this.timer !== undefined) clearInterval(this.timer)
    for (const stop of [() => this.broker?.close(), () => this.rooms.close(), ...[...this.sockets].map(socket => () => socket.destroy())]) { try { stop() } catch (error) { void error; this.failure = true } }
    const http = (async () => { try { await this.listening } catch (error) { void error; /* A failed listen is already reported; no socket became available. */ } await new Promise<void>((resolve, reject) => { if (!this.server.listening) resolve(); else this.server.close(error => { if (error != null) reject(new Error('relay HTTP cleanup failed')); else resolve() }) }) })()
    this.cleanup = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<PromiseSettledResult<void>[]>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('relay cleanup deadline')), this.config.shutdownTimeoutMs) })
      try { const results = await Promise.race([Promise.allSettled([http, Promise.resolve().then(() => this.upgrade.close()), Promise.resolve().then(() => this.control?.close())]), deadline]); if (results.some(value => value.status === 'rejected')) this.failure = true }
      catch (error) { void error; this.failure = true }
      finally { if (timeout !== undefined) clearTimeout(timeout); this.state = 'closed' }
      if (this.failure) throw new Error('relay cleanup failed')
    })(); return this.cleanup
  }
}
/** @param candidate - static JSON settings, disabled by default. @param authority - exact local provisioner capability. @param clock - owner-selected absolute clock. @param failed - content-free terminal notice. @param source - fresh ephemeral material; defaults to Node CSPRNG without creating persistent keys. @param revocations - public-only commit port, absent in CLI. @returns an inert owner or undefined; caller must explicitly start a configured owner. */
export function createStandaloneRelay(candidate: unknown = { enabled: false }, authority: object = Object.freeze({}), clock: () => number = Date.now, failed: () => void = () => {}, source: RelayIssueSource = freshRelayIssueSource(), revocations?: PublicPairRevocations): StandaloneRelay | undefined {
  const config = resolveRelayConfig(candidate); if (!config.enabled) return undefined; if (config.publicTrust !== undefined) throw new Error('public trust requires async reopen'); return new StandaloneRelay(config, authority, clock, failed, source, revocations)
}
/** @returns inert CSPRNG port; generates ephemeral material only on enabled broker calls and never generates persistent identity keys. */
export function freshRelayIssueSource(): RelayIssueSource { return { id: () => 'relay-' + randomBytes(24).toString('base64url'), nonce: () => randomBytes(32).toString('base64url'), token: () => randomBytes(32).toString('hex') } }

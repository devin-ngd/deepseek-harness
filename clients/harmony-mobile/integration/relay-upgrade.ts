/** Shared Node/ws upgrade adapter. It owns no listener, Session, DSH service, private key, persistence or provisioning endpoint. */
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { RelayRooms, type RelaySocket } from './relay-core.ts'
import { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
/** Host has already selected HTTPS or loopback behind an approved TLS proxy. */
export interface RelayUpgradePolicy { readonly publicHost: string; readonly maxFrameBytes: number; readonly maxControlFrames: number; readonly nativeOrigin: RelayNativeOrigin }
/** Browser origins remain denied unless a deployment explicitly selects the fixed NetworkKit phone handshake. */
export type RelayNativeOrigin = 'deny' | 'networkkit-v1'
/** @param ws - maintained server WebSocket. @param maxControlFrames - explicit ping/pong lifetime cap. @param applicationBinary - data uses opaque binary; control uses bounded JSON text. @returns common owned port; no metadata is logged. */
export function nodeRelaySocket(ws: WebSocket, maxControlFrames: number, applicationBinary = true): RelaySocket {
  ws.on('error', () => { ws.terminate() })
  let controlFrames = 0
  const control = () => { if (++controlFrames > maxControlFrames) ws.terminate() }
  ws.on('ping', control); ws.on('pong', control)
  return { get bufferedAmount() { return ws.bufferedAmount }, onFrame(callback) {
    const listener = (data: Buffer | ArrayBuffer | Buffer[], binary: boolean) => { const bytes = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data; try { callback(bytes, binary) } catch (error) { void error; ws.terminate() } }
    ws.on('message', listener); return () => { ws.off('message', listener) }
  }, onEnd(callback) { const end = () => { try { callback() } catch (error) { void error; ws.terminate() } }; ws.on('close', end); ws.on('error', end); return () => { ws.off('close', end); ws.off('error', end) } },
    ready: () => { ws.send('{"relay":"ready","v":1}') }, send: bytes => { ws.send(bytes, { binary: applicationBinary }, error => { if (error != null) ws.terminate() }) }, terminate: () => { ws.terminate() } }
}
/** @param req - untrusted HTTP metadata. @param key - selected lowercase header. @returns one bounded field; duplicate or absent fields reject. */
export function relayHeader(req: IncomingMessage, key: string): string {
  if (req.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === key).length !== 1) throw new Error('denied upgrade')
  const value = req.headers[key]; if (typeof value !== 'string' || value.length > 256) throw new Error('denied upgrade'); return value
}
const UPGRADE_FORBIDDEN = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n'
/** @param req - bounded upgrade metadata. @param host - exact configured TLS audience. @param mode - resolved local compatibility choice. @param role - separately validated routing role. @returns whether the originless endpoint or canonical NetworkKit phone origin is admitted; this never authenticates a peer. */
export function relayOriginAllowed(req: IncomingMessage, host: string, mode: RelayNativeOrigin, role: string): boolean {
  if (req.headers.origin === undefined) return true
  return mode === 'networkkit-v1' && role === 'phone' && relayHeader(req, 'origin') === 'https://' + host
    && req.headers['sec-fetch-mode'] === undefined && req.headers['sec-fetch-site'] === undefined
}
/** @param socket - rejected host-owned TCP stream. @returns after queuing the same empty HTTP refusal for every admission failure; the flushed writer or a write failure destroys the stream without echoing request fields. */
export function denyRelayUpgrade(socket: Duplex): void {
  try { socket.end(UPGRADE_FORBIDDEN, () => { socket.destroy() }) }
  catch (error) { void error; socket.destroy() }
}
/** Shared adapter exposes the same exact route for either host; caller owns listener lifetime and total connection/header limits. */
export class RelayUpgrade {
  private readonly wss: WebSocketServer
  private closed = false
  private cleanup: Promise<void> | undefined
  /** @param rooms - existing memory routing owner. @param policy - explicit public audience and frame/control bounds. @param failed - host notification after terminal denial; must not log headers or payloads. */
  constructor(private readonly rooms: RelayRooms, private readonly policy: RelayUpgradePolicy, failed: () => void) {
    if (!/^[a-z0-9.-]+$/.test(policy.publicHost) || policy.publicHost.endsWith('.invalid') || ![policy.maxFrameBytes, policy.maxControlFrames].every(value => Number.isSafeInteger(value) && value > 0) || policy.maxFrameBytes > 0x7fffffff) throw new Error('invalid relay policy')
    // ws 8.21.3 enforces these bounds; the installed @types/ws 8.18.1 declaration predates both options.
    const options = { noServer: true, perMessageDeflate: false as const, maxPayload: policy.maxFrameBytes, clientTracking: true, maxFragments: 128, maxBufferedChunks: 128 }
    this.wss = new WebSocketServer(options)
    this.wss.on('error', () => { this.closed = true; void this.close().catch(error => { void error; /* Host owns terminal cleanup failure. */ }); try { failed() } catch (error) { void error; /* The host notification cannot restore access or escape this dispatcher. */ } })
  }
  /** @param req - untrusted HTTP upgrade metadata. @param socket - caller-owned TCP stream. @param head - bytes already received by Node. @returns nothing; denied admission gets an empty 403 and closes without echoing identity, token or room existence. */
  handle(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    let claim: ReturnType<RelayRooms['claim']> | undefined
    socket.on('error', () => { socket.destroy() })
    try {
      const role = relayHeader(req, 'x-dsh-relay-role')
      if (this.closed || req.method !== 'GET' || req.url !== RELAY_PATH || req.headers.cookie !== undefined || !relayOriginAllowed(req, this.policy.publicHost, this.policy.nativeOrigin, role)
        || relayHeader(req, 'host') !== this.policy.publicHost || relayHeader(req, 'sec-websocket-protocol') !== RELAY_SUBPROTOCOL) throw new Error('denied upgrade')
      const auth = relayHeader(req, 'authorization'); if (!auth.startsWith('Bearer ')) throw new Error('denied upgrade')
      claim = this.rooms.claim(relayHeader(req, 'x-dsh-relay-room'), role, auth.slice(7))
      const ticket = claim
      this.wss.handleUpgrade(req, socket, head, ws => { try { ticket.attach(nodeRelaySocket(ws, this.policy.maxControlFrames)) } catch (error) { void error; ws.terminate(); ticket.abort() } })
      socket.once('close', () => { try { ticket.abort() } catch (error) { void error; /* Expiry owner reports stable core failure. */ } })
    } catch (error) { void error; try { claim?.abort() } catch (error) { void error; /* Denial remains terminal. */ }; denyRelayUpgrade(socket) }
  }
  /** @returns when WS clients finish closing; access is denied synchronously before cleanup. Repeated callers share completion. */
  close(): Promise<void> {
    if (this.cleanup !== undefined) return this.cleanup
    this.closed = true; let failed = false; for (const stop of [() => this.rooms.close(), ...[...this.wss.clients].map(ws => () => ws.terminate())]) { try { stop() } catch (error) { void error; failed = true } }
    this.cleanup = new Promise((resolve, reject) => { this.wss.close(error => { if (error != null || failed) reject(new Error('relay cleanup failed')); else resolve() }) }); return this.cleanup
  }
}

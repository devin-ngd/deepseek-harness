/** Native endpoint control WS adapter. Known public registration gates challenges; fresh signatures from both roles gate each room. No enrollment or grant API is provided. */
import { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { nodeRelaySocket, relayHeader, relayOriginAllowed, denyRelayUpgrade, type RelayNativeOrigin } from '../../integration/relay-upgrade.ts'
import { RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL } from '../../src/relay-control-protocol.ts'
import { RoomBroker } from './room-broker.ts'
/** Owned control upgrade shares the host's total TCP/header bounds and existing WS ping/pong policy. */
export class RelayControlUpgrade {
  private readonly wss: WebSocketServer
  private closed = false
  private closing: Promise<void> | undefined
  /** @param broker - public-key room owner. @param audience - exact selected host. @param maxPayload - validated control JSON cap. @param maxControlFrames - cumulative WS control cap. @param failed - terminal host notice without content. */
  constructor(private readonly broker: RoomBroker, private readonly audience: string, maxPayload: number, private readonly maxControlFrames: number, private readonly nativeOrigin: RelayNativeOrigin, failed: () => void) {
    if (!Number.isSafeInteger(maxPayload) || maxPayload <= 0 || maxPayload > 0x7fffffff) throw new Error('invalid control WS cap')
    // ws 8.21.3 enforces these bounds; the installed @types/ws 8.18.1 declaration predates both options.
    const options = { noServer: true, perMessageDeflate: false as const, maxPayload, clientTracking: true, maxFragments: 128, maxBufferedChunks: 128 }
    this.wss = new WebSocketServer(options); this.wss.on('error', () => { this.closed = true; void this.close().catch(error => { void error; /* Host owns terminal failure. */ }); try { failed() } catch (error) { void error; /* Notification cannot restore access. */ } })
  }
  /** @param req - bounded upgrade metadata. @param socket - host TCP stream. @param head - prior bytes. @returns after accepted known-pair control or empty 403 admission refusal; no room is created by an unsigned request. */
  handle(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy())
    try {
      const role = relayHeader(req, 'x-dsh-relay-role'), pair = relayHeader(req, 'x-dsh-relay-pair')
      if (this.closed || req.method !== 'GET' || req.url !== RELAY_CONTROL_PATH || req.headers.cookie !== undefined || !relayOriginAllowed(req, this.audience, this.nativeOrigin, role) || req.headers.authorization !== undefined || relayHeader(req, 'host') !== this.audience || relayHeader(req, 'sec-websocket-protocol') !== RELAY_CONTROL_SUBPROTOCOL || role !== 'desktop' && role !== 'phone' || !this.broker.allowed(pair, role)) throw new Error('control denied')
      this.wss.handleUpgrade(req, socket, head, ws => { try { this.broker.attach(pair, role, nodeRelaySocket(ws, this.maxControlFrames, false)) } catch (error) { void error; ws.terminate() } })
    } catch (error) { void error; denyRelayUpgrade(socket) }
  }
  /** @returns after all control ports close; repeated callers share terminal cleanup. */
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.closed = true; let failed = false; for (const stop of [() => this.broker.close(), ...[...this.wss.clients].map(ws => () => ws.terminate())]) { try { stop() } catch (error) { void error; failed = true } }; this.closing = new Promise((resolve, reject) => this.wss.close(error => { if (error != null || failed) reject(new Error('control cleanup failed')); else resolve() })); return this.closing }
}

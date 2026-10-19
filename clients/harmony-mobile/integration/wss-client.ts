/** Maintained ws client adapter; construction is inert. Only an explicit approved caller may dial an approved WSS endpoint. */
import WebSocket from 'ws'
import type { RelaySocket } from './relay-core.ts'
import { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
export { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
/** Dial policy; bearer capabilities are supplied in memory by an approved owner, never configuration or a URL. */
export interface WssDialPlan { readonly url: string; readonly expectedHost: string; readonly room: string; readonly role: 'phone' | 'desktop'; readonly token: string; readonly handshakeTimeoutMs: number; readonly maxFrameBytes: number; readonly maxBufferedBytes: number }
/** @param plan - explicit in-memory dial request. @returns parsed URL after strict WSS/audience/path checks; no DNS or socket is opened. */
export function validateWssPlan(plan: WssDialPlan): URL {
  const url = new URL(plan.url)
  if (url.protocol !== 'wss:' || url.hostname !== plan.expectedHost || url.hostname.endsWith('.invalid') || url.port !== '' && url.port !== '443'
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== RELAY_PATH
    || !/^[A-Za-z0-9_-]{16,128}$/.test(plan.room) || !/^[a-f0-9]{64}$/.test(plan.token)
    || (plan.role !== 'phone' && plan.role !== 'desktop') || !Number.isSafeInteger(plan.handshakeTimeoutMs) || plan.handshakeTimeoutMs <= 0
    || !Number.isSafeInteger(plan.maxFrameBytes) || plan.maxFrameBytes <= 0 || !Number.isSafeInteger(plan.maxBufferedBytes) || plan.maxBufferedBytes < plan.maxFrameBytes) throw new Error('invalid WSS policy')
  return url
}
/** @param plan - explicit approved dial plan; never automatically derived from a Session or reconnect event. @returns maintained ws connection with TLS verification, no redirects and no compression. This method opens a real socket only when invoked. */
export function dialApprovedWss(plan: WssDialPlan): RelaySocket {
  const url = validateWssPlan(plan)
  const ws = new WebSocket(url, RELAY_SUBPROTOCOL, { headers: { Authorization: 'Bearer ' + plan.token, 'X-DSH-Relay-Room': plan.room, 'X-DSH-Relay-Role': plan.role },
    rejectUnauthorized: true, followRedirects: false, perMessageDeflate: false, handshakeTimeout: plan.handshakeTimeoutMs, maxPayload: plan.maxFrameBytes })
  ws.on('error', () => { ws.terminate() })
  return { get bufferedAmount() { return ws.bufferedAmount }, onFrame(callback) {
    const listener = (data: Buffer | ArrayBuffer | Buffer[], binary: boolean) => { const bytes = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data; callback(bytes, binary) }
    ws.on('message', listener); return () => { ws.off('message', listener) }
  }, onEnd(callback) { ws.on('close', callback); ws.on('error', callback); return () => { ws.off('close', callback); ws.off('error', callback) } },
    ready: () => { throw new Error('client cannot issue relay readiness') }, send: bytes => {
      if (ws.readyState !== WebSocket.OPEN || bytes.byteLength === 0 || bytes.byteLength > plan.maxFrameBytes || ws.bufferedAmount + bytes.byteLength > plan.maxBufferedBytes) { ws.terminate(); throw new Error('WSS send denied') }
      ws.send(bytes, { binary: true }, error => { if (error != null) ws.terminate() })
    }, terminate: () => { ws.terminate() } }
}

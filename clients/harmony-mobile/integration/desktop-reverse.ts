/** Desktop control subscription and TCP dial for the original paired phone. */
import { Socket } from 'node:net'
import WebSocket from 'ws'
import type { P256IdentitySigner } from '../src/e2e-channel.ts'
import type { EndpointRelayTrust } from '../src/relay-control-client.ts'
import { DEVICE_ENDPOINT_LEASE_MS } from '../src/device-endpoint-exchange.ts'
import { DEVICE_REVERSE_SUBPROTOCOL, exchangeReverseLan, type ReverseLanOffer } from '../src/device-reverse-control.ts'
import { ReverseTcpPort, admitReverseTcp } from '../src/device-reverse-tcp.ts'
import { RELAY_CONTROL_PATH } from '../src/relay-control-protocol.ts'
import { boundDesktopControl, validateDesktopWssPolicy, type DesktopWssPolicy } from './desktop-wss.ts'
import { nodeRelaySocket } from './relay-upgrade.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'

/** @param offer - verified phone offer. @param localAddress - current configured WLAN address. @param policy - socket bounds. @param signal - dial lifetime. @returns the admitted port and its close receipt, or undefined after a failed dial is released. */
export async function dialDesktopReverse(offer: ReverseLanOffer, localAddress: string, policy: DesktopWssPolicy,
  signal: AbortSignal): Promise<{ port: ReverseTcpPort; closed: Promise<void> } | undefined> {
  const socket = new Socket()
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()))
  const port = new ReverseTcpPort(policy.maxFrameBytes, policy.maxBufferedBytes, bytes => { socket.write(bytes) },
    () => socket.writableLength, () => socket.destroy())
  socket.on('data', bytes => port.receive(bytes))
  socket.on('error', () => port.terminate())
  socket.on('close', () => port.terminate())
  const dialSignal = AbortSignal.any([signal, AbortSignal.timeout(policy.handshakeMs)])
  const abort = () => port.terminate()
  dialSignal.addEventListener('abort', abort, { once: true })
  let admitted = false
  try {
    if (dialSignal.aborted) return undefined
    socket.connect({ host: offer.address, port: offer.port, family: 4, localAddress })
    const connected = await new Promise<boolean>(resolve => {
      socket.once('connect', () => resolve(true))
      socket.once('close', () => resolve(false))
    })
    if (!connected || !await admitReverseTcp(port, offer.nonce, 'desktop', dialSignal) || dialSignal.aborted) return undefined
    admitted = true
    return { port, closed }
  } finally {
    dialSignal.removeEventListener('abort', abort)
    if (!admitted) { port.terminate(); await closed }
  }
}

/** @param policy - approved relay host and socket bounds. @param trust - current desktop pairing. @param signer - original desktop signer. @param phonePublicSpki - paired phone pin. @param maxTtlMs - signed challenge cap. @param offer - dial a verified offer; true retires the subscription. @param failed - bounded control failure notice. @returns an awaited stop function. */
export function subscribeDesktopReverse(policy: DesktopWssPolicy, trust: EndpointRelayTrust, signer: P256IdentitySigner,
  phonePublicSpki: string, maxTtlMs: number, offer: (value: ReverseLanOffer, signal: AbortSignal) => Promise<boolean>,
  failed: () => void): () => Promise<void> {
  validateDesktopWssPolicy(policy)
  if (trust.role !== 'desktop' || trust.audience !== policy.host || p256CredentialId(signer.publicSpki) !== trust.credentialId) throw new Error('reverse subscriber trust denied')
  const lifetime = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined, work: Promise<void>
  const subscribe = async () => {
    if (lifetime.signal.aborted || Date.now() >= trust.expiresAt) return
    const renewal = AbortSignal.timeout(DEVICE_ENDPOINT_LEASE_MS / 2)
    const signal = AbortSignal.any([renewal, lifetime.signal])
    let ws: WebSocket | undefined, request: ReverseLanOffer | undefined
    try {
      ws = new WebSocket('wss://' + policy.host + RELAY_CONTROL_PATH, DEVICE_REVERSE_SUBPROTOCOL, {
        headers: { 'X-DSH-Relay-Pair': trust.pairId, 'X-DSH-Relay-Role': 'desktop' }, rejectUnauthorized: true,
        followRedirects: false, perMessageDeflate: false, handshakeTimeout: policy.handshakeMs, maxPayload: policy.maxFrameBytes,
      })
      const port = boundDesktopControl(nodeRelaySocket(ws, policy.maxControlFrames, false), () => ws?.readyState === WebSocket.OPEN, policy)
      request = await exchangeReverseLan({ socket: port, trust, signer, primitives: nodeE2EPrimitives, phonePublicSpki,
        offer: null, clock: Date.now, maxTtlMs, maxBytes: policy.maxFrameBytes, signal })
    } catch (error) { void error; if (!signal.aborted) failed() }
    finally { ws?.terminate() }
    if (lifetime.signal.aborted) return
    if (request !== undefined) {
      try { if (await offer(request, lifetime.signal)) return }
      catch (error) { void error; if (!lifetime.signal.aborted) failed() }
    }
    if (!lifetime.signal.aborted) {
      timer = setTimeout(() => { work = subscribe() }, renewal.aborted ? 0 : policy.handshakeMs)
      timer.unref()
    }
  }
  work = subscribe()
  return async () => { lifetime.abort(); clearTimeout(timer); await work }
}

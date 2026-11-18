/** Concrete Node paired ports. Validation is inert; only the enabled desktop provider's openPorts call dials the exact approved WSS host. */
import WebSocket from 'ws'
import { randomBytes } from 'node:crypto'
import { nodeRelaySocket } from './relay-upgrade.ts'
import { dialApprovedWss } from './wss-client.ts'
import { freshNodeAgreement, nodeE2EPrimitives, p256CredentialId, p256Public } from './p256-channel.ts'
import { RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL } from '../src/relay-control-protocol.ts'
import type { EndpointRelayTrust } from '../src/relay-control-client.ts'
import type { PairedRelayPorts } from '../src/paired-relay.ts'
import type { P256IdentitySigner } from '../src/e2e-channel.ts'
import type { RelaySocket } from './relay-core.ts'
import { DEVICE_ENDPOINT_LEASE_MS, DEVICE_ENDPOINT_SUBPROTOCOL, exchangeDeviceEndpoints, type DeviceEndpoints } from '../src/device-endpoint-exchange.ts'
/** Deployment limits contain no bearer token, identity/private key, arbitrary URL path or DSH namespace. */
export interface DesktopWssPolicy { readonly host: string; readonly handshakeMs: number; readonly maxFrameBytes: number; readonly maxBufferedBytes: number; readonly maxControlFrames: number }
/** @param policy - local deployment bounds. @returns after inert validation; no network, private key or timer is created. */
export function validateDesktopWssPolicy(policy: DesktopWssPolicy): void { if (!/^[a-z0-9.-]+$/.test(policy.host) || policy.host.endsWith('.invalid') || ![policy.handshakeMs, policy.maxFrameBytes, policy.maxBufferedBytes, policy.maxControlFrames].every(value => Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff) || policy.maxBufferedBytes < policy.maxFrameBytes) throw new Error('desktop WSS policy denied') }
/** @param control - owned text transport with a live bufferedAmount getter. @param isOpen - current transport state. @param policy - validated send limits. @returns the same port, closing before rejecting an empty, oversized, congested or disconnected send. */
export function boundDesktopControl(control: RelaySocket, isOpen: () => boolean, policy: Pick<DesktopWssPolicy, 'maxFrameBytes' | 'maxBufferedBytes'>): RelaySocket {
  const send = control.send
  control.send = bytes => { if (!isOpen() || bytes.byteLength === 0 || bytes.byteLength > policy.maxFrameBytes || control.bufferedAmount + bytes.byteLength > policy.maxBufferedBytes) { control.terminate(); throw new Error('desktop control send denied') }; send.call(control, bytes) }
  return control
}
/** @param policy - explicitly enabled native desktop policy. @param trust - already confirmed public routing record. @param signer - existing host-owned identity key port; never generated/loaded here. @param remotePublicSpki - previously confirmed phone pin. @returns opened exact control transport plus room-local data/transient-key factories; TLS verification, no redirects/compression, no persistent key creation. */
export function openDesktopWssPorts(policy: DesktopWssPolicy, trust: EndpointRelayTrust, signer: P256IdentitySigner, remotePublicSpki: string): PairedRelayPorts {
  validateDesktopWssPolicy(policy); if (trust.role !== 'desktop' || trust.audience !== policy.host || trust.expiresAt <= Date.now() || p256CredentialId(signer.publicSpki) !== trust.credentialId) throw new Error('desktop WSS trust denied'); p256Public(remotePublicSpki)
  const ws = new WebSocket('wss://' + policy.host + RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL, { headers: { 'X-DSH-Relay-Pair': trust.pairId, 'X-DSH-Relay-Role': 'desktop' }, rejectUnauthorized: true, followRedirects: false, perMessageDeflate: false, handshakeTimeout: policy.handshakeMs, maxPayload: policy.maxFrameBytes }), control = boundDesktopControl(nodeRelaySocket(ws, policy.maxControlFrames, false), () => ws.readyState === WebSocket.OPEN, policy)
  control.ready = () => { throw new Error('desktop client cannot issue readiness') }
  return { control, signer, primitives: nodeE2EPrimitives, remotePublicSpki, clock: Date.now, scheduler: { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }, agreement: async () => ({ key: freshNodeAgreement(), nonce: randomBytes(32) }), data: async lease => dialApprovedWss({ url: 'wss://' + policy.host + '/harmony/relay/v1', expectedHost: policy.host, room: lease.receipt.room, role: 'desktop', token: lease.receipt.token, handshakeTimeoutMs: policy.handshakeMs, maxFrameBytes: policy.maxFrameBytes, maxBufferedBytes: policy.maxBufferedBytes }) }
}

/** @param policy - approved WSS host and limits. @param trust - confirmed routing identity. @param signer - desktop identity. @param candidates - read the current desktop interfaces after the listener is ready. @param maxTtlMs - local challenge lifetime limit. @param failed - content-free failure notice. @returns a disposer for the publication loop. */
export function startDesktopEndpointPublisher(policy: DesktopWssPolicy, trust: EndpointRelayTrust, signer: P256IdentitySigner,
  candidates: () => DeviceEndpoints, maxTtlMs: number, failed: () => void): () => Promise<void> {
  validateDesktopWssPolicy(policy)
  if (trust.role !== 'desktop' || trust.audience !== policy.host || p256CredentialId(signer.publicSpki) !== trust.credentialId) throw new Error('endpoint publisher trust denied')
  let timer: ReturnType<typeof setTimeout> | undefined, closing = false, attempt: AbortController | undefined, work: Promise<void>
  const publish = async () => {
    if (closing || Date.now() >= trust.expiresAt) return
    const controller = new AbortController(); attempt = controller
    const deadline = setTimeout(() => controller.abort(), policy.handshakeMs)
    let ws: WebSocket | undefined
    try {
      ws = new WebSocket('wss://' + policy.host + RELAY_CONTROL_PATH, DEVICE_ENDPOINT_SUBPROTOCOL, {
        headers: { 'X-DSH-Relay-Pair': trust.pairId, 'X-DSH-Relay-Role': 'desktop' }, rejectUnauthorized: true,
        followRedirects: false, perMessageDeflate: false, handshakeTimeout: policy.handshakeMs, maxPayload: policy.maxFrameBytes,
      })
      const port = boundDesktopControl(nodeRelaySocket(ws, policy.maxControlFrames, false), () => ws?.readyState === WebSocket.OPEN, policy)
      await exchangeDeviceEndpoints({ socket: port, trust, signer, primitives: nodeE2EPrimitives,
        desktopPublicSpki: signer.publicSpki, candidates: candidates(), clock: Date.now, maxTtlMs, maxBytes: policy.maxFrameBytes, signal: controller.signal })
    } catch (error) { void error; if (!closing) failed() }
    finally { clearTimeout(deadline); ws?.terminate(); if (attempt === controller) attempt = undefined }
    if (!closing) { timer = setTimeout(() => { work = publish() }, DEVICE_ENDPOINT_LEASE_MS / 2); timer.unref() }
  }
  work = publish()
  return async () => { closing = true; clearTimeout(timer); attempt?.abort(); await work }
}

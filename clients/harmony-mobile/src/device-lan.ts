/** A local device connection uses the saved identity and a fresh encrypted channel independent of the relay. */
import { EncryptedRelayConnection, type E2EDiagnostic } from '../integration/e2e-socket.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { RelaySocket } from '../integration/relay-core.ts'
import { P256SecureChannel } from './e2e-channel.ts'
import { PairedRelayEndpoint, PairedRelayFailure, type DeviceCryptoPorts, type PairedRelayPolicy, type PairedRelayPorts } from './paired-relay.ts'
import type { ControlDiagnostic, EndpointRelayTrust } from './relay-control-client.ts'
import { id } from './protocol.ts'
import type { JsonValue } from './upstream.ts'

/** The role's local socket owner is closed even if acquisition or E2E negotiation fails. */
export interface DeviceLanPorts extends DeviceCryptoPorts {
  readonly lan: { open(signal: AbortSignal): Promise<RelaySocket>; close(): Promise<void> }
}
export type DeviceLinkPorts = PairedRelayPorts | DeviceLanPorts
export type DeviceEndpoint = Pick<PairedRelayEndpoint, 'send' | 'close' | 'settled'>
type DeviceReady = (binding: DeviceTransportBinding, connection: EncryptedRelayConnection, deadline: number) => void
type DeviceEnd = (state: 'closed' | 'failed') => void

/** @param trust - saved device identity and local connection deadline. @param policy - E2E and queue limits. @param ports - one explicit carrier. @param received - authenticated data sink. @param ready - exact E2E binding and deadline. @param notice - terminal state sink. @param lifetime - owner cancellation. @param diagnostic - fixed E2E stage sink. @param controlDiagnostic - fixed relay control stage sink. @returns an owned endpoint with no carrier fallback. */
export function openDeviceEndpoint(trust: EndpointRelayTrust, policy: PairedRelayPolicy, ports: DeviceLinkPorts,
  received: (value: JsonValue) => Promise<void>, ready: DeviceReady, notice: DeviceEnd, lifetime: AbortSignal,
  diagnostic?: (stage: E2EDiagnostic) => void, controlDiagnostic?: (stage: ControlDiagnostic) => void): DeviceEndpoint {
  if (!('lan' in ports)) return new PairedRelayEndpoint(trust, policy, ports, received, ready, notice, lifetime, diagnostic, controlDiagnostic)

  const controller = new AbortController()
  const signal = controller.signal
  let connection: EncryptedRelayConnection | undefined
  let closed = false, failed = false, cleanupFailed = false
  let closing: Promise<void> | undefined
  let stopEnd = () => {}
  const release = (actions: readonly (() => void)[]) => {
    for (const action of actions) {
      try { action() } catch (error) { void error; cleanupFailed = true }
    }
  }
  const close = () => {
    if (closed) return
    closed = true
    lifetime.removeEventListener('abort', close)
    release([() => controller.abort(), stopEnd, () => connection?.close()])
    closing = Promise.resolve().then(() => ports.lan.close())
    void closing.catch(error => { void error; cleanupFailed = true })
    release([() => notice(failed ? 'failed' : 'closed')])
  }
  lifetime.addEventListener('abort', close, { once: true })
  const opening = (async () => {
    lifetime.throwIfAborted()
    const material = await ports.agreement()
    let socket: RelaySocket | undefined
    try {
      signal.throwIfAborted()
      socket = await ports.lan.open(signal)
      signal.throwIfAborted()
      const room = id<'harmony-relay-room'>('lan-v1:' + trust.pairId)
      const crypto = new P256SecureChannel(trust.role, room, material.key, material.nonce, ports.remotePublicSpki, policy.e2e, ports.primitives)
      stopEnd = socket.onEnd(close)
      const encrypted = new EncryptedRelayConnection(socket, crypto, ports.signer, policy.maxQueuedBytes, received,
        binding => ready(binding, encrypted, trust.expiresAt), ports.scheduler, policy.handshakeMs, signal, diagnostic ?? ports.diagnostic)
      connection = encrypted
      if (trust.role === 'desktop') { socket.ready(); encrypted.start() }
    } catch (error) {
      if (connection === undefined) release([() => material.key.close(), () => socket?.terminate()])
      throw error
    }
  })().catch(error => { void error; if (!closed) { failed = !signal.aborted; close() } })
  return {
    close,
    async send(value) { if (closed || connection === undefined) throw new Error('LAN connection unavailable'); await connection.send(value) },
    async settled() {
      await opening
      const results = await Promise.allSettled([closing, connection?.settled()])
      const releaseFailed = cleanupFailed || results.some(result => result.status === 'rejected')
      if (failed || releaseFailed) throw new PairedRelayFailure(failed, releaseFailed)
    },
  }
}

/** Native import facade for shared control/E2E/device-proof code. Native UI owns these ports; this module is never loaded by a rich guest. */
import { PairedRelayEndpoint, type PairedRelayPolicy, type PairedRelayPorts } from './paired-relay.ts'
import { DeviceProofClient } from './device-proof-client.ts'
import { fields } from './link-protocol.ts'
import { jsonPayload } from './wire.ts'
import { id } from './protocol.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { E2EDiagnostic } from '../integration/e2e-socket.ts'
import type { ControlDiagnostic } from './relay-control-client.ts'
import { exchangeDeviceEndpoints, type DeviceEndpoints } from './device-endpoint-exchange.ts'
import type { RelaySocket } from '../integration/relay-core.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import { exchangeReverseLan, type ReverseLanOffer } from './device-reverse-control.ts'
export { DEVICE_ENDPOINT_SUBPROTOCOL } from './device-endpoint-exchange.ts'
export { DEVICE_REVERSE_SUBPROTOCOL } from './device-reverse-control.ts'
export { ReverseTcpPort, admitReverseTcp } from './device-reverse-tcp.ts'

/** @returns a native-owned cancellation controller for one reverse attempt. */
export function reverseAttemptController(): AbortController { return new AbortController() }

/** @param socket - dedicated native reverse control port. @param pair - current paired identity. @param epoch - pairing epoch. @param host - paired relay audience. @param expiresAt - local trust deadline. @param offer - active Wi-Fi listener and one-use nonce. @param signer - original phone signer. @param primitives - native crypto. @param maxTtlMs - challenge cap. @param maxBytes - control frame cap. @param signal - bounded attempt. @returns after the signed offer reaches a subscribed desktop. */
export async function publishNativeReverse(socket: RelaySocket, pair: string, epoch: number, host: string, expiresAt: number,
  offer: ReverseLanOffer, signer: P256IdentitySigner, primitives: E2EPrimitives, maxTtlMs: number, maxBytes: number, signal: AbortSignal): Promise<void> {
  const trust = { pairId: id<'harmony-relay-pair'>(pair), epoch, role: 'phone' as const, audience: host, expiresAt,
    credentialId: await primitives.credentialId(signer.publicSpki) }
  await exchangeReverseLan({ socket, trust, signer, primitives, phonePublicSpki: signer.publicSpki, offer, clock: Date.now, maxTtlMs, maxBytes, signal })
}
export { DEVICE_LAN_PATH, DEVICE_LAN_PROTOCOL, hasDeviceMeshRoute, ipv4SubnetBroadcast, isDeviceLanEndpoint, isDeviceLanPort, isDeviceTailnetAddress, isIpv4InSubnet } from './device-lan-address.ts'
export { DEVICE_LAN_DISCOVERY_BYTES, lanDiscoveryMessage, lanDiscoveryScope } from './device-lan-discovery.ts'
/** @param socket - native address control socket. @param pair - original routing pair. @param epoch - original pairing epoch. @param host - paired relay audience. @param expiresAt - local connection lifetime bound. @param desktopPublicSpki - confirmed desktop signer. @param signer - original phone signer. @param primitives - native verification port. @param maxTtlMs - proof freshness limit. @param maxBytes - frame cap. @param signal - connection lifetime. @returns verified direct addresses, if currently published. */
export async function lookupNativeDeviceEndpoints(socket: RelaySocket, pair: string, epoch: number, host: string, expiresAt: number,
  desktopPublicSpki: string, signer: P256IdentitySigner, primitives: E2EPrimitives, maxTtlMs: number, maxBytes: number, signal: AbortSignal): Promise<DeviceEndpoints | null> {
  const trust = { pairId: id<'harmony-relay-pair'>(pair), epoch, role: 'phone' as const, audience: host, expiresAt,
    credentialId: await primitives.credentialId(signer.publicSpki) }
  return (await exchangeDeviceEndpoints({ socket, trust, signer, primitives, desktopPublicSpki, candidates: null, clock: Date.now, maxTtlMs, maxBytes, signal })).candidates
}
/** Narrow JSON facade keeps unknown/DSH Peer types out of ArkTS; runtime validates every record before signing or delivery. */
export class NativePairedCore {
  private readonly lifetime = new AbortController()
  private readonly endpoint: PairedRelayEndpoint
  private binding: DeviceTransportBinding | undefined
  private authorized = false
  /** @param record - native-owned local paired routing/grant JSON. @param policy - native-owned explicit budgets. @param ports - native signer/crypto/network lifetimes. @param status - native UI callback, never a guest port. @param received - bounded response/frame JSON for the trusted native product adapter. @param diagnostic - optional fixed handshake facts; omission emits nothing and no plaintext enters this sink. @param controlDiagnostic - optional fixed control facts; omission emits nothing. */
  constructor(record: string, policy: PairedRelayPolicy, ports: PairedRelayPorts, status: (state: string) => void, received: (packet: string) => void, diagnostic?: (stage: E2EDiagnostic) => void, controlDiagnostic?: (stage: ControlDiagnostic) => void) {
    const value = fields(JSON.parse(record), ['pairId', 'epoch', 'audience', 'credentialId', 'expiresAt', 'desktopCredentialId', 'grant']), epoch = value.epoch, expiresAt = value.expiresAt; if (typeof epoch !== 'number' || typeof expiresAt !== 'number' || !Number.isSafeInteger(epoch) || epoch <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= ports.clock()) throw new Error('native paired record denied')
    const text = (item: unknown) => { if (typeof item !== 'string' || item.length === 0 || item.length > 256) throw new Error('native paired record denied'); return item }, authority = {}, proof = new DeviceProofClient(authority, value.grant, id<'harmony-device-credential'>(text(value.desktopCredentialId)), ports.signer, ports.primitives, ports.clock, policy.maxProofs, this.lifetime.signal)
    this.endpoint = new PairedRelayEndpoint({ pairId: id<'harmony-relay-pair'>(text(value.pairId)), epoch, role: 'phone', audience: text(value.audience), credentialId: id<'harmony-device-credential'>(text(value.credentialId)), expiresAt }, policy, ports, async data => {
      if (this.binding === undefined) throw new Error('native binding required')
      if (!this.authorized) { const packet = fields(data, data !== null && typeof data === 'object' && 'kind' in data && data.kind === 'authorized' ? ['kind'] : ['kind', 'value']); if (packet.kind === 'device-challenge') await this.endpoint.send(jsonPayload({ kind: 'device-proof', value: await proof.proof(authority, this.binding, packet.value) })); else if (packet.kind === 'authorized') { this.authorized = true; status('authorized') } else throw new Error('native device proof required'); return }
      received(JSON.stringify(data))
    }, binding => { this.binding = binding; this.authorized = false; status('identity-authenticated'); binding.signal.addEventListener('abort', () => { if (this.binding === binding) { this.authorized = false; status('disconnected') } }, { once: true }) }, state => { this.authorized = false; status(state === 'failed' ? 'connection-failed' : 'control-closed') }, this.lifetime.signal, diagnostic, controlDiagnostic)
  }
  /** @param idText - native-owned correlation id; preserved command ids stay in payload. @param packet - fixed metadata/request fields JSON. @returns after bounded encrypted send, never a task completion claim. */
  async request(idText: string, packet: string): Promise<void> { const value = fields(JSON.parse(packet), ['method', 'argument']); if (!this.authorized || value.method !== 'metadata' && value.method !== 'request') throw new Error('native request denied'); await this.endpoint.send(jsonPayload({ kind: 'request', id: id<'harmony-carrier-request'>(idText), value })) }
  /** @param idText - subscriber correlation id. @param packet - fixed follow argument/resume JSON. @returns after authenticated stream subscription; original cursor is preserved. */
  async follow(idText: string, packet: string): Promise<void> { const value = fields(JSON.parse(packet), ['argument', 'resume']); if (!this.authorized) throw new Error('native follow denied'); await this.endpoint.send(jsonPayload({ kind: 'follow', id: id<'harmony-carrier-request'>(idText), value })) }
  /** @param idText - existing subscriber/wait id. @returns after wait cancellation; it does not issue session.cancel. */
  async stop(idText: string): Promise<void> { if (this.authorized) await this.endpoint.send({ kind: 'stop', id: idText }) }
  /** @returns after all native/crypto acquisitions settle; no automatic foreground reconnect or key creation. */
  async close(): Promise<void> { this.lifetime.abort(); this.authorized = false; this.endpoint.close(); await this.endpoint.settled() }
}

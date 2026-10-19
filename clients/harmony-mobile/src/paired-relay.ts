/** Shared paired control/data lifecycle, used by desktop and native hosts. Fresh E2E material belongs to each room; no grant, task or signer is exposed to rich guests. */
import { RelayControlClient, type EndpointRelayTrust, type EndpointRoomLease, type ControlDiagnostic } from './relay-control-client.ts'
import { P256SecureChannel, type P256Agreement, type P256IdentitySigner, type E2EPrimitives, type E2ELimits } from './e2e-channel.ts'
import { EncryptedRelayConnection, type E2EDiagnostic } from '../integration/e2e-socket.ts'
import type { RelaySocket } from '../integration/relay-core.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { JsonValue } from './upstream.ts'
/** Local policy is explicit before any native/Node socket or agreement key acquisition. */
export interface PairedRelayPolicy { readonly maxProofs: number; readonly maxQueuedBytes: number; readonly maxChallengeTtlMs: number; readonly maxRoomTtlMs: number; readonly handshakeMs: number; readonly e2e: E2ELimits }
/** @param policy - explicit local limits. @returns after inert validation, before any transport or timer acquisition. */
export function validatePairedRelayPolicy(policy: PairedRelayPolicy): void { if (![policy.maxProofs, policy.maxQueuedBytes, policy.maxChallengeTtlMs, policy.maxRoomTtlMs, policy.handshakeMs, ...Object.values(policy.e2e)].every(value => Number.isSafeInteger(value) && value > 0) || policy.e2e.maxFrames > 0xffffffff) throw new Error('invalid paired relay policy') }
/** Endpoints supply platform IO and maintained crypto ports; source returns transient keys only, after a signed room exists. */
export interface PairedRelayPorts { readonly control: RelaySocket; readonly signer: P256IdentitySigner; readonly primitives: E2EPrimitives; readonly remotePublicSpki: string; readonly scheduler: CleanupScheduler; readonly clock: () => number; agreement(): Promise<{ readonly key: P256Agreement; readonly nonce: Uint8Array }>; data(lease: EndpointRoomLease): Promise<RelaySocket> }
/** One control connection and its successive room generations. Transport loss never resubmits an application request. */
export class PairedRelayEndpoint {
  private readonly controller: RelayControlClient
  private current: EncryptedRelayConnection | undefined
  private generation = 0
  private closed = false
  private tail: Promise<void> = Promise.resolve()
  private failure = false
  private readonly dataConnections = new Set<EncryptedRelayConnection>()
  private stopControl: () => void = () => {}
  private release(actions: readonly (() => void)[]): void { for (const action of actions) { try { action() } catch (error) { void error; this.failure = true } } }
  /** @param trust - locally confirmed routing identity. @param policy - explicit bounds. @param ports - native/Node owner ports. @param received - authenticated plaintext delivery. @param ready - exact new binding and encrypted connection. @param notice - content-free closure/failure sink; no pending request success is implied. @param lifetime - pairing/device policy lifetime. @param diagnostic - optional fixed handshake facts; omission emits nothing. @param controlDiagnostic - optional fixed control facts; omission emits nothing and no payload reaches this sink. */
  constructor(trust: EndpointRelayTrust, policy: PairedRelayPolicy, ports: PairedRelayPorts, received: (value: JsonValue) => Promise<void>, ready: (binding: DeviceTransportBinding, connection: EncryptedRelayConnection) => void, private readonly notice: (state: 'closed' | 'failed') => void, lifetime: AbortSignal, diagnostic?: (stage: E2EDiagnostic) => void, controlDiagnostic?: (stage: ControlDiagnostic) => void) {
    validatePairedRelayPolicy(policy)
    this.controller = new RelayControlClient(ports.control, trust, ports.signer, ports.primitives, ports.clock, policy.maxProofs, policy.maxQueuedBytes, policy.maxChallengeTtlMs, policy.maxRoomTtlMs, ports.scheduler, lease => {
      const generation = ++this.generation; this.current?.close(); this.current = undefined
      this.tail = this.tail.then(async () => {
        if (this.closed || lease.signal.aborted || generation !== this.generation) return
        const material = await ports.agreement(); if (this.closed || lease.signal.aborted || generation !== this.generation) { this.release([() => material.key.close()]); return }
        let socket: RelaySocket | undefined, crypto: P256SecureChannel | undefined
        try {
          socket = await ports.data(lease); if (this.closed || lease.signal.aborted || generation !== this.generation) { const late = socket; this.release([() => late.terminate(), () => material.key.close()]); return }
          crypto = new P256SecureChannel(trust.role, lease.receipt.room, material.key, material.nonce, ports.remotePublicSpki, policy.e2e, ports.primitives)
          const connection = new EncryptedRelayConnection(socket, crypto, ports.signer, policy.maxQueuedBytes, received, binding => { if (this.closed || lease.signal.aborted || generation !== this.generation) return; ready(binding, connection) }, ports.scheduler, policy.handshakeMs, lease.signal, diagnostic)
          this.current = connection; this.dataConnections.add(connection)
        } catch (error) { void error; const acquired = socket, channel = crypto; this.release([() => channel?.close(), () => material.key.close(), () => acquired?.terminate()]); throw new Error('paired data acquisition failed') }
      }).catch(error => { void error; if (!this.closed) { this.failure = true; this.close(); this.release([() => this.notice('failed')]) } })
    }, lifetime, controlDiagnostic)
    try { this.stopControl = ports.control.onEnd(() => { this.close() }) } catch (error) { void error; this.controller.close(); throw new Error('paired control acquisition failed') }
  }
  /** @param value - original application request, never automatically retried. @returns after authenticated bounded send; no task receipt is implied. */
  send(value: JsonValue): Promise<void> { if (this.closed || this.current === undefined) return Promise.reject(new Error('paired connection unavailable')); return this.current.send(value) }
  /** @returns nothing; deny and close all generations before async teardown. */
  close(): void { if (this.closed) return; this.closed = true; this.generation++; this.release([this.stopControl, () => this.controller.close(), () => this.current?.close(), ...[...this.dataConnections].map(connection => () => connection.close()), () => this.notice('closed')]); this.current = undefined }
  /** @returns after pending native/crypto acquisitions and every encrypted queue settles; failures stay visible. */
  async settled(): Promise<void> { await this.tail; const results = await Promise.allSettled([this.controller.settled(), ...[...this.dataConnections].map(connection => connection.settled())]); if (this.failure || results.some(value => value.status === 'rejected')) throw new Error('paired connection failed'); if (this.closed) this.dataConnections.clear() }
}

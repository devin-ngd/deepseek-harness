/** Native device-binding carrier reuses the existing E2E/control ports and original identity; never exposed to HTML. */
import { z } from 'zod'
import { DeviceConnectionFailure, deviceConnectionFailure, type DeviceConnectionStage, type DeviceConnectionCategory } from './device-connection-diagnostic.ts'
import type { ControlDiagnostic } from './relay-control-client.ts'
import type { E2EDiagnostic } from '../integration/e2e-socket.ts'
import { PairedRelayFailure, PairedRelayEndpoint, type PairedRelayPolicy, type PairedRelayPorts } from './paired-relay.ts'
import { DeviceBindingClient } from './device-binding-client.ts'
import { deviceBindingSchema, deviceRelayPairId, type DeviceConnectionTicket } from './device-binding-protocol.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import { fields, text } from './link-protocol.ts'
import { jsonPayload } from './wire.ts'
import { id } from './protocol.ts'
import { verifyDeviceRoute, type DeviceRoute } from './device-route-protocol.ts'
import type { ProductConnection } from './paired-product-transport.ts'

const route = z.object({ desktopId: z.string().min(1).max(256), profileId: z.literal('desktop'), sessionId: z.string().min(1).max(256) }).strict()
/** Existing native crypto/socket owner supplies all ports; only public registration and a routing deadline are input JSON. */
export class NativeDeviceCore implements ProductConnection {
  private readonly authority = {}
  private readonly client: DeviceBindingClient
  private readonly lifetime = new AbortController()
  private authorizedResolve: () => void = () => {}
  private authorizedReject: (error: Error) => void = () => {}
  private readonly authorized = new Promise<void>((resolve, reject) => { this.authorizedResolve = resolve; this.authorizedReject = reject })
  private endpoint: PairedRelayEndpoint | undefined
  private originalBinding: DeviceTransportBinding | undefined
  private receipt: DeviceConnectionTicket | undefined
  private phase: DeviceConnectionStage = 'identity-read'
  private firstFailure: DeviceConnectionFailure | undefined
  private proofPending = false
  private unexpectedClose = false
  private closed = false
  private failed = false
  private closing: Promise<void> | undefined
  private stopHandshake = () => {}
  private stopTicket = () => {}
  /** @param registration - locally confirmed public device receipt, never a relay-provided grant. @param routingExpiresAt - independent finite relay directory/connection lease. @param policy - existing explicit control/E2E budgets. @param ports - existing HUKS/native transport and maintained crypto. @param status - trusted native state sink. @param received - bounded result/frame sink for the original PhoneCore transport. */
  constructor(private readonly registration: string, private readonly routingExpiresAt: number, private readonly policy: PairedRelayPolicy, private readonly ports: PairedRelayPorts, private readonly status: (state: string) => void, private readonly received: (packet: string) => void, private readonly route: DeviceRoute | undefined) {
    const value = deviceBindingSchema.parse(JSON.parse(registration))
    if (value.revoked || routingExpiresAt <= ports.clock() || value.desktopPublicSpki !== ports.remotePublicSpki) throw new Error('native device routing denied')
    this.client = new DeviceBindingClient(this.authority, { desktopId: value.desktopId, profileId: 'desktop', deviceId: value.deviceId, identityAlias: value.identityAlias, desktopCredentialId: value.desktopCredentialId, audience: value.audience, maxPublicBytes: policy.e2e.maxPlaintextBytes, maxProofs: policy.maxProofs, maxChallengeTtlMs: policy.maxChallengeTtlMs }, { read: async () => registration, compareAndSet: async () => { throw new Error('connection cannot replace device registration') } }, ports.signer, ports.primitives, ports.clock)
    void this.authorized.catch(() => {})
  }
  private report(state: string): void { try { this.status(state) } catch (error) { void error; this.failed = true } }
  private remember(stage: DeviceConnectionStage, category: DeviceConnectionCategory): void { this.firstFailure ??= new DeviceConnectionFailure(stage, category) }
  private controlFact(fact: ControlDiagnostic): void {
    if (this.closed && !this.unexpectedClose || this.failed) return
    if (fact.startsWith('failure-')) this.remember(this.phase === 'active-channel' ? 'active-channel' : fact.startsWith('failure-identity:') || fact.startsWith('failure-sign:') ? 'identity-read' : 'control-handshake', fact.endsWith(':format') ? 'invalid' : 'refused')
    else if (fact === 'challenge-deadline' || fact === 'trust-deadline') this.remember('control-handshake', 'timeout')
    else if (this.phase === 'active-channel') return
    else if (fact === 'room-validated') this.phase = 'encrypted-handshake'
    else if (fact !== 'closed') this.phase = 'control-handshake'
  }
  private encryptedFact(fact: E2EDiagnostic): void {
    if (this.closed && !this.unexpectedClose || this.failed) return
    if (fact === 'handshake-deadline') this.remember('encrypted-handshake', 'timeout')
    else if (fact.startsWith('failure-') || fact === 'frame-budget-rejected') this.remember(this.phase === 'active-channel' ? 'active-channel' : this.phase === 'ticket' ? 'ticket' : 'encrypted-handshake', 'refused')
    else if (fact !== 'closed' && this.phase !== 'ticket' && this.phase !== 'active-channel') this.phase = 'encrypted-handshake'
  }
  /** Earlier protocol evidence wins over a later native open or cleanup exception. */
  connectionFailure(error: unknown, stage: DeviceConnectionStage): DeviceConnectionFailure { return this.firstFailure ?? deviceConnectionFailure(error, stage) }
  private fail(category: DeviceConnectionCategory = 'unavailable'): void { if (this.closed || this.failed) return; this.remember(this.phase, category); this.failed = true; this.receipt = undefined; this.authorizedReject(this.firstFailure!); this.report('connection-failed'); this.endpoint?.close() }
  /** Verify the original public receipt before installing network handlers; the native owner opens its control socket afterward. */
  async initialize(): Promise<void> {
    if (this.closed || this.endpoint !== undefined) throw new Error('native device already initialized')
    const value = await this.client.load(this.authority)
    const route = this.route === undefined ? undefined : await verifyDeviceRoute(this.route, this.ports.primitives, value, this.ports.clock())
    const context = route === undefined ? undefined : { routeId: route.offer.routeId, routeEpoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt }
    if (route !== undefined && route.offer.expiresAt !== this.routingExpiresAt) throw new Error('native routing deadline mismatch')
    if (this.closed) throw new Error('native device closed')
    this.stopHandshake = this.ports.scheduler.after(this.policy.handshakeMs, () => this.fail('timeout'))
    this.phase = 'control-handshake'
    this.endpoint = new PairedRelayEndpoint({ pairId: route === undefined ? deviceRelayPairId(value) : id<'harmony-relay-pair'>(route.offer.routeId), epoch: route?.offer.routeEpoch ?? value.epoch, role: 'phone', audience: value.audience, credentialId: id<'harmony-device-credential'>(value.credentialId), expiresAt: this.routingExpiresAt }, this.policy, { ...this.ports, data: async lease => { try { return await this.ports.data(lease) } catch (error) { this.firstFailure ??= deviceConnectionFailure(error, 'native-channel'); throw error } } }, async data => {
      const binding = this.originalBinding
      if (binding === undefined || binding.signal.aborted) throw new Error('native device binding unavailable')
      if (this.receipt === undefined) {
        const packet = fields(data, ['kind', 'value'])
        if (packet.kind === 'device-binding-challenge' && !this.proofPending) {
          this.proofPending = true; this.phase = 'ticket'
          const proof = await this.client.connectionProof(this.authority, binding, JSON.stringify(packet.value), context)
          if (binding !== this.originalBinding || binding.signal.aborted || this.closed) return
          await this.endpoint!.send(jsonPayload({ kind: 'device-binding-proof', value: proof })); return
        }
        if (packet.kind === 'device-binding-authorized' && this.proofPending) {
          this.phase = 'ticket'
          const ticket = await this.client.ticket(this.authority, binding, packet.value, context)
          if (binding !== this.originalBinding || binding.signal.aborted || this.closed) return
          this.receipt = ticket; this.phase = 'active-channel'; this.stopHandshake(); this.stopTicket = this.ports.scheduler.after(ticket.expiresAt - this.ports.clock(), () => { this.remember('connection-expiry', 'timeout'); this.receipt = undefined; this.report('disconnected'); this.endpoint?.close() }); this.authorizedResolve(); this.report('authorized'); return
        }
        throw new Error('native device proof required')
      }
      if (this.receipt.expiresAt <= this.ports.clock()) throw new Error('native device ticket expired')
      this.received(JSON.stringify(data))
    }, binding => {
      this.phase = 'ticket'; this.originalBinding = binding; this.receipt = undefined; this.proofPending = false; this.report('identity-authenticated')
      binding.signal.addEventListener('abort', () => { if (this.originalBinding === binding && !this.closed) { this.unexpectedClose = true; this.receipt = undefined; this.report('disconnected') } }, { once: true })
    }, state => { if (this.closed) return; if (state === 'failed') this.fail(); else { this.remember(this.phase, 'closed'); this.receipt = undefined; this.authorizedReject(this.firstFailure!); this.report('control-closed') } }, this.lifetime.signal, fact => { this.encryptedFact(fact); this.ports.diagnostic?.(fact) }, fact => { this.controlFact(fact); this.ports.controlDiagnostic?.(fact) })
  }
  /** @returns after the original identity's fresh channel proof, never just broker readiness. */
  ready(): Promise<void> { return this.authorized }
  /** @returns exact local crypto binding; native callers cannot choose its id or remote identity. */
  get binding(): DeviceTransportBinding { if (this.originalBinding === undefined) throw new Error('native device crypto binding unavailable'); return this.originalBinding }
  /** @returns reviewed public short ticket for the native product owner; it is never persisted or passed to a rich guest. */
  ticketJson(): string { if (this.receipt === undefined || this.receipt.expiresAt <= this.ports.clock()) throw new Error('native device ticket unavailable'); return JSON.stringify(this.receipt) }
  private active(): PairedRelayEndpoint { if (this.closed || this.failed || this.receipt === undefined || this.receipt.expiresAt <= this.ports.clock() || this.binding.signal.aborted || this.endpoint === undefined) throw new Error('native device request denied'); return this.endpoint }
  private selected(candidate: unknown) { const value = route.parse(candidate), binding = deviceBindingSchema.parse(JSON.parse(this.registration)); if (value.desktopId !== binding.desktopId) throw new Error('native device route denied'); return value }
  /** @param idText - native-owned correlation id. @param raw - only metadata/select/request with an explicit route for Session operations. @returns after encrypted send, never task completion. */
  async request(idText: string, raw: string): Promise<void> {
    const endpoint = this.active(); if (new TextEncoder().encode(raw).length > this.policy.e2e.maxPlaintextBytes) throw new Error('native device packet capacity'); const value = JSON.parse(raw), method = value?.method
    if (method === 'metadata') { const packet = fields(value, ['method', 'argument']); if (packet.argument !== null) throw new Error('native device metadata denied') }
    else if (method === 'select') this.selected(fields(value, ['method', 'route']).route)
    else if (method === 'request') this.selected(fields(value, ['method', 'route', 'argument']).route)
    else throw new Error('native device method denied')
    await endpoint.send(jsonPayload({ kind: 'request', id: text(idText), value }))
  }
  /** @param idText - native-owned subscriber id. @param raw - exact route/argument/resume JSON. @returns after encrypted subscription send. */
  async follow(idText: string, raw: string): Promise<void> { if (new TextEncoder().encode(raw).length > this.policy.e2e.maxPlaintextBytes) throw new Error('native device packet capacity'); const endpoint = this.active(), value = fields(JSON.parse(raw), ['route', 'argument', 'resume']); this.selected(value.route); await endpoint.send(jsonPayload({ kind: 'follow', id: text(idText), value })) }
  /** @param idText - existing subscriber/request wait. @returns after wait cancellation; accepted tasks are never cancelled implicitly. */
  async stop(idText: string): Promise<void> { if (!this.closed && this.receipt !== undefined) await this.active().send({ kind: 'stop', id: text(idText) }) }
  /** Close this finite channel and proof client; original identity and persistent registration remain owned by native storage. */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closed = true; this.receipt = undefined; this.lifetime.abort(); this.stopHandshake(); this.stopTicket(); this.client.close(); this.authorizedReject(new Error('native device closed'))
    this.closing = (async () => { this.endpoint?.close(); try { await this.endpoint?.settled() } catch (error) { if (!(error instanceof PairedRelayFailure) || error.cleanupFailed) throw error } })()
    return this.closing
  }
}

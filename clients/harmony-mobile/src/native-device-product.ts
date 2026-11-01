/** Native device product composition; navigation and HTML share the original PhoneCore/rich owner without arbitrary Host APIs. */
import { z } from 'zod'
import { deviceStartupFailure, deviceStartupDiagnosticText, type DeviceStartupFailure, type DeviceStartupStage } from './device-startup-diagnostic.ts'
import { deviceConnectionFailure, deviceConnectionDiagnosticText, type DeviceConnectionStage } from './device-connection-diagnostic.ts'
export { DeviceConnectionFailure, deviceConnectionFailure, deviceConnectionDiagnosticText } from './device-connection-diagnostic.ts'
import { DeviceBindingClient } from './device-binding-client.ts'
import { deviceBindingSchema, deviceBindingOfferSchema, deviceRelayPairId, type DeviceBinding, type DeviceBindingOffer } from './device-binding-protocol.ts'
import { DeviceBoundMobileProduct, type DeviceProductConnection, type DeviceMobileView } from './mobile-device-product.ts'
import { DevicePhoneSession } from './device-phone-session.ts'
import { DeviceProductRpc } from './device-product-rpc.ts'
import { NativeDeviceCore } from './native-device-bridge.ts'
import { parseProductPolicy } from './native-product-facade.ts'
import type { MobileProductPolicy, MobileProductView } from './mobile-product.ts'
import type { ProductTrustStorage } from './product-trust.ts'
import type { DeviceBindingStorage } from '../desktop-plugin/src/device-binding.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import type { PairedRelayPorts, PairedRelayPolicy } from './paired-relay.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import { fields } from './link-protocol.ts'
import { DeviceRouteOwner } from './device-route-owner.ts'
import { ProductRouteStorage } from './product-route-storage.ts'
import { deviceRouteSchema } from './device-route-protocol.ts'

/** Existing native owner acquires original-key crypto and verified WSS; open is separate so receipt validation precedes socket opening. */
export interface NativeDeviceNetwork { readonly ports: PairedRelayPorts; open(): Promise<void>; authenticated(): void; close(): Promise<void> }
/** JSON-free native original-identity crypto; no private bytes are exposed. */
export interface NativeDeviceCrypto { readonly signer: P256IdentitySigner; readonly primitives: E2EPrimitives }
/** One actual native page composition. Default-disabled construction and boot acquire no network. */
export class NativeDeviceProductFacade {
  private readonly policy: MobileProductPolicy
  private readonly storage: DeviceBindingStorage
  private client: DeviceBindingClient | undefined
  private device: DeviceBoundMobileProduct | undefined
  private selected: DevicePhoneSession | undefined
  private closed = false
  private connectionApproved = false
  private revoked = false
  private writeTail: Promise<void> = Promise.resolve()
  private publicRead: Promise<string | null> | undefined
  private cached: string | null = null
  private loaded = false
  private ioBlocked = false
  private stopCatalog = () => {}
  private polling: Promise<void> | undefined
  private catalogError = ''
  private readonly routeStorage: ProductRouteStorage | undefined
  private readonly routes: DeviceRouteOwner | undefined
  private startupFailure: DeviceStartupFailure | undefined
  private recoveryVerified = false
  private hasRoute = false
  private routeDeadline = 0
  private readonly routingLeaseMs: number
  /** @param authority - exact native UI owner. @param policyJson - existing default-disabled product/domain limits. @param identityAlias - original selected HUKS alias. @param host - approved existing relay host. @param routingExpiresAt - independent public relay directory deadline. @param relay - existing control/E2E capacities. @param publicStorage - separate app-private device public file. @param crypto - original native signer and maintained backend. @param scheduler - native timers. @param clock - trusted native clock. @param acquire - original native WSS acquisition, called only on connect. @param publish - sanitized original page DTO sink. */
  constructor(private readonly authority: object, policyJson: string, private readonly identityAlias: string, private readonly host: string, private readonly routingExpiresAt: number, private readonly relay: PairedRelayPolicy, private readonly publicStorage: ProductTrustStorage, private readonly crypto: NativeDeviceCrypto, private readonly scheduler: CleanupScheduler, private readonly clock: () => number, private readonly acquire: (registration: string, diagnostic?: (stage: string) => void) => Promise<NativeDeviceNetwork>, private readonly publish: (view: string) => void, private readonly catalogRefreshMs: number, routeStorage?: ProductTrustStorage, private readonly pairedConnection = false) {
    this.policy = parseProductPolicy(policyJson)
    this.routingLeaseMs = routingExpiresAt - clock()
    if (pairedConnection && (!Number.isSafeInteger(this.routingLeaseMs) || this.routingLeaseMs <= relay.maxRoomTtlMs || this.routingLeaseMs > 0x7fffffff)) throw new Error('invalid paired connection lease')
    if (!Number.isSafeInteger(catalogRefreshMs) || catalogRefreshMs <= 0 || catalogRefreshMs > 0x7fffffff) throw new Error('native device catalogue interval denied')
    this.storage = { read: () => this.readPublic(), compareAndSet: (previous, next) => {
      const operation = this.writeTail.then(async () => { if (this.closed || this.ioBlocked || await this.readPublic() !== previous) throw new Error('native device public CAS conflict'); try { await this.publicStorage.write(next); this.cached = next } catch (error) { this.ioBlocked = true; throw error } })
      this.writeTail = operation.then(() => {}, () => {}); return operation
    } }
    if (routeStorage !== undefined) {
      this.routeStorage = new ProductRouteStorage(routeStorage, Math.min(this.policy.trustMaxBytes, 524288))
      this.routes = new DeviceRouteOwner(authority, 'phone', async () => { if (this.client === undefined) throw new Error('native bound device required'); return this.client.load(authority) }, this.routeStorage, crypto.signer, crypto.primitives, clock)
    }
  }
  private readPublic(): Promise<string | null> {
    if (this.closed || this.ioBlocked) return Promise.reject(new Error('native device public state unavailable'))
    if (this.loaded) return Promise.resolve(this.cached)
    this.publicRead ??= this.publicStorage.read(this.policy.trustMaxBytes).then(value => { this.cached = value; this.loaded = true; return value }, error => { this.ioBlocked = true; throw error })
    return this.publicRead
  }
  /** @param raw - strict public device offer or receipt. @returns only original identity/host selection for native bootstrap; no signing or network occurs. */
  static selectionInput(raw: string): string { const value: unknown = JSON.parse(raw), offer = deviceBindingOfferSchema.safeParse(value), record = offer.success ? offer.data.registration : deviceBindingSchema.parse(value); return JSON.stringify({ identityAlias: record.identityAlias, audience: record.audience, bindingId: record.bindingId, desktopPublicSpki: record.desktopPublicSpki }) }
  /** Used only after the facade verifies both signatures before native socket acquisition. */
  static routingInput(raw: string): string { const candidate: unknown = JSON.parse(raw), route = deviceRouteSchema.safeParse(candidate), value = route.success ? route.data.offer.binding : deviceBindingSchema.parse(candidate); return JSON.stringify({ identityAlias: value.identityAlias, audience: value.audience, bindingId: value.bindingId, desktopPublicSpki: value.desktopPublicSpki, routeId: route.success ? route.data.offer.routeId : deviceRelayPairId(value) }) }
  private local(authority: object): void { if (this.closed || this.startupFailure !== undefined || !this.policy.enabled || authority !== this.authority) throw new Error('native device product disabled') }
  private makeClient(value: DeviceBinding | DeviceBindingOffer['registration']): DeviceBindingClient {
    if (value.identityAlias !== this.identityAlias || value.audience !== this.host || value.profileId !== 'desktop') throw new Error('native device local selection denied')
    return new DeviceBindingClient(this.authority, { desktopId: value.desktopId, profileId: 'desktop', deviceId: value.deviceId, identityAlias: this.identityAlias, desktopCredentialId: value.desktopCredentialId, audience: this.host, maxPublicBytes: this.policy.trustMaxBytes, maxProofs: this.relay.maxProofs, maxChallengeTtlMs: this.relay.maxChallengeTtlMs }, this.storage, this.crypto.signer, this.crypto.primitives, this.clock)
  }
  private empty(error = ''): void { this.publish(JSON.stringify({ pairing: error === '' ? 'unpaired' : 'blocked', connection: 'disconnected', error, projects: [], sessions: [], selected: '', task: 'idle', readOnly: true, messages: [], liveText: '', richJson: '' })) }
  private project(view: DeviceMobileView): void {
    if (view.state !== 'connected') this.stopCatalog()
    const session = view.content === '' ? {} : JSON.parse(view.content)
    this.publish(JSON.stringify({ ...session, pairing: 'paired', connectionDiagnostic: deviceConnectionDiagnosticText(view.diagnostic), connection: view.state === 'connected' ? 'connected' : view.state, error: view.error || this.catalogError || session.error || '', projects: [], sessions: view.sessions.map(row => ({ sessionId: row.sessionId, projectId: row.projectId, title: row.title })), selected: view.selected?.sessionId ?? '', task: session.task ?? 'idle', readOnly: session.readOnly ?? true, messages: session.messages ?? [], liveText: session.liveText ?? '', richJson: session.richJson ?? '' }))
  }
  private sessionView(view: MobileProductView): string { return JSON.stringify({ task: view.transcript?.task ?? 'idle', readOnly: view.transcript?.readOnly ?? true, error: view.error, messages: view.transcript?.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ id: message.id, role: message.role, text: message.parts.flatMap(part => part.kind === 'text' || part.kind === 'reasoning' ? [part.text] : []).join('\n') })) ?? [], liveText: view.transcript?.liveText ?? '', richJson: view.rich === null ? '' : JSON.stringify(view.rich) }) }
  private install(_record: DeviceBinding, client: DeviceBindingClient): DeviceBoundMobileProduct {
    if (this.device !== undefined) throw new Error('native device product already installed')
    this.client = client
    this.device = new DeviceBoundMobileProduct(this.authority, client, { connect: (registration, lifetime) => this.connection(registration, client, lifetime) }, this.clock, this.scheduler, view => this.project(view))
    return this.device
  }
  /** @param error - opaque native cause. @param stage - owned native startup step. @returns safe fixed startup code only. */
  static startupDiagnostic(error: Error, stage: string): string { return deviceStartupDiagnosticText(error, stage) }
  /** Only fixed public verification results are emitted; no records, proofs or keys are projected. */
  async verifyStorageRecovery(expected: string): Promise<string> { this.local(this.authority); const pin = z.object({ bindingId: z.string(), epoch: z.number().int().positive(), desktopCredentialId: z.string(), credentialId: z.string(), identityAlias: z.string(), retiredRoutes: z.array(z.string()).max(64) }).strict().parse(JSON.parse(expected)); if (this.client === undefined || this.routes === undefined) throw new Error('native recovery records missing'); const binding = await this.client.load(this.authority); for (const key of ['bindingId','epoch','desktopCredentialId','credentialId','identityAlias'] as const) if (binding[key] !== pin[key]) throw new Error('native recovery original identity mismatch'); let history: { offers: number; routes: number; retired: number }; try { history = await this.routes.auditRecovery(this.authority, pin.retiredRoutes) } catch (error) { throw deviceStartupFailure(error, 'route-history-restore', true) }; this.hasRoute = false; this.routeDeadline = 0; this.recoveryVerified = true; return JSON.stringify({ originalBindingVerified: true, originalIdentityVerified: true, historyVerified: true, revocationAnchorsVerified: true, offers: history.offers, routes: history.routes, retired: history.retired, activeRoutes: 0 }) }
  /** Refresh only the native disconnected view after the owned marker transition. */
  async bootStatus(): Promise<void> { this.local(this.authority); if (!this.recoveryVerified || this.device === undefined) throw new Error('native recovery validation required'); this.project(this.device.view) }
  /** Verify original binding and route history before publishing readiness; either failure blocks operations without deleting or replacing records. */
  async boot(): Promise<void> {
    this.local(this.authority)
    let stage: DeviceStartupStage = 'binding-read', verified = false
    try { const raw = await this.storage.read(); if (raw === null) { this.empty(); return }; const value = deviceBindingSchema.parse(JSON.parse(raw)), client = this.makeClient(value), checked = await client.load(this.authority); this.local(this.authority); verified = true; const device = this.install(checked, client); stage = 'route-history-restore'; const route = this.pairedConnection ? null : await this.routes?.current(this.authority); this.local(this.authority); this.hasRoute = route != null; this.routeDeadline = route?.offer.expiresAt ?? 0; this.project(device.view) }
    catch (error) { const failure = deviceStartupFailure(error, stage, verified); this.startupFailure = failure; this.hasRoute = false; this.routeDeadline = 0; if (!this.closed) this.publish(JSON.stringify({ pairing: failure.bindingVerified ? 'paired' : 'blocked', connection: 'blocked', error: failure.bindingVerified ? 'device-route-history-unavailable' : 'device-binding-unavailable', startupDiagnostic: deviceStartupDiagnosticText(failure, stage), projects: [], sessions: [], selected: '', task: 'idle', readOnly: true, messages: [], liveText: '', richJson: '' })); throw failure }
  }
  private async connection(registration: DeviceBinding, proof: DeviceBindingClient, lifetime: AbortSignal): Promise<DeviceProductConnection> {
    this.local(this.authority); if (!this.connectionApproved || !this.pairedConnection && this.routingExpiresAt <= this.clock()) throw new Error('native device network approval or directory lease missing')
    let stage: DeviceConnectionStage = 'route-verify', cleanupFailed = false
    let acquisition: NativeDeviceNetwork | undefined, core: NativeDeviceCore | undefined, rpc: DeviceProductRpc | undefined
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => closing ??= (async () => { const results = await Promise.allSettled([(async () => { await rpc?.close() })(), (async () => { await core?.close() })(), (async () => { await acquisition?.close() })()]); if (results.some(result => result.status === 'rejected')) throw new Error('native device network cleanup failed') })()
    const abort = () => { void close().catch(error => { void error; cleanupFailed = true }) }
    try {
    lifetime.throwIfAborted()
    const route = this.pairedConnection ? undefined : await this.routes?.current(this.authority)
    lifetime.throwIfAborted()
    if (!this.pairedConnection && route == null) { this.hasRoute = false; throw new Error('native signed route window required') }
    const context = route == null ? undefined : { routeId: route.offer.routeId, routeEpoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt }
    const expiresAt = route?.offer.expiresAt ?? this.clock() + this.routingLeaseMs
    stage = 'native-channel'
      acquisition = await this.acquire(JSON.stringify(route ?? registration), fact => { if (fact === 'identity-read' || fact === 'native-channel') stage = fact; if (fact === 'cleanup-failed') cleanupFailed = true })
      lifetime.throwIfAborted()
      const acquired = acquisition
      core = new NativeDeviceCore(JSON.stringify(registration), expiresAt, this.relay, acquisition.ports, state => { if (state === 'identity-authenticated') acquired.authenticated() }, packet => rpc?.receive(packet), route ?? undefined)
      rpc = new DeviceProductRpc(core, this.scheduler, this.policy.transport.timeoutMs, this.policy.transport.maxPending, this.policy.commandPrefix)
      lifetime.addEventListener('abort', abort, { once: true })
      stage = 'identity-read'; await core.initialize(); lifetime.throwIfAborted(); stage = 'native-channel'; await acquired.open(); lifetime.throwIfAborted(); stage = 'control-handshake'; await core.ready(); lifetime.throwIfAborted(); this.local(this.authority)
      const network = core, calls = rpc
      return { authentication: 'native', ...(context === undefined ? {} : { route: context }), binding: network.binding, failure: fallback => network.connectionFailure(fallback, 'active-channel'), readyTicket: async () => JSON.parse(network.ticketJson()), catalog: async () => {
        const value = fields(await calls.call({ method: 'metadata', argument: null }), ['desktopId', 'profileId', 'sessions'])
        if (value.desktopId !== registration.desktopId || value.profileId !== 'desktop') throw new Error('native device catalogue identity denied')
        return z.array(z.object({ profileId: z.literal('desktop'), sessionId: z.string(), title: z.string(), projectId: z.string().nullable() }).strict()).parse(value.sessions)
      }, select: async (route, ticket, publish, lifetime) => {
        const result = fields(await calls.call({ method: 'select', route }), ['selected'])
        if (JSON.stringify(result.selected) !== JSON.stringify(route)) throw new Error('native device selection acknowledgement denied')
        const session = new DevicePhoneSession(route, registration, ticket, network.binding, proof, this.authority, this.policy, calls, this.scheduler, this.clock, view => publish(this.sessionView(view)), context)
        try { await session.start(); if (lifetime.aborted) throw new Error('native device selection retired'); this.selected = session; return { richRequest: raw => session.richRequest(raw), close: async () => { if (this.selected === session) this.selected = undefined; await session.close() } } }
        catch (error) { await session.close(); throw error }
      }, close }
    } catch (error) { const failure = core?.connectionFailure(error, stage) ?? deviceConnectionFailure(error, stage); if (cleanupFailed) failure.cleanupFailed(); try { await close() } catch (cleanup) { void cleanup; failure.cleanupFailed() }; throw failure }
    finally { lifetime.removeEventListener('abort', abort) }
  }
  /** @param raw - public offer only. @returns verified preview; no signing, persistence or network occurs. */
  async previewEnrollment(raw: string): Promise<string> { this.local(this.authority); const offer = deviceBindingOfferSchema.parse(JSON.parse(raw)), client = this.client ?? this.makeClient(offer.registration); await client.inspectOffer(this.authority, raw); this.client = client; return JSON.stringify({ ...NativeDeviceProductFacade.previewObject(offer.registration), expiresAt: offer.expiresAt, grantTtlMs: 1800000 }) }
  /** @param raw - public signed offer. @param compared - explicit original fingerprint decision. @returns original HUKS proof without a new identity or registration. */
  async signEnrollment(raw: string, compared: boolean): Promise<string> { this.local(this.authority); const offer = deviceBindingOfferSchema.parse(JSON.parse(raw)), client = this.client ?? this.makeClient(offer.registration); this.client = client; return client.signOffer(this.authority, raw, compared) }
  private static previewObject(value: DeviceBinding | DeviceBindingOffer['registration']) { return { deviceBinding: true, renewal: false, grantEpoch: value.epoch, pairId: value.bindingId, desktopFingerprint: value.desktopCredentialId, phoneFingerprint: value.credentialId, desktopId: value.desktopId, profileId: 'desktop', sessions: [], operations: value.operations, audience: value.audience, identityAlias: value.identityAlias, expiresAt: 0, grantTtlMs: 1800000 } }
  /** @param raw - strict public device receipt. @returns read-only public preview before any native identity acquisition. */
  static previewReceipt(raw: string): string { return JSON.stringify(NativeDeviceProductFacade.previewObject(deviceBindingSchema.parse(JSON.parse(raw)))) }
  /** @returns whether a verified persistent binding is available; connection state and model activity remain independent. */
  bound(): boolean { return !this.closed && !this.revoked && this.device !== undefined }
  /** @returns the original host after binding/identity verification; this does not approve network access. */
  connectionHost(): string { return this.bound() ? this.host : '' }
  /** No network is acquired; cold restore still requires fresh foreground host consent. */
  routeReady(): boolean { return this.startupFailure === undefined && (this.pairedConnection ? this.bound() : this.hasRoute && this.routeDeadline > this.clock()) }
  async previewRoute(raw: string): Promise<string> { this.local(this.authority); if (this.routes === undefined) throw new Error('native route storage unavailable'); const offer = await this.routes.inspectOffer(this.authority, JSON.parse(raw)); return JSON.stringify({ routeId: offer.routeId, audience: offer.binding.audience, bindingId: offer.binding.bindingId, profileId: offer.binding.profileId, expiresAt: offer.expiresAt, desktopFingerprint: offer.binding.desktopCredentialId, phoneFingerprint: offer.binding.credentialId }) }
  async signRoute(raw: string, approved: boolean): Promise<string> { this.local(this.authority); if (this.routes === undefined) throw new Error('native route storage unavailable'); const route = await this.routes.acceptOffer(this.authority, JSON.parse(raw), approved); this.hasRoute = true; this.routeDeadline = route.offer.expiresAt; return JSON.stringify(route) }
  async stopRoute(): Promise<void> { this.local(this.authority); this.hasRoute = false; const results = await Promise.allSettled([this.pairedConnection ? undefined : this.routes?.retire(this.authority), this.device?.disconnect(this.authority)]); if (results.some(value => value.status === 'rejected')) throw new Error('native route cleanup outcome unknown') }
  /** @param raw - strict public device receipt. @returns pure public preview; activation still verifies the original identity and signature. */
  preview(raw: string): string { if (new TextEncoder().encode(raw).length > this.policy.trustMaxBytes) throw new Error('native device preview capacity'); return JSON.stringify(NativeDeviceProductFacade.previewObject(deviceBindingSchema.parse(JSON.parse(raw)))) }
  /** @param raw - signed confirmed receipt. @param compared - explicit native fingerprint/scope decision. @param networkApproved - native relay disclosure consent. @returns after original public receipt persistence only; no socket is opened. */
  async pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void> { this.local(this.authority); if (!networkApproved) throw new Error('native device network disclosure not approved'); const value = deviceBindingSchema.parse(JSON.parse(raw)), client = this.client ?? this.makeClient(value); await client.accept(this.authority, raw, compared); this.local(this.authority); this.connectionApproved = true; if (this.device === undefined) this.project(this.install(await client.load(this.authority), client).view) }
  /** @param confirmed - explicit native saved-binding choice. @returns existing public receipt without changing identity or opening a connection. */
  async savedPairing(confirmed: boolean): Promise<string> { this.local(this.authority); if (!confirmed) throw new Error('native saved device decision required'); const raw = await this.storage.read(); if (raw === null) throw new Error('native device not bound'); return raw }
  /** @param networkApproved - current native page's explicit host decision, never inferred from a saved binding. @returns after a fresh finite channel proof; no model is submitted. */
  async connect(networkApproved: boolean): Promise<void> { this.local(this.authority); if (networkApproved !== true) throw new Error('native device host consent required'); if (this.revoked || this.device === undefined) throw new Error('native device not bound'); this.connectionApproved = true; await this.device.connect(this.authority); this.scheduleCatalog() }
  private scheduleCatalog(): void {
    this.stopCatalog()
    if (this.closed || this.revoked || this.device?.view.state !== 'connected') return
    this.stopCatalog = this.scheduler.after(this.catalogRefreshMs, () => {
      const device = this.device
      if (device === undefined || this.closed || device.view.state !== 'connected') return
      const operation = (async () => { try { await device.refresh(this.authority); this.catalogError = '' } catch (error) { void error; this.catalogError = 'device-catalog-unavailable' }; if (!this.closed) this.project(device.view) })()
      this.polling = operation
      void operation.then(() => { if (this.polling === operation) this.polling = undefined; this.scheduleCatalog() }, () => { if (this.polling === operation) this.polling = undefined })
    })
  }
  /** @param sessionId - current catalogue row. @returns after canonical old rich/subscription cleanup and selected Session start. */
  async select(sessionId: string): Promise<void> { this.local(this.authority); if (this.device === undefined) throw new Error('native device not bound'); await this.device.select(this.authority, sessionId) }
  /** Refresh dynamic catalogue without resuming an Agent. */
  async refresh(): Promise<void> { this.local(this.authority); if (this.device === undefined) throw new Error('native device not bound'); await this.device.refresh(this.authority) }
  private session(): DevicePhoneSession { this.local(this.authority); if (this.selected === undefined || this.device?.view.selected?.sessionId !== this.selected.route.sessionId || this.device.view.state !== 'connected') throw new Error('native device Session required'); return this.selected }
  /** @param requestId - original native user intent. @param text - user task. @returns canonical desktop receipt JSON. */
  async submit(requestId: string, text: string): Promise<string> { return JSON.stringify(await this.session().submit(requestId, text)) }
  /** @param requestId - original intent. @returns read-only receipt JSON, never a resubmission. */
  async receipt(requestId: string): Promise<string> { return JSON.stringify(await this.session().receipt(requestId)) }
  /** Cancel only the native-selected Session's task through the existing canonical owner. */
  cancel(): Promise<void> { return this.session().cancel() }
  /** @param raw - rejected rich envelope. @returns only its bounded correlation id and a refusal; no selection or Host operation occurs. */
  richRefusal(raw: string): string { const value = fields(JSON.parse(raw), ['kind', 'id', 'operation', 'payload']); if (value.kind !== 'rich.request' || typeof value.id !== 'string' || value.id.length > 128) throw new Error('native device rich refusal denied'); return JSON.stringify({ kind: 'rich.reply', id: value.id, error: true }) }
  /** @param raw - existing bounded rich SDK request. @returns scoped result from the original rich-inline owner, with no control/selection/credential entry. */
  richRequest(raw: string): Promise<string> { if (this.device === undefined) return Promise.reject(new Error('native device not bound')); return this.device.richRequest(raw) }
  /** Store sticky phone-local revocation and disconnect; desktop and relay revocation still require their separate explicit acknowledgements. */
  async revoke(): Promise<void> { this.local(this.authority); if (this.client === undefined) throw new Error('native device not bound'); this.revoked = true; this.hasRoute = false; const results = await Promise.allSettled([this.client.revokeLocal(this.authority), this.routes?.retire(this.authority), this.device?.disconnect(this.authority)]); if (results.some(result => result.status === 'rejected')) throw new Error('native device local revocation outcome unknown'); this.empty('device-binding-locally-revoked') }
  /** Native foreground retirement closes network and per-Session resources, retaining public binding and original HUKS identity. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.stopCatalog(); const results = await Promise.allSettled([this.device?.close(), this.writeTail, this.publicRead, this.polling, this.routes?.close()]); this.client?.close(); const stores = await Promise.allSettled([this.publicStorage.close(), this.routeStorage?.close()]); if ([...results, ...stores].some(result => result.status === 'rejected')) throw new Error('native device product close failed') }
}

/** Native device product composition; navigation and HTML share the original PhoneCore/rich owner without arbitrary Host APIs. */
import { z } from 'zod'
import { deviceStartupFailure, deviceStartupDiagnosticText, type DeviceStartupFailure, type DeviceStartupStage } from './device-startup-diagnostic.ts'
import { deviceConnectionFailure, deviceConnectionDiagnosticText, type DeviceConnectionStage } from './device-connection-diagnostic.ts'
export { DeviceConnectionFailure, deviceConnectionFailure, deviceConnectionDiagnosticText } from './device-connection-diagnostic.ts'
import { DeviceBindingClient } from './device-binding-client.ts'
import { deviceBindingSchema, deviceBindingOfferSchema, deviceRelayPairId, type DeviceBinding, type DeviceBindingOffer } from './device-binding-protocol.ts'
import { DeviceBoundMobileProduct, type DeviceProductConnection, type DeviceMobileView } from './mobile-device-product.ts'
import { DevicePhoneSession } from './device-phone-session.ts'
import { nativeChatRows } from './native-chat-presentation.ts'
import { DeviceProductRpc } from './device-product-rpc.ts'
import { DeviceHistoryCache, deviceHistoryScope, type DeviceHistoryStorage, type DeviceSessionHistory } from './device-history-cache.ts'
import { SemanticPhone } from './semantic-phone.ts'
import { id } from './protocol.ts'
import { NativeDeviceCore } from './native-device-bridge.ts'
import { parseProductPolicy } from './native-product-facade.ts'
import type { MobileProductPolicy, MobileProductView } from './mobile-product.ts'
import type { ProductTrustStorage } from './product-trust.ts'
import type { DeviceBindingStorage } from '../desktop-plugin/src/device-binding.ts'
import { sessionCreationOptionsSchema } from './session-creation.ts'
import { workspaceRequestSchema, workspaceResponseSchema, type WorkspaceRequest } from './workspace-protocol.ts'
import { workspaceDiagnosticFailure, workspaceDiagnosticOperation } from './workspace-diagnostic.ts'
import { jsonPayload, TransportError } from './wire.ts'
import { readWorkspaceBytes } from './workspace-bytes.ts'
import { deviceWorkspaceOrigin } from './workspace-origin.ts'
import { prepareWorkspace } from './workspace-prepare.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import type { PairedRelayPolicy } from './paired-relay.ts'
import type { DeviceLinkPorts } from './device-lan.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import { fields } from './link-protocol.ts'
import { DeviceRouteOwner } from './device-route-owner.ts'
import { ProductRouteStorage } from './product-route-storage.ts'
import { deviceRouteSchema } from './device-route-protocol.ts'
import { deviceSessionDirectory, deviceSessionActionSchema, deviceSessionManagedSchema, type DeviceSessionRow } from './device-session-directory.ts'

/** Native owner acquires original-key crypto and owns socket release. */
export interface NativeDeviceNetwork { readonly ports: DeviceLinkPorts; open(): Promise<void>; authenticated(): void; close(): Promise<void> }
/** JSON-free native original-identity crypto; no private bytes are exposed. */
export interface NativeDeviceCrypto { readonly signer: P256IdentitySigner; readonly primitives: E2EPrimitives }
/** Last admitted Session and its exact public binding, retained only by the native page owner. */
export interface NativeDeviceForegroundSelection { binding: string | null; sessionId: string }
/** One actual native page composition. Default-disabled construction and boot acquire no network. */
export class NativeDeviceProductFacade {
  private readonly policy: MobileProductPolicy & { readonly pagedHistory?: boolean | undefined }
  private readonly storage: DeviceBindingStorage
  private client: DeviceBindingClient | undefined
  private device: DeviceBoundMobileProduct | undefined
  private selected: DevicePhoneSession | undefined
  private readonly workspaceRequests = new Map<string, { readonly controller: AbortController; readonly operation: Promise<unknown> }>()
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
  private readonly historyCache: DeviceHistoryCache | undefined
  private bindingRecord: DeviceBinding | undefined
  private cachedRows: readonly DeviceSessionRow[] = []
  private offline: { readonly sessionId: string; readonly model: SemanticPhone; readonly history: DeviceSessionHistory; mountKey: string; mountId: string } | undefined
  private offlineVersion = 0
  private offlineMountSequence = 0
  private offlineRestore: Promise<void> | undefined
  private startupFailure: DeviceStartupFailure | undefined
  private recoveryVerified = false
  private hasRoute = false
  private routeDeadline = 0
  private readonly routingLeaseMs: number
  /** @param authority - exact native UI owner. @param policyJson - existing default-disabled product/domain limits. @param identityAlias - original selected HUKS alias. @param host - approved existing relay host. @param routingExpiresAt - independent public relay directory deadline. @param relay - existing control/E2E capacities. @param publicStorage - separate app-private device public file. @param crypto - original native signer and maintained backend. @param scheduler - native timers. @param clock - trusted native clock. @param acquire - original native WSS acquisition, called only on connect. @param publish - sanitized original page DTO sink. @param foregroundSelection - in-memory selection shared with the next facade of the same native page. */
  constructor(private readonly authority: object, policyJson: string, private readonly identityAlias: string, private readonly host: string, private readonly routingExpiresAt: number, private readonly relay: PairedRelayPolicy, private readonly publicStorage: ProductTrustStorage, private readonly crypto: NativeDeviceCrypto, private readonly scheduler: CleanupScheduler, private readonly clock: () => number, private readonly acquire: (registration: string, diagnostic?: (stage: string) => void) => Promise<NativeDeviceNetwork>, private readonly publish: (view: string) => void, private readonly catalogRefreshMs: number, routeStorage?: ProductTrustStorage, private readonly pairedConnection = false, private readonly foregroundSelection: NativeDeviceForegroundSelection = { binding: null, sessionId: '' }, historyStorage?: DeviceHistoryStorage) {
    this.policy = parseProductPolicy(policyJson)
    if (historyStorage !== undefined) this.historyCache = new DeviceHistoryCache(historyStorage, async raw =>
      crypto.primitives.encode(await crypto.primitives.hash(new TextEncoder().encode(raw))))
    if (this.policy.workspace !== undefined && (this.policy.workspace.maxPending + this.policy.transport.maxPending > relay.maxProofs
      || this.policy.workspace.maxPacketBytes > relay.e2e.maxPlaintextBytes)) throw new Error('native workspace exceeds device carrier capacity')
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
  static routingInput(raw: string): string { const candidate: unknown = JSON.parse(raw), route = deviceRouteSchema.safeParse(candidate), value = route.success ? route.data.offer.binding : deviceBindingSchema.parse(candidate); return JSON.stringify({ identityAlias: value.identityAlias, audience: value.audience, bindingId: value.bindingId, desktopPublicSpki: value.desktopPublicSpki, epoch: value.epoch, routeId: route.success ? route.data.offer.routeId : deviceRelayPairId(value) }) }
  private local(authority: object): void { if (this.closed || this.startupFailure !== undefined || !this.policy.enabled || authority !== this.authority) throw new Error('native device product disabled') }
  private makeClient(value: DeviceBinding | DeviceBindingOffer['registration']): DeviceBindingClient {
    if (value.identityAlias !== this.identityAlias || value.audience !== this.host || value.profileId !== 'desktop') throw new Error('native device local selection denied')
    return new DeviceBindingClient(this.authority, { desktopId: value.desktopId, profileId: 'desktop', deviceId: value.deviceId, identityAlias: this.identityAlias, desktopCredentialId: value.desktopCredentialId, audience: this.host, maxPublicBytes: this.policy.trustMaxBytes, maxProofs: this.relay.maxProofs, maxChallengeTtlMs: this.relay.maxChallengeTtlMs }, this.storage, this.crypto.signer, this.crypto.primitives, this.clock)
  }
  private empty(error = ''): void { this.publish(JSON.stringify({ pairing: error === '' ? 'unpaired' : 'blocked', connection: 'disconnected', error, projects: [], sessions: [], selected: '', task: 'idle', readOnly: true, messages: [], liveText: '', richJson: '' })) }
  private project(view: DeviceMobileView): void {
    if (view.state !== 'connected') this.stopCatalog()
    if (view.state === 'connected' && view.selected !== null && view.content !== '') this.offline = undefined
    const offline = this.offline
    const session = offline === undefined ? view.content === '' ? {} : JSON.parse(view.content) : this.offlineContent(offline)
    const offlineAvailable = this.cachedRows.length > 0
    this.publish(JSON.stringify({ ...session, pairing: 'paired', connectionDiagnostic: deviceConnectionDiagnosticText(view.diagnostic), connection: view.state === 'connected' ? 'connected' : view.state, error: view.error || this.catalogError || session.error || '', projects: view.state === 'connected' ? view.projects : [], manageable: view.state === 'connected' && view.manageable, sessions: view.state === 'connected' ? view.sessions : this.cachedRows, offlineAvailable, selected: offline?.sessionId ?? view.selected?.sessionId ?? '', task: session.task ?? 'idle', readOnly: session.readOnly ?? true, messages: session.messages ?? [], liveText: session.liveText ?? '', richJson: session.richJson ?? '' }))
    if (view.state !== 'connected' && offline === undefined && this.offlineRestore === undefined && !this.closed && !this.revoked
      && this.foregroundSelection.binding === this.cached && this.foregroundSelection.sessionId !== '') {
      const pending = this.restoreOffline(this.foregroundSelection.sessionId).catch(error => { void error }).finally(() => { if (this.offlineRestore === pending) this.offlineRestore = undefined })
      this.offlineRestore = pending
    }
  }
  private offlineContent(offline: NonNullable<NativeDeviceProductFacade['offline']>): Record<string, unknown> {
    const transcript = offline.model.view, snapshot = transcript.rich.at(-1)
    const key = snapshot === undefined ? '' : JSON.stringify([snapshot.scope.messageId, snapshot.scope.blockId])
    if (key !== offline.mountKey) { offline.mountKey = key; offline.mountId = 'offline-' + ++this.offlineMountSequence }
    const rich = snapshot === undefined ? null : { mountId: id<'rich-inline-mount'>(offline.mountId), snapshot }
    const localMore = transcript.hasMore && offline.history.older(offline.model.firstSeq, transcript.cursor, true) !== undefined
    return { ...JSON.parse(this.sessionView({ transcript, error: '', rich })), historyOffline: true,
      historyHasMore: localMore, historyCachedEnd: transcript.hasMore && !localMore }
  }
  private async restoreOffline(sessionId: string): Promise<void> {
    const version = ++this.offlineVersion, binding = this.bindingRecord, device = this.device, cache = this.historyCache
    if (binding === undefined || device === undefined || cache === undefined || !this.cachedRows.some(row => row.sessionId === sessionId)) throw new Error('offline Session unavailable')
    const history = await cache.open(deviceHistoryScope(binding, sessionId))
    if (this.closed || this.revoked || version !== this.offlineVersion || device.view.state === 'connected') throw new TransportError('cancelled')
    const model = new SemanticPhone({ desktopId: id<'mobile-desktop'>(binding.desktopId), deviceId: id<'mobile-device'>(binding.deviceId), sessionId: id<'SessionId'>(sessionId) }, this.policy.domain, this.policy.duplicateCap)
    if (!history.restore(model)) throw new Error('offline Session unavailable')
    this.offline = { sessionId, model, history, mountKey: '', mountId: '' }
    this.project(device.view)
  }
  private sessionView(view: Pick<MobileProductView, 'transcript' | 'error' | 'rich'>, historySyncing = false): string {
    const transcript = view.transcript
    return JSON.stringify({ task: historySyncing ? 'idle' : transcript?.task ?? 'idle', readOnly: historySyncing || transcript?.readOnly !== false, error: view.error,
      messages: nativeChatRows(transcript?.messages.filter(message => message.role === 'user' || message.role === 'assistant') ?? [], view.rich?.snapshot.scope.messageId),
      ...(this.policy.pagedHistory === true ? { historyHasMore: !historySyncing && transcript?.hasMore === true } : {}), historySyncing,
      liveText: transcript?.liveText ?? '', richJson: view.rich === null ? '' : JSON.stringify(view.rich) })
  }
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
    try { const raw = await this.storage.read(); if (raw === null) { this.empty(); return }; const value = deviceBindingSchema.parse(JSON.parse(raw)), client = this.makeClient(value), checked = await client.load(this.authority); this.local(this.authority); verified = true; this.bindingRecord = checked; const device = this.install(checked, client); stage = 'route-history-restore'; const route = this.pairedConnection ? null : await this.routes?.current(this.authority); this.local(this.authority); this.hasRoute = route != null; this.routeDeadline = route?.offer.expiresAt ?? 0; this.cachedRows = await this.historyCache?.sessions(checked) ?? []; this.local(this.authority); this.project(device.view) }
    catch (error) { const failure = deviceStartupFailure(error, stage, verified); this.startupFailure = failure; this.hasRoute = false; this.routeDeadline = 0; if (!this.closed) this.publish(JSON.stringify({ pairing: failure.bindingVerified ? 'paired' : 'blocked', connection: 'blocked', error: failure.bindingVerified ? 'device-route-history-unavailable' : 'device-binding-unavailable', startupDiagnostic: deviceStartupDiagnosticText(failure, stage), projects: [], sessions: [], selected: '', task: 'idle', readOnly: true, messages: [], liveText: '', richJson: '' })); throw failure }
  }
  private async connection(registration: DeviceBinding, proof: DeviceBindingClient, lifetime: AbortSignal): Promise<DeviceProductConnection> {
    this.local(this.authority); if (!this.connectionApproved || !this.pairedConnection && this.routingExpiresAt <= this.clock()) throw new Error('native device network approval or directory lease missing')
    let stage: DeviceConnectionStage = 'route-verify', cleanupFailed = false
    let acquisition: NativeDeviceNetwork | undefined, core: NativeDeviceCore | undefined, rpc: DeviceProductRpc | undefined
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => closing ??= (async () => { const results = await Promise.allSettled([(async () => { await rpc?.close() })(), (async () => { await core?.close() })(), (async () => { await acquisition?.close() })()]); for (const [index, result] of results.entries()) if (result.status === 'rejected') console.info('DSH_CONNECTION_CLEANUP=' + ['rpc', 'channel', 'native'][index] + '-failed'); if (results.some(result => result.status === 'rejected')) throw new Error('native device network cleanup failed') })()
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
      rpc = new DeviceProductRpc(core, this.scheduler, this.policy.transport.timeoutMs, this.policy.transport.maxPending, this.policy.commandPrefix, this.policy.workspace?.maxPending ?? 0)
      lifetime.addEventListener('abort', abort, { once: true })
      stage = 'identity-read'; await core.initialize(); lifetime.throwIfAborted(); stage = 'native-channel'; await acquired.open(); lifetime.throwIfAborted(); stage = 'control-handshake'; await core.ready(); lifetime.throwIfAborted(); this.local(this.authority)
      const network = core, calls = rpc
      let selectionGeneration = 0
      return {
        authentication: 'native', ...(context === undefined ? {} : { route: context }), binding: network.binding,
        failure: fallback => network.connectionFailure(fallback, 'active-channel'),
        readyTicket: async () => JSON.parse(network.ticketJson()),
        catalog: async () => {
          const directory = deviceSessionDirectory(await calls.call({ method: 'metadata', argument: null }), registration.desktopId)
          await this.historyCache?.rememberDirectory(registration, directory.sessions)
          this.cachedRows = await this.historyCache?.sessions(registration) ?? []
          if (this.offline !== undefined && !directory.sessions.some(row => row.sessionId === this.offline?.sessionId)) {
            this.offlineVersion++
            this.offline = undefined
            this.foregroundSelection.sessionId = ''
          }
          return directory
        },
        creationOptions: async () => sessionCreationOptionsSchema.parse(await calls.call({ method: 'creation-options' })),
        workspace: (argument, _ticket, signal) => calls.call({ method: 'workspace', argument }, signal),
        manage: async action => deviceSessionManagedSchema.parse(await calls.call({ method: 'manage', action })).sessionId,
        select: async (route, ticket, publish, lifetime, row) => {
        const history = await this.historyCache?.open(deviceHistoryScope(registration, route.sessionId))
        history?.bindRow(row)
        lifetime.throwIfAborted()
        const preview = history?.preview(new SemanticPhone({ desktopId: id<'mobile-desktop'>(route.desktopId), deviceId: id<'mobile-device'>(registration.deviceId), sessionId: id<'SessionId'>(route.sessionId) }, this.policy.domain, this.policy.duplicateCap))
        let previewPending = preview?.messages.some(message => message.role === 'user' || message.role === 'assistant') === true
        if (previewPending && preview !== undefined) {
          publish(this.sessionView({ transcript: preview, error: '', rich: null }, true))
          console.info('DSH_DEVICE_HISTORY=opening-preview at=' + this.clock())
        }
        const result = fields(await calls.call({ method: 'select', route }, lifetime), ['selected'])
        if (JSON.stringify(result.selected) !== JSON.stringify(route)) throw new Error('native device selection acknowledgement denied')
        // The Host may reuse the peer and its command cache when reopening the same Session.
        const sessionPolicy = { ...this.policy, commandPrefix: 'device-' + network.binding.id + ':' + ++selectionGeneration }
        lifetime.throwIfAborted()
        const session = new DevicePhoneSession(route, row, registration, ticket, network.binding, proof, this.authority, sessionPolicy, calls, this.scheduler, this.clock, view => {
          if (previewPending) {
            if (view.transcript?.connection !== 'connected' && view.error === '') return
            previewPending = false
            if (view.transcript?.connection === 'connected') console.info('DSH_DEVICE_HISTORY=opening-verified at=' + this.clock())
          }
          if (view.rich !== null) {
            try { history?.rememberRich(jsonPayload(view.rich.snapshot), this.policy.domain.maxRichBlocks) }
            catch (error) { void error; console.info('DSH_DEVICE_HISTORY=rich-cache-failed') }
          }
          if (history?.hint !== null && history?.hint !== undefined && this.device?.view.sessions.some(item => item.sessionId === row.sessionId)) this.cachedRows = [...this.cachedRows.filter(item => item.sessionId !== row.sessionId), { ...row, running: false }]
          publish(this.sessionView(view))
        }, context, history)
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
  async pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void> { this.local(this.authority); if (!networkApproved) throw new Error('native device network disclosure not approved'); const value = deviceBindingSchema.parse(JSON.parse(raw)), client = this.client ?? this.makeClient(value); await client.accept(this.authority, raw, compared); this.local(this.authority); this.connectionApproved = true; if (this.device === undefined) { const binding = await client.load(this.authority); this.bindingRecord = binding; this.project(this.install(binding, client).view) } }
  /** @param confirmed - explicit native saved-binding choice. @returns existing public receipt without changing identity or opening a connection. */
  async savedPairing(confirmed: boolean): Promise<string> { this.local(this.authority); if (!confirmed) throw new Error('native saved device decision required'); const raw = await this.storage.read(); if (raw === null) throw new Error('native device not bound'); return raw }
  /** @param networkApproved - current native page's explicit host decision, never inferred from a saved binding. @returns after a fresh channel proof and reopening the last selected Session when still visible. Only reads resume; no model message or mutation is replayed. */
  async connect(networkApproved: boolean): Promise<void> {
    this.local(this.authority); if (networkApproved !== true) throw new Error('native device host consent required'); if (this.revoked || this.device === undefined) throw new Error('native device not bound')
    const { binding, sessionId } = this.foregroundSelection
    this.connectionApproved = true; await this.device.connect(this.authority); this.catalogError = ''; this.scheduleCatalog()
    if (binding !== null && binding === this.cached && binding === this.foregroundSelection.binding
      && sessionId !== '' && sessionId === this.foregroundSelection.sessionId) {
      if (this.device.view.sessions.some(row => row.sessionId === sessionId)) await this.device.select(this.authority, sessionId)
      else { this.foregroundSelection.sessionId = ''; this.offline = undefined; this.project(this.device.view) }
    }
  }
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
  /** @param sessionId - current catalogue row, retained in memory for channel recovery. @returns after canonical old rich/subscription cleanup and selected Session start. */
  async select(sessionId: string): Promise<void> {
    this.local(this.authority)
    const device = this.device, binding = this.cached
    if (device === undefined) throw new Error('native device not bound')
    if (device.view.state !== 'connected') {
      await this.restoreOffline(sessionId)
      if (this.closed || this.revoked || binding === null || binding !== this.cached || this.offline?.sessionId !== sessionId) throw new TransportError('cancelled')
      this.foregroundSelection.binding = binding
      this.foregroundSelection.sessionId = sessionId
      return
    }
    this.offlineVersion++
    this.offline = undefined
    await device.select(this.authority, sessionId)
    if (!this.closed && !this.revoked && binding !== null && binding === this.cached && device.view.selected?.sessionId === sessionId) {
      this.foregroundSelection.binding = binding
      this.foregroundSelection.sessionId = sessionId
    }
  }
  /** Load one older page for the selected device Session. Size limits leave visible history intact. */
  async loadOlder(): Promise<'loaded' | 'empty' | 'limit'> {
    this.local(this.authority)
    const offline = this.offline
    if (offline !== undefined) {
      const page = offline.history.older(offline.model.firstSeq, offline.model.view.cursor, true)
      if (page === undefined) return 'empty'
      try {
        if (!offline.model.history(page)) return 'empty'
        offline.history.restoreRich(offline.model)
        if (this.offline !== offline || this.device === undefined) throw new TransportError('cancelled')
        this.project(this.device.view)
        return 'loaded'
      } catch (error) {
        if (error instanceof TransportError && ['history-too-large', 'domain-too-large', 'domain-window-full'].includes(error.code)) return 'limit'
        throw error
      }
    }
    const selected = this.selected
    if (this.policy.pagedHistory !== true || selected === undefined || this.device?.view.selected?.sessionId !== selected.route.sessionId) throw new TransportError('scope-denied')
    try { return await selected.loadOlder() ? 'loaded' : 'empty' }
    catch (error) {
      if (error instanceof TransportError && ['history-too-large', 'domain-too-large', 'domain-window-full'].includes(error.code)) return 'limit'
      throw error
    }
  }
  /** @param raw - strict list-management intent JSON from the native page. @returns affected Session id after the desktop acknowledged it and the catalogue refreshed; selection is unchanged. */
  async manage(raw: string): Promise<string> { this.local(this.authority); if (this.device === undefined) throw new Error('native device not bound'); return this.device.manage(this.authority, deviceSessionActionSchema.parse(JSON.parse(raw))) }
  /** @returns current desktop choices for the native new-task sheet. */
  async creationOptions(): Promise<string> { this.local(this.authority); if (this.device === undefined) throw new Error('native device not bound'); return JSON.stringify(await this.device.creationOptions(this.authority)) }
  /** Refresh the native catalogue and its selected Session's inline Rich snapshot without replacing the selection. */
  async refreshSessions(): Promise<void> {
    this.local(this.authority)
    const device = this.device, selected = this.selected
    if (device === undefined) throw new Error('native device not bound')
    const rich = selected !== undefined && device.view.selected?.sessionId === selected.route.sessionId
      ? selected.refreshMountedRich() : undefined
    await Promise.all([device.refresh(this.authority), rich])
  }
  private async workspaceTask<T>(requestId: string, generation: number, execute: (device: DeviceBoundMobileProduct, signal: AbortSignal) => Promise<T>): Promise<T> {
    this.local(this.authority)
    if (this.device === undefined) throw new TransportError('scope-denied')
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId) || this.workspaceRequests.has(requestId)) throw new TransportError('invalid-packet')
    if (this.policy.workspace === undefined) throw new TransportError('scope-denied')
    if (this.workspaceRequests.size >= this.policy.workspace.maxPending) throw new TransportError('queue-full')
    if (this.device.workspaceGeneration(this.authority) !== generation) throw new TransportError('scope-denied')
    const controller = new AbortController()
    const operation = execute(this.device, controller.signal)
    this.workspaceRequests.set(requestId, { controller, operation })
    try { return await operation }
    finally { this.workspaceRequests.delete(requestId) }
  }
  /** @returns the current native connection generation; old Web documents cannot operate a replacement connection. */
  workspaceGeneration(): number { this.local(this.authority); if (this.device === undefined || this.policy.workspace === undefined) throw new Error('native workspace unavailable'); return this.device.workspaceGeneration(this.authority) }
  /** @returns public origin and local generation for a trusted ArkWeb workspace, with persistent Web state partitioned by the original desktop identity. */
  async workspaceContext(): Promise<string> {
    const generation = this.workspaceGeneration()
    if (this.client === undefined) throw new Error('native device not bound')
    const record = await this.client.load(this.authority)
    if (this.workspaceGeneration() !== generation) throw new Error('native workspace connection changed')
    return JSON.stringify({ origin: deviceWorkspaceOrigin(record.desktopCredentialId), generation })
  }
  /** @param requestId - native startup request. @param generation - original connection. @returns a verified shell inventory after an explicit authorized bootstrap; reopening never retries a mutation. */
  async workspacePrepare(requestId: string, generation: number): Promise<string> {
    const policy = this.policy.workspace
    if (policy === undefined) throw new Error('native workspace unavailable')
    return this.workspaceTask(requestId, generation, async (device, signal) => JSON.stringify(await prepareWorkspace({
      request: value => device.workspace(this.authority, value, generation, signal),
      release: value => device.workspace(this.authority, value, generation),
      decode: value => this.crypto.primitives.decode(value),
    }, { maxBytes: policy.maxResponseBytes, maxChunkBytes: policy.maxChunkBytes })))
  }
  /** @param requestId - native port's request identity. @param raw - strict message from the trusted workspace, never a rich guest. @param generation - captured native connection generation. @returns a JSON result under the separate desktop workspace grant. */
  async workspaceRequest(requestId: string, raw: string, generation: number): Promise<string> {
    let request: WorkspaceRequest | undefined
    try {
      if (this.policy.workspace === undefined || new TextEncoder().encode(raw).byteLength > this.policy.workspace.maxPacketBytes) throw new Error('native workspace packet too large')
      const parsed = workspaceRequestSchema.parse(JSON.parse(raw))
      request = parsed
      return await this.workspaceTask(requestId, generation, async (device, signal) => JSON.stringify(await device.workspace(this.authority, parsed, generation, signal)))
    } catch (error) {
      const failure = request === undefined ? 'invalid-packet' : workspaceDiagnosticFailure(error)
      if (failure !== 'cancelled') console.warn('DSH_WORKSPACE_RPC operation=' + workspaceDiagnosticOperation(request) + ' failure=' + failure)
      throw error
    }
  }
  /** @param requestId - native resource owner. @param url - logical same-origin URL, validated again by Host. @param generation - original native connection generation. @param maxBytes - native assembly budget. @param maxChunkBytes - native chunk budget. @returns validated response metadata and platform-encoded binary bytes, without Web Fetch/URL dependencies in native JS. */
  async workspaceResource(requestId: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string> {
    if (![maxBytes, maxChunkBytes].every(value => Number.isSafeInteger(value) && value > 0) || this.policy.workspace === undefined
      || maxBytes > this.policy.workspace.maxResponseBytes || maxChunkBytes > this.policy.workspace.maxChunkBytes) throw new Error('native workspace resource limits denied')
    const request = workspaceRequestSchema.parse({ operation: 'fetch', url, method: 'GET', headers: [] })
    let operation: 'fetch' | 'read' = 'fetch'
    try {
      return await this.workspaceTask(requestId, generation, async (device, signal) => {
        const response = workspaceResponseSchema.parse(await device.workspace(this.authority, request, generation, signal))
        operation = 'read'
        const bytes = await readWorkspaceBytes(response.body, {
          request: value => device.workspace(this.authority, value, generation, signal),
          release: value => device.workspace(this.authority, value, generation),
          decode: value => this.crypto.primitives.decode(value),
        }, { maxBytes, maxChunkBytes })
        const body = bytes.byteLength === 0 ? '' : this.crypto.primitives.encode(bytes)
        return JSON.stringify({ status: response.status, headers: response.headers, body })
      })
    } catch (error) {
      if (/^https:\/\/[^/?#]+\/$/.test(url)) {
        const failure = workspaceDiagnosticFailure(error)
        if (failure !== 'cancelled') console.warn('DSH_WORKSPACE_RPC operation=' + operation + ' failure=' + failure)
      }
      throw error
    }
  }
  /** @param requestId - exact native port request to retire. Accepted desktop mutations remain uncertain and are never retried. */
  cancelWorkspaceRequest(requestId: string): void { this.workspaceRequests.get(requestId)?.controller.abort() }
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
  richRequest(raw: string): Promise<string> { if (this.offline !== undefined) return Promise.resolve(this.richRefusal(raw)); if (this.device === undefined) return Promise.reject(new Error('native device not bound')); return this.device.richRequest(raw) }
  /** Store sticky phone-local revocation and disconnect; desktop and relay revocation still require their separate explicit acknowledgements. */
  async revoke(): Promise<void> { this.local(this.authority); if (this.client === undefined) throw new Error('native device not bound'); this.revoked = true; this.offlineVersion++; this.offline = undefined; this.cachedRows = []; this.hasRoute = false; this.foregroundSelection.binding = null; this.foregroundSelection.sessionId = ''; const results = await Promise.allSettled([this.client.revokeLocal(this.authority), this.routes?.retire(this.authority), this.device?.disconnect(this.authority), this.historyCache?.clear()]); if (results.some(result => result.status === 'rejected')) throw new Error('native device local revocation outcome unknown'); this.empty('device-binding-locally-revoked') }
  /** Native foreground retirement closes network and per-Session resources, retaining public binding and original HUKS identity. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.offlineVersion++; this.offline = undefined; this.stopCatalog(); for (const request of this.workspaceRequests.values()) request.controller.abort(); await Promise.allSettled([...this.workspaceRequests.values()].map(request => request.operation)); const results = await Promise.allSettled([this.device?.close(), this.writeTail, this.publicRead, this.polling, this.offlineRestore, this.routes?.close()]); this.client?.close(); const stores = await Promise.allSettled([this.publicStorage.close(), this.routeStorage?.close(), this.historyCache?.close()]); if ([...results, ...stores].some(result => result.status === 'rejected')) throw new Error('native device product close failed') }
}

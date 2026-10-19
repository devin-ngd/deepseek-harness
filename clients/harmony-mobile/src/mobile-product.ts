/** Native product flow reuses PhoneCore, semantic projections and rich validation; only app-owned ports can select trust or execute commands. */
import { ProductTrustOwner, PublicTrustExpiredError, type ProductTrustRecord, type ProductTrustStorage } from './product-trust.ts'
import { parsePublicTrustDocument, publicTrustRecord, canonicalPublicTrust, assertPublicTrustSuccessor, type PublicTrustDocument } from './public-trust-protocol.ts'
import { PairedProductTransport, type ProductConnection, type ProductTransportPolicy } from './paired-product-transport.ts'
import { PhoneCore, type PhoneCoreConfig } from './phone-core.ts'
import { SemanticPhone, type PhoneView } from './semantic-phone.ts'
import type { DomainLimits } from './domain.ts'
import { object, string } from './domain.ts'
import { id } from './protocol.ts'
import { jsonPayload, TransportError } from './wire.ts'
import type { JsonValue, RichMountValue } from './upstream.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import type { MobileOperation } from './link-protocol.ts'
/** All capacities and retry choices belong to the local app policy, never a paired/guest packet. */
export interface MobileProductPolicy { readonly enabled: boolean; readonly trustMaxBytes: number; readonly transport: ProductTransportPolicy; readonly domain: DomainLimits; readonly duplicateCap: number; readonly core: Omit<PhoneCoreConfig, 'grantEpoch' | 'clock' | 'nextCommandId'>; readonly commandPrefix: string }
/** Native owns SDK connections. Fixed replay tests supply the actual ETS owner with substituted platform IO. */
export interface MobileProductPorts { readonly storage: ProductTrustStorage; readonly scheduler: CleanupScheduler; readonly clock: () => number; verifyTrust(record: ProductTrustRecord, document: PublicTrustDocument, previous?: PublicTrustDocument): Promise<void>; connect(record: ProductTrustRecord, status: (state: string) => void, received: (packet: string) => void): Promise<ProductConnection> }
/** Sanitized product DTO: no pairing record, HUKS alias, raw Session log or host path reaches the visual layer. */
export interface MobileProductView { readonly pairing: 'unpaired' | 'paired' | 'revoked' | 'blocked'; readonly connection: string; readonly error: string; readonly projects: readonly { readonly projectId: string; readonly title: string; readonly sessionIds: readonly string[] }[]; readonly sessions: readonly { readonly sessionId: string; readonly projectId: string | null; readonly title: string }[]; readonly selected: string; readonly transcript: PhoneView | null; readonly rich: RichMountValue | null }
/** One app lifetime. Task/action results are never inferred from transport connection status. */
export class MobileProduct {
  private readonly trust: ProductTrustOwner
  private record: ProductTrustRecord | null = null
  private transport: PairedProductTransport | undefined
  private core: PhoneCore | undefined
  private followAbort: AbortController | undefined
  private following: Promise<void> | undefined
  private readonly lifetime = new AbortController()
  private command = 0
  private richTail = Promise.resolve()
  private richMount: RichMountValue | null = null
  private catalog: Pick<MobileProductView, 'projects' | 'sessions'> = { projects: [], sessions: [] }
  private pairing: MobileProductView['pairing'] = 'unpaired'
  private connection = 'disabled'
  private error = ''
  private closed = false
  private connecting = false
  private closing: Promise<void> | undefined
  private version = 0
  private selectionVersion = 0
  private selectionTail = Promise.resolve()
  private richVersion = 0
  private failed = false
  /** @param authority - native UI owner, never exposed to a guest. @param policy - default-disabled product policy. @param ports - app-owned public storage/native IO. @param publish - bounded sanitized native DTO sink. */
  constructor(private readonly authority: object, private readonly policy: MobileProductPolicy, private readonly ports: MobileProductPorts, private readonly publish: (view: MobileProductView) => void) { this.trust = new ProductTrustOwner(authority, ports.storage, policy.trustMaxBytes, ports.clock) }
  private allowed(authority: object): void { if (authority !== this.authority || this.closed || this.failed || !this.policy.enabled) throw new Error('product activation denied') }
  /** @returns detached validated native state; renderer credentials are never included. */
  get view(): MobileProductView { return { pairing: this.pairing, connection: this.connection, error: this.error, ...this.catalog, selected: this.core?.model.owner.sessionId ?? '', transcript: this.core?.model.view ?? null, rich: this.richMount } }
  private emit(final = false): void { if (!this.closed || final) { try { this.publish(this.view) } catch (error) { void error; this.failed = true } } }
  /** @returns after reading only the configured app-private public record; default-disabled boot performs no IO. */
  async boot(): Promise<void> { if (this.closed) throw new Error('product closed'); const version = this.version; if (!this.policy.enabled) { this.emit(); return }; try { const record = await this.trust.load(), document = this.trust.savedDocument(); if (this.closed || version !== this.version) return; if (record !== null && document !== null && !record.revoked) await this.ports.verifyTrust(record, document); if (this.closed || version !== this.version) return; this.record = record; this.pairing = this.record === null ? 'unpaired' : this.record.revoked ? 'revoked' : 'paired'; this.connection = 'disconnected' } catch (error) { if (this.closed || version !== this.version) return; this.pairing = 'blocked'; this.error = error instanceof PublicTrustExpiredError ? 'public-trust-expired' : 'public-trust-unavailable' }; this.emit() }
  /** @param authority - trusted native comparison decision. @param raw - locally selected public record. @param compared - explicit fingerprint decision. @returns after public-only storage; it does not activate a socket. */
  async pair(authority: object, raw: string, compared: boolean): Promise<void> { this.allowed(authority); const version = this.version; try { const document = parsePublicTrustDocument(raw, this.policy.trustMaxBytes), record = publicTrustRecord(document); if (!compared) throw new Error('fingerprint comparison required'); await this.ports.verifyTrust(record, document); this.allowed(authority); if (version !== this.version) throw new Error('pairing retired'); const confirmed = await this.trust.confirm(authority, raw, compared); this.allowed(authority); if (version !== this.version) throw new Error('pairing retired'); this.record = confirmed; this.pairing = 'paired'; this.connection = 'disconnected'; this.error = '' } catch (error) { if (!this.closed && version === this.version) { this.error = 'pairing-refused'; this.emit() }; throw error }; this.emit() }
  /** @param authority - native local decision. @param raw - explicitly selected public grant. @param compared - current comparison. @returns after initial confirmation, exact saved resume or explicit signed expiry continuation; local revocation, invalid history and retired state refuse. */
  async pairOrResume(authority: object, raw: string, compared: boolean): Promise<void> {
    this.allowed(authority); const previous = this.trust.savedDocument(), document = parsePublicTrustDocument(raw, this.policy.trustMaxBytes), record = publicTrustRecord(document), version = this.version
    if (this.pairing === 'blocked' && this.error === 'public-trust-expired' && previous !== null) {
      if (!compared || this.transport !== undefined || document.schema !== 'harmony-product-public-trust/2') throw new Error('explicit signed successor required')
      assertPublicTrustSuccessor(previous, document, this.ports.clock()); await this.ports.verifyTrust(record, document, previous); this.allowed(authority); if (version !== this.version) throw new Error('successor retired')
      this.record = await this.trust.confirmSuccessor(authority, raw, compared); this.allowed(authority); if (version !== this.version) throw new Error('successor retired'); this.pairing = 'paired'; this.connection = 'disconnected'; this.error = ''; this.emit(); return
    }
    if (this.record === null && previous === null) return this.pair(authority, raw, compared)
    if (!compared || previous === null || record.revoked || this.record?.revoked || this.pairing !== 'paired' || canonicalPublicTrust(document) !== canonicalPublicTrust(previous)) throw new Error('saved pairing comparison denied')
    await this.ports.verifyTrust(record, document); this.allowed(authority); if (version !== this.version) throw new Error('saved pairing retired')
  }
  /** @param authority - explicit native connect decision. @returns after starting finite paired recovery; authorization is reported separately. */
  async connect(authority: object): Promise<void> {
    this.allowed(authority); if (this.connecting || this.transport !== undefined || this.record === null || this.record.revoked || this.pairing !== 'paired') throw new Error('product connect denied'); this.connecting = true; const record = this.record
    const transport = new PairedProductTransport(this.policy.transport, Math.min(record.paired.expiresAt, record.paired.grant.expiresAt), this.ports.clock, this.ports.scheduler, (status, received) => this.ports.connect(record, status, received), state => {
      if (this.closed || this.transport !== transport) return
      if (this.connection === 'blocked' && state === 'closed') return
      this.connection = state
      if (state === 'blocked' || state === 'closed') this.error = 'connection-stopped'
      if (state === 'disconnected' || state === 'recovering' || state === 'blocked') { this.richVersion++; this.core?.model.disconnect(); this.core?.retireMounts(); this.richMount = null }
      this.emit(); if (state === 'connected') void this.refreshCatalog().catch(error => { void error; this.error = 'catalog-unavailable'; this.emit() })
    }, this.lifetime.signal); this.transport = transport
    try { await transport.start() } catch (error) { this.error = 'connection-unavailable'; await transport.close(); this.transport = undefined; this.emit(); throw error } finally { this.connecting = false }
  }
  private async refreshCatalog(): Promise<void> { const transport = this.transport, record = this.record; if (transport === undefined || record === null) return; const metadata = object(await transport.metadata()), catalog = object(metadata.catalog); if (metadata.desktopId !== record.paired.grant.desktopId || metadata.profileId !== record.paired.grant.profileId || !Array.isArray(catalog.projects) || !Array.isArray(catalog.sessions) || catalog.projects.length > record.paired.grant.sessions.length || catalog.sessions.length > record.paired.grant.sessions.length) throw new TransportError('scope-denied'); const sessions = catalog.sessions.map(candidate => { const row = object(candidate), sessionId = string(row.sessionId, 256); if (!record.paired.grant.sessions.includes(id<'SessionId'>(sessionId))) throw new TransportError('scope-denied'); return { sessionId, projectId: row.projectId === null ? null : string(row.projectId, 256), title: string(row.title, this.policy.domain.maxText) } }), projects = catalog.projects.map(candidate => { const row = object(candidate); if (!Array.isArray(row.sessionIds) || row.sessionIds.some(sessionId => !sessions.some(session => session.sessionId === sessionId))) throw new TransportError('scope-denied'); return { projectId: string(row.projectId, 256), title: string(row.title, this.policy.domain.maxText), sessionIds: row.sessionIds.map(sessionId => string(sessionId, 256)) } }); if (this.transport !== transport || this.closed) return; this.catalog = { projects, sessions }; this.emit() }
  /** @param authority - native selection decision. @param sessionId - one admitted catalogue row. @returns after old follow/rich lifetimes retire and the original Session stream starts. */
  async select(authority: object, sessionId: string): Promise<void> {
    this.allowed(authority); if (this.transport === undefined || this.record === null || !this.catalog.sessions.some(row => row.sessionId === sessionId)) throw new Error('product selection denied'); const version = this.version, selectionVersion = ++this.selectionVersion
    const operation = this.selectionTail.then(async () => { await this.stopSelection(); this.allowed(authority); if (version !== this.version || selectionVersion !== this.selectionVersion || this.record === null || this.transport === undefined) throw new Error('product selection retired'); const grant = this.record.paired.grant
    const model = new SemanticPhone({ desktopId: grant.desktopId, deviceId: grant.deviceId, sessionId: id<'SessionId'>(sessionId) }, this.policy.domain, this.policy.duplicateCap), core = new PhoneCore(this.transport, model, { ...this.policy.core, grantEpoch: grant.epoch, clock: this.ports.clock, nextCommandId: () => id<'mobile-command'>(this.policy.commandPrefix + '-' + ++this.command) }); this.core = core; const controller = new AbortController(); this.followAbort = controller
    this.following = (async () => { try { for await (const view of core.follow(controller.signal)) { void view; if (this.core !== core || this.closed) return; this.emit(); this.scheduleRich(core) } } catch (error) { if (!controller.signal.aborted && !this.closed) { this.error = error instanceof TransportError ? error.code : 'stream-unavailable'; this.emit() } } })(); this.emit() }); this.selectionTail = operation.then(() => {}, () => {}); await operation
  }
  private requireCore(): PhoneCore { if (this.core === undefined || this.closed) throw new Error('product selection required'); return this.core }
  /** @param authority - native user intent. @param requestId - stable intent identity. @param text - composer text. @returns original canonical receipt; uncertainty is displayed without automatic re-dispatch. */
  async submit(authority: object, requestId: string, text: string): Promise<JsonValue> { this.allowed(authority); try { return await this.requireCore().submit(requestId, text) } finally { this.emit() } }
  /** @param authority - native receipt lookup. @param requestId - original stable intent. @returns read-only reconciliation, never a submit retry. */
  async receipt(authority: object, requestId: string): Promise<JsonValue> { this.allowed(authority); const value = await this.requireCore().receipt(requestId); this.emit(); return value }
  /** @param authority - explicit native cancellation decision. @returns after canonical cancellation acknowledgment. */
  async cancel(authority: object): Promise<void> { this.allowed(authority); await this.requireCore().cancel(); this.emit() }
  private scheduleRich(core: PhoneCore): void { const version = this.richVersion; this.richTail = this.richTail.then(async () => { const current = () => this.core === core && !this.closed && this.connection === 'connected' && version === this.richVersion; if (!current()) return; const reference = core.model.view.messages.flatMap(message => message.rich)[0]; if (reference === undefined) return; const old = this.richMount, next = old === null ? await core.mount(reference) : { ...old, snapshot: core.model.richSnapshot(await core.request('rich.snapshot', { mountId: old.mountId }), reference) }; if (!current()) { if (old === null && this.connection === 'connected' && !this.closed) await core.request('rich.dispose', { mountId: next.mountId }); return }; this.richMount = next; this.emit() }).catch(error => { void error; if (!this.closed && version === this.richVersion && this.core === core) { this.error = 'rich-unavailable'; this.emit() } }) }
  /** @param raw - untrusted Web message from the native-bound renderer port. @returns scoped reply; task/selection/credential/host operations have no entry. */
  async richRequest(raw: string): Promise<string> { if (new TextEncoder().encode(raw).length > this.policy.domain.maxBytes) throw new Error('rich packet capacity'); const packet = object(JSON.parse(raw)); if (this.failed || this.closed || Object.keys(packet).sort().join(',') !== 'id,kind,operation,payload' || packet.kind !== 'rich.request' || !['rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status'].includes(String(packet.operation)) || this.richMount === null || this.connection !== 'connected') throw new Error('rich request denied'); const payload = object(packet.payload); if (payload.mountId !== this.richMount.mountId) throw new Error('rich scope denied'); const core = this.requireCore(), version = this.richVersion, mountId = this.richMount.mountId, idText = string(packet.id, 128), result = await core.request(packet.operation as MobileOperation, payload); if (this.closed || this.core !== core || version !== this.richVersion || this.richMount?.mountId !== mountId) throw new TransportError('stale-mount'); this.scheduleRich(core); return JSON.stringify(jsonPayload({ kind: 'rich.reply', id: idText, value: result })) }
  private async stopSelection(): Promise<void> { this.richVersion++; const controller = this.followAbort, following = this.following, core = this.core, mounted = this.richMount; this.core = undefined; this.followAbort = undefined; this.following = undefined; this.richMount = null; this.emit(); try { controller?.abort() } catch (error) { void error; this.failed = true }; const results = await Promise.allSettled([following, this.richTail, mounted !== null && this.connection === 'connected' && core !== undefined ? core.request('rich.dispose', { mountId: mounted.mountId }) : Promise.resolve()]); if (results.some(result => result.status === 'rejected')) { this.failed = true; throw new Error('product selection cleanup failed') } }
  /** @param authority - explicit native revoke decision. @returns after immediate transport denial and public tombstone; no key deletion or remote admin command. */
  async revoke(authority: object): Promise<void> { this.allowed(authority); this.version++; this.selectionVersion++; this.pairing = 'revoked'; this.connection = 'closed'; this.lifetime.abort(); const transport = this.transport; this.transport = undefined; const results = await Promise.allSettled([transport?.close(), this.selectionTail.then(() => this.stopSelection()), this.trust.revoke(authority)]); this.emit(); if (results.some(result => result.status === 'rejected')) { this.error = 'revocation-outcome-unknown'; this.emit(); throw new Error('product revocation failed') } }
  /** @returns after every follow, rich request and native generation closes; accepted desktop work stays on desktop. */
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.version++; this.selectionVersion++; this.richVersion++; this.closed = true; this.connection = 'closed'; this.core?.model.disconnect(); this.richMount = null; this.lifetime.abort(); const transport = this.transport; this.transport = undefined; this.emit(true); this.closing = (async () => { const results = await Promise.allSettled([transport?.close(), this.selectionTail.then(() => this.stopSelection()), this.trust.close()]); if (this.failed || results.some(result => result.status === 'rejected')) throw new Error('product cleanup failed') })(); return this.closing }
}

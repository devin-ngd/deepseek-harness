/** Original-HUKS device product owner; legacy Session files and identity creation remain outside this mode. */
import { util } from '@kit.ArkTS'
import { huks } from '@kit.UniversalKeystoreKit'
import { deviceInfo } from '@kit.BasicServicesKit'
import { common } from '@kit.AbilityKit'
import { NativeDeviceProductFacade, NativeDeviceNetwork, NativeDeviceCrypto, ProductStorage, AutomaticConnection } from './ProductCore'
import { NativePorts } from '../paired/PairedCore'
import { NativeProductConfiguration, NativeProductPublicStorage } from './NativeProductOwner'
import { NativeDeviceTrustFile } from './NativeDeviceTrustFile'
import { NativePairedConnectionOwner, NativePairedPolicy, NativeProductCodec } from '../native/NativePairedConnectionOwner'
import { NativeCryptoPrimitives } from '../native/NativeCryptoPrimitives'
import { NativeDeviceKeys, NativeDeviceKeyPolicy } from '../native/NativeDeviceKeys'
import { NativeExistingIdentitySigner } from '../native/NativeExistingIdentitySigner'
import { ProductView } from './ProductView'

class DeviceAuthority { readonly label: string = 'native-device-product' }
interface DevicePublicSelection { identityAlias: string; audience: string; bindingId: string; desktopPublicSpki: string }
interface DeviceRoutingSelection { identityAlias: string; audience: string; bindingId: string; desktopPublicSpki: string; routeId: string }
interface DeviceCommandPolicy { enabled: boolean; commandPrefix: string }
interface SavedDeviceScope { key: string; desktopId: string; profileId: string; sessions: string[] }
interface DevicePreview { desktopId: string }
class DeviceNetwork implements NativeDeviceNetwork {
  readonly ports: NativePorts
  private owner: NativePairedConnectionOwner
  private authority: object
  constructor(ports: NativePorts, owner: NativePairedConnectionOwner, authority: object) { this.ports = ports; this.owner = owner; this.authority = authority }
  open(): Promise<void> { return this.owner.openDeviceControlNative(this.authority) }
  authenticated(): void { this.owner.authenticatedDeviceDataNative(this.authority) }
  close(): Promise<void> { return this.owner.closeNative(this.authority) }
}
/** This mode never calls NativeDeviceKeys.create, imports private keys or copies legacy grants into device storage. */
export class NativeDeviceProductOwner {
  private authority: object = new DeviceAuthority()
  private config: NativeProductConfiguration
  private runtime: NativeDeviceProductFacade | undefined = undefined
  private originalSigner: NativeExistingIdentitySigner | undefined = undefined
  private storage: NativeProductPublicStorage | undefined = undefined
  private routeStorage: NativeProductPublicStorage | undefined = undefined
  private raw: string | null = null
  private alias: string = ''
  private host: string = ''
  private filesDir: string = ''
  private generation: number = 0
  private closed: boolean = false
  private recovering: boolean = false
  private recoveryState: string = ''
  private recoveryAudit: string = ''
  private startupReported: boolean = false
  private startupStorage: string = ''
  private loaded: boolean = false
  private starting: boolean = false
  private automatic: AutomaticConnection | undefined = undefined
  private connectionState: string = 'disconnected'
  private autoStopped: boolean = false
  private preparing: Promise<void> | undefined = undefined
  private closing: Promise<void> | undefined = undefined
  private publish: (view: string) => void = () => {}
  constructor(config: NativeProductConfiguration) { this.config = config; this.alias = config.identityAlias; this.host = config.approvedHost }
  private available(): void { if (this.closed || deviceInfo.sdkApiVersion < 20) throw new Error('native device product unavailable') }
  private empty(error: string = '', startupDiagnostic: string = '', refusedPairing: string = 'blocked'): void { this.publish(JSON.stringify({ storageRecovery: this.recoveryState, startupDiagnostic, startupStorage: this.startupStorage, pairing: error === '' ? 'unpaired' : refusedPairing, connection: 'disconnected', error, projects: [], sessions: [], selected: '', task: 'idle', readOnly: true, messages: [], liveText: '', richJson: '' })) }
  private metadata(storage: NativeProductPublicStorage | undefined, label: string): string {
    try { const value = storage?.inspect?.(); if (value !== undefined) return label + '[file=' + value.file + ',size=' + (value.size < 0 ? 'unknown' : value.size.toString()) + ',lock=' + value.lock + ',held=' + value.held.toString() + ']' } catch (error) { void error }
    return label + '[file=unknown,size=unknown,lock=unknown,held=false]'
  }
  private startupError(error: Error, stage: string): void { if (!this.closed && !this.startupReported) { this.startupReported = true; if (this.config.deviceRecovery !== undefined && (this.storage?.recoveryRequired?.() === true || this.routeStorage?.recoveryRequired?.() === true)) this.recoveryState = 'required'; this.empty('device-binding-unavailable', NativeDeviceProductFacade.startupDiagnostic(error, stage)) } }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> { this.filesDir = context.filesDir; await this.start(new NativeDeviceTrustFile(context.filesDir, this.config.publicTrustMaxBytes, 'device-binding-v1', this.recovering), publish) }
  async start(storage: NativeProductPublicStorage, publish: (view: string) => void, routeStorage?: NativeProductPublicStorage): Promise<void> {
    if (this.starting || this.loaded || this.runtime !== undefined) throw new Error('native device product already started')
    this.closed = false; this.starting = true; this.storage = storage; this.routeStorage = routeStorage === undefined && this.filesDir !== '' ? new NativeDeviceTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'device-route-v1', this.recovering) : routeStorage; this.publish = publish; const generation = ++this.generation
    this.startupReported = false; this.startupStorage = 'pre-read: ' + this.metadata(storage, 'binding') + '; ' + this.metadata(this.routeStorage, 'history')
    let stage = 'binding-read'
    try { this.raw = await storage.read(this.config.publicTrustMaxBytes); if (this.closed || generation !== this.generation) throw new Error('native device start retired'); this.loaded = true; if (this.raw !== null) this.selection(this.raw); if (this.alias !== '' && this.host !== '') { stage = 'identity-init'; await this.ensureRuntime() } else this.empty() }
    catch (error) { this.startupError(error as Error, stage); throw new Error('native device preparation failed; original state retained') }
    finally { this.starting = false }
  }
  /** Explicit recovery never signs, rewrites record bytes, or admits an old route. */
  async recoverStorage(confirmed: boolean): Promise<void> {
    const pin = this.config.deviceRecovery
    if (!confirmed || pin === undefined || this.recoveryState !== 'required' || this.filesDir === '') throw new Error('device recovery not approved')
    await this.close(); this.closing = undefined; this.loaded = false; this.raw = null; this.recovering = true; this.recoveryState = 'validating'
    const binding = new NativeDeviceTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'device-binding-v1', true), history = new NativeDeviceTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'device-route-v1', true)
    try { await this.start(binding, this.publish, history); this.recoveryAudit = await this.core().verifyStorageRecovery(JSON.stringify(pin)); await binding.archiveValidated(); await history.archiveValidated(); this.recoveryState = 'recovered'; this.startupStorage = 'post-recovery: ' + this.metadata(binding, 'binding') + '; ' + this.metadata(history, 'history'); await this.core().bootStatus() }
    catch (error) { this.recoveryState = 'refused'; this.startupReported = true; this.empty('device-storage-recovery-refused', NativeDeviceProductFacade.startupDiagnostic(error as Error, 'binding-read'), this.recoveryAudit.length > 0 ? 'paired' : 'blocked'); await this.close(); throw new Error('original device recovery refused; records retained') }
    finally { this.recovering = false }
  }
  private selection(raw: string): DevicePublicSelection {
    if (new util.TextEncoder().encodeInto(raw).length > this.config.publicTrustMaxBytes) throw new Error('native device public capacity')
    const value = JSON.parse(NativeDeviceProductFacade.selectionInput(raw)) as DevicePublicSelection
    if (this.alias !== '' && this.alias !== value.identityAlias || this.host !== '' && this.host !== value.audience) throw new Error('native original device selection denied')
    this.alias = value.identityAlias; this.host = value.audience; return value
  }
  private ensureRuntime(): Promise<void> {
    this.available(); if (this.runtime !== undefined) return Promise.resolve(); if (this.preparing !== undefined) return this.preparing
    const generation = this.generation, authority = this.authority
    const operation = (async () => {
      if (!this.loaded || this.storage === undefined || this.alias === '' || this.host === '') throw new Error('native device bootstrap selection missing')
      const storage = this.storage, primitive = new NativeCryptoPrimitives(this.config.maxCryptoBytes), codec = new NativeProductCodec(primitive), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, this.alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes)), signer = new NativeExistingIdentitySigner(authority, keys, primitive)
      try {
        const publicSpki = codec.encode(await signer.initializeNative(authority)); this.available(); if (generation !== this.generation) throw new Error('native device bootstrap retired')
        const policy = JSON.parse(this.config.corePolicyJson) as DeviceCommandPolicy; policy.enabled = true; policy.commandPrefix = 'device-native-' + util.generateRandomUUID(false)
        const publicStore: ProductStorage = { read: async () => this.raw, write: async (next: string): Promise<void> => { await storage.write(next); this.raw = next }, close: () => storage.close() }
        const crypto: NativeDeviceCrypto = { signer: { publicSpki, sign: (bytes: Uint8Array): Promise<Uint8Array> => signer.signNative(authority, bytes) }, primitives: codec }
        const routing = this.config.deviceRoutingTtlMs
        if (routing === undefined || !Number.isSafeInteger(routing) || routing <= 0 || routing > 0x7fffffff) throw new Error('native device routing budget missing')
        const runtime = new NativeDeviceProductFacade(authority, JSON.stringify(policy), this.alias, this.host, Date.now() + routing, this.config.relay, publicStore, crypto, { after: (ms: number, callback: () => void): () => void => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }, () => Date.now(), async (raw: string, diagnostic?: (stage: string) => void): Promise<NativeDeviceNetwork> => {
          const record = JSON.parse(NativeDeviceProductFacade.routingInput(raw)) as DeviceRoutingSelection, owner = new NativePairedConnectionOwner(authority, new NativePairedPolicy(this.host, record.routeId, this.alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, deviceInfo.sdkApiVersion, this.config.maxCryptoBytes, this.config.maxTotalSendBytes, this.config.relay))
          try { const ports = await owner.acquireDevicePortsNative(authority, record.desktopPublicSpki, diagnostic); if (this.closed || generation !== this.generation) throw new Error('native device network retired'); return new DeviceNetwork(ports, owner, authority) }
          catch (error) { try { await owner.closeNative(authority) } catch (cleanup) { void cleanup; diagnostic?.('cleanup-failed') }; throw (error as Error) }
        }, view => { if (!this.closed && generation === this.generation) { const next = JSON.parse(view) as ProductView; if (typeof next.startupDiagnostic === 'string' && next.startupDiagnostic.length > 0) { this.startupReported = true; if (this.config.deviceRecovery !== undefined && (this.storage?.recoveryRequired?.() === true || this.routeStorage?.recoveryRequired?.() === true)) this.recoveryState = 'required' }; next.storageRecoveryAudit = this.recoveryAudit; next.storageRecovery = this.recoveryState; next.startupStorage = this.startupStorage; next.connectionGeneration = generation; this.connectionState = next.connection; this.publish(JSON.stringify(next)) } }, this.config.deviceCatalogRefreshMs === undefined ? 0 : this.config.deviceCatalogRefreshMs, this.routeStorage, this.config.deviceAutoConnect === true)
        this.originalSigner = signer; this.runtime = runtime; await runtime.boot()
        if (this.config.deviceAutoConnect === true && !this.closed && generation === this.generation) {
          const retry = this.config.deviceReconnectMs
          if (retry === undefined) throw new Error('device reconnect interval missing')
          this.automatic = new AutomaticConnection({ available: (): boolean => !this.closed && runtime.bound() && runtime.routeReady(), connected: (): boolean => this.connectionState === 'connected', connect: (): Promise<void> => runtime.connect(true), disconnect: (): Promise<void> => runtime.stopRoute(), failed: (): void => { console.info('DSH_AUTOCONNECT_FAILED') } }, { after: (ms: number, callback: () => void): () => void => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }, retry)
          if (!this.autoStopped) void this.automatic.start().catch((_error: Error) => { console.info('DSH_AUTOCONNECT_FAILED') })
        }
      } catch (error) { if (this.runtime === undefined) signer.closeNative(authority); throw new Error('native device preparation failed; original state retained') }
    })()
    this.preparing = operation
    void operation.then(() => { if (this.preparing === operation) this.preparing = undefined }, () => { if (this.preparing === operation) this.preparing = undefined })
    return operation
  }
  private core(): NativeDeviceProductFacade { this.available(); if (this.runtime === undefined) throw new Error('native device not prepared'); return this.runtime }
  connectionEnabled(): boolean { return !this.recovering && this.recoveryState !== 'refused' && this.runtime !== undefined && this.runtime.bound() && this.runtime.routeReady() }
  /** Verified original host disclosure; foreground renewal never preserves network consent. */
  connectionHost(): string { return this.runtime === undefined ? '' : this.runtime.connectionHost() }
  async previewEnrollment(raw: string): Promise<string> { this.selection(raw); await this.ensureRuntime(); return this.core().previewEnrollment(raw) }
  async signEnrollment(raw: string, compared: boolean): Promise<string> { if (!compared) throw new Error('native original fingerprint comparison required'); this.selection(raw); await this.ensureRuntime(); return this.core().signEnrollment(raw, compared) }
  preview(raw: string): string { if (new util.TextEncoder().encodeInto(raw).length > this.config.publicTrustMaxBytes) throw new Error('native device preview capacity'); return NativeDeviceProductFacade.previewReceipt(raw) }
  async pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void> { if (!compared || !networkApproved) throw new Error('native device comparison/network approval required'); this.selection(raw); await this.ensureRuntime(); await this.core().pairWithConnection(raw, compared, networkApproved) }
  async savedPairing(confirmed: boolean): Promise<string> { this.available(); if (!confirmed || this.raw === null) throw new Error('native saved device absent'); this.preview(this.raw); return this.raw }
  async listSavedScopes(confirmed: boolean): Promise<string> { this.available(); if (!confirmed) throw new Error('native device selection denied'); if (this.raw === null) return '[]'; const view = JSON.parse(this.preview(this.raw)) as DevicePreview, scope: SavedDeviceScope = { key: 'device-binding-v1', desktopId: view.desktopId, profileId: 'desktop', sessions: [] }; return JSON.stringify([scope]) }
  async selectSavedScope(key: string, confirmed: boolean): Promise<string> { if (key !== 'device-binding-v1') throw new Error('native foreign device scope denied'); return this.savedPairing(confirmed) }
  async publicIdentity(alias: string): Promise<string> {
    this.available(); if (this.alias !== '' && this.alias !== alias) throw new Error('native original alias mismatch')
    const authority = this.authority, generation = this.generation, primitive = new NativeCryptoPrimitives(this.config.maxCryptoBytes), codec = new NativeProductCodec(primitive), signer = new NativeExistingIdentitySigner(authority, new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes)), primitive)
    try { const publicSpki = codec.encode(await signer.initializeNative(authority)), credentialId = await codec.credentialId(publicSpki); this.available(); if (generation !== this.generation) throw new Error('native device inspection retired'); this.alias = alias; return JSON.stringify({ identityAlias: alias, publicSpki, credentialId }) }
    finally { signer.closeNative(authority) }
  }
  async initializeIdentity(alias: string, confirmed: boolean): Promise<string> { if (!confirmed) throw new Error('native original identity inspection denied'); return this.publicIdentity(alias) }
  /** @param networkApproved - explicit host decision from the current native page. @returns after fresh connection with the original binding. */
  connect(networkApproved: boolean): Promise<void> { if (this.recovering || this.recoveryState === 'refused' || !networkApproved) return Promise.reject(new Error('device connection not available')); this.autoStopped = false; return this.automatic === undefined ? this.core().connect(networkApproved) : this.automatic.start() }
  previewRoute(raw: string): Promise<string> { return this.core().previewRoute(raw) }
  signRoute(raw: string, approved: boolean): Promise<string> { return this.core().signRoute(raw, approved) }
  stopRoute(): Promise<void> { this.autoStopped = true; return this.automatic === undefined ? this.core().stopRoute() : this.automatic.stop() }
  select(session: string): Promise<void> { return this.core().select(session) }
  refresh(): Promise<void> { return this.core().refresh() }
  submit(request: string, text: string): Promise<string> { return this.core().submit(request, text) }
  receipt(request: string): Promise<string> { return this.core().receipt(request) }
  cancel(): Promise<void> { return this.core().cancel() }
  richRequest(packet: string): Promise<string> { return this.core().richRequest(packet) }
  richRefusal(packet: string): string { return this.core().richRefusal(packet) }
  async revoke(): Promise<void> { this.autoStopped = true; await this.automatic?.stop(); await this.core().revoke() }
  async foreground(): Promise<void> { await this.closing; if (!this.closed) return; this.closing = undefined; this.loaded = false; this.raw = null; if (this.filesDir === '') throw new Error('native device foreground storage missing'); await this.start(new NativeDeviceTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'device-binding-v1', this.recovering), this.publish) }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closed = true; this.generation++; const runtime = this.runtime, automatic = this.automatic; this.runtime = undefined; this.automatic = undefined
    this.closing = (async () => {
      const automaticStop = await Promise.allSettled([automatic?.stop()])
      const outcomes = await Promise.allSettled([this.preparing, runtime?.close()]); this.originalSigner?.closeNative(this.authority); this.originalSigner = undefined
      let storeFailed: boolean = false
      if (runtime === undefined) { const stores = await Promise.allSettled([this.storage?.close(), this.routeStorage?.close()]); storeFailed = stores.some(value => value.status === 'rejected') }
      if (automaticStop.some(value => value.status === 'rejected') || outcomes.some(value => value.status === 'rejected') || storeFailed) throw new Error('native device product close failed')
    })()
    return this.closing
  }
}

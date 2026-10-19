/** Native trusted UI/storage/paired IO owner. Default-disabled configuration creates no key, socket or public record. */
import { util } from '@kit.ArkTS'
import { huks } from '@kit.UniversalKeystoreKit'
import { common } from '@kit.AbilityKit'
import { deviceInfo } from '@kit.BasicServicesKit'
import { NativeProductFacade, ProductPorts, ProductConnection, ProductStorage } from './ProductCore'
import { NativePairedConnectionOwner, NativePairedPolicy } from '../native/NativePairedConnectionOwner'
import { NativeRelayBudgets } from '../paired/PairedCore'
import { NativePublicTrustFile } from './NativePublicTrustFile'
import { NativeDeviceKeys, NativeDeviceKeyPolicy } from '../native/NativeDeviceKeys'
import { NativeExistingIdentitySigner } from '../native/NativeExistingIdentitySigner'
import { NativeCryptoPrimitives } from '../native/NativeCryptoPrimitives'
import { NativeFailure } from '../native/NativeFailure'
/** Deployment inputs must be supplied locally; device API 0 keeps the source app inactive. */
export interface NativeProductConfiguration { enabled: boolean; approvedHost: string; identityAlias: string; deviceApiVerified: number; maxCryptoBytes: number; maxTotalSendBytes: number; publicTrustMaxBytes: number; corePolicyJson: string; relay: NativeRelayBudgets }
interface GrantRecord { credentialId: string }
interface PairedRecord { pairId: string; audience: string; credentialId: string; desktopCredentialId: string; grant: GrantRecord }
interface PublicRecord { identityAlias: string; desktopPublicSpki: string; paired: PairedRecord }
interface EnrollmentTicket { challengeId: string; desktopId: string; profileId: string; deviceId: string; expiresAt: number }
interface EnrollmentInput { identityAlias: string; desktopPublicSpki: string; phonePublicSpki: string; signature: string; desktopBytes: number[]; phoneBytes: number[]; ticket: EnrollmentTicket; sessions: string[]; operations: string[]; audience: string; expiresAt: number; grantTtlMs: number }
interface PublicIdentity { publicSpki: string; credentialId: string }
interface RenewalVerification { bytes: number[]; signature: string; previousCanonical: string; previousDigest: string }
interface CommandIdentity { commandPrefix: string; enabled: boolean; trustMaxBytes: number }
interface SavedScope { key: string; desktopId: string; profileId: string; sessions: string[] }
/** Native-owned public storage is injectable for SDK-substitute acceptance; no secret-store or network fallback exists. */
export interface NativeProductPublicStorage extends ProductStorage {}
class ProductAuthority { readonly label: string = 'native-product' }
/** Each acquired ETS connection has its exact native authority; generated rich HTML cannot obtain it. */
class Connection implements ProductConnection {
  private owner: NativePairedConnectionOwner
  private authority: object
  constructor(owner: NativePairedConnectionOwner, authority: object) { this.owner = owner; this.authority = authority }
  request(id: string, packet: string): Promise<void> { return this.owner.requestNative(this.authority, id, packet) }
  follow(id: string, packet: string): Promise<void> { return this.owner.followNative(this.authority, id, packet) }
  stop(id: string): Promise<void> { return this.owner.stopNative(this.authority, id) }
  close(): Promise<void> { return this.owner.closeNative(this.authority) }
}
/** ArkUI alone selects pair/connect/session/task/revoke. Native lifecycle closes the shared product plus all late connections. */
export class NativeProductOwner {
  private authority: object = new ProductAuthority()
  private config: NativeProductConfiguration
  private product: NativeProductFacade | undefined = undefined
  private storage: NativeProductPublicStorage | undefined = undefined
  private publish: (view: string) => void = () => {}
  private closing: Promise<void> | undefined = undefined
  private starting: boolean = false
  private generation: number = 0
  private filesDir: string = ''
  private identityCreating: boolean = false
  private enrollmentSigned: Set<string> = new Set()
  private selectedScope: string = ''
  private scopeBlocked: boolean = false
  private listedScopes: Map<string, string> = new Map()
  constructor(config: NativeProductConfiguration) { this.config = config }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> { this.filesDir = context.filesDir; await this.start(new NativePublicTrustFile(context.filesDir, this.config.publicTrustMaxBytes, this.selectedScope), publish) }
  async start(storage: NativeProductPublicStorage, publish: (view: string) => void): Promise<void> {
    if (this.scopeBlocked || this.product !== undefined || this.starting) throw new Error('native product already started or scope storage blocked'); this.starting = true; const generation = ++this.generation; try { await this.closing; if (generation !== this.generation) throw new Error('native product start retired'); this.storage = storage; this.publish = publish; this.closing = undefined
    const ports: ProductPorts = { storage, scheduler: { after: (ms: number, callback: () => void): () => void => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }, clock: () => Date.now(), verifyTrust: (raw: string, previous?: string) => this.verify(raw, previous), connect: async (raw: string, status: (state: string) => void, received: (packet: string) => void): Promise<ProductConnection> => { await this.verify(raw); const record = JSON.parse(this.core().trustInput(raw)) as PublicRecord, authority = new ProductAuthority(), owner = new NativePairedConnectionOwner(authority, new NativePairedPolicy(this.config.approvedHost, record.paired.pairId, this.config.identityAlias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.deviceApiVerified, this.config.maxCryptoBytes, this.config.maxTotalSendBytes, this.config.relay)); try { await owner.connectNative(authority, JSON.stringify(record.paired), record.desktopPublicSpki, status, received); return new Connection(owner, authority) } catch (error) { await owner.closeNative(authority); throw new Error('native product connection failed') } } }
    const settings = JSON.parse(this.config.corePolicyJson) as CommandIdentity
    if (settings.enabled !== this.config.enabled || settings.trustMaxBytes !== this.config.publicTrustMaxBytes || this.config.enabled && (!/^[a-z0-9.-]+$/.test(this.config.approvedHost) || this.config.approvedHost.endsWith('.invalid') || this.config.identityAlias.length === 0 || !Number.isSafeInteger(this.config.deviceApiVerified) || this.config.deviceApiVerified < 20)) throw new Error('native product configuration denied')
    settings.commandPrefix = 'native-' + util.generateRandomUUID(false)
    const core = new NativeProductFacade(this.authority, JSON.stringify(settings), ports, value => this.publish(value)); this.product = core; activeProducts.add(this); await core.boot()
    } finally { this.starting = false }
  }
  private async verify(raw: string, previous?: string): Promise<void> {
    if (!this.config.enabled || this.config.deviceApiVerified < 20) throw new Error('native product disabled'); const record = JSON.parse(this.core().trustInput(raw)) as PublicRecord
    if (record.identityAlias !== this.config.identityAlias || record.paired.audience !== this.config.approvedHost) throw new Error('native local trust selection denied')
    const authority = new ProductAuthority(), crypto = new NativeCryptoPrimitives(this.config.maxCryptoBytes), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, this.config.identityAlias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes)), signer = new NativeExistingIdentitySigner(authority, keys, crypto), base64 = new util.Base64Helper()
    try {
      const own = await signer.initializeNative(authority), desktop = base64.decodeSync(record.desktopPublicSpki, util.Type.BASIC_URL_SAFE); await crypto.validatePublicSpki(desktop)
      const fingerprint = async (bytes: Uint8Array): Promise<string> => { const digest = await crypto.hash(bytes); let value: string = 'p256-sha256-'; for (const byte of digest) value += byte.toString(16).padStart(2, '0'); return value }
      if (await fingerprint(own) !== record.paired.credentialId || await fingerprint(desktop) !== record.paired.desktopCredentialId || record.paired.credentialId !== record.paired.grant.credentialId) throw new Error('native public fingerprint denied')
      const proofs = JSON.parse(this.core().renewalInput(raw, previous)) as RenewalVerification[]
      for (const proof of proofs) {
        const bytes = await crypto.hash(new util.TextEncoder().encodeInto(proof.previousCanonical)); let digest: string = ''; for (const byte of bytes) digest += byte.toString(16).padStart(2, '0')
        if (digest !== proof.previousDigest) throw new Error('native predecessor denied')
        if (!await crypto.verifyP256(desktop, Uint8Array.from(proof.bytes), base64.decodeSync(proof.signature, util.Type.BASIC_URL_SAFE))) throw new Error('native successor signature denied')
      }
    } finally { signer.closeNative(authority) }
  }
  private core(): NativeProductFacade { if (this.product === undefined) throw new Error('native product not started'); return this.product }
  connectionEnabled(): boolean { return this.config.enabled && this.product !== undefined }
  private enrollmentFailure(stage: string, error: Error): void {
    let failure: string = 'native-error'
    if (error instanceof NativeFailure) { const allowed: string[] = ['crypto-input-invalid', 'crypto-public-key-invalid', 'crypto-verify-failed', 'crypto-hash-failed', 'key-public-export-failed', 'key-public-export-invalid']; failure = allowed.includes(error.code) ? error.code : 'native-failure' }
    else if (error instanceof Error && (error.name === 'TypeError' || error.name === 'ReferenceError' || error.name === 'SyntaxError' || error.name === 'ZodError')) failure = error.name
    console.error('DSH_ENROLLMENT_REFUSED stage=' + stage + ' failure=' + failure)
  }
  private async enrollmentInput(raw: string): Promise<EnrollmentInput> {
    let stage: string = 'parse-offer'; console.info('DSH_ENROLLMENT_STAGE=' + stage)
    try {
      stage = 'native-parse-json'; console.info('DSH_ENROLLMENT_STAGE=' + stage); JSON.parse(raw)
      stage = 'shared-offer-input'; console.info('DSH_ENROLLMENT_STAGE=' + stage); const shared = this.core().firstUseInput(raw, Date.now())
      const sharedType = typeof shared; console.info('DSH_ENROLLMENT_RETURN type=' + sharedType + ' units=' + (sharedType === 'string' ? shared.length : 0))
      stage = 'decode-shared-input'; console.info('DSH_ENROLLMENT_STAGE=' + stage); const input = JSON.parse(shared) as EnrollmentInput
      stage = 'read-selected-phone-key'; console.info('DSH_ENROLLMENT_STAGE=' + stage)
      const identity = JSON.parse(await this.publicIdentity(input.identityAlias)) as PublicIdentity, base64 = new util.Base64Helper(), crypto = new NativeCryptoPrimitives(this.config.maxCryptoBytes)
      stage = 'compare-selected-phone-key'; if (identity.publicSpki !== input.phonePublicSpki) throw new Error('native enrollment phone denied')
      stage = 'hash-public-transcript'; const digest = await crypto.hash(Uint8Array.from(input.desktopBytes)); let fingerprint: string = ''; for (const byte of digest) fingerprint += byte.toString(16).padStart(2, '0')
      console.info('DSH_ENROLLMENT_TRANSCRIPT bytes=' + input.desktopBytes.length + ' sha256=' + fingerprint)
      stage = 'verify-desktop-signature'; console.info('DSH_ENROLLMENT_STAGE=' + stage)
      if (!await crypto.verifyP256(base64.decodeSync(input.desktopPublicSpki, util.Type.BASIC_URL_SAFE), Uint8Array.from(input.desktopBytes), base64.decodeSync(input.signature, util.Type.BASIC_URL_SAFE))) throw new Error('native enrollment desktop denied')
      stage = 'check-challenge-expiry'; if (input.expiresAt <= Date.now()) throw new Error('native enrollment expired')
      console.info('DSH_ENROLLMENT_STAGE=input-verified'); return input
    } catch (error) { this.enrollmentFailure(stage, error); throw new Error('native enrollment refused at ' + stage) }
  }
  /** Native preview validates the exact existing phone key and desktop signature without creating a grant or connection. */
  async previewEnrollment(raw: string): Promise<string> { const input = await this.enrollmentInput(raw); try { const crypto = new NativeCryptoPrimitives(this.config.maxCryptoBytes), base64 = new util.Base64Helper(), digest = await crypto.hash(base64.decodeSync(input.desktopPublicSpki, util.Type.BASIC_URL_SAFE)); let fingerprint: string = 'p256-sha256-'; for (const byte of digest) fingerprint += byte.toString(16).padStart(2, '0'); const result = JSON.stringify({ desktopFingerprint: fingerprint, phoneFingerprint: (JSON.parse(await this.publicIdentity(input.identityAlias)) as PublicIdentity).credentialId, desktopId: input.ticket.desktopId, profileId: input.ticket.profileId, sessions: input.sessions, operations: input.operations, audience: input.audience, identityAlias: input.identityAlias, expiresAt: input.expiresAt, grantTtlMs: input.grantTtlMs }); console.info('DSH_ENROLLMENT_STAGE=preview-complete'); return result } catch (error) { this.enrollmentFailure('publish-preview', error); throw new Error('native enrollment preview unavailable') } }
  /** Explicit native comparison signs one canonical enrollment challenge only; does not pair, store trust or activate IO. */
  async signEnrollment(raw: string, compared: boolean): Promise<string> {
    this.core(); if (!compared) throw new Error('native enrollment comparison required'); const generation = this.generation, input = await this.enrollmentInput(raw)
    if (generation !== this.generation || this.enrollmentSigned.has(input.ticket.challengeId)) throw new Error('native enrollment retired'); this.enrollmentSigned.add(input.ticket.challengeId)
    const authority = new ProductAuthority(), crypto = new NativeCryptoPrimitives(this.config.maxCryptoBytes), signer = new NativeExistingIdentitySigner(authority, new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, input.identityAlias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes)), crypto), base64 = new util.Base64Helper()
    try { await signer.initializeNative(authority); const signature = await signer.signNative(authority, Uint8Array.from(input.phoneBytes)); if (generation !== this.generation || input.expiresAt <= Date.now()) throw new Error('native enrollment signature retired'); return '{"schema":"harmony-first-use-reply/1","offer":' + raw + ',"proof":{"challenge":' + JSON.stringify(input.ticket) + ',"signature":' + JSON.stringify(base64.encodeToStringSync(signature, util.Type.BASIC_URL_SAFE)) + '}}' } finally { signer.closeNative(authority) }
  }
  /** Selected saved public record is read only after a native decision; default boot remains IO-free and never connects automatically. */
  async savedPairing(confirmed: boolean): Promise<string> { this.core(); if (!confirmed || this.filesDir === '') throw new Error('native saved pairing decision required'); const file = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes, this.selectedScope); try { const raw = await file.read(this.config.publicTrustMaxBytes); if (raw === null) throw new Error('native saved pairing absent'); this.core().preview(raw); return raw } finally { await file.close() } }
  private disableConnection(): void { const previous = this.config, settings = JSON.parse(previous.corePolicyJson) as CommandIdentity; settings.enabled = false; this.config = { enabled: false, approvedHost: previous.approvedHost, identityAlias: previous.identityAlias, deviceApiVerified: previous.deviceApiVerified, maxCryptoBytes: previous.maxCryptoBytes, maxTotalSendBytes: previous.maxTotalSendBytes, publicTrustMaxBytes: previous.publicTrustMaxBytes, corePolicyJson: JSON.stringify(settings), relay: previous.relay } }
  /** Explicit range management stops the old owner; listing saved labels neither selects nor authorizes a range. */
  async listSavedScopes(confirmed: boolean): Promise<string> {
    const parser = this.core(); if (!confirmed || this.filesDir === '' || this.scopeBlocked) throw new Error('native scope selection denied')
    await this.close(); this.disableConnection(); this.listedScopes.clear(); const rows: SavedScope[] = []
    try {
      const legacy = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes)
      try { const raw = await legacy.read(this.config.publicTrustMaxBytes); if (raw !== null) { const value = parser.scopeInput(raw), row = JSON.parse(value) as SavedScope; this.listedScopes.set('legacy', value); rows.push({ key: 'legacy', desktopId: row.desktopId, profileId: row.profileId, sessions: row.sessions }) } } finally { await legacy.close() }
      const catalog = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'catalog')
      try { const values = JSON.parse(parser.scopeCatalog(await catalog.read(this.config.publicTrustMaxBytes))) as SavedScope[]; for (const row of values) { this.listedScopes.set(row.key, JSON.stringify(row)); rows.push(row) } } finally { await catalog.close() }
      await this.foreground(); return JSON.stringify(rows)
    } catch (error) { void error; this.scopeBlocked = true; throw new Error('native scope catalogue unavailable; saved records retained') }
  }
  /** Explicit selection reads only the listed range and returns its public preview input; network remains disabled. */
  async selectSavedScope(key: string, confirmed: boolean): Promise<string> {
    const parser = this.core(), expected = this.listedScopes.get(key)
    if (!confirmed || expected === undefined || this.filesDir === '' || this.scopeBlocked) throw new Error('native scope selection denied')
    await this.close(); this.disableConnection(); const scope = key === 'legacy' ? '' : key, file = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes, scope)
    try { const raw = await file.read(this.config.publicTrustMaxBytes); if (raw === null || parser.scopeInput(raw) !== expected) throw new Error('native scope record mismatch'); this.selectedScope = scope; await this.foreground(); return raw }
    finally { await file.close() }
  }
  /** A separately confirmed scope uses its own public file; existing scope/history is never replaced and no connection starts. */
  async saveNewScope(raw: string, compared: boolean, networkApproved: boolean): Promise<void> {
    const parser = this.core(), scope = JSON.parse(parser.scopeInput(raw)) as SavedScope
    if (!compared || !networkApproved || this.filesDir === '' || this.scopeBlocked) throw new Error('native new scope confirmation denied')
    await this.close(); this.disableConnection()
    const legacy = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes)
    let legacyScope: string = ''
    try { const original = await legacy.read(this.config.publicTrustMaxBytes); if (original !== null) legacyScope = (JSON.parse(parser.scopeInput(original)) as SavedScope).key }
    catch (error) { void error; this.scopeBlocked = true; throw new Error('native legacy scope unavailable; saved history retained') }
    finally { await legacy.close() }
    if (legacyScope === scope.key) { await this.foreground(); throw new Error('native scope already has legacy history; select the saved range instead') }
    this.selectedScope = scope.key; await this.foreground()
    try {
      await this.pairWithConnection(raw, compared, networkApproved)
      const file = new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes, 'catalog')
      try { const original = await file.read(this.config.publicTrustMaxBytes); await file.write(this.core().scopeAdd(original, raw)) } finally { await file.close() }
    } catch (error) { void error; await this.close(); this.scopeBlocked = true; throw new Error('native scope save refused or outcome unknown; saved records retained') }
  }
  /** Native comparison additionally approves the exact public host; actual API is read locally, then the shared core performs initial confirmation, exact saved resume or explicit signed expiry continuation. No socket opens here. */
  async pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void> {
    if (this.selectedScope !== '' && (JSON.parse(this.core().scopeInput(raw)) as SavedScope).key !== this.selectedScope) throw new Error('native selected scope mismatch')
    this.core().preview(raw); if (!compared || !networkApproved || deviceInfo.sdkApiVersion < 20 || this.filesDir === '') throw new Error('native connection configuration denied'); const record = JSON.parse(this.core().trustInput(raw)) as PublicRecord, previous = this.config, settings = JSON.parse(previous.corePolicyJson) as CommandIdentity; settings.enabled = true
    this.config = { enabled: true, approvedHost: record.paired.audience, identityAlias: record.identityAlias, deviceApiVerified: deviceInfo.sdkApiVersion, maxCryptoBytes: previous.maxCryptoBytes, maxTotalSendBytes: previous.maxTotalSendBytes, publicTrustMaxBytes: previous.publicTrustMaxBytes, corePolicyJson: JSON.stringify(settings), relay: previous.relay }
    try { await this.verify(raw) } catch (error) { this.config = previous; throw new Error('native connection selection denied') }
    await this.close(); await this.foreground(); await this.core().pairOrResume(this.authority, raw, compared)
  }
  /** @param alias - identity name entered in the native UI. @param confirmed - explicit native UI decision for this alias, never a guest request. @returns public identity JSON after one absent-alias creation; unknown outcomes retain the key for local review. */
  async initializeIdentity(alias: string, confirmed: boolean): Promise<string> {
    this.core()
    if (!confirmed || deviceInfo.sdkApiVersion < 20 || this.identityCreating) throw new Error('native identity initialization denied')
    const generation = this.generation, authority = new ProductAuthority(), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes))
    this.identityCreating = true
    try { await keys.create(authority); if (generation !== this.generation) throw new Error('native identity creation outcome needs local review'); return await this.publicIdentity(alias) }
    finally { this.identityCreating = false }
  }
  /** @param alias - explicitly selected identity name. @returns public SPKI and fingerprint for the selected existing alias only; does not create keys, pair or connect. */
  async publicIdentity(alias: string): Promise<string> {
    this.core()
    if (deviceInfo.sdkApiVersion < 20) throw new Error('native identity inspection denied')
    const generation = this.generation, authority = new ProductAuthority(), crypto = new NativeCryptoPrimitives(this.config.maxCryptoBytes), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, alias, huks.HuksAuthStorageLevel.HUKS_AUTH_STORAGE_LEVEL_ECE, this.config.maxCryptoBytes)), signer = new NativeExistingIdentitySigner(authority, keys, crypto), base64 = new util.Base64Helper()
    try { const spki = await signer.initializeNative(authority), digest = await crypto.hash(spki); let credentialId: string = 'p256-sha256-'; for (const byte of digest) credentialId += byte.toString(16).padStart(2, '0'); if (generation !== this.generation) throw new Error('native identity inspection retired'); return JSON.stringify({ identityAlias: alias, publicSpki: base64.encodeToStringSync(spki, util.Type.BASIC_URL_SAFE), credentialId }) }
    finally { signer.closeNative(authority) }
  }
  preview(raw: string): string { return this.core().preview(raw) }
  pair(raw: string, compared: boolean): Promise<void> { return this.core().pair(this.authority, raw, compared) }
  connect(): Promise<void> { return this.core().connect(this.authority) }
  select(session: string): Promise<void> { return this.core().select(this.authority, session) }
  submit(request: string, text: string): Promise<string> { return this.core().submit(this.authority, request, text) }
  receipt(request: string): Promise<string> { return this.core().receipt(this.authority, request) }
  cancel(): Promise<void> { return this.core().cancel(this.authority) }
  richRequest(packet: string): Promise<string> { return this.core().richRequest(packet) }
  richRefusal(packet: string): string { return this.core().richRefusal(packet) }
  revoke(): Promise<void> { return this.core().revoke(this.authority) }
  async foreground(): Promise<void> { await this.closing; if (this.product !== undefined) return; const storage = this.storage; if (this.filesDir !== '') await this.start(new NativePublicTrustFile(this.filesDir, this.config.publicTrustMaxBytes, this.selectedScope), this.publish); else if (storage !== undefined) await this.start(storage, this.publish) }
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; const generation = ++this.generation, product = this.product; this.product = undefined; this.closing = (async () => { try { await product?.close() } finally { if (generation === this.generation) activeProducts.delete(this) } })(); return this.closing }
}
const activeProducts: Set<NativeProductOwner> = new Set()
/** Ability background/destroy has no automatic task cancellation or foreground reconnection. */
export async function closeActiveProducts(): Promise<void> { const work: Promise<void>[] = []; for (const owner of activeProducts) work.push(owner.close()); const results = await Promise.allSettled(work); if (results.some(result => result.status === 'rejected')) throw new Error('native product lifecycle cleanup failed') }

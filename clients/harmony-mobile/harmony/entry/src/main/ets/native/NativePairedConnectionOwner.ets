/** Native product connection owner. Existing HUKS identity, fresh transient agreement, both WS roles and shared protocol stay outside rich guests. Construction is inert. */
import { util } from '@kit.ArkTS'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { huks } from '@kit.UniversalKeystoreKit'
import { NativePairedCore, NativePort, NativePorts, NativeLease, NativeAgreement, NativePrimitives, NativeSchedule, NativeRelayBudgets } from '../paired/PairedCore'
import { NativeDeviceKeys, NativeDeviceKeyPolicy } from './NativeDeviceKeys'
import { NativeExistingIdentitySigner } from './NativeExistingIdentitySigner'
import { NativeCryptoPrimitives } from './NativeCryptoPrimitives'
import { NativeTransientAgreement } from './NativeTransientAgreement'
import { NativeRelaySocket, NativeRelayPolicy } from './NativeRelaySocket'
class Codec implements NativePrimitives {
  private base64: util.Base64Helper = new util.Base64Helper()
  private crypto: NativeCryptoPrimitives
  constructor(crypto: NativeCryptoPrimitives) { this.crypto = crypto }
  encode(bytes: Uint8Array): string { return this.base64.encodeToStringSync(bytes, util.Type.BASIC_URL_SAFE).replace(/=+$/, '') }
  decode(text: string): Uint8Array { return this.base64.decodeSync(text, util.Type.BASIC_URL_SAFE) }
  publicKey(key: string): Promise<void> { return this.crypto.validatePublicSpki(this.decode(key)) }
  async credentialId(key: string): Promise<string> { const hash = await this.hash(this.decode(key)); let hex: string = ''; for (const byte of hash) hex += byte.toString(16).padStart(2, '0'); return 'p256-sha256-' + hex }
  hash(bytes: Uint8Array): Promise<Uint8Array> { return this.crypto.hash(bytes) }
  hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> { return this.crypto.hkdf(secret, salt, info, length) }
  verify(key: string, bytes: Uint8Array, signature: Uint8Array): Promise<boolean> { return this.crypto.verifyP256(this.decode(key), bytes, signature) }
  encrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> { return this.crypto.encrypt(key, nonce, aad, bytes) }
  decrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> { return this.crypto.decrypt(key, nonce, aad, bytes) }
}
class Schedule implements NativeSchedule { after(ms: number, callback: () => void): () => void { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
class Agreement implements NativeAgreement {
  readonly publicSpki: string
  private authority: object
  private key: NativeTransientAgreement
  private codec: Codec
  constructor(authority: object, key: NativeTransientAgreement, codec: Codec) { this.authority = authority; this.key = key; this.codec = codec; this.publicSpki = codec.encode(key.publicSpki(authority)) }
  derive(spki: string): Promise<Uint8Array> { return this.key.derive(this.authority, this.codec.decode(spki)) }
  close(): void { this.key.close() }
}
/** Bounded native IO port buffers only pre-listener frames and queued sends; failures close instead of escaping callbacks. */
interface IncomingFrame { bytes: Uint8Array; binary: boolean }
class Port implements NativePort {
  private socket: NativeRelaySocket
  private frame: ((bytes: Uint8Array, binary: boolean) => void) | undefined = undefined
  private ends: Set<() => void> = new Set()
  private incoming: IncomingFrame[] = []
  private incomingBytes: number = 0
  private draining: boolean = false
  private queued: number = 0
  private tail: Promise<void> = Promise.resolve()
  private closed: boolean = false
  private failed: boolean = false
  private authority: object
  private maxQueued: number
  private control: boolean
  constructor(authority: object, policy: NativeRelayPolicy, maxQueued: number, control: boolean) { this.authority = authority; this.maxQueued = maxQueued; this.control = control; this.socket = new NativeRelaySocket(policy) }
  get bufferedAmount(): number { return this.queued }
  private received(data: string | ArrayBuffer): void { const binary = typeof data !== 'string', bytes = typeof data === 'string' ? new util.TextEncoder().encodeInto(data) : new Uint8Array(data); if (this.closed || bytes.length === 0 || this.incomingBytes + bytes.length > this.maxQueued) { this.terminate(); return }; this.incoming.push({ bytes, binary }); this.incomingBytes += bytes.length; this.drain() }
  private drain(): void { if (this.draining) return; this.draining = true; try { while (!this.closed && this.frame !== undefined && this.incoming.length > 0) { const next = this.incoming.shift(); if (next === undefined) break; this.incomingBytes -= next.bytes.length; this.deliver(next.bytes, next.binary) } } finally { this.draining = false } }
  private deliver(bytes: Uint8Array, binary: boolean): void { try { this.frame?.(bytes, binary) } catch (error) { void error; this.failed = true; this.terminate() } }
  async openPair(pair: string): Promise<void> { await this.socket.connectControlNative(this.authority, pair, 'phone', data => this.received(data), failed => this.end(failed)) }
  async openRoom(lease: NativeLease): Promise<void> { await this.socket.connectNative(this.authority, lease.receipt.room, 'phone', lease.receipt.token, data => this.received(data), failed => this.end(failed)) }
  authenticated(): void { this.socket.authenticatedNative(this.authority) }
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void { if (this.frame !== undefined) throw new Error('native port listener already owned'); this.frame = callback; this.drain(); return () => { this.frame = undefined } }
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  ready(): void { throw new Error('native client cannot issue readiness') }
  send(bytes: Uint8Array): void { if (this.closed || this.queued + bytes.length > this.maxQueued) { this.terminate(); throw new Error('native send queue denied') }; const copy = bytes.slice(); this.queued += copy.length; this.tail = this.tail.then(async () => { if (this.closed) return; if (this.control) await this.socket.sendControlNative(this.authority, util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(copy)); else await this.socket.sendNative(this.authority, copy.buffer as ArrayBuffer) }).catch((error: Error) => { void error; this.failed = true; this.terminate() }).finally(() => { this.queued -= copy.length; copy.fill(0) }) }
  private end(failed: boolean): void { this.failed = this.failed || failed; if (this.closed) return; this.closed = true; for (const callback of this.ends) { try { callback() } catch (error) { void error; this.failed = true } }; this.incoming = []; this.incomingBytes = 0 }
  terminate(): void { this.end(false); void this.socket.closeNative(this.authority).catch((error: Error) => { void error; this.failed = true }) }
  async close(): Promise<void> { this.terminate(); const results = await Promise.allSettled([this.tail, this.socket.closeNative(this.authority)]); if (this.failed || results.some(value => value.status === 'rejected')) throw new Error('native port cleanup failed') }
}
/** Approval/config is supplied only by native UI. Existing identity aliases are never auto-created, imported or deleted. */
export class NativePairedPolicy {
  readonly host: string
  readonly pairId: string
  readonly identityAlias: string
  readonly storage: huks.HuksAuthStorageLevel
  readonly deviceApiVerified: number
  readonly maxCryptoBytes: number
  readonly maxTotalSendBytes: number
  readonly budgets: NativeRelayBudgets
  constructor(host: string, pairId: string, identityAlias: string, storage: huks.HuksAuthStorageLevel, deviceApiVerified: number, maxCryptoBytes: number, maxTotalSendBytes: number, budgets: NativeRelayBudgets) { this.host = host; this.pairId = pairId; this.identityAlias = identityAlias; this.storage = storage; this.deviceApiVerified = deviceApiVerified; this.maxCryptoBytes = maxCryptoBytes; this.maxTotalSendBytes = maxTotalSendBytes; this.budgets = budgets }
}
/** Connect and close are native lifecycle calls; no default app entry or Web bridge activates them. */
export class NativePairedConnectionOwner {
  private core: NativePairedCore | undefined = undefined
  private signer: NativeExistingIdentitySigner | undefined = undefined
  private ports: Port[] = []
  private agreements: NativeTransientAgreement[] = []
  private closed: boolean = false
  private opening: boolean = false
  private closing: Promise<void> | undefined = undefined
  private currentData: Port | undefined = undefined
  private acquisition: Promise<void> | undefined = undefined
  private authority: object
  private policy: NativePairedPolicy
  constructor(authority: object, policy: NativePairedPolicy) { this.authority = authority; this.policy = policy }
  connectNative(authority: object, record: string, remoteDesktopSpki: string, status: (state: string) => void, received: (packet: string) => void): Promise<void> {
    if (authority !== this.authority || this.closed || this.opening || this.policy.deviceApiVerified < 20) throw new Error('native paired activation denied'); this.opening = true
    activeOwners.set(this, authority)
    this.acquisition = this.connectOwned(authority, record, remoteDesktopSpki, status, received)
    return this.acquisition.catch(async (error: Error) => { void error; await this.closeNative(authority); throw new Error('native paired connect failed') })
  }
  private async connectOwned(authority: object, record: string, remoteDesktopSpki: string, status: (state: string) => void, received: (packet: string) => void): Promise<void> {
    const crypto = new NativeCryptoPrimitives(this.policy.maxCryptoBytes), codec = new Codec(crypto), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, this.policy.identityAlias, this.policy.storage, this.policy.maxCryptoBytes)), signer = new NativeExistingIdentitySigner(authority, keys, crypto); this.signer = signer
    try {
      const publicSpki = codec.encode(await signer.initializeNative(authority)); if (this.closed) throw new Error('native paired closed'); const socketPolicy = new NativeRelayPolicy(authority, this.policy.host, this.policy.deviceApiVerified, this.policy.budgets.handshakeMs, this.policy.budgets.e2e.maxFrameBytes, this.policy.maxTotalSendBytes), control = new Port(authority, socketPolicy, this.policy.budgets.maxQueuedBytes, true); this.ports.push(control)
      const ports: NativePorts = { control, signer: { publicSpki, sign: bytes => signer.signNative(authority, bytes) }, primitives: codec, remotePublicSpki: remoteDesktopSpki, scheduler: new Schedule(), clock: () => Date.now(), agreement: async () => { const key = new NativeTransientAgreement(authority); this.agreements.push(key); await key.initialize(authority); if (this.closed) { key.close(); throw new Error('native agreement closed') }; return { key: new Agreement(authority, key, codec), nonce: cryptoFramework.createRandom().generateRandomSync(32).data } }, data: async lease => { control.authenticated(); const port = new Port(authority, socketPolicy, this.policy.budgets.maxQueuedBytes, false); this.ports.push(port); this.currentData = port; await port.openRoom(lease); if (this.closed || lease.signal.aborted) { await port.close(); throw new Error('native room closed') }; return port } }
      this.core = new NativePairedCore(record, this.policy.budgets, ports, state => { if (this.closed) return; if (state === 'identity-authenticated') this.currentData?.authenticated(); status(state) }, packet => { if (!this.closed) received(packet) }, (stage: string) => { console.info("DSH_E2E_STAGE=phone-" + stage) }, (stage: string) => { console.info('DSH_CONTROL_STAGE=phone-' + stage + ' at=' + Date.now()) }); await control.openPair(this.policy.pairId); if (this.closed) throw new Error('native paired closed')
    } catch (error) { void error; throw new Error('native paired connect failed') }
  }
  requestNative(authority: object, id: string, packet: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) throw new Error('native paired request denied'); return this.core.request(id, packet) }
  followNative(authority: object, id: string, packet: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) throw new Error('native paired follow denied'); return this.core.follow(id, packet) }
  stopNative(authority: object, id: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) return Promise.resolve(); return this.core.stop(id) }
  closeNative(authority: object): Promise<void> {
    if (authority !== this.authority) throw new Error('native paired close denied'); if (this.closing !== undefined) return this.closing; this.closed = true; let failed: boolean = false
    try { this.signer?.closeNative(authority) } catch (error) { void error; failed = true }
    for (const key of this.agreements) { try { key.close() } catch (error) { void error; failed = true } }
    const core = this.core?.close(), network = Promise.allSettled(this.ports.map(port => port.close()))
    this.closing = (async () => { await Promise.allSettled([this.acquisition]); const protocols = await Promise.allSettled([core]); const early = await network, late = await Promise.allSettled(this.ports.map(port => port.close())); activeOwners.delete(this); for (const result of protocols) if (result.status === 'rejected') failed = true; for (const result of early) if (result.status === 'rejected') failed = true; for (const result of late) if (result.status === 'rejected') failed = true; if (failed) throw new Error('native paired cleanup failed') })(); return this.closing
  }
}
const activeOwners: Map<NativePairedConnectionOwner, object> = new Map()
/** Ability background/destroy retires every explicitly activated paired owner; foreground never auto-reconnects. */
export async function closeActivePairedConnections(): Promise<void> { const work: Promise<void>[] = []; for (const owner of activeOwners.keys()) { const authority = activeOwners.get(owner); if (authority !== undefined) work.push(owner.closeNative(authority)) }; const results = await Promise.allSettled(work); for (const result of results) if (result.status === 'rejected') throw new Error('native paired lifecycle cleanup failed') }

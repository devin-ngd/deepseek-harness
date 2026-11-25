/** Native product connection owner. Existing HUKS identity, fresh transient agreement, both WS roles and shared protocol stay outside rich guests. Construction is inert. */
import { util } from '@kit.ArkTS'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { huks } from '@kit.UniversalKeystoreKit'
import { NativePairedCore, NativePort, NativePorts, NativeLanPorts, NativeSignal, NativeLease, NativeAgreement, NativePrimitives, NativeSchedule, NativeRelayBudgets, NativeDeviceEndpoints, NativeReverseOffer, DEVICE_LAN_PATH, DEVICE_LAN_PROTOCOL, isIpv4InSubnet, lanDiscoveryScope, lookupNativeDeviceEndpoints, publishNativeReverse } from '../paired/PairedCore'
import { DeviceConnectionFailure } from '../product/ProductCore'
import { NativeDeviceKeys, NativeDeviceKeyPolicy } from './NativeDeviceKeys'
import { NativeExistingIdentitySigner } from './NativeExistingIdentitySigner'
import { NativeCryptoPrimitives } from './NativeCryptoPrimitives'
import { NativeTransientAgreement } from './NativeTransientAgreement'
import { NativeRelaySocket, NativeRelayPolicy } from './NativeRelaySocket'
import { discoverNativeLanAddress } from './NativeLanDiscovery'
import { readNativeDirectNetwork } from './NativeDirectNetwork'
import { NativeEndpointSelection, selectNativePublishedEndpoint } from './NativeEndpointSelection'
import { NativeReverseLan } from './NativeReverseLan'
export interface NativeEndpointTrust { epoch: number; expiresAt: number }
type NativeDirectDial = (address: string, port: number) => Promise<NativePort | undefined>
export class NativeProductCodec implements NativePrimitives {
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
  private codec: NativeProductCodec
  constructor(authority: object, key: NativeTransientAgreement, codec: NativeProductCodec) { this.authority = authority; this.key = key; this.codec = codec; this.publicSpki = codec.encode(key.publicSpki(authority)) }
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
  private deliver(bytes: Uint8Array, binary: boolean): void { try { this.frame?.(bytes, binary) } catch (error) { void error; this.terminate() } }
  async openPair(pair: string, endpointOnly: boolean = false, reverse: boolean = false): Promise<void> { await this.socket.connectControlNative(this.authority, pair, 'phone', data => this.received(data), failed => this.end(failed), endpointOnly, reverse) }
  async openRoom(lease: NativeLease): Promise<void> { await this.socket.connectNative(this.authority, lease.receipt.room, 'phone', lease.receipt.token, data => this.received(data), failed => this.end(failed)) }
  async openLan(address: string, port: number, upgradeMs?: number): Promise<void> { await this.socket.connectLanNative(this.authority, address, port, DEVICE_LAN_PATH, DEVICE_LAN_PROTOCOL, data => this.received(data), failed => this.end(failed), upgradeMs) }
  authenticated(): void { this.socket.authenticatedNative(this.authority) }
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void { if (this.frame !== undefined) throw new Error('native port listener already owned'); this.frame = callback; this.drain(); return () => { this.frame = undefined } }
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  ready(): void { throw new Error('native client cannot issue readiness') }
  send(bytes: Uint8Array): void { if (this.closed || this.queued + bytes.length > this.maxQueued) { this.terminate(); throw new Error('native send queue denied') }; const copy = bytes.slice(); this.queued += copy.length; this.tail = this.tail.then(async () => { if (this.closed) return; if (this.control) await this.socket.sendControlNative(this.authority, util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(copy)); else await this.socket.sendNative(this.authority, copy.buffer as ArrayBuffer) }).catch((error: Error) => { void error; this.terminate() }).finally(() => { this.queued -= copy.length; copy.fill(0) }) }
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
  private reverse: NativeReverseLan | undefined = undefined
  private deviceControl: Port | undefined = undefined
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
  private async acquirePorts(authority: object, remoteDesktopSpki: string, diagnostic?: (stage: string) => void): Promise<NativePorts> {
    const crypto = new NativeCryptoPrimitives(this.policy.maxCryptoBytes), codec = new NativeProductCodec(crypto), keys = new NativeDeviceKeys(new NativeDeviceKeyPolicy(authority, this.policy.identityAlias, this.policy.storage, this.policy.maxCryptoBytes)), signer = new NativeExistingIdentitySigner(authority, keys, crypto); this.signer = signer
    try {
      diagnostic?.('identity-read'); const publicSpki = codec.encode(await signer.initializeNative(authority)); diagnostic?.('native-channel'); if (this.closed) throw new Error('native paired closed'); const socketPolicy = new NativeRelayPolicy(authority, this.policy.host, this.policy.deviceApiVerified, this.policy.budgets.handshakeMs, this.policy.budgets.e2e.maxFrameBytes, this.policy.maxTotalSendBytes), control = new Port(authority, socketPolicy, this.policy.budgets.maxQueuedBytes, true); this.ports.push(control); this.deviceControl = control
      const ports: NativePorts = { control, diagnostic: (stage: string): void => { if (/^(relay-ready|peer-hello|keys-derived|finished-sent|peer-verified|frame-budget-rejected|handshake-deadline|closed|failure-(ready|hello|finished|data):(invalid|key-invalid|signature-denied|not-ready|sequence|capacity|closed|decrypt-failed|format|unexpected))$/.test(stage)) console.info('DSH_E2E_STAGE=phone-' + stage) }, controlDiagnostic: (stage: string): void => { if (/^(frame-received|frame-decoded|challenge-validated|identity-validated|sign-started|sign-completed|proof-queued|room-validated|challenge-deadline|trust-deadline|closed|failure-(wire|decode|challenge|identity|sign|send|room):(format|refused))$/.test(stage)) console.info('DSH_CONTROL_STAGE=phone-' + stage) }, signer: { publicSpki, sign: bytes => signer.signNative(authority, bytes) }, primitives: codec, remotePublicSpki: remoteDesktopSpki, scheduler: new Schedule(), clock: () => Date.now(), agreement: async () => { const key = new NativeTransientAgreement(authority); this.agreements.push(key); await key.initialize(authority); if (this.closed) { key.close(); throw new Error('native agreement closed') }; return { key: new Agreement(authority, key, codec), nonce: cryptoFramework.createRandom().generateRandomSync(32).data } }, data: async lease => { control.authenticated(); const port = new Port(authority, socketPolicy, this.policy.budgets.maxQueuedBytes, false); this.ports.push(port); this.currentData = port; await port.openRoom(lease); if (this.closed || lease.signal.aborted) { await port.close(); throw new Error('native room closed') }; return port } }
      return ports
    } catch (error) { void error; throw new Error('native paired ports unavailable') }
  }
  private async connectOwned(authority: object, record: string, remoteDesktopSpki: string, status: (state: string) => void, received: (packet: string) => void): Promise<void> {
    const ports = await this.acquirePorts(authority, remoteDesktopSpki)
    this.core = new NativePairedCore(record, this.policy.budgets, ports, state => { if (this.closed) return; if (state === 'identity-authenticated') this.currentData?.authenticated(); status(state) }, packet => { if (!this.closed) received(packet) }, (stage: string) => { console.info('DSH_E2E_STAGE=phone-' + stage) }, (stage: string) => { console.info('DSH_CONTROL_STAGE=phone-' + stage + ' at=' + Date.now()) })
    await this.openDeviceControlNative(authority)
  }
  /** Device mode reuses original-key and TLS/socket acquisition without constructing the legacy grant protocol. */
  acquireDevicePortsNative(authority: object, remoteDesktopSpki: string, diagnostic?: (stage: string) => void): Promise<NativePorts> {
    if (authority !== this.authority || this.closed || this.opening || this.policy.deviceApiVerified < 20) throw new Error('native device port activation denied')
    this.opening = true; activeOwners.set(this, authority)
    const operation = this.acquirePorts(authority, remoteDesktopSpki, diagnostic); this.acquisition = operation.then(() => {})
    return operation.catch(async (error: Error) => { try { await this.closeNative(authority) } catch (cleanup) { void cleanup; diagnostic?.('cleanup-failed') }; throw error })
  }
  /** Acquire the original HUKS signer and one direct port for the validated device configuration. */
  async acquireLanPortsNative(authority: object, remoteDesktopSpki: string, address: string | undefined, tcpPort: number, tailnetAddress: string | undefined, diagnostic?: (stage: string) => void, inspectNetwork: boolean = false, selectedAddress?: (address: string, port: number) => void, rendezvous?: NativeEndpointTrust): Promise<NativeLanPorts> {
    const ports = await this.acquireDevicePortsNative(authority, remoteDesktopSpki, diagnostic)
    if (this.closed) throw new Error('native LAN retired')
    const socketPolicy = new NativeRelayPolicy(authority, this.policy.host, this.policy.deviceApiVerified, this.policy.budgets.handshakeMs, this.policy.budgets.e2e.maxFrameBytes, this.policy.maxTotalSendBytes)
    const discoveryScope = lanDiscoveryScope(this.policy.pairId, remoteDesktopSpki)
    let dialing: Port | undefined
    const connect = async (target: string, port: number, signal: NativeSignal, upgradeMs?: number): Promise<NativePort | undefined> => {
      if (signal.aborted || this.closed) throw new Error('native LAN retired')
      const socket = new Port(authority, socketPolicy, this.policy.budgets.maxQueuedBytes, false)
      dialing = socket; this.ports.push(socket)
      try { await socket.openLan(target, port, upgradeMs) }
      catch (error) {
        await socket.close()
        if (upgradeMs === undefined || signal.aborted || this.closed) throw (error as Error)
        return undefined
      }
      if (signal.aborted || this.closed) { await socket.close(); throw new Error('native LAN retired') }
      this.currentData = socket
      selectedAddress?.(target, port)
      return socket
    }
    return {
      lan: { open: async (signal: NativeSignal): Promise<NativePort> => {
        if (signal.aborted || this.closed) throw new Error('native LAN retired')
        if (rendezvous !== undefined) {
          const budget = Math.max(1, Math.floor(this.policy.budgets.handshakeMs / 5))
          return this.openPublishedEndpoint(authority, tcpPort, discoveryScope, ports, rendezvous, signal, budget,
            (target: string, port: number): Promise<NativePort | undefined> => connect(target, port, signal, budget))
        }
        const waitMs = inspectNetwork || tailnetAddress !== undefined ? Math.max(1, Math.floor(this.policy.budgets.handshakeMs / 3)) : undefined
        let local: string | undefined
        let mesh = tailnetAddress
        if (inspectNetwork) {
          const network = await readNativeDirectNetwork(address, tailnetAddress)
          if (signal.aborted || this.closed) throw new Error('native LAN retired')
          const wifi = network.wifi
          if (wifi !== undefined) {
            const hint = address !== undefined && isIpv4InSubnet(address, wifi.address, wifi.prefixLength) ? address : undefined
            local = await discoverNativeLanAddress(tcpPort, discoveryScope, ports.primitives, signal, waitMs, wifi) ?? hint
          }
          if (!network.mesh) mesh = undefined
        } else {
          local = address ?? await discoverNativeLanAddress(tcpPort, discoveryScope, ports.primitives, signal, waitMs)
        }
        const target = local ?? mesh
        if (signal.aborted || this.closed) throw new Error('native LAN retired')
        if (target === undefined) throw new DeviceConnectionFailure('native-channel', tailnetAddress === undefined ? 'lan-unavailable' : 'mesh-required')
        const opened = await connect(target, tcpPort, signal)
        if (opened === undefined) throw new Error('native direct endpoint unavailable')
        console.info('DSH_CONNECTION_PATH=phone-' + (local === undefined ? 'tailnet' : 'lan'))
        return opened
      }, close: async (): Promise<void> => {
        const results = await Promise.allSettled([dialing?.close(), this.reverse?.close()])
        if (results.some(value => value.status === 'rejected')) throw new Error('native direct cleanup failed')
      } },
      signer: ports.signer, primitives: ports.primitives, remotePublicSpki: ports.remotePublicSpki, scheduler: ports.scheduler,
      clock: ports.clock, agreement: () => ports.agreement(), diagnostic: ports.diagnostic,
    }
  }

  private async openPublishedEndpoint(authority: object, port: number, scope: string, ports: NativePorts, trust: NativeEndpointTrust,
    signal: NativeSignal, budget: number, dial: NativeDirectDial): Promise<NativePort> {
    const network = await readNativeDirectNetwork(undefined, undefined)
    if (signal.aborted || this.closed) throw new Error('native LAN retired')
    let selected: NativePort | undefined
    const options: NativeEndpointSelection = {
      wifi: network.wifi !== undefined, mesh: network.mesh, discoveryPort: port,
      onWifiSubnet: (address: string): boolean => network.wifi !== undefined && isIpv4InSubnet(address, network.wifi.address, network.wifi.prefixLength),
      discover: (): Promise<string | undefined> => discoverNativeLanAddress(port, scope, ports.primitives, signal, budget, network.wifi),
      lookup: (): Promise<NativeDeviceEndpoints | null> => this.lookupEndpoints(authority, ports, trust, signal, budget),
      reverse: async (): Promise<boolean> => {
        const wifi = network.wifi
        if (wifi === undefined || signal.aborted || this.closed || this.policy.deviceApiVerified < 20) return false
        const nonce = ports.primitives.encode(cryptoFramework.createRandom().generateRandomSync(32).data)
        const owner = new NativeReverseLan({ address: wifi.address, port, nonce }, this.policy.budgets.e2e.maxFrameBytes,
          this.policy.budgets.maxQueuedBytes, this.policy.maxTotalSendBytes)
        this.reverse = owner
        selected = await owner.open(signal, budget * 2,
          (offer: NativeReverseOffer, local: NativeSignal): Promise<void> => this.publishReverse(authority, ports, trust, offer, local, budget * 2))
        if (selected !== undefined) this.currentData = undefined
        return selected !== undefined
      },
      meshCanReach: async (address: string): Promise<boolean> => (await readNativeDirectNetwork(undefined, address)).mesh,
      dial: async (address: string, targetPort: number): Promise<boolean> => {
        selected = await dial(address, targetPort)
        return selected !== undefined
      },
    }
    const path = await selectNativePublishedEndpoint(options)
    if (selected === undefined) throw new Error('native direct endpoint unavailable')
    console.info('DSH_CONNECTION_PATH=phone-' + path)
    return selected
  }

  private async lookupEndpoints(authority: object, ports: NativePorts, trust: NativeEndpointTrust, signal: NativeSignal, budget: number): Promise<NativeDeviceEndpoints | null> {
    if (signal.aborted || this.closed) throw new Error('native endpoint lookup retired')
    const control = new Port(authority, new NativeRelayPolicy(authority, this.policy.host, this.policy.deviceApiVerified, budget,
      this.policy.budgets.e2e.maxFrameBytes, this.policy.maxTotalSendBytes), this.policy.budgets.maxQueuedBytes, true)
    this.ports.push(control)
    const abort = (): void => control.terminate()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await control.openPair(this.policy.pairId, true)
      return await lookupNativeDeviceEndpoints(control, this.policy.pairId, trust.epoch, this.policy.host, trust.expiresAt, ports.remotePublicSpki,
        ports.signer, ports.primitives, this.policy.budgets.maxChallengeTtlMs, this.policy.budgets.e2e.maxFrameBytes, signal)
    } catch (error) {
      if (signal.aborted || this.closed) throw (error as Error)
      return null
    } finally { signal.removeEventListener('abort', abort); await control.close() }
  }
  private async publishReverse(authority: object, ports: NativePorts, trust: NativeEndpointTrust, offer: NativeReverseOffer, signal: NativeSignal, budget: number): Promise<void> {
    if (signal.aborted || this.closed) throw new Error('native reverse publication retired')
    const control = new Port(authority, new NativeRelayPolicy(authority, this.policy.host, this.policy.deviceApiVerified, budget,
      this.policy.budgets.e2e.maxFrameBytes, this.policy.maxTotalSendBytes), this.policy.budgets.maxQueuedBytes, true)
    this.ports.push(control)
    const abort = (): void => control.terminate()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await control.openPair(this.policy.pairId, false, true)
      await publishNativeReverse(control, this.policy.pairId, trust.epoch, this.policy.host, trust.expiresAt, offer, ports.signer,
        ports.primitives, this.policy.budgets.maxChallengeTtlMs, this.policy.budgets.e2e.maxFrameBytes, signal)
    } finally { signal.removeEventListener('abort', abort); await control.close() }
  }
  openDeviceControlNative(authority: object): Promise<void> { if (authority !== this.authority || this.closed || this.deviceControl === undefined) throw new Error('native device control denied'); return this.deviceControl.openPair(this.policy.pairId) }
  authenticatedDeviceDataNative(authority: object): void { if (authority !== this.authority || this.closed) throw new Error('native device data denied'); this.currentData?.authenticated() }
  requestNative(authority: object, id: string, packet: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) throw new Error('native paired request denied'); return this.core.request(id, packet) }
  followNative(authority: object, id: string, packet: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) throw new Error('native paired follow denied'); return this.core.follow(id, packet) }
  stopNative(authority: object, id: string): Promise<void> { if (authority !== this.authority || this.closed || this.core === undefined) return Promise.resolve(); return this.core.stop(id) }
  closeNative(authority: object): Promise<void> {
    if (authority !== this.authority) throw new Error('native paired close denied'); if (this.closing !== undefined) return this.closing; this.closed = true; let failed: boolean = false
    try { this.signer?.closeNative(authority) } catch (error) { void error; failed = true }
    for (const key of this.agreements) { try { key.close() } catch (error) { void error; failed = true } }
    const core = this.core?.close(), network = Promise.allSettled([...this.ports.map(port => port.close()), this.reverse?.close()])
    this.closing = (async () => { await Promise.allSettled([this.acquisition]); const protocols = await Promise.allSettled([core]); const early = await network, late = await Promise.allSettled(this.ports.map(port => port.close())); activeOwners.delete(this); for (const result of protocols) if (result.status === 'rejected') failed = true; for (const result of early) if (result.status === 'rejected') failed = true; for (const result of late) if (result.status === 'rejected') failed = true; if (failed) throw new Error('native paired cleanup failed') })(); return this.closing
  }
}
const activeOwners: Map<NativePairedConnectionOwner, object> = new Map()
/** Ability background/destroy retires every explicitly activated paired owner; foreground never auto-reconnects. */
export async function closeActivePairedConnections(): Promise<void> { const work: Promise<void>[] = []; for (const owner of activeOwners.keys()) { const authority = activeOwners.get(owner); if (authority !== undefined) work.push(owner.closeNative(authority)) }; const results = await Promise.allSettled(work); for (const result of results) if (result.status === 'rejected') throw new Error('native paired lifecycle cleanup failed') }

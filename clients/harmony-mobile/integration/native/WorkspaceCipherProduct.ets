/** Test-only fixed public identity. This application never imports a key into HUKS or reads a saved pairing. */
import { common } from '@kit.AbilityKit'
import { http } from '@kit.NetworkKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { NativeAssets } from '../../harmony/entry/src/main/ets/native/NativeAssets'
import { NativeCryptoPrimitives } from '../../harmony/entry/src/main/ets/native/NativeCryptoPrimitives'
import { NativeProductCodec } from '../../harmony/entry/src/main/ets/native/NativePairedConnectionOwner'
import { NativeTransientAgreement } from '../../harmony/entry/src/main/ets/native/NativeTransientAgreement'
import { NativePort, NativePorts, NativeAgreement, NativeLease, NativeRelayBudgets } from '../../harmony/entry/src/main/ets/paired/PairedCore'
import { NativeDeviceProductFacade, NativeDeviceNetwork, ProductStorage } from '../../harmony/entry/src/main/ets/product/ProductCore'
import { NativeWorkspaceProduct } from '../../harmony/entry/src/main/ets/product/NativeWorkspaceProduct'
import { productConfiguration } from '../../harmony/entry/src/main/ets/product/ProductConfiguration'

interface Configuration { schema: string; token: string }
interface Registration { identityAlias: string; audience: string; phonePublicSpki: string; desktopPublicSpki: string }
interface WorkspacePolicy { maxChunkBytes: number }
interface CorePolicy { workspace: WorkspacePolicy }
interface Bootstrap { sessionId: string; registration: string; phonePkcs8: string; expiresAt: number; relay: NativeRelayBudgets }
interface Frame { bytes: string; binary: boolean }
interface Join { room: string; token: string }
interface Exchange { channel: string; frames: Frame[]; join?: Join }
interface Reply { frames: Frame[]; closed: boolean }
class Authority {}
class MemoryStorage implements ProductStorage {
  private raw: string
  constructor(raw: string) { this.raw = raw }
  async read(maxBytes: number): Promise<string> { if (this.raw.length > maxBytes) throw new Error('cipher fixture storage capacity'); return this.raw }
  async write(raw: string): Promise<void> { this.raw = raw }
  async close(): Promise<void> { this.raw = '' }
}
class FixtureHttp {
  private token: string
  constructor(token: string) { this.token = token }
  async post(path: string, body: string): Promise<string> {
    const request = http.createHttp()
    try {
      const result = await request.request('http://127.0.0.1:18082' + path, { method: http.RequestMethod.POST,
        header: { 'content-type': 'application/json', 'x-workspace-fixture': this.token }, extraData: body,
        expectDataType: http.HttpDataType.STRING, usingCache: false, connectTimeout: 10000, readTimeout: 10000, maxLimit: 33554432 })
      if (result.responseCode !== 200 || typeof result.result !== 'string') throw new Error('cipher fixture HTTP refused')
      return result.result
    } finally { request.destroy() }
  }
}
class FixturePort implements NativePort {
  private http: FixtureHttp
  private codec: NativeProductCodec
  private channel: string
  private closed: boolean = false
  private started: boolean = false
  private outgoing: Frame[] = []
  private incoming: Frame[] = []
  private bytes: number = 0
  private frame: ((bytes: Uint8Array, binary: boolean) => void) | undefined = undefined
  private ends: Set<() => void> = new Set()
  private pending: Promise<void> | undefined = undefined
  constructor(http: FixtureHttp, codec: NativeProductCodec, channel: string) { this.http = http; this.codec = codec; this.channel = channel }
  get bufferedAmount(): number { return this.bytes }
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void { this.frame = callback; this.flush(); return () => { if (this.frame === callback) this.frame = undefined } }
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  ready(): void {}
  send(bytes: Uint8Array): void {
    if (this.closed || this.outgoing.length >= 64 || this.bytes + bytes.length > 16777216) throw new Error('cipher fixture send refused')
    this.bytes += bytes.length; this.outgoing.push({ bytes: this.codec.encode(bytes), binary: this.channel === 'data' })
  }
  private flush(): void {
    if (this.frame === undefined || this.closed) return
    const frames = this.incoming; this.incoming = []
    for (const frame of frames) this.frame(this.codec.decode(frame.bytes), frame.binary)
  }
  private async exchange(join?: Join): Promise<void> {
    const frames = this.outgoing; this.outgoing = []; this.bytes = 0
    const packet: Exchange = { channel: this.channel, frames, join }
    const reply = JSON.parse(await this.http.post('/cipher', JSON.stringify(packet))) as Reply
    if (this.closed) return
    if (reply.frames.length + this.incoming.length > 64) throw new Error('cipher fixture receive capacity')
    this.incoming = this.incoming.concat(reply.frames); this.flush()
    if (reply.closed) this.terminate()
  }
  async start(join?: Join): Promise<void> {
    if (this.started || this.closed) throw new Error('cipher fixture port start refused')
    this.started = true; await this.exchange(join)
    this.pending = this.loop().catch((error: Error) => { if (!this.closed) { console.error('WORKSPACE_CIPHER_PORT ' + this.channel + ' ' + error.message); this.terminate() } })
  }
  private async loop(): Promise<void> { while (!this.closed) { await new Promise<void>(resolve => { setTimeout(resolve, 20) }); if (!this.closed) await this.exchange() } }
  terminate(): void { if (this.closed) return; this.closed = true; this.outgoing = []; this.incoming = []; for (const end of this.ends) end() }
  async close(): Promise<void> { this.terminate(); await this.pending }
}
class FixtureAgreement implements NativeAgreement {
  readonly publicSpki: string
  private authority: object
  private key: NativeTransientAgreement
  private codec: NativeProductCodec
  constructor(authority: object, key: NativeTransientAgreement, codec: NativeProductCodec) { this.authority = authority; this.key = key; this.codec = codec; this.publicSpki = codec.encode(key.publicSpki(authority)) }
  derive(publicSpki: string): Promise<Uint8Array> { return this.key.derive(this.authority, this.codec.decode(publicSpki)) }
  close(): void { this.key.close() }
}
class FixtureSigner {
  readonly publicSpki: string
  private key: cryptoFramework.PriKey
  constructor(publicSpki: string, key: cryptoFramework.PriKey) { this.publicSpki = publicSpki; this.key = key }
  async sign(bytes: Uint8Array): Promise<Uint8Array> {
    const signer = cryptoFramework.createSign('ECC256|SHA256'); await signer.init(this.key)
    return (await signer.sign({ data: bytes })).data
  }
  close(): void { this.key.clearMem() }
}
class FixtureNetwork implements NativeDeviceNetwork {
  readonly ports: NativePorts
  private control: FixturePort
  private data: FixturePort | undefined = undefined
  constructor(http: FixtureHttp, codec: NativeProductCodec, signer: FixtureSigner, remotePublicSpki: string) {
    this.control = new FixturePort(http, codec, 'control')
    this.ports = { control: this.control, signer, primitives: codec, remotePublicSpki,
      clock: () => Date.now(), scheduler: { after: (ms: number, run: () => void): (() => void) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer) } },
      agreement: async () => {
        const authority = new Authority(), key = new NativeTransientAgreement(authority)
        await key.initialize(authority)
        return { key: new FixtureAgreement(authority, key, codec), nonce: cryptoFramework.createRandom().generateRandomSync(32).data }
      },
      data: async (lease: NativeLease): Promise<NativePort> => {
        if (this.data !== undefined) throw new Error('cipher fixture duplicate data port')
        const data = new FixturePort(http, codec, 'data'); this.data = data
        await data.start({ room: lease.receipt.room, token: lease.receipt.token }); return data
      },
      diagnostic: (stage: string) => { console.info('WORKSPACE_CIPHER_E2E ' + stage) },
      controlDiagnostic: (stage: string) => { console.info('WORKSPACE_CIPHER_CONTROL ' + stage) },
    }
  }
  open(): Promise<void> { return this.control.start() }
  authenticated(): void { console.info('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED') }
  async close(): Promise<void> { await this.control.close(); await this.data?.close() }
}
/** Actual shared device facade with real native ECDSA/ECDH/HKDF/AES-GCM and a synthetic in-memory registration. */
export class WorkspaceCipherProduct implements NativeWorkspaceProduct {
  private http: FixtureHttp
  private core: NativeDeviceProductFacade | undefined = undefined
  private signer: FixtureSigner | undefined = undefined
  private publish: (view: string) => void
  constructor(context: common.UIAbilityContext, publish: (view: string) => void = () => {}) {
    this.publish = publish
    const config = JSON.parse(new NativeAssets(context).read('workspace-fixture.json')) as Configuration
    if (config.schema !== 'harmony-workspace-native-fixture/1' || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('cipher fixture configuration refused')
    this.http = new FixtureHttp(config.token)
  }
  async initialize(): Promise<string> {
    const bootstrap = JSON.parse(await this.http.post('/cipher-bootstrap', '{}')) as Bootstrap
    const record = JSON.parse(bootstrap.registration) as Registration
    const codec = new NativeProductCodec(new NativeCryptoPrimitives(5242880))
    const keys = await cryptoFramework.createAsyKeyGenerator('ECC256').convertKey({ data: codec.decode(record.phonePublicSpki) }, { data: codec.decode(bootstrap.phonePkcs8) })
    const signer = new FixtureSigner(record.phonePublicSpki, keys.priKey); this.signer = signer
    const authority = new Authority()
    const policy = JSON.parse(productConfiguration.corePolicyJson) as CorePolicy
    console.info('WORKSPACE_CIPHER_NATIVE_MAX_CHUNK ' + policy.workspace.maxChunkBytes)
    const core = new NativeDeviceProductFacade(authority, productConfiguration.corePolicyJson.replace('"enabled":false', '"enabled":true'), record.identityAlias, record.audience,
      bootstrap.expiresAt, bootstrap.relay, new MemoryStorage(bootstrap.registration), { signer, primitives: codec },
      { after: (ms: number, run: () => void): (() => void) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer) } }, () => Date.now(),
      async () => new FixtureNetwork(this.http, codec, signer, record.desktopPublicSpki),
      (view: string) => { this.publish(view); console.info('WORKSPACE_CIPHER_VIEW ' + view) }, 60000, undefined, true)
    this.core = core
    await core.boot(); await core.connect(true)
    const options = await core.creationOptions(); if (options.length < 2) throw new Error('cipher fixture creation catalogue absent')
    console.info('WORKSPACE_CIPHER_CREATION_OPTIONS_OK')
    return bootstrap.sessionId
  }
  private ready(): NativeDeviceProductFacade { if (this.core === undefined) throw new Error('cipher fixture not initialized'); return this.core }
  connect(approved: boolean): Promise<void> { return this.ready().connect(approved) }
  stopRoute(): Promise<void> { return this.ready().stopRoute() }
  creationOptions(): Promise<string> { return this.ready().creationOptions() }
  manage(raw: string): Promise<string> { return this.ready().manage(raw) }
  select(sessionId: string): Promise<void> { return this.ready().select(sessionId) }
  refreshSessions(): Promise<void> { return this.ready().refreshSessions() }
  submit(request: string, text: string): Promise<string> { return this.ready().submit(request, text) }
  receipt(request: string): Promise<string> { return this.ready().receipt(request) }
  cancel(): Promise<void> { return this.ready().cancel() }
  workspaceGeneration(): number { return this.ready().workspaceGeneration() }
  workspaceContext(): Promise<string> { return this.ready().workspaceContext() }
  workspacePrepare(id: string, generation: number): Promise<string> {
    return this.ready().workspacePrepare(id, generation).catch((error: Error) => {
      console.info('WORKSPACE_CIPHER_PREPARE_FAILURE ' + String(error).slice(0, 320))
      throw error
    })
  }
  workspaceRequest(id: string, raw: string, generation: number): Promise<string> {
    return this.ready().workspaceRequest(id, raw, generation).catch((error: Error) => {
      console.info('WORKSPACE_CIPHER_REQUEST_FAILURE ' + String(error).slice(0, 320))
      throw error
    })
  }
  workspaceResource(id: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string> {
    return this.ready().workspaceResource(id, url, generation, maxBytes, maxChunkBytes).catch((error: Error) => {
      console.info('WORKSPACE_CIPHER_RESOURCE_FAILURE ' + String(error).slice(0, 320))
      throw error
    })
  }
  cancelWorkspaceRequest(id: string): void { this.ready().cancelWorkspaceRequest(id) }
  async close(): Promise<void> { try { await this.core?.close() } finally { this.signer?.close() } }
}

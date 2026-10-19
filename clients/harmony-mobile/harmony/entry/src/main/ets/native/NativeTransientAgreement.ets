/** Unregistered ephemeral agreement owner; no key generation occurs until an exact native-local connection capability is supplied. */
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { NativeFailure } from './NativeFailure'
import { BusinessError } from '@kit.BasicServicesKit'

/** Keeps the transient private key inside the SDK object and clears it on shutdown; no private export or persistent alias exists. */
export class NativeTransientAgreement {
  private authority: object
  private pair: cryptoFramework.KeyPair | null = null
  private initializing: boolean = false
  private closed: boolean = false
  constructor(authority: object) { this.authority = authority }
  private authorize(authority: object): void { if (authority !== this.authority || this.closed) throw new NativeFailure('agreement-unapproved') }
  /** @param authority - explicit active connection capability. @returns after creating one transient pair, never a device identity key. */
  async initialize(authority: object): Promise<void> {
    this.authorize(authority); if (this.initializing || this.pair !== null) throw new NativeFailure('agreement-already-created')
    this.initializing = true
    let pair: cryptoFramework.KeyPair
    try { pair = await cryptoFramework.createAsyKeyGenerator('ECC256').generateKeyPair() }
    catch (error) { throw new NativeFailure('agreement-create-failed') }
    if (this.closed) { pair.priKey.clearMem(); throw new NativeFailure('agreement-closed') }
    this.pair = pair
  }
  /** @param authority - trusted owner. @returns only public SPKI bytes from the SDK; the private object's encoder is never called. */
  publicSpki(authority: object): Uint8Array { this.authorize(authority); if (this.pair === null) throw new NativeFailure('agreement-not-ready'); return this.pair.pubKey.getEncoded().data }
  /** @param authority - exact native owner. @param remoteSpki - validated peer ephemeral SPKI. @returns binary agreement secret for HKDF, with no string conversion. */
  async derive(authority: object, remoteSpki: Uint8Array): Promise<Uint8Array> {
    this.authorize(authority); if (this.pair === null) throw new NativeFailure('agreement-not-ready')
    try {
      console.info('DSH_CRYPTO_STAGE=agreement-peer-import')
      const remote = await cryptoFramework.createAsyKeyGenerator('ECC256').convertKey({ data: remoteSpki }, null)
      console.info('DSH_CRYPTO_STAGE=agreement-create')
      const agreement = cryptoFramework.createKeyAgreement('ECC256')
      console.info('DSH_CRYPTO_STAGE=agreement-derive')
      const result = await agreement.generateSecret(this.pair.priKey, remote.pubKey)
      if (this.closed) { result.data.fill(0); throw new NativeFailure('agreement-closed') }
      console.info('DSH_CRYPTO_STAGE=agreement-derived')
      return result.data
    } catch (error) { const code = (error as BusinessError).code; console.info('DSH_CRYPTO_FAILURE=agreement code=' + (typeof code === 'number' && Number.isSafeInteger(code) ? code : -1)); throw new NativeFailure('agreement-derive-failed') }
  }
  /** Clear the SDK private handle; no persistent identity or authorization is changed. */
  close(): void { if (this.closed) return; this.closed = true; this.pair?.priKey.clearMem(); this.pair = null }
}

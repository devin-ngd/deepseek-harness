/** HUKS adapter: every key operation requires the exact native-local capability held by the product owner. */
import { huks } from '@kit.UniversalKeystoreKit'
import { NativeFailure } from './NativeFailure'
import type { BusinessError } from '@kit.BasicServicesKit'

type NativeSignStage = 'init' | 'update' | 'finish' | 'abort'

/** Caller policy is explicit; storage selection is not a claim of available hardware or user authentication. */
export class NativeDeviceKeyPolicy {
  readonly authority: object
  readonly alias: string
  readonly storageLevel: huks.HuksAuthStorageLevel
  readonly maxSignBytes: number
  constructor(authority: object, alias: string, storageLevel: huks.HuksAuthStorageLevel, maxSignBytes: number) {
    this.authority = authority; this.alias = alias; this.storageLevel = storageLevel; this.maxSignBytes = maxSignBytes
  }
}
/** Native-only signer owner. Export returns public bytes in the platform encoding, never a private key or generic guest bridge. */
export class NativeDeviceKeys {
  private policy: NativeDeviceKeyPolicy
  constructor(policy: NativeDeviceKeyPolicy) {
    if (!/^[a-z][a-z0-9-]{0,126}$/.test(policy.alias) || !Number.isSafeInteger(policy.maxSignBytes) || policy.maxSignBytes <= 0) throw new NativeFailure('key-policy-invalid')
    this.policy = policy
  }
  private authorize(authority: object): void { if (authority !== this.policy.authority) throw new NativeFailure('key-operation-unapproved') }
  private storage(): huks.HuksParam { return { tag: huks.HuksTag.HUKS_TAG_AUTH_STORAGE_LEVEL, value: this.policy.storageLevel } }
  private options(purpose: number): huks.HuksOptions {
    return { properties: [this.storage(), { tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_ECC },
      { tag: huks.HuksTag.HUKS_TAG_KEY_SIZE, value: huks.HuksKeySize.HUKS_ECC_KEY_SIZE_256 },
      { tag: huks.HuksTag.HUKS_TAG_PURPOSE, value: purpose },
      { tag: huks.HuksTag.HUKS_TAG_DIGEST, value: huks.HuksKeyDigest.HUKS_DIGEST_SHA256 }] }
  }
  private signOptions(): huks.HuksOptions { return this.options(huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_SIGN) }
  private reportSignFailure(stage: NativeSignStage, error: BusinessError): void {
    const allowed: number[] = [201, 401, 801, 12000001, 12000002, 12000003, 12000004, 12000005, 12000006, 12000010, 12000011, 12000012, 12000014, 12000018, 12000020, 12000021, 12000023, 12000024, 12000026]
    const code = typeof error?.code === 'number' && allowed.includes(error.code) ? String(error.code) : 'unavailable'
    console.error('DSH_HUKS_SIGN_REFUSED stage=' + stage + ' code=' + code + ' at=' + Date.now())
  }
  /** @param authority - explicit local initialization approval. @returns after hasKeyItem confirms an absent alias; query errors deny creation and never select a software/file fallback. */
  async create(authority: object): Promise<void> {
    this.authorize(authority)
    let exists: boolean
    try { exists = await huks.hasKeyItem(this.policy.alias, { properties: [this.storage()] }) }
    catch (error) { throw new NativeFailure('key-presence-unverified') }
    if (exists) throw new NativeFailure('key-already-exists')
    try { await huks.generateKeyItem(this.policy.alias, this.options(huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_SIGN | huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_VERIFY)) }
    catch (error) { throw new NativeFailure('key-create-outcome-unknown') }
  }
  /** @param authority - explicit local signer capability. @returns public bytes only; actual SPKI encoding interoperability still needs native execution evidence. */
  async publicNativeBytes(authority: object): Promise<Uint8Array> {
    this.authorize(authority)
    let result: huks.HuksReturnResult
    try { result = await huks.exportKeyItem(this.policy.alias, { properties: [this.storage()] }) }
    catch (error) { throw new NativeFailure('key-public-export-failed') }
    if (result.outData === undefined || result.outData.length === 0) throw new NativeFailure('key-public-export-invalid')
    return result.outData
  }
  /** @param authority - exact native-local capability. @param message - bounded protocol transcript, never exposed to a Web guest. @returns native ECDSA bytes; no DER/P1363 format is guessed. */
  async signNativeBytes(authority: object, message: Uint8Array): Promise<Uint8Array> {
    this.authorize(authority)
    if (message.length < 1 || message.length > this.policy.maxSignBytes) throw new NativeFailure('key-message-invalid')
    let session: huks.HuksSessionHandle
    console.info('DSH_HUKS_SIGN_STAGE=init at=' + Date.now())
    try { session = await huks.initSession(this.policy.alias, this.signOptions()) }
    catch (error) { this.reportSignFailure('init', error as BusinessError); throw new NativeFailure('key-session-init-failed') }
    let finished: boolean = false
    let stage: NativeSignStage = 'update'
    try {
      console.info('DSH_HUKS_SIGN_STAGE=update at=' + Date.now())
      const update: huks.HuksOptions = this.signOptions(); update.inData = message
      await huks.updateSession(session.handle, update)
      stage = 'finish'; console.info('DSH_HUKS_SIGN_STAGE=finish at=' + Date.now())
      const result = await huks.finishSession(session.handle, this.signOptions())
      finished = true
      if (result.outData === undefined || result.outData.length === 0) throw new NativeFailure('key-signature-invalid')
      console.info('DSH_HUKS_SIGN_RESULT bytes=' + result.outData.length + ' at=' + Date.now())
      return result.outData
    } catch (error) {
      this.reportSignFailure(stage, error as BusinessError)
      let cleanupFailed: boolean = false
      if (!finished) {
        console.info('DSH_HUKS_SIGN_STAGE=abort at=' + Date.now())
        try { await huks.abortSession(session.handle, this.signOptions()) }
        catch (cleanupError) { this.reportSignFailure('abort', cleanupError as BusinessError); cleanupFailed = true }
      }
      throw new NativeFailure('key-sign-failed', cleanupFailed)
    }
  }
  /** @param authority - explicit deletion approval. @returns after removing only this owned alias; never enumerate or remove other app keys. */
  async remove(authority: object): Promise<void> {
    this.authorize(authority)
    try { await huks.deleteKeyItem(this.policy.alias, { properties: [this.storage()] }) }
    catch (error) { throw new NativeFailure('key-delete-outcome-unknown') }
  }
}

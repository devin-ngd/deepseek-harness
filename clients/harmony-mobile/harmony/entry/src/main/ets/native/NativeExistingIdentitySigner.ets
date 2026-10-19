/** Existing-key signer for the trusted shared protocol. It never creates/imports/deletes a key and is never registered as a guest bridge. */
import { NativeDeviceKeys } from './NativeDeviceKeys'
import { NativeCryptoPrimitives } from './NativeCryptoPrimitives'
/** Real HUKS public-key/signature byte interoperability remains mandatory device evidence; unsupported encodings fail rather than guessing a conversion. */
export class NativeExistingIdentitySigner {
  private authority: object
  private keys: NativeDeviceKeys
  private crypto: NativeCryptoPrimitives
  private closed: boolean = false
  private publicValue: Uint8Array | undefined = undefined
  constructor(authority: object, keys: NativeDeviceKeys, crypto: NativeCryptoPrimitives) { this.authority = authority; this.keys = keys; this.crypto = crypto }
  async initializeNative(authority: object): Promise<Uint8Array> {
    this.check(authority); if (this.publicValue !== undefined) throw new Error('identity signer already initialized')
    const bytes = await this.keys.publicNativeBytes(authority); this.check(authority)
    await this.crypto.validatePublicSpki(bytes); this.check(authority); this.publicValue = bytes.slice(); return bytes.slice()
  }
  async signNative(authority: object, message: Uint8Array): Promise<Uint8Array> {
    this.check(authority); const publicSpki = this.publicValue; if (publicSpki === undefined) throw new Error('identity signer not initialized')
    const signature = await this.keys.signNativeBytes(authority, message)
    console.info('DSH_HUKS_SIGN_STAGE=verify-public-signature at=' + Date.now())
    try { this.check(authority); if (!await this.crypto.verifyP256(publicSpki, message, signature)) throw new Error('identity signature encoding unverified'); this.check(authority); console.info('DSH_HUKS_SIGN_STAGE=signature-verified at=' + Date.now()); return signature }
    catch (error) { void error; console.error('DSH_HUKS_SIGN_REFUSED stage=verify-public-signature code=unavailable at=' + Date.now()); signature.fill(0); throw new Error('identity signing unavailable') }
  }
  closeNative(authority: object): void { if (authority !== this.authority) throw new Error('identity signer local only'); this.closed = true; this.publicValue?.fill(0); this.publicValue = undefined }
  private check(authority: object): void { if (authority !== this.authority || this.closed) throw new Error('identity signer unavailable') }
}

/** Native crypto primitives are unregistered and called only by a future trusted native owner; no keys or network are created on import. */
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { NativeFailure } from './NativeFailure'

/** Explicit one-shot operation byte cap; actual frame/lifecycle admission remains in the shared protocol. */
export class NativeCryptoPrimitives {
  private maxBytes: number
  constructor(maxBytes: number) { if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new NativeFailure('crypto-policy-invalid'); this.maxBytes = maxBytes }
  /** @param publicSpki - canonical X.509 P256 public key. @returns after SDK import and named-curve/encoding checks, without exporting a private key. */
  async validatePublicSpki(publicSpki: Uint8Array): Promise<void> {
    if (publicSpki.length === 0 || publicSpki.length > this.maxBytes) throw new NativeFailure('crypto-input-invalid')
    try {
      const keys = await cryptoFramework.createAsyKeyGenerator('ECC256').convertKey({ data: publicSpki }, null)
      const curve = keys.pubKey.getAsyKeySpec(cryptoFramework.AsyKeySpecItem.ECC_CURVE_NAME_STR)
      if (curve !== 'NID_X9_62_prime256v1' && curve !== 'prime256v1' && curve !== 'secp256r1') throw new NativeFailure('crypto-curve-invalid')
      const encoded = keys.pubKey.getEncoded().data
      if (encoded.length !== publicSpki.length) throw new NativeFailure('crypto-key-encoding-invalid')
      for (let index: number = 0; index < encoded.length; index++) if (encoded[index] !== publicSpki[index]) throw new NativeFailure('crypto-key-encoding-invalid')
    } catch (error) { throw new NativeFailure('crypto-public-key-invalid') }
  }
  /** @param bytes - complete public protocol transcript. @returns SHA256 bytes for channel binding and public fingerprints. */
  async hash(bytes: Uint8Array): Promise<Uint8Array> {
    if (bytes.length > this.maxBytes) throw new NativeFailure('crypto-input-invalid')
    try { const md = cryptoFramework.createMd('SHA256'); await md.update({ data: bytes }); return (await md.digest()).data }
    catch (error) { throw new NativeFailure('crypto-hash-failed') }
  }
  /** @param publicSpki - X.509 SPKI DER, public only. @param message - exact SHA256/ECDSA transcript. @param signatureDer - DER signature. @returns verified validity; SDK-substitute tests do not establish native interoperability. */
  async verifyP256(publicSpki: Uint8Array, message: Uint8Array, signatureDer: Uint8Array): Promise<boolean> {
    if (message.length > this.maxBytes || publicSpki.length === 0 || signatureDer.length === 0) throw new NativeFailure('crypto-input-invalid')
    try {
      await this.validatePublicSpki(publicSpki)
      const keys = await cryptoFramework.createAsyKeyGenerator('ECC256').convertKey({ data: publicSpki }, null)
      const verifier = cryptoFramework.createVerify('ECC256|SHA256'); await verifier.init(keys.pubKey)
      return await verifier.verify({ data: message }, { data: signatureDer })
    } catch (error) { throw new NativeFailure('crypto-verify-failed') }
  }
  /** @param secret - binary ECDH output, never string-encoded before HKDF. @param salt - transcript hash. @param info - fixed directional domain. @param length - derived bytes. @returns HKDF-SHA256 bytes using the SDK binary-key overload. */
  async hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    if (secret.length === 0 || salt.length === 0 || !Number.isSafeInteger(length) || length <= 0 || length > this.maxBytes) throw new NativeFailure('crypto-input-invalid')
    const spec: cryptoFramework.HKDFSpec = { algName: 'HKDF', key: secret, salt, info, keySize: length }
    try { return (await cryptoFramework.createKdf('HKDF|SHA256').generateSecret(spec)).data }
    catch (error) { throw new NativeFailure('crypto-hkdf-failed') }
  }
  /** @param keyBytes - 32-byte transient key, never a persisted device key. @param iv - unique 12-byte counter IV. @param aad - complete protocol header. @param plaintext - bounded JSON bytes. @returns ciphertext with the SDK's 16-byte authentication tag appended. */
  async encrypt(keyBytes: Uint8Array, iv: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    if (keyBytes.length !== 32 || iv.length !== 12 || plaintext.length > this.maxBytes) throw new NativeFailure('crypto-input-invalid')
    try {
      const key = await cryptoFramework.createSymKeyGenerator('AES256').convertKey({ data: keyBytes })
      const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding')
      const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv: { data: iv }, aad: { data: aad }, authTag: { data: new Uint8Array(16) } }
      try {
        await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, key, params)
        const output = await cipher.doFinal({ data: plaintext }); if (output === null) throw new NativeFailure('crypto-output-invalid'); return output.data
      } finally { key.clearMem() }
    } catch (error) { throw new NativeFailure('crypto-encrypt-failed') }
  }
  /** @param keyBytes - directional transient key. @param iv - expected sequence IV. @param aad - exact admitted header. @param sealed - ciphertext plus 16-byte tag. @returns authenticated plaintext only; no partial output is released. */
  async decrypt(keyBytes: Uint8Array, iv: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Promise<Uint8Array> {
    if (keyBytes.length !== 32 || iv.length !== 12 || sealed.length < 16 || sealed.length > this.maxBytes + 16) throw new NativeFailure('crypto-input-invalid')
    try {
      const key = await cryptoFramework.createSymKeyGenerator('AES256').convertKey({ data: keyBytes })
      const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding')
      const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv: { data: iv }, aad: { data: aad }, authTag: { data: sealed.slice(sealed.length - 16) } }
      try {
        await cipher.init(cryptoFramework.CryptoMode.DECRYPT_MODE, key, params)
        const output = await cipher.doFinal({ data: sealed.slice(0, sealed.length - 16) }); if (output === null) throw new NativeFailure('crypto-output-invalid'); return output.data
      } finally { key.clearMem() }
    } catch (error) { throw new NativeFailure('crypto-decrypt-failed') }
  }
}

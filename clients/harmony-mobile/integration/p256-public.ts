/** Public-only P256 verification shared with existing enrollment/E2E. No private-key import, agreement, signer, entropy or DSH dependency enters this module. */
import { createPublicKey, createHash, verify, type KeyObject } from 'node:crypto'
import { id } from '../src/protocol.ts'
import type { DeviceCredentialId } from './device-auth.ts'
import { E2EError } from '../src/e2e-error.ts'
/** @param value - untrusted canonical base64url. @param limit - decoded byte cap. @returns bounded decoded bytes. */
export function cryptoBytes(value: unknown, limit: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(limit * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) throw new E2EError('invalid')
  const bytes = Buffer.from(value, 'base64url'); if (bytes.length > limit || bytes.toString('base64url') !== value) throw new E2EError('invalid'); return bytes
}
/** @param encoded - canonical public SPKI. @returns a P-256 public key only. */
export function p256Public(encoded: string): KeyObject {
  let key: KeyObject
  try { key = createPublicKey({ key: cryptoBytes(encoded, 256), format: 'der', type: 'spki' }) }
  catch (error) { void error; throw new E2EError('key-invalid') }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || key.export({ format: 'der', type: 'spki' }).toString('base64url') !== encoded) throw new E2EError('key-invalid')
  return key
}
/** @param publicSpki - canonical public key. @returns fingerprint identifier, never a desktop grant. */
export function p256CredentialId(publicSpki: string): DeviceCredentialId { p256Public(publicSpki); return id<'harmony-device-credential'>('p256-sha256-' + createHash('sha256').update(cryptoBytes(publicSpki, 256)).digest('hex')) }
/** @param publicSpki - pinned public key. @param message - domain-separated transcript. @param signature - bounded DER/base64url signature. @returns verified possession with content-free failure. */
export function verifyP256(publicSpki: string, message: Uint8Array, signature: string): boolean {
  try { return verify('sha256', message, { key: p256Public(publicSpki), dsaEncoding: 'der' }, cryptoBytes(signature, 80)) }
  catch (error) { void error; return false }
}

/** Node backend for the shared async channel; it imports explicit fixture/backend keys and never generates or persists credentials. */
import { createPublicKey, createPrivateKey, createHash, diffieHellman, hkdfSync, createCipheriv, createDecipheriv, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { E2EError, transcriptBytes, type E2EPrimitives, type P256Agreement } from '../src/e2e-channel.ts'
export { E2E_PROTOCOL, E2EError, P256SecureChannel } from '../src/e2e-channel.ts'
export type { E2ERole, RelayRoomId, E2ELimits, E2EHello, E2EFrame, P256IdentitySigner, P256Agreement } from '../src/e2e-channel.ts'
import { p256Public, p256CredentialId, verifyP256 } from './p256-public.ts'
export { cryptoBytes, p256Public, p256CredentialId, verifyP256 } from './p256-public.ts'
/** @param fields - fixed ordered fields. @returns shared signing bytes. */
export function signedTuple(fields: readonly (string | number)[]): Buffer { return Buffer.from(transcriptBytes(fields)) }
/** Imported transient handle, exercised only with known fixture keys in this phase. */
class NodeAgreement implements P256Agreement {
  readonly publicSpki: string
  private key: KeyObject | null
  constructor(key: KeyObject) { this.key = key; this.publicSpki = createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64url'); p256Public(this.publicSpki) }
  /** @param remotePublicSpki - ephemeral public key. @returns ECDH bytes for HKDF. */
  async derive(remotePublicSpki: string): Promise<Uint8Array> { if (this.key === null) throw new E2EError('closed'); return diffieHellman({ privateKey: this.key, publicKey: p256Public(remotePublicSpki) }) }
  /** Release the handle reference; managed-runtime zeroization is not claimed. */
  close(): void { this.key = null }
}
/** Imported fixture/backend key; private input is explicit and never read from an ambient credential store. */
export class ImportedP256Agreement extends NodeAgreement {
  /** @param privatePkcs8 - explicit transient test/backend key. */
  constructor(privatePkcs8: Uint8Array) { super(createPrivateKey({ key: Buffer.from(privatePkcs8), format: 'der', type: 'pkcs8' })) }
}
/** @returns fresh process-only agreement key for an already approved room; no identity key, private encoding export or file write occurs. */
export function freshNodeAgreement(): P256Agreement { return new NodeAgreement(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey) }
/** Maintained Node algorithms behind the shared portable state machine. */
export const nodeE2EPrimitives: E2EPrimitives = {
  encode: bytes => Buffer.from(bytes).toString('base64url'), decode: text => Buffer.from(text, 'base64url'),
  publicKey: async encoded => { p256Public(encoded) }, credentialId: async encoded => p256CredentialId(encoded),
  hash: async bytes => createHash('sha256').update(bytes).digest(), hkdf: async (secret, salt, info, length) => new Uint8Array(hkdfSync('sha256', secret, salt, info, length)),
  verify: async (encoded, message, signature) => verifyP256(encoded, message, Buffer.from(signature).toString('base64url')),
  encrypt: async (key, nonce, aad, plaintext) => { const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 }); cipher.setAAD(aad); return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]) },
  decrypt: async (key, nonce, aad, sealed) => { const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 }); decipher.setAAD(aad); decipher.setAuthTag(sealed.subarray(-16)); return Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]) },
}

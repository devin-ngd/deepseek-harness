/** Portable synthetic protection for known fixture keys only; never imported by a shipped profile. This is not DPAPI evidence. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { DesktopSecretProtection } from '../desktop-plugin/src/secret-protection.ts'
import { desktopIdentityBinding } from '../desktop-plugin/src/identity.ts'
/** AES-GCM substitute with a public test key; runtime code always selects the Windows provider instead. */
export class FixedIdentityProtection implements DesktopSecretProtection {
  readonly kind = 'windows-dpapi-current-user/1' as const
  /** @param plaintext - known synthetic private bytes. @param binding - exact fixture record identity. @returns synthetic ciphertext with a fresh nonce. */
  async protect(plaintext: Uint8Array, binding: Uint8Array): Promise<Uint8Array> { const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 0x51), nonce); cipher.setAAD(binding); return Buffer.concat([nonce, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]) }
  /** @param ciphertext - fixture ciphertext. @param binding - matching fixture record identity. @returns synthetic private bytes or an authentication failure. */
  async unprotect(ciphertext: Uint8Array, binding: Uint8Array): Promise<Uint8Array> { const bytes = Buffer.from(ciphertext), decipher = createDecipheriv('aes-256-gcm', Buffer.alloc(32, 0x51), bytes.subarray(0, 12)); decipher.setAAD(binding); decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]) }
}
/** @param alias - test-only record alias. @param fixture - existing public synthetic P256 fixture. @param protection - explicitly selected substitute or Windows test adapter. @returns protected owner record without generating a new identity. */
export async function fixedProtectedIdentity(alias: string, fixture: { readonly publicSpki: string; readonly pkcs8: Uint8Array }, protection: DesktopSecretProtection) {
  const bytes = await protection.protect(fixture.pkcs8, desktopIdentityBinding(alias, fixture.publicSpki))
  try { return { kind: 'grant', payload: { format: 'harmony-desktop-identity/2', protection: protection.kind, publicSpki: fixture.publicSpki, protectedPkcs8: Buffer.from(bytes).toString('base64url') } } as const } finally { bytes.fill(0) }
}

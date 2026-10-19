/** Local P256 identity with an explicitly selected protector; legacy plaintext records are preserved and refused. */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { p256CredentialId } from '../../integration/p256-public.ts'
import type { P256IdentitySigner } from '../../src/e2e-channel.ts'
import type { DesktopSecretProtection } from './secret-protection.ts'
const encoded = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/)
const recordSchema = z.object({ format: z.literal('harmony-desktop-identity/2'), protection: z.literal('windows-dpapi-current-user/1'), publicSpki: encoded.max(342), protectedPkcs8: encoded.max(21846) }).strict()
const formatSchema = z.object({ format: z.string() }).passthrough()
/** Stable local failures contain no credential contents or underlying process output. */
export class DesktopIdentityError extends Error {
  /** @param code - local authority, record, protection or persistence disposition. */
  constructor(readonly code: 'denied' | 'absent' | 'exists' | 'plaintext-refused' | 'invalid-record' | 'unavailable' | 'write-unknown') {
    super(({ denied: 'desktop identity denied', absent: 'desktop identity absent', exists: 'desktop identity already exists', 'plaintext-refused': 'desktop identity plaintext record refused; select a new protected alias', 'invalid-record': 'desktop identity record invalid', unavailable: 'desktop identity unavailable', 'write-unknown': 'desktop identity write outcome unknown; inspect selected alias before retry' })[code]); this.name = 'DesktopIdentityError'
  }
}
function keyFor(alias: string) { if (!/^[a-z][a-z0-9-]{0,126}$/.test(alias)) throw new DesktopIdentityError('denied'); return credentialKey('harmony-desktop-identity', alias) }
/** @param alias - selected owner record alias. @param publicSpki - public P256 identity. @returns public SHA256 binding used as DPAPI additional entropy. */
export function desktopIdentityBinding(alias: string, publicSpki: string): Uint8Array { keyFor(alias); return createHash('sha256').update('harmony-desktop-identity/2\0' + alias + '\0' + publicSpki).digest() }
/** Exact locally selected signer; close releases its handle without deleting or migrating persisted records. */
export class DesktopIdentitySigner implements P256IdentitySigner {
  private constructor(readonly publicSpki: string, private privateKey: KeyObject | null) {}
  /** @param ctx - selected credentials provider. @param authority - local decision capability. @param approved - identical capability. @param alias - absent selected record. @param confirmed - explicit create decision. @param protection - host-selected OS protector. @returns public identity after protected commit; unknown writes must not be retried blindly. */
  static async initialize(ctx: Context, authority: object, approved: object, alias: string, confirmed: boolean, protection: DesktopSecretProtection): Promise<{ publicSpki: string; credentialId: string }> {
    if (authority !== approved || !confirmed) throw new DesktopIdentityError('denied'); const key = keyFor(alias)
    try {
      await ctx.credentials.modifyRecord(key, async current => {
        if (current !== undefined) throw new DesktopIdentityError('exists')
        const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), publicSpki = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), bytes = pair.privateKey.export({ format: 'der', type: 'pkcs8' })
        let protectedBytes: Uint8Array | undefined
        try {
          try { protectedBytes = await protection.protect(bytes, desktopIdentityBinding(alias, publicSpki)) } catch (error) { void error; throw new DesktopIdentityError('unavailable') }
          return { kind: 'grant', payload: { format: 'harmony-desktop-identity/2', protection: protection.kind, publicSpki, protectedPkcs8: Buffer.from(protectedBytes).toString('base64url') } }
        } finally { bytes.fill(0); protectedBytes?.fill(0) }
      })
    } catch (error) { if (error instanceof DesktopIdentityError) throw error; throw new DesktopIdentityError('write-unknown') }
    const signer = await DesktopIdentitySigner.open(ctx, authority, approved, alias, protection); try { return { publicSpki: signer.publicSpki, credentialId: p256CredentialId(signer.publicSpki) } } finally { signer.close() }
  }
  /** @param ctx - selected credentials provider. @param authority - local capability. @param approved - identical capability. @param alias - existing record. @param protection - exact host-selected protector. @returns validated signer; plaintext/unknown formats and decryption errors stop without fallback. */
  static async open(ctx: Context, authority: object, approved: object, alias: string, protection: DesktopSecretProtection): Promise<DesktopIdentitySigner> {
    if (authority !== approved) throw new DesktopIdentityError('denied'); const key = keyFor(alias)
    let stored: Awaited<ReturnType<typeof ctx.credentials.readRecord>>
    try { stored = await ctx.credentials.readRecord(key) } catch (error) { void error; throw new DesktopIdentityError('unavailable') }
    if (stored?.kind !== 'grant') throw new DesktopIdentityError('absent')
    const format = formatSchema.safeParse(stored.payload); if (format.success && format.data.format === 'harmony-desktop-identity/1') throw new DesktopIdentityError('plaintext-refused')
    const checked = recordSchema.safeParse(stored.payload); if (!checked.success || checked.data.protection !== protection.kind) throw new DesktopIdentityError('invalid-record')
    const ciphertext = Buffer.from(checked.data.protectedPkcs8, 'base64url'); if (ciphertext.toString('base64url') !== checked.data.protectedPkcs8) throw new DesktopIdentityError('invalid-record')
    let bytes: Uint8Array | undefined
    try {
      bytes = await protection.unprotect(ciphertext, desktopIdentityBinding(alias, checked.data.publicSpki))
      const key = createPrivateKey({ key: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), format: 'der', type: 'pkcs8' }), publicSpki = createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64url')
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || publicSpki !== checked.data.publicSpki) throw new DesktopIdentityError('unavailable')
      p256CredentialId(publicSpki); return new DesktopIdentitySigner(publicSpki, key)
    } catch (error) { void error; throw new DesktopIdentityError('unavailable') } finally { bytes?.fill(0); ciphertext.fill(0) }
  }
  /** @param message - bounded trusted protocol bytes. @returns DER signature; no generic Remote signing method exists. */
  async sign(message: Uint8Array): Promise<Uint8Array> { if (this.privateKey === null || message.length < 1 || message.length > 16384) throw new DesktopIdentityError('denied'); return sign('sha256', message, { key: this.privateKey, dsaEncoding: 'der' }) }
  /** Release the key handle; managed runtime zeroization is not claimed. */
  close(): void { this.privateKey = null }
}

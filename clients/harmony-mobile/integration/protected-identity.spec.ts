/** Synthetic identity records only; Windows tests protect public fixture key material and never create a real access identity. */
import { it, expect } from 'vitest'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { createPublicKey, verify } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DesktopIdentitySigner, desktopIdentityBinding } from '../desktop-plugin/src/identity.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import type { DesktopSecretProtection } from '../desktop-plugin/src/secret-protection.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'

const authority = {}, protection = new FixedIdentityProtection(), recordKey = credentialKey('harmony-desktop-identity', 'fixture')

it('protected signer reopens known synthetic key bytes and rejects tamper, wrong binding, unknown fields and closed handles', async () => {
  const ctx = new Context(); await ctx.plugin(MemoryCredentials)
  try {
    const saved = await fixedProtectedIdentity('fixture', desktopKey, protection)
    await ctx.credentials.modifyRecord(recordKey, async () => saved)
    const signer = await DesktopIdentitySigner.open(ctx, authority, authority, 'fixture', protection), message = new TextEncoder().encode('synthetic protected proof')
    expect(verify('sha256', message, createPublicKey({ key: Buffer.from(desktopKey.publicSpki, 'base64url'), format: 'der', type: 'spki' }), await signer.sign(message))).toBe(true)
    signer.close(); await expect(signer.sign(message)).rejects.toMatchObject({ code: 'denied' })
    const broken = Buffer.from(saved.payload.protectedPkcs8, 'base64url'); broken[20] = broken[20]! ^ 1
    await ctx.credentials.modifyRecord(recordKey, async () => ({ ...saved, payload: { ...saved.payload, protectedPkcs8: broken.toString('base64url') } }))
    await expect(DesktopIdentitySigner.open(ctx, authority, authority, 'fixture', protection)).rejects.toMatchObject({ code: 'unavailable' })
    await ctx.credentials.modifyRecord(recordKey, async () => ({ ...saved, payload: { ...saved.payload, publicSpki: phoneKey.publicSpki } }))
    await expect(DesktopIdentitySigner.open(ctx, authority, authority, 'fixture', protection)).rejects.toMatchObject({ code: 'unavailable' })
    await ctx.credentials.modifyRecord(recordKey, async () => ({ ...saved, payload: { ...saved.payload, privatePkcs8: 'must-not-be-accepted' } }))
    await expect(DesktopIdentitySigner.open(ctx, authority, authority, 'fixture', protection)).rejects.toMatchObject({ code: 'invalid-record' })
  } finally { await ctx.fiber.dispose() }
})

it('legacy plaintext is refused without mutation or overwrite and no protected identity is generated', async () => {
  const ctx = new Context(); await ctx.plugin(MemoryCredentials)
  try {
    const legacy = { kind: 'grant', payload: { format: 'harmony-desktop-identity/1', publicSpki: desktopKey.publicSpki, privatePkcs8: desktopKey.pkcs8.toString('base64url') } } as const
    await ctx.credentials.modifyRecord(recordKey, async () => legacy)
    await expect(DesktopIdentitySigner.open(ctx, authority, authority, 'fixture', protection)).rejects.toMatchObject({ code: 'plaintext-refused' })
    await expect(DesktopIdentitySigner.initialize(ctx, authority, authority, 'fixture', true, protection)).rejects.toMatchObject({ code: 'exists' })
    expect(await ctx.credentials.readRecord(recordKey)).toEqual(legacy)
  } finally { await ctx.fiber.dispose() }
})

it('protection failure commits no record and never exposes provider diagnostic text or plaintext fallback', async () => {
  const ctx = new Context(); await ctx.plugin(MemoryCredentials)
  const failed: DesktopSecretProtection = { kind: protection.kind, protect: async () => { throw new Error('PRIVATE_KEY_DIAGNOSTIC_CANARY') }, unprotect: async () => { throw new Error('PRIVATE_KEY_DIAGNOSTIC_CANARY') } }
  try {
    let outcome: unknown
    try { await DesktopIdentitySigner.initialize(ctx, authority, authority, 'fixture-failure', true, failed) } catch (error) { outcome = error }
    expect(outcome).toMatchObject({ code: 'unavailable' }); expect(String(outcome)).not.toContain('PRIVATE_KEY_DIAGNOSTIC_CANARY')
    expect(await ctx.credentials.listRecords()).toHaveLength(0)
  } finally { await ctx.fiber.dispose() }
})

it.skipIf(process.platform !== 'win32')('actual Windows current-user DPAPI protects a fixed fixture file, reopens and authenticates ciphertext and alias', async () => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (!parent) throw new Error('isolated test world required')
  const world = join(parent, 'windows-protected-file'); await mkdir(world)
  const filename = join(world, 'synthetic-credentials.yaml'), windows = new WindowsCurrentUserProtection({ timeoutMs: 10000 }), first = new Context()
  await first.plugin(CredentialsLocal, { path: filename, watch: false })
  try { await first.credentials.modifyRecord(recordKey, async () => fixedProtectedIdentity('fixture', desktopKey, windows)) } finally { await first.fiber.dispose() }
  const persisted = await readFile(filename, 'utf8'); expect(persisted).not.toContain(desktopKey.pkcs8.toString('base64url')); expect(persisted).not.toContain('privatePkcs8:'); expect(persisted).toContain('protectedPkcs8:')
  const next = new Context(); await next.plugin(CredentialsLocal, { path: filename, watch: false })
  try {
    const signer = await DesktopIdentitySigner.open(next, authority, authority, 'fixture', windows), message = new TextEncoder().encode('actual DPAPI known fixture only')
    expect(verify('sha256', message, createPublicKey({ key: Buffer.from(desktopKey.publicSpki, 'base64url'), format: 'der', type: 'spki' }), await signer.sign(message))).toBe(true); signer.close()
    const stored = await next.credentials.readRecord(recordKey); if (stored?.kind !== 'grant') throw new Error('protected fixture record absent')
    const payload = z.object({ protectedPkcs8: z.string() }).parse(stored.payload)
    const ciphertext = Buffer.from(payload.protectedPkcs8, 'base64url'), bad = Buffer.from(ciphertext); bad[bad.length - 1] = bad[bad.length - 1]! ^ 1
    await expect(windows.unprotect(bad, desktopIdentityBinding('fixture', desktopKey.publicSpki))).rejects.toMatchObject({ code: 'protection-failed' })
    await expect(windows.unprotect(ciphertext, desktopIdentityBinding('another-fixture', desktopKey.publicSpki))).rejects.toMatchObject({ code: 'protection-failed' })
    await writeFile(join(parent, 'windows-protection-result.json'), JSON.stringify({ actualWindowsApi: true, knownFixtureOnly: true, newAccessIdentityGenerated: false, persistedPlaintextAbsent: true, signatureAfterReopen: true, tamperRefused: true, wrongAliasRefused: true, aclChanged: false, realCredentialRead: false }, null, 2) + '\n')
  } finally { await next.fiber.dispose() }
})

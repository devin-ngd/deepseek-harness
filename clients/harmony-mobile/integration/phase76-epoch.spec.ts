/** Grant9 and revoked10 use the real authorization owner, fixture signing keys and memory credentials; no device, field home or external transport. */
import { it, expect } from 'vitest'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { sourceComposition } from './source-composition.ts'
import { DesktopFirstUse } from '../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { GrantDeadline } from '../replay-profile/src/grant-deadline.ts'
import { desktopKey, phoneKey, FixtureClock } from './phase39-fixture.ts'
import { fieldSession, type FirstUseOffer } from '../src/first-use-protocol.ts'
import { enrollmentProofBytes } from '../src/pairing-protocol.ts'
import { p256CredentialId } from './p256-channel.ts'
import { verifyPublicTrustHistory } from './public-trust-verification.ts'
import type { PublicTrustDocument } from '../src/public-trust-protocol.ts'
import { id } from '../src/protocol.ts'

it.each(['success', 'phone-signature-denied', 'desktop-signature-failed', 'deadline'] as const)('original owner8→9→10 (%s) never installs a relay provider or regrants', async (mode: 'success' | 'phone-signature-denied' | 'desktop-signature-failed' | 'deadline') => {
  const world = join(process.env.DSH_HARMONY_INTEGRATION_WORLD!, 'phase76-memory-' + mode); await mkdir(world)
  const ctx = await sourceComposition(world), authority = {}, owners: DesktopFirstUse[] = [], clock = new FixtureClock(); clock.now = Date.now() - 4 * 1800001
  const config = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!config.enabled) throw new Error('synthetic enabled policy absent')
  const phone = { identityAlias: 'phase76-fixture-phone', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
  const response = async (offer: FirstUseOffer) => ({ schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } })
  let previous: PublicTrustDocument | undefined, signingFailed = false
  const signer = { publicSpki: desktopKey.publicSpki, sign: async (bytes: Uint8Array) => { if (signingFailed) throw new Error('fixture signing refused'); return desktopKey.sign(bytes) } }
  const interaction = { notify: () => {}, prompt: async () => 'allow' as const }
  try {
    await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization); await ctx.sessionController.create({ sessionId: id<'SessionId'>(fieldSession), cwd: world })
    for (const epoch of [1, 3, 5, 7, 9]) {
      const owner = new DesktopFirstUse(ctx, authority, { ...config.policy, pairId: 'phase76-fixture-' + mode + '-' + epoch, grantTtlMs: 1800000, publicTrustMaxBytes: 32768 }, signer, () => clock.now); owners.push(owner)
      if (epoch === 9) expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 8, revoked: true })
      const offer = previous === undefined ? await owner.issue(authority, phone) : await owner.issueRenewal(authority, phone, JSON.stringify(previous)), reply = await response(offer)
      if (epoch === 9 && mode === 'phone-signature-denied') {
        reply.proof.signature = 'AA'; await expect(owner.confirm(authority, reply, interaction)).rejects.toThrow(); expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 8, revoked: true }); break
      }
      if (epoch === 9 && mode === 'desktop-signature-failed') {
        signingFailed = true; await expect(owner.confirm(authority, reply, interaction)).rejects.toThrow('signing refused'); expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 10, revoked: true }); expect(owner.owner.hasLocalGrant(config.policy.deviceId)).toBe(false); break
      }
      const artifacts = await owner.confirm(authority, reply, interaction)
      expect(artifacts.phone.paired.grant.epoch).toBe(epoch)
      await expect(owner.confirm(authority, reply, interaction)).rejects.toThrow('response denied')
      if (epoch === 9) {
        if (artifacts.publicDocument.schema !== 'harmony-product-public-trust/2') throw new Error('complete final9 required')
        expect(artifacts.publicDocument.history.map(row => row.record.paired.grant.epoch)).toEqual([1, 3, 5, 7]); expect(artifacts.publicDocument.revokedEpoch).toBe(8)
        await verifyPublicTrustHistory(artifacts.publicDocument, previous)
        if (mode === 'deadline') {
          const lifetime = new GrantDeadline(artifacts.phone.paired.grant.expiresAt, new AbortController().signal, () => clock.now, clock)
          try { clock.advance(155143); expect(lifetime.signal.aborted).toBe(false); clock.advance(1800000 - 155143); expect(lifetime.signal.aborted).toBe(true) } finally { lifetime.close(); await owner.revoke(authority) }
          expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 10, revoked: true }); break
        }
      }
      await owner.revoke(authority); expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: epoch + 1, revoked: true }); expect(owner.owner.hasLocalGrant(config.policy.deviceId)).toBe(false)
      previous = artifacts.publicDocument; clock.now = artifacts.phone.paired.expiresAt + 1; await owner.close()
    }
    expect(ctx.get('harmonyRelayLifecycle')).toBeUndefined()
  } finally { await Promise.allSettled(owners.map(owner => owner.close())); await ctx.fiber.dispose() }
})

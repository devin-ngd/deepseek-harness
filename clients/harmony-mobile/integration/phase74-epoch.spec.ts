/** Actual authorization-owner generations with fixed fixture keys and isolated memory credentials; no field home or network. */
import { it, expect } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { sourceComposition } from './source-composition.ts'
import { DesktopFirstUse } from '../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'
import { fieldSession, type FirstUseOffer } from '../src/first-use-protocol.ts'
import { enrollmentProofBytes } from '../src/pairing-protocol.ts'
import { canonicalPublicTrust, publicTrustRenewalBytes, type PublicTrustDocument } from '../src/public-trust-protocol.ts'
import { p256CredentialId, nodeE2EPrimitives } from './p256-channel.ts'
import { id } from '../src/protocol.ts'

it('original owner requires fresh proof for grant5, preserves two prior generations and durably revokes to6 without reinstalling authority', async () => {
  const world = join(process.env.DSH_HARMONY_INTEGRATION_WORLD!, 'phase74-memory-owner')
  await mkdir(world)
  const ctx = await sourceComposition(world), authority = {}, owners: DesktopFirstUse[] = []
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  await ctx.sessionController.create({ sessionId: id<'SessionId'>(fieldSession), cwd: world })
  const config = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!config.enabled) throw new Error('fixture policy absent')
  const phone = { identityAlias: 'phase74-fixed-fixture-phone', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
  let now = Date.now(), confirmations = 0, previous: PublicTrustDocument | undefined, oldOffer: FirstUseOffer | undefined
  const interaction = { notify: () => {}, prompt: async () => { confirmations++; return 'allow' as const } }
  const reply = async (offer: FirstUseOffer) => ({ schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } })
  try {
    for (const [index, epoch] of [1, 3, 5].entries()) {
      const owner = new DesktopFirstUse(ctx, authority, { ...config.policy, pairId: ['phase74-fixture-first', 'phase74-fixture-second', 'harmony-phase74-successor-20261017'][index]!, publicTrustMaxBytes: 32768 }, desktopKey, () => now)
      owners.push(owner)
      if (epoch === 5) {
        expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 4, revoked: true })
        await expect(owner.issue(authority, phone)).rejects.toThrow('explicit renewal')
      }
      const offer = previous === undefined ? await owner.issue(authority, phone) : await owner.issueRenewal(authority, phone, JSON.stringify(previous))
      if (oldOffer !== undefined) await expect(owner.confirm(authority, await reply(oldOffer), interaction)).rejects.toThrow('response denied')
      const response = await reply(offer), artifacts = await owner.confirm(authority, response, interaction)
      expect(artifacts.phone.paired.grant.epoch).toBe(epoch)
      await expect(owner.confirm(authority, response, interaction)).rejects.toThrow('response denied')
      if (epoch === 5) {
        const document = artifacts.publicDocument
        if (document.schema !== 'harmony-product-public-trust/2' || previous === undefined) throw new Error('successor fixture absent')
        expect(document.revokedEpoch).toBe(4); expect(document.history).toHaveLength(2)
        expect(document.previousDigest).toBe(createHash('sha256').update(canonicalPublicTrust(previous)).digest('hex'))
        expect(await nodeE2EPrimitives.verify(desktopKey.publicSpki, publicTrustRenewalBytes(document), Buffer.from(document.signature, 'base64url'))).toBe(true)
        expect(confirmations).toBe(3)
      }
      await owner.revoke(authority)
      expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: epoch + 1, revoked: true })
      expect(owner.owner.hasLocalGrant(config.policy.deviceId)).toBe(false)
      oldOffer = offer; previous = artifacts.publicDocument; now = artifacts.phone.paired.expiresAt + 1; await owner.close()
    }
    const cold = new DesktopFirstUse(ctx, authority, { ...config.policy, pairId: 'harmony-phase74-successor-20261017', publicTrustMaxBytes: 32768 }, desktopKey, () => now)
    owners.push(cold)
    await expect(cold.issueRenewal(authority, phone, JSON.stringify(previous))).rejects.toThrow('revocation denied')
    expect(await cold.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: 6, revoked: true })
    expect(cold.owner.hasLocalGrant(config.policy.deviceId)).toBe(false); expect(ctx.get('harmonyRelayLifecycle')).toBeUndefined()
    await writeFile(join(world, 'phase74-epoch-result.json'), JSON.stringify({ epochs: [1, 2, 3, 4, 5, 6], freshProofRequired: true, duplicateProofRefused: true, pairReuseRefused: true, completeSignedHistory: 2, confirmations, providerInstalled: false, realModels: 0, sockets: 0, credentials: 'synthetic-memory-only' }) + '\n')
  } finally { await Promise.allSettled(owners.map(owner => owner.close())); await ctx.fiber.dispose() }
})

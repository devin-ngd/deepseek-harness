/** Ordinary Session enrollment through actual owners and ETS with fixed-key SDK substitutes; no live model, signer, grant store or network. */
import { it, expect, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { loadProfileServices } from './profile-services.ts'
import { DesktopFirstUse } from '../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import * as Product from '../desktop-plugin/src/product.ts'
import { invokeProfile } from '../desktop-plugin/src/transport.ts'
import { id } from '../src/protocol.ts'
import { object } from '../src/domain.ts'
import { jsonPayload } from '../src/wire.ts'
import { firstUseOfferSchema, type FirstUseOffer } from '../src/first-use-protocol.ts'
import { deviceChallengeBytes, enrollmentProofBytes } from '../src/pairing-protocol.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'
import { p256CredentialId } from './p256-public.ts'
import { NativeProductOwner, context, resetProductSdk, state, network } from '../tests/helpers/product-native-harness.mjs'

const profileId = id<'mobile-profile'>('ordinary-owner-profile'), sessionId = id<'SessionId'>('ordinary-selected-session')
const otherSession = id<'SessionId'>('ordinary-other-session')
async function fixture(label: string, reopenWorld?: string) {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('isolated normal product test required')
  const world = reopenWorld ?? join(parent, label); if (reopenWorld === undefined) await mkdir(world)
  const config = (await readFile(new URL('./cordis.yml', import.meta.url), 'utf8')).replace('provider: rich-inline-replay', 'provider: unused-test-provider').replace('model: rich-inline-fixed', 'model: unused-test-model')
  const ctx = await loadProfileServices(world, config)
  ctx.provide('profileContext', { name: profileId, dir: world, patchPath: join(world, 'patch.yml'), installAnchor: world, cwd: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Gateway); await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  if (reopenWorld === undefined) { await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionController.create({ sessionId: otherSession, cwd: world }) }
  const template = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!template.enabled) throw new Error('missing synthetic policy limits')
  const policy = { ...template.policy, desktopId: id<'mobile-desktop'>('ordinary-desktop'), deviceId: id<'mobile-device'>('ordinary-phone'), profileId, sessionId, pairId: 'ordinary-' + label, grantTtlMs: 60000 }
  const authority = {}, openPorts = vi.fn((): never => { throw new Error('NETWORK_FORBIDDEN') })
  const first = await Product.createPairing(ctx, authority, { enabled: true, desktopId: policy.desktopId, profileId, sessionId }, policy, desktopKey, Date.now, openPorts)
  return { ctx, world, policy, authority, first, openPorts }
}
const identity = { identityAlias: 'ordinary-fixture-phone', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
async function response(offer: FirstUseOffer) { return { schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } } }
const interaction = { notify: () => {}, prompt: async () => 'allow' as const }

it('ordinary selection survives signed native enrollment, public reload and product config reload without a model or network', async () => {
  const f = await fixture('normal-enrollment')
  resetProductSdk(); state.aliases.add(identity.identityAlias)
  const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
  const nativeConfig = { ...base, corePolicyJson: JSON.stringify(base.core) }
  const app = new NativeProductOwner(nativeConfig), reopened = new NativeProductOwner(nativeConfig), revokedApp = new NativeProductOwner(nativeConfig)
  try {
    await app.initialize(context(), () => {})
    expect(() => f.first.productOptions(f.authority, 'create')).toThrow('selection denied')
    const offer = await f.first.issue(f.authority, identity)
    expect(offer.ticket.profileId).toBe(profileId); expect(offer.sessions).toEqual([sessionId])
    const enrollmentPreview = JSON.parse(await app.previewEnrollment(JSON.stringify(offer)))
    expect(enrollmentPreview).toMatchObject({ profileId, sessions: [sessionId] })
    for (const changed of [{ ...offer, sessions: [otherSession] }, { ...offer, ticket: { ...offer.ticket, profileId: 'wrong-profile' } }]) {
      await expect(app.signEnrollment(JSON.stringify(changed), true)).rejects.toThrow('verify-desktop-signature')
    }
    const reply = JSON.parse(await app.signEnrollment(JSON.stringify(offer), true))
    await expect(f.first.confirm(f.authority, { ...reply, offer: { ...reply.offer, sessions: [otherSession] } }, interaction)).rejects.toThrow('response denied')
    await expect(f.first.confirm(f.authority, { ...reply, offer: { ...reply.offer, ticket: { ...reply.offer.ticket, profileId: 'wrong-profile' } } }, interaction)).rejects.toThrow('response denied')
    const prompts: string[] = []
    const result = await f.first.confirm(f.authority, reply, { notify: () => {}, prompt: async question => { prompts.push(question.message); return 'allow' } })
    expect(prompts.join()).toContain(profileId); expect(prompts.join()).toContain(sessionId)
    expect(result.phone.paired.grant).toMatchObject({ profileId, sessions: [sessionId], epoch: 1 })
    await app.pairWithConnection(JSON.stringify(result.publicDocument), true, true)
    await app.close(); await reopened.initialize(context(), () => {})
    const saved = await reopened.savedPairing(true)
    const savedPreview = JSON.parse(reopened.preview(saved))
    expect(savedPreview).toMatchObject({ profileId, sessions: [sessionId] })
    await reopened.pairWithConnection(saved, true, true)
    const path = join(f.world, 'normal-product-options.json')
    await writeFile(path, JSON.stringify(f.first.productOptions(f.authority, 'create')) + '\n')
    const options = Product.Config(JSON.parse(await readFile(path, 'utf8')))
    expect(options).toMatchObject({ profileId, sessionId, desktopId: f.policy.desktopId })
    f.first.install(f.authority)
    const plugin = f.ctx.plugin(Product, { ...options, relayEnabled: false }); await plugin
    const binding = { id: id<'harmony-device-channel'>('normal-authenticated-fixture'), remoteCredentialId: identity.credentialId, signal: new AbortController().signal }
    const challenge = await f.first.owner.challenge(f.policy.deviceId, binding)
    const lease = await f.first.owner.authenticate({ challengeId: challenge.challengeId, signature: Buffer.from(await phoneKey.sign(deviceChallengeBytes(challenge))).toString('base64url') }, binding, new AbortController().signal)
    const metadata = () => invokeProfile(f.ctx, lease.peer, { method: 'metadata', argument: null }, new AbortController().signal)
    expect(await metadata()).toMatchObject({ profileId, sessions: [sessionId], mode: 'desktop-profile' })
    await plugin.dispose()
    const reloaded = f.ctx.plugin(Product, { ...options, journalMode: 'reopen', relayEnabled: false }); await reloaded
    const reloadedMetadata = await metadata()
    expect(reloadedMetadata).toMatchObject({ profileId, sessions: [sessionId] })
    await f.first.revoke(f.authority)
    await expect(metadata()).rejects.toThrow(); expect(() => f.first.productOptions(f.authority, 'reopen')).toThrow('selection denied')
    await reopened.revoke(); await reopened.close()
    await revokedApp.initialize(context(), () => {})
    const revokedAfterReload = JSON.parse(await revokedApp.savedPairing(true)).revoked
    expect(revokedAfterReload).toBe(true)
    await expect(revokedApp.pairWithConnection(saved, true, true)).rejects.toThrow()
    expect(f.openPorts).not.toHaveBeenCalled(); expect(network.requests).toHaveLength(0)
    expect(state.calls).not.toContain('create'); expect(state.calls).not.toContain('remove')
    const scope = (preview: { desktopId: string; profileId: string; sessions: string[] }) => ({ desktopId: preview.desktopId, profileId: preview.profileId, sessions: preview.sessions })
    const metadataScope = object(jsonPayload(reloadedMetadata))
    const observed = { enrollment: scope(enrollmentPreview), saved: scope(savedPreview), metadata: { profileId: metadataScope.profileId, sessions: metadataScope.sessions }, revokedAfterReload }
    expect(observed).toEqual(JSON.parse(await readFile(new URL('../tests/fixtures/normal-product-pairing.expected.json', import.meta.url), 'utf8')))
    f.ctx.llm.assertZeroRealCalls(); await lease.close(); await reloaded.dispose()
  } finally { await app.close(); await reopened.close(); await revokedApp.close(); await f.first.close(); await f.ctx.fiber.dispose() }
})

it('launcher/config mismatch, absent Session and multi-Session offers fail before signing, grant or product activation', async () => {
  const f = await fixture('normal-selection-refusal')
  try {
    for (const changed of [{ profileId: id<'mobile-profile'>('wrong-profile') }, { sessionId: id<'SessionId'>('missing-session') }]) {
      const sign = vi.fn(desktopKey.sign.bind(desktopKey))
      await expect(Product.createPairing(f.ctx, {}, { enabled: true, desktopId: f.policy.desktopId, profileId, sessionId, ...changed }, f.policy, { publicSpki: desktopKey.publicSpki, sign })).rejects.toThrow()
      expect(sign).not.toHaveBeenCalled()
    }
    await expect(f.ctx.plugin(Product, { enabled: true, desktopId: f.policy.desktopId, profileId: 'wrong-profile', sessionId })).rejects.toThrow('launcher profile')
    const offer = await f.first.issue(f.authority, identity)
    for (const sessions of [[], [sessionId, otherSession], ['*']]) expect(() => firstUseOfferSchema.parse({ ...offer, sessions })).toThrow()
    expect(await f.ctx.credentials.listRecords()).toHaveLength(0); expect(f.ctx.get('harmonyDesktop')).toBeUndefined()
    f.ctx.llm.assertZeroRealCalls()
  } finally { await f.first.close(); await f.ctx.fiber.dispose() }
})

it('persisted normal grant stays bound on cold reload, cannot autoactivate, and renewal cannot change Session or bypass revocation/expiry', async () => {
  const f = await fixture('normal-grant-origin'); let cold = f
  const owners: DesktopFirstUse[] = []
  try {
    const original = await f.first.confirm(f.authority, await response(await f.first.issue(f.authority, identity)), interaction)
    const entries = await f.ctx.credentials.listRecords()
    const snapshots = await Promise.all(entries.map(async entry => ({ key: entry.key, record: await f.ctx.credentials.readRecord(entry.key) })))
    const path = join(f.world, 'synthetic-grant-records.json'); await writeFile(path, JSON.stringify(snapshots) + '\n')
    f.ctx.llm.assertZeroRealCalls(); await f.ctx.sessionPersistence.flush(); await f.first.close(); await f.ctx.fiber.dispose()
    cold = await fixture('normal-grant-reload', f.world)
    expect(cold.ctx.sessions.get(sessionId)).toBeUndefined()
    expect((await cold.ctx.sessionController.inspect(sessionId)).meta.cwd).toBe(f.world)
    // The real owner validates these JSON records when reading its configured credential key.
    for (const entry of JSON.parse(await readFile(path, 'utf8'))) await cold.ctx.credentials.modifyRecord(entry.key, async () => entry.record)
    expect(await cold.first.owner.storedGrant(cold.authority, cold.policy.deviceId)).toMatchObject({ profileId, sessions: [sessionId], epoch: 1, revoked: false })
    expect(() => cold.first.productOptions(cold.authority, 'reopen')).toThrow('selection denied')
    await expect(cold.first.issue(cold.authority, identity)).rejects.toThrow('explicit renewal')
    await expect(cold.first.issueRenewal(cold.authority, identity, JSON.stringify(original.publicDocument))).rejects.toThrow('revocation denied')
    await cold.first.revoke(cold.authority)
    const stored = await cold.first.owner.storedGrant(cold.authority, cold.policy.deviceId)
    expect(stored).toMatchObject({ profileId, sessions: [sessionId], epoch: 2, revoked: true })
    await cold.first.close()
    const now = original.phone.paired.expiresAt + 1
    await cold.ctx.sessionController.inspect(otherSession)
    const altered = new DesktopFirstUse(cold.ctx, cold.authority, { ...cold.policy, sessionId: otherSession, pairId: 'ordinary-other-successor' }, desktopKey, () => now, cold.openPorts); owners.push(altered)
    await expect(altered.issueRenewal(cold.authority, identity, JSON.stringify(original.publicDocument))).rejects.toThrow('fixed scope')
    await altered.close()
    const renewed = new DesktopFirstUse(cold.ctx, cold.authority, { ...cold.policy, pairId: 'ordinary-verified-successor' }, desktopKey, () => now, cold.openPorts); owners.push(renewed)
    const offer = await renewed.issueRenewal(cold.authority, identity, JSON.stringify(original.publicDocument))
    expect(offer.ticket.profileId).toBe(profileId); expect(offer.sessions).toEqual([sessionId])
    expect(() => renewed.productOptions(cold.authority, 'reopen')).toThrow('selection denied')
    expect(await renewed.owner.storedGrant(cold.authority, cold.policy.deviceId)).toEqual(stored)
    expect(cold.openPorts).not.toHaveBeenCalled(); cold.ctx.llm.assertZeroRealCalls()
  } finally { await Promise.all(owners.map(owner => owner.close())); await f.first.close(); await cold.first.close(); await f.ctx.fiber.dispose(); await cold.ctx.fiber.dispose() }
})

/** Actual authorization owner with synthetic memory credentials and fixed test keys; ETS cases substitute every platform API. No field home, device or remote transport is opened. */
import { beforeAll, it, expect } from 'vitest'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { sourceComposition } from './source-composition.ts'
import { DesktopFirstUse } from '../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { fieldSession, type FirstUseOffer } from '../src/first-use-protocol.ts'
import { enrollmentProofBytes } from '../src/pairing-protocol.ts'
import { desktopKey, phoneKey, FixtureClock } from './phase39-fixture.ts'
import { p256CredentialId } from './p256-channel.ts'
import { verifyPublicTrustHistory } from './public-trust-verification.ts'
import { MobileProduct } from '../src/mobile-product.ts'
import { ProductTrustOwner } from '../src/product-trust.ts'
import { assertPublicTrustSuccessor, canonicalPublicTrust, publicTrustRenewalBytes, publicTrustVerificationInputs, type PublicTrustDocument, type PublicTrustRenewal } from '../src/public-trust-protocol.ts'
import { NativeProductOwner, context, resetProductSdk, network, sdk, state } from '../tests/helpers/product-native-harness.mjs'
import { id } from '../src/protocol.ts'
const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
const phone = { identityAlias: 'phase75-synthetic-phone', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
let third: PublicTrustRenewal, fifth: PublicTrustRenewal, seventh: PublicTrustRenewal
async function reply(offer: FirstUseOffer) { return { schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } } }
async function sign(value: PublicTrustRenewal): Promise<PublicTrustRenewal> { value.signature = Buffer.from(await desktopKey.sign(publicTrustRenewalBytes(value))).toString('base64url'); return value }
beforeAll(async () => {
  const world = join(process.env.DSH_HARMONY_INTEGRATION_WORLD!, 'phase75-memory-owner'); await mkdir(world)
  const ctx = await sourceComposition(world), authority = {}, owners: DesktopFirstUse[] = []
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization); await ctx.sessionController.create({ sessionId: id<'SessionId'>(fieldSession), cwd: world })
  const config = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!config.enabled) throw new Error('synthetic field policy absent')
  let now = Date.now() - 420000, previous: PublicTrustDocument | undefined
  try {
    for (const epoch of [1, 3, 5, 7]) {
      const owner = new DesktopFirstUse(ctx, authority, { ...config.policy, pairId: 'phase75-synthetic-pair-' + epoch, grantTtlMs: 120000, publicTrustMaxBytes: 32768 }, desktopKey, () => now); owners.push(owner)
      const offer = previous === undefined ? await owner.issue(authority, phone) : await owner.issueRenewal(authority, phone, JSON.stringify(previous))
      const response = await reply(offer), result = await owner.confirm(authority, response, { notify: () => {}, prompt: async () => 'allow' as const })
      await expect(owner.confirm(authority, response, { notify: () => {}, prompt: async () => 'allow' as const })).rejects.toThrow('response denied')
      expect(result.phone.paired.grant.epoch).toBe(epoch)
      if (result.publicDocument.schema === 'harmony-product-public-trust/2') {
        if (epoch === 3) third = result.publicDocument
        if (epoch === 5) fifth = result.publicDocument
        if (epoch === 7) seventh = result.publicDocument
      }
      await owner.revoke(authority); expect(await owner.owner.storedGrant(authority, config.policy.deviceId)).toMatchObject({ epoch: epoch + 1, revoked: true })
      expect(owner.owner.hasLocalGrant(config.policy.deviceId)).toBe(false)
      previous = result.publicDocument; now = result.phone.paired.expiresAt + 1; await owner.close()
    }
    expect(ctx.get('harmonyRelayLifecycle')).toBeUndefined()
    const invalidMiddleValidOuter = structuredClone(fifth); invalidMiddleValidOuter.history[1]!.receipt!.signature = 'AA'; await sign(invalidMiddleValidOuter)
    await writeFile(join(process.env.DSH_HARMONY_INTEGRATION_WORLD!, 'phase75-operator-fixture.json'), JSON.stringify({ phoneIdentity: phone, phone: third, retained: fifth, next: seventh, invalidMiddleValidOuter, observedAt: Date.now() }, null, 2) + '\n', { flag: 'wx' })
  } finally { await Promise.allSettled(owners.map(owner => owner.close())); await ctx.fiber.dispose() }
})
function product(saved = canonicalPublicTrust(third)) {
  const authority = {}, clock = new FixtureClock(); clock.now = Date.now(); let raw = saved, writes = 0, sockets = 0
  const app = new MobileProduct(authority, { ...base.core, enabled: true }, { clock: () => clock.now, scheduler: clock, storage: { read: async () => raw, write: async value => { raw = value; writes++ }, close: async () => {} }, verifyTrust: async (_record, value, previous) => verifyPublicTrustHistory(value, previous), connect: async () => { sockets++; throw new Error('unexpected synthetic socket') } }, () => {})
  return { app, authority, clock, saved: () => raw, counts: () => ({ writes, sockets }) }
}
it('the actual owner signed 3→5→7; the phone verifies all receipts and stores only7 with zero connections', async () => {
  const f = product(); await f.app.boot(); expect(f.app.view.error).toBe('public-trust-expired')
  expect(publicTrustVerificationInputs(seventh, third)).toHaveLength(3)
  await f.app.pairOrResume(f.authority, JSON.stringify(seventh), true)
  expect(JSON.parse(f.saved())).toEqual(seventh); expect(f.counts()).toEqual({ writes: 1, sockets: 0 }); expect(f.app.view).toMatchObject({ pairing: 'paired', connection: 'disconnected' })
  const expected = JSON.parse(await readFile(new URL('../tests/fixtures/phase75-history.expected.json', import.meta.url), 'utf8'))
  expect({ savedBefore: third.record.paired.grant.epoch, missed: fifth.record.paired.grant.epoch, savedAfter: JSON.parse(f.saved()).record.paired.grant.epoch, retained: seventh.history.map(entry => entry.record.paired.grant.epoch), revokedFloor: seventh.revokedEpoch, pairing: f.app.view.pairing, connection: f.app.view.connection, ...f.counts() }).toEqual(expected)
  await expect(f.app.pairOrResume(f.authority, JSON.stringify(fifth), true)).rejects.toThrow()
  await f.app.pairOrResume(f.authority, JSON.stringify(seventh), true); expect(f.counts()).toEqual({ writes: 1, sockets: 0 })
  await f.app.close()
  const reopened = product(f.saved()); await reopened.app.boot(); expect(reopened.app.view.pairing).toBe('paired'); expect(reopened.counts()).toEqual({ writes: 0, sockets: 0 }); await reopened.app.close()
})
const failures = ['missing5', 'missing3', 'missing-receipt', 'middle-signature', 'middle-digest', 'wrong-identity', 'wrong-key', 'scope', 'pair-reused', 'unknown-epoch', 'history-revoked', 'final-expired', 'final-signature'] as const
async function altered(kind: typeof failures[number]): Promise<PublicTrustRenewal> {
  const next = structuredClone(seventh)
  switch (kind) {
    case 'missing5': next.history.pop(); break
    case 'missing3': next.history.splice(1, 1); break
    case 'missing-receipt': next.history[2]!.receipt = null; break
    case 'middle-signature': next.history[2]!.receipt!.signature = 'AA'; break
    case 'middle-digest': next.history[2]!.receipt!.previousDigest = '0'.repeat(64); break
    case 'wrong-identity': next.history[2]!.record.paired.grant.deviceId = id<'mobile-device'>('other-phone'); break
    case 'wrong-key': next.history[2]!.record.desktopPublicSpki = phoneKey.publicSpki; break
    case 'scope': next.history[2]!.record.paired.grant.sessions = [id<'SessionId'>('foreign-session')]; break
    case 'pair-reused': next.record.paired.pairId = fifth.record.paired.pairId; break
    case 'unknown-epoch': next.revokedEpoch = 8; next.record.paired.grant.epoch = 9; break
    case 'history-revoked': next.history[2]!.localRevoked = true; break
    case 'final-expired': next.record.paired.expiresAt = Date.now() - 1; next.record.paired.grant.expiresAt = Date.now() - 1; break
    case 'final-signature': next.signature = 'AA'; return next
  }
  return sign(next)
}
it.each(failures)('full history rejects %s despite a newly signed outer document and keeps the saved anchor', async (kind: typeof failures[number]) => {
  const f = product(), before = f.saved(); await f.app.boot(); await expect(f.app.pairOrResume(f.authority, JSON.stringify(await altered(kind)), true)).rejects.toThrow(); expect(f.saved()).toBe(before); expect(f.counts()).toEqual({ writes: 0, sockets: 0 }); await f.app.close()
})
it('an unexpired intermediate, an already expired final grant and a locally revoked anchor cannot continue', async () => {
  expect(() => assertPublicTrustSuccessor(third, seventh, fifth.record.paired.expiresAt - 1)).toThrow('expiry')
  expect(() => assertPublicTrustSuccessor(third, seventh, seventh.record.paired.expiresAt)).toThrow('expiry')
  const revoked = product(JSON.stringify({ ...third, revoked: true })); await revoked.app.boot(); await expect(revoked.app.pairOrResume(revoked.authority, JSON.stringify(seventh), true)).rejects.toThrow(); expect(revoked.counts()).toEqual({ writes: 0, sockets: 0 }); await revoked.app.close()
})
it('a valid saved7 cannot be confirmed again as a successor and no expired5 is written during catch-up', async () => {
  const authority = {}, before = JSON.stringify(seventh); let writes = 0
  const owner = new ProductTrustOwner(authority, { read: async () => before, write: async () => { writes++ }, close: async () => {} }, 32768, Date.now)
  await owner.load(); await expect(owner.confirmSuccessor(authority, JSON.stringify(seventh), true)).rejects.toThrow('anchor'); expect(writes).toBe(0); await owner.close()
  const f = product(); await f.app.boot(); await expect(f.app.pairOrResume(f.authority, JSON.stringify(fifth), true)).rejects.toThrow('expiry'); expect(f.counts()).toEqual({ writes: 0, sockets: 0 }); await f.app.close()
})
it('an oversized complete successor cannot replace a readable smaller saved anchor', async () => {
  const authority = {}, before = canonicalPublicTrust(third); let writes = 0
  const owner = new ProductTrustOwner(authority, { read: async () => before, write: async () => { writes++ }, close: async () => {} }, Buffer.byteLength(before) + 16, Date.now)
  await expect(owner.load()).rejects.toThrow('expired'); await expect(owner.confirmSuccessor(authority, JSON.stringify(seventh), true)).rejects.toThrow('capacity'); expect(writes).toBe(0); await owner.close()
})
it.each(['valid', ...failures, 'write-unknown'] as const)('actual ETS owner verifies complete signed history (%s), with synthetic SDK APIs only', async (kind: typeof failures[number] | 'valid' | 'write-unknown') => {
  resetProductSdk(); state.aliases.add(phone.identityAlias)
  const path = '/app/mobile-product-public-trust.json', before = canonicalPublicTrust(third); sdk.files.set(path, { bytes: Buffer.from(before) })
  const app = new NativeProductOwner({ ...base, corePolicyJson: JSON.stringify(base.core) }), views: string[] = []; await app.initialize(context(), raw => views.push(raw))
  if (kind === 'write-unknown') sdk.faults.set('fsync', 1)
  try {
    const next = kind === 'valid' || kind === 'write-unknown' ? seventh : await altered(kind)
    if (kind === 'valid') { await app.pairWithConnection(JSON.stringify(next), true, true); expect(JSON.parse(views.at(-1)!).pairing).toBe('paired'); expect(JSON.parse(new TextDecoder().decode(sdk.files.get(path)!.bytes))).toEqual(seventh) }
    else { await expect(app.pairWithConnection(JSON.stringify(next), true, true)).rejects.toThrow(); expect(new TextDecoder().decode(sdk.files.get(path)!.bytes)).toBe(before) }
    expect(state.calls.filter(call => call === 'create' || call === 'remove')).toHaveLength(0); expect(network.requests).toHaveLength(0)
  } finally {
    if (kind === 'write-unknown') { await expect(app.close()).rejects.toThrow('cleanup'); expect(sdk.dirs.has('/app/mobile-product-public-trust.owner-lock')).toBe(true) } else await app.close()
  }
  expect(sdk.fds.size).toBe(0)
})
it('actual ETS owner preserves a local revocation even when the new full signed history is valid', async () => {
  resetProductSdk(); state.aliases.add(phone.identityAlias)
  const path = '/app/mobile-product-public-trust.json', before = JSON.stringify({ ...third, revoked: true }); sdk.files.set(path, { bytes: Buffer.from(before) })
  const app = new NativeProductOwner({ ...base, corePolicyJson: JSON.stringify(base.core) }); await app.initialize(context(), () => {})
  try { await expect(app.pairWithConnection(JSON.stringify(seventh), true, true)).rejects.toThrow(); expect(new TextDecoder().decode(sdk.files.get(path)!.bytes)).toBe(before); expect(network.requests).toHaveLength(0) } finally { await app.close() }
  expect(sdk.fds.size).toBe(0)
})

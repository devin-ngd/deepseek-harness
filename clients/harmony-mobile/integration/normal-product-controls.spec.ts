/** Real command/UI-owner data path with fixed test identities and SDK storage; network and live model calls stay blocked. */
import { it, expect, vi } from 'vitest'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import * as Pairing from '../desktop-plugin/src/pairing.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { PairedDesktopRelay } from '../desktop-plugin/src/relay-lifecycle.ts'
import { DeviceAuthorizationOwner } from './device-auth.ts'
import { invokeProfile } from '../desktop-plugin/src/transport.ts'
import { loadProfileServices } from './profile-services.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'
import { p256CredentialId } from './p256-public.ts'
import { id } from '../src/protocol.ts'
import { deviceChallengeBytes } from '../src/pairing-protocol.ts'
import { productTrustSchema, publicTrustRenewalSchema, publicTrustRenewalBytes, canonicalPublicTrust } from '../src/public-trust-protocol.ts'
import { trustScope, addTrustScope, readTrustScopes } from '../src/trust-scopes.ts'
import { NativeProductOwner, NativePublicTrustFile, resetProductSdk, state, context, sdk, network } from '../tests/helpers/product-native-harness.mjs'

const sessionId = id<'SessionId'>('controls-normal-session'), otherId = id<'SessionId'>('controls-other-session')
async function setup(label: string) {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (parent === undefined) throw new Error('isolated controls test required')
  const world = join(parent, label); await mkdir(world)
  const ctx = await loadProfileServices(world, await readFile(new URL('./cordis.yml', import.meta.url), 'utf8'))
  ctx.provide('profileContext', { name: 'controls-profile', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, installAnchor: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Gateway); await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization); await ctx.plugin(UserQuestions)
  await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionController.create({ sessionId: otherId, cwd: world })
  const original = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!original.enabled) throw new Error('test limits absent')
  const p = original.policy, options: Pairing.PairingOptions = { enabled: true, desktopId: 'controls-desktop', deviceId: 'controls-phone', identityAlias: 'controls-identity', identityProtectionTimeoutMs: 1000, audience: p.audience, grantTtlMs: 60000, publicTrustMaxBytes: p.publicTrustMaxBytes, enrollmentTtlMs: p.enrollmentTtlMs, maxIssues: p.maxIssues, sweepIntervalMs: p.sweepIntervalMs, journalMode: 'create', auth: { ...p.auth, maxDevices: 1, maxSessions: 1 }, relay: p.relay, wss: p.wss, recovery: p.recovery }
  const protection = new FixedIdentityProtection()
  await ctx.credentials.modifyRecord(credentialKey('harmony-desktop-identity', options.identityAlias), async () => fixedProtectedIdentity(options.identityAlias, desktopKey, protection))
  const unprotect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'unprotect').mockImplementation((bytes: Uint8Array, binding: Uint8Array) => protection.unprotect(bytes, binding))
  let allow = true, hold = false, questionCancelled = false; const questions: string[] = []
  ctx.on('user-questions/request', async (request, next) => {
    if (!request.questions.every(q => q.id === 'harmony-pair')) return next()
    questions.push(...request.questions.map(q => q.question))
    if (hold) await new Promise<void>((_resolve, reject) => { const abort = () => { questionCancelled = true; reject(new Error('synthetic UI cancelled')) }; request.signal?.addEventListener('abort', abort, { once: true }); if (request.signal?.aborted) abort() })
    return { answers: request.questions.map(q => ({ id: q.id, selected: [allow ? 'Allow' : 'Deny'] })) }
  })
  const run = (line: string, target = sessionId) => ctx.commands.execute(ctx.agents.get(target)!, line, [], new AbortController().signal)
  return { ctx, world, options, run, questions, allow: (value: boolean) => { allow = value }, hold: () => { hold = true }, questionCancelled: () => questionCancelled, unprotect, close: async () => { unprotect.mockRestore(); await ctx.fiber.dispose() } }
}
function output(result: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['run']>>) { if (result?.result.kind !== 'success' || result.result.text === undefined) throw new Error('command did not succeed: ' + JSON.stringify(result)); return JSON.parse(result.result.text) }
const expected = JSON.parse(await readFile(new URL('../tests/fixtures/normal-product-controls.expected.json', import.meta.url), 'utf8'))

it('discoverable current-Host command completes native enrollment, installs the original provider and selects the same Session without a model', async () => {
  const f = await setup('controls-command')
  resetProductSdk(); state.aliases.add('controls-phone-key')
  const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
  const app = new NativeProductOwner({ ...base, corePolicyJson: JSON.stringify(base.core) })
  const mount = vi.spyOn(PairedDesktopRelay.prototype, 'mount').mockResolvedValue(async () => {})
  try {
    await f.ctx.plugin(Pairing, { enabled: false }); expect(f.ctx.commands.list(f.ctx.agents.get(sessionId)!).some(row => row.name === 'harmony-pair')).toBe(false)
    await f.ctx.plugin(Pairing, f.options); const discovered = f.ctx.commands.list(f.ctx.agents.get(sessionId)!).find(row => row.name === 'harmony-pair'); expect(discovered).toBeDefined()
    expect(output(await f.run('/harmony-pair status'))).toMatchObject({ profileId: 'controls-profile', sessionId, state: 'not-started' })
    await app.initialize(context(), () => {})
    const phone = JSON.parse(await app.publicIdentity('controls-phone-key'))
    f.allow(false); expect((await f.run('/harmony-pair start ' + JSON.stringify(phone)))?.result.kind).toBe('error'); expect(f.ctx.get('harmonyAuthenticatedDevices')).toBeUndefined()
    f.allow(true); const offer = output(await f.run('/harmony-pair start ' + JSON.stringify(phone)))
    expect(offer.sessions).toEqual([sessionId]); expect(offer.ticket.profileId).toBe('controls-profile')
    expect((await f.run('/harmony-pair confirm {}', otherId))?.result.kind).toBe('error')
    const reply = await app.signEnrollment(JSON.stringify(offer), true)
    const confirmed = output(await f.run('/harmony-pair confirm ' + reply))
    const confirmations = f.questions.length
    expect(output(await f.run('/harmony-pair confirm ' + reply))).toEqual(confirmed); expect(f.questions).toHaveLength(confirmations)
    expect((await f.run('/harmony-pair confirm {}'))?.result.kind).toBe('error')
    expect(confirmed.phone.paired.grant).toMatchObject({ profileId: 'controls-profile', sessions: [sessionId] })
    expect(mount).not.toHaveBeenCalled()
    await app.saveNewScope(JSON.stringify(confirmed.phone), true, true)
    expect((await f.run('/harmony-pair connect'))?.result.kind).toBe('success'); expect(mount).toHaveBeenCalledTimes(1)
    const owner = f.ctx.get('harmonyAuthenticatedDevices'); if (!(owner instanceof DeviceAuthorizationOwner)) throw new Error('original owner not installed')
    const binding = { id: id<'harmony-device-channel'>('controls-fixed-test-binding'), remoteCredentialId: p256CredentialId(phoneKey.publicSpki), signal: new AbortController().signal }
    const challenge = await owner.challenge(id<'mobile-device'>(f.options.deviceId), binding)
    const lease = await owner.authenticate({ challengeId: challenge.challengeId, signature: Buffer.from(await phoneKey.sign(deviceChallengeBytes(challenge))).toString('base64url') }, binding, new AbortController().signal)
    expect(await invokeProfile(f.ctx, lease.peer, { method: 'metadata', argument: null }, new AbortController().signal)).toMatchObject({ profileId: 'controls-profile', sessions: [sessionId] })
    expect((await f.run('/harmony-pair stop'))?.result.kind).toBe('success'); expect(f.ctx.get('harmonyAuthenticatedDevices')).toBeUndefined()
    expect(f.questions.length).toBeGreaterThanOrEqual(4); expect(network.requests).toHaveLength(0)
    expect(f.ctx.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(0)
    expect({ name: discovered?.name, profileId: offer.ticket.profileId, sessions: confirmed.phone.paired.grant.sessions, modelTurns: f.ctx.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'turn/start').length, providerRemovedOnStop: f.ctx.get('harmonyAuthenticatedDevices') === undefined }).toEqual(expected.command)
    f.ctx.llm.assertZeroRealCalls()
  } finally { mount.mockRestore(); await app.close(); await f.close() }
})

it('native range list preserves complete legacy history, saves normal scope separately and never activates a selected range automatically', async () => {
  resetProductSdk(); state.aliases.add('controls-phone-key')
  const base = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')), config = { ...base, corePolicyJson: JSON.stringify(base.core) }, app = new NativeProductOwner(config), cold = new NativeProductOwner(config)
  const grant = { protocol: 'dsh-mobile-device-auth/1', desktopId: 'controls-desktop', profileId: 'old-test-profile', deviceId: 'controls-phone', credentialId: p256CredentialId(phoneKey.publicSpki), epoch: 1, sessions: ['old-test-session'], operations: ['session.sync', 'task.receipt'], expiresAt: Date.now() - 120000, revoked: false }
  const old = productTrustSchema.parse({ schema: 'harmony-product-public-trust/1', revoked: false, identityAlias: 'controls-phone-key', desktopPublicSpki: desktopKey.publicSpki, paired: { pairId: 'controls-old-pair', epoch: 1, audience: 'dsh.devinho.me', credentialId: grant.credentialId, desktopCredentialId: p256CredentialId(desktopKey.publicSpki), expiresAt: grant.expiresAt, grant } })
  const record = productTrustSchema.parse({ ...old, paired: { ...old.paired, pairId: 'controls-old-successor', expiresAt: Date.now() - 60000, grant: { ...grant, epoch: 3, expiresAt: Date.now() - 60000 } } })
  const unsigned = { schema: 'harmony-product-public-trust/2' as const, revoked: false, record, history: [{ record: old, receipt: null, localRevoked: false }], previousDigest: createHash('sha256').update(canonicalPublicTrust(old)).digest('hex'), revokedEpoch: 2 }
  const legacy = JSON.stringify(publicTrustRenewalSchema.parse({ ...unsigned, signature: Buffer.from(await desktopKey.sign(publicTrustRenewalBytes(unsigned))).toString('base64url') }))
  const fresh = productTrustSchema.parse({ ...old, paired: { ...old.paired, pairId: 'controls-normal-pair', expiresAt: Date.now() + 60000, grant: { ...grant, profileId: 'controls-profile', sessions: [sessionId], expiresAt: Date.now() + 60000 } } })
  const file = new NativePublicTrustFile('/app', base.publicTrustMaxBytes)
  await file.read(base.publicTrustMaxBytes); await file.write(legacy); await file.close()
  try {
    await app.initialize(context(), () => {})
    const list = JSON.parse(await app.listSavedScopes(true)); expect(list).toMatchObject([{ key: 'legacy', profileId: 'old-test-profile', sessions: ['old-test-session'] }])
    expect(app.connectionEnabled()).toBe(false); await expect(app.connect()).rejects.toThrow()
    const sameLegacyScope = productTrustSchema.parse({ ...old, paired: { ...old.paired, expiresAt: Date.now() + 60000, grant: { ...old.paired.grant, expiresAt: Date.now() + 60000 } } })
    await expect(app.saveNewScope(JSON.stringify(sameLegacyScope), true, true)).rejects.toThrow('legacy history')
    await app.saveNewScope(JSON.stringify(fresh), true, true)
    const scope = trustScope(JSON.stringify(fresh), base.publicTrustMaxBytes)
    expect(sdk.files.has('/app/mobile-product-scope-' + scope.key + '.json')).toBe(true)
    expect(new TextDecoder().decode(sdk.files.get('/app/mobile-product-public-trust.json')!.bytes)).toBe(legacy)
    await expect(app.pairWithConnection(legacy, true, true)).rejects.toThrow('scope mismatch')
    await app.close(); await cold.initialize(context(), () => {})
    const both = JSON.parse(await cold.listSavedScopes(true)); expect(both).toHaveLength(2)
    const selected = await cold.selectSavedScope(scope.key, true), selectedSavedScopeConnects = cold.connectionEnabled()
    expect(JSON.parse(selected).paired.grant.sessions).toEqual([sessionId]); expect(selectedSavedScopeConnects).toBe(false); await expect(cold.connect()).rejects.toThrow()
    await cold.pairWithConnection(selected, true, true); await cold.revoke(); await cold.close()
    await cold.initialize(context(), () => {}); await cold.listSavedScopes(true); const revoked = await cold.selectSavedScope(scope.key, true)
    expect(JSON.parse(revoked).revoked).toBe(true); await expect(cold.pairWithConnection(selected, true, true)).rejects.toThrow()
    await expect(cold.saveNewScope(selected, true, true)).rejects.toThrow()
    expect(new TextDecoder().decode(sdk.files.get('/app/mobile-product-public-trust.json')!.bytes)).toBe(legacy); expect(network.requests).toHaveLength(0)
    const label = (row: { profileId: string; sessions: string[] }) => row.profileId + ' / ' + row.sessions.join(', ')
    expect({ before: list.map(label), after: both.map(label), selectedSavedScopeConnects, legacyHistoryBytesSame: new TextDecoder().decode(sdk.files.get('/app/mobile-product-public-trust.json')!.bytes) === legacy, revokedScopeDenied: JSON.parse(revoked).revoked }).toEqual(expected.scopes)
  } finally { await app.close(); await cold.close() }
})

it('catalogue selectors bind profile, Session, identity and operations and reject corrupt or duplicate records', () => {
  const raw = { schema: 'harmony-product-public-trust/1', revoked: false, identityAlias: 'controls-phone-key', desktopPublicSpki: desktopKey.publicSpki, paired: { pairId: 'controls-scope-pair', epoch: 1, audience: 'dsh.devinho.me', credentialId: p256CredentialId(phoneKey.publicSpki), desktopCredentialId: p256CredentialId(desktopKey.publicSpki), expiresAt: 10000, grant: { protocol: 'dsh-mobile-device-auth/1', desktopId: 'controls-desktop', profileId: 'controls-profile', deviceId: 'controls-phone', credentialId: p256CredentialId(phoneKey.publicSpki), epoch: 1, sessions: [sessionId], operations: ['session.sync'], expiresAt: 10000, revoked: false } } }
  const descriptor = trustScope(JSON.stringify(raw), 32768), catalog = addTrustScope(null, JSON.stringify(raw), 32768)
  for (const changed of [{ profileId: 'other-profile' }, { sessions: [otherId] }, { operations: ['task.submit'] }, { deviceId: 'other-device' }]) expect(trustScope(JSON.stringify({ ...raw, paired: { ...raw.paired, grant: { ...raw.paired.grant, ...changed } } }), 32768).key).not.toBe(descriptor.key)
  expect(readTrustScopes(addTrustScope(catalog, JSON.stringify(raw), 32768), 32768)).toHaveLength(1)
  expect(() => readTrustScopes('{', 32768)).toThrow(); expect(() => readTrustScopes(JSON.stringify({ schema: 'harmony-product-scopes/1', scopes: [descriptor, descriptor] }), 32768)).toThrow()
  expect(() => new NativePublicTrustFile('/app', 32768, '../legacy')).toThrow(); expect(() => addTrustScope(catalog, JSON.stringify(raw), 10)).toThrow()
})

it('unloading the command entry cancels its human question before identity access and removes discovery', async () => {
  const f = await setup('controls-cancel')
  try {
    const example = JSON.parse(await readFile(new URL('../desktop-plugin/pairing.enabled.example.json', import.meta.url), 'utf8'))
    const examplePlugin = f.ctx.plugin(Pairing, example); await examplePlugin; await examplePlugin.dispose()
    expect(f.unprotect).not.toHaveBeenCalled()
    await expect(f.ctx.plugin(Pairing, { ...f.options, wss: { ...f.options.wss, host: 'foreign.example' } })).rejects.toThrow('policy denied')
    const plugin = f.ctx.plugin(Pairing, f.options); await plugin; f.hold()
    const running = f.run('/harmony-pair start ' + JSON.stringify({ identityAlias: 'controls-phone-key', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }))
    await vi.waitFor(() => expect(f.questions).toHaveLength(1))
    await plugin.dispose(); expect((await running)?.result.kind).toBe('error'); expect(f.questionCancelled()).toBe(true)
    expect(f.unprotect).not.toHaveBeenCalled(); expect(f.ctx.get('harmonyAuthenticatedDevices')).toBeUndefined()
    expect(f.ctx.commands.list(f.ctx.agents.get(sessionId)!).some(row => row.name === 'harmony-pair')).toBe(false)
    f.ctx.llm.assertZeroRealCalls()
  } finally { await f.close() }
})

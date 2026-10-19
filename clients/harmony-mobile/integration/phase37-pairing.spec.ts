/** Fixed replay of actual native owner classes with SDK substitutes, shared crypto and existing desktop owners. No real profile, key generation, listener, model or device is used. */
import { expect, it, vi } from 'vitest'
import { createOfflineFirstPairing } from './offline-first-pairing.ts'
import { ShortPairingRooms } from './short-room.ts'
import { readOnlyGrantSchema } from '../src/pairing-protocol.ts'
import { PhonePairingOwner } from '../src/phone-pairing.ts'
import { id } from '../src/protocol.ts'
type World = NonNullable<Awaited<ReturnType<typeof createOfflineFirstPairing>>>
async function world(): Promise<World> { const value = await createOfflineFirstPairing({ enabled: true, mode: 'synthetic-memory-only' }); if (value === undefined) throw new Error('fixture absent'); return value }
async function waitForNative(w: World): Promise<void> { for (let i = 0; i < 40 && !w.native.decisions.length; i++) await Promise.resolve(); expect(w.native.decisions).toHaveLength(1) }
async function approvePhone(w: World) { const pending = w.prepare(); await waitForNative(w); w.choosePhone(true, true); return pending }
it('offline composition defaults to disabled and rejects missing replay policy before any Context/key operation', async () => {
  expect(await createOfflineFirstPairing()).toBeUndefined()
  await expect(createOfflineFirstPairing({ enabled: true })).rejects.toThrow('offline pairing guard refused')
})
it('native comparison precedes E2E signing; first pairing yields one minimal synthetic Session grant and revocation closes all capabilities', async () => {
  const w = await world()
  try {
    await expect(w.connect()).rejects.toThrow('native pairing confirmation required'); expect(w.native.signatures()).toBe(0)
    const offer = await approvePhone(w); expect(w.native.signatures()).toBe(0)
    expect(w.native.decisions[0]).toEqual({ desktopFingerprint: offer.desktopFingerprint, phoneFingerprint: offer.phoneFingerprint, desktopId: w.bootstrap.desktopId, profileId: w.bootstrap.profileId, deviceId: w.bootstrap.deviceId, sessionIds: 'phase37-synthetic-session', operations: 'session.sync, task.receipt', expiresAt: 1200, grantTtlMs: 1000 })
    await w.connect(); const result = await w.grant('allow')
    expect(result.scope).toMatchObject({ sessions: ['phase37-synthetic-session'], operations: ['session.sync', 'task.receipt'], epoch: 1 })
    expect(JSON.parse(w.prompts[0]!)).toMatchObject({ desktopCredentialId: offer.desktopFingerprint, deviceCredentialId: offer.phoneFingerprint, confirmationExpiresAt: 1200, grantTtlMs: 1000 })
    expect(w.native.generatedKeys()).toBe(0); expect(w.native.signatures()).toBe(3)
    await expect(result.channel.invoke({ method: 'approval.reply', argument: {} }, new AbortController().signal)).rejects.toMatchObject({ code: 'scope-denied' })
    await expect(w.connect()).rejects.toThrow('native pairing confirmation required')
    await w.revoke(); expect(w.currentScope()).toBeUndefined(); expect(result.channel.lifetime.aborted).toBe(true)
    expect(() => w.room.phoneToken()).toThrow('expired'); await expect(w.grant('allow')).rejects.toThrow()
  } finally { await w.close() }
})
it.each([[false, true], [true, false]] as const)('native compared=%s/allow=%s leaves no signature, grant or transport', async (compared: boolean, allow: boolean) => {
  const w = await world()
  try { const pending = w.prepare(), denied = expect(pending).rejects.toThrow('denied'); await waitForNative(w); if (!compared && allow) { expect(() => w.choosePhone(compared, allow)).toThrow(); w.choosePhone(false, false) } else w.choosePhone(compared, allow); await denied; expect(w.native.signatures()).toBe(0); expect(await w.ctx.credentials.listRecords()).toHaveLength(0); await expect(w.connect()).rejects.toThrow('native pairing confirmation required') }
  finally { await w.close() }
})
it('native expiry cancels pending confirmation and a late allow cannot create proof', async () => {
  const w = await world()
  try { const pending = w.prepare(), denied = expect(pending).rejects.toThrow('denied'); await waitForNative(w); await w.advance(200); expect(() => w.choosePhone(true, true)).toThrow('stale'); await denied; expect(w.native.signatures()).toBe(0); await expect(w.connect()).rejects.toThrow() }
  finally { await w.close() }
})
it('desktop defaults to deny after phone comparison and stores no grant', async () => {
  const w = await world()
  try { await approvePhone(w); await w.connect(); await expect(w.grant()).rejects.toThrow('desktop denied pairing'); expect(await w.ctx.credentials.listRecords()).toHaveLength(0); expect(w.currentScope()).toBeUndefined() }
  finally { await w.close() }
})
it('room expiry tears down an admitted synthetic channel and does not reconnect or re-sign', async () => {
  const w = await world()
  try { await approvePhone(w); await w.connect(); const grant = await w.grant('allow'), signatures = w.native.signatures(); await w.advance(500); expect(w.currentScope()).toBeUndefined(); expect(grant.channel.lifetime.aborted).toBe(true); expect(w.native.signatures()).toBe(signatures); await expect(w.connect()).rejects.toThrow() }
  finally { await w.close() }
})
it('grant acknowledgement refuses approval/write/foreign/oversized/unknown scopes before device signing and rejects challenge replay', async () => {
  const w = await world(), authority = {}, life = new AbortController(), phone = new PhonePairingOwner(authority, w.native.signer, w.native.primitives, w.native.confirmation, () => 1000, 2, life.signal)
  try {
    const pending = phone.prepare(authority, w.bootstrap); await waitForNative(w); w.choosePhone(true, true); const offer = await pending
    const binding = { id: id<'harmony-device-channel'>('phase37-local-proof'), remoteCredentialId: offer.desktopFingerprint, signal: life.signal }; phone.attach(authority, binding); expect(() => phone.attach(authority, binding)).toThrow('identity')
    await phone.enrollment(authority, w.ticket)
    const grant = { protocol: 'dsh-mobile-device-auth/1', desktopId: w.bootstrap.desktopId, profileId: w.bootstrap.profileId, deviceId: w.bootstrap.deviceId, credentialId: offer.phoneFingerprint, epoch: 1, sessions: w.bootstrap.sessions, operations: w.bootstrap.operations, expiresAt: 2000, revoked: false }
    const signed = w.native.signatures()
    for (const invalid of [{ ...grant, operations: ['approval.reply'] }, { ...grant, operations: ['task.submit'] }, { ...grant, operations: ['rich.invoke'] }, { ...grant, sessions: ['other'] }, { ...grant, credentialId: offer.desktopFingerprint }, { ...grant, expiresAt: 2001 }, { ...grant, operator: true }]) expect(() => phone.acceptGrant(authority, invalid)).toThrow()
    expect(w.native.signatures()).toBe(signed); phone.acceptGrant(authority, grant)
    const challenge = { protocol: grant.protocol, challengeId: id<'harmony-device-challenge'>('phase37-native-test-proof'), desktopId: grant.desktopId, profileId: grant.profileId, deviceId: grant.deviceId, credentialId: grant.credentialId, epoch: 1, channelBindingId: binding.id, expiresAt: 1100 }
    await expect(phone.deviceProof(authority, { ...challenge, channelBindingId: 'other' })).rejects.toThrow('scope')
    await expect(phone.deviceProof(authority, { ...challenge, epoch: 2 })).rejects.toThrow('scope')
    await phone.deviceProof(authority, challenge); await expect(phone.deviceProof(authority, challenge)).rejects.toThrow('scope')
    expect(() => readOnlyGrantSchema.parse({ ...grant, operations: ['approval.respond'] })).toThrow()
    life.abort(); await expect(phone.deviceProof(authority, { ...challenge, challengeId: 'late' })).rejects.toThrow('closed')
  } finally { life.abort(); phone.close(); await w.close() }
})
it('concurrent prepare cannot replace the native receipt while fingerprint hashing is asynchronous', async () => {
  const w = await world()
  try { const pending = w.prepare(); await expect(w.prepare()).rejects.toThrow('stale'); await waitForNative(w); w.choosePhone(true, true); await pending; expect(w.native.decisions).toHaveLength(1) }
  finally { await w.close() }
})
it('withdrawn native receipt blocks connect before any E2E signature despite a cached approved offer', async () => {
  const w = await world()
  try { await approvePhone(w); w.phone.close(); await expect(w.connect()).rejects.toThrow('closed'); expect(w.native.signatures()).toBe(0); expect(await w.ctx.credentials.listRecords()).toHaveLength(0) }
  finally { await w.close() }
})
it('revoke failure before grant or during tombstone write still aborts pairing lifetime and blocks signing or reconnect', async () => {
  const first = await world()
  try { await approvePhone(first); await expect(first.revoke()).rejects.toThrow('unpaired'); await expect(first.connect()).rejects.toThrow(); expect(first.native.signatures()).toBe(0) }
  finally { await first.close() }
  const paired = await world()
  try { await approvePhone(paired); await paired.connect(); const grant = await paired.grant('allow'), signatures = paired.native.signatures(); const store = vi.spyOn(paired.ctx.credentials, 'modifyRecord').mockRejectedValueOnce(new Error('fixture store failure'))
    try { await expect(paired.revoke()).rejects.toThrow('fixture store failure') } finally { store.mockRestore() }
    expect(grant.channel.lifetime.aborted).toBe(true); expect(paired.currentScope()).toBeUndefined(); await expect(paired.connect()).rejects.toThrow(); expect(paired.native.signatures()).toBe(signatures)
  } finally { await paired.close() }
})
it.each(['abort-during-publish', 'publish-unknown', 'revoke-failed'] as const)('short room %s denies capabilities, attempts cleanup and never reuses its id', (kind: string) => {
  let now = 1000, revokes = 0; const authority = {}, life = new AbortController(), material = { room: id<'harmony-relay-room'>('phase37-short-room'), desktopToken: '3'.repeat(64), phoneToken: '4'.repeat(64) }
  const publisher = { publish() { if (kind === 'abort-during-publish') life.abort(); if (kind === 'publish-unknown') throw new Error('unknown result') }, revoke() { revokes++; if (kind === 'revoke-failed') throw new Error('cleanup unavailable') } }, rooms = new ShortPairingRooms(authority, publisher, () => now, 100, 1, 2)
  if (kind === 'revoke-failed') { const lease = rooms.open(authority, material, 100, life.signal); life.abort(); expect(() => lease.phoneToken()).toThrow(); expect(() => rooms.close(authority)).toThrow('cleanup failed') }
  else { expect(() => rooms.open(authority, material, 100, life.signal)).toThrow(); expect(() => rooms.open(authority, material, 100, new AbortController().signal)).toThrow('capacity'); rooms.close(authority) }
  expect(revokes).toBeGreaterThan(0); now += 100
})

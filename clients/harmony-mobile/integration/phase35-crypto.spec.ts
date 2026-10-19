/** Fixed public test scalars exercise real library algorithms; no user or freshly generated persistent key, server, account or listener is used. */
import { createECDH, createPrivateKey, createPublicKey, sign, createHash } from 'node:crypto'
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as DisabledCarrier from './disabled-carrier.ts'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Authorization from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { id } from '../src/protocol.ts'
import { ImportedP256Agreement, P256SecureChannel, nodeE2EPrimitives, p256CredentialId, E2EError } from './p256-channel.ts'
import type { E2EPrimitives } from '../src/e2e-channel.ts'
import { P256EnrollmentVerifier, enrollmentBytes, deviceProofBytes } from './p256-enrollment.ts'
import { DeviceAuthorizationOwner } from './device-auth.ts'
import { jsonPayload } from '../src/wire.ts'

function key(scalar: number) {
  const bytes = Buffer.alloc(32); bytes[31] = scalar
  const ec = createECDH('prime256v1'); ec.setPrivateKey(bytes)
  const point = ec.getPublicKey(), privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: bytes.toString('base64url') } })
  const publicSpki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url')
  return { publicSpki, pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }), sign: async (data: Uint8Array) => sign('sha256', data, { key: privateKey, dsaEncoding: 'der' }) }
}
const phoneIdentity = key(1), desktopIdentity = key(2), phoneTransient = key(3), desktopTransient = key(4), stranger = key(5)
const limits = { maxFrameBytes: 8192, maxPlaintextBytes: 4096, maxFrames: 32 }
async function pair(room = 'phase35-offline-room', phonePort: E2EPrimitives = nodeE2EPrimitives, desktopPin = phoneIdentity.publicSpki) {
  const phone = new P256SecureChannel('phone', id<'harmony-relay-room'>(room), new ImportedP256Agreement(phoneTransient.pkcs8), Buffer.alloc(32, 1), desktopIdentity.publicSpki, limits, phonePort)
  const desktop = new P256SecureChannel('desktop', id<'harmony-relay-room'>(room), new ImportedP256Agreement(desktopTransient.pkcs8), Buffer.alloc(32, 2), desktopPin, limits, nodeE2EPrimitives)
  await Promise.all([phone.receiveHello(desktop.hello()), desktop.receiveHello(phone.hello())])
  return { phone, desktop, finish: async () => { const [a, b] = await Promise.all([phone.finish(phoneIdentity), desktop.finish(desktopIdentity)]); await Promise.all([desktop.acceptFinished(JSON.stringify(a)), phone.acceptFinished(JSON.stringify(b))]); return [a, b] } }
}
it('shared asynchronous state authenticates fixed fixture identities and hides rich HTML/Session data from relay frames', async () => {
  const p = await pair(), proofs = await p.finish()
  expect(p.phone.binding().id).toBe(p.desktop.binding().id); expect(p.phone.binding()).not.toBe(p.desktop.binding())
  const data = { sessionId: 'private-synthetic-session', html: '<form><input value="中文" /></form><script>window.rich=true</script>', draft: { title: 'private synthetic draft' } }
  const frame = await p.phone.seal(data), raw = JSON.stringify(frame)
  expect(raw).not.toContain(data.sessionId); expect(raw).not.toContain(data.html); expect(raw).not.toContain(data.draft.title)
  expect(JSON.stringify(proofs)).not.toContain(p256CredentialId(phoneIdentity.publicSpki))
  expect(await p.desktop.open(raw)).toEqual(data)
  expect(await p.phone.open(JSON.stringify(await p.desktop.seal({ receipt: 'encrypted' })))).toEqual({ receipt: 'encrypted' })
  p.phone.close(); p.desktop.close()
})
it('application frames and host transport binding remain unavailable until both pinned identity proofs complete', async () => {
  const p = await pair()
  expect(() => p.phone.binding()).toThrowError(E2EError); await expect(p.phone.seal({ operation: 'task.submit' })).rejects.toMatchObject({ code: 'not-ready' })
  const local = await p.phone.finish(phoneIdentity); await p.desktop.acceptFinished(JSON.stringify(local))
  await expect(p.desktop.seal(null)).rejects.toMatchObject({ code: 'not-ready' }); p.phone.close(); p.desktop.close()
})
it('wrong identity pin fails even when the peer provides a valid self-signature', async () => {
  const p = await pair('wrong-pin', nodeE2EPrimitives, stranger.publicSpki), frame = await p.phone.finish(phoneIdentity)
  await expect(p.desktop.acceptFinished(JSON.stringify(frame))).rejects.toMatchObject({ code: 'signature-denied' }); p.phone.close()
})
it('a different room or modified hello cannot share an authenticated transcript', async () => {
  const p = await pair(), hello = p.phone.hello()
  const other = new P256SecureChannel('desktop', id<'harmony-relay-room'>('other-room'), new ImportedP256Agreement(desktopTransient.pkcs8), Buffer.alloc(32, 2), phoneIdentity.publicSpki, limits, nodeE2EPrimitives)
  await other.receiveHello(hello)
  await expect(other.acceptFinished(JSON.stringify(await p.phone.finish(phoneIdentity)))).rejects.toThrow(); p.phone.close(); p.desktop.close()
})
it('ciphertext tampering releases no plaintext and closes the binding', async () => {
  const p = await pair(); await p.finish(); const binding = p.desktop.binding(), frame = await p.phone.seal({ private: 'never-release' })
  const bytes = Buffer.from(frame.ciphertext, 'base64url'); bytes[0] = bytes[0]! ^ 1
  await expect(p.desktop.open(JSON.stringify({ ...frame, ciphertext: bytes.toString('base64url') }))).rejects.toMatchObject({ code: 'decrypt-failed' })
  expect(binding.signal.aborted).toBe(true); p.phone.close()
})
it('header role/direction/reflection and replay/out-of-order packets reject without dispatch', async () => {
  for (const mode of ['role', 'replay', 'order']) {
    const p = await pair(mode); await p.finish(); const a = await p.phone.seal({ n: 1 }), b = await p.phone.seal({ n: 2 })
    if (mode === 'replay') { await p.desktop.open(JSON.stringify(a)); await expect(p.desktop.open(JSON.stringify(a))).rejects.toMatchObject({ code: 'sequence' }) }
    else await expect(p.desktop.open(JSON.stringify(mode === 'order' ? b : { ...a, role: 'desktop' }))).rejects.toMatchObject({ code: 'sequence' })
    p.phone.close(); p.desktop.close()
  }
})
it('nonce counters remain unique under concurrent async encrypt/decrypt calls', async () => {
  const p = await pair(); await p.finish()
  const frames = await Promise.all([1, 2, 3].map(n => p.phone.seal({ n })))
  expect(frames.map(frame => frame.sequence)).toEqual([1, 2, 3])
  expect(await Promise.all(frames.map(frame => p.desktop.open(JSON.stringify(frame))))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]); p.phone.close(); p.desktop.close()
})
it('packet/invocation budgets reject and a closed channel cannot restart or reuse keys', async () => {
  const p = await pair(); await p.finish(); await expect(p.phone.seal('x'.repeat(4097))).rejects.toMatchObject({ code: 'capacity' })
  p.phone.close(); await expect(p.phone.seal(null)).rejects.toMatchObject({ code: 'closed' })
  await expect(p.desktop.open('x'.repeat(8193))).rejects.toMatchObject({ code: 'invalid' })
})
it('close during an asynchronous primitive cannot release a late decrypted application message', async () => {
  let hold = false, entered!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), barrier = new Promise<void>(resolve => { release = resolve })
  const port: E2EPrimitives = { ...nodeE2EPrimitives, decrypt: async (...args) => { const data = await nodeE2EPrimitives.decrypt(...args); if (hold) { entered(); await barrier } return data } }
  const p = await pair('async-close', port); await p.finish(); hold = true
  const raw = JSON.stringify(await p.desktop.seal({ private: true })), reading = p.phone.open(raw), observed = expect(reading).rejects.toMatchObject({ code: 'closed' })
  await ready; p.phone.close(); release(); await observed; p.desktop.close()
})
it('single-use enrollment validates actual ECDSA, audience and freshness before exposing a public pin', async () => {
  let now = 1000, count = 0; const authority = {}, device = id<'mobile-device'>('phase35-phone'), desktopId = id<'mobile-desktop'>('phase35-desktop'), profileId = id<'mobile-profile'>('phase35-profile')
  const verifier = new P256EnrollmentVerifier({ desktopId, profileId, localAuthority: authority, clock: () => now, challengeTtlMs: 50, pinTtlMs: 1000, maxIssues: 8, maxProofBytes: 4096, identities: { challenge: () => id<'harmony-enrollment-challenge'>('enrollment-' + ++count), nonce: () => Buffer.alloc(32, count) } })
  const challenge = verifier.issue(authority, device, phoneIdentity.publicSpki), signature = (await phoneIdentity.sign(enrollmentBytes(challenge))).toString('base64url')
  const candidate = { desktopId, profileId, deviceId: device, credentialId: p256CredentialId(phoneIdentity.publicSpki), proof: JSON.stringify({ challenge, signature }) }, signal = new AbortController().signal
  expect(await verifier.enrollment(candidate, signal)).toEqual({ confirmationExpiresAt: challenge.expiresAt }); expect(await verifier.enrollment(candidate, signal)).toBe(false)
  expect(verifier.confirmEnrollment({}, candidate)).toBe(false); expect(verifier.confirmEnrollment(authority, candidate)).toBe(true); expect(verifier.confirmEnrollment(authority, candidate)).toBe(false)
  const stale = verifier.issue(authority, device, phoneIdentity.publicSpki); now += 50
  expect(await verifier.enrollment({ ...candidate, proof: JSON.stringify({ challenge: stale, signature: (await phoneIdentity.sign(enrollmentBytes(stale))).toString('base64url') }) }, signal)).toBe(false)
  verifier.close()
})
it('actual verifier connects phase34 independent device scope over encrypted transcript and revocation aborts it without models', async () => {
  const evidenceRoot = process.env.DSH_HARMONY_INTEGRATION_WORLD ?? fileURLToPath(new URL('../.build/', import.meta.url)); await mkdir(evidenceRoot, { recursive: true }); const evidencePath = join(await mkdtemp(join(evidenceRoot, 'encrypted-enrollment-')), 'scope.json')
  const ctx = new Context(), authority = {}, device = id<'mobile-device'>('phase35-phone'), desktopId = id<'mobile-desktop'>('phase35-desktop'), profileId = id<'mobile-profile'>('phase35-profile'); let counter = 0
  if (ctx.get('connection') === undefined) await ctx.plugin(DisabledCarrier)
  if (ctx.get('remoteAccess') === undefined) await ctx.plugin(RemoteAccess)
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  const verifier = new P256EnrollmentVerifier({ desktopId, profileId, localAuthority: authority, clock: Date.now, challengeTtlMs: 1000, pinTtlMs: 1000, maxIssues: 8, maxProofBytes: 4096, identities: { challenge: () => id<'harmony-enrollment-challenge'>('scope-enrollment-' + ++counter), nonce: () => Buffer.alloc(32, counter) } })
  const channel = await pair(); await channel.finish()
  const offer = verifier.issue(authority, device, phoneIdentity.publicSpki)
  expect(await channel.phone.open(JSON.stringify(await channel.desktop.seal(json(offer))))).toEqual(offer)
  const enrollment = { challenge: offer, signature: (await phoneIdentity.sign(enrollmentBytes(offer))).toString('base64url') }
  const proof = JSON.stringify(await channel.desktop.open(JSON.stringify(await channel.phone.seal(json(enrollment)))))
  let owner: DeviceAuthorizationOwner | undefined
  try {
    await ctx.inject(['credentials', 'authorization', 'connection', 'remoteAccess'], inner => { owner = new DeviceAuthorizationOwner(inner, { desktopId, profileId, desktopCredentialId: p256CredentialId(desktopIdentity.publicSpki), localAuthority: authority, clock: Date.now, limits: { maxGrantTtlMs: 1000, maxConnectionTtlMs: 1000, challengeTtlMs: 1000, maxDevices: 1, maxChallengeIssues: 8, maxSessions: 1, maxProofBytes: 4096 }, verifier,
      identities: { challenge: () => id<'harmony-device-challenge'>('scope-proof-' + ++counter) }, copy: { label: 'Fixture only', method: 'Local fake consent', allow: 'Allow', deny: 'Deny', confirm: () => 'Synthetic Session only' } }) })
    if (owner === undefined) throw new Error('Fixture owner missing')
    const owned = owner, flow = owned.offerPairing(authority, { deviceId: device, credentialId: offer.credentialId, proof, sessions: ['phase35-synthetic-session'], operations: ['session.sync', 'task.receipt'], grantTtlMs: 1000 }), stop = ctx.authorization.registerFlow(flow)
    expect((await ctx.authorization.begin({ key: flow.key, interaction: { notify: () => {}, prompt: async () => 'allow' } })).status).toBe('authorized'); stop()
    const transport = channel.desktop.binding(), challenge = await owned.challenge(device, transport)
    const encryptedChallenge = await channel.desktop.seal(json(challenge)), decoded = await channel.phone.open(JSON.stringify(encryptedChallenge))
    expect(decoded).toEqual(challenge)
    const response = { challengeId: challenge.challengeId, signature: (await phoneIdentity.sign(deviceProofBytes(challenge))).toString('base64url') }
    const encryptedProof = await channel.phone.seal(response), received = await channel.desktop.open(JSON.stringify(encryptedProof)), lease = await owned.authenticate(received, transport, new AbortController().signal)
    expect(owned.current(lease.peer)).toMatchObject({ sessions: ['phase35-synthetic-session'], operations: ['session.sync', 'task.receipt'] })
    await owned.revoke(authority, device); expect(await verifier.challenge(challenge, response.signature, new AbortController().signal)).toBe(false); expect(lease.signal.aborted).toBe(true); expect(owned.current(lease.peer)).toBeUndefined(); channel.phone.close(); channel.desktop.close()
    await writeFile(evidencePath, JSON.stringify({ algorithms: ['ECDSA-P256-SHA256-DER', 'ECDH-P256', 'HKDF-SHA256', 'AES-256-GCM'], keys: 'fixed public test scalars 1..5 only', sharedAsyncProtocol: true, phase34Provider: true, encryptedEnrollmentAndConnectionProof: true, syntheticScopeOnly: true, realUserPairing: false, models: 0, uploads: 0, listeners: 0, serversContacted: 0, persistentUserKeysCreated: 0, nativeCryptoExecuted: false, installedPluginChanged: false }, null, 2) + '\n', { flag: 'wx' })
  } finally { verifier.close(); await ctx.fiber.dispose() }
})
function json(value: object) { return jsonPayload(value) }
it('HKDF derives distinct role keys with binary zero bytes and does not expose them as credentials', async () => {
  const secret = Buffer.alloc(32); secret[31] = 1; const salt = createHash('sha256').update('fixed test transcript').digest()
  const a = await nodeE2EPrimitives.hkdf(secret, salt, Buffer.from('phone'), 36), b = await nodeE2EPrimitives.hkdf(secret, salt, Buffer.from('desktop'), 36)
  expect(a.length).toBe(36); expect(a).not.toEqual(b)
})

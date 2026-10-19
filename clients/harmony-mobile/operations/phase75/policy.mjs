/** Fixed phase75 review; validated public data is never permission to execute. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import plan from './plan.json' with { type: 'json' }
import { parsePublicTrustDocument, canonicalPublicTrust, successorHistory, assertPublicTrustSuccessor, verifyPublicTrustHistory, p256CredentialId, pairedGrantSchema } from './shared.mjs'

/** Exact reviewed scope, copied into the sealed operation package. */
export const PLAN = Object.freeze(plan)
/** @param bytes - public bytes. @returns SHA-256 hex. */
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
/** @param code - stable refusal category. @returns never. */
export function deny(code) { const error = new Error('phase75: ' + code); error.code = code; throw error }
/** @param observedAt - public observation clock. @param now - review clock. @returns after bounded freshness validation. */
export function fresh(observedAt, now) { if (!Number.isSafeInteger(observedAt) || observedAt > now + PLAN.limits.clockSkewMs || now - observedAt > PLAN.limits.observationMs) deny('stale-observation') }
/** @param approved - record of a separately verified human decision. @param planSha256 - sealed plan digest. @param manifestSha256 - sealed runtime/test file inventory digest. @returns after refusing reused approval metadata; this check does not establish human authority. */
export function reviewApprovalRecord(approved, planSha256, manifestSha256) {
  assert.equal(approved.schema, 'harmony-phase75-human-approval/1'); assert.equal(approved.approved, true)
  assert.equal(approved.planSha256, planSha256); assert.equal(approved.manifestSha256, manifestSha256)
  assert.ok(typeof approved.sourceHumanMessageId === 'string' && approved.sourceHumanMessageId.length > 0); assert.deepEqual(approved.scopes, PLAN.confirmationScopes)
}
function scope(grant) {
  const i = PLAN.identity
  assert.equal(grant.desktopId, i.desktopId); assert.equal(grant.deviceId, i.deviceId); assert.equal(grant.profileId, i.profileId)
  assert.equal(grant.credentialId, i.phoneFingerprint); assert.deepEqual(grant.sessions, [PLAN.session]); assert.deepEqual(grant.operations, PLAN.operations)
}
/** @param state - fresh original-owner public metadata, not credential bytes. @param epoch - exact expected tombstone. @param now - review clock. @returns the denied original grant. */
export function reviewDesktop(state, epoch, now) {
  fresh(state.observedAt, now); assert.equal(state.activeGrantCount, 0); assert.equal(state.grants.length, 1)
  assert.equal(state.identities.length, 1); assert.equal(state.identities[0].fingerprint, PLAN.identity.desktopFingerprint); assert.equal(state.identities[0].protectedBytesPresent, true)
  const { revoked, ...fields } = state.grants[0], grant = pairedGrantSchema.omit({ revoked: true }).parse(fields)
  scope(grant); assert.equal(grant.epoch, epoch); assert.equal(revoked, true)
  if (epoch === PLAN.epochs.before) assert.equal(grant.expiresAt, PLAN.local.retainedExpiresAt)
  if (epoch === PLAN.epochs.after) assert.ok(grant.expiresAt > PLAN.local.retainedExpiresAt)
  return { ...grant, revoked }
}
/** @param state - explicit native public-read and clean-close observation. @param now - review clock. @returns after refusing unknown or existing lock state. */
export function reviewPhoneState(state, now) {
  fresh(state.observedAt, now); assert.equal(state.targetRef, PLAN.native.targetRef)
  assert.equal(state.originalIdentityMatched, true); assert.equal(state.publicReadSucceeded, true)
  assert.equal(state.existingLockObserved, false); assert.equal(state.ownTemporaryLockReleased, true); assert.equal(state.normalExitCompleted, true)
}
/** @param identity - original phone's public identity file used by the frozen profile. @returns after exact alias/fingerprint verification. */
export function reviewPhoneIdentity(identity) {
  assert.deepEqual(Object.keys(identity).sort(), ['credentialId', 'identityAlias', 'publicSpki'])
  assert.equal(identity.identityAlias, PLAN.identity.phoneAlias); assert.equal(identity.credentialId, PLAN.identity.phoneFingerprint)
  assert.equal(p256CredentialId(identity.publicSpki), PLAN.identity.phoneFingerprint)
}
function recordScope(record) {
  assert.equal(record.revoked, false); assert.equal(record.identityAlias, PLAN.identity.phoneAlias)
  const pair = record.paired; scope(pair.grant); assert.equal(pair.grant.revoked, false)
  assert.equal(pair.credentialId, PLAN.identity.phoneFingerprint); assert.equal(pair.desktopCredentialId, PLAN.identity.desktopFingerprint)
  assert.equal(p256CredentialId(record.desktopPublicSpki), PLAN.identity.desktopFingerprint); assert.equal(pair.audience, PLAN.relay.host); assert.equal(pair.epoch, 1)
}
/** @param raw - freshly exported phone3. @param desktop - fresh revoked6 metadata. @param now - real expiry clock. @param retainedRaw - exact desktop-retained full signed5, never imported as current phone trust. @returns expired signed5 only as the desktop renewal predecessor; phone3 remains the saved anchor. */
export async function reviewPrevious(raw, desktop, now, retainedRaw) {
  const phone = parsePublicTrustDocument(raw, 32768), retained = parsePublicTrustDocument(retainedRaw, 32768)
  for (const document of [phone, retained]) { assert.equal(document.schema, 'harmony-product-public-trust/2'); assert.equal(document.revoked, false); recordScope(document.record); assert.ok(document.record.paired.grant.expiresAt <= now); assert.ok(document.record.paired.expiresAt <= now) }
  assert.equal(hash(canonicalPublicTrust(phone)), PLAN.local.phoneCanonicalSha256)
  assert.equal(hash(retainedRaw), PLAN.local.retainedPublicSha256); assert.equal(hash(canonicalPublicTrust(retained)), PLAN.local.retainedCanonicalSha256)
  assert.equal(phone.record.paired.grant.epoch, PLAN.epochs.phoneGrant); assert.equal(phone.revokedEpoch, PLAN.epochs.phoneRevokedFloor); assert.equal(phone.history.length, 1)
  assert.equal(retained.record.paired.grant.epoch, PLAN.epochs.previousGrant); assert.equal(retained.revokedEpoch, PLAN.epochs.previousRevokedFloor); assert.equal(retained.history.length, 2)
  await verifyPublicTrustHistory(phone); await verifyPublicTrustHistory(retained, phone)
  const denied = reviewDesktop(desktop, PLAN.epochs.before, now); assert.equal(denied.expiresAt, retained.record.paired.grant.expiresAt)
  return retained
}
/** @param raw - new complete signed7. @param previous - exact desktop-retained5. @param now - real expiry clock. @param phone - exact saved phone3. @returns fully verified final7 with all history retained; no intermediate is activated. */
export async function reviewNext(raw, previous, now, phone) {
  const next = reviewNextFields(raw, previous, now, phone); await verifyPublicTrustHistory(next, phone); return next
}
/** @param raw - complete signed successor. @param previous - desktop5. @param now - real clock. @param phone - saved3. @returns fields-only result; all signature/digest inputs must also pass before use. */
export function reviewNextFields(raw, previous, now, phone) {
  const next = parsePublicTrustDocument(raw, 32768); assert.equal(next.schema, 'harmony-product-public-trust/2'); recordScope(next.record)
  assert.equal(next.revokedEpoch, PLAN.epochs.before); assert.equal(next.record.paired.grant.epoch, PLAN.epochs.grant)
  assert.equal(next.record.paired.pairId, PLAN.pairId); assertPublicTrustSuccessor(phone, next, now); assertPublicTrustSuccessor(previous, next, now)
  assert.equal(next.previousDigest, hash(canonicalPublicTrust(previous))); assert.deepEqual(next.history, successorHistory(previous))
  assert.ok(next.record.paired.expiresAt <= now + PLAN.limits.grantMs); assert.ok(next.record.paired.grant.expiresAt <= now + PLAN.limits.grantMs)
  return next
}
/** @param pair - untrusted six-field relay public record. @param now - current clock. @returns exact bounded new pair. */
export function reviewPair(pair, now) {
  assert.deepEqual(Object.keys(pair).sort(), ['desktopPublicSpki', 'epoch', 'expiresAt', 'pairId', 'phonePublicSpki', 'revoked'])
  assert.equal(pair.pairId, PLAN.pairId); assert.equal(pair.epoch, PLAN.epochs.relayPair); assert.equal(pair.revoked, false)
  assert.equal(p256CredentialId(pair.desktopPublicSpki), PLAN.identity.desktopFingerprint); assert.equal(p256CredentialId(pair.phonePublicSpki), PLAN.identity.phoneFingerprint)
  assert.ok(Number.isSafeInteger(pair.expiresAt) && pair.expiresAt > now + 30000 && pair.expiresAt <= now + PLAN.limits.grantMs)
  return pair
}
/** @param state - fresh original-owner metadata. @param next - verified final7 document. @param now - real clock. @returns after requiring the single active7 and its exact scope/expiry before any relay stage, initialization or activation; a revoked intermediate never qualifies. */
export function reviewLiveGrant(state, next, now) {
  fresh(state.observedAt, now); assert.equal(state.activeGrantCount, 1); assert.equal(state.grants.length, 1)
  assert.equal(state.identities.length, 1); assert.equal(state.identities[0].fingerprint, PLAN.identity.desktopFingerprint); assert.equal(state.identities[0].protectedBytesPresent, true)
  const grant = pairedGrantSchema.parse(state.grants[0]); scope(grant); assert.equal(grant.epoch, PLAN.epochs.grant); assert.ok(grant.expiresAt > now)
  assert.deepEqual(grant, next.record.paired.grant); return grant
}
/** @param entries - current and historical public pair IDs. @returns after rejecting reuse. */
export function requireUnusedPair(entries) { if (entries.includes(PLAN.pairId)) deny('pair-already-exists') }
/** @param candidate - absolute state directory. @returns after exact canonical path validation. */
export function statePath(candidate) { if (candidate !== PLAN.relay.state || posix.normalize(candidate) !== candidate) deny('state-path-denied'); return candidate }
/** @returns exact temporary unit text; the reset prevents inherited writable paths. */
export function dropIn() {
  const r = PLAN.relay
  return '[Service]\nWorkingDirectory=' + r.code + '\nExecStart=\nExecStart=/usr/bin/node ' + r.code + '/server.mjs --config ' + r.config + '\nReadWritePaths=\nReadWritePaths=' + statePath(r.state) + '\n'
}
/** @param text - selected override. @returns after byte-for-byte validation. */
export function reviewDrop(text) { assert.equal(text, dropIn()) }
/** @param template - frozen existing relay policy. @param pair - validated public pair. @returns same policy with only new pair and public journal path substituted. */
export function relayConfig(template, pair) {
  const config = structuredClone(template); assert.equal(config.host, PLAN.relay.hostAddress); assert.equal(config.port, PLAN.relay.port)
  assert.equal(config.publicHost, PLAN.relay.host); assert.equal(config.nativeOrigin, PLAN.relay.nativeOrigin)
  assert.equal(config.broker.enabled, true); assert.deepEqual(config.broker.pairs, []); assert.equal(config.broker.maxPairs, 1)
  config.broker.pairs = [pair]; config.publicTrust.path = statePath(PLAN.relay.state) + '/public.jsonl'; return config
}
/** @param grant - fresh post-exit state. @param cleanup - frozen profile's own teardown result. @param now - current clock. @returns safe public-config restoration disposition; never mutates credentials. */
export function reviewCleanup(grant, cleanup, now) {
  assert.equal(cleanup.revocationSucceeded, true); assert.equal(cleanup.resourcesClosed, true)
  const epoch = cleanup.confirmedGrant ? PLAN.epochs.after : grant.grants[0]?.epoch
  assert.ok(epoch === PLAN.epochs.before || epoch === PLAN.epochs.after); reviewDesktop(grant, epoch, now)
  return { publicConfigMayRestore: true, credentialsMayRestore: false }
}

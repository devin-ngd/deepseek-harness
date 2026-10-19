/** Fixed phase74 review; validated public data is never permission to execute. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import plan from './plan.json' with { type: 'json' }
import { parsePublicTrustDocument, canonicalPublicTrust, publicTrustRenewalBytes, successorHistory, assertPublicTrustSuccessor, nodeE2EPrimitives, p256CredentialId, pairedGrantSchema } from './shared.mjs'

/** Exact reviewed scope, copied into the sealed operation package. */
export const PLAN = Object.freeze(plan)
/** @param bytes - public bytes. @returns SHA-256 hex. */
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
/** @param code - stable refusal category. @returns never. */
export function deny(code) { const error = new Error('phase74: ' + code); error.code = code; throw error }
/** @param observedAt - public observation clock. @param now - review clock. @returns after bounded freshness validation. */
export function fresh(observedAt, now) { if (!Number.isSafeInteger(observedAt) || observedAt > now + PLAN.limits.clockSkewMs || now - observedAt > PLAN.limits.observationMs) deny('stale-observation') }
/** @param approved - record of a separately verified human decision. @param planSha256 - sealed plan digest. @param manifestSha256 - sealed runtime/test file inventory digest. @returns after refusing reused approval metadata; this check does not establish human authority. */
export function reviewApprovalRecord(approved, planSha256, manifestSha256) {
  assert.equal(approved.schema, 'harmony-phase74-human-approval/1'); assert.equal(approved.approved, true)
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
  scope(grant); assert.equal(grant.epoch, epoch); assert.equal(revoked, true); return { ...grant, revoked }
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
async function signature(document) {
  if (!await nodeE2EPrimitives.verify(document.record.desktopPublicSpki, publicTrustRenewalBytes(document), Buffer.from(document.signature, 'base64url'))) deny('public-signature-denied')
}
/** @param raw - entire newly exported native v2. @param desktop - current revoked4 observation. @param now - review clock. @returns strict full predecessor after signature/history/scope validation. */
export async function reviewPrevious(raw, desktop, now) {
  const document = parsePublicTrustDocument(raw, 32768); assert.equal(document.schema, 'harmony-product-public-trust/2')
  assert.equal(document.revoked, false); recordScope(document.record); assert.equal(document.record.paired.grant.epoch, PLAN.epochs.previousGrant)
  assert.equal(document.revokedEpoch, PLAN.epochs.previousRevokedFloor); assert.equal(document.history.length, 1)
  const old = document.history[0]; assert.equal(old.receipt, null); assert.equal(old.localRevoked, false); recordScope(old.record)
  assert.equal(old.record.paired.grant.epoch, 1); assert.notEqual(old.record.paired.pairId, document.record.paired.pairId)
  assert.equal(document.record.paired.pairId, 'harmony-phase69-successor-20261016')
  assert.equal(document.previousDigest, hash(canonicalPublicTrust(old.record))); await signature(document)
  assert.ok(document.record.paired.grant.expiresAt <= now); assert.ok(document.record.paired.expiresAt <= now)
  const denied = reviewDesktop(desktop, PLAN.epochs.before, now); assert.equal(denied.expiresAt, document.record.paired.grant.expiresAt)
  return document
}
/** @param raw - new full signed v2. @param previous - exact reviewed predecessor. @param now - current clock. @returns validated successor with all history retained. */
export async function reviewNext(raw, previous, now) {
  const next = reviewNextFields(raw, previous, now); await signature(next); return next
}
/** @param raw - candidate public v2. @param previous - complete predecessor. @param now - review clock. @returns fields-only result; callers must verify its signature before use. */
export function reviewNextFields(raw, previous, now) {
  const next = parsePublicTrustDocument(raw, 32768); assert.equal(next.schema, 'harmony-product-public-trust/2'); recordScope(next.record)
  assert.equal(next.revokedEpoch, PLAN.epochs.before); assert.equal(next.record.paired.grant.epoch, PLAN.epochs.grant)
  assert.equal(next.record.paired.pairId, PLAN.pairId); assertPublicTrustSuccessor(previous, next, now)
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

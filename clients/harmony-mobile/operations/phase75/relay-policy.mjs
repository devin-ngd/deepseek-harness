/** Relay-only public paths, allowlist fields and service policy. The desktop plan is never imported into this module. */
import assert from 'node:assert/strict'
import { posix } from 'node:path'
import plan from './relay-plan.json' with { type: 'json' }
import { hash, deny } from './common.mjs'
import { p256CredentialId } from './shared-public.mjs'
export { hash, deny }
/** Public remote policy contains no Session, desktop grant, credential store path or private key material. */
export const PLAN = Object.freeze(plan)
/** @param candidate - exact new public journal directory. @returns after refusing all other paths. */
export function statePath(candidate) { if (candidate !== PLAN.relay.state || posix.normalize(candidate) !== candidate) deny('state-path-denied'); return candidate }
/** @returns exact temporary override; only the new state directory is writable. */
export function dropIn() { const r = PLAN.relay; return '[Service]\nWorkingDirectory=' + r.code + '\nExecStart=\nExecStart=/usr/bin/node ' + r.code + '/server.mjs --config ' + r.config + '\nReadWritePaths=\nReadWritePaths=' + statePath(r.state) + '\n' }
/** @param text - selected public override. @returns after exact comparison. */
export function reviewDrop(text) { assert.equal(text, dropIn()) }
/** @param entries - retained public pair identifiers. @returns after refusing namespace reuse. */
export function requireUnusedPair(entries) { if (entries.includes(PLAN.pairId)) deny('pair-already-exists') }
/** @param pair - only six public fields; no Session, signature, token or capability is accepted. @param now - real remote clock. @returns a valid unexpired allowlist entry; neither endpoint has authenticated yet. */
export function reviewPair(pair, now) {
  assert.deepEqual(Object.keys(pair).sort(), ['desktopPublicSpki', 'epoch', 'expiresAt', 'pairId', 'phonePublicSpki', 'revoked'])
  assert.equal(pair.pairId, PLAN.pairId); assert.equal(pair.epoch, PLAN.epochs.relayPair); assert.equal(pair.revoked, false)
  assert.notEqual(p256CredentialId(pair.desktopPublicSpki), p256CredentialId(pair.phonePublicSpki))
  assert.ok(Number.isSafeInteger(pair.expiresAt) && pair.expiresAt > now + 30000 && pair.expiresAt <= now + PLAN.limits.grantMs); return pair
}
/** @param template - original relay-only configuration. @param pair - validated public pair. @returns a candidate with only the public pair and independent journal path substituted. */
export function relayConfig(template, pair) {
  const config = structuredClone(template), r = PLAN.relay
  assert.equal(config.host, r.hostAddress); assert.equal(config.port, r.port); assert.equal(config.publicHost, r.host); assert.equal(config.nativeOrigin, r.nativeOrigin)
  assert.equal(config.broker.enabled, true); assert.equal(config.broker.maxPairs, 1); assert.deepEqual(config.broker.pairs, [])
  config.broker.pairs = [pair]; config.publicTrust.path = statePath(r.state) + '/public.jsonl'; return config
}

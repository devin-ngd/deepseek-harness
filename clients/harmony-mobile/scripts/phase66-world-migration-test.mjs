/** Reject fixture, policy and ownership changes before the approved local asset acknowledgement. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { planWorldAssetsMigration } from './phase66-world-migration.mjs'
const fixture = Buffer.from('fixed synthetic responses'), oldConfig = '- name: cordis:typert\n- name: cordis:commands\n'
const input = () => ({ desktopId: 'fixed-desktop', identityAlias: 'fixed-identity', oldFixture: fixture, newFixture: fixture, oldConfig, newConfig: oldConfig.replace('typert\n', 'typert\n- name: cordis:remoteAccess\n'), manifest: { format: 'harmony-field-world/1', state: 'ready', desktopId: 'fixed-desktop', profileId: 'harmony-mobile-replay', sessionId: 'harmony-mobile-field-replay-session', identityAlias: 'fixed-identity', assetsSha256: createHash('sha256').update(fixture).update(new Uint8Array([0])).update(oldConfig).digest('hex') } })
test('admit only the current remoteAccess registration and preserve owner fields', () => { const before = input(), after = planWorldAssetsMigration(before); assert.notEqual(after.assetsSha256, before.manifest.assetsSha256); assert.deepEqual({ ...after, assetsSha256: before.manifest.assetsSha256 }, before.manifest) })
test('reject changed fixed responses', () => assert.throws(() => planWorldAssetsMigration({ ...input(), newFixture: Buffer.from('different') })))
test('reject an additional provider', () => assert.throws(() => planWorldAssetsMigration({ ...input(), newConfig: input().newConfig + '- name: cordis:other\n' })))
test('reject missing original registration', () => assert.throws(() => planWorldAssetsMigration({ ...input(), oldConfig: '' })))
for (const [key, value] of [['state', 'initializing'], ['desktopId', 'other-desktop'], ['sessionId', 'other-session'], ['identityAlias', 'other-identity'], ['assetsSha256', '0'.repeat(64)], ['unexpected', true]]) test('reject changed owner field ' + key, () => { const before = input(); assert.throws(() => planWorldAssetsMigration({ ...before, manifest: { ...before.manifest, [key]: value } })) })

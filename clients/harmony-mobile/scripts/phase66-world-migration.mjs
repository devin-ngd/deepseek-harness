/** Validate the sole alpha.4 local composition delta without changing replay bytes, identity, Session or authorization policy. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const assetsHash = (fixture, config) => createHash('sha256').update(fixture).update(new Uint8Array([0])).update(config).digest('hex')
/** @param input - original and successor public assets plus exact original owner fields. @returns the detached successor manifest, or throws before any write for an unrelated delta. */
export function planWorldAssetsMigration({ manifest, desktopId, identityAlias, oldFixture, newFixture, oldConfig, newConfig }) {
  assert.deepEqual(newFixture, oldFixture, 'fixed responses must remain identical')
  const registration = '- name: cordis:typert\n'
  assert.equal(oldConfig.split(registration).length, 2, 'one original registration required')
  assert.equal(newConfig, oldConfig.replace(registration, registration + '- name: cordis:remoteAccess\n'), 'only existing remoteAccess registration is admitted')
  assert.deepEqual(manifest, { format: 'harmony-field-world/1', state: 'ready', desktopId, profileId: 'harmony-mobile-replay', sessionId: 'harmony-mobile-field-replay-session', identityAlias, assetsSha256: assetsHash(oldFixture, oldConfig) }, 'original owner and assets must match exactly')
  return { ...manifest, assetsSha256: assetsHash(newFixture, newConfig) }
}

/** Fixed-plan operator review only; the native runtime must still verify the desktop signature and predecessor digest. */
import assert from 'node:assert/strict'
/** @param document - selected public JSON. @param plan - frozen requested scope, never permission evidence. @param kind - original expired record or first signed successor. @param now - current review clock. @param previous - full retained original document for a successor. @returns current public fields after exact scope review; performs no IO, signing, enrollment, authorization or network operation. */
export function reviewPublicRecord(document, plan, kind, now, previous) {
  assert.ok(document && typeof document === 'object'); assert.equal(document.revoked,false)
  const record=document.schema==='harmony-product-public-trust/2'?document.record:document
  assert.equal(record.schema,'harmony-product-public-trust/1'); assert.equal(record.revoked,false); assert.equal(record.identityAlias,plan.authorization.originalPhoneIdentityAlias)
  const pair=record.paired,grant=pair.grant;assert.equal(pair.credentialId,plan.authorization.phoneFingerprint);assert.equal(pair.desktopCredentialId,plan.authorization.desktopFingerprint);assert.equal(grant.credentialId,pair.credentialId);assert.equal(grant.revoked,false);assert.equal(pair.audience,plan.relay.host);assert.deepEqual(grant.sessions,[plan.authorization.session]);assert.deepEqual(grant.operations,plan.authorization.operations)
  if(kind==='expired'){assert.equal(document.schema,'harmony-product-public-trust/1');assert.equal(grant.epoch,1);assert.ok(Math.min(pair.expiresAt,grant.expiresAt)<=now)}
  else{assert.equal(kind,'successor');assert.equal(document.schema,'harmony-product-public-trust/2');assert.equal(document.revokedEpoch,plan.authorization.existingRevokedEpoch);assert.equal(grant.epoch,plan.authorization.expectedNewGrantEpoch);assert.equal(pair.pairId,plan.authorization.proposedNewPair);assert.ok(Math.min(pair.expiresAt,grant.expiresAt)>now);assert.ok(Math.max(pair.expiresAt,grant.expiresAt)<=now+plan.authorization.maximumMinutes*60000);assert.equal(document.history.length,1);assert.deepEqual(document.history[0],{record:previous,receipt:null,localRevoked:false});assert.notEqual(pair.pairId,previous.paired.pairId);assert.equal(record.desktopPublicSpki,previous.desktopPublicSpki)}
  return record
}

/** Seal exact signing, the exhausted connection budget and unchanged authorization state; never start a device or field operation. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, constants, copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const approval = await json('evidence/phase65-authorization.json'), signed = await json('evidence/phase65-signed-build.json')
const phone = await json('evidence/phase65-phone-retry-budget.json'), usb = await json('evidence/phase65-usb-inspection.json')
const host = await json('evidence/phase65-host-processes.json'), desktop = await json('evidence/phase65-desktop-identity.json')
const marker = await json('.build/phase54-active.json'), previous = await json('evidence/phase59-signed-build.json')
assert.equal(hash(await readFile(approval.candidate.path)), approval.candidate.sha256)
assert.equal(hash(await readFile(signed.artifact.path)), signed.artifact.sha256)
assert.equal(hash(await readFile(previous.artifact.path)), previous.artifact.sha256)
assert.equal(signed.packageSignerExecutions, 1)
assert.equal(signed.officialVerifyAppExitCode, 0); assert.equal(signed.officialVerifyProfileExitCode, 0)
assert.equal(signed.extractedProfileExactlyMatchesExistingApprovedMaterial, true)
assert.equal(signed.applicationEntriesExactlyMatch, true)
assert.equal(phone.checksUsed, 5); assert.equal(phone.recovered, false); assert.equal(phone.noFurtherAutomaticRetry, true)
assert.equal(usb.querySucceeded, true); assert.ok(usb.interfaces.some(row => row.approvedSerialMatched === true))
assert.equal(host.hdcProcessCount, 0); assert.equal(host.originalLoopback8710Listeners.length, 0)
assert.equal(host.ownedFieldProcessCount, 0); assert.equal(desktop.grantCount, 0)
assert.equal(desktop.privateIdentityOpened, false); assert.equal(desktop.grantTimerStarted, false)
for (const path of ['evidence/phase65-install-attempt.json', 'evidence/phase65-installation.json']) {
  try { await access(path); throw new Error('Installation state exists: inspect before blocked closeout') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const proofBytes = await readFile(join(marker.home, 'phone-reply.json')), proof = JSON.parse(proofBytes.toString('utf8'))
assert.equal(hash(proofBytes), '623b57fe517b2f7dd141ef32196448757a54143fb6cfa3841fe8d04672469e23')
assert.ok(proof.offer.ticket.expiresAt <= Date.now())
const relayFile = (await readdir('evidence')).filter(path => /^phase54-relay-verify-\d+\.json$/.test(path)).sort().at(-1)
const relay = await json('evidence/' + relayFile)
assert.equal(relay.exit.code, 0)
assert.match(relay.output, /original config and server unchanged; no pair, public trust or service override/)
assert.ok(Date.parse(relay.at) >= Date.parse(approval.userApprovalAt))
await copyFile('evidence/' + relayFile, 'evidence/phase65-relay-unchanged.json', constants.COPYFILE_EXCL)
const summary = {
  schema: 'harmony-approved-alpha4-signed-hdc-blocked/1', at: new Date().toISOString(),
  state: 'signed-verified-install-not-attempted-local-hdc-helper-absent',
  authorization: approval.evidence, signingAndSameBundleInstallApproved: true, approvalRequiresRepetition: false,
  input: approval.candidate, signedArtifact: signed.artifact,
  signing: { executions: 1, originalMaterialsReused: true, officialVerifyAppExitCode: 0, officialVerifyProfileExitCode: 0, originalProfileExactMatch: true, originalSigningConfigurationUnchanged: true, applicationEntriesExactlyMatch: 23, rawSignerArgumentsOrOutputRetained: false, privateKeyContentInspected: false },
  phone: { originalUsbSerialHashMatched: true, usbInterfaceCount: usb.count, usbStatus: 'OK', hdcApprovedTargetAvailable: false, currentPhoneAppStateObserved: false, installationAttempted: false, uninstallOrDataClear: false, permissionExpansion: false, huksOperation: false, newIdentityCreated: false },
  blocker: { kind: 'existing-local-hdc-helper-absent', hdcProcessCount: 0, originalLoopbackEndpoint: '127.0.0.1:8710', listenerCount: 0, hardwareDisconnectionEstablished: false, checks: phone.checksUsed, maximumChecks: phone.maximumChecks, retryIntervalMs: phone.intervalMs, furtherAutomaticRetryStopped: true, helperStartedOrRestarted: false },
  desktop: { identityFingerprint: desktop.identities[0].fingerprint, publicMetadataInspectedOnly: true, privateIdentityOpened: false, grantCount: 0, grantTimerStarted: false, grantStartedAt: null, grantExpiresAt: null, grantCreated: false, grantRevocationNeeded: false, ownedFieldProcesses: 0, installedDesktopChanged: false },
  relay: { verifiedAt: relay.at, originalConfigAndCodeUnchanged: true, noTemporaryPairTrustOrServiceOverride: true, activated: false },
  oldProof: { path: join(marker.home, 'phone-reply.json'), sha256: hash(proofBytes), expired: true, preserved: true, replayed: false, freshChallengeRequired: true },
  realModels: 0, userProjectOperations: 0, newFieldRunStarted: false, trueEndToEndPassed: false,
  candidateOrNativeSourceRebuilt: false, commitOrPush: false,
  next: ['Restore the original official local HDC bridge after the exhausted retry stop is explicitly resumed; first recheck the unique original target/model/API/bundle.', 'Reuse this already verified signed HAP and scripts/phase65-install.mjs for one install -r. Do not re-sign, uninstall, clear data or recreate identities.', 'Build and smoke-test the current alpha.4 field profile before claiming live alpha.4 qualification; the old field runtime is not such evidence.', 'Issue a fresh challenge and verify both identities and the single fixed Session before creating any grant. Grant lifetime starts at actual creation and is at most thirty minutes, without renewal.', 'Run the phone/ArkWeb fixed replay and teardown acceptance only after the device and current field-runtime prerequisites pass.'],
  rollback: { previousConfirmedInstalledArtifact: previous.artifact, installedStateNotReobserved: true, originalSourcePreimages: 'D:/Temp/dsh-harmony-alpha4-phase63-preimages', oldUnsignedAndSignedArtifactsPreserved: true, identitiesAndOldPublicProofPreserved: true },
  requiredChecksRunning: false,
}
await writeFile('evidence/phase65-summary.json', JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
await writeFile('docs/phase65-approved-signed-hdc-blocked.md', `# Approved alpha.4 signing and HDC blocker

The user approved the exact phase63 candidate at 2026-10-16 11:22 UTC. Signing and same-bundle in-place installation are authorized; this approval does not need to be requested again for these exact bytes and original materials. The unsigned input remains ${approval.candidate.path}, ${approval.candidate.bytes} bytes, SHA-256 ${approval.candidate.sha256}.

The original official SDK signer executed once with the existing signing configuration. The output is ${signed.artifact.path}, ${signed.artifact.bytes} bytes, SHA-256 ${signed.artifact.sha256}. Official verify-app and verify-profile both exited zero. The extracted profile exactly matches the original approved profile, the signing configuration remains unchanged, and all 23 application entries match the approved input. Only the already-pinned official .pages.info addition is present. No candidate rebuild, new signing identity, raw signer argument/output retention, material upload or private-key content inspection occurred.

The first official module load stopped on sandbox realpath EPERM before an attempt marker or signer output existed. After verifying that absence, the unchanged command passed on the host. The successful attempt and output are retained; do not repeat signing. scripts/phase65-install.mjs is prepared to verify these exact artifacts and the original phone before one install -r, recording its attempt before invoking HDC. An unknown installation result must be reconciled rather than retried.

Installation was not attempted. Five read-only host connection checks did not recover the original HDC target; the three remaining automatic checks were thirty seconds apart. The retry budget is now stopped. Windows independently sees the original serial-hash-matched Huawei USB device and its HDC interface, all with status OK. No hdc.exe process exists and the original 127.0.0.1:8710 endpoint has no listener. This establishes an absent local bridge, not a physical phone disconnection. No HDC service, USB mode, driver, firewall or device setting was changed. The phone application's current PID, installed contents and HUKS state could not be reobserved through HDC.

The original desktop public fingerprint remains ${desktop.identities[0].fingerprint}. The protected record was inspected without opening the private identity. There are zero device grants, no grant timer and zero owned field processes. The original relay config and code still match their saved values, with no temporary pair, public trust or service override. No relay activation occurred. The old public phone reply is preserved at its original hash, is expired and was not replayed. Real model calls and user-project operations remain zero; no new field run, challenge or grant was started.

After the stopped connection attempt is explicitly resumed, restore the original official local HDC bridge and recheck the unique original target, CMM-AL10 model, API26 and installed bundle. Reuse this signed artifact for the authorized in-place installation; preserve application data and the original HUKS identity. The current alpha.4 field profile still needs a build and smoke test before live qualification. Then issue a fresh challenge, verify both identities and the exact fixed Session, and create only the approved grant with at most thirty minutes from actual creation, without renewal. Native signing, desktop proof verification, phone-to-desktop execution, ArkWeb rich interaction and teardown acceptance remain pending.

Rollback preserves the previous signed/unsigned HAPs, phase63 source preimages, original identities and old proof. The previous confirmed installed artifact is the phase59 signed HAP; its bytes are unchanged. No claim is made that current phone state was read successfully. No commit, push, uninstall or data clear occurred.

Evidence: [authorization](../evidence/phase65-authorization.json), [signing and official verification](../evidence/phase65-signed-build.json), [retry budget](../evidence/phase65-phone-retry-budget.json), [USB inspection](../evidence/phase65-usb-inspection.json), [host processes](../evidence/phase65-host-processes.json), [desktop grant state](../evidence/phase65-desktop-identity.json), [relay verification](../evidence/phase65-relay-unchanged.json), and [complete summary](../evidence/phase65-summary.json). The phase64 compiler diagnosis and its passing build evidence remain unchanged.
`, { flag: 'wx' })
for (const [path, note] of [
  ['README.md', 'Current alpha.4 status: [phase65](docs/phase65-approved-signed-hdc-blocked.md). Exact candidate signing and official verification passed; installation is authorized but unattempted because the original local HDC helper is absent after five checks.'],
  ['docs/acceptance.md', 'Current qualification: [phase65 signed candidate and HDC blocker](phase65-approved-signed-hdc-blocked.md). Signature verification passed; no installation, live grant or native end-to-end acceptance occurred.'],
  ['docs/tasks.md', 'Current task: [phase65](phase65-approved-signed-hdc-blocked.md). Original-material signing is complete. The authorized in-place install awaits resumption and restoration of the original HDC bridge; five connection checks are exhausted. Do not re-sign.'],
  ['desktop-plugin/README.md', 'Current source and candidate status: [phase65](../docs/phase65-approved-signed-hdc-blocked.md). Signed alpha.4 HAP verified; the original HDC bridge is absent and current alpha.4 live field-profile qualification remains pending.'],
]) {
  const old = await readFile(path, 'utf8'), split = old.indexOf('\n\n')
  assert.ok(split >= 0 && old.slice(0, split).includes('phase64'), 'Owned prior status paragraph missing: ' + path)
  await writeFile(path, note + old.slice(split))
}
console.log(JSON.stringify({ summary: 'evidence/phase65-summary.json', signed: true, installed: false, blocker: summary.blocker.kind, grantCount: 0, ownedFieldProcesses: 0, retryBudgetExhausted: true }))

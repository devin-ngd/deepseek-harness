/** Reconcile the completed install and offline results for handoff without starting an enrollment or another device operation. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const installed = await json('evidence/phase65-installation.json'), launch = await json('evidence/phase66-launch-probe.json')
const hdc = await json('evidence/phase66-host-processes.json'), start = await json('evidence/phase66-hdc-start-result.json')
const portable = await json('evidence/phase66-detached-profile.json'), restart = await json('evidence/phase66-field-restart.json'), strict = await json('evidence/phase66-profile-typecheck.json')
const marker = await json('.build/phase54-active.json'), identity = await json(marker.home + '/phone-public.json'), layout = await json('evidence/phase66-layout-public-identity.json')
assert.equal(installed.success, true); assert.equal(hash(await readFile(installed.artifact.path)), installed.artifact.sha256)
assert.equal(start.hostExitCode, 0); assert.equal(start.explicitAccessRefused, false)
assert.equal(hdc.hdcProcessCount, 1); assert.ok(hdc.originalLoopback8710Listeners.some(value => value.address === '127.0.0.1'))
assert.equal(portable.result.replayCalls, 4); assert.equal(portable.result.realModels, 0)
assert.equal(restart.passed, true); assert.equal(restart.results.length, 8); assert.equal(strict.passed, true)
assert.ok(layout.nodes.some(value => value.publicJsonSha256 === hash(JSON.stringify(identity))))
assert.equal(identity.credentialId, 'p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99')
const report = { at: new Date().toISOString(), state: 'installed-original-identity-preserved-preparing-fresh-enrollment', startup: { command: start.args, officialStartExecutions: 1, explicitAccessRefused: false, actualListenerConfirmedAt: hdc.at, devenvoLifecycleCauseEstablished: false }, installation: installed, native: { pid: launch.currentPid, originalHuksPublicRecordMatched: true, fingerprint: identity.credentialId, publicIdentityObservedAt: layout.observedAt, identityCreated: false }, offline: { fourResponseReplayPassed: true, coldRecoveryCasesPassed: 8, strictProfileModulesPassed: strict.sourceModules, strictAt: strict.at, realModels: 0 }, currentWork: ['Update the original fixed-world assets acknowledgement for the sole remoteAccess registration delta, retaining its original manifest and immutable Session files.', 'The source now puts replies in the current exchange directory; rebuild and revalidate this change before the live run. The previous expired reply remains untouched.', 'Issue a fresh challenge only after those checks, using the original identities and at most thirty minutes from actual grant creation.'], live: { newGrantCreated: false, timerStarted: false, realModels: 0, userProjectOperations: 0, newFieldProcessStarted: false, inFlightStartupOrInstallation: false }, ownership: { phonePidFile: '.build/phase66-device-process.json', sdkHdcNowSharedWithOpenedIde: true, oldProofPreserved: true, installedDshDesktopChanged: false }, finalNativeEndToEndPassed: false }
await writeFile('evidence/phase66-progress.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
await writeFile('docs/phase66-progress.md', `# alpha.4 installed candidate and current field preparation

The official SDK HDC start ran once at ${start.startedAt}, exited zero without an access refusal, and its original loopback listener was confirmed at ${hdc.at}. The original CMM-AL10/API26 phone was then reidentified. DevEco Studio lifecycle causality is unconfirmed; no further HDC start or restart is required.

The phase65 signed HAP was installed once in place at ${installed.completedAt}. Its SHA-256 remains ${installed.artifact.sha256}. No signing, uninstall, data clear or permission expansion was repeated. The app launched once as owned PID ${launch.currentPid}; its public HUKS record exactly matches the original saved identity. Private key bytes were neither exported nor recreated.

The alpha.4 runtime build has 1101 source inputs and passed the detached four-response journey, eight two-process recovery cases, and strict checking of seven profile modules. Sandbox realpath failures are retained; both runtime test commands passed unchanged on the host. The recovery fixture no longer requires a public JSONL implementation class: its source-only fault injection uses the existing provider-local batch interface and has passed all eight scenarios.

Current preparation has not opened a real field profile or created a grant. The original fixed-world owner digest differs only because the alpha.4 composition registers remoteAccess; the replay fixture is identical. The old world manifest has not yet been changed. A subsequent source edit selects the new exchange directory for the phone reply, preserving the old expired proof; this edit still needs a rebuild and revalidation before live execution. There is no in-flight startup or installation to repeat. The app's owned PID record is .build/phase66-device-process.json; HDC may now be shared with the reopened IDE.

The next work is a validated, reversible owner-digest acknowledgement, rebuilding the reply-file edit, and a fresh challenge with the original identities. Real model calls and user-project operations remain zero. Grant lifetime has not started and remains capped at thirty minutes from actual creation, without renewal. True phone/desktop/ArkWeb acceptance remains pending.

Evidence: [current state](../evidence/phase66-progress.json), [installation](../evidence/phase65-installation.json), [HDC normal start](../evidence/phase66-hdc-start-result.json), [original public identity UI](../evidence/phase66-layout-public-identity.json), [detached journey](../evidence/phase66-detached-profile.json), [recovery cases](../evidence/phase66-field-restart.json), [strict check](../evidence/phase66-profile-typecheck.json), and [owner asset comparison](../evidence/phase66-existing-world-assets.json).
`, { flag: 'wx' })
for (const [path, note] of [['README.md', 'Current status: [phase66 installed candidate and field preparation](docs/phase66-progress.md). HDC recovered, the signed HAP installed in place, and the original HUKS public key matched; fresh real enrollment has not started.'], ['docs/acceptance.md', 'Current evidence: [phase66](phase66-progress.md). In-place installation and original HUKS public-key comparison passed; true phone/desktop/ArkWeb acceptance remains pending.'], ['docs/tasks.md', 'Current work: [phase66](phase66-progress.md). Preserve the completed installation; finish the fixed-world owner acknowledgement and fresh reply-directory rebuild, then perform the approved fresh enrollment and bounded replay.'], ['desktop-plugin/README.md', 'Current alpha.4 status: [phase66](../docs/phase66-progress.md). Detached runtime and eight recovery cases pass; original-world acknowledgement and fresh live enrollment remain pending.']]) {
  const old = await readFile(path, 'utf8'), split = old.indexOf('\n\n')
  assert.ok(split >= 0 && old.slice(0, split).includes('phase65'))
  await writeFile(path, note + old.slice(split))
}
console.log(JSON.stringify({ installed: true, originalHuksMatched: true, nativePid: launch.currentPid, offlineRecoveryCases: 8, realGrantStarted: false, summary: 'evidence/phase66-progress.json' }))

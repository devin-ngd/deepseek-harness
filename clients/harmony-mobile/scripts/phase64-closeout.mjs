/** Record the isolated compiler diagnosis and completed checks without changing the frozen native candidate. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const project = resolve(import.meta.dirname, '..')
const evidence = join(project, 'evidence')
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const original = await readJson(join(evidence, 'phase63-summary.json'))
const minimal = await readJson(join(evidence, 'phase64-rolldown-repro.json'))
const preset = await readJson(join(evidence, 'phase64-preset-repro.json'))
assert.deepEqual(minimal.cases.map(value => value.success), [true, false, false, true])
assert.equal(minimal.magicStringClassesIdentical, false)
assert.deepEqual(minimal.versions.primary, minimal.versions.isolated)
assert.deepEqual(preset.cases.map(value => value.success), [false, true])
assert.equal(preset.unchangedFromBase, true)
assert.equal(preset.primaryMatchesIsolatedPreset, true)
const candidateHash = hash(await readFile(original.candidate.path))
assert.equal(candidateHash, original.candidate.sha256)
assert.equal(candidateHash, minimal.candidateSha256Unchanged)
assert.equal(candidateHash, preset.candidateSha256Unchanged)
assert.equal(hash(await readFile(join(evidence, 'phase63-upstream.patch'))), original.upstreamPatch.sha256)

const checks = [
  { id: 'client', source: 'phase64-client-local-cli', command: 'node node_modules/tsdown/dist/run.mjs --config-loader native --env.DSH_BUILD_FACE client', cwd: original.sourceCheckout },
  { id: 'web', source: 'phase64-web-package-cli', command: 'node node_modules/vite/bin/vite.js build', cwd: original.sourceCheckout + '/apps/web' },
  { id: 'aggregate', source: 'phase64-build-check', command: 'node node_modules/tsx/dist/cli.mjs scripts/build.ts --scope check', cwd: original.sourceCheckout },
]
for (const check of checks) {
  const status = await readJson(join(project, '.build', check.source + '.status.json'))
  assert.equal(status.exitCode, 0, check.id)
  const log = await readFile(join(project, '.build', check.source + '.log'), 'utf8')
  if (check.id === 'client') assert.match(log, /Build complete/)
  if (check.id === 'web') { assert.match(log, /vite v6\.4\.3/); assert.match(log, /built in/); }
  if (check.id === 'aggregate') assert.match(log, /2 passed, 0 failed, 0 skipped/)
  check.exitCode = status.exitCode
  check.outputAt = (await stat(join(project, '.build', check.source + '.log'))).mtime.toISOString()
  check.log = check.source + '.log'
}
for (const check of checks) await copyFile(join(project, '.build', check.log), join(evidence, check.log), constants.COPYFILE_EXCL)
const summary = {
  schema: 'harmony-build-diagnosis/1', at: new Date().toISOString(),
  state: 'diagnosed-and-builds-validated-awaiting-candidate-approval',
  sourceCheckout: original.sourceCheckout, sourceBase: original.sourceBase,
  observedPrimaryCommit: '4a2497dffdc62549449d5ee03c6f7195293e3901',
  diagnosis: 'Primary tsdown CLI loaded the isolated preset. Its isolated RolldownMagicString belongs to a different native class instance and is interpreted as a transform result without code.',
  introducedBy: 'This task mixed the primary compiler installation with an isolated dependency installation to work around absent isolated bin shims.',
  preexistingProductDefectEstablished: false, productionSourceFixRequired: false,
  productionSourceChangedThisPhase: false, dependencyVersionsChangedThisPhase: false,
  versions: minimal.versions, node: minimal.node,
  reproduction: { virtualCases: 4, virtualPassed: 2, virtualExpectedFailures: 2, actualUnchangedPresetCases: 2, actualPresetSha256: preset.unchangedPresetSha256, compilerInstanceHandling: 'phase64-rolldown-instance-check.json' },
  fix: 'Invoke each package compiler through its own dependency installation. Do not add the primary node_modules/.bin to the isolated build PATH.',
  checks,
  retainedFailures: ['phase64-original-client-error.log', 'phase64-web-root-vite-error.log', 'phase64-web-sandbox-realpath-error.log', 'phase64-build-check-sandbox-error.log', 'phase64-sandbox-resolution-probe.log'],
  webInitialAttempt: { selectedRootVite: '8.2.2', requiredPackageVite: '6.4.3', error: 'this.getWatchFiles is not a function', resolvedBySelectingDeclaredPackageTool: true },
  sandboxRetry: { webError: 'EPERM realpath apps/web/src/main.ts', aggregateError: 'Realpath EPERM for Vitest declarations and linked workspace sources; the sandbox aggregate reported type errors.', unchangedWebAndAggregateCommandsPassedOnHost: true },
  frozenCandidate: { path: original.candidate.path, bytes: original.candidate.bytes, sha256: candidateHash, changed: false, rebuilt: false, signed: false, installed: false },
  candidateEffect: 'No HAP bytes or native build inputs changed. The candidate uses esbuild and official Hvigor, not the workspace Rolldown Client bundler. These checks do not qualify device execution.',
  phase63SourcePatchUnchanged: original.upstreamPatch,
  remaining: ['Isolated pnpm bin shims are incomplete; explicit local CLI paths were validated, not a repaired pnpm shim installation.', 'No single new root build:artifacts invocation is claimed; the formerly failing Client and skipped Web stages passed separately, followed by build:check.', 'Original signing-material and same-bundle in-place installation approval for the exact candidate is pending.', 'Current alpha.4 live profile, real phone pairing, ArkWeb rich interaction and actual desktop replay execution remain unvalidated.'],
  realModels: 0, realGrantCreated: false, relayActivated: false, installedDesktopChanged: false,
  keysReadOrCreated: false, signingOrInstallationAttempted: false,
  requiredChecksRunning: false,
}
await writeFile(join(evidence, 'phase64-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
await writeFile(join(project, 'docs/phase64-compiler-instance-diagnosis.md'), `# Client compiler instance diagnosis

The workspace Client failure is caused by mixing compiler installations during this task. The primary tsdown CLI executed a preset imported from the isolated checkout. Both installations contain tsdown 0.22.2 and Rolldown 1.1.1, with identical CLI bytes, but each loads a different native RolldownMagicString class. A changed chunk returned by the isolated preset is treated by the primary engine as a plain transform result and fails with Missing field code.

The unmodified packages/client/tsdown.client.ts preset has SHA-256 ${preset.unchangedPresetSha256}, matching both the isolated base commit and the current primary source. A two-module dynamic-import fixture using that exact preset fails with the primary engine and passes with the isolated engine. No application source is needed to reproduce the error. A separate virtual-module matrix gives the same result:

| Engine installation | MagicString installation | Observed result |
| --- | --- | --- |
| Primary | Primary | Pass |
| Primary | Isolated | Missing field code |
| Isolated | Primary | Missing field code |
| Isolated | Isolated | Pass |

The correction is to execute the isolated checkout's own CLI, without putting the primary node_modules/.bin on its build PATH. No product source or dependency version changed in this phase. The isolated pnpm bin shims remain incomplete; explicit local CLI invocation is the verified procedure.

The full Client bundler passed with node node_modules/tsdown/dist/run.mjs --config-loader native --env.DSH_BUILD_FACE client from the isolated checkout. Web bundling passed with node node_modules/vite/bin/vite.js build from apps/web, using its declared Vite 6.4.3. The first supplemental Web attempt mistakenly selected root Vite 8.2.2 and failed on getWatchFiles; that log is retained. The corrected package command initially hit sandbox realpath EPERM and passed unchanged with host escalation. The final node node_modules/tsx/dist/cli.mjs scripts/build.ts --scope check passed both aggregates after the new artifact stages. Its first sandbox attempt reported type errors; a minimal filesystem probe confirmed realpath EPERM for Vitest declarations and linked workspace source files, and the unchanged command passed on the host. These are separate stage results; no new single root build:artifacts invocation is claimed.

The unsigned candidate remains ${original.candidate.path}, ${original.candidate.bytes} bytes, SHA-256 ${candidateHash}. It was neither rebuilt nor signed or installed. Its native pipeline uses esbuild and official DevEco/Hvigor, so this workspace Rolldown failure does not alter its bytes or establish a native defect. Original key material, HUKS/DPAPI identity, grants, relay and installed desktop were not touched.

The phase63 source patch and original failure records remain unchanged. Approval for original-material signing and same-bundle in-place installation of this exact candidate is still pending. Real alpha.4 desktop profile execution, phone pairing, ArkWeb interaction and the final phone-to-desktop acceptance flow still require their own evidence. Passing Web and Node checks cannot establish those results.

Evidence: [summary](../evidence/phase64-summary.json), [virtual reproduction](../evidence/phase64-rolldown-repro.json), [actual unchanged preset](../evidence/phase64-preset-repro.json), [compiler instance handling](../evidence/phase64-rolldown-instance-check.json), [original failure](../evidence/phase64-original-client-error.log), [Client output](../evidence/phase64-client-local-cli.log), [Web output](../evidence/phase64-web-package-cli.log), and [final aggregate check](../evidence/phase64-build-check.log). The diagnostic scripts are local to this lab; the isolated checkout and frozen candidate remain the rollback points recorded in phase63.
`, { flag: 'wx' })
for (const [path, note] of [
  ['README.md', 'Current build diagnosis: [phase64](docs/phase64-compiler-instance-diagnosis.md). Client and Web stages plus the final aggregate check pass using each package\'s own compiler. The [phase63 unsigned candidate](docs/phase63-alpha4-candidate.md) is unchanged and awaits approval.'],
  ['docs/acceptance.md', 'Current build evidence: [phase64](phase64-compiler-instance-diagnosis.md). Client, Web and final aggregate checks pass; the [phase63 candidate](phase63-alpha4-candidate.md) remains unsigned and uninstalled. Real phone/desktop acceptance is pending.'],
  ['docs/tasks.md', 'Current task: [phase64 compiler diagnosis completed](phase64-compiler-instance-diagnosis.md). Await approval for exact phase63 original-material signing and same-bundle in-place installation, then qualify the new alpha.4 live flow.'],
  ['desktop-plugin/README.md', 'Current alpha.4 source and unsigned candidate: [phase63](../docs/phase63-alpha4-candidate.md). The [phase64 diagnosis](../docs/phase64-compiler-instance-diagnosis.md) resolves the Client bundler environment issue; live desktop/profile qualification remains pending.'],
]) {
  const target = join(project, path), old = await readFile(target, 'utf8'), split = old.indexOf('\n\n')
  assert.ok(split >= 0 && old.slice(0, split).includes('phase63'), 'Owned status paragraph missing: ' + path)
  await writeFile(target, note + old.slice(split))
}
console.log(JSON.stringify({ summary: join(evidence, 'phase64-summary.json'), checks: checks.map(value => ({ id: value.id, exitCode: value.exitCode })), candidateUnchanged: true, signed: false, installed: false }))

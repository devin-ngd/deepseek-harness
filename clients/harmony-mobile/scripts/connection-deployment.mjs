/** Sign, verify, install and inspect the exact reviewed connection candidate. Default action is read-only. */
import { randomBytes } from 'node:crypto'
import { createRequire, Module } from 'node:module'
import { access, lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  ATTEMPT_FILE, ATTEMPT_SCHEMA, AUTHORIZATION, CANDIDATE, COMMANDS, EVIDENCE_DIRECTORY, PHONE, PREVIOUS, SIGNING,
  assertAttempt, assertCandidateArtifact, assertCertificateChain, assertDeviceObservation, assertHdcInvocation,
  assertInspectGuard, assertInstalledMetadata, assertInstallGuard, assertLaunchGuard, assertLaunchLayout, assertOwnedLayout,
  assertPayload, assertPreflightGuard, assertPublicIdentity, assertSignGuard, assertUiGuard, assertVerifyExistingGuard,
  assessLayout, controlPoint, findSingleControl, identityCandidates, identityFromNodes, installedMetadata, nextCommands, nextRunLabel,
  parseBundleDump, sanitizeOutput, sha256, targetReference,
} from './connection-deployment-lib.mjs'
import { claimAction, claimedActions as claimsFor } from './connection-deployment-claim.mjs'
import { verifyCandidateEvidence } from './connection-candidate.mjs'

const project = resolve(import.meta.dirname, '..')
let stage = 'arguments'
let currentAttempt = null

if (import.meta.main) {
  await main().catch(async error => {
    const failure = await writeFailure(error)
    const suffix = failure === null ? '' : '; diagnostics=' + failure
    console.error('FAIL [' + stage + ']: ' + safeMessage(error) + suffix)
    process.exitCode = 1
  })
}

async function main() {
  const command = parseInvocation(process.argv.slice(2))
  if (command === 'plan') return plan()
  if (command === 'prepare') return prepare()
  if (command === 'preflight') return preflight()
  if (command === 'sign') return sign()
  if (command === 'verify-existing') return verifyExisting()
  if (command === 'install') return install()
  if (command === 'inspect') return inspect()
  if (command === 'launch') return launch()
  if (command === 'layout') return layout()
  if (command === 'input-alias') return inputAlias()
  if (command === 'existing-identity') return existingIdentity()
  if (command === 'read-identity') return readIdentity()
  if (command === 'capture') return capture()
  throw new Error('Unknown command: ' + command)
}

/** @param {string[]} argv - Arguments after the script name. @returns {string} One admitted command. */
function parseInvocation(argv) {
  if (argv.length === 0) return 'plan'
  if (argv.length > 1) throw new Error('Exactly one command is allowed; received extra arguments')
  if (!COMMANDS.includes(argv[0])) throw new Error('Unknown command: ' + argv[0])
  return argv[0]
}

async function plan() {
  stage = 'plan'
  const attempt = await readJson(attemptPath()).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const candidate = await candidateStatus()
  const paths = {
    signingProject: await exists(SIGNING.project),
    ide: await exists(SIGNING.ide),
    signingJar: await exists(join(SIGNING.ide, SIGNING.jarRelative)),
    hdc: await exists(PHONE.hdc),
  }
  const previous = []
  for (const item of [PREVIOUS.signed, PREVIOUS.predecessor]) previous.push({ path: item.path, present: await exists(item.path), recordedSha256: item.sha256 })
  const claimed = attempt === null ? new Set() : await claimedForAttempt(attempt.label)
  const sequence = attempt === null ? ['prepare', 'preflight', 'sign', 'install', 'inspect', 'launch', 'layout', 'input-alias', 'existing-identity', 'read-identity', 'capture'] : nextCommands(attempt, claimed)
  console.log(JSON.stringify({
    mode: 'plan', schema: ATTEMPT_SCHEMA, action: 'none', authorization: {
      source: AUTHORIZATION.source, choice: AUTHORIZATION.choice, sentinelApproval: null, fabricatedToken: false,
      note: 'Recorded from the current user selection; not a Sentinel approval and not a fake token. The director reviews before executing.',
    },
    candidate, paths, previous, attempt: attempt === null ? null : { label: attempt.label, steps: attempt.steps, signed: attempt.signed, install: attempt.install === null ? null : { success: attempt.install.success, status: attempt.steps.install.status }, inspect: attempt.inspect, launch: attempt.launch, actions: attempt.actions }, next: sequence, claimed: attempt === null ? [] : [...claimed],
    notExecuted: ['no file was written', 'no Java signer or verifier was started', 'no HDC command was sent', 'no install, launch or UI input occurred'],
    warnings: [candidate.matchesReviewed ? null : 'candidate artifact is unavailable or differs from the reviewed bytes', attempt === null ? 'no attempt exists; prepare creates the single fixed attempt' : null].filter(Boolean),
  }, null, 2))
}

/** @returns {Promise<object>} Read-only candidate availability and digest summary. */
async function candidateStatus() {
  try {
    const evidence = await readJson(join(project, CANDIDATE.evidence))
    const path = insideProject(evidence.hap?.path)
    const artifact = await hashFile(path)
    return { evidence: CANDIDATE.evidence, path: clientPath(relative(project, path)), bytes: artifact.bytes, sha256: artifact.sha256, matchesReviewed: artifact.bytes === CANDIDATE.bytes && artifact.sha256 === CANDIDATE.sha256 }
  } catch (error) { if (error.code === 'ENOENT') return { evidence: CANDIDATE.evidence, available: false, matchesReviewed: false }; throw error }
}

async function prepare() {
  stage = 'prepare'
  if (await exists(attemptPath())) throw new Error('An existing deployment attempt must be resumed or reviewed; it is never recreated')
  const platform = await readJson(join(project, 'harmony/platform.json'))
  const evidence = await readJson(join(project, CANDIDATE.evidence))
  stage = 'prepare-verify-candidate'
  const verified = await verifyCandidateEvidence(project, evidence, platform)
  const hapPath = insideProject(evidence.hap.path)
  const artifact = assertCandidateArtifact(await hashFile(hapPath))
  if (verified.hap.bytes !== artifact.bytes || verified.hap.sha256 !== artifact.sha256) throw new Error('verified candidate summary differs from the retained HAP')
  stage = 'prepare-signing-materials'
  let material
  try { material = await readSigningMaterial() } catch (error) { throw withCode(new Error('signing material is unusable: ' + category(error)), 'signing-material-unusable') }
  const materialHashes = { configuration: (await hashFile(material.configPath)).sha256, storeFile: (await hashFile(material.storeFile)).sha256, profile: (await hashFile(material.profile)).sha256, certificate: (await hashFile(material.certpath)).sha256 }
  const jar = join(SIGNING.ide, SIGNING.jarRelative)
  if ((await hashFile(jar)).sha256 !== SIGNING.jarSha256) throw new Error('official signing JAR hash differs from the recorded toolchain')
  if (!(await exists(PHONE.hdc))) throw new Error('the existing HDC binary is unavailable')
  stage = 'prepare-predecessors'
  const previous = await retainedPredecessors()
  stage = 'prepare-create-run'
  const label = nextRunLabel(new Date(), randomBytes(4).toString('hex'))
  const runDirectory = join(project, '.build', label)
  await createRunDirectory(runDirectory)
  const at = new Date().toISOString()
  const attempt = {
    schema: ATTEMPT_SCHEMA, label, createdAt: at,
    ownedRun: { label, directory: '.build/' + label },
    candidate: { evidence: CANDIDATE.evidence, label: CANDIDATE.label, path: clientPath(relative(project, hapPath)), bytes: artifact.bytes, sha256: artifact.sha256 },
    authorization: { source: AUTHORIZATION.source, choice: AUTHORIZATION.choice, recordedAt: at, sentinelApproval: null, fabricatedToken: false, note: AUTHORIZATION.note, scope: [...AUTHORIZATION.scope] },
    phone: { server: PHONE.server, targetRef: PHONE.targetRef, model: PHONE.model, api: PHONE.api, alias: PHONE.alias, fingerprint: PHONE.fingerprint, certificateChainSha256: PHONE.certificateChainSha256 },
    signing: { project: SIGNING.project, ide: SIGNING.ide, jarSha256: SIGNING.jarSha256, materialsReused: true, materialsRegenerated: false, privateKeyContentProjected: false, rawArgumentsProjected: false, materialHashes },
    previous,
    steps: { prepare: { status: 'completed', at }, preflight: { status: 'pending' }, sign: { status: 'pending' }, install: { status: 'pending' }, inspect: { status: 'pending' }, launch: { status: 'pending' } },
    signed: null, preflight: null, install: null, inspect: null, launch: null, identity: null,
    actions: { 'input-alias': { status: 'pending' }, 'existing-identity': { status: 'pending' } },
    sideEffects: { desktopFilesCopied: false, credentialsRead: false, privateKeyProjected: false, signing: false, installation: false, launch: false, connect: false, modelCalls: 0, relay: false },
  }
  await mkdir(join(project, EVIDENCE_DIRECTORY), { recursive: true })
  await writeExclusive(attemptPath(), attempt)
  currentAttempt = attempt
  console.log(JSON.stringify({
    mode: 'prepare', label, runDirectory: attempt.ownedRun.directory, attempt: ATTEMPT_FILE,
    candidate: { evidence: CANDIDATE.evidence, bytes: artifact.bytes, sha256: artifact.sha256 }, signing: { materialsReused: true, privateKeyContentProjected: false, rawArgumentsProjected: false, ...materialHashes },
    previous, next: 'node scripts/connection-deployment.mjs preflight', signerStarted: false, hdcStarted: false, writes: [ATTEMPT_FILE, attempt.ownedRun.directory], desktopFilesCopied: false, credentialsRead: false,
  }))
}

async function preflight() {
  stage = 'preflight'
  const attempt = await loadAttempt()
  assertPreflightGuard(attempt)
  try {
    const serial = await verifiedTarget(attempt)
    const metadata = await readInstalledMetadata(attempt, serial)
    assertInstalledMetadata(metadata)
    const pid = await safePid(attempt, serial)
    const at = new Date().toISOString()
    const evidence = evidencePath(attempt.label, 'preflight-' + Date.now())
    await writeExclusive(evidence, { schema: 'harmony-connection-deployment-preflight/1', label: attempt.label, at, targetReference: PHONE.targetRef, model: PHONE.model, api: PHONE.api, bundle: metadata, pidBefore: pid, candidate: attempt.candidate, boundary: 'Current installed metadata matches the retained bundle and version. The same version does not prove which artifact is installed; installation evidence is recorded separately.' })
    await updateAttempt(value => {
      value.steps.preflight = { status: 'completed', at }
      value.preflight = { passed: true, at, targetReference: PHONE.targetRef, model: PHONE.model, api: PHONE.api, bundle: metadata, pidBefore: pid, installedMetadataIsArtifactProof: false, evidence: clientPath(relative(project, evidence)) }
    })
    console.log(JSON.stringify({ mode: 'preflight', passed: true, targetReference: PHONE.targetRef, model: PHONE.model, api: PHONE.api, bundle: metadata, pidBefore: pid, candidate: attempt.candidate, evidence: clientPath(relative(project, evidence)), signingStarted: false, installationStarted: false }))
  } catch (error) {
    await updateAttempt(value => { value.steps.preflight = { status: 'failed', at: new Date().toISOString(), category: category(error) } })
    throw error
  }
}

async function sign() {
  stage = 'sign'
  const attempt = await loadAttempt()
  assertSignGuard(attempt)
  const runDirectory = join(project, attempt.ownedRun.directory)
  const signedPath = join(runDirectory, 'candidate-signed.hap')
  if (await exists(signedPath)) throw new Error('A signed output already exists; verify it instead of signing again')
  await claimNonReplayable('sign', attempt)
  await updateAttempt(value => { value.steps.sign = { status: 'started', at: new Date().toISOString() }; value.sideEffects.signing = true })
  try {
    const result = await signOnce({ attempt, runDirectory, signedPath })
    if (result.status !== 0) throw withCode(new Error('official signer exited ' + result.status), 'signer-exit')
    if (!(await exists(signedPath))) throw withCode(new Error('official signer produced no output'), 'signer-output-missing')
  } catch (error) {
    await updateAttempt(value => { value.steps.sign = { status: 'unknown', at: new Date().toISOString(), category: category(error), automaticRetry: false } })
    throw new Error('signing result is unknown; verify the retained output or inspect state, never re-sign')
  }
  let signed
  try {
    signed = await verifySigned({ attempt, signedPath, recovered: false })
  } catch (error) {
    await updateAttempt(value => { value.steps.sign = { status: 'completed', at: new Date().toISOString(), category: 'verification-failed', automaticRetry: false } })
    throw new Error('signed output failed verification; installation is refused')
  }
  await updateAttempt(value => {
    value.steps.sign = { status: 'completed', at: new Date().toISOString(), signedSha256: signed.artifact.sha256 }
    value.signed = { verified: true, path: signed.artifact.path, bytes: signed.artifact.bytes, sha256: signed.artifact.sha256 }
  })
  console.log(JSON.stringify({ mode: 'sign', signerExecutions: 1, signed, installationStarted: false }))
}

async function verifyExisting() {
  stage = 'verify-existing'
  const attempt = await loadAttempt()
  assertVerifyExistingGuard(attempt, await claimedForAttempt(attempt.label))
  const runDirectory = join(project, attempt.ownedRun.directory)
  const signedPath = join(runDirectory, 'candidate-signed.hap')
  if (!(await exists(signedPath))) throw new Error('No retained signed output exists to verify')
  const signed = await verifySigned({ attempt, signedPath, recovered: attempt.steps.sign.status !== 'completed' })
  await updateAttempt(value => {
    value.steps.sign = { ...value.steps.sign, status: value.steps.sign.status === 'completed' ? 'completed' : 'unknown', retainedOutputVerified: true, verifiedAt: new Date().toISOString() }
    value.signed = { verified: true, path: signed.artifact.path, bytes: signed.artifact.bytes, sha256: signed.artifact.sha256 }
  })
  console.log(JSON.stringify({ mode: 'verify-existing', signerExecutions: 1, reSigned: false, signed }))
}

async function install() {
  stage = 'install'
  const attempt = await loadAttempt()
  const retained = await loadSignedResult(attempt)
  assertInstallGuard(attempt, retained)
  const signed = await verifySigned({ attempt, signedPath: insideProject(retained.artifact.path), recovered: attempt.steps.sign.status !== 'completed' })
  assertInstallGuard(attempt, signed)
  stage = 'install'
  const serial = await verifiedTarget(attempt)
  const before = await readInstalledMetadata(attempt, serial)
  assertInstalledMetadata(before)
  const pidBefore = await safePid(attempt, serial)
  const artifactPath = insideProject(signed.artifact.path)
  const artifact = await hashFile(artifactPath)
  if (artifact.bytes !== signed.artifact.bytes || artifact.sha256 !== signed.artifact.sha256) throw new Error('retained signed HAP differs from its verified result')
  const runDirectory = join(project, attempt.ownedRun.directory)
  const args = [...base(serial), 'install', '-r', artifactPath.replaceAll('/', '\\')]
  assertHdcInvocation(args, { target: serial, artifactPath, runDirectory })
  await claimNonReplayable('install', attempt)
  const at = new Date().toISOString()
  await updateAttempt(value => {
    value.steps.install = { status: 'started', at }
    value.sideEffects.installation = true
    value.install = { startedAt: at, artifact: signed.artifact, targetReference: PHONE.targetRef, inPlace: true, uninstall: false, dataCleared: false, launch: false }
  })
  let result
  try {
    await writeExclusive(evidencePath(attempt.label, 'install-attempt-' + Date.now()), {
      schema: 'harmony-connection-deployment-install-attempt/1', label: attempt.label, at, authorization: attempt.authorization.source,
      artifact: signed.artifact, targetReference: PHONE.targetRef, priorMetadata: before, pidBefore,
      parameters: { inPlace: true, flag: '-r', exactCommand: ['hdc', '-p', '-s', PHONE.server, '-t', '[approved target]', 'install', '-r', clientPath(signed.artifact.path)] },
      unknownUntilCompletion: true, automaticRetry: false, uninstall: false, dataCleared: false,
    })
    result = spawnSync(PHONE.hdc, args, { windowsHide: true, encoding: 'utf8', timeout: 90000, maxBuffer: 4194304 })
  } catch (error) {
    await updateAttempt(value => { value.steps.install = { status: 'unknown', at: new Date().toISOString(), category: category(error), automaticRetry: false } })
    throw new Error('installation result is unknown; inspect the retained attempt, never replay it')
  }
  const success = result.status === 0 && /install bundle successfully/.test(result.stdout ?? '')
  const report = {
    schema: 'harmony-connection-deployment-installation/1', label: attempt.label, startedAt: at, completedAt: new Date().toISOString(),
    artifact: signed.artifact, targetReference: PHONE.targetRef, hostExitCode: result.status, signal: result.signal, processError: result.error?.code ?? null,
    success, output: sanitizeOutput((result.stdout ?? '') + (result.stderr ?? ''), { target: serial }),
    inPlace: true, uninstall: false, dataCleared: false, newPermissions: false, materialsRegenerated: false, launch: false, connect: false, realModels: 0, automaticRetry: false,
  }
  await writeExclusive(evidencePath(attempt.label, 'installation-' + Date.now()), report)
  await updateAttempt(value => {
    value.steps.install = { status: success ? 'completed' : 'unknown', at: report.completedAt, success, hostExitCode: result.status, automaticRetry: false }
    value.install = { ...value.install, completedAt: report.completedAt, success, hostExitCode: result.status }
  })
  if (!success) throw new Error('installation result is unknown or failed; inspect the retained attempt, never replay it')
  console.log(JSON.stringify({ mode: 'install', success, artifact: signed.artifact, hostExitCode: result.status, output: report.output, launch: false, connect: false }))
}

async function inspect() {
  stage = 'inspect'
  const attempt = await loadAttempt()
  assertInspectGuard(attempt, await claimedForAttempt(attempt.label))
  const serial = await verifiedTarget(attempt)
  const metadata = await readInstalledMetadata(attempt, serial)
  assertInstalledMetadata(metadata)
  const pid = await safePid(attempt, serial)
  const at = new Date().toISOString()
  const installKnown = attempt.steps.install.status === 'completed' && attempt.install?.success === true
  const report = {
    schema: 'harmony-connection-deployment-inspection/1', label: attempt.label, at, targetReference: PHONE.targetRef, metadata, pid,
    installKnown, installReceipt: { hostExitCode: attempt.install?.hostExitCode ?? null, success: attempt.install?.success ?? null },
    signedArtifact: attempt.signed, artifactProofBoundary: 'The installed version metadata alone cannot identify the artifact because the version is unchanged. The signed output digest, exact install -r parameters, success receipt and post-install metadata are recorded together; none of them alone proves the running bytes.',
  }
  const path = evidencePath(attempt.label, 'inspect-' + Date.now())
  await writeExclusive(path, report)
  await updateAttempt(value => {
    value.steps.inspect = { status: 'completed', at }
    value.inspect = { passed: true, at, installKnown, metadata, pid, path: clientPath(relative(project, path)) }
  })
  console.log(JSON.stringify({ mode: 'inspect', installKnown, metadata, pid, evidence: clientPath(relative(project, path)), launchAllowed: installKnown }))
}

async function launch() {
  stage = 'launch'
  const attempt = await loadAttempt()
  assertLaunchGuard(attempt)
  const serial = await verifiedTarget(attempt)
  const at = new Date().toISOString()
  try {
    await writeExclusive(evidencePath(attempt.label, 'launch-attempt'), { schema: 'harmony-connection-deployment-launch-attempt/1', label: attempt.label, at, bootBehavior: 'load and verify existing public trust only; connection remains disconnected', connectInvoked: false, identityCreated: false })
  } catch (error) {
    if (error.code === 'EEXIST') throw withCode(new Error('the launch claim already exists; it was started earlier or its process stopped, so inspect the device instead of replaying it'), 'claim-exists')
    throw error
  }
  await updateAttempt(value => { value.steps.launch = { status: 'started', at }; value.sideEffects.launch = true })
  let pid
  try {
    const output = await runHdc([...base(serial), 'shell', 'aa', 'start', '-b', CANDIDATE.bundleName, '-m', 'entry', '-a', 'EntryAbility'], { attempt, target: serial })
    if (/Error Code:|failed to start ability/i.test(output)) throw new Error('the application did not start')
    pid = await waitForPid(attempt, serial)
    const report = { schema: 'harmony-connection-deployment-launch/1', label: attempt.label, at, launched: true, pid, targetReference: PHONE.targetRef, connectInvoked: false, identityCreated: false, newGrant: false, forcedStop: false, automaticRetry: false }
    await writeExclusive(evidencePath(attempt.label, 'launch'), report)
  } catch (error) {
    await updateAttempt(value => { value.steps.launch = { status: 'unknown', at: new Date().toISOString(), category: category(error), automaticRetry: false } })
    throw new Error('launch result is unknown; inspect the device or run the read-only layout check, never replay the launch')
  }
  await updateAttempt(value => { value.steps.launch = { status: 'completed', at }; value.launch = { schema: 'harmony-connection-deployment-launch/1', label: attempt.label, at, launched: true, pid, targetReference: PHONE.targetRef, connectInvoked: false, identityCreated: false, newGrant: false, forcedStop: false, automaticRetry: false } })
  console.log(JSON.stringify({ mode: 'launch', launched: true, pid, connectInvoked: false, identityCreated: false, next: 'node scripts/connection-deployment.mjs layout' }))
}

async function layout() {
  stage = 'layout'
  const attempt = await loadAttempt()
  assertUiGuard(attempt, 'layout', await claimedForAttempt(attempt.label))
  const view = await dumpLayout(attempt)
  assertOwnedLayout(view.assessment)
  assertLaunchLayout(view.assessment, launchLabels(await labels()))
  const at = new Date().toISOString()
  const path = evidencePath(attempt.label, 'layout-' + Date.now())
  await writeExclusive(path, { schema: 'harmony-connection-deployment-layout/1', label: attempt.label, at, targetReference: PHONE.targetRef, owned: true, foreign: false, nodes: view.assessment.safe })
  console.log(JSON.stringify({ mode: 'layout', evidence: clientPath(relative(project, path)), owned: true, foreign: false, nodes: view.assessment.safe }))
}

/**
 * @returns {object} Default adapter for the one-shot UI actions; tests inject a synthetic adapter with the same methods.
 */
function defaultActionRuntime() {
  return {
    loadAttempt,
    readLabels: labels,
    dumpLayout,
    claim: (action, attempt) => claimNonReplayable(action, attempt),
    recordAction: (attempt, action, status, extra = {}) => updateAttempt(value => { value.actions[action] = { status, ...extra } }),
    writeActionEvidence: (attempt, action, value) => writeExclusive(evidencePath(attempt.label, action), value),
    inputText: (attempt, serial, point, alias) => runHdc([...base(serial), 'shell', 'uitest', 'uiInput', 'inputText', point[0], point[1], alias], { attempt, target: serial }),
    click: (attempt, serial, point) => runHdc([...base(serial), 'shell', 'uitest', 'uiInput', 'click', point[0], point[1]], { attempt, target: serial }),
    now: () => new Date().toISOString(),
  }
}

/**
 * Claim and start a UI input immediately before it can touch the device; a failure leaves an unknown result.
 * @param {object} runtime - Action adapter.
 * @param {object} attempt - Fixed attempt journal.
 * @param {string} action - `input-alias` or `existing-identity`.
 * @param {() => Promise<void>} apply - One HDC input action.
 * @returns {Promise<void>} Resolves after the single input action.
 */
async function runOneShotUiInput(runtime, attempt, action, apply) {
  await runtime.claim(action, attempt)
  try {
    await runtime.recordAction(attempt, action, 'started')
    await apply()
  } catch (error) {
    await runtime.recordAction(attempt, action, 'unknown', { at: runtime.now(), category: category(error), automaticRetry: false })
    throw new Error(action + ' result is unknown; inspect the device layout and retained evidence, never repeat the input')
  }
}

/**
 * Fill the identity name input only when it is empty; the original alias is the only accepted value.
 * @param {object} [runtime] - Action adapter; the default uses the real attempt, evidence and HDC paths.
 * @returns {Promise<void>} Resolves after the action evidence is recorded.
 */
export async function inputAlias(runtime = defaultActionRuntime()) {
  stage = 'input-alias'
  const attempt = await runtime.loadAttempt()
  assertUiGuard(attempt, 'input-alias')
  const publicLabels = await runtime.readLabels()
  const view = await runtime.dumpLayout(attempt)
  assertOwnedLayout(view.assessment)
  assertLaunchLayout(view.assessment, launchLabels(publicLabels))
  const input = findSingleControl(view.assessment.nodes, node => node.type === 'TextInput' && node.hint === publicLabels.get('product_identity_name'), 'identity name input')
  if (input.text !== '' && input.text !== PHONE.alias) throw new Error('identity name input contains a different alias')
  if (input.text === '') await runOneShotUiInput(runtime, attempt, 'input-alias', () => runtime.inputText(attempt, view.serial, controlPoint(input.bounds), PHONE.alias))
  const at = runtime.now()
  await runtime.writeActionEvidence(attempt, 'input-alias', { schema: 'harmony-connection-deployment-input-alias/1', label: attempt.label, at, alias: PHONE.alias, identityCreated: false, connectInvoked: false })
  await runtime.recordAction(attempt, 'input-alias', 'completed', { at })
  console.log(JSON.stringify({ mode: 'input-alias', originalAliasEntered: true, identityCreated: false, connectInvoked: false }))
}

/**
 * Click the existing-public-identity control once, only when the original alias is already entered.
 * @param {object} [runtime] - Action adapter; the default uses the real attempt, evidence and HDC paths.
 * @returns {Promise<void>} Resolves after the action evidence is recorded.
 */
export async function existingIdentity(runtime = defaultActionRuntime()) {
  stage = 'existing-identity'
  const attempt = await runtime.loadAttempt()
  assertUiGuard(attempt, 'existing-identity')
  const publicLabels = await runtime.readLabels()
  const view = await runtime.dumpLayout(attempt)
  assertOwnedLayout(view.assessment)
  assertLaunchLayout(view.assessment, launchLabels(publicLabels))
  const input = findSingleControl(view.assessment.nodes, node => node.type === 'TextInput' && node.hint === publicLabels.get('product_identity_name'), 'identity name input')
  if (input.text !== PHONE.alias) throw new Error('the original alias is not entered; run input-alias first')
  const button = findSingleControl(view.assessment.nodes, node => node.type === 'Button' && node.text === publicLabels.get('product_identity_existing'), 'existing public identity button')
  await runOneShotUiInput(runtime, attempt, 'existing-identity', () => runtime.click(attempt, view.serial, controlPoint(button.bounds)))
  const at = runtime.now()
  await runtime.writeActionEvidence(attempt, 'existing-identity', { schema: 'harmony-connection-deployment-existing-identity/1', label: attempt.label, at, existingPublicIdentityRequested: true, identityCreated: false, connectInvoked: false })
  await runtime.recordAction(attempt, 'existing-identity', 'completed', { at })
  console.log(JSON.stringify({ mode: 'existing-identity', existingPublicIdentityRequested: true, identityCreated: false, next: 'node scripts/connection-deployment.mjs read-identity' }))
}

async function readIdentity() {
  stage = 'read-identity'
  const attempt = await loadAttempt()
  assertUiGuard(attempt, 'read-identity')
  let identity = null
  for (let index = 0; index < 20 && identity === null; index++) {
    const view = await dumpLayout(attempt)
    assertOwnedLayout(view.assessment)
    assertLaunchLayout(view.assessment, launchLabels(await labels()))
    const found = identityCandidates(view.assessment.nodes, PHONE.alias)
    if (found.length === 0) { await delay(1000); continue }
    identity = found.length === 1 ? found[0] : identityFromNodes(view.assessment.nodes, PHONE.alias)
  }
  if (identity === null) throw new Error('the existing public identity is not visible; hidden output requires manual review, not a blind action')
  const checked = assertPublicIdentity(identity, { alias: PHONE.alias, fingerprint: PHONE.fingerprint })
  const at = new Date().toISOString()
  const path = evidencePath(attempt.label, 'public-identity')
  if (await exists(path)) {
    const previous = await readJson(path)
    if (JSON.stringify(previous.identity) !== JSON.stringify(checked)) throw new Error('re-read public identity differs from the retained result')
  } else {
    await writeExclusive(path, { schema: 'harmony-connection-deployment-public-identity/1', label: attempt.label, at, identity: checked, identityCreated: false, privateBytesRead: false })
  }
  await updateAttempt(value => { value.identity = { alias: checked.identityAlias, credentialId: checked.credentialId, at, identityCreated: false } })
  console.log(JSON.stringify({ mode: 'read-identity', identity: checked, identityCreated: false, privateBytesRead: false, evidence: clientPath(relative(project, path)) }))
}

async function capture() {
  stage = 'capture'
  const attempt = await loadAttempt()
  assertUiGuard(attempt, 'capture')
  const view = await dumpLayout(attempt)
  assertOwnedLayout(view.assessment)
  assertLaunchLayout(view.assessment, launchLabels(await labels()))
  const sequence = Date.now(), remote = '/data/local/tmp/connection-deployment-capture-' + sequence + '.jpeg', local = join(project, attempt.ownedRun.directory, 'phone-' + sequence + '.jpeg')
  await runHdc([...base(view.serial), 'shell', 'snapshot_display', '-f', remote], { attempt, target: view.serial })
  await runHdc([...base(view.serial), 'file', 'recv', remote, local], { attempt, target: view.serial, runDirectory: join(project, attempt.ownedRun.directory) })
  const bytes = await readFile(local)
  if (bytes.length <= 1000) throw new Error('captured image is too small to be evidence')
  const at = new Date().toISOString()
  const report = { schema: 'harmony-connection-deployment-capture/1', label: attempt.label, at, path: clientPath(relative(project, local)), bytes: bytes.length, sha256: sha256(bytes), targetReference: PHONE.targetRef, owned: true, foreign: false }
  await writeExclusive(evidencePath(attempt.label, 'capture-' + sequence), report)
  console.log(JSON.stringify({ mode: 'capture', ...report }))
}

/** @param {object} attempt - Fixed attempt journal. @returns {Promise<{serial: string, assessment: object, path: string}>} Owned layout. */
async function dumpLayout(attempt) {
  const serial = await verifiedTarget(attempt)
  const sequence = Date.now(), remote = '/data/local/tmp/connection-deployment-layout-' + sequence + '.json', local = join(project, attempt.ownedRun.directory, 'layout-' + sequence + '.json')
  const output = await runHdc([...base(serial), 'shell', 'uitest', 'dumpLayout', '-b', CANDIDATE.bundleName, '-m', 'false', '-p', remote], { attempt, target: serial, runDirectory: join(project, attempt.ownedRun.directory) })
  if (!output.trim().startsWith('DumpLayout saved to:' + remote)) throw new Error('layout dump did not report the owned temporary path')
  await runHdc([...base(serial), 'file', 'recv', remote, local], { attempt, target: serial, runDirectory: join(project, attempt.ownedRun.directory) })
  return { serial, assessment: assessLayout(await readJson(local), { bundle: CANDIDATE.bundleName }), path: local }
}

/** @param {object} attempt - Fixed attempt journal. @returns {Promise<string>} Verified original-phone serial. */
async function verifiedTarget(attempt) {
  const rows = (await runHdc([...server(), 'list', 'targets'], { attempt })).trim().split(/\r?\n/).filter(row => row && row !== '[Empty]')
  if (rows.length !== 1) throw new Error('exactly one HDC target is required; observed ' + rows.length)
  const serial = rows[0]
  if (targetReference(serial) !== PHONE.targetRef) throw new Error('observed HDC target is not the approved original phone')
  const model = (await runHdc([...base(serial), 'shell', 'param', 'get', 'const.product.model'], { attempt, target: serial })).trim()
  const api = (await runHdc([...base(serial), 'shell', 'param', 'get', 'const.ohos.apiversion'], { attempt, target: serial })).trim()
  return assertDeviceObservation({ targets: rows, model, api }).serial
}

/** @param {object} attempt - Fixed attempt journal. @param {string} serial - Verified serial. @returns {Promise<object>} Normalized installed metadata. */
async function readInstalledMetadata(attempt, serial) {
  return installedMetadata(parseBundleDump(await runHdc([...base(serial), 'shell', 'bm', 'dump', '-n', CANDIDATE.bundleName], { attempt, target: serial })))
}

/** @param {object} attempt - Fixed attempt journal. @param {string} serial - Verified serial. @returns {Promise<string>} Current pid or an empty string. */
async function safePid(attempt, serial) {
  const result = await spawnHdc([...base(serial), 'shell', 'pidof', CANDIDATE.bundleName], { attempt, target: serial })
  return result.status === 0 ? (result.stdout ?? '').trim() : ''
}

/** @param {object} attempt - Fixed attempt journal. @param {string} serial - Verified serial. @returns {Promise<string>} Pid after the application reports one. */
async function waitForPid(attempt, serial) {
  for (let index = 0; index < 20; index++) {
    const pid = await safePid(attempt, serial)
    if (/^[0-9]+$/.test(pid)) return pid
    await delay(500)
  }
  throw new Error('the application did not report a process id after launch')
}

/**
 * @param {object} options - Signing inputs.
 * @param {object} options.attempt - Fixed attempt journal.
 * @param {string} options.runDirectory - Owned run directory.
 * @param {string} options.signedPath - New signed output path.
 * @returns {Promise<object>} Child result; arguments and passwords are never recorded.
 */
async function signOnce({ attempt, runDirectory, signedPath }) {
  const material = await readSigningMaterial()
  const { jar } = await assertPinnedSigningInputs({ attempt, material })
  const java = join(SIGNING.ide, 'jbr/bin/java.exe')
  const sdkHome = join(runDirectory, 'sign-sdk-user')
  await mkdir(sdkHome, { recursive: true })
  process.env.HVIGOR_USER_HOME = sdkHome
  process.env.NODE_PATH = resolve(project, '.build/native-control-diagnostics-project/node_modules')
  Module._initPaths()
  const plugin = join(SIGNING.ide, 'tools/hvigor/hvigor-ohos-plugin')
  const require = createRequire(join(plugin, 'package.json'))
  const { DecipherUtil } = require(join(plugin, 'src/utils/decipher-util.js'))
  const { SigningOptionsV2 } = require(join(plugin, 'src/builder/inner-java-command-builder/signing-options-v2.js'))
  const storePassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.storePassword, material.configPath)
  const keyPassword = DecipherUtil.decryptPwd(dirname(material.storeFile), material.keyPassword, material.configPath)
  const args = new SigningOptionsV2().sign().addMode('localSign').addKeyStoreFile(material.storeFile).addKeyStorePwd(storePassword).addKeyAlias(material.keyAlias).addKeyPwd(keyPassword).addSignAlg(material.signAlg).addProfileFile(material.profile).addAppCertFile(material.certpath).addInputFile(insideProject(attempt.candidate.path)).addOutputFile(signedPath).addCalledJarFile(jar).build()
  if (args[0] !== 'java') throw new Error('official signing options did not produce a java invocation')
  return spawnSync(java, args.slice(1), { env: commandEnvironment(runDirectory), windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 4194304 })
}

/**
 * Re-pin the candidate, official JAR and every reused signing material immediately before the signer starts.
 * @param {object} options - Pinned inputs.
 * @param {object} options.attempt - Fixed attempt journal.
 * @param {object} options.material - Parsed original signing material.
 * @returns {Promise<{jar: string}>} Verified official JAR path.
 */
async function assertPinnedSigningInputs({ attempt, material }) {
  const candidate = assertCandidateArtifact(await hashFile(insideProject(attempt.candidate.path)))
  if (candidate.bytes !== attempt.candidate.bytes || candidate.sha256 !== attempt.candidate.sha256) throw new Error('candidate HAP changed after preparation')
  const expected = attempt.signing?.materialHashes
  if (expected === null || typeof expected !== 'object') throw new Error('prepared signing material hashes are unavailable')
  for (const [key, path] of [['configuration', material.configPath], ['storeFile', material.storeFile], ['profile', material.profile], ['certificate', material.certpath]]) {
    if ((await hashFile(path)).sha256 !== expected[key]) throw new Error('signing material changed after preparation: ' + key)
  }
  const jar = join(SIGNING.ide, SIGNING.jarRelative)
  const jarSha256 = (await hashFile(jar)).sha256
  if (jarSha256 !== SIGNING.jarSha256 || jarSha256 !== attempt.signing?.jarSha256) throw new Error('official signing JAR hash differs from the recorded toolchain')
  return { jar }
}

/**
 * @param {object} options - Verification inputs.
 * @param {object} options.attempt - Fixed attempt journal.
 * @param {string} options.signedPath - Retained signed HAP.
 * @param {boolean} options.recovered - Whether verification follows an unknown signer result.
 * @returns {Promise<object>} Verified signed result.
 */
async function verifySigned({ attempt, signedPath, recovered }) {
  stage = 'verify-signed'
  const runDirectory = join(project, attempt.ownedRun.directory)
  const artifact = await hashFile(signedPath)
  if (artifact.bytes <= 0) throw new Error('signed output is empty')
  const candidateBytes = assertCandidateArtifact(await hashFile(insideProject(attempt.candidate.path)))
  const expectedProfile = attempt.signing?.materialHashes?.profile
  if (typeof expectedProfile !== 'string') throw new Error('prepared signing profile hash is unavailable')
  const sequence = Date.now()
  const directory = join(runDirectory, 'signature-verification')
  await mkdir(directory, { recursive: true })
  const java = join(SIGNING.ide, 'jbr/bin/java.exe'), jar = join(SIGNING.ide, SIGNING.jarRelative)
  const jarSha256 = (await hashFile(jar)).sha256
  if (jarSha256 !== SIGNING.jarSha256 || jarSha256 !== attempt.signing?.jarSha256) throw new Error('official signing JAR hash differs from the recorded toolchain')
  const env = commandEnvironment(runDirectory)
  const certPath = join(directory, 'certificate-chain-' + sequence + '.cer'), profilePath = join(directory, 'profile-' + sequence + '.p7b'), verifiedProfilePath = join(directory, 'verified-profile-' + sequence + '.json')
  const verify = args => spawnSync(java, ['-jar', jar, ...args], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304 })
  const app = verify(['verify-app', '-inFile', signedPath, '-outCertChain', certPath, '-outProfile', profilePath])
  if (app.status !== 0) throw new Error('official verify-app exited ' + app.status)
  const certificateChain = assertCertificateChain((await hashFile(certPath)).sha256)
  const profileCheck = verify(['verify-profile', '-inFile', profilePath, '-outFile', verifiedProfilePath])
  if (profileCheck.status !== 0) throw new Error('official verify-profile exited ' + profileCheck.status)
  const profile = await hashFile(profilePath)
  if (profile.sha256 !== expectedProfile) throw new Error('extracted profile differs from the prepared original signing material')
  const payloadPath = join(directory, 'public-payload-report-' + sequence + '.json')
  const payloadRun = spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve(project, 'scripts/phase59-hap-payload.ps1')], { env: { ...commandEnvironment(runDirectory), DSH_UNSIGNED_HAP: insideProject(attempt.candidate.path), DSH_SIGNED_HAP: signedPath, DSH_PUBLIC_PAYLOAD_REPORT: payloadPath }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  if (payloadRun.status !== 0) throw new Error('public payload report exited ' + payloadRun.status)
  const payload = await readJson(payloadPath)
  assertInstalledMetadata(payload.metadata)
  const className = 'ConnectionDeploymentPageInfoVerify'
  const template = await readFile(join(project, '.build/Phase70PageInfoVerify.java'), 'utf8')
  const derived = template.replaceAll('Phase70PageInfoVerify', className).replace('Path.of(".build/phase70-pages-info-derived.bin")', 'Path.of(args[2])').replace('for (String input : args)', 'for (String input : new String[]{args[0], args[1]})')
  const derivedPath = join(directory, className + '-' + sequence + '.java'), bitmapPath = join(directory, 'pages-info-derived-' + sequence + '.bin')
  await writeFile(derivedPath, derived)
  const derivedRun = spawnSync(java, ['-cp', jar, derivedPath, insideProject(attempt.candidate.path), signedPath, bitmapPath], { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 })
  if (derivedRun.status !== 0) throw new Error('official SDK page-bitmap regeneration failed')
  const bitmap = await readFile(bitmapPath)
  const difference = assertPayload({ inputEntries: payload.inputEntries, signedEntries: payload.signedEntries, pagesInfo: { bytes: bitmap.length, sha256: sha256(bitmap) } })
  const result = {
    schema: 'harmony-connection-deployment-signed/1', label: attempt.label, at: new Date().toISOString(), recoveredVerification: recovered,
    input: { path: attempt.candidate.path, bytes: candidateBytes.bytes, sha256: candidateBytes.sha256 },
    inputSha256: candidateBytes.sha256,
    artifact: { path: clientPath(relative(project, signedPath)), bytes: artifact.bytes, sha256: artifact.sha256 },
    verified: true, packageSignerExecutions: 1,
    officialJarSha256: jarSha256, verifyAppExitCode: 0, verifyProfileExitCode: 0,
    certificateChainSha256: certificateChain, profileSha256: profile.sha256, profileMatchesSigningMaterial: true,
    payloadIdentical: true, applicationEntryCount: difference.applicationEntryCount, signingMetadataAddition: difference.signingMetadataAddition,
    metadata: payload.metadata, materialsReused: true, materialsRegenerated: false, privateContentProjected: false, rawArgumentsProjected: false,
    installed: false, launch: false,
  }
  const path = evidencePath(attempt.label, 'signed')
  if (await exists(path)) {
    const previous = await readJson(path)
    if (previous.verified !== true || previous.artifact.sha256 !== result.artifact.sha256 || previous.artifact.bytes !== result.artifact.bytes || previous.inputSha256 !== result.inputSha256) throw new Error('retained signed result differs from this verification')
    return previous
  }
  await writeExclusive(path, result)
  return result
}

/** @param {object} attempt - Fixed attempt journal. @returns {Promise<object>} Verified signed result whose file still matches. */
async function loadSignedResult(attempt) {
  const path = evidencePath(attempt.label, 'signed')
  const signed = await readJson(path).catch(error => { if (error.code === 'ENOENT') throw new Error('no verified signed result exists; run sign or verify-existing'); throw error })
  if (signed.label !== attempt.label) throw new Error('signed result belongs to a different attempt')
  const artifact = await hashFile(insideProject(signed.artifact.path))
  if (artifact.bytes !== signed.artifact.bytes || artifact.sha256 !== signed.artifact.sha256) throw new Error('retained signed HAP differs from its verified result')
  return signed
}

/** @returns {Promise<object>} Parsed original signing profile; values are kept in memory and never printed. */
async function readSigningMaterial() {
  const configPath = join(SIGNING.project, SIGNING.configuration)
  const bytes = await readFile(configPath)
  let config
  try { config = JSON.parse(bytes.toString('utf8')) } catch (error) { throw withCode(new Error('original signing project configuration is not valid JSON'), 'signing-config-invalid') }
  const selected = Array.isArray(config?.app?.signingConfigs) ? config.app.signingConfigs.find(value => value?.name === 'default') : undefined
  if (selected === undefined || selected.material === null || typeof selected.material !== 'object') throw new Error('original signing project has no default signing material')
  const product = Array.isArray(config?.app?.products) ? config.app.products.find(value => value?.name === 'default') : undefined
  if (product?.signingConfig !== 'default') throw new Error('original signing product does not reference the default signing configuration')
  const material = { ...selected.material }
  for (const key of ['storeFile', 'profile', 'certpath', 'storePassword', 'keyPassword', 'keyAlias', 'signAlg']) {
    if (typeof material[key] !== 'string' || material[key].length === 0) throw new Error('signing material is missing ' + key)
  }
  for (const key of ['storeFile', 'profile', 'certpath']) material[key] = resolve(SIGNING.project, material[key])
  return { configPath, material, storeFile: material.storeFile, profile: material.profile, certpath: material.certpath, storePassword: material.storePassword, keyPassword: material.keyPassword, keyAlias: material.keyAlias, signAlg: material.signAlg }
}

/** @returns {Promise<object[]>} Retained predecessor packages with their verified digests. */
async function retainedPredecessors() {
  const rows = []
  for (const item of [PREVIOUS.signed, PREVIOUS.predecessor]) {
    if (!(await exists(item.path))) { rows.push({ path: item.path, present: false, recordedSha256: item.sha256 }); continue }
    const artifact = await hashFile(item.path)
    if (artifact.sha256 !== item.sha256) throw new Error('retained predecessor HAP changed: ' + item.path)
    rows.push({ path: item.path, present: true, bytes: artifact.bytes, sha256: artifact.sha256 })
  }
  return rows
}

/** @param {string} directory - Fresh run directory. @returns {Promise<void>} Created directory; existing or redirected roots are refused. */
async function createRunDirectory(directory) {
  const base = resolve(project, '.build')
  const actual = await realpath(base).catch(error => { throw new Error('client .build directory is unavailable: ' + error.code) })
  if (actual !== base) throw new Error('client .build directory is a link or redirect')
  try { await mkdir(directory) } catch (error) { if (error.code === 'EEXIST') throw new Error('run directory already exists: ' + relative(project, directory)); throw error }
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('run directory is not a regular directory')
}

/** @returns {string} Evidence directory that owns the permanent one-shot claims. */
function claimDirectory() { return join(project, EVIDENCE_DIRECTORY, 'claims') }

/**
 * Acquire the fixed claim for one non-replayable action before any external effect.
 * @param {string} action - One-shot action.
 * @param {object} attempt - Fixed attempt journal.
 * @returns {Promise<string>} New claim path.
 */
async function claimNonReplayable(action, attempt) {
  if (attempt === null || typeof attempt !== 'object') throw new Error('deployment attempt is not loaded')
  return claimAction({ directory: claimDirectory(), label: attempt.label, action, at: new Date().toISOString() })
}

/** @param {string} label - Attempt label. @returns {Promise<Set<string>>} Claimed actions, including the fixed launch-attempt evidence. */
async function claimedForAttempt(label) {
  const actions = await claimsFor(claimDirectory(), label)
  if (await exists(evidencePath(label, 'launch-attempt'))) actions.add('launch')
  return actions
}

/** @param {string} key - Resource name. @returns {Promise<Map<string, string>>} Native public labels. */
async function labels() {
  const resource = await readJson(join(project, 'harmony/entry/src/main/resources/base/element/string.json'))
  return new Map(resource.string.map(row => [row.name, row.value]))
}

/** @param {Map<string, string>} values - Native labels. @returns {object} Launch-state labels. */
function launchLabels(values) {
  return { connected: requiredLabel(values, 'product_connected'), connecting: requiredLabel(values, 'product_connecting'), disconnected: requiredLabel(values, 'product_disconnected'), stopped: requiredLabel(values, 'product_connection_stopped'), connect: requiredLabel(values, 'product_connect'), failed: requiredLabel(values, 'product_operation_failed') }
}

/** @param {Map<string, string>} values - Native labels. @param {string} key - Label key. @returns {string} Label value. */
function requiredLabel(values, key) {
  const value = values.get(key)
  if (typeof value !== 'string') throw new Error('missing native public label: ' + key)
  return value
}

/** @param {object[]} args - Full HDC arguments. @param {object} context - Invocation context. @returns {Promise<string>} Standard output. */
async function runHdc(args, context) { const result = await spawnHdc(args, context); if (result.status !== 0) throw withOutput(new Error('HDC exited ' + result.status), result.stdout, context.target); if (/\[Fail\]|\[Error\]/i.test(result.stdout ?? '')) throw withOutput(new Error('HDC reported a failure'), result.stdout, context.target); return result.stdout ?? '' }

/** @param {object[]} args - Full HDC arguments. @param {object} context - Invocation context. @returns {Promise<object>} Raw child result after the allowlist check. */
async function spawnHdc(args, context) {
  assertHdcInvocation(args, { target: context.target, artifactPath: context.artifactPath, runDirectory: context.runDirectory, alias: PHONE.alias })
  const result = spawnSync(PHONE.hdc, args, { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304 })
  if (result.error) throw withCode(new Error('HDC could not run'), result.error.code)
  return result
}

/** @param {object} attemptJournal - Fixed attempt journal. @returns {Promise<object>} Loaded attempt. */
async function loadAttempt() {
  const attempt = await readJson(attemptPath()).catch(error => { if (error.code === 'ENOENT') throw new Error('no deployment attempt exists; run prepare first'); throw error })
  assertAttempt(attempt)
  currentAttempt = attempt
  return attempt
}

/** @param {(attempt: object) => void} mutate - In-place attempt update. @returns {Promise<object>} Updated attempt. */
async function updateAttempt(mutate) {
  const attempt = await loadAttempt()
  mutate(attempt)
  assertAttempt(attempt)
  await writeAtomic(attemptPath(), attempt)
  currentAttempt = attempt
  return attempt
}

/** @returns {Promise<string>} Attempt path. */
function attemptPath() { return join(project, ATTEMPT_FILE) }
/** @param {string} label - Owned run label. @param {string} suffix - Result name. @returns {string} New public evidence path. */
function evidencePath(label, suffix) { return join(project, EVIDENCE_DIRECTORY, label + '-' + suffix + '.json') }
/** @returns {string[]} Existing HDC server selector. */
function server() { return ['-p', '-s', PHONE.server] }
/** @param {string} serial - Verified serial. @returns {string[]} Target-scoped HDC prefix. */
function base(serial) { return [...server(), '-t', serial] }
/** @param {string} path - Recorded path. @returns {string} Absolute path inside the client directory. */
function insideProject(path) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('artifact path is unavailable')
  const absolute = resolve(project, path)
  if (absolute !== project && !absolute.startsWith(project + sep)) throw new Error('artifact path is outside the client directory')
  return absolute
}
/** @param {string} path - Path. @returns {Promise<boolean>} Whether it exists. */
async function exists(path) { try { await access(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
/** @param {string} path - JSON path. @returns {Promise<object>} Parsed JSON. */
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')) }
/** @param {string} path - File path. @returns {Promise<{bytes: number, sha256: string}>} File length and digest. */
async function hashFile(path) { const bytes = await readFile(path); return { bytes: bytes.length, sha256: sha256(bytes) } }
/** @param {string} path - Evidence path. @param {object} value - JSON value. @returns {Promise<void>} Exclusive write; no evidence is overwritten. */
async function writeExclusive(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }) }
/** @param {string} path - Attempt path. @param {object} value - JSON value. @returns {Promise<void>} Atomic replacement of the owned attempt. */
async function writeAtomic(path, value) { const temporary = path + '.tmp-' + randomBytes(4).toString('hex'); await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, path) }
/** @param {string} path - File path. @returns {string} Client-relative slash path. */
function clientPath(path) { return path.replaceAll('\\', '/') }
/** @param {Error} error - Failure. @returns {string} Stable category. */
function category(error) { return typeof error?.code === 'string' ? error.code : error?.name ?? 'failure' }
/** @param {Error} error - Failure. @returns {string} Bounded message without child arguments. */
function safeMessage(error) { return String(error instanceof Error ? error.message : error).slice(0, 512) }
/** @param {Error} error - Failure. @param {string} code - Machine category. @returns {Error} The same error with a code. */
function withCode(error, code) { return Object.assign(error, { code }) }
/** @param {Error} error - Failure. @param {string} output - Child output. @param {string} [target] - Serial to redact. @returns {Error} The same error with bounded output. */
function withOutput(error, output, target) { return Object.assign(error, { stdout: sanitizeOutput(output, { target }) }) }
/** @param {number} milliseconds - Delay. @returns {Promise<void>} Resolves after the delay. */
function delay(milliseconds) { return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)) }
/** @param {string} runDirectory - Run directory. @returns {object} Restricted command environment. */
function commandEnvironment(runDirectory) { return { PATH: [join(SIGNING.ide, 'jbr/bin'), join(process.env.SystemRoot ?? 'C:/Windows', 'System32')].join(delimiter), SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: runDirectory, TMP: runDirectory, USERPROFILE: process.env.USERPROFILE, HVIGOR_USER_HOME: join(runDirectory, 'sign-sdk-user') } }
/** @param {object} attemptJournal - Fixed attempt journal. @param {string} owner - Stage owning the failure. @param {Error} error - Failure. @returns {Promise<string|null>} Diagnostic path. */
async function recordVerificationFailure(attemptJournal, owner, error) {
  const record = { schema: 'harmony-connection-deployment-failure/1', label: attemptJournal.label, at: new Date().toISOString(), stage: owner, category: category(error), message: safeMessage(error), outputTail: sanitizeOutput(error.stdout ?? ''), rawArgumentsProjected: false }
  try {
    const path = evidencePath(attemptJournal.label, 'failure-' + owner + '-' + Date.now())
    await writeExclusive(path, record)
    return clientPath(relative(project, path))
  } catch (writeError) { void writeError; return null }
}
/** @param {Error} error - Failure. @returns {Promise<string|null>} Diagnostic path for the current attempt. */
async function writeFailure(error) {
  if (currentAttempt === null) return null
  return recordVerificationFailure(currentAttempt, stage, error)
}

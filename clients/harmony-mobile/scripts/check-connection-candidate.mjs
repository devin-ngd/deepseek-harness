/** Frozen acceptance entry: plan or build one fresh reviewable connection candidate from the current default-disabled source; audit an existing unsigned artifact without rebuilding. No signing, installation, device, relay or network access. */
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  CANDIDATE_APPLICATION_PATH, CANDIDATE_BUNDLE_NAME, CANDIDATE_CONFIGURATION_PATH, CANDIDATE_DIRECTORIES, CANDIDATE_EVIDENCE_DIRECTORY, CANDIDATE_FILES, EXAMPLE_ALIAS, EXAMPLE_HOST, REQUIRED_PERMISSIONS,
  assertApprovedCandidate, assertBuildEvidencePolicy, assertCandidateCopy, assertDefaultDisabledSource, candidateDirectoryName, configurationBody,
  createCandidateDirectory, hashCandidateSource, inspectUnsignedHap, renderConfiguration, sha256, verifyCandidateEvidence, verifyGeneratedRuntime,
} from './connection-candidate.mjs'

const project = resolve(import.meta.dirname, '..')

await main().catch(error => {
  const stage = typeof error?.stage === 'string' ? error.stage : 'arguments'
  console.error('FAIL [' + stage + ']: ' + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})

async function main() {
  const invocation = parseInvocation(process.argv.slice(2))
  const explicit = hasAllInputs(invocation), partial = hasAnyInput(invocation) && !explicit
  if (invocation.compile && !explicit) throw withStage(new Error('--compile requires explicit --host, --alias and --api; the historical example is plan-only'), 'arguments')
  if (invocation.audit === undefined && partial) throw withStage(new Error('planning with explicit inputs requires all of --host, --alias and --api'), 'arguments')
  const platform = await readPlatform()
  if (invocation.audit !== undefined) return auditCandidate(invocation, platform)
  const approval = assertApprovedCandidate({
    host: explicit ? invocation.host : EXAMPLE_HOST,
    alias: explicit ? invocation.alias : EXAMPLE_ALIAS,
    api: explicit ? parseApi(invocation.api) : platform.installedSdkApi,
    installedApi: platform.installedSdkApi,
  })
  const approvalReport = {
    ...approval, installedApi: platform.installedSdkApi, explicitInputs: explicit, example: !explicit,
    deviceApiConfirmed: platform.deviceApiConfirmed === true,
    apiSource: explicit ? 'explicit --api' : 'historical example host/alias with the installed SDK API',
  }
  let defaults, generated, runtime
  try {
    defaults = JSON.parse(await readFile(join(project, 'product.config.json'), 'utf8'))
    generated = await readFile(join(project, 'harmony', CANDIDATE_CONFIGURATION_PATH), 'utf8')
    assertDefaultDisabledSource(defaults, generated)
    runtime = await verifyGeneratedRuntime(project)
  } catch (error) { throw withStage(error, 'preflight') }
  const body = configurationBody(defaults, { enabled: true, approvedHost: approval.host, identityAlias: approval.alias, deviceApiVerified: approval.api })
  const configurationText = renderConfiguration(body, true)
  const startedAt = new Date(), suffix = randomBytes(4).toString('hex'), label = startedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-' + suffix
  const name = candidateDirectoryName(startedAt, suffix)
  const qualification = 'offline unsigned compile candidate only; the API value matches the installed SDK but establishes no device API confirmation, pairing, installation, signing, network, relay or on-site authorization'
  if (!invocation.compile) {
    console.log(JSON.stringify({
      mode: 'plan', schema: 'harmony-connection-candidate/1', label, candidateDirectory: '.build/' + name,
      approval: approvalReport, configuration: { path: CANDIDATE_CONFIGURATION_PATH, sha256: sha256(configurationText), body },
      sources: { defaultDisabled: true, configurationSha256: sha256(generated), generatedRuntime: runtime },
      qualification, offlineOnly: true, builds: false, writes: 0,
      warnings: explicit ? [] : ['example inputs are historical and are not an on-site approval or device API confirmation'],
      next: 'node scripts/check-connection-candidate.mjs --compile --host=<host> --alias=<alias> --api=<api>',
    }, null, 2))
    return
  }
  await compileCandidate({ approvalReport, platform, generated, runtime, body, configurationText, name, label, startedAt, qualification })
}

/**
 * @param {object} options - Validated preflight values.
 * @param {object} options.platform - Parsed `harmony/platform.json`.
 * @returns {Promise<void>} Writes one passed evidence file or one failure record; never signs, installs or contacts a device.
 */
async function compileCandidate({ approvalReport, platform, generated, runtime, body, configurationText, name, label, startedAt, qualification }) {
  let stage = 'preflight', directory = null, evidencePath = null, outputTail = ''
  try {
    stage = 'create-directory'
    directory = await createCandidateDirectory(project, name)
    stage = 'copy-source'
    const sourceHashes = await hashCandidateSource(join(project, 'harmony'))
    for (const entry of CANDIDATE_DIRECTORIES) await cp(join(project, 'harmony', entry), join(directory, entry), { recursive: true, dereference: false })
    for (const file of CANDIDATE_FILES) { const target = join(directory, file); await mkdir(dirname(target), { recursive: true }); await copyFile(join(project, 'harmony', file), target) }
    stage = 'inject-configuration'
    const application = JSON.parse(await readFile(join(directory, CANDIDATE_APPLICATION_PATH), 'utf8'))
    if (application?.app?.bundleName !== 'local.dsh.mobile.lab') throw new Error('maintained source bundle differs from the isolated lab bundle')
    application.app.bundleName = CANDIDATE_BUNDLE_NAME
    await writeFile(join(directory, CANDIDATE_APPLICATION_PATH), JSON.stringify(application, null, 2) + '\n')
    await writeFile(join(directory, CANDIDATE_CONFIGURATION_PATH), configurationText)
    stage = 'verify-copy'
    const candidateHashes = await hashCandidateSource(directory)
    assertCandidateCopy(sourceHashes, candidateHashes, { configuration: CANDIDATE_CONFIGURATION_PATH, application: CANDIDATE_APPLICATION_PATH })
    if (await readFile(join(directory, CANDIDATE_CONFIGURATION_PATH), 'utf8') !== configurationText) throw new Error('candidate configuration was not written exactly')
    if (JSON.parse(await readFile(join(directory, CANDIDATE_APPLICATION_PATH), 'utf8'))?.app?.bundleName !== CANDIDATE_BUNDLE_NAME) throw new Error('candidate bundle was not set')
    const profile = JSON.parse(await readFile(join(directory, 'build-profile.json5'), 'utf8')), module = JSON.parse(await readFile(join(directory, 'entry/src/main/module.json5'), 'utf8'))
    if (JSON.stringify(profile?.app?.signingConfigs) !== '[]') throw new Error('candidate build profile declares a signing configuration')
    if (JSON.stringify(module?.module?.requestPermissions) !== JSON.stringify(REQUIRED_PERMISSIONS)) throw new Error('candidate module does not request exactly the INTERNET permission')
    stage = 'official-compile'
    const output = await runBuild(join(project, 'scripts/build-native.mjs'), '--project=' + relative(project, directory).replaceAll('\\', '/'), text => { outputTail = (outputTail + text).slice(-32768) })
    const reported = parseReportedEvidence(output)
    evidencePath = join(project, reported)
    const evidenceBytes = await readFile(evidencePath)
    const evidence = JSON.parse(evidenceBytes.toString('utf8'))
    stage = 'verify-build-evidence'
    assertBuildEvidencePolicy(evidence, { project: directory })
    for (const [path, digest] of Object.entries(candidateHashes)) if (evidence.sourceHashes?.[join(directory, path)] !== digest) throw new Error('build evidence lost the candidate input hash: ' + path)
    stage = 'verify-unsigned-hap'
    const artifactBytes = await readFile(evidence.artifact.path)
    if (artifactBytes.length !== evidence.artifact.bytes || sha256(artifactBytes) !== evidence.artifact.sha256) throw new Error('unsigned HAP bytes differ from the build evidence')
    const hap = inspectUnsignedHap(artifactBytes, { sdkVersion: platform.installedSdkVersion, api: platform.installedSdkApi })
    stage = 'write-evidence'
    const report = {
      schema: 'harmony-connection-candidate/1', status: 'passed', label, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(),
      qualification,
      approval: approvalReport,
      defaults: { sourceDefaultDisabled: true, configurationPath: 'harmony/' + CANDIDATE_CONFIGURATION_PATH, configurationSha256: sha256(generated), productConfigSha256: sha256(await readFile(join(project, 'product.config.json'))) },
      candidate: { directory: relative(project, directory).replaceAll('\\', '/'), fresh: true, source: 'harmony', inputFiles: Object.keys(sourceHashes).length, sourceHashes, inputHashes: candidateHashes, configuration: { path: CANDIDATE_CONFIGURATION_PATH, sha256: sha256(configurationText), body }, copyMatchesSource: true },
      generatedRuntime: runtime,
      build: { evidence: relative(project, evidencePath).replaceAll('\\', '/'), evidenceSha256: sha256(evidenceBytes), log: relative(project, evidencePath).replaceAll('\\', '/').replace(/\.json$/, '.log'), exitCode: evidence.exitCode, toolchain: evidence.toolchain, sourceArkTsCompiled: evidence.sourceArkTsCompiled, inputsUnchangedDuringBuild: evidence.inputsUnchangedDuringBuild, nativeJsImportAudit: evidence.nativeJsImportAudit },
      hap: { path: relative(project, evidence.artifact.path).replaceAll('\\', '/'), bytes: artifactBytes.length, sha256: sha256(artifactBytes), type: 'unsigned HAP', entryCount: hap.entryCount, signatureEntries: [], unsignedBasis: ['no-signature-entries', 'no-inserted-signature-block', 'no-trailing-signature'], unsignedLayout: hap.unsignedLayout, installableOnDeviceClaimed: false, module: { bundleName: hap.module.app.bundleName, versionName: hap.module.app.versionName, versionCode: hap.module.app.versionCode, compileSdkVersion: hap.module.app.compileSdkVersion, requestPermissions: hap.module.module.requestPermissions }, pack: hap.pack },
      checks: { defaultDisabledSource: true, generatedRuntimeCurrent: true, explicitInputs: approvalReport.explicitInputs, exampleMode: approvalReport.example, deviceApiConfirmed: approvalReport.deviceApiConfirmed, uniqueDirectory: true, copyMatchesSource: true, officialCompileExitZero: true, inputsStable: true, unsignedHap: true, internetOnly: true },
      sideEffects: { signing: false, installation: false, hdc: false, deviceIo: false, relay: false, network: false, realModelCalls: 0, grantsCreated: 0, defaultFilesWritten: 0, previousEvidenceOverwritten: false },
      notVerified: ['installation, launch and in-place upgrade', 'real device API confirmation (platform.deviceApiConfirmed=false)', 'pairing, HUKS challenge signing, transport authentication', 'real desktop Session, model output, streaming and ArkWeb forms', 'any on-site authorization'],
    }
    await mkdir(join(project, CANDIDATE_EVIDENCE_DIRECTORY), { recursive: true })
    await writeFile(join(project, CANDIDATE_EVIDENCE_DIRECTORY, label + '.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ status: 'passed', evidence: CANDIDATE_EVIDENCE_DIRECTORY + '/' + label + '.json', candidate: report.candidate.directory, hap: { bytes: report.hap.bytes, sha256: report.hap.sha256 } }))
  } catch (error) {
    const record = {
      schema: 'harmony-connection-candidate/1', status: 'failed', label, stage, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error), approval: approvalReport,
      candidateDirectory: directory === null ? null : relative(project, directory).replaceAll('\\', '/'), candidateRetained: directory !== null,
      buildEvidence: evidencePath === null ? null : relative(project, evidencePath).replaceAll('\\', '/'), outputTail, retainedForDiagnosis: true,
      sideEffects: { signing: false, installation: false, hdc: false, deviceIo: false, relay: false, network: false },
    }
    try {
      await mkdir(join(project, CANDIDATE_EVIDENCE_DIRECTORY), { recursive: true })
      await writeFile(join(project, CANDIDATE_EVIDENCE_DIRECTORY, label + '-failure.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
    } catch (writeError) { console.error('Failure evidence could not be written: ' + (writeError instanceof Error ? writeError.message : String(writeError))) }
    if (record.candidateDirectory !== null) console.error('Diagnostics retained in ' + record.candidateDirectory)
    throw withStage(error instanceof Error ? error : new Error(String(error)), stage)
  }
}

/**
 * @param {object} invocation - Parsed audit invocation.
 * @param {object} platform - Parsed `harmony/platform.json`.
 * @returns {Promise<void>} Prints a read-only verification summary; writes nothing.
 */
async function auditCandidate(invocation, platform) {
  if (typeof invocation.audit !== 'string' || invocation.audit.length === 0 || invocation.audit.includes('\0')) throw withStage(new Error('--audit requires one evidence file path'), 'audit')
  const evidencePath = resolve(project, invocation.audit)
  if (!evidencePath.startsWith(project + sep)) throw withStage(new Error('--audit evidence must stay inside the client directory'), 'audit')
  const bytes = await readFile(evidencePath).catch(error => { throw withStage(new Error('candidate evidence is unavailable: ' + error.message), 'audit') })
  let evidence
  try { evidence = JSON.parse(bytes.toString('utf8')) } catch (error) { throw withStage(new Error('candidate evidence is not valid JSON: ' + error.message), 'audit') }
  const verified = await verifyCandidateEvidence(project, evidence, platform).catch(error => { throw withStage(error, 'audit') })
  console.log(JSON.stringify({
    mode: 'audit', schema: 'harmony-connection-candidate/1', status: 'passed', evidence: relative(project, evidencePath).replaceAll('\\', '/'),
    offlineOnly: true, builds: false, writes: 0,
    qualification: 'read-only re-verification of an existing unsigned candidate; no compile, signing, installation, device access, relay or network access',
    ...verified,
  }, null, 2))
}

/** @param {string[]} argv - Command arguments after the script name. @returns {object} Parsed mode and explicit inputs. */
function parseInvocation(argv) {
  const result = { compile: false, audit: undefined, host: undefined, alias: undefined, api: undefined }
  const seen = new Set()
  for (const argument of argv) {
    if (argument === '--compile') {
      if (result.compile) throw withStage(new Error('Duplicate argument: --compile'), 'arguments')
      result.compile = true
      continue
    }
    if (argument === '--audit') throw withStage(new Error('--audit requires one evidence file: --audit=<path>'), 'arguments')
    const audit = /^--audit=(.*)$/.exec(argument)
    if (audit !== null) {
      if (seen.has('audit')) throw withStage(new Error('Duplicate argument: --audit'), 'arguments')
      seen.add('audit')
      result.audit = audit[1]
      continue
    }
    const match = /^--(host|alias|api)=(.*)$/.exec(argument)
    if (match === null) throw withStage(new Error('Unknown argument: ' + argument), 'arguments')
    if (seen.has(match[1])) throw withStage(new Error('Duplicate argument: --' + match[1]), 'arguments')
    seen.add(match[1])
    result[match[1]] = match[2]
  }
  if (result.compile && result.audit !== undefined) throw withStage(new Error('--compile and --audit cannot be combined'), 'arguments')
  if (result.audit !== undefined && hasAnyInput(result)) throw withStage(new Error('--audit does not accept candidate inputs'), 'arguments')
  return result
}

/** @param {object} invocation - Parsed invocation. @returns {boolean} Whether all explicit input flags are present. */
function hasAllInputs(invocation) { return invocation.host !== undefined && invocation.alias !== undefined && invocation.api !== undefined }
/** @param {object} invocation - Parsed invocation. @returns {boolean} Whether any explicit input flag is present. */
function hasAnyInput(invocation) { return invocation.host !== undefined || invocation.alias !== undefined || invocation.api !== undefined }
/** @param {string} raw - `--api` value. @returns {number} Parsed API. */
function parseApi(raw) {
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) throw withStage(new Error('--api must be one positive integer equal to the installed SDK API'), 'arguments')
  return Number(raw)
}

/** @returns {Promise<object>} Parsed and validated installed toolchain record. */
async function readPlatform() {
  try {
    const platform = JSON.parse(await readFile(join(project, 'harmony/platform.json'), 'utf8'))
    if (platform.installedToolchainConfirmed !== true || !Number.isSafeInteger(platform.installedSdkApi) || platform.installedSdkApi < 20) throw new Error('harmony/platform.json records no confirmed installed SDK API')
    return platform
  } catch (error) { throw withStage(error, 'platform') }
}

/** @param {unknown} error - Failure. @param {string} stage - Owning stage. @returns {Error} The same error tagged with its stage. */
function withStage(error, stage) {
  const value = error instanceof Error ? error : new Error(String(error))
  value.stage ??= stage
  return value
}

/** @param {string} script - `build-native.mjs` path. @param {string} argument - Isolated project selector. @param {(text: string) => void} forward - Output sink. @returns {Promise<string>} Complete build output; real child exit state is asserted through evidence. */
async function runBuild(script, argument, forward) {
  const child = spawn(process.execPath, [script, argument], { cwd: project, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const consume = chunk => { const text = chunk.toString(); output += text; forward(text); process.stdout.write(text) }
  for (const stream of [child.stdout, child.stderr]) stream.on('data', consume)
  const exitCode = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept) })
  if (exitCode !== 0) throw new Error('build-native.mjs exited with code ' + exitCode)
  return output
}

/** @param {string} output - Captured build output. @returns {string} Reported build evidence path relative to the client. */
function parseReportedEvidence(output) {
  const lines = output.split(/\r?\n/).reverse()
  for (const line of lines) {
    if (!line.trim().startsWith('{')) continue
    try { const value = JSON.parse(line); if (typeof value?.evidence === 'string' && /^evidence\/native-build\/[A-Za-z0-9T:._-]+\.json$/.test(value.evidence)) return value.evidence } catch (error) { if (!(error instanceof SyntaxError)) throw error }
  }
  throw new Error('official build did not report a retained evidence file')
}

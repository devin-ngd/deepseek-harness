/** Offline-only connection candidate: explicit approved parameters over the default-disabled product source, with no device, network or signing side effects. */
import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'

/** Historical public host and phone alias used only as reviewable offline compile inputs. */
export const EXAMPLE_HOST = 'dsh.devinho.me'
/** Historical public phone alias; it identifies no private key and establishes no trust. */
export const EXAMPLE_ALIAS = 'harmony-phase54-phone'
/** Fresh candidate projects always live under this `.build` prefix. */
export const CANDIDATE_DIRECTORY_PREFIX = 'native-controls-connection-'
/** Acceptance evidence is appended here; existing files are never replaced. */
export const CANDIDATE_EVIDENCE_DIRECTORY = 'evidence/connection-candidate'
/** The only bundle the candidate copy may use; installation is not authorized. */
export const CANDIDATE_BUNDLE_NAME = 'local.dsh.mobile.offlineproduct'
/** Combined HAP packaging accepts exactly the existing INTERNET-only permission. */
export const REQUIRED_PERMISSIONS = [{ name: 'ohos.permission.INTERNET' }]
/** Source entries copied into the candidate, matching the maintained product prepare step. */
export const CANDIDATE_DIRECTORIES = ['AppScope', 'entry/src', 'hvigor']
/** Descriptor files copied into the candidate, matching the maintained product prepare step. */
export const CANDIDATE_FILES = ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']
/** The single generated configuration allowed to differ from the maintained source. */
export const CANDIDATE_CONFIGURATION_PATH = 'entry/src/main/ets/product/ProductConfiguration.ets'
/** The application descriptor whose bundle name is changed for the isolated candidate. */
export const CANDIDATE_APPLICATION_PATH = 'AppScope/app.json5'
/** Frozen acceptance entry points that documentation must name exactly. */
export const FROZEN_ACCEPTANCE = Object.freeze({
  test: 'tests/connection-candidate.test.mjs',
  check: 'scripts/check-connection-candidate.mjs',
  compileCommand: 'node scripts/check-connection-candidate.mjs --compile',
  evidenceDirectory: CANDIDATE_EVIDENCE_DIRECTORY,
})

const DEFAULT_HEADER = '/** Generated from default-disabled product.config.json; no actual device API or real trust is inferred. */\nimport { NativeProductConfiguration } from \'./NativeProductOwner\'\nexport const productConfiguration: NativeProductConfiguration = '
const CANDIDATE_HEADER = '/** Generated from explicit offline connection approval inputs; no device verification, pairing or on-site authorization is inferred. */\nimport { NativeProductConfiguration } from \'./NativeProductOwner\'\nexport const productConfiguration: NativeProductConfiguration = '
const DIRECTORY_NAME = /^native-controls-connection-[A-Za-z0-9_-]+$/
const HOST_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IDENTITY_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** @param {Buffer|Uint8Array} bytes - Bytes to digest. @returns {string} Lowercase SHA-256 hex digest. */
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

/** @param {object} config - Parsed `product.config.json`. @returns {object} The default-disabled configuration body used by the maintained generator. */
export function defaultConfigurationBody(config) {
  return configurationBody(config, { enabled: false, approvedHost: '', identityAlias: '', deviceApiVerified: 0 })
}

/** @param {object} config - Parsed `product.config.json`. @param {object} approval - Explicit candidate values. @param {boolean} approval.enabled - Whether the candidate enables the transport path. @param {string} approval.approvedHost - Exact public host. @param {string} approval.identityAlias - Phone identity alias. @param {number} approval.deviceApiVerified - Verified device API. @returns {object} Immutable configuration body with the unchanged budgets and core policy. */
export function configurationBody(config, { enabled, approvedHost, identityAlias, deviceApiVerified }) {
  const core = { ...config.core, enabled }
  return { enabled, approvedHost, identityAlias, deviceApiVerified, maxCryptoBytes: config.maxCryptoBytes, maxTotalSendBytes: config.maxTotalSendBytes, publicTrustMaxBytes: config.publicTrustMaxBytes, relay: config.relay, corePolicyJson: JSON.stringify(core) }
}

/** @param {object} body - Configuration body. @param {boolean} [candidate] - Whether to use the explicit-candidate header. @returns {string} Exact `ProductConfiguration.ets` text. */
export function renderConfiguration(body, candidate = false) {
  return (candidate ? CANDIDATE_HEADER : DEFAULT_HEADER) + JSON.stringify(body, null, 2) + '\n'
}

/** @param {object} config - Parsed `product.config.json`. @param {string} generatedText - Current `ProductConfiguration.ets` text. @returns {object} The verified default configuration body. */
export function assertDefaultDisabledSource(config, generatedText) {
  if (config.enabled !== false || config.approvedHost !== '' || config.identityAlias !== '' || config.deviceApiVerified !== 0 || config.core?.enabled !== false) throw new Error('source product must remain default-disabled with empty host and alias')
  const body = defaultConfigurationBody(config)
  if (generatedText !== renderConfiguration(body)) throw new Error('generated ProductConfiguration.ets differs from the default-disabled source; regenerate through build-product-core before preparing a candidate')
  return body
}

/**
 * Validate offline compile inputs. The API is matched to the installed SDK, not to a device:
 * `platform.deviceApiConfirmed=false` means this value is an offline parameter and no device
 * check has happened.
 * @param {object} input - Candidate approval inputs. @param {string} input.host - Exact public host. @param {string} input.alias - Phone identity alias. @param {number} input.api - Offline candidate API, required to equal the installed SDK API. @param {number} input.installedApi - Installed SDK API from `platform.json`. @returns {{host: string, alias: string, api: number}} Validated offline inputs. */
export function assertApprovedCandidate({ host, alias, api, installedApi }) {
  if (typeof host !== 'string' || !HOST_NAME.test(host) || host.endsWith('.invalid') || host.length > 253) throw new Error('candidate host must be one non-empty lowercase DNS name other than .invalid')
  if (typeof alias !== 'string' || !IDENTITY_ALIAS.test(alias) || alias === '.' || alias === '..') throw new Error('candidate identity alias must be one non-empty public alias without whitespace')
  if (!Number.isSafeInteger(installedApi) || installedApi < 20) throw new Error('installed SDK API is unavailable; record platform.json before preparing a candidate')
  if (!Number.isSafeInteger(api) || api < 20 || api !== installedApi) throw new Error('offline candidate API must equal the installed SDK API (' + installedApi + '); this is not device confirmation')
  return { host, alias, api }
}

/** @param {Date} now - Candidate start time. @param {string} [suffix] - Reproducible suffix; production calls use random bytes. @returns {string} Unique candidate directory name accepted by `build-native.mjs`. */
export function candidateDirectoryName(now = new Date(), suffix = randomBytes(4).toString('hex')) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('candidate directory requires a valid start time')
  if (typeof suffix !== 'string' || !/^[a-z0-9]{6,16}$/.test(suffix)) throw new Error('candidate directory suffix must be six to sixteen lowercase hex characters')
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 15)
  return CANDIDATE_DIRECTORY_PREFIX + stamp + '-' + suffix
}

/** @param {string} root - Client directory. @param {string} name - Candidate directory name. @returns {string} Absolute candidate directory under `<root>/.build`. */
export function candidateDirectoryPath(root, name) {
  if (typeof name !== 'string' || !DIRECTORY_NAME.test(name) || name.includes('/') || name.includes('\\')) throw new Error('candidate directory name is outside the owned prefix or contains a separator')
  const base = resolve(root, '.build'), path = resolve(base, name)
  if (dirname(path) !== base || !path.startsWith(base + sep)) throw new Error('candidate directory escapes the client .build root')
  return path
}

/** @param {string} root - Client directory. @param {string} name - Candidate directory name. @returns {Promise<string>} Freshly created candidate directory; existing paths and redirected roots are refused. */
export async function createCandidateDirectory(root, name) {
  const base = resolve(root, '.build'), path = candidateDirectoryPath(root, name)
  const actualBase = await realpath(base).catch(error => { throw new Error('candidate base directory is unavailable: ' + error.message) })
  if (actualBase !== base) throw new Error('candidate base directory is a link or redirect')
  try { await lstat(path); throw new Error('candidate output directory already exists: ' + relative(root, path)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  try { await mkdir(path) } catch (error) { if (error.code === 'EEXIST') throw new Error('candidate output directory already exists: ' + relative(root, path)); throw error }
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('candidate output directory is not a regular directory')
  return path
}

/** @param {string} project - Client directory. @param {string} [evidencePath] - Generated-runtime report. @returns {Promise<object>} Verified current generated runtimes and their source hash count. */
export async function verifyGeneratedRuntime(project, evidencePath = 'evidence/normal-product-native-build.json') {
  const evidence = JSON.parse(await readFile(join(project, evidencePath), 'utf8'))
  if (evidence.defaultDisabled !== true || evidence.nativeOrWebExecuted !== false) throw new Error('generated runtime evidence is not default-disabled')
  if (!Array.isArray(evidence.reports) || evidence.reports.length !== 3) throw new Error('generated runtime evidence must contain the three maintained runtimes')
  let sourceHashes = 0
  for (const report of evidence.reports) {
    const bytes = await readFile(resolve(project, report.output))
    if (bytes.length !== report.bytes || sha256(bytes) !== report.sha256) throw new Error('generated runtime differs from its recorded build: ' + report.output)
    for (const [path, expected] of Object.entries(report.sourceHashes)) {
      if (sha256(await readFile(resolve(project, path))) !== expected) throw new Error('generated runtime source changed after build: ' + path)
      sourceHashes++
    }
  }
  return { evidence: evidencePath, reports: evidence.reports.map(report => report.output), sourceHashes }
}

/**
 * HAP signing is not limited to `META-INF`: the observed official signer adds `.pages.info` and
 * inserts a binary signature block before the central directory. Entry names therefore reject
 * known signing metadata only; `inspectUnsignedHap` proves the remaining unsigned layout.
 * @param {string[]} names - Candidate HAP entry names. @returns {{entryCount: number}} Verified absence of signing metadata names.
 */
export function assertUnsignedHapEntries(names) {
  if (!Array.isArray(names) || names.length === 0) throw new Error('unsigned HAP must contain at least one entry')
  const seen = new Set()
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) throw new Error('HAP entry name is invalid: ' + name)
    if (seen.has(name)) throw new Error('HAP contains a duplicate entry: ' + name)
    seen.add(name)
    if (name.toLowerCase().startsWith('meta-inf/') || /^(?:sign|signature)\//i.test(name)) throw new Error('HAP contains signing metadata: ' + name)
    if (/(?:\.rsa|\.dsa|\.ec|\.sf|\.p7b|\.pages\.info)$/i.test(name)) throw new Error('HAP contains signature material: ' + name)
  }
  return { entryCount: names.length }
}

/**
 * @param {Buffer} bytes - Unsigned HAP bytes.
 * @param {object} expected - Recorded toolchain and bundle inputs.
 * @param {string} expected.sdkVersion - Installed SDK version.
 * @param {number} expected.api - Installed SDK API.
 * @returns {{entryCount: number, module: object, pack: object, unsignedLayout: boolean}} Verified unsigned payload metadata.
 */
export function inspectUnsignedHap(bytes, expected) {
  const { entries, directoryOffset } = readZipDirectory(bytes)
  assertUnsignedHapEntries(entries.map(entry => entry.name))
  assertUnsignedZipLayout(bytes, entries, directoryOffset)
  const module = JSON.parse(readZipEntry(bytes, entries, 'module.json').toString('utf8'))
  const pack = JSON.parse(readZipEntry(bytes, entries, 'pack.info').toString('utf8'))
  if (module?.app?.bundleName !== CANDIDATE_BUNDLE_NAME || module?.app?.versionName !== '0.0.0' || module?.app?.versionCode !== 1) throw new Error('HAP bundle or version differs from the isolated candidate')
  if (module?.app?.compileSdkVersion !== expected.sdkVersion) throw new Error('HAP compile SDK differs from the installed SDK')
  if (module?.module?.type !== 'entry' || JSON.stringify(module?.module?.requestPermissions) !== JSON.stringify(REQUIRED_PERMISSIONS)) throw new Error('HAP permissions or module type differ from the INTERNET-only entry')
  if (pack?.summary?.app?.bundleName !== CANDIDATE_BUNDLE_NAME || pack?.summary?.modules?.[0]?.apiVersion?.target !== expected.api) throw new Error('HAP pack metadata differs from the candidate bundle and API')
  return { entryCount: entries.length, module, pack, unsignedLayout: true }
}

/**
 * @param {object} evidence - `build-native.mjs` evidence.
 * @param {object} expected - Build expectations.
 * @param {string} expected.project - Candidate directory used for the build.
 * @returns {{checks: string[]}} Verified build policy; throws on the first mismatch.
 */
export function assertBuildEvidencePolicy(evidence, { project }) {
  if (evidence.exitCode !== 0) throw new Error('official compile did not exit zero')
  if (evidence.cwd !== project) throw new Error('build evidence belongs to a different project')
  if (evidence.daemon !== false) throw new Error('official compile unexpectedly used a daemon')
  if (evidence.sourceArkTsCompiled !== true) throw new Error('evidence does not show ArkTS compilation')
  if (evidence.inputsUnchangedDuringBuild !== true) throw new Error('candidate inputs changed during the build')
  if (evidence.nativeJsImportAudit?.passed !== true) throw new Error('native JavaScript import audit did not pass')
  const imports = evidence.nativeJsImportAudit.records ?? []
  for (const file of ['ProductCore.js', 'PairedCore.js']) if (!imports.some(row => row.file === file && row.module === '@ohos:util' && row.binding === 'default')) throw new Error('missing default @ohos:util import for ' + file)
  if (JSON.stringify(evidence.signingConfigs) !== '[]') throw new Error('candidate build must have no signing configuration')
  if (JSON.stringify(evidence.requestPermissions) !== JSON.stringify(REQUIRED_PERMISSIONS)) throw new Error('candidate build must request exactly the INTERNET permission')
  for (const flag of ['pairing', 'desktopConnection', 'simulatorValidated', 'arkWebValidated', 'deviceValidated', 'nativeKeyOperationsExecuted']) if (evidence[flag] !== false) throw new Error('candidate build flag must be false: ' + flag)
  for (const count of ['realModelCalls', 'sessionUploads']) if (evidence[count] !== 0) throw new Error('candidate build count must be zero: ' + count)
  const artifact = evidence.artifact
  if (artifact === null || artifact?.type !== 'unsigned HAP' || artifact?.installableOnDeviceClaimed !== false) throw new Error('candidate artifact is not an unsigned HAP')
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '')) throw new Error('candidate artifact hash is incomplete')
  const path = resolve(artifact.path)
  if (path !== artifact.path || !path.startsWith(project + sep)) throw new Error('candidate artifact is outside its project')
  return { checks: ['exit-zero', 'arkts-compiled', 'inputs-stable', 'native-imports', 'unsigned-config', 'internet-only', 'no-field-io', 'artifact-hash'] }
}

/**
 * @param {string} project - Candidate project directory.
 * @returns {Promise<Record<string, string>>} Relative path to SHA-256 for every source file and descriptor.
 */
export async function hashCandidateSource(project) {
  const hashes = {}
  const walk = async (directory, prefix) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), key = prefix + '/' + entry.name
      if (entry.isDirectory()) await walk(path, key)
      else hashes[key] = sha256(await readFile(path))
    }
  }
  for (const directory of CANDIDATE_DIRECTORIES) await walk(join(project, directory), directory)
  for (const file of CANDIDATE_FILES) hashes[file] = sha256(await readFile(join(project, file)))
  return hashes
}

/**
 * @param {Record<string, string>} before - Source hashes from the maintained client.
 * @param {Record<string, string>} after - Candidate hashes after copy and configuration injection.
 * @param {object} changed - Files expected to differ.
 * @param {string} changed.configuration - Candidate configuration path relative to the project.
 * @param {string} changed.application - Candidate `AppScope/app.json5` path.
 * @returns {{copied: number}} Verified copy; throws if any other input differs.
 */
export function assertCandidateCopy(before, after, { configuration, application }) {
  const changed = new Set([configuration, application])
  if (!(configuration in after) || !(application in after)) throw new Error('candidate copy is missing its configuration or application descriptor')
  if (JSON.stringify(Object.keys(before).sort()) !== JSON.stringify(Object.keys(after).sort())) throw new Error('candidate input set differs from the maintained source')
  for (const [path, digest] of Object.entries(before)) if (!changed.has(path) && after[path] !== digest) throw new Error('candidate input changed outside the generated configuration and bundle: ' + path)
  return { copied: Object.keys(after).length }
}

/** @param {string} path - Candidate file path. @returns {string} The same path in client-relative slash form. */
export function clientRelative(path) { return path.replaceAll('\\', '/') }

/**
 * Re-verify one passed candidate report, every retained source input, its retained candidate
 * configuration and its unsigned HAP without compiling, copying or writing. Used after an
 * official compile so documentation and review can consume the existing artifact.
 * @param {string} root - Client directory containing `.build`, `harmony`, `evidence` and `product.config.json`.
 * @param {object} evidence - Parsed `evidence/connection-candidate/<label>.json`.
 * @param {object} platform - Parsed `harmony/platform.json`.
 * @returns {Promise<{build: string, candidate: string, hap: {bytes: number, sha256: string}, checks: string[]}>} Re-verified artifact summary.
 */
export async function verifyCandidateEvidence(root, evidence, platform) {
  if (evidence?.schema !== 'harmony-connection-candidate/1' || evidence?.status !== 'passed') throw new Error('candidate evidence is not a passed harmony-connection-candidate/1 report')
  if (evidence.approval?.explicitInputs !== true || evidence.approval?.example !== false || evidence.approval?.deviceApiConfirmed !== false) throw new Error('candidate evidence must record explicit, non-example inputs and an unconfirmed device API')
  const approval = assertApprovedCandidate({ host: evidence.approval.host, alias: evidence.approval.alias, api: evidence.approval.api, installedApi: platform.installedSdkApi })
  const configBytes = await readFile(join(root, 'product.config.json'))
  const defaults = JSON.parse(configBytes.toString('utf8'))
  const generated = await readFile(join(root, 'harmony', CANDIDATE_CONFIGURATION_PATH), 'utf8')
  assertDefaultDisabledSource(defaults, generated)
  if (evidence.defaults?.sourceDefaultDisabled !== true || evidence.defaults?.configurationSha256 !== sha256(generated) || evidence.defaults?.productConfigSha256 !== sha256(configBytes)) throw new Error('candidate evidence does not match the current default-disabled source')
  const runtime = await verifyGeneratedRuntime(root)
  if (JSON.stringify(runtime) !== JSON.stringify(evidence.generatedRuntime)) throw new Error('candidate evidence generated runtime differs from the current recorded build')
  const body = configurationBody(defaults, { enabled: true, approvedHost: approval.host, identityAlias: approval.alias, deviceApiVerified: approval.api })
  const configurationText = renderConfiguration(body, true)
  if (evidence.candidate?.configuration?.sha256 !== sha256(configurationText)) throw new Error('candidate evidence configuration differs from the current source budgets')
  const directory = candidateDirectoryPath(root, candidateNameFromEvidence(evidence.candidate?.directory))
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('candidate directory is not a regular retained directory')
  if (sha256(await readFile(join(directory, CANDIDATE_CONFIGURATION_PATH))) !== sha256(configurationText)) throw new Error('retained candidate configuration differs from its recorded bytes')
  const inputHashes = evidence.candidate?.inputHashes
  if (inputHashes === null || typeof inputHashes !== 'object' || Array.isArray(inputHashes) || Object.keys(inputHashes).length === 0) throw new Error('candidate evidence has no retained candidate input hashes')
  const retainedHashes = await hashCandidateSource(directory)
  if (!sameHashes(retainedHashes, inputHashes)) throw new Error('retained candidate source inputs differ from the recorded candidate input hashes')
  const sourceHashes = await hashCandidateSource(join(root, 'harmony'))
  if (!sameHashes(sourceHashes, evidence.candidate?.sourceHashes)) throw new Error('candidate evidence source inputs differ from the current maintained source')
  assertCandidateCopy(sourceHashes, inputHashes, { configuration: CANDIDATE_CONFIGURATION_PATH, application: CANDIDATE_APPLICATION_PATH })
  const buildPath = resolve(root, evidence.build?.evidence ?? '')
  if (!buildPath.startsWith(root + sep) || !buildPath.endsWith('.json')) throw new Error('candidate evidence build report is outside the client directory')
  const buildBytes = await readFile(buildPath)
  if (sha256(buildBytes) !== evidence.build?.evidenceSha256) throw new Error('build report bytes differ from the candidate evidence')
  const build = JSON.parse(buildBytes.toString('utf8'))
  assertBuildEvidencePolicy(build, { project: directory })
  const recordedInputs = Object.entries(inputHashes)
  if (Object.keys(build.sourceHashes ?? {}).length !== recordedInputs.length) throw new Error('build report source hash set differs from the retained candidate')
  for (const [path, digest] of recordedInputs) if (build.sourceHashes?.[join(directory, path)] !== digest) throw new Error('build report lost the retained candidate input: ' + path)
  const artifactBytes = await readFile(build.artifact.path)
  const artifactSha256 = sha256(artifactBytes)
  if (artifactBytes.length !== build.artifact.bytes || artifactSha256 !== build.artifact.sha256) throw new Error('retained HAP bytes differ from its build report')
  if (evidence.hap?.bytes !== artifactBytes.length || evidence.hap?.sha256 !== artifactSha256 || evidence.hap?.type !== 'unsigned HAP') throw new Error('retained HAP differs from the candidate evidence')
  if (!Array.isArray(evidence.hap?.signatureEntries) || evidence.hap.signatureEntries.length !== 0 || evidence.hap?.installableOnDeviceClaimed !== false) throw new Error('candidate evidence does not describe an unsigned non-installable HAP')
  const hap = inspectUnsignedHap(artifactBytes, { sdkVersion: platform.installedSdkVersion, api: platform.installedSdkApi })
  for (const key of ['bundleName', 'versionName', 'versionCode', 'compileSdkVersion']) if (JSON.stringify(evidence.hap.module?.[key]) !== JSON.stringify(hap.module.app[key])) throw new Error('retained HAP application metadata differs from the candidate evidence: ' + key)
  if (JSON.stringify(evidence.hap.module?.requestPermissions) !== JSON.stringify(hap.module.module.requestPermissions)) throw new Error('retained HAP permissions differ from the candidate evidence')
  if (evidence.hap.pack?.summary?.app?.bundleName !== hap.pack.summary.app.bundleName || evidence.hap.pack?.summary?.modules?.[0]?.apiVersion?.target !== hap.pack.summary.modules[0].apiVersion.target) throw new Error('retained HAP pack metadata differs from the candidate evidence')
  const sideEffects = evidence.sideEffects ?? {}
  for (const key of ['signing', 'installation', 'hdc', 'deviceIo', 'relay', 'network']) if (sideEffects[key] !== false) throw new Error('candidate evidence records an unexpected side effect: ' + key)
  for (const key of ['realModelCalls', 'grantsCreated', 'defaultFilesWritten']) if (sideEffects[key] !== 0) throw new Error('candidate evidence records a non-zero count: ' + key)
  return { build: clientRelative(relative(root, buildPath)), candidate: evidence.candidate.directory, hap: { bytes: artifactBytes.length, sha256: artifactSha256 }, checks: ['passed-report', 'explicit-inputs', 'default-disabled-source', 'generated-runtime', 'configuration', 'source-unchanged', 'retained-input-hashes', 'copy-guard', 'build-policy', 'input-hashes', 'unsigned-layout', 'hap-metadata', 'no-side-effects'] }
}

/** @param {object} left - First hash map. @param {object} right - Second hash map. @returns {boolean} Whether both maps contain exactly the same paths and digests. */
function sameHashes(left, right) {
  if (right === null || typeof right !== 'object' || Array.isArray(right)) return false
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort()
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys) && leftKeys.every(key => left[key] === right[key])
}

/** @param {string} directory - Recorded `.build/<name>` candidate directory. @returns {string} The owned candidate directory name. */
function candidateNameFromEvidence(directory) {
  if (typeof directory !== 'string') throw new Error('candidate evidence has no retained candidate directory')
  const match = /^\.build[\\/](.+)$/.exec(directory)
  if (match === null) throw new Error('candidate evidence directory is outside the client .build root')
  return match[1]
}

/**
 * Prove the ZIP payload is exactly the application entries followed by the central directory.
 * A signed HAP may keep every entry name and insert its signature block in this gap, so names
 * alone cannot establish that a candidate is unsigned.
 * @param {Buffer} bytes - HAP bytes.
 * @param {object[]} entries - Central directory entries.
 * @param {number} directoryOffset - Declared start of the central directory.
 * @returns {number} End offset of the final local record.
 */
function assertUnsignedZipLayout(bytes, entries, directoryOffset) {
  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset)
  let cursor = 0
  for (const entry of ordered) {
    if (entry.localOffset !== cursor) throw new Error('HAP has bytes before or between application entries: ' + entry.name)
    if (entry.flags & 1) throw new Error('HAP entry is encrypted: ' + entry.name)
    if (entry.flags & 8) throw new Error('HAP entry uses a data descriptor: ' + entry.name)
    if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error('HAP local header is malformed: ' + entry.name)
    const nameLength = bytes.readUInt16LE(entry.localOffset + 26), extraLength = bytes.readUInt16LE(entry.localOffset + 28)
    const name = bytes.toString('utf8', entry.localOffset + 30, entry.localOffset + 30 + nameLength)
    if (name !== entry.name) throw new Error('HAP local entry name differs from the central directory: ' + entry.name)
    if (bytes.readUInt32LE(entry.localOffset + 18) !== entry.compressed) throw new Error('HAP local entry size differs from the central directory: ' + entry.name)
    cursor = entry.localOffset + 30 + nameLength + extraLength + entry.compressed
    if (cursor > bytes.length) throw new Error('HAP entry data is truncated: ' + entry.name)
  }
  if (cursor !== directoryOffset) throw new Error('HAP payload does not end at the central directory; a signature block or padding is present')
  return cursor
}

function readZipDirectory(bytes) {
  const marker = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (marker < 0 || marker + 22 > bytes.length) throw new Error('HAP is not a zip archive')
  const comment = bytes.readUInt16LE(marker + 20)
  if (marker + 22 + comment !== bytes.length) throw new Error('HAP has an appended signature or trailer; unsigned output expected')
  const count = bytes.readUInt16LE(marker + 10), offset = bytes.readUInt32LE(marker + 16)
  if (count === 0xffff || offset === 0xffffffff) throw new Error('zip64 HAP is not supported')
  const entries = []
  let cursor = offset
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('HAP central directory is malformed')
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10)
    const compressed = bytes.readUInt32LE(cursor + 20), uncompressed = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    entries.push({ name, flags, method, compressed, uncompressed, localOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor > bytes.length) throw new Error('HAP central directory is truncated')
  return { entries, directoryOffset: offset }
}

function readZipEntry(bytes, entries, name) {
  const entry = entries.find(row => row.name === name)
  if (entry === undefined) throw new Error('HAP is missing required entry: ' + name)
  if (entry.flags & 1) throw new Error('HAP entry is encrypted: ' + name)
  if (entry.uncompressed > 2 * 1024 * 1024) throw new Error('HAP entry is oversized: ' + name)
  const local = entry.localOffset
  if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('HAP local header is malformed: ' + name)
  const nameLength = bytes.readUInt16LE(local + 26), extraLength = bytes.readUInt16LE(local + 28)
  const start = local + 30 + nameLength + extraLength, data = bytes.subarray(start, start + entry.compressed)
  if (data.length !== entry.compressed) throw new Error('HAP entry data is truncated: ' + name)
  if (entry.method === 0) return Buffer.from(data)
  if (entry.method === 8) return inflateRawSync(data)
  throw new Error('HAP entry uses an unsupported compression method: ' + name)
}

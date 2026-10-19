/** Pure sign/install policy for the exact current connection candidate. No filesystem, process, Java or device access. */
import { createHash } from 'node:crypto'
import { resolve, sep } from 'node:path'

/** The single candidate this deployment entry may sign and install; bytes and digest are fixed review results. */
export const CANDIDATE = Object.freeze({
  evidence: 'evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json',
  label: '2026-10-18T08-25-35-312Z-facc28ee',
  bytes: 5219694,
  sha256: '8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02',
  bundleName: 'local.dsh.mobile.offlineproduct',
  versionName: '0.0.0',
  versionCode: 1,
  permissions: Object.freeze(['ohos.permission.INTERNET']),
})

/** The original phone, existing HDC service and original HUKS public identity; none may be replaced. */
export const PHONE = Object.freeze({
  hdc: 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',
  server: '127.0.0.1:8710',
  targetRef: 'target-54cfb7ac',
  model: 'CMM-AL10',
  api: 26,
  alias: 'harmony-phase54-phone',
  fingerprint: 'p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99',
  certificateChainSha256: '83cccc2f34814563cc606e36f8e78b67273a33265fcc2cd56843627d30d46bd9',
})

/** Original signing project and official toolchain; materials are reused in place and never copied or regenerated. */
export const SIGNING = Object.freeze({
  ide: 'D:/Program Files/HuaWei/DevEco Studio',
  project: 'D:/Temp/dsh-harmony-layout-fix-signing-20261014',
  configuration: 'build-profile.json5',
  jarRelative: 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar',
  jarSha256: 'a434b6747e6c5d0b14e73837a46b39f4816ab25b42d1833d6f767bf867cf616d',
})

/** Retained predecessor packages must keep their recorded bytes; they are compared only. */
export const PREVIOUS = Object.freeze({
  signed: Object.freeze({ path: 'D:/Temp/dsh-harmony-mobile-normal-controls-signed.hap', sha256: 'b756d287608438d72439f6475a01e8a90a7a27c62e6e7fff121dae2e378d6607' }),
  predecessor: Object.freeze({ path: 'D:/Temp/dsh-harmony-mobile-20261017-phase76-signed.hap', sha256: 'a25381696f7e0c5e88cce5bd6390663df407f940ee422fed1a7d73acb8d42a6a' }),
})

/** Public attempt/result directory; one fixed attempt file prevents a new run from bypassing an unknown result. */
export const EVIDENCE_DIRECTORY = 'evidence/connection-deployment'
/** Attempt file; `prepare` creates it exactly once with exclusive creation. */
export const ATTEMPT_FILE = EVIDENCE_DIRECTORY + '/attempt.json'
/** New run directories live under this client-relative prefix. */
export const RUN_PREFIX = 'connection-deployment-'
/** Attempt schema; a different schema is never assumed compatible. */
export const ATTEMPT_SCHEMA = 'harmony-connection-deployment/1'
/** Exact commands this entry accepts. */
export const COMMANDS = Object.freeze(['plan', 'prepare', 'preflight', 'sign', 'verify-existing', 'install', 'inspect', 'launch', 'layout', 'input-alias', 'existing-identity', 'read-identity', 'capture'])
/** The user's in-session selection, recorded as the current authorization choice. It is not a Sentinel approval and not a token. */
export const AUTHORIZATION = Object.freeze({
  source: 'current-session-user-selection',
  choice: '核对并签装候选（Recommended）',
  sentinelApproval: null,
  fabricatedToken: false,
  note: 'Recorded from the delegating user request in this session. The director reviews before any actual operation.',
  scope: Object.freeze([
    'reuse the existing HDC service to check the original phone and API 26',
    'sign the exact reviewed candidate with the existing original signing materials',
    'verify the original certificate chain and unchanged application payload before installation',
    'install -r the same bundle while retaining application data',
    'check the new UI and read only the original HUKS public identity',
    'no uninstall, data clear, identity creation, pairing challenge, relay connection, desktop profile change or real model',
  ]),
})

/** @param {Buffer|Uint8Array|string} bytes - Bytes or text to digest. @returns {string} Lowercase SHA-256 hex digest. */
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

/** @param {string} serial - HDC target serial. @returns {string} Public reference derived the same way as earlier evidence. */
export function targetReference(serial) { return 'target-' + sha256(Buffer.from(serial, 'utf8')).slice(0, 8) }

/**
 * @param {object} artifact - Observed candidate bytes and digest.
 * @param {number} artifact.bytes - Observed byte length.
 * @param {string} artifact.sha256 - Observed digest.
 * @returns {{bytes: number, sha256: string}} The same values after an exact match.
 */
export function assertCandidateArtifact({ bytes, sha256: digest }) {
  if (bytes !== CANDIDATE.bytes) throw new Error('candidate HAP is ' + bytes + ' bytes; the reviewed candidate is ' + CANDIDATE.bytes)
  if (digest !== CANDIDATE.sha256) throw new Error('candidate HAP SHA-256 differs from the reviewed candidate')
  return { bytes, sha256: digest }
}

/**
 * Require the single approved original phone. Any extra, missing, re-serialized or different target stops deployment.
 * @param {object} observation - Read-only HDC target observation.
 * @param {string[]} observation.targets - Raw target rows from `list targets`.
 * @param {string} observation.model - `const.product.model` value.
 * @param {string|number} observation.api - `const.ohos.apiversion` value.
 * @returns {{targetReference: string, serial: string, model: string, api: number}} Verified observation.
 */
export function assertDeviceObservation({ targets, model, api }) {
  if (!Array.isArray(targets)) throw new Error('HDC target rows are unavailable')
  const rows = targets.filter(row => typeof row === 'string' && row.length > 0 && row !== '[Empty]')
  if (rows.length !== 1) throw new Error('exactly one HDC target is required; observed ' + rows.length)
  const serial = rows[0]
  if (serial.trim() !== serial || /[\r\n]/.test(serial)) throw new Error('HDC target row is not one clean serial')
  if (targetReference(serial) !== PHONE.targetRef) throw new Error('observed HDC target is not the approved original phone')
  assertDeviceFields({ model, api })
  return { targetReference: PHONE.targetRef, serial, model: PHONE.model, api: PHONE.api }
}

/**
 * @param {object} fields - Read-only device fields.
 * @param {string} fields.model - `const.product.model` value.
 * @param {string|number} fields.api - `const.ohos.apiversion` value.
 * @returns {{model: string, api: number}} Verified original-phone fields.
 */
export function assertDeviceFields({ model, api }) {
  if (model !== PHONE.model) throw new Error('device model ' + model + ' is not the approved original phone')
  if (String(api) !== String(PHONE.api)) throw new Error('device API ' + api + ' is not the approved API ' + PHONE.api)
  return { model: PHONE.model, api: PHONE.api }
}

/**
 * @param {object} metadata - `bm dump -n <bundle>` application fields after normalization.
 * @param {string} metadata.bundleName - Installed bundle name.
 * @param {string} metadata.versionName - Installed version name.
 * @param {number} metadata.versionCode - Installed version code.
 * @param {string[]} [metadata.permissions] - Optional installed permission names.
 * @returns {{bundleName: string, versionName: string, versionCode: number, permissions: string[]|undefined}} Verified metadata.
 */
export function assertInstalledMetadata(metadata) {
  if (metadata === null || typeof metadata !== 'object') throw new Error('installed bundle metadata is unavailable')
  if (metadata.bundleName !== CANDIDATE.bundleName) throw new Error('installed bundle name differs from the candidate')
  if (metadata.versionName !== CANDIDATE.versionName || metadata.versionCode !== CANDIDATE.versionCode) throw new Error('installed bundle version differs from the candidate')
  let permissions
  if (metadata.permissions !== undefined) {
    if (!Array.isArray(metadata.permissions)) throw new Error('installed permission list is malformed')
    permissions = metadata.permissions.map(row => typeof row === 'string' ? row : row?.name)
    if (JSON.stringify(permissions) !== JSON.stringify(CANDIDATE.permissions)) throw new Error('installed permissions differ from the INTERNET-only candidate')
  }
  return { bundleName: metadata.bundleName, versionName: metadata.versionName, versionCode: metadata.versionCode, permissions }
}

/** @param {string} digest - Certificate chain digest from official `verify-app`. @returns {string} The verified original digest. */
export function assertCertificateChain(digest) {
  if (digest !== PHONE.certificateChainSha256) throw new Error('certificate chain is not the original approved chain')
  return digest
}

/**
 * Compare the public ZIP payload. Signing may add only the SDK-derived `.pages.info`; every application entry must keep
 * its name, byte count and digest.
 * @param {object} payload - Public payload report plus the regenerated page bitmap.
 * @param {object[]} payload.inputEntries - Unsigned HAP entries sorted by path.
 * @param {object[]} payload.signedEntries - Signed HAP entries sorted by path.
 * @param {object} payload.pagesInfo - Regenerated `.pages.info` bytes and digest.
 * @returns {{applicationEntryCount: number, signingMetadataAddition: {path: string, bytes: number, sha256: string}}} Verified difference.
 */
export function assertPayload({ inputEntries, signedEntries, pagesInfo }) {
  const before = entryMap(inputEntries, 'unsigned HAP'), after = entryMap(signedEntries, 'signed HAP')
  if (before.has('.pages.info')) throw new Error('unsigned candidate already contains signing metadata')
  const additions = [], removed = []
  for (const [path, row] of before) {
    const next = after.get(path)
    if (next === undefined) { removed.push(path); continue }
    if (next.bytes !== row.bytes || next.sha256 !== row.sha256) throw new Error('signed payload changed the application entry: ' + path)
  }
  for (const path of after.keys()) if (!before.has(path)) additions.push(path)
  if (removed.length > 0) throw new Error('signed payload removed application entries: ' + removed.join(', '))
  if (additions.length !== 1 || additions[0] !== '.pages.info') throw new Error('signed payload must add exactly the `.pages.info` page bitmap')
  const addition = after.get('.pages.info')
  if (pagesInfo === null || typeof pagesInfo !== 'object') throw new Error('SDK-derived page bitmap is unavailable')
  if (addition.bytes !== pagesInfo.bytes || addition.sha256 !== pagesInfo.sha256) throw new Error('signed `.pages.info` differs from the SDK-derived bitmap')
  return { applicationEntryCount: before.size, signingMetadataAddition: { path: '.pages.info', bytes: addition.bytes, sha256: addition.sha256 } }
}

/** @param {object[]} entries - Report rows. @param {string} subject - Error subject. @returns {Map<string, object>} Unique rows by path. */
function entryMap(entries, subject) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(subject + ' entries are unavailable')
  const map = new Map()
  for (const row of entries) {
    if (row === null || typeof row !== 'object' || typeof row.path !== 'string' || row.path.length === 0) throw new Error(subject + ' entry is malformed')
    if (row.path.includes('\\') || row.path.startsWith('/') || row.path.split('/').includes('..')) throw new Error(subject + ' entry path is invalid')
    if (map.has(row.path)) throw new Error(subject + ' contains a duplicate entry')
    if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[0-9a-f]{64}$/.test(row.sha256 ?? '')) throw new Error(subject + ' entry digest is malformed')
    map.set(row.path, row)
  }
  return map
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @returns {object} The same attempt after its ownership, candidate and recorded authorization choice are verified.
 */
export function assertAttempt(attempt) {
  if (attempt === null || typeof attempt !== 'object') throw new Error('deployment attempt is unavailable')
  if (attempt.schema !== ATTEMPT_SCHEMA) throw new Error('deployment attempt schema is not ' + ATTEMPT_SCHEMA)
  if (typeof attempt.label !== 'string' || !/^connection-deployment-[A-Za-z0-9_-]+$/.test(attempt.label)) throw new Error('deployment attempt label is outside the owned prefix')
  if (attempt.ownedRun?.label !== attempt.label || attempt.ownedRun?.directory !== '.build/' + attempt.label) throw new Error('deployment attempt run ownership differs from its label')
  if (attempt.candidate?.evidence !== CANDIDATE.evidence) throw new Error('deployment attempt references a different candidate evidence file')
  if (attempt.candidate?.bytes !== CANDIDATE.bytes || attempt.candidate?.sha256 !== CANDIDATE.sha256) throw new Error('deployment attempt references a different candidate artifact')
  if (attempt.phone?.targetRef !== PHONE.targetRef || attempt.phone?.server !== PHONE.server || attempt.phone?.model !== PHONE.model || attempt.phone?.api !== PHONE.api) throw new Error('deployment attempt targets a different device')
  if (attempt.signing?.jarSha256 !== SIGNING.jarSha256 || attempt.signing?.materialsReused !== true || attempt.signing?.materialsRegenerated !== false) throw new Error('deployment attempt does not reuse the original signing toolchain')
  for (const key of ['prepare', 'preflight', 'sign', 'install', 'inspect', 'launch']) {
    if (typeof attempt.steps?.[key]?.status !== 'string') throw new Error('deployment attempt has no ' + key + ' step')
  }
  if (attempt.authorization?.source !== AUTHORIZATION.source) throw new Error('deployment attempt authorization source is not the current user selection')
  if (attempt.authorization?.sentinelApproval !== null || attempt.authorization?.fabricatedToken !== false) throw new Error('deployment attempt must not claim a prior approval or a fabricated token')
  return attempt
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @returns {object} The same attempt when a first preflight observation is still allowed.
 */
export function assertPreflightGuard(attempt) {
  assertAttempt(attempt)
  if (attempt.steps.prepare.status !== 'completed') throw new Error('deployment preparation did not complete')
  if (attempt.steps.sign.status !== 'pending' || attempt.steps.install.status !== 'pending') throw new Error('preflight is closed after signing or installation began')
  if (attempt.steps.preflight.status === 'completed' && attempt.preflight?.passed === true) throw new Error('preflight already passed; reuse its observation instead of repeating it')
  if (!['pending', 'failed'].includes(attempt.steps.preflight.status)) throw new Error('preflight status requires review')
  return attempt
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @returns {object} The same attempt when signing has not started.
 */
export function assertSignGuard(attempt) {
  assertAttempt(attempt)
  if (attempt.steps.preflight.status !== 'completed' || attempt.preflight?.passed !== true) throw new Error('preflight must pass before signing')
  if (attempt.steps.sign.status !== 'pending') throw new Error('signing was already attempted; unknown or failed signing is verified, never re-signed')
  if (attempt.steps.install.status !== 'pending') throw new Error('installation already began; signing is closed')
  if (attempt.signed !== null) throw new Error('a signed result is already recorded')
  return attempt
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @param {Set<string>} [claimed] - Actions whose fixed claim file exists.
 * @returns {object} The same attempt when retained-output verification may run. A sign claim permits read-only
 * recovery even if the journal still says pending because that process stopped before it could record `started`.
 */
export function assertVerifyExistingGuard(attempt, claimed = new Set()) {
  assertAttempt(attempt)
  if (attempt.steps.preflight.status !== 'completed' || attempt.preflight?.passed !== true) throw new Error('preflight must pass before verifying a signed output')
  if (!claimed.has('sign') && !['started', 'unknown', 'completed'].includes(attempt.steps.sign.status)) throw new Error('no signing attempt exists to verify')
  if (attempt.steps.install.status !== 'pending') throw new Error('installation already began; retained-output verification is closed')
  return attempt
}

/**
 * Installation is allowed only from a verified signed result that names this candidate, the original chain and an
 * unchanged application payload, and only if no installation attempt exists.
 * @param {object} attempt - Fixed attempt journal.
 * @param {object} signed - Verified signed result.
 * @returns {object} The same attempt when one `install -r` is allowed.
 */
export function assertInstallGuard(attempt, signed) {
  assertAttempt(attempt)
  if (attempt.steps.preflight.status !== 'completed' || attempt.preflight?.passed !== true) throw new Error('preflight must pass before installation')
  if (!['completed', 'unknown'].includes(attempt.steps.sign.status)) throw new Error('signing did not reach a retained output')
  if (attempt.steps.install.status !== 'pending') throw new Error('installation was already attempted; never replay an unknown or completed installation')
  if (signed === null || typeof signed !== 'object') throw new Error('verified signed result is required before installation')
  if (signed.label !== attempt.label) throw new Error('signed result belongs to a different attempt')
  if (signed.verified !== true) throw new Error('signed result is not verified')
  if (signed.inputSha256 !== CANDIDATE.sha256) throw new Error('signed result was produced from a different candidate')
  if (signed.certificateChainSha256 !== PHONE.certificateChainSha256) throw new Error('signed result was not verified with the original certificate chain')
  if (signed.payloadIdentical !== true || signed.signingMetadataAddition?.path !== '.pages.info') throw new Error('signed result payload is not the unchanged application payload')
  if (signed.packageSignerExecutions !== 1) throw new Error('signed result does not record exactly one signer execution')
  return attempt
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @param {Set<string>} [claimed] - Actions whose fixed claim file exists.
 * @returns {object} The same attempt when post-install inspection may run; it may also diagnose an unknown result or
 * a stopped process whose install claim exists before the journal recorded `started`.
 */
export function assertInspectGuard(attempt, claimed = new Set()) {
  assertAttempt(attempt)
  if (!claimed.has('install') && !['started', 'unknown', 'completed'].includes(attempt.steps.install.status)) throw new Error('inspection requires an installation attempt')
  return attempt
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @returns {object} The same attempt when launching is allowed from a known-successful install and matching metadata.
 */
export function assertLaunchGuard(attempt) {
  assertAttempt(attempt)
  if (attempt.steps.install.status !== 'completed' || attempt.install?.success !== true) throw new Error('launch requires a known-successful installation, not an unknown result')
  if (attempt.steps.inspect.status !== 'completed' || attempt.inspect?.passed !== true || attempt.inspect?.installKnown !== true) throw new Error('launch requires a passed inspection of the known-successful installation')
  if (attempt.steps.launch.status !== 'pending') throw new Error('launch was already attempted; inspect the device instead of replaying it')
  return attempt
}

/**
 * @param {object} attempt - Parsed attempt journal.
 * @param {Set<string>} [claimed] - Actions whose fixed claim file already exists; claimed actions are never repeated.
 * @returns {string[]} Commands the attempt still permits. Unknown or verification-failed outcomes route to read-only
 * recovery only.
 */
export function nextCommands(attempt, claimed = new Set()) {
  const steps = attempt.steps ?? {}
  const status = key => steps[key]?.status
  if (status('prepare') !== 'completed') return ['prepare']
  if (status('preflight') !== 'completed' || attempt.preflight?.passed !== true) return ['preflight']
  const signedKnown = attempt.signed?.verified === true
  if (!signedKnown) {
    if (claimed.has('sign') || status('sign') === 'started' || status('sign') === 'unknown') return ['verify-existing']
    if (status('sign') !== 'completed') return ['sign']
    return ['verify-existing']
  }
  if (status('install') === 'started' || status('install') === 'unknown' || (claimed.has('install') && status('install') !== 'completed')) return ['inspect']
  if (status('install') === 'pending') return ['install']
  if (status('inspect') !== 'completed') return ['inspect']
  if (status('launch') === 'started' || status('launch') === 'unknown' || (claimed.has('launch') && status('launch') !== 'completed')) return ['inspect', 'layout']
  if (status('launch') !== 'completed') return ['launch']
  const actions = attempt.actions ?? {}
  const next = ['layout']
  if (!claimed.has('input-alias') && (actions['input-alias']?.status ?? 'pending') === 'pending') next.push('input-alias')
  if (!claimed.has('existing-identity') && (actions['existing-identity']?.status ?? 'pending') === 'pending') next.push('existing-identity')
  next.push('read-identity', 'capture')
  return next
}

/**
 * @param {object} attempt - Fixed attempt journal.
 * @param {string} action - `layout`, `input-alias`, `existing-identity`, `read-identity` or `capture`.
 * @param {Set<string>} [claimed] - Actions whose fixed claim file exists.
 * @returns {object} The same attempt when the UI action is allowed. Only `layout` remains available as a read-only
 * diagnostic after an unknown launch or a stopped process whose launch claim exists; one-shot input actions require a
 * completed launch and a still-pending action.
 */
export function assertUiGuard(attempt, action, claimed = new Set()) {
  assertAttempt(attempt)
  if (attempt.steps.install.status !== 'completed' || attempt.install?.success !== true) throw new Error('UI actions require a known-successful installation')
  if (attempt.steps.inspect.status !== 'completed' || attempt.inspect?.passed !== true || attempt.inspect?.installKnown !== true) throw new Error('UI actions require a passed inspection of the known-successful installation')
  if (!['layout', 'input-alias', 'existing-identity', 'read-identity', 'capture'].includes(action)) throw new Error('unknown UI action')
  if (action === 'layout') {
    if (!claimed.has('launch') && !['completed', 'started', 'unknown'].includes(attempt.steps.launch.status)) throw new Error('layout requires a launch attempt or a completed launch')
  } else if (attempt.steps.launch.status !== 'completed') throw new Error('UI actions require a completed launch')
  if (['input-alias', 'existing-identity'].includes(action) && (attempt.actions?.[action]?.status ?? 'pending') !== 'pending') throw new Error(action + ' was already attempted; hidden controls require manual review, not a blind repeat')
  return attempt
}

/**
 * Restrict every external command to the read-only checks, one in-place install and the app-owned UI actions.
 * @param {string[]} args - Full HDC argument list.
 * @param {object} context - Values the caller owns for this invocation.
 * @param {string} [context.target] - Resolved serial; required for target-scoped commands.
 * @param {string} [context.artifactPath] - Signed HAP path; required for install.
 * @param {string} [context.runDirectory] - Run directory; received files must stay inside it.
 * @param {string} [context.alias] - Original phone alias for `inputText`.
 * @returns {string} The admitted command category.
 */
export function assertHdcInvocation(args, context = {}) {
  if (!Array.isArray(args) || args.length < 5) throw new Error('HDC invocation is not a recognized command')
  if (args[0] !== '-p' || args[1] !== '-s' || args[2] !== PHONE.server) throw new Error('HDC must reuse only the existing server -p -s ' + PHONE.server)
  if (args[3] === 'list' && args[4] === 'targets' && args.length === 5) return 'list-targets'
  if (args[3] !== '-t') throw new Error('HDC command must be target-scoped with -t')
  if (typeof context.target !== 'string' || context.target.length === 0 || args[4] !== context.target) throw new Error('HDC command targets an unapproved device')
  const rest = args.slice(5)
  if (same(rest, ['shell', 'param', 'get', 'const.product.model'])) return 'device-model'
  if (same(rest, ['shell', 'param', 'get', 'const.ohos.apiversion'])) return 'device-api'
  if (rest.length === 5 && same(rest.slice(0, 4), ['shell', 'bm', 'dump', '-n']) && rest[4] === CANDIDATE.bundleName) return 'bundle-metadata'
  if (same(rest, ['shell', 'pidof', CANDIDATE.bundleName])) return 'process-id'
  if (same(rest, ['shell', 'aa', 'start', '-b', CANDIDATE.bundleName, '-m', 'entry', '-a', 'EntryAbility'])) return 'launch'
  if (rest.length === 9 && same(rest.slice(0, 7), ['shell', 'uitest', 'dumpLayout', '-b', CANDIDATE.bundleName, '-m', 'false']) && rest[7] === '-p' && remote(rest[8], 'json')) return 'layout'
  if (rest.length === 4 && same(rest.slice(0, 2), ['file', 'recv']) && remote(rest[2], '(?:json|jpeg)') && inside(context.runDirectory, rest[3])) return 'receive-file'
  if (rest.length === 4 && same(rest.slice(0, 3), ['shell', 'snapshot_display', '-f']) && remote(rest[3], 'jpeg')) return 'capture'
  if (rest.length === 7 && same(rest.slice(0, 4), ['shell', 'uitest', 'uiInput', 'inputText']) && digits(rest[4]) && digits(rest[5]) && rest[6] === context.alias) return 'input-text'
  if (rest.length === 6 && same(rest.slice(0, 4), ['shell', 'uitest', 'uiInput', 'click']) && digits(rest[4]) && digits(rest[5])) return 'click'
  if (rest.length === 3 && rest[0] === 'install' && rest[1] === '-r' && typeof context.artifactPath === 'string' && resolvePath(rest[2]) === resolvePath(context.artifactPath)) return 'install-in-place'
  throw new Error('HDC command is outside the deployment command allowlist')
}

/** @param {string[]} left - Observed arguments. @param {string[]} right - Expected arguments. @returns {boolean} Whether both are identical. */
function same(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]) }
/** @param {string} value - Coordinate candidate. @returns {boolean} Whether it is a non-negative integer string. */
function digits(value) { return typeof value === 'string' && /^[0-9]+$/.test(value) }
/** @param {string} value - Remote path candidate. @param {string} extension - Required extension expression. @returns {boolean} Whether it is an owned temporary path. */
function remote(value, extension) { return typeof value === 'string' && new RegExp('^/data/local/tmp/connection-deployment-[A-Za-z0-9._-]+\\.' + extension + '$').test(value) }
/** @param {string} directory - Owned run directory. @param {string} value - Received local path. @returns {boolean} Whether the path stays inside the run directory. */
function inside(directory, value) {
  if (typeof directory !== 'string' || directory.length === 0 || typeof value !== 'string' || value.length === 0) return false
  const base = resolve(directory), target = resolve(value)
  return target.startsWith(base + sep)
}
/** @param {string} value - Path to compare with this platform's separators. @returns {string} Normalized path. */
function resolvePath(value) { return value.replaceAll('/', '\\') }

/**
 * @param {object} tree - Raw `dumpLayout` JSON.
 * @returns {object[]} Flattened attribute objects for every node.
 */
export function parseLayoutTree(tree) {
  const nodes = []
  const visit = value => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value === null || typeof value !== 'object') return
    if (value.attributes !== undefined) {
      if (value.attributes === null || typeof value.attributes !== 'object') throw new Error('layout node attributes are malformed')
      nodes.push(value.attributes)
    }
    if (value.children !== undefined) visit(value.children)
  }
  visit(tree)
  return nodes
}

/**
 * @param {object} tree - Raw `dumpLayout` JSON.
 * @param {object} expected - Owned bundle.
 * @param {string} expected.bundle - Candidate bundle name.
 * @returns {{owned: boolean, foreign: boolean, nodes: object[], safe: object[]}} Layout assessment; text that starts with JSON is omitted.
 */
export function assessLayout(tree, { bundle }) {
  const nodes = parseLayoutTree(tree)
  const owned = nodes.some(node => node.bundleName === bundle)
  const foreign = nodes.some(node => typeof node.bundleName === 'string' && node.bundleName.length > 0 && node.bundleName !== bundle)
  const safe = nodes.map(node => ({
    type: node.type, id: node.id, hint: node.hint, bounds: node.bounds, visible: node.visible, enabled: node.enabled, checked: node.checked,
    text: typeof node.text === 'string' && node.text.startsWith('{') ? '[public JSON omitted]' : node.text,
  }))
  return { owned, foreign, nodes, safe }
}

/**
 * @param {{owned: boolean, foreign: boolean}} assessment - Layout assessment.
 * @returns {{owned: true, foreign: false}} The same safe assessment.
 */
export function assertOwnedLayout(assessment) {
  if (assessment.owned !== true) throw new Error('the owned application window is not present')
  if (assessment.foreign !== false) throw new Error('a foreign overlay is present; no input is permitted')
  return { owned: true, foreign: false }
}

/**
 * @param {object[]} nodes - Flattened layout attributes.
 * @param {(node: object) => boolean} predicate - Control identity, never a coordinate.
 * @param {string} description - Control description for the failure.
 * @returns {object} The single visible, enabled match.
 */
export function findSingleControl(nodes, predicate, description) {
  const found = nodes.filter(node => node.visible === 'true' && node.enabled !== 'false' && predicate(node))
  if (found.length !== 1) throw new Error('exactly one visible enabled control is required for ' + description + '; found ' + found.length + '; hidden controls require manual review')
  return found[0]
}

/** @param {string} bounds - `[left,top][right,bottom]` bounds. @returns {[string, string]} Integer center point. */
export function controlPoint(bounds) {
  const parts = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(typeof bounds === 'string' ? bounds : '')
  if (parts === null) throw new Error('control bounds are malformed')
  const [left, top, right, bottom] = parts.slice(1).map(Number)
  if (!(right > left && bottom > top)) throw new Error('control bounds have no clickable area')
  return [String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))]
}

/**
 * Reject a layout that shows or enables a connection after launch. Boot may load and verify existing public trust,
 * but it must leave the connection disconnected until a human activates it.
 * @param {{nodes: object[]}} assessment - Layout assessment.
 * @param {object} labels - Public native labels for the connection state and control.
 * @returns {{inactive: true}} The same verified inactive launch state.
 */
export function assertLaunchLayout(assessment, labels) {
  const visible = assessment.nodes.filter(node => node.visible === 'true')
  const texts = visible.map(node => node.text)
  if (texts.includes(labels.failed)) throw new Error('the application reports a failure at launch; stop and inspect')
  if (texts.includes(labels.connected) || texts.includes(labels.connecting)) throw new Error('the connection is active at launch; stop and inspect')
  if (!texts.includes(labels.disconnected) && !texts.includes(labels.stopped)) throw new Error('the expected disconnected or stopped state is not visible')
  const connect = visible.find(node => node.text === labels.connect)
  if (connect !== undefined && connect.enabled !== 'false') throw new Error('the connect control is enabled; no UI input is permitted')
  return { inactive: true }
}

/**
 * @param {object[]} nodes - Flattened layout attributes.
 * @param {string} alias - Original phone alias.
 * @returns {object[]} Public identity JSON objects for that alias, in layout order.
 */
export function identityCandidates(nodes, alias) {
  const found = []
  for (const node of nodes) {
    if (typeof node.text !== 'string' || !node.text.startsWith('{')) continue
    let value
    try { value = JSON.parse(node.text) } catch (error) { if (error instanceof SyntaxError) continue; throw error }
    if (value !== null && typeof value === 'object' && value.identityAlias === alias && typeof value.publicSpki === 'string') found.push(value)
  }
  return found
}

/**
 * @param {object[]} nodes - Flattened layout attributes.
 * @param {string} alias - Original phone alias.
 * @returns {object} The single public identity JSON object for that alias.
 */
export function identityFromNodes(nodes, alias) {
  const found = identityCandidates(nodes, alias)
  if (found.length !== 1) throw new Error('exactly one public identity for the original alias is required; found ' + found.length + '; hidden output requires manual review')
  return found[0]
}

/**
 * Decode the public SPKI, hash its bytes and require that digest and the projected credential text both match the
 * original public fingerprint.
 * @param {object} identity - Parsed public identity text.
 * @param {object} expected - Original public identity.
 * @param {string} expected.alias - Original alias.
 * @param {string} expected.fingerprint - Original public fingerprint (`p256-sha256-<hex>`).
 * @returns {{identityAlias: string, credentialId: string, publicSpki: string}} Sanitized public identity.
 */
export function assertPublicIdentity(identity, expected) {
  if (identity === null || typeof identity !== 'object') throw new Error('public identity is unavailable')
  const keys = Object.keys(identity).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['credentialId', 'identityAlias', 'publicSpki'])) throw new Error('public identity fields differ from the app-owned projection')
  if (identity.identityAlias !== expected.alias) throw new Error('public identity alias differs from the original phone alias')
  if (identity.credentialId !== expected.fingerprint) throw new Error('public identity fingerprint differs from the original HUKS public fingerprint')
  if (!/^[A-Za-z0-9_-]{10,2048}$/.test(identity.publicSpki)) throw new Error('public SPKI is not URL-safe base64')
  const spki = Buffer.from(identity.publicSpki, 'base64url')
  if (spki.length === 0 || spki.toString('base64url') !== identity.publicSpki) throw new Error('public SPKI is not canonical URL-safe base64')
  if (expected.fingerprint !== 'p256-sha256-' + sha256(spki)) throw new Error('public SPKI digest differs from the original HUKS public fingerprint')
  return { identityAlias: identity.identityAlias, credentialId: identity.credentialId, publicSpki: identity.publicSpki }
}

/**
 * @param {string} stdout - `bm dump -n <bundle>` output.
 * @returns {object} Parsed dump object.
 */
export function parseBundleDump(stdout) {
  if (typeof stdout !== 'string') throw new Error('bundle metadata output is unavailable')
  const index = stdout.indexOf('{')
  if (index < 0) throw new Error('bundle metadata output has no JSON object')
  let value
  try { value = JSON.parse(stdout.slice(index)) } catch (error) { throw new Error('bundle metadata output is not valid JSON: ' + (error instanceof SyntaxError ? 'syntax' : 'unknown')) }
  if (value === null || typeof value !== 'object') throw new Error('bundle metadata output is not an object')
  return value
}

/**
 * @param {object} dump - Parsed `bm dump` object.
 * @returns {{bundleName: string, versionName: string, versionCode: number, permissions: string[]|undefined}} Normalized installed metadata.
 */
export function installedMetadata(dump) {
  const application = dump?.applicationInfo
  const bundleName = application?.bundleName ?? dump?.name
  const requestPermissions = application?.requestPermissions ?? dump?.requestPermissions
  return {
    bundleName,
    versionName: dump?.versionName,
    versionCode: dump?.versionCode,
    permissions: Array.isArray(requestPermissions) && requestPermissions.length > 0 ? requestPermissions.map(row => typeof row === 'string' ? row : row?.name) : undefined,
  }
}

/** @param {string} text - Raw command output. @param {object} options - Sanitization options. @param {string} [options.target] - Serial to redact. @param {number} [options.limit] - Output cap. @returns {string} Bounded output with the serial replaced. */
export function sanitizeOutput(text, { target, limit = 8192 } = {}) {
  const raw = typeof text === 'string' ? text : ''
  const redacted = target === undefined || target.length === 0 ? raw : raw.replaceAll(target, '[approved target]')
  return redacted.slice(0, limit)
}

/**
 * @param {Date} now - Start time.
 * @param {string} suffix - Lowercase hex suffix.
 * @returns {string} Fresh run label accepted by the attempt and run-directory guards.
 */
export function nextRunLabel(now = new Date(), suffix) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('run label requires a valid start time')
  if (typeof suffix !== 'string' || !/^[0-9a-f]{6,16}$/.test(suffix)) throw new Error('run label suffix must be six to sixteen lowercase hex characters')
  return RUN_PREFIX + now.toISOString().replace(/\D/g, '').slice(0, 15) + '-' + suffix
}

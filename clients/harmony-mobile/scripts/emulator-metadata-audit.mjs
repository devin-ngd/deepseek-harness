/** Read installed emulator metadata and explicit license state without invoking executable tools. */
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, join } from 'node:path'

const names = ['HarmonyOS_Software_Service_Agreement', 'HarmonyOS_SDK_Agreement']
const sha256 = value => createHash('sha256').update(value).digest('hex')

/** A failed file read or untrusted license state; the audit never repairs it. */
export class EmulatorAuditError extends Error {
  /**
   * Describe an audit failure with a stable code.
   * @param code - Operation or validation failure discriminator.
   * @param message - Readable operation failure.
   * @param cause - Underlying file or parsing failure, when available.
   */
  constructor(code, message, cause) { super(message, { cause }); this.name = 'EmulatorAuditError'; this.code = code }
}

/**
 * Parse the two known official license fields; no acceptance is inferred from absent fields.
 * @param text - UTF-8 contents of the explicitly selected configuration file.
 * @returns The software and SDK agreement values.
 * @throws {EmulatorAuditError} If a known field is absent, duplicated or has another value.
 */
export function parseEmulatorLicense(text) {
  const result = {}
  for (const name of names) {
    const matches = text.split(/\r?\n/u).filter(line => line.startsWith(name + ':'))
    if (matches.length !== 1) throw new EmulatorAuditError('license-field-count', 'Each known license field must occur exactly once')
    const value = matches[0].slice(name.length + 1)
    if (value !== 'agree' && value !== 'disagree') throw new EmulatorAuditError('license-field-value', 'A known license field has an unsupported value')
    result[name] = value
  }
  return result
}

async function licenseSnapshot(path) {
  try {
    const bytes = await readFile(path), metadata = await stat(path)
    return { bytes: bytes.length, sha256: sha256(bytes), modifiedUtc: metadata.mtime.toISOString(), createdUtc: metadata.birthtime.toISOString(), fields: parseEmulatorLicense(bytes.toString('utf8')) }
  } catch (error) {
    if (error instanceof EmulatorAuditError) throw error
    throw new EmulatorAuditError('license-unavailable', 'The explicit license file cannot be read; its state is unconfirmed', error)
  }
}

/**
 * Read public metadata, public agreement digests and the selected configuration file.
 * @param request - Absolute installed-tool directory and explicit license-file path.
 * @returns Observed metadata and a stable license snapshot. No executable or network call is made.
 * @throws {EmulatorAuditError} If paths, metadata or license state cannot be confirmed, or the snapshot changes during the read.
 */
export async function auditEmulatorMetadata(request) {
  if (!isAbsolute(request.installedDirectory) || !isAbsolute(request.licenseFile)) throw new EmulatorAuditError('absolute-path-required', 'Installed directory and license file must be explicit absolute paths')
  const before = await licenseSnapshot(request.licenseFile)
  let metadata, profiles
  try {
    metadata = JSON.parse(await readFile(join(request.installedDirectory, 'sdk-pkg.json'), 'utf8'))
    profiles = JSON.parse(await readFile(join(request.installedDirectory, 'emulator.json'), 'utf8'))
    if (!Array.isArray(profiles) || profiles.some(row => typeof row !== 'object' || row === null || typeof row.deviceType !== 'string'
      || (row.deviceType === 'phone' && (!Number.isSafeInteger(row.api) || row.api < 1)))) throw Error('Invalid installed phone profile metadata')
  } catch (error) {
    throw new EmulatorAuditError('metadata-unavailable', 'Installed emulator metadata cannot be confirmed', error)
  }
  const agreements = []
  for (const name of ['HarmonyOS_SDK_Agreement.txt', 'HarmonyOS_Software_Service_Agreement.txt']) {
    try {
      const bytes = await readFile(join(request.installedDirectory, 'agreement', name))
      agreements.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
    } catch (error) {
      throw new EmulatorAuditError('agreement-unavailable', 'Installed public agreement files cannot be confirmed', error)
    }
  }
  const after = await licenseSnapshot(request.licenseFile)
  if (before.sha256 !== after.sha256 || before.modifiedUtc !== after.modifiedUtc) throw new EmulatorAuditError('license-changed-during-read', 'License state changed during the audit; no stable state is reported')
  return { schema: 'native-emulator-metadata-only/2', generatedAt: new Date().toISOString(), installedTool: request.installedDirectory, metadata,
    phoneProfileApis: [...new Set(profiles.filter(row => row.deviceType === 'phone').map(row => row.api))].sort((a, b) => a - b),
    agreements, license: { path: request.licenseFile, ...after, stableBetweenReads: true, rawFileCopied: false },
    commands: [], emulatorExecutableInvocations: 0, executableMetadataProbeInvoked: false, acceptedNewAgreement: false,
    licenseFlagsWritten: false, emulatorStarted: false, imageInstalled: false, securitySettingsChanged: false,
    qualification: 'Observed license fields and installed files only; this audit does not establish native execution or identify the process that last wrote the license file.' }
}

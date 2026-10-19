/** Audit installed files and explicit license state; never invoke Emulator.exe or overwrite historical evidence. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, isAbsolute } from 'node:path'
import { auditEmulatorMetadata, EmulatorAuditError } from './emulator-metadata-audit.mjs'

const client = resolve(import.meta.dirname, '..')
const options = {}
try {
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index], value = process.argv[index + 1]
    if (!['--license-file', '--installed-directory', '--output-directory'].includes(name) || !value || !isAbsolute(value) || options[name] !== undefined) throw new EmulatorAuditError('invalid-arguments', 'Use an explicit --license-file absolute path and optional absolute --installed-directory / --output-directory paths')
    options[name] = value
  }
  if (options['--license-file'] === undefined) throw new EmulatorAuditError('license-path-required', 'Select the known official license-file path explicitly; LOCALAPPDATA is not used to choose another profile')
  const platform = JSON.parse(await readFile(join(client, 'harmony/platform.json'), 'utf8'))
  const result = await auditEmulatorMetadata({ installedDirectory: options['--installed-directory'] ?? join(platform.installedIdeDirectory, 'tools/emulator'), licenseFile: options['--license-file'] })
  const directory = options['--output-directory'] ?? join(client, 'evidence/emulator-metadata-audit')
  await mkdir(directory, { recursive: true })
  const file = join(directory, result.generatedAt.replaceAll(':', '-').replaceAll('.', '-') + '.json')
  await writeFile(file, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ evidence: file, emulatorExecutableInvocations: 0, licenseFields: result.license.fields, stableBetweenReads: true, historicalEvidenceReplaced: false }))
} catch (error) {
  console.error(JSON.stringify(error instanceof EmulatorAuditError ? { code: error.code, message: error.message } : { code: 'audit-failed', message: 'Metadata audit did not complete; no license state is confirmed' }))
  process.exitCode = 1
}

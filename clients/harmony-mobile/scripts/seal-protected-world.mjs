/** Seal only the reviewed client delta and synthetic evidence; never collect profile homes, credentials or native signing files. */
import { readFile, writeFile, readdir, mkdir, mkdtemp, copyFile, access } from 'node:fs/promises'
import { join, resolve, dirname, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const project = resolve('.'), candidate = resolve('.build/protected-world-candidate'), stage = await mkdtemp(join(project, '.build/phase52-delivery-'))
const runtimeZip = 'D:/Temp/dsh-harmony-replay-profile-0.0.0-first-use.3.zip', sourceZip = 'D:/Temp/dsh-harmony-protected-world-20261014-delta.zip'
const paths = [
  'README.md', 'desktop-plugin/README.md', 'desktop-plugin/package.json',
  ...['identity', 'secret-protection', 'windows-protection', 'ports', 'index'].map(name => 'desktop-plugin/src/' + name + '.ts'),
  ...['field', 'field-config', 'field-world', 'restart-fixture', 'dsh-entry', 'index'].map(name => 'replay-profile/src/' + name + '.ts'),
  ...['field-launch.mjs', 'field.enabled.example.json', 'FIELD.md'].map(name => 'replay-profile/' + name),
  ...['first-use-wiring', 'first-use-refusals', 'fixed-identity-protection', 'protected-identity', 'field-world', 'durable-ports', 'replay-host'].map(name => 'integration/' + name + (['fixed-identity-protection', 'replay-host'].includes(name) ? '.ts' : '.spec.ts')),
  'integration/protected-identity.vitest.config.mjs',
  ...['build-replay-profile', 'protected-identity-test', 'field-restart-test', 'detached-protected-world-test', 'protected-world-flow-test', 'protected-world-record-pair', 'seal-protected-world'].map(name => 'scripts/' + name + '.mjs'),
  'docs/tasks.md', 'docs/acceptance.md', 'docs/phase52-protected-world.md',
  ...['guide.md', 'guide.zh.md', 'guide.i18n.yaml'].map(name => 'docs/upgrade-guide/v0.2.1-alpha.2/protected-desktop-world/' + name),
  ...(await readdir('evidence')).filter(name => name.startsWith('phase52-') && name !== 'phase52-deliverables.json').map(name => 'evidence/' + name),
]
const records = []
for (const path of paths) {
  const bytes = await readFile(path), text = bytes.toString('utf8')
  if (extname(path) !== '.log') assert.ok(text.endsWith('\n') && !text.endsWith('\n\n') && !text.includes('\r\n'), 'LF formatting: ' + path)
  if (extname(path) === '.md') for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^https?:|^#/.test(match[1]) || match[1] === '../evidence/phase52-deliverables.json') continue
    await access(resolve(dirname(path), match[1].split('#')[0]))
  }
  const output = join(stage, path); await mkdir(dirname(output), { recursive: true }); await copyFile(path, output)
  records.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), retainedDiagnostic: extname(path) === '.log' })
}
const build = JSON.parse(await readFile(join(candidate, 'build-info.json'), 'utf8'))
assert.equal(build.version, '0.0.0-first-use.3')
assert.equal(build.sourceInputs.some(row => /(?:fixed-identity-protection|phase39-fixture|protected-identity\.spec)/.test(row.path)), false, 'test identity provider must not ship')
for (const row of build.sourceInputs) assert.equal(createHash('sha256').update(await readFile(row.path)).digest('hex'), row.sha256, 'stale source input: ' + row.path)
const restart = JSON.parse(await readFile('evidence/phase52-field-restart.json', 'utf8')); assert.equal(restart.passed, true); assert.equal(restart.results.length, 8)
for (const row of restart.candidateEntrypoints) assert.equal(createHash('sha256').update(await readFile(join(candidate, row.path))).digest('hex'), row.sha256, 'candidate differs from tested entry')
await writeFile(join(stage, 'changed-files.json'), JSON.stringify({ schema: 'harmony-protected-world-source-delta/1', baseline: 'retained phase42 .2 source companion plus current native layout work', records, excludes: ['profile homes', 'credentials', 'signing configurations/materials', 'node_modules', 'native build outputs'], fullHistoricalValidatorPassed: false }, null, 2) + '\n')
async function zip(source, destination) {
  try { await access(destination); throw new Error('sealed archive already exists: ' + destination) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const program = "Add-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($env:DSH_PUBLIC_ARCHIVE_SOURCE, $env:DSH_PUBLIC_ARCHIVE_DESTINATION)\n"
  const result = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(program, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 60000, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_PUBLIC_ARCHIVE_SOURCE: source, DSH_PUBLIC_ARCHIVE_DESTINATION: destination } })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  const bytes = await readFile(destination); return { path: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const runtime = await zip(candidate, runtimeZip), source = await zip(stage, sourceZip)
const previous = await readFile('D:/Temp/dsh-harmony-replay-profile-0.0.0-first-use.2.zip'); assert.equal(createHash('sha256').update(previous).digest('hex'), '07323b82478b3d35b64d59a1080389601e95fab07d5ecd46301ceea4d94a016c')
const report = { schema: 'harmony-protected-world-deliverables/1', runtime, source, sourceStage: stage, sourceFiles: records, scopedFormattingAndLinksPassed: true, diagnosticLogsPreservedByteForByte: true, testedEntrypointsMatched: true, sourceGraphCurrent: true, testOnlyIdentityProviderExcluded: true, previousSealedRuntimeUnchanged: true, installedOrActivated: false, realModels: 0, realCredentialsRead: false, realIdentityCreated: false, aclChanges: false, nativeBuildOrPhoneOperations: false, fullHistoricalValidatorPassed: false }
await writeFile('evidence/phase52-deliverables.json', JSON.stringify(report, null, 2) + '\n'); await writeFile('D:/Temp/dsh-harmony-protected-world-20261014-deliverables.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ runtime, source, checkedFiles: records.length, scopedFormattingAndLinksPassed: true, sourceGraphCurrent: true, previousSealedRuntimeUnchanged: true }))

/** Seal a separate inactive operator, tests and source rollback inventory without changing either73.1 deliverable. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, mkdir, readdir, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
const json = async file => JSON.parse(await readFile(file, 'utf8')), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const work = resolve('.build/phase74-operations-work'), stage = resolve('.build/phase74.7-operation-plan'), archive = 'D:/Temp/dsh-harmony-mobile-phase74.7-operation-plan.zip'
const plan = await json(join(work, 'plan.json')), validation = await json('evidence/phase74-validation.json'), epoch = await json('evidence/phase74-epoch-latest.json')
assert.equal(validation.operatorTests.passed, 90); assert.equal(validation.operatorTests.failed, 0); assert.equal(epoch.code, 0); assert.equal(epoch.tests, 1)
assert.match(await readFile('evidence/phase74.7-operations-tests.log', 'utf8'), /pass 90/); assert.equal((await json('evidence/phase74-focused-docs.json')).passed, true)
assert.equal((await json('evidence/phase74-sdk-check.json')).sdkHelperExportsLoaded, true)
for (const [path, expected] of [[plan.native.hap, plan.native.sha256], [plan.native.zip, plan.native.zipSha256]]) assert.equal(hash(await readFile(path)), expected)
const frozen = await json('.build/phase69-review-candidate/files.sha256.json'); for (const row of frozen) assert.equal(hash(await readFile(join('.build/phase69-review-candidate', row.file))), row.sha256)
await mkdir(stage)
for (const file of await readdir(work)) if (file !== 'files.sha256.json') await copyFile(join(work, file), join(stage, file))
await mkdir(join(stage, 'tests')); await copyFile('tests/phase74-operations.test.mjs', join(stage, 'tests/phase74-operations.test.mjs'))
await mkdir(join(stage, 'evidence'))
for (const file of ['phase74-validation.json', 'phase74-sdk-check.json', 'phase74-focused-docs.json', 'phase74.7-operations-tests.log', 'phase74-epoch-latest.json', 'phase73-validation.json', 'phase74-pre-sign-stop.json', 'phase74-repair-preflight.json']) await copyFile(join('evidence', file), join(stage, 'evidence', file))
await copyFile(join(epoch.world, 'phase74-memory-owner/phase74-epoch-result.json'), join(stage, 'evidence/phase74-epoch-result.json'))
const changes = []
for (const directory of ['operations/phase74', 'scripts', 'integration', 'tests']) for (const name of await readdir(directory)) {
  if (directory !== 'operations/phase74' && !name.startsWith('phase74-')) continue
  const file = directory + '/' + name, data = await readFile(file), target = join(stage, 'source-overlay', file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data)
  changes.push({ file, beforeSha256: null, afterSha256: hash(data), beforeIncluded: false })
}
for (const file of ['docs/tasks.md', 'docs/acceptance.md']) {
  const data = await readFile(file), before = await readFile('.build/phase73.1-review-candidate/source-overlay/' + file)
  for (const [directory, bytes] of [['source-overlay', data], ['source-before', before]]) { const target = join(stage, directory, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes) }
  changes.push({ file, beforeSha256: hash(before), afterSha256: hash(data), beforeIncluded: true })
}
await writeFile(join(stage, 'changes.json'), JSON.stringify(changes, null, 2) + '\n')
await writeFile(join(stage, 'package.json'), JSON.stringify({ private: true, type: 'module', description: 'Inactive phase74 operator; original workspace/toolchain and explicit human approval required' }, null, 2) + '\n')
const files = []
async function inventory(directory, prefix = '') { for (const row of await readdir(directory, { withFileTypes: true })) { const path = join(directory, row.name), file = prefix + row.name; assert.equal((await lstat(path)).isSymbolicLink(), false); if (row.isDirectory()) await inventory(path, file + '/'); else { const data = await readFile(path); files.push({ file, bytes: data.length, sha256: hash(data) }) } } }
await inventory(stage); files.sort((a, b) => a.file.localeCompare(b.file)); await writeFile(join(stage, 'files.sha256.json'), JSON.stringify(files, null, 2) + '\n')
const zipCode = '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path -LiteralPath $env:PHASE74_ZIP) { throw "Archive already exists" }; $phase74Archive = [IO.Compression.ZipFile]::Open($env:PHASE74_ZIP, [IO.Compression.ZipArchiveMode]::Create); try { Get-ChildItem -LiteralPath $env:PHASE74_STAGE -Recurse -File | ForEach-Object { $phase74Name = $_.FullName.Substring($env:PHASE74_STAGE.Length + 1).Replace([char]92, [char]47); [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase74Archive, $_.FullName, $phase74Name, [IO.Compression.CompressionLevel]::Optimal) } } finally { $phase74Archive.Dispose() }'
const zip = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', zipCode], { env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, PHASE74_STAGE: stage, PHASE74_ZIP: archive }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
assert.equal(zip.status, 0, zip.stderr)
const data = await readFile(archive), report = { status: 'INACTIVE_OPERATION_PACKAGE_SEALED', stage, archive: { path: archive, bytes: data.length, sha256: hash(data) }, planSha256: hash(await readFile(join(stage, 'plan.json'))), manifestSha256: hash(await readFile(join(stage, 'files.sha256.json'))), manifestFiles: files.length, sourceChanges: changes.length, frozenFilesVerified: frozen.length, nativeHapUnchanged: true, nativeZipUnchanged: true, actualOwnerSyntheticTest: epoch, approved: false, signed: false, installed: false, remoteIo: false, realGrantCreated: false }
await writeFile('evidence/phase74.7-operations-candidate.json', JSON.stringify({ ...report, archiveNames: 'forward-slash', approved742Retained: true, differencesFrom742: ['original public profile reference is beside home, outside fixed-world', 'fixed original public profile digest and regression test', 'empty files permitted only by pinned manifest verification', 'initialization and activation both explicitly require nonempty journal/head'], native731Changed: false, previousLiveAttempt: 'stopped before signing; grant5 never created', originalHumanScopeRetained: true, parentAllowedExecutionHashRefresh: true }, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

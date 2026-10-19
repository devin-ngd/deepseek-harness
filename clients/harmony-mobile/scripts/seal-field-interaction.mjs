/** Seal successor candidates before exercising their extracted bytes; source companions exclude every profile, identity and signing file. */
import { readFile, writeFile, readdir, mkdir, mkdtemp, copyFile, access } from 'node:fs/promises'
import { resolve, join, dirname, extname, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

if (process.argv.length !== 3 || !['--runtime', '--source'].includes(process.argv[2])) throw new Error('select --runtime or --source')
const project = resolve('.'), hash = bytes => createHash('sha256').update(bytes).digest('hex'), baselinePath = 'evidence/phase53-baseline.json'
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
if (!baseline.paths.includes('replay-profile/src/index.ts')) {
  const prior = '.build/phase52-delivery-bdShbY/replay-profile/src/index.ts', saved = join(baseline.preimages, 'replay-profile/src/index.ts')
  await mkdir(dirname(saved), { recursive: true }); await copyFile(prior, saved); baseline.paths.push('replay-profile/src/index.ts')
  baseline.additionalPreimageSource = prior
}
await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n')
async function predecessors() {
  for (const row of baseline.predecessor) { const bytes = await readFile(row.path); assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256) }
  for (const row of baseline.unchangedClientPolicyFiles) assert.equal(hash(await readFile(row.path)), row.sha256)
}
await predecessors()
async function inspect(directory) {
  const records = []
  async function walk(current) {
    for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      assert.equal(item.isSymbolicLink(), false, 'archive source symlink')
      const path = join(current, item.name), local = relative(directory, path)
      assert.ok(!isAbsolute(local) && local !== '..' && !local.startsWith('..\\') && !local.startsWith('../'))
      if (item.isDirectory()) await walk(path)
      else { assert.equal(item.isFile(), true); const bytes = await readFile(path); records.push({ path: local.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) }) }
    }
  }
  await walk(directory); return records.sort((a, b) => a.path.localeCompare(b.path))
}
function zipCommand(program, source, destination) {
  const result = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(program, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 60000, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_PUBLIC_ARCHIVE_SOURCE: source, DSH_PUBLIC_ARCHIVE_DESTINATION: destination } })
  assert.equal(result.status, 0, result.stderr || String(result.error))
}
async function absent(path) { try { await access(path); throw new Error('sealed archive already exists: ' + path) } catch (error) { if (error.code !== 'ENOENT') throw error } }
async function zip(source, path) {
  await absent(path)
  zipCommand("Add-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($env:DSH_PUBLIC_ARCHIVE_SOURCE, $env:DSH_PUBLIC_ARCHIVE_DESTINATION)\n", source, path)
  const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: hash(bytes) }
}
async function extract(archive, directory, records) {
  await mkdir(directory)
  zipCommand("Add-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::ExtractToDirectory($env:DSH_PUBLIC_ARCHIVE_SOURCE, $env:DSH_PUBLIC_ARCHIVE_DESTINATION)\n", archive.path, directory)
  assert.deepEqual(await inspect(directory), records, 'archive extraction differs from staged bytes')
}
if (process.argv[2] === '--runtime') {
  const candidate = resolve('.build/field-interaction-candidate'), tools = resolve('.build/first-use-relay-tools.3'), build = JSON.parse(await readFile(join(candidate, 'build-info.json'), 'utf8')), assets = JSON.parse(await readFile(join(candidate, 'browser-assets.json'), 'utf8')), maintenance = JSON.parse(await readFile(join(tools, 'build-info.json'), 'utf8'))
  assert.equal(build.version, '0.0.0-first-use.4')
  assert.equal(build.sourceInputs.some(row => /(?:fixed-identity-protection|phase39-fixture|protected-identity\.spec)/.test(row.path)), false)
  for (const row of [...build.sourceInputs, ...assets.sources, ...maintenance.outputs.flatMap(row => row.inputs)]) assert.equal(hash(await readFile(row.path)), row.sha256, 'stale source: ' + row.path)
  for (const row of assets.outputs) assert.equal(hash(await readFile(join(candidate, row.path))), row.sha256)
  assert.equal(hash(await readFile(join(candidate, 'relay-endpoint-timers.json'))), hash(await readFile(join(tools, 'relay-endpoint-timers.json'))))
  const runtimePath = 'D:/Temp/dsh-harmony-replay-profile-0.0.0-first-use.4.zip', toolsPath = 'D:/Temp/dsh-harmony-public-first-use-tools-20261014.3.zip'
  await absent(runtimePath); await absent(toolsPath)
  const runtimeFiles = await inspect(candidate), toolFiles = await inspect(tools), runtime = await zip(candidate, runtimePath), publicTools = await zip(tools, toolsPath), world = await mkdtemp('D:/Temp/harmony-field-sealed-'), extractedCandidate = join(world, 'candidate'), extractedTools = join(world, 'tools')
  await extract(runtime, extractedCandidate, runtimeFiles); await extract(publicTools, extractedTools, toolFiles); await predecessors()
  const report = { schema: 'harmony-field-sealed-candidates/1', runtime, publicTools, extractedCandidate, extractedTools, runtimeFiles, toolFiles, sourceInputs: build.sourceInputs.length, sourceHashesCurrent: true, extractedBytesMatch: true, predecessorsUnchanged: true, clientPoliciesUnchanged: true, originalHtmlAndSdk: true, installedOrActivated: false, realModels: 0 }
  await writeFile('evidence/phase53-sealed-candidates.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ runtime, publicTools, extractedCandidate, extractedTools, extractedBytesMatch: true }))
} else {
  const sealed = JSON.parse(await readFile('evidence/phase53-sealed-candidates.json', 'utf8')), browser = JSON.parse(await readFile('evidence/phase53-original-browser.json', 'utf8')), restart = JSON.parse(await readFile('evidence/phase53-field-restart.json', 'utf8')), detached = JSON.parse(await readFile('evidence/phase53-detached-profile.json', 'utf8')), tools = JSON.parse(await readFile('evidence/phase53-relay-tools.json', 'utf8'))
  const build = JSON.parse(await readFile(join(sealed.extractedCandidate, 'build-info.json'), 'utf8')), assets = JSON.parse(await readFile(join(sealed.extractedCandidate, 'browser-assets.json'), 'utf8')), maintenance = JSON.parse(await readFile(join(sealed.extractedTools, 'build-info.json'), 'utf8'))
  for (const row of [...build.sourceInputs, ...assets.sources, ...maintenance.outputs.flatMap(row => row.inputs)]) assert.equal(hash(await readFile(row.path)), row.sha256, 'source changed after runtime seal: ' + row.path)
  assert.equal(browser.passed, true); assert.equal(browser.candidate, sealed.extractedCandidate); assert.equal(restart.passed, true); assert.equal(restart.candidate, sealed.extractedCandidate); assert.equal(detached.inputCandidate, sealed.extractedCandidate); assert.equal(tools.inputTools, sealed.extractedTools)
  assert.equal(browser.realModels + restart.realModels + detached.realModels, 0)
  for (const rows of [browser.entrypoints, restart.candidateEntrypoints, detached.candidateEntrypoints]) for (const row of rows) assert.equal(row.sha256, sealed.runtimeFiles.find(file => file.path === row.path)?.sha256, 'test entry differs from sealed bytes')
  for (const row of tools.entrypoints) assert.equal(row.sha256, sealed.toolFiles.find(file => file.path === row.path)?.sha256)
  for (const row of [sealed.runtime, sealed.publicTools]) { const bytes = await readFile(row.path); assert.equal(hash(bytes), row.sha256); assert.equal(bytes.length, row.bytes) }
  assert.deepEqual(await inspect(sealed.extractedCandidate), sealed.runtimeFiles)
  assert.deepEqual(await inspect(sealed.extractedTools), sealed.toolFiles)
  const additional = [
    'standalone-relay/src/endpoint-timers.ts', 'integration/endpoint-timers.spec.ts', 'integration/field-interaction.vitest.config.mjs', 'replay-profile/src/browser-fixture.ts', 'integration/product-browser.ts',
    ...['field-browser-assets', 'field-processes', 'field-original-browser-test', 'field-interaction-test', 'field-interaction-restart-test', 'detached-field-interaction-test', 'field-relay-tools-test', 'field-interaction-record-pair', 'seal-field-interaction'].map(name => 'scripts/' + name + '.mjs'),
    'docs/phase53-original-field-interaction.md', ...['guide.md', 'guide.zh.md', 'guide.i18n.yaml'].map(name => 'docs/upgrade-guide/v0.2.1-alpha.2/original-field-interaction/' + name),
    ...(await readdir('evidence')).filter(name => name.startsWith('phase53-') && name !== 'phase53-deliverables.json').map(name => 'evidence/' + name),
  ]
  const paths = [...new Set([...baseline.paths, ...additional])].sort(), stage = await mkdtemp(join(project, '.build/phase53-delivery-')), records = [], preimages = []
  for (const path of paths) {
    const bytes = await readFile(path), text = bytes.toString('utf8'), diagnostic = path.startsWith('evidence/')
    if (!diagnostic) assert.ok(text.endsWith('\n') && !text.endsWith('\n\n') && !text.includes('\r\n'), 'LF formatting: ' + path)
    if (extname(path) === '.md') for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:|^#/.test(match[1]) || match[1] === '../evidence/phase53-deliverables.json') continue
      await access(resolve(dirname(path), match[1].split('#')[0]))
    }
    const output = join(stage, path); await mkdir(dirname(output), { recursive: true }); await copyFile(path, output); records.push({ path, bytes: bytes.length, sha256: hash(bytes), diagnosticPreserved: diagnostic })
  }
  for (const path of baseline.paths) { const bytes = await readFile(join(baseline.preimages, path)), output = join(stage, 'rollback-preimages', path); await mkdir(dirname(output), { recursive: true }); await copyFile(join(baseline.preimages, path), output); preimages.push({ path, bytes: bytes.length, sha256: hash(bytes) }) }
  await writeFile(join(stage, 'changed-files.json'), JSON.stringify({ schema: 'harmony-original-field-source-delta/1', requires: 'phase52 source companion; this archive is not a whole project', records, preimages, newPaths: paths.filter(path => !baseline.paths.includes(path)), rollback: 'compare successor hashes before restoring only listed source preimages; never roll back initialized identities, worlds, receipts or trust', excludes: ['profile homes', 'credentials', 'signing files', 'node_modules', 'native builds'], fullHistoricalValidatorPassed: false }, null, 2) + '\n')
  const source = await zip(stage, 'D:/Temp/dsh-harmony-original-field-interaction-20261014-delta.zip'); await predecessors()
  const report = { schema: 'harmony-original-field-deliverables/1', runtime: sealed.runtime, publicTools: sealed.publicTools, source, sourceStage: stage, sourceFiles: records, rollbackPreimages: preimages, testsUsedSealedExtractedBytes: true, testsMatchedEntrypointHashes: true, sourceGraphCurrentAtRuntimeSeal: true, sourceGraphStillCurrent: true, extractedBytesStillMatch: true, scopedFormattingAndLinksPassed: true, diagnosticsPreservedByteForByte: true, predecessorsUnchanged: true, clientPoliciesUnchanged: true, installedOrActivated: false, realIdentityCreated: false, phoneOperations: false, realModels: 0, fullHistoricalValidatorPassed: false }
  await writeFile('evidence/phase53-deliverables.json', JSON.stringify(report, null, 2) + '\n'); await writeFile('D:/Temp/dsh-harmony-original-field-interaction-20261014-deliverables.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ runtime: report.runtime, publicTools: report.publicTools, source, checkedFiles: records.length, preimages: preimages.length, testsUsedSealedExtractedBytes: true }))
}

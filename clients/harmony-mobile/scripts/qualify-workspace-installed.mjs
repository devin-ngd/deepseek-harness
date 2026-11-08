/** Associate sealed packages and finite backend scenarios with an integrity-checked installed runtime copy. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'

const paths = process.argv.slice(2)
assert.equal(paths.length, 2)
assert.ok(paths.every(path => /^evidence\/workspace-installed-(devflow|rich)-[^/]+\.json$/.test(path)))
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const contained = (directory, path) => { const child = relative(directory, path); assert.ok(child && !child.startsWith('..') && !isAbsolute(child)) }
const copied = await json('evidence/workspace-installed-runtime.json')
const descriptorPath = join(copied.runtime, 'desktop-runtime.json'), descriptorBytes = await readFile(descriptorPath)
assert.equal(sha(descriptorBytes), copied.descriptorSha256)
const descriptor = JSON.parse(descriptorBytes.toString('utf8'))
assert.equal(descriptor.release.version, '0.2.1-rc.2'); assert.equal(descriptor.release.hostProtocolVersion, 4)
let verifiedFiles = 0
for (const row of descriptor.files) {
  const file = join(copied.runtime, row.path); contained(copied.runtime, file)
  const bytes = await readFile(file); assert.equal(bytes.byteLength, row.bytes, row.path); assert.equal(sha(bytes), row.sha256, row.path)
  verifiedFiles++
}
assert.equal(verifiedFiles, copied.copied)
const pointer = await json('evidence/workspace-review-bundle.json'), manifestPath = join(pointer.destination, 'manifest.json'), manifest = await json(manifestPath)
for (const item of manifest.artifacts) assert.equal(sha(await readFile(join(pointer.destination, item.file))), item.sha256)
const checks = []
for (const path of paths) {
  const record = await json(path), observed = record.observed
  assert.equal(record.passed, true); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
  assert.ok(['devflow', 'rich'].includes(record.scenario)); assert.equal(observed.scenario, record.scenario)
  assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
  assert.equal(record.appStartedThroughDshProfile, true); assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0)
  contained(copied.world, record.world); contained(record.world, record.home)
  assert.equal(observed.passed, true); assert.equal(observed.installedServices, true); assert.equal(observed.dailyProfile, false)
  assert.equal(observed.connectionPackageOverridden, false); assert.equal(observed.nonOwnerSettingsSaved, true); assert.equal(observed.ungrantedExistingSessionDenied, true)
  assert.equal(observed.modelCalls, 4); assert.equal(observed.replayBudget, 4); assert.equal(observed.realModels, 0)
  assert.ok(observed.graphBatches > 0); assert.ok(observed.servedBundleBytes > 0)
  assert.equal(record.packages.length, 4)
  assert.deepEqual(record.packages.map(item => item.name), observed.packagesLoaded)
  for (const item of record.packages) {
    contained(record.world, item.stage)
    const artifact = manifest.artifacts.find(row => row.name === item.name); assert.ok(artifact)
    assert.equal(item.sha256, artifact.sha256); assert.equal(item.archive, join(pointer.destination, artifact.file))
    for (const file of artifact.inventory) assert.equal(sha(await readFile(join(item.stage, file.path))), file.sha256, file.path)
  }
  if (record.scenario === 'devflow') assert.deepEqual(observed.details, { directHasNoDelegationTool: true, readonlyChildCompleted: true, childModel: 'worker', childEffort: 'high', parentModel: 'main', persistedRequestChecked: true })
  else assert.deepEqual(observed.details, { acceptedThenCompleted: true, unresolvedRestored: true, queryDoesNotReplay: true, exactDraftRestored: true })
  checks.push({ path, sha256: sha(await readFile(path)), scenario: record.scenario, world: record.world, fixtureBundleSha256: sha(await readFile(join(record.world, 'package/index.mjs'))), observed })
}
assert.deepEqual(checks.map(item => item.scenario).sort(), ['devflow', 'rich'])
const directory = join(pointer.destination, 'installed-backend'); await mkdir(directory)
const result = { schema: 'harmony-workspace-installed-backend-validation/1', at: new Date().toISOString(), passed: true,
  manifest: manifestPath, manifestSha256: sha(await readFile(manifestPath)),
  runtime: { path: copied.runtime, release: descriptor.release, descriptorSha256: copied.descriptorSha256, verifiedFiles }, checks,
  applicationLaunch: 'copied dsh CLI through independent workspace-review profile', realModelCalls: 0, dailyProfileChanged: false,
  scope: 'installed backend services, sealed package composition, non-owner Gateway and standard bundle serving',
  limits: ['no frontend JavaScript execution in these scenarios', 'no native workspace connected to this installed runtime', 'no encrypted native carrier or public relay', 'no daily profile activation or physical phone'] }
const destination = join(directory, 'validation.json')
await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-installed-validation.json', JSON.stringify({ path: destination, sha256: sha(await readFile(destination)), passed: true }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, verifiedFiles, scenarios: checks.map(item => item.scenario), realModelCalls: 0 }))

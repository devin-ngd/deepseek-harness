/** Freeze emitted command lifecycle checks on copied installed services, including the old archive's expected failure. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir, mkdtemp } from 'node:fs/promises'
import { join, dirname, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
const inputs = process.argv.slice(2); assert.equal(inputs.length, 2)
for (const path of inputs) assert.match(path, /^evidence\/workspace-installed-device-command(?:-previous)?-\d+-probe-\w+\.json$/)
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const [current, previous] = await Promise.all(inputs.map(json)), copied = await json('evidence/workspace-installed-runtime.json')
assert.equal(sha(await readFile(join(copied.runtime, 'desktop-runtime.json'))), copied.descriptorSha256)
for (const [record, scenario, code] of [[current, 'device-command', 0], [previous, 'device-command-previous', 1]]) {
  assert.equal(record.scenario, scenario); assert.equal(record.code, code); assert.equal(record.signal, null); assert.equal(record.timedOut, false)
  assert.equal(record.passed, code === 0); assert.equal(record.dailyProfileUsed, false); assert.equal(record.realModelCalls, 0)
  assert.equal(record.appStartedThroughDshProfile, true); assert.equal(record.copiedRuntime, copied.runtime); assert.equal(record.descriptorSha256, copied.descriptorSha256)
  for (const [path, expected] of Object.entries(record.sourceSha256)) assert.equal(sha(await readFile(path)), expected, path)
}
for (const key of ['installedServices', 'siblingModulesProvider', 'registration', 'dependencyUnload', 'dependencyRestore', 'nativeOnlyWithoutModules']) assert.equal(current.observed[key], true, key)
for (const key of ['commandExecuted', 'identitiesOpened', 'socketsOpenedByCommand', 'userProfile']) assert.equal(current.observed[key], false, key)
assert.equal(current.observed.modelCalls, 0); assert.equal(current.observed.realModels, 0); assert.equal(current.observed.replayBudget, 4)
assert.match(previous.observed.error, /command removed after Client Modules provider disposal/)
const review = await json('evidence/workspace-review-bundle.json'), oldManifest = await json(join(review.destination, 'manifest.json'))
const pointer = await json('evidence/workspace-device-command-candidate.json'); assert.equal(sha(await readFile(pointer.path)), pointer.sha256)
const candidate = await json(pointer.path), mobileName = '@deepseek-ai/dsh-experimental-harmony-mobile'
const oldMobile = oldManifest.artifacts.find(row => row.name === mobileName); assert.ok(oldMobile)
for (const [record, currentPackage] of [[current, true], [previous, false]]) for (const entry of record.packages) {
  const manifest = entry.id === 'harmony-mobile' && currentPackage ? candidate.artifact : oldManifest.artifacts.find(row => row.name === entry.name)
  assert.ok(manifest); assert.equal(sha(await readFile(entry.archive)), manifest.sha256); assert.equal(entry.sha256, manifest.sha256)
  const local = relative(record.world, entry.stage); assert.ok(local && !local.startsWith('..') && !isAbsolute(local))
  for (const file of manifest.inventory) assert.equal(sha(await readFile(join(entry.stage, file.path))), file.sha256, file.path)
}
const before = new Map(oldMobile.inventory.map(row => [row.path, row.sha256])), after = new Map(candidate.artifact.inventory.map(row => [row.path, row.sha256]))
assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort())
const changed = [...before.keys()].filter(path => before.get(path) !== after.get(path)).sort()
assert.deepEqual(changed, ['build-info.json', 'lib/device.js', 'package.json', 'README.i18n.yaml', 'README.md', 'README.zh.md', 'src/device-binding-command.ts'].sort())
const destination = await mkdtemp(join(dirname(pointer.path), 'installed-registration-')), files = []
async function save(source, file) {
  const bytes = await readFile(source); await mkdir(dirname(join(destination, file)), { recursive: true }); await writeFile(join(destination, file), bytes, { flag: 'wx' })
  files.push({ source, file, bytes: bytes.length, sha256: sha(bytes) })
}
const sessions = []
for (const [index, record] of [current, previous].entries()) {
  const label = index === 0 ? 'current' : 'previous'
  await save(inputs[index], label + '/result.json')
  for (const file of ['probe.json', 'probe.log', 'process.json', 'four-responses.json', 'package/index.mjs', 'package/package.json', 'package/cordis.patch.yml', 'home/profiles/workspace-review/package.json', 'home/profiles/workspace-review/cordis.patch.yml']) await save(join(record.world, file), label + '/' + file)
  const paths = (await readdir(join(record.world, 'sessions'), { recursive: true })).filter(path => path.endsWith('session.v4.jsonl')); assert.equal(paths.length, 1)
  const sessionPath = join(record.world, 'sessions', paths[0]), events = (await readFile(sessionPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  for (const type of ['turn/start', 'command/run', 'request/header']) assert.equal(events.filter(event => event.type === type).length, 0, type)
  await save(sessionPath, label + '/session.v4.jsonl'); sessions.push({ label, events: events.length, modelTurns: 0, commandsExecuted: 0 })
  const mobile = record.packages.find(row => row.id === 'harmony-mobile'); assert.ok(mobile)
  await save(mobile.archive, label + '/harmony-mobile.tgz'); await save(join(mobile.stage, 'lib/device.js'), label + '/device.js')
}
await save(pointer.path, 'candidate-manifest.json'); await save('evidence/workspace-installed-runtime.json', 'copied-runtime.json')
await save(join(copied.runtime, 'desktop-runtime.json'), 'runtime-descriptor.json')
for (const file of ['package.json', 'lib/index.js']) await save(join(copied.runtime, 'node_modules/@deepseek-ai/cordis', file), 'installed-cordis/' + file)
for (const path of ['integration/workspace-installed-device-command.ts', 'scripts/prepare-workspace-installed-probe.mjs', 'scripts/qualify-workspace-installed-device-command.mjs', '.build/installed-device-command-final-types.log']) await save(path, 'sources/' + path)
const validation = { passed: true, fullGoalComplete: false, archiveSha256: candidate.artifact.sha256, oldArchiveSha256: oldMobile.sha256,
  installedDescriptorSha256: copied.descriptorSha256, registration: true, dependencyUnloadAndRestore: true, nativeOnlyWithoutModules: true,
  oldPackageExpectedFailure: true, changedPackageFiles: changed, standardWebBytesUnchanged: true, sessions, files,
  limits: ['Copied installed runtime and private profile only; the daily installation is unchanged.', 'Only command registration and dependency lifecycle were exercised; binding, identity opening and device sockets were not executed.', 'Existing phone UI evidence uses byte-identical standard Web resources, not an activated rc2.34 production device command.', 'Keyboard, physical phone, HUKS and public WSS acceptance remain separate.'] }
const output = join(destination, 'validation.json'); await writeFile(output, JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-installed-device-command-validation.json', JSON.stringify({ path: output, sha256: sha(await readFile(output)), fullGoalComplete: false }, null, 2) + '\n')
console.log(JSON.stringify({ output, passed: true, files: files.length, standardWebBytesUnchanged: true }))

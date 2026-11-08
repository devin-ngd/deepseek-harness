/** Seal the command dependency regression, emitted-entry lifecycle check and exact private npm candidate. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const inputs = process.argv.slice(2); assert.equal(inputs.length, 4)
for (const path of inputs) assert.match(path, /^evidence\/workspace-device-command-\d+\.json$/)
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const [before, after, builtAfter, builtBefore] = await Promise.all(inputs.map(json))
for (const [record, passed] of [[before, false], [after, true], [builtAfter, true], [builtBefore, false]]) {
  assert.equal(record.passed, passed); assert.equal(record.code, passed ? 0 : 1); assert.equal(record.signal, null); assert.equal(record.packageUnchanged, true)
}
for (const record of [after, builtAfter]) {
  assert.equal(record.observed.normalCommand, true); assert.equal(record.observed.memoryCredentials, true); assert.equal(record.observed.fixedPublicProtection, true)
  assert.equal(record.observed.dpapi, false); assert.equal(record.observed.modelCalls, 0); assert.equal(record.observed.realModels, 0)
  assert.equal(record.observed.owner, false); assert.equal(record.observed.approvedWorkspaceOnly, true); assert.equal(record.observed.revokedLiveWorkspace, true)
  assert.equal(record.observed.nativeOnlyWithoutClientModules, true); assert.ok(record.observed.resources > 0)
}
assert.equal(builtAfter.observed.builtRegistration, true); assert.equal(builtAfter.observed.providerIsSibling, true)
const source = resolve('desktop-plugin/src/device-binding-command.ts'), spec = resolve('integration/device-workspace-command.spec.ts')
assert.equal(sha(await readFile('.build/device-binding-command-before-client-modules.ts')), before.packageSha256[source])
assert.equal(sha(await readFile(source)), after.packageSha256[source]); assert.equal(sha(await readFile(source)), builtAfter.packageSha256[source])
assert.equal(sha(await readFile('.build/device-workspace-command-sibling.spec.ts')), before.packageSha256[spec])
assert.equal(sha(await readFile(spec)), builtAfter.packageSha256[spec]); assert.equal(sha(await readFile(spec)), builtBefore.packageSha256[spec])
assert.match(await readFile(join(before.world, 'test.log'), 'utf8'), /cannot get property "clientModules" without inject/)
assert.match(await readFile(join(builtBefore.world, 'test.log'), 'utf8'), /expected true to be false/)
const prior = await json('evidence/workspace-review-bundle.json'), priorManifest = await json(join(prior.destination, 'manifest.json'))
const previous = priorManifest.artifacts.find(row => row.name === '@deepseek-ai/dsh-experimental-harmony-mobile'); assert.ok(previous)
assert.equal(builtBefore.deviceBuild.sha256, previous.sha256); assert.equal(sha(await readFile(builtBefore.deviceBuild.archive)), previous.sha256)
const pointer = await json('evidence/workspace-device-command-candidate.json'); assert.equal(sha(await readFile(pointer.path)), pointer.sha256)
const candidate = await json(pointer.path), build = await json('evidence/workspace-desktop-build.json')
assert.equal(candidate.version, '0.0.0-rc2.34'); assert.equal(candidate.installed, false); assert.equal(candidate.activated, false)
assert.equal(sha(await readFile(candidate.artifact.path)), candidate.artifact.sha256)
const device = candidate.artifact.inventory.find(row => row.path === 'lib/device.js'); assert.ok(device)
assert.equal(sha(await readFile(join(build.stage, 'lib/device.js'))), device.sha256)
assert.equal(builtAfter.packageSha256[join(build.stage, 'lib/device.js')], device.sha256)
const example = candidate.artifact.inventory.find(row => row.path === 'workspace.enabled.example.json')
assert.equal(example?.sha256, previous.inventory.find(row => row.path === 'workspace.enabled.example.json')?.sha256)
for (const item of build.sourceInputs) assert.equal(sha(await readFile(item.path)), item.sha256, item.path)
const destination = await mkdtemp(join(dirname(pointer.path), 'validation-')), files = []
async function save(source, file) { const bytes = await readFile(source); await mkdir(dirname(join(destination, file)), { recursive: true }); await writeFile(join(destination, file), bytes, { flag: 'wx' }); files.push({ source, file, bytes: bytes.length, sha256: sha(bytes) }) }
for (const [index, record] of [before, after, builtAfter, builtBefore].entries()) {
  const label = ['source-before', 'source-after', 'built-after', 'built-before'][index]
  await save(inputs[index], label + '/result.json'); await save(record.report, label + '/vitest.json'); await save(join(record.world, 'test.log'), label + '/test.log')
  if (record.passed) await save(join(record.world, 'observed.json'), label + '/observed.json')
}
const expectedPath = 'integration/expected/device-workspace-command.json', expected = await json(expectedPath)
async function commands(world, profile, label) {
  const directory = join(world, profile, 'sessions')
  const paths = (await readdir(directory, { recursive: true })).filter(path => path.endsWith('session.v4.jsonl')); assert.equal(paths.length, 1)
  const path = join(directory, paths[0]), events = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.equal(events.filter(event => event.type === 'turn/start').length, 0)
  const runs = events.filter(event => event.type === 'command/run'), done = events.filter(event => event.type === 'command/done')
  assert.equal(runs.length, done.length)
  for (const event of runs) { assert.equal(event.data.name, 'harmony-device'); assert.equal(Object.hasOwn(event.data, 'input'), false) }
  await save(path, label + '/session.v4.jsonl')
  return done.map(event => event.data.kind === 'success' ? { kind: event.data.kind, state: JSON.parse(event.data.text).state } : { kind: event.data.kind, text: event.data.text })
}
for (const [record, label] of [[after, 'source-after'], [builtAfter, 'built-after']]) {
  const snapshot = { workspace: await commands(record.world, 'command-profile', label + '/workspace'), nativeOnly: await commands(record.world, 'native-only', label + '/native-only') }
  assert.deepEqual(snapshot, expected)
  const file = label + '/command-snapshot.json', bytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n')
  await writeFile(join(destination, file), bytes, { flag: 'wx' })
  files.push({ source: 'recorded command/done events', file, bytes: bytes.length, sha256: sha(bytes) })
}
await save(expectedPath, 'sources/' + expectedPath)
await save(pointer.path, 'candidate-manifest.json'); await save(candidate.artifact.path, 'harmony-mobile-0.0.0-rc2.34-candidate.tgz')
await save('evidence/workspace-desktop-build.json', 'build.json')
for (const path of ['desktop-plugin/src/device-binding-command.ts', 'integration/device-workspace-command.spec.ts', 'scripts/check-workspace.mjs', 'scripts/unpack-workspace-review.mjs',
  'scripts/qualify-workspace-device-command.mjs', '.build/seal-device-command-candidate.mjs', '.build/device-binding-command-before-client-modules.ts', '.build/device-workspace-command-sibling.spec.ts',
  '.build/device-workspace-command-ancestor-provider.spec.ts', 'desktop-plugin/README.md', 'desktop-plugin/README.zh.md', 'desktop-plugin/README.i18n.yaml', 'desktop-plugin/package.json']) await save(path, 'sources/' + path)
const diagnostics = []
for (const name of await readdir('evidence')) {
  if (!/^workspace-device-command-\d+\.json$/.test(name) || inputs.includes('evidence/' + name)) continue
  const record = await json('evidence/' + name), label = 'diagnostics/' + name.slice(0, -5)
  await save('evidence/' + name, label + '/result.json'); await save(record.report, label + '/vitest.json'); await save(join(record.world, 'test.log'), label + '/test.log')
  diagnostics.push({ file: name, passed: record.passed, acceptedAsDependencyProof: false })
}
const validation = { passed: true, fullGoalComplete: false, version: candidate.version, archiveSha256: candidate.artifact.sha256, sourceCommands: true, emittedRegistrationAndDependencyCleanup: true, recordedCommandSnapshots: true,
  previousPackageNegativeControl: { sha256: previous.sha256, expectedFailureObserved: true }, diagnostics,
  limits: ['Source command behavior uses memory-only credentials and a public-key protector substitute; no DPAPI or user credential access.', 'The emitted entry is checked for registration and dependency-driven unload only; it does not open identities or sockets.', 'An ancestor-provided service counterexample passed but did not exercise the required sibling-provider dependency.', 'No installed daily profile, HUKS/WSS, physical phone or full keyboard qualification.'], files }
const output = join(destination, 'validation.json'); await writeFile(output, JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-device-command-validation.json', JSON.stringify({ path: output, sha256: sha(await readFile(output)), fullGoalComplete: false }, null, 2) + '\n')
console.log(JSON.stringify({ output, files: files.length, version: candidate.version, passed: true }))

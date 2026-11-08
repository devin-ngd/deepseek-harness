/** Tie native Index creation evidence to its UI source and separate test HAP; no daily-profile qualification. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
const [path] = process.argv.slice(2); assert.ok(path?.startsWith('evidence/session-creation-'))
const json = async file => JSON.parse(await readFile(file, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const record = await json(path), native = await json(join(record.world, 'native-acceptance/result.json'))
assert.equal(record.passed, true); assert.equal(record.packageUnchanged, true); assert.equal(native.passed, true)
assert.equal(native.scope, 'native-Index-preset-model-effort-creation'); assert.equal(record.observed.nativePage, 'Index')
assert.equal(record.observed.nativeUi, true); assert.equal(record.observed.fixtureProductProvider, true)
assert.equal(record.observed.modelTurns, 0); assert.equal(record.observed.realModels, 0); assert.equal(record.observed.defaultUnchanged, true)
assert.equal(record.observed.actions.length, 1); assert.equal(record.observed.preset, 'devin')
assert.deepEqual(record.observed.selection, { provider: 'rich-inline-replay', model: 'worker-model', reasoningEffort: 'high' })
assert.deepEqual(record.observed.errors, []); assert.deepEqual(record.observed.finish.checks, native.checks)
assert.ok(Object.values(native.checks).every(value => value === true))
const root = (await json('source.json')).dshRoot
for (const [file, hash] of Object.entries(record.packageSha256)) assert.equal(sha(await readFile(isAbsolute(file) ? file : join(root, file))), hash, file)
const project = await json('evidence/creation-native-review-project.json'), original = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
assert.equal(sha(original), project.productionUiSourceSha256)
const staged = await readFile(join(project.target, 'entry/src/main/ets/pages/Index.ets'), 'utf8')
assert.equal(staged.replace("import { CreationFixtureProduct } from '../fixture/CreationFixtureProduct'\n", '').replace('private product: NativeProductOwner = new CreationFixtureProduct(productConfiguration)', 'private product: NativeProductOwner = new NativeProductOwner(productConfiguration)'), original)
const buildPath = 'evidence/native-build/2026-11-03T15-14-48-779Z.json', build = await json(buildPath)
assert.equal(build.exitCode, 0); assert.equal(sha(await readFile(build.artifact.path)), build.artifact.sha256)
const sourceHashes = build.sourceHashes ?? build.sourceSha256
assert.equal(sourceHashes[join(project.target, 'entry/src/main/ets/pages/Index.ets')], sha(staged))
const review = await json('evidence/workspace-review-bundle.json'), directory = join(review.destination, 'native-creation'); await mkdir(directory)
const hap = join(directory, 'native-Index-fixture-unsigned.hap'); await cp(build.artifact.path, hap, { errorOnExist: true, force: false })
assert.equal(sha(await readFile(hap)), build.artifact.sha256)
const result = { schema: 'harmony-native-creation-validation/1', passed: true, at: new Date().toISOString(),
  evidence: { path, sha256: sha(await readFile(path)) }, nativeBuild: { path: buildPath, hap, sha256: build.artifact.sha256 },
  productionUiSourceSha256: sha(original), dataProviderOverride: project.dataProviderOverride,
  application: project.bundleName, nativePage: 'Index', models: 0, creationCount: 1,
  selection: record.observed.selection, preset: record.observed.preset, defaultUnchanged: true,
  limits: ['synthetic presets and replay model catalogue', 'fixture product provider over HTTP loopback', 'no pairing or encrypted native carrier', 'no installed daily profile or physical phone'] }
const destination = join(directory, 'validation.json'); await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/creation-emulator-validation.json', JSON.stringify({ path: destination, sha256: sha(await readFile(destination)), passed: true }, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, destination, creationCount: 1, models: 0 }))

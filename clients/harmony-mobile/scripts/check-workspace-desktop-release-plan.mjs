/** Exercise detached planning, file relocation and a frozen install in an isolated Desktop profile. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadWorkspaceDesktopReleasePlanInputs, planWorkspaceDesktopRelease } from './prepare-workspace-desktop-release-plan.mjs'

const lab = resolve(fileURLToPath(new URL('..', import.meta.url))), scratch = await realpath(join(lab, '.build'))
const yaml = createRequire(join(lab, '../../package.json'))('js-yaml')
const { execa } = await import(pathToFileURL(createRequire(join(lab, '../../packages/boot/plugin-manager/package.json')).resolve('execa')).href)
const inputs = await loadWorkspaceDesktopReleasePlanInputs()
const { report, rehearsal, before, after, archives, backup, proof } = inputs
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async path => JSON.parse(await readFile(path))
const manifest = await readJson(join(backup, 'package.json'))
const source = await realpath(join(lab, 'scripts/prepare-workspace-desktop-release-plan.mjs'))
const plan = (targetProfile, data = {}) => planWorkspaceDesktopRelease({ ...inputs, manifest, lock: before, targetProfile, ...data })
const sameDrive = plan(report.profile)
assert.deepEqual(sameDrive.manifest, await readJson(join(lab, report.proposedMetadata[0].path)))
assert.deepEqual(sameDrive.lock, after)
assert.equal(sameDrive.snapshotsVerified, 71)

const targetProfile = 'C:\\dsh-release-fixture\\profiles\\desktop'
assert.ok(archives.every(archive => win32.parse(archive.path).root.toLowerCase() !== win32.parse(targetProfile).root.toLowerCase()))
const harmony = '@deepseek-ai/dsh-experimental-harmony-mobile', rich = '@deepseek-ai/dsh-rich-inline'
const oldHarmony = Object.keys(before.packages).find(key => key.startsWith(harmony + '@file:')).slice(harmony.length + 1)
const oldRich = Object.keys(before.packages).find(key => key.startsWith(rich + '@file:')).slice(rich.length + 1)
const richFile = 'file:E:/synthetic/rich-before (saved).tgz'
const relocated = JSON.parse(JSON.stringify(before).replaceAll(oldHarmony, 'file:../../archives/harmony-before.tgz').replaceAll(oldRich, richFile))
relocated.importers['.'].dependencies[harmony].specifier = 'file:C:/dsh-release-fixture/archives/harmony-before.tgz'
relocated.importers['.'].dependencies[rich].specifier = richFile
const extra = 'dsh-local-extra', extraKey = extra + '@0.0.1'
relocated.importers['.'].dependencies[extra] = { specifier: '0.0.1', version: '0.0.1' }
relocated.packages[extraKey] = { resolution: { integrity: 'sha512-fixture' } }
relocated.snapshots[extraKey] = { dependencies: { zod: '4.4.3' } }
const unrelatedSameName = '@deepseek-ai/dsh-api-workspace-controller@0.1.0'
relocated.packages[unrelatedSameName] = { resolution: { integrity: 'sha512-transitive-fixture' } }
relocated.snapshots[unrelatedSameName] = {}
relocated.snapshots[extraKey].dependencies['@deepseek-ai/dsh-api-workspace-controller'] = '0.1.0'
const fieldManifest = structuredClone(manifest)
for (const name of [harmony, rich, extra]) fieldManifest.dependencies[name] = relocated.importers['.'].dependencies[name].specifier
const field = { manifest: fieldManifest, lock: relocated }
const crossDrive = plan(targetProfile, field)
assert.equal(crossDrive.snapshotsVerified, sameDrive.snapshotsVerified)
const importer = crossDrive.lock.importers['.'].dependencies
for (const archive of archives) {
  const specifier = 'file:' + archive.path.replaceAll('\\', '/')
  assert.equal(importer[archive.name].specifier, specifier)
  assert.ok(importer[archive.name].version === specifier || importer[archive.name].version.startsWith(specifier + '('))
  assert.equal(crossDrive.lock.packages[archive.name + '@' + specifier].resolution.tarball, specifier)
}
assert.ok(importer[harmony].version.includes(rich + '@' + richFile))
assert.equal(importer[rich].version, richFile)
assert.deepEqual(importer[extra], relocated.importers['.'].dependencies[extra])
for (const table of ['packages', 'snapshots']) for (const key of [extraKey, unrelatedSameName]) {
  assert.deepEqual(crossDrive.lock[table][key], relocated[table][key])
}
assert.ok(!JSON.stringify(crossDrive.lock).includes('file:../../archives/harmony-before.tgz'))

const rejected = []
for (const [label, message, change] of [
  ['old-harmony-integrity', /Previous Harmony package differs/, lock => { lock.packages[harmony + '@file:../../archives/harmony-before.tgz'].resolution.integrity = 'sha512-changed' }],
  ['rich-integrity', /Dependency package differs.*rich-inline/, lock => { lock.packages[rich + '@' + richFile].resolution.integrity = 'sha512-changed' }],
  ['dependency-snapshot', /Dependency snapshot differs.*dsh-brand/, lock => { lock.snapshots['@deepseek-ai/dsh-brand@0.2.1-rc.2'] = { dependencies: { zod: '0.0.0' } } }],
  ['missing-transitive-record', /Dependency package differs.*zod/, lock => { delete lock.packages['zod@4.4.3'] }],
  ['conflicting-indirect-add', /Existing packages row differs.*dsh-deque/, lock => { lock.packages['@deepseek-ai/dsh-deque@0.2.1-rc.2'] = { resolution: { integrity: 'sha512-changed' } } }],
  ['old-harmony-still-referenced', /retained lock record still references/, lock => { lock.snapshots[extraKey].dependencies[harmony] = lock.importers['.'].dependencies[harmony].version }],
  ['second-direct-declaration', /second direct declaration/, lock => { lock.importers['.'].optionalDependencies = { [harmony]: lock.importers['.'].dependencies[harmony] } }],
]) {
  const invalid = structuredClone(relocated)
  change(invalid)
  assert.throws(() => plan(targetProfile, { ...field, lock: invalid }), message)
  rejected.push(label)
}
const wrongRichLock = structuredClone(relocated), wrongRichManifest = structuredClone(fieldManifest)
wrongRichLock.importers['.'].dependencies[rich].specifier = wrongRichManifest.dependencies[rich] = 'file:E:/synthetic/different.tgz'
assert.throws(() => plan(targetProfile, { lock: wrongRichLock, manifest: wrongRichManifest }), /manifest and lock archive paths disagree/)
rejected.push('rich-manifest-points-to-different-file')
const existingIndirect = structuredClone(relocated)
for (const table of ['packages', 'snapshots']) existingIndirect[table]['@deepseek-ai/dsh-deque@0.2.1-rc.2'] = after[table]['@deepseek-ai/dsh-deque@0.2.1-rc.2']
assert.deepEqual(plan(targetProfile, { ...field, lock: existingIndirect }), crossDrive)

const snapshot = await mkdtemp(join(scratch, 'workspace-desktop-lock-input-'))
const snapshotManifest = JSON.stringify(fieldManifest), snapshotLock = yaml.dump(relocated, { noRefs: true, lineWidth: -1 })
await writeFile(join(snapshot, 'package.json'), snapshotManifest, { flag: 'wx' })
await writeFile(join(snapshot, 'pnpm-lock.yaml'), snapshotLock, { flag: 'wx' })
const cli = await execa(process.execPath, [source, snapshot, targetProfile], { cwd: lab, timeout: 15000, stdin: 'ignore', windowsHide: true })
const cliResult = JSON.parse(cli.stdout)
assert.ok(cliResult.prepared && cliResult.snapshotsVerified === 71)
assert.match(cliResult.plan, /^\.build\/workspace-desktop-lock-plan-[\w-]+\/plan\.json$/)
const planned = await readJson(join(lab, cliResult.plan)), output = resolve(lab, cliResult.plan, '..')
assert.equal(planned.applied, false)
assert.equal(planned.targetProfile, targetProfile)
assert.equal(planned.baselineManifestSha256, hash(snapshotManifest))
assert.equal(planned.baselineLockSha256, hash(snapshotLock))
const manifestBytes = await readFile(join(output, 'package.next.json')), lockBytes = await readFile(join(output, 'pnpm-lock.next.yaml'))
assert.equal(planned.candidateManifestSha256, hash(manifestBytes))
assert.equal(planned.candidateLockSha256, hash(lockBytes))
assert.deepEqual(JSON.parse(manifestBytes), crossDrive.manifest)
assert.deepEqual(yaml.load(lockBytes), crossDrive.lock)
assert.equal(await readFile(join(snapshot, 'package.json'), 'utf8'), snapshotManifest)
assert.equal(await readFile(join(snapshot, 'pnpm-lock.yaml'), 'utf8'), snapshotLock)

const world = await realpath(rehearsal.world), privateHome = await realpath(rehearsal.privateHome)
assert.match(relative(scratch, world), /^workspace-package-install-[\w-]+$/)
assert.equal(privateHome, join(world, 'home'))
const profile = await mkdtemp(join(privateHome, 'profiles', 'desktop-lock-portable-'))
assert.deepEqual(plan(profile).lock, sameDrive.lock)
await writeFile(join(profile, 'package.json'), JSON.stringify(sameDrive.manifest, null, 2) + '\n', { flag: 'wx' })
await writeFile(join(profile, 'pnpm-lock.yaml'), yaml.dump(sameDrive.lock, { noRefs: true, lineWidth: -1 }), { flag: 'wx' })
await writeFile(join(profile, 'pnpm-workspace.yaml'), await readFile(join(backup, 'pnpm-workspace.yaml')), { flag: 'wx' })
const registry = new URL(rehearsal.registry)
assert.equal(registry.hostname, '127.0.0.1')
assert.equal(registry.protocol, 'http:')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { USERPROFILE: privateHome, COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
  npm_config_userconfig: join(world, 'npmrc'), npm_config_globalconfig: join(world, 'npm-globalrc'), npm_config_cache: join(world, 'npm-cache'),
  PNPM_HOME: join(world, 'pnpm-home'), TEMP: profile, TMP: profile })
const result = await execa(rehearsal.exe, ['install', '--frozen-lockfile', '--offline', '--ignore-scripts', '--registry=' + registry.origin,
  '--store-dir=' + join(world, 'pnpm-store')], { cwd: profile, env, extendEnv: false, reject: false, stdin: 'ignore', windowsHide: true, timeout: 60000, killDescendants: true })
await writeFile(join(profile, 'frozen.log'), result.stdout + '\n' + result.stderr + '\n', { flag: 'wx' })
assert.equal(result.timedOut, false)
assert.equal(result.signal ?? null, null)
assert.equal(result.exitCode, 0, result.stderr + '\n' + result.stdout)
let filesVerified = 0
const modules = join(profile, 'node_modules')
for (const { name, inventory } of rehearsal.archives) {
  const root = await realpath(join(modules, name)), inside = relative(modules, root)
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), name)
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(file => file.isFile())
    .map(file => relative(root, join(file.parentPath, file.name)).replaceAll('\\', '/')).sort()
  assert.deepEqual(files, inventory.map(file => file.path).sort(), name)
  for (const file of inventory) assert.equal(hash(await readFile(join(root, file.path))), file.sha256, name + '/' + file.path)
  filesVerified += inventory.length
}
const evidence = 'evidence/workspace-desktop-release-plan-' + Date.now() + '.json'
await writeFile(join(lab, evidence), JSON.stringify({ passed: true, proof, sourceSha256: hash(await readFile(source)), plan: cliResult.plan,
  sameDriveMatchesPnpmPlan: true, syntheticCrossDrive: true, snapshotsVerified: sameDrive.snapshotsVerified, rejected,
  existingExactIndirectRecordRetained: true, unrelatedRecordsRetained: true, sameDriveFrozenInstallExit: result.exitCode,
  frozenLog: relative(lab, join(profile, 'frozen.log')).replaceAll('\\', '/'), filesVerified, dailyProfileUsed: false, physicalPhoneUsed: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: true, evidence, filesVerified, rejections: rejected.length }))

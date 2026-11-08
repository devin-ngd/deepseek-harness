/** Generate and verify the release lock against the rehearsed Desktop profile, entirely offline. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, copyFile, mkdir, mkdtemp, realpath, rename, readdir, stat, link } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const lab = resolve('.'), scratch = await realpath('.build')
const releasePath = 'evidence/workspace-desktop-archive-compact-release-20261107/release.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const local = path => relative(lab, path).replaceAll('\\', '/')
const reference = async path => ({ path: local(path), sha256: hash(await readFile(path)) })
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const readVerified = async ({ path, sha256 }) => {
  const resolved = await realpath(path), inside = relative(lab, resolved)
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Release input must stay in the lab')
  const bytes = await readFile(resolved)
  assert.equal(hash(bytes), sha256, path)
  return bytes
}
const release = await readJson(releasePath)
assert.ok(release.passed && release.desktopRollback.frozenOfflineRollback && release.desktopRollback.frozenOfflineRestore)
const rehearsal = JSON.parse(await readVerified(release.isolatedDesktopPnpm))
assert.ok(rehearsal.passed && rehearsal.profile === 'desktop' && !rehearsal.userProfileUsed && !rehearsal.appStarted)
const rehearsalWorld = await realpath(rehearsal.world)
assert.match(relative(scratch, rehearsalWorld), /^workspace-package-install-[\w-]+$/)
const privateHome = join(rehearsalWorld, 'home')
assert.equal(await realpath(rehearsal.privateHome), privateHome)
const profile = await mkdtemp(join(privateHome, 'profiles', 'desktop-lock-preflight-'))
const baseline = join(rehearsalWorld, 'archive-boundary', 'baseline'), candidate = join(rehearsalWorld, 'archive-boundary', 'candidate')
const require = createRequire(resolve('../../package.json')), yaml = require('js-yaml')
const { execa } = await import(pathToFileURL(createRequire(resolve('../../packages/boot/plugin-manager/package.json')).resolve('execa')).href)
const originalManifest = await readFile(join(baseline, 'package.json'))
const originalLock = await readFile(join(baseline, 'pnpm-lock.yaml'))
const rehearsedLock = await readFile(join(candidate, 'pnpm-lock.yaml'))
assert.equal(hash(originalLock), release.desktopRollback.baselineLockSha256)
assert.equal(hash(rehearsedLock), release.desktopRollback.candidateLockSha256)
const configFiles = await Promise.all(['pnpm-workspace.yaml', 'cordis.patch.yml'].map(async name => [name, await readFile(join(privateHome, 'profiles', 'desktop', name))]))
const original = JSON.parse(originalManifest), before = yaml.load(originalLock.toString()), rehearsed = yaml.load(rehearsedLock.toString())
const archives = await Promise.all(release.archives.map(async entry => {
  const bytes = await readVerified(entry.archive)
  const path = await realpath(entry.archive.path), specifier = 'file:' + path.replaceAll('\\', '/')
  const relativeSpecifier = 'file:' + relative(profile, path).replaceAll('\\', '/')
  return { name: entry.name, path, specifier, relativeSpecifier, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }
}))
const names = new Set(archives.map(item => item.name))
assert.equal(names.size, 3)
const harmony = archives.find(item => item.name === '@deepseek-ai/dsh-experimental-harmony-mobile')
assert.ok(harmony)
const baselineSpecifier = original.dependencies[harmony.name]
assert.match(baselineSpecifier, /^file:/)
const baselineArchive = await realpath(resolve(profile, baselineSpecifier.slice(5)))
assert.equal(dirname(baselineArchive), rehearsalWorld)
assert.equal(hash(await readFile(baselineArchive)), release.baselineHarmonySha256)
for (const entry of archives) if (entry !== harmony) assert.equal(original.dependencies[entry.name], undefined)

const ownedFile = key => archives.some(({ name }) => key.startsWith(name + '@file:'))
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)))
const permittedAdditions = table => Object.fromEntries(Object.entries(rehearsed[table]).filter(([key]) => !ownedFile(key) && !Object.hasOwn(before[table], key)))
const indirect = { packages: permittedAdditions('packages'), snapshots: permittedAdditions('snapshots') }
assert.deepEqual(Object.keys(indirect.packages).sort(), ['@deepseek-ai/dsh-deque@0.2.1-rc.2', '@deepseek-ai/dsh-native-command@0.2.1-rc.2'])
const relocations = archives.map(item => {
  const prior = rehearsal.archives.find(candidate => candidate.name === item.name)
  return ['file:' + relative(profile, prior.archive).replaceAll('\\', '/'), item.relativeSpecifier]
})
const relocate = value => JSON.parse(relocations.reduce((text, [from, to]) => text.replaceAll(from, to), JSON.stringify(value)))

function verifyLock(after) {
  const tables = new Set(['importers', 'packages', 'snapshots'])
  assert.deepEqual(omit(after, tables), omit(before, tables), 'Lockfile settings changed')
  assert.deepEqual(Object.keys(after.importers), ['.'])
  assert.deepEqual(Object.keys(before.importers), ['.'])
  const oldImporter = before.importers['.'], importer = after.importers['.']
  assert.deepEqual(omit(importer, new Set(['dependencies'])), omit(oldImporter, new Set(['dependencies'])), 'Importer configuration changed')
  assert.deepEqual(omit(importer.dependencies, names), omit(oldImporter.dependencies, names), 'Unrelated direct dependencies changed')
  for (const table of ['packages', 'snapshots']) {
    const unowned = rows => Object.fromEntries(Object.entries(rows).filter(([key]) => !ownedFile(key)))
    assert.deepEqual(unowned(after[table]), { ...unowned(before[table]), ...indirect[table] }, 'Unrelated ' + table + ' changed')
    assert.equal(Object.keys(after[table]).filter(ownedFile).length, archives.length, 'Unexpected release records in ' + table)
  }
  for (const item of archives) {
    const dependency = importer.dependencies[item.name]
    assert.equal(dependency.specifier, item.specifier)
    assert.ok(dependency.version === item.relativeSpecifier || dependency.version.startsWith(item.relativeSpecifier + '('))
    const locked = after.packages[item.name + '@' + item.relativeSpecifier]
    assert.equal(locked.resolution.integrity, item.integrity, 'Candidate archive integrity mismatch')
    assert.equal(locked.resolution.tarball, item.relativeSpecifier)
    const prior = relocations.find(([, to]) => to === item.relativeSpecifier)[0]
    const priorVersion = rehearsed.importers['.'].dependencies[item.name].version
    assert.equal(dependency.version, relocate(priorVersion), 'Candidate peer resolution changed')
    assert.deepEqual(locked, relocate(rehearsed.packages[item.name + '@' + prior]), 'Candidate package metadata changed')
    assert.deepEqual(after.snapshots[item.name + '@' + dependency.version], relocate(rehearsed.snapshots[item.name + '@' + priorVersion]),
      'Candidate dependency graph changed')
  }
}

await Promise.all([...configFiles, ['package.json', originalManifest], ['pnpm-lock.yaml', originalLock]].map(([path, bytes]) => writeFile(join(profile, path), bytes, { flag: 'wx' })))
const executable = join(homedir(), 'AppData/Roaming/npm/node_modules/pnpm/pnpm.exe')
assert.equal(await realpath(rehearsal.exe), await realpath(executable))
const registry = new URL(rehearsal.registry)
assert.equal(registry.hostname, '127.0.0.1')
assert.equal(registry.protocol, 'http:')
assert.equal(registry.pathname, '/')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { USERPROFILE: privateHome, COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
  npm_config_userconfig: join(rehearsalWorld, 'npmrc'), npm_config_globalconfig: join(rehearsalWorld, 'npm-globalrc'),
  npm_config_cache: join(rehearsalWorld, 'npm-cache'), PNPM_HOME: join(rehearsalWorld, 'pnpm-home'), TEMP: profile, TMP: profile })
const options = { cwd: profile, env, extendEnv: false, reject: false, stdin: 'ignore', windowsHide: true, timeout: 60000, killDescendants: true }
const flags = ['--offline', '--ignore-scripts', '--registry=' + registry.origin, '--store-dir=' + join(rehearsalWorld, 'pnpm-store')]
const manager = await execa(executable, ['--version'], options)
assert.equal(manager.exitCode, 0)
assert.equal(manager.stdout, '12.6.0')
const commands = []
async function pnpm(label, args) {
  const result = await execa(executable, [...args, ...flags], options)
  await writeFile(join(profile, label + '.log'), result.stdout + '\n' + result.stderr + '\n', { flag: 'wx' })
  commands.push({ label, args: [...args, ...flags], code: result.exitCode, signal: result.signal ?? null, timedOut: result.timedOut })
  assert.equal(result.timedOut, false)
  assert.equal(result.signal ?? null, null)
  assert.equal(result.exitCode, 0, result.stderr + '\n' + result.stdout)
}
await pnpm('lock-only', ['add', '--lockfile-only', ...archives.map(item => item.path)])
const modules = join(profile, 'node_modules')
await assert.rejects(stat(modules), { code: 'ENOENT' })
const proposedManifest = await readFile(join(profile, 'package.json')), proposedLock = await readFile(join(profile, 'pnpm-lock.yaml'))
const after = yaml.load(proposedLock.toString())
assert.deepEqual(JSON.parse(proposedManifest), { ...original, dependencies: { ...original.dependencies,
  ...Object.fromEntries(archives.map(item => [item.name, item.specifier])) } })
verifyLock(after)
const negative = [
  ['lock-settings', 'Lockfile settings changed', lock => { lock.settings.autoInstallPeers = true }],
  ['direct-dependency', 'Unrelated direct dependencies changed', lock => { lock.importers['.'].dependencies['dsh-devflow'].specifier = '99.0.0' }],
  ['registry-source', 'Unrelated packages changed', lock => { lock.packages['@deepseek-ai/dsh-brand@0.2.1-rc.2'].resolution.tarball = 'http://127.0.0.1:9/changed.tgz' }],
  ['candidate-integrity', 'Candidate archive integrity mismatch', lock => { lock.packages[harmony.name + '@' + harmony.relativeSpecifier].resolution.integrity = 'sha512-incorrect' }],
  ['candidate-dependency', 'Candidate dependency graph changed', lock => {
    const key = harmony.name + '@' + lock.importers['.'].dependencies[harmony.name].version
    lock.snapshots[key].dependencies['@deepseek-ai/dsh-deque'] = '0.0.0'
  }],
]
for (const [, message, change] of negative) {
  const invalid = structuredClone(after)
  change(invalid)
  assert.throws(() => verifyLock(invalid), { message: new RegExp(message) })
}
const proposed = ['package.next.json', 'pnpm-lock.next.yaml'].map(path => join(profile, path))
await writeFile(proposed[0], proposedManifest, { flag: 'wx' })
await writeFile(proposed[1], proposedLock, { flag: 'wx' })

const witnesses = await Promise.all(release.desktopRollback.witnessesVerified.map(async path => {
  const bytes = await readFile(join(privateHome, 'profiles', 'desktop', path))
  const target = join(profile, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes, { flag: 'wx' })
  return [path, bytes]
}))
const packageRoot = async name => {
  const root = await realpath(join(modules, name)), within = relative(modules, root)
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within), name)
  return root
}
const packageFiles = async root => (await readdir(root, { recursive: true, withFileTypes: true })).filter(file => file.isFile())
  .map(file => relative(root, join(file.parentPath, file.name)).replaceAll('\\', '/')).sort()
const verifyFiles = async (items, manifest, lock) => {
  for (const item of items) {
    const root = await packageRoot(item.name)
    assert.deepEqual(await packageFiles(root), item.inventory.map(file => file.path).sort(), item.name)
    for (const file of item.inventory) {
      const path = item.name + '/' + file.path
      assert.deepEqual({ path, sha256: hash(await readFile(join(root, file.path))) }, { path, sha256: file.sha256 })
    }
  }
  for (const [path, bytes] of [...configFiles, ...witnesses, ['package.json', manifest], ['pnpm-lock.yaml', lock]]) {
    assert.deepEqual(await readFile(join(profile, path)), bytes, path)
  }
}
const writeMetadata = async (manifest, lock) => {
  await writeFile(join(profile, 'package.json'), manifest)
  await writeFile(join(profile, 'pnpm-lock.yaml'), lock)
}
await writeMetadata(originalManifest, originalLock)
await pnpm('baseline-frozen', ['install', '--frozen-lockfile'])
const field = await readJson('evidence/workspace-desktop-field-wss-fragments-installed.json')
assert.equal(field.archiveSha256, release.baselineHarmonySha256)
const harmonyRoot = await packageRoot(harmony.name)
assert.equal(hash(await readFile(join(harmonyRoot, 'lib/device.js'))), field.deviceEntrySha256)
const harmonyInventory = await Promise.all((await packageFiles(harmonyRoot)).map(async path => ({ path, sha256: hash(await readFile(join(harmonyRoot, path))) })))
const harmonyRelease = release.archives.find(item => item.name === harmony.name)
assert.equal(harmonyInventory.length, harmonyRelease.fileCount)
const baselinePackages = [{ name: harmony.name, inventory: harmonyInventory }, ...rehearsal.archives.filter(item => !names.has(item.name))]
const localPlugin = { name: 'harmony-emulator-local', inventory: [] }
assert.equal(original.dependencies[localPlugin.name], undefined)
const localPluginPath = join(modules, localPlugin.name)
await mkdir(localPluginPath)
for (const [path, contents] of [['package.json', '{"name":"harmony-emulator-local","version":"0.0.0-test","main":"index.cjs"}\n'],
  ['index.cjs', 'module.exports = Object.freeze({ isolated: true })\n']]) {
  await writeFile(join(localPluginPath, path), contents, { flag: 'wx' })
  localPlugin.inventory.push({ path, sha256: hash(contents) })
}
const layoutFiles = ['.pnpm/lock.yaml', '.modules.yaml', '.pnpm-workspace-state-v1.json']
const layout = await Promise.all(layoutFiles.map(async path => [path, await readFile(join(modules, path))]))
const configPath = join(profile, 'cordis.patch.yml'), originalConfig = await readFile(configPath)
const tracePattern = /(^    workspace:)(\r?\n)(?=      wire:)/gm
assert.equal([...originalConfig.toString().matchAll(tracePattern)].length, 1)
assert.ok(!originalConfig.includes('traceRequests:'))
const traceConfig = Buffer.from(originalConfig.toString().replace(tracePattern, '$1$2      traceRequests: true$2'))
const traced = yaml.load(traceConfig.toString()), originalPatch = yaml.load(originalConfig.toString())
assert.equal(traced[0].id, 'harmony-mobile-device')
assert.equal(traced[0].config.workspace.traceRequests, true)
delete traced[0].config.workspace.traceRequests
assert.deepEqual(traced, originalPatch)
const settings = release.archives.find(item => item.name === '@deepseek-ai/dsh-client-ui-settings-general')
const invalidEntry = Buffer.from('// isolated post-install verification failure\n')
const rejectedPath = settings.name + '/' + settings.entry.path
const rollbackChecks = []
const releaseReference = await reference(releasePath)

async function verifyBaseline() {
  await verifyFiles([...baselinePackages, localPlugin], originalManifest, originalLock)
  for (const [path, bytes] of layout) assert.deepEqual(await readFile(join(modules, path)), bytes, path)
  for (const item of archives) if (item !== harmony) await assert.rejects(stat(join(modules, item.name)), { code: 'ENOENT' })
}

async function installCandidate(label, receiptPath, injectFailure) {
  await verifyBaseline()
  const ownedProfile = await realpath(profile)
  assert.equal(ownedProfile, profile)
  assert.equal(await realpath(modules), join(ownedProfile, 'node_modules'))
  const backup = await mkdtemp(join(ownedProfile, 'release-backup-'))
  assert.equal(dirname(await realpath(backup)), ownedProfile)
  for (const [path, bytes] of [...configFiles, ['package.json', originalManifest], ['pnpm-lock.yaml', originalLock]]) {
    await writeFile(join(backup, path), bytes, { flag: 'wx' })
    assert.deepEqual(await readFile(join(backup, path)), bytes)
  }
  const retained = join(backup, 'node_modules')
  await rename(modules, retained)
  try {
    await writeMetadata(proposedManifest, proposedLock)
    await pnpm(label, ['install', '--frozen-lockfile'])
    assert.equal(await realpath(modules), join(ownedProfile, 'node_modules'))
    await mkdir(localPluginPath)
    for (const { path } of localPlugin.inventory) await copyFile(join(retained, localPlugin.name, path), join(localPluginPath, path))
    await injectFailure?.(backup)
    await verifyFiles([...rehearsal.archives, localPlugin], proposedManifest, proposedLock)
    await writeFile(configPath, traceConfig)
    assert.deepEqual(await readFile(configPath), traceConfig)
    const receipt = { releaseSha256: releaseReference.sha256, archiveSha256: harmonyRelease.archive.sha256,
      archives: Object.fromEntries(release.archives.map(item => [item.name, item.archive.sha256])),
      entries: Object.fromEntries(release.archives.map(item => [item.name, item.entry.sha256])),
      deviceEntrySha256: harmonyRelease.entry.sha256, traceConfigSha256: hash(traceConfig), previousConfigSha256: hash(originalConfig),
      backup: local(backup), rehearsal: true, desktopExitedNormally: false, traceEnabled: true,
      verifiedPackageFiles: rehearsal.archives.reduce((count, item) => count + item.inventory.length, 0),
      unmanagedPluginFilesVerified: localPlugin.inventory.length }
    const validated = join(backup, 'validated-install-receipt.json')
    await writeFile(validated, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', flush: true })
    await link(validated, receiptPath)
  } catch (error) {
    const installed = await realpath(modules).catch(failure => { if (failure.code === 'ENOENT') return undefined; throw failure })
    if (installed !== undefined) {
      assert.equal(installed, join(ownedProfile, 'node_modules'))
      await rename(modules, join(backup, 'rejected-node_modules'))
    }
    assert.equal(await realpath(retained), retained)
    await rename(retained, modules)
    await writeMetadata(originalManifest, originalLock)
    await writeFile(configPath, originalConfig)
    await verifyBaseline()
    rollbackChecks.push(label)
    throw error
  }
}

const rejectedReceipt = join(profile, 'rejected-install-receipt.json')
await assert.rejects(installCandidate('candidate-bad-entry', rejectedReceipt, async backup => {
  const installed = join(await packageRoot(settings.name), settings.entry.path)
  const saved = join(backup, 'original-candidate-client.js')
  await rename(installed, saved)
  assert.equal(hash(await readFile(saved)), settings.entry.sha256)
  await writeFile(installed, invalidEntry, { flag: 'wx' })
}), { code: 'ERR_ASSERTION', actual: { path: rejectedPath, sha256: hash(invalidEntry) },
  expected: { path: rejectedPath, sha256: settings.entry.sha256 } })
await assert.rejects(stat(rejectedReceipt), { code: 'ENOENT' })
const occupied = Buffer.from('existing isolated receipt witness\n')
await writeFile(rejectedReceipt, occupied, { flag: 'wx' })
await assert.rejects(installCandidate('candidate-receipt-conflict', rejectedReceipt), { code: 'EEXIST', dest: rejectedReceipt })
assert.deepEqual(await readFile(rejectedReceipt), occupied)
assert.deepEqual(rollbackChecks, ['candidate-bad-entry', 'candidate-receipt-conflict'])
const receiptPath = join(profile, 'isolated-install-receipt.json')
await installCandidate('candidate-frozen', receiptPath)
const receipt = await readJson(receiptPath)
assert.equal(receipt.rehearsal, true)
assert.equal(receipt.traceConfigSha256, hash(await readFile(configPath)))
const report = 'evidence/workspace-desktop-lock-preflight-' + Date.now() + '.json'
await writeFile(report, JSON.stringify({ passed: true, profile, release: releaseReference, rehearsal: release.isolatedDesktopPnpm,
  source: await reference(fileURLToPath(import.meta.url)), lockfileOnlyCreatedNoNodeModules: true,
  proposedMetadata: await Promise.all(proposed.map(reference)),
  originalLockSha256: hash(originalLock), proposedLockSha256: hash(proposedLock), approvedIndirectAdds: Object.keys(indirect.packages),
  rejected: negative.map(([label]) => label), candidateFilesVerified: rehearsal.archives.map(item => ({ name: item.name, count: item.inventory.length })),
  failedInstalledFile: rejectedPath, rollbackFilesVerified: baselinePackages.map(item => ({ name: item.name, count: item.inventory.length })),
  witnessesVerified: witnesses.map(([path]) => path),
  commands, failedInstallsRestoredOriginalMetadata: rollbackChecks, layoutFilesRestored: layoutFiles,
  isolatedInstallReceipt: await reference(receiptPath), dailyProfileUsed: false, realModels: 0 }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: true, report }))

/** Attempt the supported plugin CLI against the sealed local archive with private configuration and loopback-only registry settings. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, readdir, copyFile, realpath, rename } from 'node:fs/promises'
import { basename, join, resolve, dirname, relative, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createWorkspaceDependencyMirror } from './workspace-dependency-mirror.mjs'
const flags = process.argv.slice(2)
const publishedCases = new Map([
  ['--published-tab-complete', { name: 'dsh-tab-complete', receipt: 'workspace-thirdparty-release-admission-20261107.json',
    archivePattern: /^\.build\/workspace-thirdparty-tab-complete-[a-z0-9_]+\/dsh-tab-complete-0\.1\.1\.tgz$/, sha256: 'dbba8f8ce3f6e426d2c1418589ba810d2ae3ffd63622eefe3ae8a5605562ba36' }],
  ['--published-chat-index-rail', { name: 'dsh-chat-index-rail', receipt: 'workspace-thirdparty-chat-index-rail-release-20261107.json',
    archivePattern: /^\.build\/workspace-thirdparty-chat-index-rail-[a-z0-9_]+\/dsh-chat-index-rail-0\.1\.1\.tgz$/, sha256: '8b7c9a0c46e26c4ee5b382a55053aedb2346967f34834292ce234711242b7fe4' }],
  ['--published-theme-brick', { name: 'dsh-theme-brick', version: '0.2.1', receipt: 'workspace-thirdparty-theme-brick-release-20261107.json',
    archivePattern: /^\.build\/workspace-thirdparty-theme-brick-[a-z0-9_]+\/dsh-theme-brick-0\.2\.1\.tgz$/, sha256: 'b225d8b3a1864d750f11e53fc76bdef0e5d379c15b43cdfb59668645df6c294c', additionalFiles: ['DESIGN.md'] }],
])
const installCases = ['--all', '--mirror', '--third-party', '--installed-archive-manager', '--upgrade-archive-boundary', ...publishedCases.keys(), '--complete-desktop', '--complete-desktop-command', '--upgrade-desktop-command', '--upgrade-workspace-grant', '--upgrade-panel-recovery']
const desktopArchiveInput = /^--upgrade-archive-boundary-desktop=(evidence\/workspace-plugin-install-\d+\.json)$/.exec(flags[0] ?? '')?.[1]
assert.ok(flags.length <= 1 && (flags.every(flag => installCases.includes(flag)) || desktopArchiveInput !== undefined),
  'usage: [' + installCases.join(' | ') + ' | --upgrade-archive-boundary-desktop=evidence/<install receipt>.json]')
const thirdPartyRequested = flags[0] === '--third-party'
const upgradeArchiveBoundary = flags[0] === '--upgrade-archive-boundary' || desktopArchiveInput !== undefined
const installedArchiveManager = flags[0] === '--installed-archive-manager' || upgradeArchiveBoundary
const published = publishedCases.get(flags[0])
const upgradeGrant = flags[0] === '--upgrade-workspace-grant'
const upgradeRecovery = flags[0] === '--upgrade-panel-recovery'
const upgradeDesktop = flags[0] === '--upgrade-desktop-command' || upgradeGrant || upgradeRecovery
const desktopPnpm = upgradeDesktop || desktopArchiveInput !== undefined
const completeDesktopCommand = upgradeDesktop || flags[0] === '--complete-desktop-command'
const completeDesktop = completeDesktopCommand || flags[0] === '--complete-desktop'
const all = flags[0] === '--all' || thirdPartyRequested || installedArchiveManager || published !== undefined || completeDesktop
const useMirror = all || flags[0] === '--mirror'
const thirdPartyName = '@michengai/dsh-skills-manager'
const copied = JSON.parse(await readFile('evidence/workspace-installed-runtime.json', 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const review = JSON.parse(await readFile('evidence/workspace-review-bundle.json', 'utf8')), manifest = JSON.parse(await readFile(join(review.destination, 'manifest.json'), 'utf8'))
/** Reads the pinned validation and bytes for a complete Harmony desktop archive. */
async function completeArchive(proofFile, baseline) {
  const proof = JSON.parse(await readFile(proofFile, 'utf8'))
  const report = await readFile(proof.path); assert.equal(sha(report), proof.sha256)
  const entry = JSON.parse(report)
  assert.equal(entry.passed, true)
  if (baseline !== undefined) {
    assert.equal(entry.baselineSha256, baseline.sha256); assert.equal(entry.name, baseline.name)
  }
  const bytes = await readFile(entry.archive); assert.equal(sha(bytes), entry.sha256)
  return { entry, bytes }
}
let recoveryBaseline
if (upgradeRecovery) {
  recoveryBaseline = await completeArchive('evidence/workspace-desktop-revocation-candidate.json')
  const field = JSON.parse(await readFile('evidence/workspace-desktop-field-rc253-installed.json', 'utf8'))
  assert.equal(recoveryBaseline.entry.name, '@deepseek-ai/dsh-experimental-harmony-mobile')
  assert.equal(recoveryBaseline.entry.sha256, field.archiveSha256)
  assert.equal(recoveryBaseline.entry.deviceEntrySha256, field.deviceEntrySha256)
}
/** Reads one sealed candidate archive from the review bundle and verifies its recorded digest. */
async function sealedArchive(id) {
  if (upgradeArchiveBoundary && id === 'harmony-mobile') {
    const baseline = await completeArchive('evidence/workspace-desktop-wss-fragments-candidate.json')
    const field = JSON.parse(await readFile('evidence/workspace-desktop-field-wss-fragments-installed.json', 'utf8'))
    assert.equal(baseline.entry.sha256, field.archiveSha256)
    return baseline
  }
  if ((published !== undefined || installedArchiveManager) && id === 'harmony-mobile') return completeArchive('evidence/workspace-desktop-close-cancellation-candidate.json')
  const entry = manifest.artifacts.find(entry => entry.file.startsWith(id + '-') && entry.file.endsWith('.tgz')); assert.ok(entry, id)
  if (completeDesktop && id === 'harmony-mobile') {
    if (recoveryBaseline !== undefined) return completeArchive('evidence/workspace-desktop-panel-recovery-candidate.json', recoveryBaseline.entry)
    return completeArchive(upgradeGrant ? 'evidence/workspace-desktop-grant-rc249-candidate.json'
      : completeDesktopCommand ? 'evidence/workspace-desktop-command-complete-validation.json' : 'evidence/workspace-desktop-complete-validation.json', entry)
  }
  const bytes = await readFile(join(review.destination, entry.file)); assert.equal(sha(bytes), entry.sha256)
  return { entry, bytes }
}
const world = await mkdtemp(resolve('.build/workspace-package-install-')), testHome = join(world, 'home'), profileName = desktopPnpm ? 'desktop' : 'web', profile = join(testHome, 'profiles', profileName)
const sourceSha256 = {}
for (const path of ['scripts/check-workspace-plugin-install.mjs', 'scripts/workspace-dependency-mirror.mjs']) sourceSha256[path] = sha(await readFile(path))
await mkdir(profile, { recursive: true })
const npmConfig = join(world, 'npmrc'), globalConfig = join(world, 'npm-globalrc')
/** Copies the unchanged published package from the daily profile (read only) so the standard CLI installs the same bytes into the private profile. */
async function stageThirdParty() {
  const profileRoot = join(homedir(), '.dsh/profiles/desktop'), source = await realpath(join(profileRoot, 'node_modules', thirdPartyName))
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')); assert.equal(manifest.name, thirdPartyName)
  const lock = await readFile(join(profileRoot, 'pnpm-lock.yaml'), 'utf8')
  const lockIntegrity = new RegExp("'" + thirdPartyName + '@' + manifest.version.replaceAll('.', '\\.') + "':\\r?\\n\\s+resolution: \\{integrity: (sha512-[A-Za-z0-9+/=]+)\\}").exec(lock)?.[1]
  assert.ok(lockIntegrity, 'the daily profile lock must pin the installed registry tarball')
  const stage = join(world, 'third-party'), packageDir = join(stage, 'package'), inventory = []
  async function copyTree(relativeDirectory) {
    for (const entry of await readdir(join(source, relativeDirectory), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const local = relativeDirectory ? relativeDirectory + '/' + entry.name : entry.name
      if (entry.isDirectory()) { await copyTree(local); continue }
      assert.ok(entry.isFile(), local)
      const bytes = await readFile(join(source, local)); await mkdir(dirname(join(packageDir, local)), { recursive: true }); await copyFile(join(source, local), join(packageDir, local))
      inventory.push({ path: local, bytes: bytes.length, sha256: sha(bytes) })
    }
  }
  await copyTree(''); inventory.sort((left, right) => left.path.localeCompare(right.path))
  const archive = join(world, 'third-party.tgz')
  await promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', archive, '-C', stage, 'package'], { windowsHide: true, timeout: 30000 })
  const exactDependencies = Object.entries(manifest.dependencies ?? {}).filter(([, range]) => /^\d+\.\d+\.\d+$/.test(range)).map(([name, version]) => name + '@' + version)
  return { name: thirdPartyName, version: manifest.version, source, lockIntegrity, inventory, archive, sha256: sha(await readFile(archive)), exactDependencies }
}
async function stagePublishedPackage(selection) {
  const release = JSON.parse(await readFile(join('evidence', selection.receipt), 'utf8'))
  const candidate = (release.packages ?? [release]).find(item => item.name === selection.name && item.version === (selection.version ?? '0.1.1'))
  assert.ok(candidate?.hostApplyEmpty && candidate.packageInstallLifecycleScripts.length === 0)
  assert.match(candidate.archive, selection.archivePattern)
  const bytes = await readFile(candidate.archive)
  assert.equal(sha(bytes), selection.sha256)
  assert.equal(sha(bytes), candidate.archiveSha256)
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), candidate.registryIntegrity)
  const inventory = Object.entries(candidate.files).map(([path, item]) => ({ path, ...item }))
  assert.deepEqual(inventory.map(item => item.path).sort(), [...selection.additionalFiles ?? [], 'LICENSE', 'README.md', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'package.json'])
  const archive = join(world, basename(candidate.archive))
  await writeFile(archive, bytes, { flag: 'wx' })
  return { name: candidate.name, version: candidate.version, archive, inventory, sha256: candidate.archiveSha256,
    registryIntegrity: candidate.registryIntegrity, exactDependencies: [] }
}
async function stageInstalledArchiveManager() {
  const evidence = 'evidence/workspace-archive-manager-installed-bytes-20261107.json'
  const bytes = await readFile(evidence)
  const evidenceSha256 = 'eb404fbb61d692e5b0fd79da20574c2c6e91484e64c1728b6bd6eb534682dc50'
  assert.equal(sha(bytes), evidenceSha256)
  sourceSha256[evidence] = evidenceSha256
  const receipt = JSON.parse(bytes)
  assert.equal(receipt.name, '@michengai/dsh-archive-manager')
  assert.equal(receipt.version, '1.1.7')
  assert.deepEqual(receipt.packageInstallLifecycleScripts, [])
  const stage = await realpath(receipt.stage)
  assert.match(relative(await realpath('.build'), stage).replaceAll('\\', '/'), /^workspace-archive-manager-[a-zA-Z0-9]+\/package$/)
  const entries = await readdir(stage, { recursive: true, withFileTypes: true })
  assert.ok(entries.every(entry => entry.isFile() || entry.isDirectory()))
  const paths = entries.filter(entry => entry.isFile()).map(entry => relative(stage, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  assert.deepEqual(paths.sort(), receipt.files.map(file => file.path).sort())
  for (const file of receipt.files) {
    const input = join(stage, file.path)
    assert.equal(sha(await readFile(input)), file.sha256)
    sourceSha256[input] = file.sha256
  }
  const archive = join(world, 'dsh-archive-manager-1.1.7.tgz')
  await promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', archive, '-C', dirname(stage), 'package'], { windowsHide: true, timeout: 30000 })
  return { name: receipt.name, version: receipt.version, evidence, lockIntegrity: receipt.lockIntegrity,
    inventory: receipt.files, archive, sha256: sha(await readFile(archive)), exactDependencies: [] }
}
const thirdParty = installedArchiveManager ? await stageInstalledArchiveManager() : published !== undefined ? await stagePublishedPackage(published) : thirdPartyRequested ? await stageThirdParty() : undefined
async function packArchiveBoundaryPackage({ name, variant, changed, count, directory, filename }) {
  const source = await realpath(variant.stage), stage = join(directory, 'package')
  assert.match(relative(await realpath('.build'), source).replaceAll('\\', '/'), /^workspace-installed-[\w-]+\/probe-[\w-]+\/(archive-workspace-controller|compact-settings-package)$/)
  assert.equal(variant.inventory.length, count)
  assert.deepEqual(variant.inventory.filter(file => file.sha256 !== file.sourceSha256).map(file => file.path), [changed])
  for (const file of variant.inventory) {
    assert.match(file.path, /^(?:(?:lib|locale)\/)?[\w./-]+$/)
    assert.ok(!file.path.split('/').includes('..'))
    const path = join(source, file.path), data = await readFile(path)
    assert.equal(sha(data), file.sha256, file.path)
    const target = join(stage, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data, { flag: 'wx' })
    sourceSha256[path] = file.sha256
  }
  const manifest = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'))
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, copied.release.version)
  assert.equal(manifest.dsh.bundle, undefined)
  const archive = join(directory, filename)
  await promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', archive, '-C', directory, 'package'], { windowsHide: true, timeout: 30000 })
  return { name, archive, sha256: sha(await readFile(archive)), inventory: variant.inventory }
}
async function stageArchiveBoundaryCandidates() {
  const proofPath = 'evidence/workspace-archive-manager-installed-boundary-validation-20261107.json'
  const proofBytes = await readFile(proofPath), proof = JSON.parse(proofBytes)
  assert.equal(proof.passed, true)
  sourceSha256[proofPath] = sha(proofBytes)
  const hostBytes = await readFile(proof.packagedScope.path)
  assert.equal(sha(hostBytes), proof.packagedScope.sha256)
  const encrypted = JSON.parse(hostBytes)
  assert.ok(encrypted.passed && encrypted.copiedRuntime === copied.runtime && !encrypted.dailyProfileUsed)
  assert.equal(encrypted.observed.details.packagedWorkspaceAccess, true)
  const nativePath = 'evidence/workspace-native-archive-manager-compact-validation-20261107.json'
  const nativeBytes = await readFile(nativePath), native = JSON.parse(nativeBytes)
  assert.ok(native.passed && native.checks.compactArchiveTitle && native.checks.archiveRestoredInWeb && !native.dailyProfileUsed)
  sourceSha256[nativePath] = sha(nativeBytes)
  const installedBytes = await readFile(native.host.path)
  assert.equal(sha(installedBytes), native.host.sha256)
  sourceSha256[native.host.path] = native.host.sha256
  const host = JSON.parse(installedBytes)
  assert.ok(host.passed && host.copiedRuntime === copied.runtime && host.observed.native.archiveRestoreHostConfirmed)
  const { entry, bytes } = await completeArchive('evidence/workspace-desktop-archive-manager-boundary-candidate.json')
  assert.equal(entry.sha256, encrypted.packagedRelay.archiveSha256)
  assert.equal(entry.sha256, native.harmonyArchiveSha256)
  assert.deepEqual(host.archiveScopePackage.inventory, encrypted.archiveScopePackage.inventory)
  assert.equal(host.archiveScopePackage.inventory.find(file => file.path === 'lib/index.js').sha256, native.workspaceControllerHostSha256)
  assert.equal(host.compactSettingsPackage.inventory.find(file => file.path === 'lib/client.js').sha256, native.compactSettingsClientSha256)
  if (desktopArchiveInput !== undefined) {
    const priorBytes = await readFile(desktopArchiveInput), prior = JSON.parse(priorBytes)
    sourceSha256[desktopArchiveInput] = sha(priorBytes)
    assert.ok(prior.passed && !prior.userProfileUsed && prior.copiedRuntime === copied.runtime)
    assert.equal(prior.profile ?? 'web', 'web')
    const update = prior.archiveBoundaryUpdate
    assert.ok(update.rollbackFrozenOffline && update.restoreFrozenOffline && update.compactSettings.plainDependency)
    const variants = [[entry.name, entry.sha256, entry.inventory],
      ['@deepseek-ai/dsh-api-workspace-controller', update.workspaceCandidateArchiveSha256, host.archiveScopePackage.inventory],
      ['@deepseek-ai/dsh-client-ui-settings-general', update.compactSettings.archiveSha256, host.compactSettingsPackage.inventory]]
    const [harmony, workspace, settings] = await Promise.all(variants.map(async ([name, expected, inventory]) => {
      const archive = prior.archives.find(item => item.name === name)
      assert.equal(archive.sha256, expected)
      assert.deepEqual(archive.inventory, inventory)
      const path = await realpath(archive.archive)
      assert.match(relative(await realpath('.build'), path).replaceAll('\\', '/'), /^workspace-package-install-[\w-]+\/archive-boundary\/(?:settings\/)?[\w-]+\.tgz$/)
      assert.equal(sha(await readFile(path)), expected)
      sourceSha256[path] = expected
      return archive
    }))
    return { harmony, workspace, settings }
  }
  const directory = join(world, 'archive-boundary'), harmonyArchive = join(directory, 'harmony-mobile.tgz')
  const workspace = await packArchiveBoundaryPackage({ name: '@deepseek-ai/dsh-api-workspace-controller', variant: host.archiveScopePackage,
    changed: 'lib/index.js', count: 21, directory, filename: 'workspace-controller.tgz' })
  const settings = await packArchiveBoundaryPackage({ name: '@deepseek-ai/dsh-client-ui-settings-general', variant: host.compactSettingsPackage,
    changed: 'lib/client.js', count: 9, directory: join(directory, 'settings'), filename: 'ui-settings-general.tgz' })
  await writeFile(harmonyArchive, bytes, { flag: 'wx' })
  return { harmony: { name: entry.name, archive: harmonyArchive, sha256: entry.sha256, inventory: entry.inventory }, workspace, settings }
}
const archiveBoundaryCandidates = upgradeArchiveBoundary ? await stageArchiveBoundaryCandidates() : undefined
let previousHarmony
const fieldPreflight = upgradeGrant ? JSON.parse(await readFile('evidence/workspace-field-rc249-preflight.json', 'utf8')) : undefined
if (recoveryBaseline !== undefined) {
  const { entry, bytes } = recoveryBaseline
  const archive = join(world, 'previous', 'harmony-mobile.tgz')
  await mkdir(dirname(archive)); await writeFile(archive, bytes, { flag: 'wx' })
  previousHarmony = { archive, sha256: entry.sha256, inventory: entry.inventory }
} else if (fieldPreflight !== undefined) {
  assert.equal(fieldPreflight.passed, true)
  const baseline = manifest.artifacts.find(entry => entry.file.startsWith('harmony-mobile-') && entry.file.endsWith('.tgz')); assert.ok(baseline)
  const { entry, bytes } = await completeArchive('evidence/workspace-desktop-command-complete-validation.json', baseline)
  assert.equal(entry.sha256, fieldPreflight.existingField.desktopArchive.sha256)
  const archive = join(world, 'previous', basename(entry.archive))
  await mkdir(dirname(archive)); await writeFile(archive, bytes, { flag: 'wx' })
  previousHarmony = { archive, sha256: entry.sha256, inventory: entry.inventory }
} else if (upgradeDesktop) {
  const handoff = 'handoff/deploy-rc235-20261104'
  const plan = JSON.parse(await readFile(join(handoff, 'desktop-fix3-plan.json'), 'utf8'))
  const receipt = JSON.parse(await readFile(join(handoff, 'desktop-fix3-installed.json'), 'utf8'))
  const bytes = await readFile(join(handoff, 'harmony-mobile-rc235-fix3.tgz'))
  assert.equal(receipt.installed, true); assert.equal(sha(bytes), receipt.archiveSha256); assert.equal(receipt.archiveSha256, plan.candidateSha256)
  const inventory = Object.entries(plan.inventory).map(([path, sha256]) => ({ path, sha256 }))
  assert.equal(inventory.length, receipt.filesVerified)
  const archive = join(world, 'harmony-mobile-fix3.tgz'); await writeFile(archive, bytes, { flag: 'wx' })
  previousHarmony = { archive, sha256: receipt.archiveSha256, inventory }
}
const mirror = useMirror ? await createWorkspaceDependencyMirror(copied.runtime, world, { storeVersions: thirdParty?.exactDependencies }) : undefined
try {
const registry = mirror?.endpoint ?? 'http://127.0.0.1:9/'
await writeFile(npmConfig, 'registry=' + registry + '\noffline=' + !useMirror + '\nignore-scripts=true\nfetch-retries=0\n'); await writeFile(globalConfig, '')
const harmony = await sealedArchive('harmony-mobile')
const archive = recoveryBaseline !== undefined ? join(world, 'candidate', 'harmony-mobile.tgz')
  : fieldPreflight === undefined ? join(world, 'harmony-mobile.tgz') : join(world, 'candidate', basename(harmony.entry.archive))
if (fieldPreflight !== undefined) {
  assert.equal(harmony.entry.sha256, fieldPreflight.diagnosticCandidate.desktopArchive.sha256)
  assert.equal(basename(archive), basename(previousHarmony.archive))
}
if (fieldPreflight !== undefined || recoveryBaseline !== undefined) await mkdir(dirname(archive))
await writeFile(archive, harmony.bytes)
const archives = [{ name: harmony.entry.name, archive, sha256: harmony.entry.sha256, inventory: harmony.entry.inventory }]
if (all) {
  for (const id of ['rich-inline', 'devflow']) {
    const { entry, bytes } = await sealedArchive(id), archive = join(world, id + '.tgz'); await writeFile(archive, bytes)
    archives.push({ name: entry.name, archive, sha256: entry.sha256, inventory: entry.inventory })
  }
  if (thirdParty) archives.push({ name: thirdParty.name, archive: thirdParty.archive, sha256: thirdParty.sha256, inventory: thirdParty.inventory })
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { ELECTRON_RUN_AS_NODE: '1', DSH_HOME: testHome, DSH_AGENTS_HOME: join(world, 'agents'), DSH_TELEMETRY_DISABLED: '1',
  DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', COREPACK_ENABLE_NETWORK: '0', npm_config_offline: String(!useMirror), npm_config_ignore_scripts: 'true',
  npm_config_userconfig: npmConfig, npm_config_globalconfig: globalConfig, npm_config_cache: join(world, 'npm-cache'),
  npm_config_registry: registry, PNPM_HOME: join(world, 'pnpm-home'), USERPROFILE: testHome, TEMP: world, TMP: world })
const exe = desktopPnpm ? join(homedir(), 'AppData/Roaming/npm/node_modules/pnpm/pnpm.exe') : 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const prefix = desktopPnpm ? ['add'] : ['--expose-internals', join(copied.runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'plugin', '--profile', profileName, 'add']
const packageArgs = [...useMirror ? [] : ['--offline'], '--ignore-scripts', '--registry=' + registry, '--store-dir=' + join(world, 'pnpm-store')]
const args = [...prefix, previousHarmony?.archive ?? archive, ...archives.slice(1).map(entry => entry.archive), ...packageArgs]
const require = createRequire(resolve('../../packages/boot/plugin-manager/package.json'))
const { execa } = await import(pathToFileURL(require.resolve('execa')).href)
async function runAdd(argv, prefix = '') {
  const child = execa(exe, argv, { cwd: desktopPnpm ? profile : world, env, extendEnv: false, reject: false, stdin: 'ignore', windowsHide: true, timeout: 60000, killDescendants: true })
  await writeFile(join(world, prefix + 'process.json'), JSON.stringify({ pid: child.pid, exe, args: argv, world }, null, 2) + '\n', { flag: 'wx' })
  const result = await child
  await writeFile(join(world, prefix + 'stdout.log'), result.stdout); await writeFile(join(world, prefix + 'stderr.log'), result.stderr)
  return result
}
const witnesses = {
  'pnpm-workspace.yaml': 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n',
  'cordis.patch.yml': '- id: harmony-mobile-device\n  disabled: true\n  config:\n    workspace:\n      wire:\n        maxChunkBytes: 524288\n',
  'state/isolated-pairing.json': '{"pairing":"synthetic-check-only"}\n',
  'sessions/isolated-session.jsonl': '{"type":"session","sessionId":"upgrade-synthetic-session"}\n',
}
if (desktopPnpm) {
  const manager = await execa(exe, ['--version'], { cwd: profile, env, extendEnv: false, windowsHide: true, timeout: 5000 })
  assert.equal(manager.stdout, '12.6.0', 'Use the package manager recorded for the previous desktop update')
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'private-harmony-upgrade', private: true, dsh: { profile: { bundles: [] } } }, null, 2) + '\n', { flag: 'wx' })
  const initial = desktopArchiveInput === undefined ? witnesses : { 'pnpm-workspace.yaml': witnesses['pnpm-workspace.yaml'], 'cordis.patch.yml': witnesses['cordis.patch.yml'] }
  for (const [path, bytes] of Object.entries(initial)) {
    const file = join(profile, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx' })
  }
}
let result = await runAdd(args)
async function changedInstalledFiles(name, inventory) {
  const installed = await realpath(join(profile, 'node_modules', ...name.split('/'))), changed = []
  if (upgradeDesktop || upgradeArchiveBoundary || name === published?.name || installedArchiveManager && name === thirdParty?.name) {
    const local = relative(profile, installed)
    assert.ok(local && !local.startsWith('..') && !isAbsolute(local), 'The installed package must stay inside the private profile')
    const actual = (await readdir(installed, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile()).map(entry => relative(installed, join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort()
    assert.deepEqual(actual, inventory.map(file => file.path).sort(), name)
  }
  for (const file of inventory) {
    let actual
    try { actual = sha(await readFile(join(installed, file.path))) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (actual !== file.sha256) changed.push(file.path)
  }
  return changed
}
let desktopUpgrade
if (previousHarmony && result.exitCode === 0) {
  const name = harmony.entry.name, oldInventory = previousHarmony.inventory, newInventory = harmony.entry.inventory
  const entry = inventory => inventory.find(file => file.path === 'lib/device.js').sha256
  const manifestSha = inventory => inventory.find(file => file.path === 'package.json').sha256
  assert.equal(manifestSha(oldInventory), manifestSha(newInventory)); assert.notEqual(entry(oldInventory), entry(newInventory))
  const verify = async harmonyArchive => {
    for (const item of [{ ...harmonyArchive, name }, ...archives.slice(1)]) assert.deepEqual(await changedInstalledFiles(item.name, item.inventory), [], item.name)
    for (const [path, bytes] of Object.entries(witnesses)) assert.equal(await readFile(join(profile, path), 'utf8'), bytes, path)
  }
  await verify(previousHarmony)
  const profileManifest = join(profile, 'package.json'), lock = join(profile, 'pnpm-lock.yaml')
  const first = JSON.parse(await readFile(profileManifest, 'utf8')), lockBefore = sha(await readFile(lock))
  const mirrorRequestsBefore = mirror.requests.length
  const stages = []
  for (const [label, item] of [['upgrade', archives[0]], ['rollback', previousHarmony], ['restore', archives[0]]]) {
    result = await runAdd([...prefix, item.archive, ...packageArgs, '--offline'], label + '-')
    assert.equal(result.exitCode, 0, label + '\n' + result.stderr + result.stdout)
    assert.equal(result.timedOut, false); assert.equal(result.signal, undefined)
    await verify(item)
    const current = JSON.parse(await readFile(profileManifest, 'utf8'))
    assert.match(current.dependencies[name], /^file:/)
    assert.equal(resolve(profile, current.dependencies[name].slice(5)), item.archive)
    assert.deepEqual({ ...current, dependencies: { ...current.dependencies, [name]: first.dependencies[name] } }, first)
    stages.push({ label, archiveSha256: item.sha256, deviceEntrySha256: entry(item.inventory), lockSha256: sha(await readFile(lock)) })
  }
  assert.notEqual(stages[0].lockSha256, lockBefore)
  assert.equal(stages[1].lockSha256, lockBefore)
  assert.equal(stages[2].lockSha256, stages[0].lockSha256)
  let frozenReinstall
  if (upgradeRecovery) {
    const modules = join(profile, 'node_modules')
    assert.equal(await realpath(modules), join(await realpath(profile), 'node_modules'))
    await rename(modules, join(profile, 'before-frozen-node_modules'))
    const frozen = await runAdd(['install', ...packageArgs, '--offline', '--frozen-lockfile'], 'frozen-reinstall-')
    assert.equal(frozen.exitCode, 0, frozen.stderr + frozen.stdout)
    assert.equal(frozen.timedOut, false); assert.equal(frozen.signal, undefined)
    await verify(archives[0])
    const lockSha256 = sha(await readFile(lock))
    assert.equal(lockSha256, stages[0].lockSha256)
    frozenReinstall = { offline: true, rebuiltNodeModules: true, lockSha256 }
  }
  assert.equal(mirror.requests.length, mirrorRequestsBefore)
  desktopUpgrade = { packageManager: 'pnpm 12.6.0', stagesOffline: true, samePackageManifest: true, originalArchiveSha256: previousHarmony.sha256,
    originalDeviceEntrySha256: entry(oldInventory), stages, frozenReinstall, witnessesVerified: Object.keys(witnesses) }
}
let archiveBoundaryUpdate
if (archiveBoundaryCandidates !== undefined && result.exitCode === 0) {
  const baseline = [...archives], { harmony, workspace, settings } = archiveBoundaryCandidates
  const updated = [harmony, workspace, settings], fixed = [harmony, ...archives.slice(1), workspace, settings]
  const metadata = ['package.json', 'pnpm-lock.yaml']
  const readMetadata = () => Promise.all(metadata.map(path => readFile(join(profile, path))))
  const before = await readMetadata()
  const readOptional = path => readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const pinnedEntries = [workspace, settings].map(item => {
    const changed = item.inventory.find(file => file.sha256 !== file.sourceSha256)
    return { ...changed, installed: join(profile, 'node_modules', item.name, changed.path) }
  })
  const originalEntries = await Promise.all(pinnedEntries.map(pin => readOptional(pin.installed)))
  for (const [index, original] of originalEntries.entries()) if (original !== null) assert.equal(sha(original), pinnedEntries[index].sourceSha256)
  const configPaths = ['cordis.patch.yml', 'pnpm-workspace.yaml'].map(path => join(profile, path))
  const originalConfig = await Promise.all(configPaths.map(readOptional))
  const persisted = {
    'state/isolated-pairing.json': '{"pairing":"archive-boundary-synthetic-check"}\n',
    'sessions/isolated-session.jsonl': '{"type":"session","sessionId":"archive-boundary-synthetic-session"}\n',
  }
  for (const [path, contents] of Object.entries(persisted)) {
    const target = join(profile, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, contents, { flag: 'wx' })
  }
  const verifyFiles = async packages => {
    for (const item of packages) assert.deepEqual(await changedInstalledFiles(item.name, item.inventory), [], item.name)
    assert.deepEqual(await Promise.all(configPaths.map(readOptional)), originalConfig)
    for (const [path, contents] of Object.entries(persisted)) assert.equal(await readFile(join(profile, path), 'utf8'), contents, path)
  }
  await verifyFiles(baseline)
  const upgraded = await runAdd([...prefix, ...updated.map(item => item.archive), ...packageArgs], 'archive-boundary-upgrade-')
  assert.equal(upgraded.exitCode, 0, upgraded.stderr + upgraded.stdout)
  assert.equal(upgraded.timedOut, false)
  await verifyFiles(fixed)
  const after = await readMetadata(), originalManifest = JSON.parse(before[0]), updatedManifest = JSON.parse(after[0])
  for (const item of [workspace, settings]) assert.equal(originalManifest.dependencies[item.name], undefined)
  for (const item of updated) {
    const path = updatedManifest.dependencies[item.name]
    assert.match(path, /^file:/)
    assert.equal(resolve(profile, path.slice(5)), item.archive)
  }
  assert.deepEqual(updatedManifest, { ...originalManifest, dependencies: { ...originalManifest.dependencies,
    ...Object.fromEntries(updated.map(item => [item.name, updatedManifest.dependencies[item.name]])) } })
  assert.notEqual(sha(before[1]), sha(after[1]))
  for (const [label, contents] of [['baseline', before], ['candidate', after]]) {
    const directory = join(world, 'archive-boundary', label)
    await mkdir(directory, { recursive: true })
    for (const [index, path] of metadata.entries()) await writeFile(join(directory, path), contents[index], { flag: 'wx' })
  }
  const frozen = async (label, contents, packages) => {
    for (const [index, path] of metadata.entries()) await writeFile(join(profile, path), contents[index])
    const modules = join(profile, 'node_modules')
    assert.equal(await realpath(modules), join(await realpath(profile), 'node_modules'))
    await rename(modules, join(profile, label + '-node_modules'))
    const outcome = await runAdd([...prefix.slice(0, -1), 'install', ...packageArgs, '--offline', '--frozen-lockfile'], label + '-')
    assert.equal(outcome.exitCode, 0, outcome.stderr + outcome.stdout)
    assert.equal(outcome.timedOut, false)
    await verifyFiles(packages)
    assert.deepEqual(await readMetadata(), contents)
    return outcome
  }
  const mirrorRequests = mirror.requests.length
  await frozen('archive-boundary-rollback', before, baseline)
  assert.deepEqual(await Promise.all(pinnedEntries.map(pin => readOptional(pin.installed))), originalEntries)
  result = await frozen('archive-boundary-restore', after, fixed)
  assert.equal(mirror.requests.length, mirrorRequests)
  assert.deepEqual(mirror.errors, [])
  archives.splice(0, archives.length, ...fixed)
  archiveBoundaryUpdate = { baselineHarmonySha256: baseline[0].sha256, candidateHarmonySha256: harmony.sha256,
    workspaceBaselineEntrySha256: pinnedEntries[0].sourceSha256, workspaceCandidateEntrySha256: pinnedEntries[0].sha256,
    compactSettings: { baselineEntrySha256: pinnedEntries[1].sourceSha256, candidateEntrySha256: pinnedEntries[1].sha256,
      archiveSha256: settings.sha256, plainDependency: true },
    workspaceCandidateArchiveSha256: workspace.sha256, baselineLockSha256: sha(before[1]), candidateLockSha256: sha(after[1]),
    workspacePlainDependency: true, rollbackFrozenOffline: true, restoreFrozenOffline: true, unchangedPackages: baseline.slice(1).map(item => item.name),
    witnessesVerified: Object.keys(persisted), profilePatchPreserved: true }
}
for (const [path, expected] of Object.entries(sourceSha256)) assert.equal(sha(await readFile(path)), expected, path)
const changedThirdPartyFiles = thirdParty && result.exitCode === 0 ? await changedInstalledFiles(thirdParty.name, thirdParty.inventory) : []
let completeDesktopInstalled
if (completeDesktop && result.exitCode === 0) {
  completeDesktopInstalled = []
  for (const archive of archives) {
    const changed = await changedInstalledFiles(archive.name, archive.inventory)
    completeDesktopInstalled.push({ name: archive.name, archiveSha256: archive.sha256, files: archive.inventory.length, changed })
  }
}
const report = { at: new Date().toISOString(), world, exe, args, code: result.exitCode, signal: result.signal, timedOut: result.timedOut,
  passed: result.exitCode === 0 && !result.timedOut && changedThirdPartyFiles.length === 0 && (completeDesktopInstalled?.every(item => item.changed.length === 0) ?? true) && (!upgradeDesktop || desktopUpgrade !== undefined) && (!upgradeArchiveBoundary || archiveBoundaryUpdate !== undefined), archiveSha256: archives[0].sha256, reviewBundle: review.destination, archives, copiedRuntime: copied.runtime, sourceSha256, completeDesktopInstalled, desktopUpgrade, archiveBoundaryUpdate,
  thirdParty: thirdParty ? { name: thirdParty.name, version: thirdParty.version,
    ...(installedArchiveManager ? { installedCopyEvidence: thirdParty.evidence, lockIntegrity: thirdParty.lockIntegrity, originalRegistryArchive: false }
      : published !== undefined ? { registryIntegrity: thirdParty.registryIntegrity, originalRegistryArchive: true }
      : { dailyProfileSource: thirdParty.source, dailyProfileAccess: 'read-only copy of package files and lock integrity', lockIntegrity: thirdParty.lockIntegrity }),
    exactDependencyPins: thirdParty.exactDependencies, files: thirdParty.inventory.length, archiveSha256: thirdParty.sha256, installedFilesChanged: changedThirdPartyFiles } : undefined,
  privateHome: testHome, profile: profileName, desktopArchiveInput, privateNpmConfig: npmConfig, globalNpmConfig: globalConfig, registry, offline: !useMirror, scriptsDisabled: true,
  mirror: mirror ? { packages: mirror.packages, requests: mirror.requests, errors: mirror.errors, rejectedUnknownPackage: mirror.rejectedUnknownPackage } : undefined,
  appStarted: false, userProfileUsed: false, realModels: 0, stdout: result.stdout, stderr: result.stderr }
const evidence = 'evidence/workspace-plugin-install-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); await writeFile(join(world, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ evidence, world, code: report.code, passed: report.passed, timedOut: report.timedOut, stderr: report.stderr.slice(0, 2000) }))
process.exitCode = report.passed ? 0 : 1
} finally { await mirror?.close() }

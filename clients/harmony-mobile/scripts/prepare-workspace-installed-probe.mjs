/** Prepare and launch one copied-installed dsh profile with local-only dependencies and a finite replay probe. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, readFile, writeFile, readdir, mkdir, symlink, realpath, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname, basename, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { createOfficialTranslationReplay, officialPackageInventory } from '../integration/workspace-official-replay.mjs'
import { installedWebSocket } from './projection-source.mjs'
import { prepareProjectionInputs } from './projection-inputs.mjs'

const copied = JSON.parse(await readFile('evidence/workspace-installed-runtime.json', 'utf8'))
const scenario = process.argv[2]?.replace('--combined=', '') ?? 'metadata'
const completeDesktopCommand = scenario === 'device-command-complete'
const nativeGrantDeadline = ['native-cipher-creation-workspace', 'native-cipher-devflow', 'native-cipher-official'].includes(scenario) && process.argv.length === 6
const grantDeadlineArg = nativeGrantDeadline ? process.argv[5]
  : (completeDesktopCommand || scenario === 'workspace-trace') && process.argv.length === 4 ? process.argv[3] : undefined
const grantDeadline = grantDeadlineArg?.match(/^--grant-deadline(-rich)?=(evidence\/workspace-rc258-grant-deadline-desktop-promotion-[\w-]+\.json):([a-f0-9]{64})$/) ?? null
const grantDeadlineRich = grantDeadline?.[1] === '-rich'
assert.ok(!grantDeadlineRich || scenario === 'workspace-trace')
const pageDiagnostic = scenario === 'workspace-trace' && process.argv.length === 4
  ? process.argv[3].match(/^--page-diagnostic-(?:chunks-)?(on|off)=(evidence\/workspace-page-diagnostic-installed-inputs-[\w-]+\.json):([a-f0-9]{64})$/) : null
const requirePageChunks = pageDiagnostic?.[0].startsWith('--page-diagnostic-chunks-') === true
const standaloneTls = process.argv.length === 4 && scenario === 'workspace-trace' ? process.argv[3].match(/^--close-cancellation-wss=(\.build\/packaged-wss-tls-[\w-]+)$/)?.[1] : undefined
const closeCancellation = standaloneTls !== undefined || process.argv.length === 4 && scenario === 'workspace-trace' && process.argv[3] === '--close-cancellation'
const workspaceTrace = scenario === 'workspace-trace' && (process.argv.length === 3 || closeCancellation || grantDeadline !== null || pageDiagnostic !== null)
const archiveScope = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_SCOPE
const nativeArchiveManager = process.env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_MANAGER === '1'
const nativeReleaseReview = process.env.DSH_HARMONY_WORKSPACE_NATIVE_RELEASE_REVIEW === '1'
const blankCreationWorkspace = process.env.DSH_HARMONY_WORKSPACE_NATIVE_BLANK_CREATION === '1'
const pinnedRead = process.env.DSH_HARMONY_WORKSPACE_PINNED_READ
const initialSelectionCandidate = process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_CANDIDATE
const initialSelectionRelease = process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_RELEASE
const devflowSessionTarget = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_SESSION_TARGET
const nativeArchivePackages = nativeArchiveManager || nativeReleaseReview
assert.ok(archiveScope === undefined || (workspaceTrace && closeCancellation || nativeArchivePackages) && ['baseline', 'candidate'].includes(archiveScope))
const archiveManagerMode = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER
assert.ok(archiveManagerMode === undefined || archiveManagerMode === '1' || archiveManagerMode === 'sealed')
const archiveManagerReview = archiveManagerMode !== undefined
const archiveManagerDesktop = archiveManagerMode === 'sealed'
assert.ok(!archiveManagerReview || archiveScope === 'candidate')
const focus = process.argv.length === 4 && process.argv[3] === '--keyboard-focus'
const keyboard = focus || process.argv.length === 4 && process.argv[3] === '--keyboard'
const rpcDiagnostics = process.argv.length === 4 && process.argv[3] === '--rpc-diagnostics'
const nativeWss = process.env.DSH_HARMONY_WORKSPACE_NATIVE_WSS === '1'
const nativeStandalone = process.env.DSH_HARMONY_WORKSPACE_NATIVE_STANDALONE_WSS === '1'
const devflowConflictReview = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_CONFLICT === '1'
const brickInstall = process.env.DSH_HARMONY_WORKSPACE_BRICK_INSTALL
const pluginBootFault = process.env.DSH_HARMONY_WORKSPACE_PLUGIN_BOOT_FAULT === '1'
const revocationReview = process.env.DSH_HARMONY_WORKSPACE_REVOKED_REVIEW === '1'
const workspaceWss = nativeWss && ['native-cipher-rich', 'native-cipher-official', 'native-cipher-devflow'].includes(scenario)
const explicitCandidate = (process.argv.length === 4 || process.argv.length === 5 || nativeGrantDeadline) && (workspaceWss || ['native-cipher-creation', 'native-cipher-creation-workspace'].includes(scenario)) ? process.argv[3].match(/^--candidate=(rc2-\d+)$/)?.[1] : undefined
const creationCandidate = workspaceWss ? undefined : explicitCandidate
const explicitDesktopReceipt = (process.argv.length === 5 || nativeGrantDeadline) && explicitCandidate !== undefined && (workspaceWss || scenario === 'native-cipher-creation-workspace')
  ? process.argv[4].match(/^--desktop-receipt=(evidence\/workspace-desktop-[\w-]+\.json)$/)?.[1] : undefined
const scopeBatching = explicitDesktopReceipt === 'evidence/workspace-desktop-scope-batching-candidate.json'
assert.ok(explicitCandidate === undefined || process.argv.length === 4 || explicitDesktopReceipt !== undefined)
const exactCandidate = explicitCandidate ?? (process.argv.length === 5 && process.argv[3] === '--boot-review' ? process.argv[4].match(/^--candidate=(rc2-\d+)$/)?.[1] : undefined)
const packagedDesktop = workspaceTrace || exactCandidate !== undefined && scenario !== 'native-cipher-creation' || process.argv.length === 5 && process.argv[3] === '--boot-review' && process.argv[4] === '--packaged-desktop'
const bootReview = packagedDesktop && !workspaceTrace && explicitCandidate === undefined || process.argv.length === 4 && process.argv[3] === '--boot-review'
const fieldAdmission = process.argv.length === 4 && process.argv[3] === '--admission-disk-field'
const standaloneLatency = nativeStandalone && scenario === 'native-cipher-rich'
const latencyAdmission = standaloneLatency || fieldAdmission || process.argv.length === 4 && process.argv[3] === '--admission-disk-latency'
const diskAdmission = latencyAdmission || process.argv.length === 4 && process.argv[3] === '--admission-disk'
const admission = diskAdmission || process.argv.length === 4 && process.argv[3] === '--admission'
assert.ok((process.argv.length <= 3 || closeCancellation || keyboard || admission || rpcDiagnostics || bootReview || explicitCandidate !== undefined || grantDeadline !== null || pageDiagnostic !== null) && ['metadata', 'composition', 'devflow', 'rich', 'workspace-trace', 'native-devflow', 'native-rich', 'native-plugin-target', 'native-cipher-plugin-target', 'native-cipher-rich', 'native-cipher-devflow', 'native-cipher-official', 'native-cipher-creation', 'native-cipher-creation-work', 'native-cipher-creation-workspace', 'device-command', 'device-command-previous', 'device-command-complete'].includes(scenario))
const deviceCommand = completeDesktopCommand || scenario === 'device-command' || scenario === 'device-command-previous'
const official = scenario === 'native-cipher-official'
const creation = scenario.startsWith('native-cipher-creation')
const panelCipher = scenario === 'native-cipher-plugin-target'
const panelTarget = panelCipher || scenario === 'native-plugin-target'
const native = scenario.startsWith('native-')
const cipher = scenario.startsWith('native-cipher-')
assert.ok(!nativeWss || (workspaceWss || scenario === 'native-cipher-creation-workspace') && explicitCandidate !== undefined && explicitDesktopReceipt !== undefined)
assert.ok(!nativeStandalone || nativeWss && (standaloneLatency || ['native-cipher-creation-workspace', 'native-cipher-official', 'native-cipher-devflow'].includes(scenario))
  && (explicitDesktopReceipt === 'evidence/workspace-desktop-close-cancellation-candidate.json' || standaloneLatency && scopeBatching || nativeArchivePackages))
assert.ok(!nativeArchivePackages || nativeStandalone && archiveManagerDesktop
  && explicitDesktopReceipt === 'evidence/workspace-desktop-archive-manager-boundary-candidate.json')
assert.ok(!nativeArchiveManager || !nativeReleaseReview && scenario === 'native-cipher-devflow')
assert.ok(!nativeReleaseReview || standaloneLatency || ['native-cipher-creation-workspace', 'native-cipher-devflow', 'native-cipher-official'].includes(scenario))
assert.ok(!blankCreationWorkspace || nativeReleaseReview && scenario === 'native-cipher-creation-workspace' && !pluginBootFault && !revocationReview)
if (pinnedRead !== undefined) assert.ok(nativeReleaseReview && scenario === 'native-cipher-creation-workspace' && !blankCreationWorkspace && !pluginBootFault && !revocationReview)
assert.ok(initialSelectionCandidate === undefined || pinnedRead !== undefined)
const initialSelectionPluginReview = nativeReleaseReview && (scenario === 'native-cipher-devflow' || scenario === 'native-cipher-official')
let creationDispatchReview = false
if (initialSelectionRelease !== undefined && nativeReleaseReview && scenario === 'native-cipher-creation-workspace' && creationCandidate !== undefined
  && !blankCreationWorkspace && pinnedRead === undefined && !pluginBootFault && !revocationReview) {
  const receipt = JSON.parse(await readFile('evidence/creation-cipher-' + creationCandidate + '-native-review-project.json', 'utf8'))
  creationDispatchReview = receipt.creationDispatchHostChunkBytes === 1048576 && receipt.reconnectReview === true && !receipt.creationAckLoss
}
assert.ok(!nativeGrantDeadline || grantDeadline !== null && nativeStandalone
  && (blankCreationWorkspace || initialSelectionPluginReview || creationDispatchReview || nativeArchiveManager && archiveManagerReview)
  && initialSelectionRelease !== undefined && devflowSessionTarget !== undefined && explicitDesktopReceipt !== undefined)
const pairedReleaseReview = blankCreationWorkspace || pinnedRead !== undefined || initialSelectionPluginReview || nativeArchiveManager || creationDispatchReview
assert.ok(initialSelectionRelease === undefined || pairedReleaseReview && initialSelectionCandidate === undefined)
assert.ok(devflowSessionTarget === undefined || pairedReleaseReview && initialSelectionRelease !== undefined)
assert.ok(!scopeBatching || standaloneLatency)
assert.ok(!devflowConflictReview || nativeStandalone && scenario === 'native-cipher-devflow')
assert.ok(!pluginBootFault || nativeStandalone && scenario === 'native-cipher-creation-workspace')
assert.ok(!revocationReview || nativeStandalone && scenario === 'native-cipher-creation-workspace' && !pluginBootFault)
if (brickInstall !== undefined) {
  assert.match(brickInstall, /^evidence\/workspace-plugin-install-\d+\.json$/)
  assert.ok(nativeStandalone && scenario === 'native-cipher-devflow' && !devflowConflictReview)
}
assert.ok(!admission || cipher && !creation && !panelTarget)
assert.ok(!diskAdmission || scenario === 'native-cipher-rich')
assert.ok(!rpcDiagnostics || scenario === 'native-cipher-rich')
assert.ok(!bootReview || ['native-cipher-rich', 'native-cipher-devflow', 'native-cipher-official'].includes(scenario))
assert.ok(!packagedDesktop || workspaceTrace || official || explicitCandidate !== undefined || exactCandidate !== undefined && scenario === 'native-cipher-devflow')
assert.ok(!keyboard || native)
const nativeProject = creationCandidate !== undefined ? 'evidence/creation-cipher-' + creationCandidate + '-native-review-project.json' : exactCandidate !== undefined ? 'evidence/workspace-cipher-diagnostic-' + exactCandidate + '-native-review-project.json' : rpcDiagnostics || bootReview ? 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json' : panelCipher ? 'evidence/workspace-plugin-cipher-native-review-project.json' : panelTarget ? 'evidence/workspace-plugin-host-native-review-project.json' : creation ? 'evidence/creation-cipher-native-review-project.json' : cipher && keyboard ? 'evidence/workspace-cipher-keyboard-native-review-project.json' : cipher ? 'evidence/workspace-cipher-native-review-project.json' : focus ? 'evidence/workspace-focus-native-review-project.json' : keyboard ? 'evidence/workspace-keyboard-native-review-project.json' : 'evidence/workspace-native-review-project.json'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), yaml = require('js-yaml')
const digestRequire = createRequire(join(root, 'packages/experimental/webworker-runtime/package.json'))
const probeWorld = await mkdtemp(join(copied.world, panelTarget ? 'workspace-plugin-target-' : 'probe-'))
const sourceSha256 = {}
if (scenario === 'composition') for (const file of ['integration/workspace-installed-combination.ts', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (deviceCommand) for (const file of ['integration/workspace-installed-device-command.ts', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (native) for (const file of ['integration/workspace-installed-combination.ts', 'integration/workspace-emulator-fixture.ts', 'integration/workspace-live.ts', 'desktop-plugin/src/workspace-channel.ts', 'desktop-plugin/src/workspace-wire.ts', 'desktop-plugin/src/workspace-shell.ts', 'src/workspace-client.ts', 'src/workspace-prepare.ts']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (panelTarget) for (const file of ['scripts/prepare-workspace-installed-probe.mjs', 'scripts/accept-workspace-plugin-target.py']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (panelCipher) for (const file of ['scripts/prepare-creation-native-review.mjs', 'integration/native/CreationCipherProduct.ets', 'integration/native/WorkspaceCipherProduct.ets', 'src/workspace-document.ts']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (cipher) for (const file of ['integration/workspace-cipher-fixture.ts', 'integration/workspace-memory-relay.ts', 'desktop-plugin/src/device-binding-relay.ts', 'desktop-plugin/src/workspace-access.ts', 'src/e2e-channel.ts']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (nativeWss) for (const file of ['integration/relay-upgrade.ts', 'standalone-relay/src/control-upgrade.ts', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (diskAdmission) for (const file of ['integration/seed-workspace-admission-sessions.mts', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (rpcDiagnostics || bootReview) for (const file of ['src/workspace-diagnostic.ts', 'src/native-device-product.ts', 'src/workspace-document.ts', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (official) for (const file of ['integration/workspace-rich-replay.ts', 'integration/workspace-official-replay.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (packagedDesktop || completeDesktopCommand) for (const file of ['desktop-plugin/src/device-binding-command.ts', 'scripts/seal-workspace-desktop-candidate.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (creation) for (const file of ['integration/session-creation-cipher-fixture.ts', 'desktop-plugin/src/device-binding-profile.ts', 'src/native-device-product.ts', 'src/native-device-bridge.ts', 'src/session-creation.ts']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (workspaceTrace) for (const file of ['integration/workspace-installed-combination.ts', 'integration/workspace-cipher-fixture.ts', 'integration/workspace-memory-relay.ts', 'src/device-product-rpc.ts', 'src/native-device-bridge.ts', 'product.config.json', 'scripts/prepare-workspace-installed-probe.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (grantDeadlineRich || nativeGrantDeadline && official) for (const file of ['integration/workspace-rich-replay.ts', 'integration/workspace-outbound-guard.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (standaloneTls !== undefined || nativeStandalone) for (const file of ['integration/workspace-standalone-wss.ts', 'standalone-relay/config.enabled.example.json', '.build/workspace-relay-room-diagnostics-qNGJjI/server.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (brickInstall !== undefined) for (const file of [brickInstall, 'integration/workspace-outbound-guard.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (pluginBootFault || revocationReview) for (const file of ['integration/session-creation-cipher-fixture.ts', 'integration/workspace-outbound-guard.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (archiveManagerReview) for (const file of ['integration/workspace-outbound-guard.mjs', 'desktop-plugin/src/workspace-access.ts']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (blankCreationWorkspace) for (const file of ['integration/workspace-outbound-guard.mjs', 'scripts/accept-workspace-emulator.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
if (pinnedRead !== undefined) for (const file of ['integration/seed-workspace-pinned-read.mts', 'integration/workspace-outbound-guard.mjs', 'scripts/accept-workspace-emulator.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex')
const profileName = 'workspace-review'
const home = join(probeWorld, 'home'), profile = join(home, 'profiles', profileName), fixture = join(probeWorld, 'package')
let pinnedSessionId
if (pinnedRead !== undefined) {
  assert.match(pinnedRead, /^\.build\/workspace-pinned-read-[\w-]+\/snapshot\.json$/)
  const receiptPath = await realpath(pinnedRead), isolated = await realpath('.build')
  assert.match(relative(isolated, receiptPath), /^workspace-pinned-read-[\w-]+[/\\]snapshot\.json$/)
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  assert.match(receipt.sessionId, /^session-[a-f0-9-]{36}$/)
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/)
  const journal = await realpath(join(dirname(receiptPath), 'session.v4.jsonl.zstd'))
  assert.equal(dirname(journal), dirname(receiptPath))
  await promisify(execFile)(process.execPath, ['--import', 'tsx/esm', resolve('integration/seed-workspace-pinned-read.mts'), probeWorld, journal, receipt.sessionId, receipt.sha256],
    { cwd: root, windowsHide: true, timeout: 30000 })
  pinnedSessionId = receipt.sessionId
}
if (native) await writeFile(join(probeWorld, 'native-project.json'), JSON.stringify({ path: nativeProject, keyboard, focus }) + '\n', { flag: 'wx' })
await mkdir(fixture); await mkdir(join(profile, 'node_modules'), { recursive: true })
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: '@local/workspace-installed-probe', version: '0.0.0-test', type: 'module', main: 'index.mjs', dsh: { bundle: { patch: 'cordis.patch.yml' } } }) + '\n')
await writeFile(join(fixture, 'cordis.patch.yml'), '- insert:\n    - id: workspace-installed-probe\n      name: "@local/workspace-installed-probe"\n')
await esbuild.build({ entryPoints: [resolve(deviceCommand ? 'integration/workspace-installed-device-command.ts' : scenario === 'metadata' ? 'integration/workspace-installed-probe.ts' : 'integration/workspace-installed-combination.ts')], outfile: join(fixture, 'index.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24',
  external: ['@deepseek-ai/*'], plugins: [{ name: 'workspace-test-dependencies', setup(build) {
    build.onResolve({ filter: /^@deepseek-ai\/dsh-llm-replay$/ }, () => ({ path: join(root, 'packages/test-support/llm-replay/src/index.ts') }))
    build.onResolve({ filter: /^@deepseek-ai\/dsh-rich-inline\/message-projections$/ }, async () => {
      const project = resolve('.'), spec = JSON.parse(await readFile('projection-source.json', 'utf8'))
      const inputs = await prepareProjectionInputs(project, root, spec)
      return { path: join(inputs.directory, 'shared/message-projections.ts') }
    })
    build.onResolve({ filter: /^ws$/ }, () => ({ path: pathToFileURL(installedWebSocket(root).runtime).href, external: true }))
    build.onResolve({ filter: /^@noble\/hashes\/(?:sha2|utils)\.js$/ }, ({ path }) => ({ path: digestRequire.resolve(path) }))
  } }] })
const dependencyRoot = join(copied.runtime, 'node_modules')
const overrides = new Map(), packages = []
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const runTar = args => promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), args, { windowsHide: true, timeout: 30000 })
const verifyInventory = async (stage, inventory) => {
  for (const file of inventory) assert.equal(digest(await readFile(join(stage, file.path))), file.sha256, file.path)
}
const extractArchive = async (archive, destination, inventory) => {
  const listing = (await runTar(['-tzf', archive])).stdout.split(/\r?\n/).filter(Boolean)
  assert.ok(listing.every(path => path.startsWith('package/') && !path.split('/').includes('..') && !path.includes('\\')))
  assert.deepEqual(listing.filter(path => !path.endsWith('/')).sort(), inventory.map(file => 'package/' + file.path).sort())
  await mkdir(destination)
  await runTar(['-xzf', archive, '-C', destination])
  const stage = join(destination, 'package')
  await verifyInventory(stage, inventory)
  return stage
}
let initialSelectionStage, selectionHarmony, selectionClient
if (initialSelectionCandidate !== undefined) {
  const candidate = await realpath(initialSelectionCandidate), prefix = await realpath('.build') + sep
  assert.ok(candidate.startsWith(prefix))
  const proof = JSON.parse(await readFile(candidate, 'utf8')), source = await realpath(proof.stage)
  assert.ok(source.startsWith(prefix))
  assert.equal(proof.name, '@deepseek-ai/dsh-client-ui-workspace')
  const stage = join(probeWorld, 'ui-workspace-selection')
  await mkdir(stage)
  for (const file of ['package.json', 'lib', 'locale']) await cp(join(source, file), join(stage, file), { recursive: true, force: false, errorOnExist: true })
  for (const [file, sha256] of [['lib/client.js', proof.candidateClientSha256], ['lib/index.js', proof.hostSha256]]) {
    const path = join(stage, file)
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), sha256)
    sourceSha256[path] = sha256
  }
  overrides.set(proof.name, stage)
  initialSelectionStage = stage
}
if (initialSelectionRelease !== undefined) {
  assert.match(initialSelectionRelease, /^evidence\/workspace-desktop-initial-selection-release-[\w-]+\/candidate\.json$/)
  const receipt = await realpath(initialSelectionRelease)
  assert.match(relative(await realpath('evidence'), receipt).replaceAll('\\', '/'), /^workspace-desktop-initial-selection-release-[\w-]+\/candidate\.json$/)
  const bytes = await readFile(receipt), release = JSON.parse(bytes)
  sourceSha256[receipt] = digest(bytes)
  assert.equal(release.schema, 'harmony-workspace-initial-selection/1')
  assert.deepEqual(release.archives.map(entry => entry.name).sort(), ['@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-experimental-harmony-mobile'])
  for (const entry of release.archives) {
    const archive = await realpath(entry.archive)
    assert.equal(dirname(archive), dirname(receipt))
    assert.equal(digest(await readFile(archive)), entry.sha256)
    sourceSha256[archive] = entry.sha256
  }
  selectionClient = release.archives.find(entry => entry.name === '@deepseek-ai/dsh-client-ui-workspace')
  selectionHarmony = release.archives.find(entry => entry.name === '@deepseek-ai/dsh-experimental-harmony-mobile')
  const original = join(dependencyRoot, selectionClient.name, 'lib/client.js')
  assert.equal(digest(await readFile(original)), selectionClient.baselineClientSha256)
  initialSelectionStage = await extractArchive(selectionClient.archive, join(probeWorld, 'ui-workspace-selection'), selectionClient.inventory)
  overrides.set(selectionClient.name, initialSelectionStage)
}
let archiveScopePackage, compactSettingsPackage, releaseHarmony
if (archiveScope !== undefined) {
  const name = '@deepseek-ai/dsh-api-workspace-controller', hostEntry = 'lib/index.js'
  const original = await realpath(join(dependencyRoot, name))
  const receipt = JSON.parse(await readFile('evidence/workspace-archive-scope-filter-validation-20261107.json', 'utf8'))
  assert.equal(receipt.passed, true)
  const baselineReceipt = await readFile(receipt.baseline.path)
  assert.equal(digest(baselineReceipt), receipt.baseline.sha256)
  const baselineSha256 = JSON.parse(baselineReceipt).packageSha256['packages/api/workspace-controller/lib/index.js']
  assert.equal(digest(await readFile(join(original, hostEntry))), baselineSha256)
  const stage = archiveScope === 'candidate' ? join(probeWorld, 'archive-workspace-controller') : original
  if (archiveScope === 'candidate') {
    const candidate = receipt.candidateFiles.find(file => /^\.build\/archive-scope-[\da-f]+\/packages\/api\/workspace-controller\/lib\/index\.js$/.test(file.path))
    assert.ok(candidate)
    const bytes = await readFile(candidate.path)
    assert.equal(digest(bytes), candidate.sha256)
    await cp(original, stage, { recursive: true, errorOnExist: true, force: false })
    await writeFile(join(stage, hostEntry), bytes)
    overrides.set(name, stage)
  }
  const inventory = []
  for (const item of await readdir(original, { recursive: true, withFileTypes: true })) {
    if (item.isDirectory()) continue
    assert.ok(item.isFile())
    const path = relative(original, join(item.parentPath, item.name)).replaceAll('\\', '/')
    const sourceSha256 = digest(await readFile(join(original, path))), sha256 = digest(await readFile(join(stage, path)))
    assert.equal(sha256 !== sourceSha256, archiveScope === 'candidate' && path === hostEntry, path)
    inventory.push({ path, sourceSha256, sha256 })
  }
  archiveScopePackage = { mode: archiveScope, stage, original, inventory }
}
if (nativeArchivePackages) {
  const review = 'evidence/workspace-access-archive-manager-1794025826471.json'
  const bytes = await readFile(review)
  sourceSha256[review] = digest(bytes)
  const proof = JSON.parse(bytes), name = '@deepseek-ai/dsh-client-ui-settings-general', clientEntry = 'lib/client.js'
  assert.ok(proof.passed && proof.packageUnchanged && proof.observed.encrypted.archiveManagerPanel.restoreViewportPx === 390)
  const [candidateReceipt, candidateClient] = proof.compactSettings.files
  for (const file of [candidateReceipt, candidateClient]) assert.equal(digest(await readFile(file)), proof.packageSha256[file], file)
  const candidate = JSON.parse(await readFile(candidateReceipt, 'utf8'))
  assert.equal(candidate.name, name)
  assert.equal(candidateClient, join(candidate.stage, clientEntry))
  const original = await realpath(join(dependencyRoot, name)), stage = join(probeWorld, 'compact-settings-package')
  await cp(original, stage, { recursive: true, errorOnExist: true, force: false })
  const client = await readFile(candidateClient)
  assert.equal(digest(client), candidate.candidateClientSha256)
  await writeFile(join(stage, clientEntry), client)
  const inventory = []
  for (const item of await readdir(original, { recursive: true, withFileTypes: true })) {
    if (item.isDirectory()) continue
    assert.ok(item.isFile())
    const path = relative(original, join(item.parentPath, item.name)).replaceAll('\\', '/')
    const sourceSha256 = digest(await readFile(join(original, path))), sha256 = digest(await readFile(join(stage, path)))
    assert.equal(sha256 !== sourceSha256, path === clientEntry, path)
    inventory.push({ path, sourceSha256, sha256 })
  }
  compactSettingsPackage = { name, stage, original, inventory }
  overrides.set(name, stage)
}
if (nativeReleaseReview || nativeArchiveManager && initialSelectionRelease !== undefined) {
  const path = 'evidence/workspace-desktop-archive-compact-release-20261107/release.json'
  const bytes = await readFile(path), release = JSON.parse(bytes)
  sourceSha256[path] = digest(bytes)
  assert.ok(release.passed && release.compactSettingsLoaded && release.controllerScopeVerified)
  assert.equal(release.archives.length, 3)
  releaseHarmony = release.archives.find(entry => entry.name === '@deepseek-ai/dsh-experimental-harmony-mobile')
  assert.ok(releaseHarmony)
  for (const entry of release.archives) {
    assert.equal(digest(await readFile(entry.archive.path)), entry.archive.sha256)
    sourceSha256[entry.archive.path] = entry.archive.sha256
    const variant = entry.name === compactSettingsPackage.name ? compactSettingsPackage :
      entry.name === '@deepseek-ai/dsh-api-workspace-controller' ? archiveScopePackage : undefined
    if (variant !== undefined) {
      assert.equal(variant.inventory.length, entry.fileCount)
      assert.equal(digest(await readFile(join(variant.stage, entry.entry.path))), entry.entry.sha256)
    }
  }
}
async function deadlineArchive(name) {
  const [, , proofPath, proofHash] = grantDeadline
  const proofBytes = await readFile(proofPath); assert.equal(digest(proofBytes), proofHash)
  const proof = JSON.parse(proofBytes)
  assert.equal(proof.schema, 'harmony-rc258-grant-deadline-desktop-promotion/1')
  assert.ok(proof.passed && proof.configurationPreserved && proof.traceEnabled === false)
  assert.equal(proof.dailyProfileUsed, false); assert.equal(proof.physicalPhoneUsed, false)
  assert.equal(proof.changedPackage, name)
  assert.match(proof.candidate.path, /^evidence\/workspace-desktop-grant-deadline-[\w-]+\/candidate\.json$/)
  const candidate = await realpath(proof.candidate.path)
  assert.equal(candidate, resolve(proof.candidate.path))
  const candidateBytes = await readFile(candidate); assert.equal(digest(candidateBytes), proof.candidate.sha256)
  const release = JSON.parse(candidateBytes)
  assert.equal(release.installed, false)
  const harmony = release.archives.find(row => row.name === name); assert.ok(harmony)
  const archive = await realpath(harmony.archive)
  assert.equal(dirname(archive), dirname(candidate))
  assert.equal(harmony.inventory.find(row => row.path === 'lib/device.js')?.sha256, harmony.deviceEntrySha256)
  sourceSha256[proofPath] = proofHash; sourceSha256[candidate] = proof.candidate.sha256; sourceSha256[archive] = harmony.sha256
  if (nativeGrantDeadline) {
    assert.equal(harmony.predecessorSha256, selectionHarmony.sha256)
    assert.equal(release.archives.find(row => row.name === selectionClient.name)?.sha256, selectionClient.sha256)
  }
  return { ...harmony, archive }
}
async function pageDiagnosticArchive(name, version) {
  const [, , proofPath, proofHash] = pageDiagnostic
  assert.equal(await realpath(proofPath), resolve(proofPath))
  const bytes = await readFile(proofPath)
  assert.equal(digest(bytes), proofHash)
  const proof = JSON.parse(bytes)
  assert.equal(proof.schema, 'harmony-workspace-page-diagnostic-installed-inputs/1')
  const candidate = proof.candidate
  assert.equal(candidate.name, name)
  assert.equal(candidate.version, version)
  assert.match(candidate.archive, /^\.build\/workspace-page-diagnostic-[\w-]+\/harmony-mobile\.tgz$/)
  assert.equal(candidate.inventory.find(row => row.path === 'lib/device.js')?.sha256, candidate.deviceEntrySha256)
  const archive = await realpath(candidate.archive)
  assert.equal(archive, resolve(candidate.archive))
  assert.equal(digest(await readFile(archive)), candidate.sha256)
  sourceSha256[proofPath] = proofHash
  sourceSha256[archive] = candidate.sha256
  return { ...candidate, archive }
}
let packagedRelay
if (scenario !== 'metadata') {
  const review = JSON.parse(await readFile('evidence/workspace-review-bundle.json', 'utf8'))
  const manifest = JSON.parse(await readFile(join(review.destination, 'manifest.json'), 'utf8'))
  const run = promisify(execFile), tar = join(process.env.SystemRoot, 'System32/tar.exe')
  for (const id of ['harmony-mobile', 'rich-inline', 'devflow']) {
    let entry = manifest.artifacts.find(item => item.file.startsWith(id + '-') && item.file.endsWith('.tgz')); assert.ok(entry)
    let archive = join(review.destination, entry.file)
    if (pageDiagnostic !== null && id === 'harmony-mobile') {
      entry = await pageDiagnosticArchive(entry.name, entry.version); archive = entry.archive
    } else if (!nativeGrantDeadline && grantDeadline !== null && id === 'harmony-mobile') {
      const harmony = await deadlineArchive(entry.name)
      assert.equal(harmony.version, entry.version)
      entry = harmony; archive = harmony.archive
    } else if ((packagedDesktop || completeDesktopCommand) && id === 'harmony-mobile') {
      const pointerPath = archiveManagerDesktop ? 'evidence/workspace-desktop-archive-manager-boundary-candidate.json'
        : closeCancellation ? 'evidence/workspace-desktop-close-cancellation-candidate.json'
        : workspaceTrace ? 'evidence/workspace-desktop-trace-stdout-candidate.json'
        : explicitDesktopReceipt ?? (completeDesktopCommand || exactCandidate !== undefined ? 'evidence/workspace-desktop-command-complete-validation.json' : 'evidence/workspace-desktop-complete-validation.json')
      const pointer = JSON.parse(await readFile(pointerPath, 'utf8'))
      const proof = await readFile(pointer.path); assert.equal(digest(proof), pointer.sha256)
      const complete = JSON.parse(proof)
      const field = pointerPath === 'evidence/workspace-desktop-close-cancellation-candidate.json'
        ? JSON.parse(await readFile('evidence/workspace-desktop-field-wss-fragments-installed.json', 'utf8'))
        : workspaceTrace ? JSON.parse(await readFile('evidence/workspace-desktop-field-workspace-stop-installed.json', 'utf8'))
        : ['evidence/workspace-desktop-panel-recovery-candidate.json',
        'evidence/workspace-desktop-panel-recovery-workspace-stop-candidate.json'].includes(pointerPath)
        ? JSON.parse(await readFile('evidence/workspace-desktop-field-rc253-installed.json', 'utf8')) : undefined
      assert.equal(complete.passed, true); assert.equal(complete.name, entry.name)
      let baselineSha256 = field?.archiveSha256 ?? entry.sha256
      if (scopeBatching || archiveManagerDesktop) {
        const predecessor = JSON.parse(await readFile(archiveManagerDesktop ? 'evidence/workspace-desktop-scope-batching-candidate.json'
          : 'evidence/workspace-desktop-close-cancellation-candidate.json', 'utf8'))
        const prior = await readFile(predecessor.path)
        assert.equal(digest(prior), predecessor.sha256)
        const sealed = JSON.parse(prior)
        assert.equal(sealed.passed, true); assert.equal(sealed.name, complete.name)
        assert.equal(digest(await readFile(sealed.archive)), sealed.sha256)
        baselineSha256 = sealed.sha256
      }
      assert.equal(complete.baselineSha256, baselineSha256)
      entry = complete; archive = complete.archive
    }
    assert.equal(digest(await readFile(archive)), entry.sha256)
    if (releaseHarmony !== undefined && id === 'harmony-mobile') {
      assert.equal(entry.sha256, releaseHarmony.archive.sha256)
      assert.equal(entry.deviceEntrySha256, releaseHarmony.entry.sha256)
    }
    if (selectionHarmony !== undefined && id === 'harmony-mobile') {
      assert.equal(selectionHarmony.baselineSha256, entry.sha256)
      assert.equal(selectionHarmony.version, entry.version)
      const selected = nativeGrantDeadline ? await deadlineArchive(entry.name) : selectionHarmony
      assert.equal(selected.version, selectionHarmony.version)
      entry = selected; archive = entry.archive
    }
    if (devflowSessionTarget !== undefined && id === 'devflow') {
      assert.match(devflowSessionTarget, /^evidence\/workspace-devflow-target-release-[\w-]+\/candidate\.json$/)
      const path = await realpath(devflowSessionTarget)
      assert.match(relative(await realpath('evidence'), path).replaceAll('\\', '/'), /^workspace-devflow-target-release-[\w-]+\/candidate\.json$/)
      const bytes = await readFile(path), candidate = JSON.parse(bytes)
      assert.equal(candidate.schema, 'harmony-devflow-session-target/1')
      assert.equal(candidate.name, entry.name); assert.equal(candidate.version, entry.version)
      assert.equal(candidate.baselineSha256, entry.sha256)
      assert.equal(candidate.hostSha256, entry.inventory.find(file => file.path === 'lib/index.js').sha256)
      assert.deepEqual(candidate.inventory.map(file => file.path).sort(), entry.inventory.map(file => file.path).sort())
      assert.deepEqual(candidate.inventory.filter(file => file.sha256 !== entry.inventory.find(old => old.path === file.path).sha256).map(file => file.path).sort(),
        ['README.md', 'lib/client.js', 'lib/client.js.map'])
      archive = await realpath(candidate.archive)
      assert.equal(dirname(archive), dirname(path)); assert.equal(digest(await readFile(archive)), candidate.sha256)
      sourceSha256[path] = digest(bytes); sourceSha256[archive] = candidate.sha256
      entry = candidate
    }
    const stage = await extractArchive(archive, join(probeWorld, id), entry.inventory)
    if (packagedDesktop && id === 'harmony-mobile') {
      const original = await readFile(join(stage, 'lib/device.js'))
      assert.equal(digest(original), entry.deviceEntrySha256)
      const suffix = Buffer.from(standaloneTls !== undefined || nativeStandalone || archiveManagerDesktop || grantDeadline !== null || pageDiagnostic !== null ? '\nexport { DeviceBindingDesktopRelay, DeviceWorkspaceAccess, WorkspaceError, openDesktopWssPorts };\n'
        : workspaceTrace ? '\nexport { DeviceBindingDesktopRelay, WorkspaceError };\n' : '\nexport { DeviceBindingDesktopRelay };\n')
      const projection = Buffer.concat([original, suffix])
      const path = join(fixture, 'device-relay-review.mjs')
      await writeFile(path, projection, { flag: 'wx' })
      packagedRelay = { archiveSha256: entry.sha256, entrySha256: digest(original), fixtureSha256: digest(projection), fixturePath: path }
    }
    overrides.set(entry.name, stage); packages.push({ id, name: entry.name, stage, archive, sha256: entry.sha256, inventory: entry.inventory })
  }
  if (brickInstall !== undefined) {
    const receipt = JSON.parse(await readFile(brickInstall, 'utf8'))
    const name = 'dsh-theme-brick', entry = receipt.archives.find(item => item.name === name)
    assert.ok(receipt.passed && !receipt.userProfileUsed && receipt.scriptsDisabled && receipt.thirdParty.originalRegistryArchive)
    assert.equal(receipt.copiedRuntime, copied.runtime)
    assert.equal(entry.sha256, 'b225d8b3a1864d750f11e53fc76bdef0e5d379c15b43cdfb59668645df6c294c')
    assert.equal(digest(await readFile(entry.archive)), entry.sha256)
    assert.deepEqual(entry.inventory.map(file => file.path).sort(), ['DESIGN.md', 'LICENSE', 'README.md', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'package.json'])
    const stage = join(probeWorld, name, 'package')
    await mkdir(join(stage, 'lib'), { recursive: true })
    for (const file of entry.inventory) {
      const bytes = await readFile(join(receipt.privateHome, 'profiles/web/node_modules', name, file.path))
      assert.equal(digest(bytes), file.sha256, file.path)
      await writeFile(join(stage, file.path), bytes, { flag: 'wx' })
    }
    overrides.set(name, stage); packages.push({ ...entry, id: name, stage })
  }
  if (archiveManagerReview) {
    const receiptPath = 'evidence/workspace-plugin-install-1794022579399.json'
    const bytes = await readFile(receiptPath)
    assert.equal(digest(bytes), 'c8ee6914a188600f55f994bf3af7d717e3a37e8d4d4ba50130bbdce04064a8fc')
    sourceSha256[receiptPath] = digest(bytes)
    const receipt = JSON.parse(bytes), name = '@michengai/dsh-archive-manager'
    assert.ok(receipt.passed && !receipt.appStarted && !receipt.userProfileUsed && receipt.scriptsDisabled)
    assert.equal(receipt.copiedRuntime, copied.runtime)
    assert.equal(receipt.thirdParty.version, '1.1.7')
    assert.deepEqual(receipt.thirdParty.installedFilesChanged, [])
    const entry = receipt.archives.find(item => item.name === name)
    assert.equal(digest(await readFile(entry.archive)), entry.sha256)
    assert.equal(entry.inventory.length, 30)
    const stage = join(probeWorld, 'archive-manager-package')
    for (const file of entry.inventory) {
      const bytes = await readFile(join(receipt.privateHome, 'profiles/web/node_modules', name, file.path))
      assert.equal(digest(bytes), file.sha256, file.path)
      const target = join(stage, file.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes, { flag: 'wx' })
    }
    overrides.set(name, stage); packages.push({ ...entry, id: name, stage })
  }
  if (pluginBootFault) {
    const name = 'dsh-workspace-boot-fault-fixture', directory = join(probeWorld, name), stage = join(directory, 'package')
    await mkdir(join(stage, 'lib'), { recursive: true })
    const metadata = { name, version: '0.0.0-test', type: 'module', main: 'lib/index.js', exports: { '.': './lib/index.js', './client': './lib/client.js', './package.json': './package.json' },
      dsh: { bundle: { patch: 'cordis.patch.yml' }, client: { platform: 'web', inject: [] } } }
    const files = { 'package.json': JSON.stringify(metadata) + '\n', 'cordis.patch.yml': yaml.dump([{ insert: [{ id: name, name }] }]),
      'lib/index.js': 'export function apply() {}\n',
      'lib/client.js': `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: () => ({ apply() { console.error('Error: WORKSPACE_PLUGIN_BOOT_FAULT'); throw new Error('WORKSPACE_PLUGIN_BOOT_FAULT') } }) })\n` }
    for (const [path, content] of Object.entries(files)) await writeFile(join(stage, path), content, { flag: 'wx' })
    const archive = join(directory, name + '.tgz')
    await run(tar, ['-czf', archive, '-C', directory, 'package'], { windowsHide: true, timeout: 30000 })
    const inventory = Object.entries(files).map(([path, content]) => ({ path, sha256: digest(content) }))
    overrides.set(name, stage); packages.push({ id: name, name, stage, archive, sha256: digest(await readFile(archive)), inventory })
  }
}
await symlink(join(profile, 'node_modules'), join(fixture, 'node_modules'), 'junction')
for (const name of await readdir(dependencyRoot)) {
  if (name.startsWith('.')) continue
  const entries = name.startsWith('@') ? (await readdir(join(dependencyRoot, name))).map(child => name + '/' + child) : [name]
  for (const entry of entries) { if (overrides.has(entry)) continue; const link = join(profile, 'node_modules', entry); await mkdir(dirname(link), { recursive: true }); await symlink(await realpath(join(dependencyRoot, entry)), link, 'junction') }
}
for (const [name, stage] of overrides) { const link = join(profile, 'node_modules', name); await mkdir(dirname(link), { recursive: true }); await symlink(stage, link, 'junction'); await symlink(join(profile, 'node_modules'), join(stage, 'node_modules'), 'junction') }
await mkdir(join(profile, 'node_modules/@local'), { recursive: true }); await symlink(fixture, join(profile, 'node_modules/@local/workspace-installed-probe'), 'junction')
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'dsh-profile-workspace-review', private: true, dependencies: { '@local/workspace-installed-probe': 'file:' + fixture.replaceAll('\\', '/'), ...Object.fromEntries([...overrides].map(([name, path]) => [name, 'file:' + path.replaceAll('\\', '/')])) },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...packages.map(item => item.name), ...(official ? ['@deepseek-ai/dsh-experimental-cot-translation-bundle'] : []), '@local/workspace-installed-probe'] } } }, null, 2) + '\n')
const officialBefore = official ? await officialPackageInventory(copied.runtime) : undefined
const translation = official ? await createOfficialTranslationReplay() : undefined
try {
const patch = [
  ...(brickInstall === undefined && !pluginBootFault ? [{ id: 'hmr', disabled: true }] : []),
  ...(brickInstall === undefined ? [{ id: 'client-hmr', disabled: true }] : []),
  ...['llm-deepseek', 'agent-instructions', 'session-title-llm', 'session-telemetry-otel', 'open-in-app', 'ui-open-in-app'].map(id => ({ id, disabled: true })),
  { id: 'session-log-deepseek', config: { enabled: false } }, { id: 'ui-plugin-manager', config: { registryProbeEnabled: false } },
  { id: 'agent-preset-registry', config: { default: 'standard' } }, { id: 'tools', config: { mode: 'native' } },
  { id: 'session-persistence-jsonl', config: { root: join(probeWorld, 'sessions'), compression: pinnedSessionId === undefined ? 'none' : 'zstd' } },
  { id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } },
  { id: 'storage-json', config: { root: join(probeWorld, 'state') } },
  { id: 'workspace-controller', config: { documentsDirectory: join(probeWorld, 'Documents') } },
  { id: 'skill-filesystem', config: { dshHome: home, agentsHome: join(probeWorld, 'agents'), bundledSkillDir: join(probeWorld, 'skills'), watch: false } },
  { id: 'webserver', config: { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
  { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: false } },
  { id: 'credentials', config: { dshHome: home } },
  ...(scenario === 'metadata' ? [] : [{ id: 'dsh-devflow', config: { presetIds: ['standard', 'devin', ...(blankCreationWorkspace && devflowSessionTarget !== undefined ? ['minimal'] : [])], includeUnpresetSessions: true } }]),
  ...(official ? [{ id: 'translator', config: { googleEndpoint: translation.endpoint + '/google', bingEndpoint: translation.endpoint + '/bing' } }, { id: 'cot-translation', config: { provider: 'google', targetLanguage: 'auto' } }] : []),
]
await writeFile(join(profile, 'cordis.patch.yml'), yaml.dump(patch))
if (diskAdmission) await promisify(execFile)(process.execPath, ['--import', 'tsx/esm', resolve('integration/seed-workspace-admission-sessions.mts'), probeWorld], { cwd: root, windowsHide: true, timeout: 30000 })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
if (admission) env.DSH_HARMONY_WORKSPACE_NATIVE_ADMISSION = fieldAdmission ? 'disk-field' : latencyAdmission ? 'disk-latency' : diskAdmission ? 'disk' : 'padded'
if (rpcDiagnostics) env.DSH_HARMONY_WORKSPACE_NATIVE_RPC_DIAGNOSTICS = '1'
if (packagedDesktop) { assert.ok(packagedRelay); env.DSH_HARMONY_WORKSPACE_PACKAGED_DESKTOP = '1' }
if (nativeWss) env.DSH_HARMONY_WORKSPACE_NATIVE_WSS = '1'
if (nativeStandalone) env.DSH_HARMONY_WORKSPACE_NATIVE_STANDALONE_WSS = '1'
if (devflowConflictReview) env.DSH_HARMONY_WORKSPACE_DEVFLOW_CONFLICT = '1'
if (brickInstall !== undefined) {
  env.DSH_HARMONY_WORKSPACE_BRICK_REVIEW = '1'
}
if (revocationReview) env.DSH_HARMONY_WORKSPACE_REVOKED_REVIEW = '1'
if (grantDeadline !== null || pageDiagnostic !== null || brickInstall !== undefined || pluginBootFault || revocationReview || archiveManagerReview || blankCreationWorkspace || pinnedSessionId !== undefined) env.DSH_HARMONY_OUTBOUND_LOG = join(probeWorld, 'outbound.jsonl')
if (archiveManagerReview) env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER = archiveManagerMode
if (compactSettingsPackage) env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_SETTINGS = compactSettingsPackage.stage
if (nativeArchiveManager) env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_MANAGER = '1'
if (nativeReleaseReview) env.DSH_HARMONY_WORKSPACE_NATIVE_RELEASE_REVIEW = '1'
if (blankCreationWorkspace) env.DSH_HARMONY_WORKSPACE_NATIVE_BLANK_CREATION = '1'
if (blankCreationWorkspace && devflowSessionTarget !== undefined) env.DSH_HARMONY_WORKSPACE_DEVFLOW_SESSION_TARGET = devflowSessionTarget
if (pinnedSessionId !== undefined) env.DSH_HARMONY_WORKSPACE_PINNED_SESSION_ID = pinnedSessionId
if (initialSelectionStage !== undefined) env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_STAGE = initialSelectionStage
if (initialSelectionCandidate !== undefined) env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_SOURCE = '1'
Object.assign(env, { ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, DSH_AGENTS_HOME: join(probeWorld, 'agents'),
  DSH_BUNDLED_SKILL_DIR: join(probeWorld, 'skills'), DSH_TELEMETRY_DISABLED: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1',
  DSH_HARMONY_WORKSPACE_INSTALLED_CASE: scenario, DSH_HARMONY_WORKSPACE_INSTALLED_PACKAGES: JSON.stringify(packages.map(({ inventory, ...item }) => item)),
  DSH_HARMONY_WORKSPACE_INSTALLED_WORLD: probeWorld, COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', TEMP: probeWorld, TMP: probeWorld })
if (native) Object.assign(env, { DSH_HARMONY_WORKSPACE_CLIENT_ROOT: resolve('.'), DSH_HARMONY_WORKSPACE_NATIVE_PROJECT: nativeProject })
if (workspaceTrace) env.DSH_HARMONY_WORKSPACE_CLIENT_ROOT = resolve('.')
if (workspaceTrace && (grantDeadline !== null || pageDiagnostic !== null)) env.DSH_HARMONY_WORKSPACE_PACKAGED_GRANT_DEADLINE = '1'
if (pageDiagnostic !== null) env.DSH_HARMONY_WORKSPACE_PAGE_DIAGNOSTIC = pageDiagnostic[1]
if (grantDeadlineRich) env.DSH_HARMONY_WORKSPACE_PACKAGED_RICH_REPLAY = '1'
if (archiveScope !== undefined) env.DSH_HARMONY_WORKSPACE_ARCHIVE_SCOPE = archiveScope
if (closeCancellation) env.DSH_HARMONY_WORKSPACE_CLOSE_CANCELLATION = '1'
if (standaloneTls !== undefined) env.DSH_HARMONY_WORKSPACE_STANDALONE_TLS = resolve(standaloneTls)
if (official) env.DSH_HARMONY_WORKSPACE_OFFICIAL_CLIENT = join(copied.runtime, 'node_modules/@deepseek-ai/dsh-experimental-client-ui-cot-translation/lib/client.js')
const exe = 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const args = ['--expose-internals', ...(env.DSH_HARMONY_OUTBOUND_LOG === undefined ? [] : ['--import', pathToFileURL(resolve('integration/workspace-outbound-guard.mjs')).href]),
  join(copied.runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', profileName]
const child = spawn(exe, args, { cwd: probeWorld, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let output = '', stdout = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
  if (workspaceTrace && stream === child.stdout) stdout += bytes
  output += bytes; process.stdout.write(bytes)
})
let timedOut = false
const watchdog = setTimeout(() => { timedOut = true; child.kill() }, native ? 22 * 60 * 1000 : closeCancellation ? 240000 : 120000)
const stopped = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) })
void stopped.catch(error => { void error /* The startup and completion owner below awaits the same result. */ })
let completion
try {
  await writeFile(join(probeWorld, 'process.json'), JSON.stringify({ pid: child.pid, parentPid: process.pid, exe, args, world: probeWorld, createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' })
  completion = await stopped
} catch (error) { child.kill(); await stopped.catch(stopError => { void stopError }); throw error }
finally { clearTimeout(watchdog) }
const { code, signal } = completion
const officialAfter = official ? await officialPackageInventory(copied.runtime) : undefined
if (official) assert.deepEqual(officialAfter, officialBefore)
await writeFile(join(probeWorld, 'probe.log'), output)
let observed; try { observed = JSON.parse(await readFile(join(probeWorld, 'probe.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
for (const entry of packages) await verifyInventory(entry.stage, entry.inventory)
if (selectionClient !== undefined) await verifyInventory(initialSelectionStage, selectionClient.inventory)
for (const variant of [archiveScopePackage, compactSettingsPackage]) if (variant !== undefined) for (const file of variant.inventory) {
  assert.equal(digest(await readFile(join(variant.original, file.path))), file.sourceSha256, file.path)
  assert.equal(digest(await readFile(join(variant.stage, file.path))), file.sha256, file.path)
}
if (packagedRelay !== undefined) assert.equal(createHash('sha256').update(await readFile(packagedRelay.fixturePath)).digest('hex'), packagedRelay.fixtureSha256)
for (const [file, hash] of Object.entries(sourceSha256)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), hash, file)
const officialPassed = !official || translation.errors.length === 0 && translation.requests.length === 1
let workspaceStdout
if (workspaceTrace) {
  const rows = stdout.split(/\r?\n/).filter(line => line.startsWith('DSH_WORKSPACE_TRACE '))
  const pageLine = /^DSH_WORKSPACE_TRACE at=\d{4}-\d{2}-\d{2}T[\d:.]+Z Workspace page seq=(\d+) outcome=(advanced|bad-request) status=200 bytes=(\d+) records=(\d+|unavailable) hasMore=(true|false|unavailable)$/
  const chunkLine = /^DSH_WORKSPACE_TRACE at=\d{4}-\d{2}-\d{2}T[\d:.]+Z Workspace page-chunk pageSeq=(\d+) seq=(\d+) offset=(\d+) bytes=(\d+) done=(true|false) stage=(result-ready|socket-submitted)$/
  const pageRows = rows.map(row => pageLine.exec(row)).filter(row => row !== null)
  const complete = rows.every(row => /^DSH_WORKSPACE_TRACE at=\d{4}-\d{2}-\d{2}T[\d:.]+Z Workspace (?:carrier encrypted stage=[\w:-]+|RPC seq=\d+ operation=[\w-]+ stage=[\w-]+ elapsedMs=\d+(?: outcome=(?:failed|cancelled) failure=[\w-]+)?)$/.test(row)
    || pageDiagnostic?.[1] === 'on' && (pageLine.test(row) || requirePageChunks && chunkLine.test(row)))
  const close = 'operation=close stage=socket-submitted ', fetch = 'operation=fetch stage=socket-submitted '
  const firstClose = rows.findIndex(row => row.includes(close)), lastClose = rows.findLastIndex(row => row.includes(close))
  const reopened = firstClose !== -1 && firstClose < lastClose && rows.slice(firstClose + 1, lastClose).some(row => row.includes(fetch))
  const evidence = rows.join('\n') + '\n', path = join(probeWorld, 'workspace-trace.stdout.log')
  await writeFile(path, evidence, { flag: 'wx' })
  const cancelledClose = closeCancellation ? rows.some(row => row.includes('operation=close stage=received ') && row.endsWith('outcome=cancelled failure=workspace-closed')) : undefined
  const tracePassed = complete
    && (!closeCancellation || cancelledClose && observed?.details?.cancelledClosePreservedHandle === true)
    && rows.some(row => row.endsWith('encrypted stage=peer-verified')) && reopened
    && rows.some(row => row.includes('operation=rich-appearance stage=received ') && row.endsWith('outcome=failed failure=workspace-denied'))
    && rows.some(row => row.includes('operation=rich-appearance stage=received ') && row.includes(' outcome=cancelled '))
  const outcomes = pageRows.map(row => row[2])
  const chunkRows = rows.map(row => chunkLine.exec(row)).filter(row => row !== null)
  const submittedPageChunks = chunkRows.filter(row => row[6] === 'socket-submitted').length
  let pagePassed = true
  if (pageDiagnostic?.[1] === 'on') {
    pagePassed = JSON.stringify(outcomes) === '["advanced","bad-request","advanced"]'
      && pageRows.every(row => rows.some(trace => trace.includes(`Workspace RPC seq=${row[1]} operation=session-page stage=socket-submitted `)))
    if (requirePageChunks) pagePassed &&= chunkRows.length === pageRows.length * 2 && pageRows.every(page => {
      const [prepared, submitted, extra] = chunkRows.filter(row => row[1] === page[1])
      return extra === undefined && prepared !== undefined && submitted !== undefined
        && prepared[6] === 'result-ready' && submitted[6] === 'socket-submitted'
        && JSON.stringify(prepared.slice(1, 6)) === JSON.stringify(submitted.slice(1, 6))
        && prepared[3] === '0' && prepared[4] === page[3] && prepared[5] === 'true'
        && rows.some(trace => trace.includes(`Workspace RPC seq=${submitted[2]} operation=read stage=socket-submitted `))
    })
  }
  const off = pageDiagnostic?.[1] === 'off'
  workspaceStdout = { path, sha256: digest(evidence), count: rows.length, reopened, cancelledClose,
    ...(pageDiagnostic === null ? {} : { pageDiagnostic: pageDiagnostic[1], outcomes }),
    ...(requirePageChunks ? { submittedPageChunks } : {}),
    passed: off ? rows.length === 0 : tracePassed && pagePassed }
}
const report = { at: new Date().toISOString(), code, signal, timedOut, scenario, passed: code === 0 && signal === null && !timedOut && officialPassed && (!workspaceTrace || workspaceStdout?.passed === true) && observed?.passed === true && (scenario === 'metadata' || observed.scenario === scenario), observed, workspaceStdout, official: official ? { packages: officialBefore, unchanged: true, translationRequests: translation.requests, translationErrors: translation.errors, noMobilePackageChanges: true } : undefined, packages: packages.map(({ inventory, ...item }) => item), packagedRelay, archiveScopePackage, compactSettingsPackage, world: probeWorld, copiedRuntime: copied.runtime, descriptorSha256: copied.descriptorSha256, sourceSha256, keyboardReview: keyboard, nativeProject: native ? nativeProject : undefined, home, exe, args, appStartedThroughDshProfile: true, dailyProfileUsed: false, realModelCalls: 0 }
const evidence = 'evidence/workspace-installed-' + (scenario === 'metadata' ? 'probe' : scenario) + '-' + Date.now() + '-' + basename(probeWorld) + '.json'; await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ evidence, ...report })); assert.equal(report.passed, true)
} finally { await translation?.close() }

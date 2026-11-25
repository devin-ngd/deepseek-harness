/** Isolated standard Web-plugin compatibility check without installed profiles or real models. */
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { buildCommandFeedback } from './build-command-feedback.mjs'
import { unpackWorkspaceReview } from './unpack-workspace-review.mjs'

const project = resolve('.')
const creationEmulator = process.argv.length === 3 && process.argv[2] === '--creation-emulator'
const creation = creationEmulator || process.argv.length === 3 && process.argv[2] === '--creation'
const wire = process.argv.length === 3 && process.argv[2] === '--wire'
const accessArchiveManager = process.argv.length === 3 && process.argv[2] === '--access-archive-manager'
const accessDevflow = accessArchiveManager || process.argv.length === 3 && process.argv[2] === '--access-devflow'
const initialSelectionCandidateInput = process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_CANDIDATE
if (initialSelectionCandidateInput !== undefined && !accessDevflow) throw new Error('The isolated Workspace UI candidate requires --access-devflow')
const archiveCandidateInput = accessDevflow ? process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_CANDIDATE : undefined
const access = accessDevflow || process.argv.length === 3 && process.argv[2] === '--access'
const lanReview = process.env.DSH_HARMONY_WORKSPACE_LAN_REVIEW
if (lanReview !== undefined && (!access || lanReview !== '1')) throw new Error('Direct LAN review requires a workspace access fixture')
const deviceCommandPrevious = process.argv.length === 3 && process.argv[2] === '--device-command-previous'
const deviceCommandBuilt = deviceCommandPrevious || process.argv.length === 3 && process.argv[2] === '--device-command-built'
const commandClaim = process.argv.length === 3 && process.argv[2] === '--command-claim'
const deviceCommandUi = process.argv.length === 3 && process.argv[2] === '--device-command-ui'
const deviceCommand = deviceCommandUi || commandClaim || deviceCommandBuilt || process.argv.length === 3 && process.argv[2] === '--device-command'
const devflowReview = process.argv.length === 3 && process.argv[2] === '--devflow-review'
const emulatorFlow = process.argv.length === 3 && process.argv[2] === '--emulator-devflow'
const emulatorPluginTarget = process.argv.length === 3 && process.argv[2] === '--emulator-plugin-target'
const emulator = emulatorPluginTarget || emulatorFlow || process.argv.length === 3 && process.argv[2] === '--emulator'
const encryptedAdmission = process.argv.length === 3 && process.argv[2] === '--rich-admission-cipher'
const admissionBoot = encryptedAdmission || process.argv.length === 3 && process.argv[2] === '--rich-admission'
const richCombined = admissionBoot || process.argv.length === 3 && process.argv[2] === '--rich-combined'
const richReview = emulator || richCombined || process.argv.length === 3 && process.argv[2] === '--rich-review'
const workflowRun = devflowReview || process.argv.length === 3 && process.argv[2] === '--devflow-run'
const candidate = workflowRun || process.argv.length === 3 && process.argv[2] === '--devflow-candidate'
const richSource = process.argv.length === 3 && process.argv[2] === '--rich-source'
const rich = richReview || process.argv.length === 3 && process.argv[2] === '--rich'
const graph = process.argv.length === 3 && process.argv[2] === '--graph'
const panel = process.argv.length === 3 && process.argv[2] === '--panel'
const panelList = process.argv.length === 3 && process.argv[2] === '--panel-list'
const cache = process.argv.length === 3 && process.argv[2] === '--cache'
const measurement = cache || process.argv.length === 3 && ['--measure', '--slow'].includes(process.argv[2])
const devflow = accessDevflow || candidate || process.argv.length === 3 && process.argv[2] === '--devflow'
if (process.argv.length !== 2 && !creation && !wire && !access && !deviceCommand && !devflow && !richSource && !rich && !graph && !panel && !panelList && !measurement) throw new Error('Select a declared workspace verification mode')
const spec = deviceCommandUi ? 'workspace-device-command-ui.spec.ts' : commandClaim ? 'workspace-command-claim.spec.ts' : deviceCommand ? 'device-workspace-command.spec.ts' : creationEmulator ? 'session-creation-emulator.spec.ts' : emulator ? 'workspace-emulator.spec.ts' : creation ? 'session-creation.spec.ts' : wire ? 'workspace-wire.spec.ts' : access ? 'workspace-access.spec.ts' : richSource ? 'workspace-rich-seam.spec.ts' : rich ? 'workspace-rich.spec.ts' : 'workspace.spec.ts'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
await mkdir('.build', { recursive: true })
const world = await mkdtemp(resolve('.build/workspace-'))
const tmp = join(world, 'tmp')
await mkdir(tmp)
await writeFile(join(world, 'workspace.overlay.yml'), (graph ? '[]\n' : '- id: client-hmr\n  disabled: true\n') + (devflow || emulatorFlow ? '- id: dsh-devflow\n  config:\n    presetIds: [standard, devin]\n    includeUnpresetSessions: true\n' : ''))
const require = createRequire(join(root, 'package.json'))
const archivePackage = richReview || devflowReview || accessDevflow ? await unpackWorkspaceReview(richReview ? 'rich-inline' : 'devflow', world, root) : undefined
let archiveManager
let compactSettings
let initialSelectionCandidate
if (initialSelectionCandidateInput !== undefined) {
  const prefix = await realpath(resolve('.build')) + sep
  const proofPath = await realpath(initialSelectionCandidateInput)
  if (!proofPath.startsWith(prefix)) throw new Error('Workspace UI candidate receipt must be under .build')
  const proof = JSON.parse(await readFile(proofPath, 'utf8')), stage = await realpath(proof.stage)
  if (!stage.startsWith(prefix) || proof.name !== '@deepseek-ai/dsh-client-ui-workspace') throw new Error('Unexpected Workspace UI candidate')
  const client = join(stage, 'lib/client.js'), host = join(stage, 'lib/index.js')
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  if (sha(await readFile(client)) !== proof.candidateClientSha256 || sha(await readFile(host)) !== proof.hostSha256) throw new Error('Workspace UI candidate digest mismatch')
  initialSelectionCandidate = { stage, files: [proofPath, client, host] }
}
if (accessArchiveManager) {
  const receiptPath = 'evidence/workspace-archive-boundary-delivery-validation-20261107.json'
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  const installed = await readFile(receipt.install.path)
  if (receipt.passed !== true || sha(installed) !== receipt.install.sha256) throw new Error('Archive delivery receipt mismatch')
  const install = JSON.parse(installed)
  const name = '@michengai/dsh-archive-manager', version = '1.1.7'
  const archive = install.archives.find(item => item.name === name)
  const pinned = receipt.archives.find(item => item.name === name)
  if (install.thirdParty?.version !== version || !pinned || !archive || pinned.fileCount !== archive.inventory.length ||
      pinned.sha256 !== archive.sha256 || sha(await readFile(archive.archive)) !== pinned.sha256) throw new Error('Archive Manager package mismatch')
  const dir = await realpath(join(install.privateHome, 'profiles/web/node_modules', name))
  const prefix = await realpath(resolve('.build')) + sep
  if (!dir.startsWith(prefix)) throw new Error('Archive Manager must resolve from the isolated CLI installation')
  const files = []
  for (const file of archive.inventory) {
    const path = join(dir, file.path)
    if (sha(await readFile(path)) !== file.sha256) throw new Error('Archive Manager installed file mismatch: ' + file.path)
    files.push(path)
  }
  archiveManager = { dir, name, version, sha256: archive.sha256, files }
  const input = process.env.DSH_HARMONY_WORKSPACE_COMPACT_SETTINGS_CANDIDATE
  if (input !== undefined) {
    const proofPath = await realpath(input)
    if (!proofPath.startsWith(prefix)) throw new Error('Settings review receipt must be under .build')
    const proof = JSON.parse(await readFile(proofPath, 'utf8'))
    const stage = await realpath(proof.stage)
    if (!stage.startsWith(prefix) || proof.name !== '@deepseek-ai/dsh-client-ui-settings-general') throw new Error('Unexpected settings candidate')
    const client = join(stage, 'lib/client.js'), host = join(stage, 'lib/index.js')
    if (sha(await readFile(client)) !== proof.candidateClientSha256 || sha(await readFile(host)) !== proof.hostSha256) throw new Error('Settings candidate digest mismatch')
    compactSettings = { stage, files: [proofPath, client, host] }
  }
}
const richPackage = rich ? archivePackage?.stage ?? JSON.parse(await readFile('evidence/workspace-rich-build.json', 'utf8')).stage : undefined
if (emulator || richCombined) await mkdir(join(world, 'devflow'))
const emulatorDevflow = emulator || richCombined ? await unpackWorkspaceReview('devflow', join(world, 'devflow'), root) : undefined
const packageFiles = ['packages/experimental/cot-translation-bundle/package.json',
  'packages/experimental/cot-translation-bundle/cordis.patch.yml',
  'packages/experimental/client-ui-cot-translation/package.json',
  'packages/experimental/client-ui-cot-translation/lib/client.js',
  'packages/experimental/client-ui-cot-translation/lib/index.js']
if (archiveManager) packageFiles.push(...archiveManager.files)
if (compactSettings) packageFiles.push(...compactSettings.files)
if (initialSelectionCandidate) packageFiles.push(...initialSelectionCandidate.files)
// This smoke explicitly consumes the published wire descriptor alongside the current Session service source.
if (access) packageFiles.push('packages/api/session-controller/lib/typert.host.js',
  'packages/api/session-controller/src/index.ts', 'packages/api/session-controller/src/commands.ts',
  'packages/extensions/cordis-host-runner/lib/typert.host.js', 'packages/extensions/cordis-host-runner/src/index.ts',
  resolve('integration/workspace-access.spec.ts'), resolve('integration/relay-upgrade.ts'), resolve('standalone-relay/src/host.ts'),
  resolve('desktop-plugin/src/device-binding-relay.ts'), resolve('desktop-plugin/src/workspace-access.ts'), resolve('src/workspace-diagnostic.ts'),
  resolve('desktop-plugin/src/workspace-page-diagnostic.ts'), resolve('desktop-plugin/src/workspace-wire.ts'))
if (wire) packageFiles.push(resolve('integration/workspace-wire.spec.ts'),
  resolve('desktop-plugin/src/workspace-page-diagnostic.ts'), resolve('desktop-plugin/src/workspace-wire.ts'))
if (accessDevflow) packageFiles.push('packages/api/workspace-controller/src/index.ts', 'packages/api/workspace-controller/src/commands.ts',
  'packages/api/workspace-controller/lib/index.js', 'packages/api/workspace-controller/lib/typert.host.js', 'packages/workspace/workspace/src/index.ts')
const archiveCandidate = archiveCandidateInput === undefined ? undefined : await realpath(archiveCandidateInput)
if (archiveCandidate !== undefined) {
  const prefix = await realpath(resolve('.build')) + sep
  if (!archiveCandidate.startsWith(prefix)) throw new Error('Archive candidate must be an isolated package under .build')
  const manifest = JSON.parse(await readFile(join(archiveCandidate, 'package.json'), 'utf8'))
  if (manifest.name !== '@deepseek-ai/dsh-api-workspace-controller' || manifest.version !== '0.2.1-rc.2') throw new Error('Unexpected archive candidate package')
  for (const file of ['package.json', 'src/index.ts', 'src/types.ts', 'lib/index.js', 'lib/typert.host.js']) packageFiles.push(join(archiveCandidate, file))
}
if (deviceCommand) for (const file of ['integration/device-workspace-command.spec.ts', 'integration/workspace-memory-relay.ts', 'standalone-relay/src/room-broker.ts',
  'desktop-plugin/src/device-binding-command.ts', 'desktop-plugin/src/workspace-access.ts', 'desktop-plugin/src/workspace-channel.ts',
  'src/automatic-connection.ts', 'src/native-device-bridge.ts']) packageFiles.push(resolve(file))
if (deviceCommand && !deviceCommandUi && !commandClaim) packageFiles.push('packages/api/session-controller/lib/typert.host.js')
if (commandClaim) packageFiles.push(resolve('integration/workspace-command-claim.spec.ts'))
if (deviceCommandUi) packageFiles.push(resolve('integration/workspace-device-command-ui.spec.ts'))
const deviceBuild = deviceCommandPrevious ? await unpackWorkspaceReview('harmony-mobile', world, root) : deviceCommandBuilt ? JSON.parse(await readFile('evidence/workspace-desktop-build.json', 'utf8')) : undefined
if (deviceBuild) packageFiles.push(join(deviceBuild.stage, 'lib/device.js'), join(deviceBuild.stage, 'package.json'))
if (creationEmulator) for (const file of ['harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/ets/product/NativeProductOwner.ets', 'integration/native/CreationFixtureProduct.ets', 'integration/native/WorkspaceFixtureProduct.ets', 'desktop-plugin/src/device-binding-profile.ts', 'src/session-creation.ts']) packageFiles.push(resolve(file))
if (emulatorPluginTarget) for (const file of ['harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/resources/base/element/string.json',
  'integration/workspace-emulator.spec.ts', 'integration/workspace-emulator-fixture.ts', 'integration/native/PluginTargetHostProduct.ets',
  'integration/native/WorkspaceFixtureProduct.ets', 'scripts/accept-workspace-plugin-target.py', 'scripts/prepare-creation-native-review.mjs']) packageFiles.push(resolve(file))
const devflowPackage = devflowReview || accessDevflow ? archivePackage.stage : candidate ? resolve('.build/workspace-devflow-checkout/dsh-devflow') : resolve(root, '../dsh_plugins/dsh-devflow')
if (devflow) for (const file of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js']) packageFiles.push(join(devflowPackage, file))
if (accessDevflow) packageFiles.push(resolve('harmony/entry/src/main/resources/rawfile/workspace-document.js'))
if (emulatorDevflow) for (const file of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js']) packageFiles.push(join(emulatorDevflow.stage, file))
if (rich) for (const file of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/typert.host.js', 'lib/typert.remote-client.js']) packageFiles.push(join(richPackage, file))
if (rich || cache || graph) {
  await promisify(execFile)(process.execPath, ['scripts/product-native-substitute.mjs'], { windowsHide: true })
  for (const file of ['NativeWebRenderer.ets', 'NativeWorkspaceOwner.ets', 'NativeWorkspaceCache.ets', 'NativeWorkspaceRich.ets', 'NativeWorkspaceRichGuest.ets', 'ProductCore.js']) packageFiles.push(resolve('harmony/entry/src/main/ets/product', file))
  for (const file of ['workspace-document.js', 'workspace-rich-document.js']) packageFiles.push(resolve('harmony/entry/src/main/resources/rawfile', file))
}
const hashes = async () => Object.fromEntries(await Promise.all(packageFiles.map(async path =>
  [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])))
const before = await hashes()
let navigation
if (!creation && !wire && (!access || accessDevflow) && !deviceCommand && !richSource) {
  navigation = await buildCommandFeedback(join(world, 'navigation-package'))
  // The browser scenario supplies its own channel; this passive Host fixture activates only the real client face.
  await writeFile(join(navigation.stage, 'lib/index.js'), 'export function apply() {}\n')
}
const ts = require('typescript')
const helper = join(world, 'vitest-shared.mjs')
await writeFile(helper, ts.transpileModule(await readFile(join(root, 'vitest.shared.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true },
  fileName: join(root, 'vitest.shared.ts'),
}).outputText)
const config = join(world, 'config.mjs')
const rendererRequire = createRequire(join(root, 'packages/client/ui-renderer/package.json'))
const uiAliases = richSource ? ['react', 'react/jsx-runtime', 'react-dom/client'].map(name => ({ name, path: rendererRequire.resolve(name).replaceAll('\\', '/') })) : []
const specs = ['clients/harmony-mobile/integration/' + spec]
if (richSource) for (const file of ['controller.client.spec.ts', 'preview.client.spec.ts']) specs.push('clients/harmony-mobile/.build/workspace-core-checkout/packages/experimental/rich-inline/tests/' + file)
await writeFile(config, `import {standardDecoratorPlugin,vitestExecArgv} from ${JSON.stringify(pathToFileURL(helper).href)};
import {projectionAliases} from ${JSON.stringify(pathToFileURL(resolve('scripts/projection-source.mjs')).href)};
const uiAliases=${JSON.stringify(uiAliases)}.map(value=>({find:new RegExp('^'+value.name+'$'),replacement:value.path}));
export default {root:${JSON.stringify(root)},cacheDir:${JSON.stringify(join(world, 'cache'))},
resolve:{alias:[...uiAliases,...await projectionAliases(${JSON.stringify(project)},${JSON.stringify(root)})]},plugins:[standardDecoratorPlugin()],
test:{name:'mobile-workspace',environment:'node',pool:'forks',execArgv:vitestExecArgv,
include:${JSON.stringify(specs)},maxWorkers:1,fileParallelism:false,
testTimeout:120000,hookTimeout:120000,teardownTimeout:30000}};
`)
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: tmp, TMP: tmp, DSH_HOME: join(world, 'home'), DSH_AGENTS_HOME: join(world, 'agents'),
  DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_TELEMETRY_DISABLED: '1',
  DSH_HARMONY_WORKSPACE_WORLD: world, DSH_TEST_CHROMIUM_EXECUTABLE_PATH: 'C:/Program Files/Google/Chrome/Application/chrome.exe', NO_COLOR: '1' })
if (navigation) env.DSH_HARMONY_WORKSPACE_NAVIGATION = navigation.stage
if (deviceBuild) env.DSH_HARMONY_DEVICE_COMMAND_ENTRY = join(deviceBuild.stage, 'lib/device.js')
if (devflow) env.DSH_HARMONY_WORKSPACE_DEVFLOW = devflowPackage
if (accessDevflow) env.DSH_HARMONY_WORKSPACE_ACCESS_DEVFLOW = '1'
if (lanReview === '1') env.DSH_HARMONY_WORKSPACE_LAN_REVIEW = lanReview
if (archiveManager) env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER_PANEL = archiveManager.dir
if (compactSettings) env.DSH_HARMONY_WORKSPACE_COMPACT_SETTINGS = compactSettings.stage
if (initialSelectionCandidate) env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_STAGE = initialSelectionCandidate.stage
if (archiveCandidate !== undefined) env.DSH_HARMONY_WORKSPACE_ARCHIVE_CANDIDATE = archiveCandidate
if (workflowRun) env.DSH_HARMONY_WORKSPACE_DEVFLOW_RUN = '1'
if (emulatorFlow) env.DSH_HARMONY_WORKSPACE_EMULATOR_FLOW = '1'
if (emulatorPluginTarget) env.DSH_HARMONY_WORKSPACE_PLUGIN_TARGET = '1'
if (rich) env.DSH_HARMONY_WORKSPACE_RICH = richPackage
if (admissionBoot) env.DSH_HARMONY_WORKSPACE_ADMISSION = '1'
if (encryptedAdmission) env.DSH_HARMONY_WORKSPACE_ADMISSION_CIPHER = '1'
if (emulatorDevflow) env.DSH_HARMONY_WORKSPACE_DEVFLOW = emulatorDevflow.stage
if (graph) env.DSH_HARMONY_WORKSPACE_GRAPH = '1'
if (panel) env.DSH_HARMONY_WORKSPACE_PANEL = '@deepseek-ai/dsh-experimental-cot-translation-bundle'
if (panelList) env.DSH_HARMONY_WORKSPACE_PANEL_LIST = '1'
if (measurement) env.DSH_HARMONY_WORKSPACE_LINK = process.argv[2] === '--slow' || cache ? 'slow' : 'baseline'
if (cache) env.DSH_HARMONY_WORKSPACE_CACHE = '1'
const report = join(world, 'vitest.json')
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native',
  '--config', config, '--reporter=default', '--reporter=json', '--outputFile=' + report], {
  cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes; if (emulator || creationEmulator) process.stdout.write(bytes) })
const result = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) })
await writeFile(join(world, 'test.log'), log)
const tests = JSON.parse(await readFile(report, 'utf8'))
const unchanged = JSON.stringify(before) === JSON.stringify(await hashes())
const passed = result.code === 0 && result.signal === null && tests.numFailedTests === 0 && tests.numPassedTests > 0 && unchanged
const observed = passed ? JSON.parse(await readFile(join(world, 'observed.json'), 'utf8')) : null
if (passed && access) {
  observed.encrypted = JSON.parse(await readFile(join(world, 'encrypted.json'), 'utf8'))
  observed.scopeBatching = JSON.parse(await readFile(join(world, 'scope-batching.json'), 'utf8'))
}
const evidence = { ...result, passed, tests: { passed: tests.numPassedTests, failed: tests.numFailedTests }, archiveManager, compactSettings,
  world, report, packageUnchanged: unchanged, packageSha256: before, navigation, archivePackage, emulatorDevflow, deviceBuild, observed,
  unsupported: creationEmulator ? ['real encrypted carrier', 'physical phone', 'installed daily profile', 'real models'] : creation ? ['installed desktop', 'native phone execution', 'real models']
    : emulator ? ['physical phone', 'encrypted relay', 'native IME occlusion', 'performance and memory', 'owner-only interactions and Fetch routes']
    : access ? ['ArkWeb', 'physical phone', 'public relay', 'hot module replacement', 'owner-only interactions and Fetch routes']
      : deviceCommand && !commandClaim && !deviceCommandUi ? ['ArkWeb', 'physical phone', 'public relay and TLS', 'native app automatic reconnect', 'installed daily profile', 'real models']
        : ['ArkWeb', 'physical phone', 'encrypted relay', ...(graph ? [] : ['hot module replacement']), 'owner-only interactions and Fetch routes'] }
await mkdir('evidence', { recursive: true })
const evidenceFile = 'evidence/' + (deviceCommandUi ? 'workspace-device-command-ui-' : commandClaim ? 'workspace-command-claim-' : deviceCommand ? 'workspace-device-command-' : emulator ? 'workspace-emulator-' : creation ? 'session-creation-' : wire ? 'workspace-wire-' : accessArchiveManager ? 'workspace-access-archive-manager-' : accessDevflow ? 'workspace-access-devflow-' : access ? 'workspace-access-' : richSource ? 'workspace-rich-seam-' : rich ? 'workspace-rich-' : graph ? 'workspace-graph-' : panel || panelList ? 'workspace-panel-' : workflowRun ? 'workspace-devflow-run-' : candidate ? 'workspace-devflow-candidate-' : devflow ? 'workspace-devflow-' : 'workspace-prototype-') + Date.now() + '.json'
await writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, passed, world, report, evidence: evidenceFile }))
if (!passed) console.error(log.slice(-14000))
process.exitCode = passed ? 0 : 1

/** Run the shipped Web shell over an isolated desktop-named test profile and the immutable candidate. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { controlsTestResult } from './controls-test-result.mjs'

if (process.argv.length !== 2) throw new Error('This offline shell check accepts no overrides')
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const artifact = JSON.parse(await readFile('evidence/rc2-controls-artifacts-0.0.0-rc2.16.json', 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(await readFile(artifact.artifact.path)), artifact.artifact.sha256)
for (const file of artifact.files) assert.equal(hash(await readFile(join(artifact.stage, file.path.replace(/^package\//, '')))), file.sha256)
const world = await mkdtemp(resolve('.build/control-panel-shell-rc216-')), tmp = join(world, 'tmp'); await mkdir(tmp)
const candidate = join(world, 'candidate')
await cp(artifact.stage, candidate, { recursive: true, errorOnExist: true })
const richLink = join(candidate, 'node_modules/@deepseek-ai/dsh-experimental-rich-inline')
await mkdir(join(candidate, 'node_modules/@deepseek-ai'), { recursive: true })
await symlink(join(root, 'packages/experimental/rich-inline'), richLink, 'junction')
for (const file of artifact.files) assert.equal(hash(await readFile(join(candidate, file.path.replace(/^package\//, '')))), file.sha256)
const ts = require('typescript'), helper = join(world, 'vitest-shared.mjs')
await writeFile(helper, ts.transpileModule(await readFile(join(root, 'vitest.shared.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true }, fileName: join(root, 'vitest.shared.ts') }).outputText)
const scaffold = join(root, 'apps/web/tests/scaffold.ts'), scaffoldSource = await readFile(scaffold, 'utf8')
assert.equal(scaffoldSource.split("name: 'scaffold'").length - 1, 2)
assert.equal(scaffoldSource.split("join(harnessHome, 'profiles', 'scaffold')").length - 1, 1)
const config = join(world, 'config.mjs'), report = join(world, 'vitest.json')
await writeFile(config, `import {projectionAliases} from ${JSON.stringify(pathToFileURL(resolve('scripts/projection-source.mjs')).href)};
import {standardDecoratorPlugin,vitestExecArgv} from ${JSON.stringify(pathToFileURL(helper).href)};
const selectProfile={name:'isolated-desktop-profile',enforce:'pre',transform(code,id){if(id.split('?')[0].split(String.fromCharCode(92)).join('/')!==${JSON.stringify(scaffold.split(String.fromCharCode(92)).join('/'))})return;return code.replaceAll("name: 'scaffold'","name: 'desktop'").replace("join(harnessHome, 'profiles', 'scaffold')","join(harnessHome, 'profiles', 'desktop')");}};
export default {root:${JSON.stringify(root)},cacheDir:${JSON.stringify(join(world, 'cache'))},resolve:{alias:await projectionAliases(${JSON.stringify(project)},${JSON.stringify(root)})},plugins:[selectProfile,standardDecoratorPlugin()],test:{name:'harmony-control-panel-shell',environment:'node',pool:'forks',execArgv:vitestExecArgv,include:['clients/harmony-mobile/integration/control-panel-shell.spec.ts'],maxWorkers:1,fileParallelism:false,bail:1,testTimeout:30000,hookTimeout:120000,teardownTimeout:30000}};
`)
const overlay = join(world, 'offline.overlay.yml')
await writeFile(overlay, `- id: desktop-product-telemetry
  disabled: true
- id: product-analytics
  disabled: true
- id: deepseek-account
  config:
    desktopPlatform: null
- insert:
    - id: shell-fixture-rich-inline
      name: '@deepseek-ai/dsh-experimental-rich-inline'
      config:
        activePresets: []
        maxAutoRepairAttempts: 0
        maxFormatRepairAttempts: 0
`)
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: tmp, TMP: tmp, DSH_HOME: join(world, 'home'), DSH_AGENTS_HOME: join(world, 'agents'), DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_TELEMETRY_DISABLED: '1', DSH_HARMONY_SHELL_WORLD: world, DSH_HARMONY_SHELL_STAGE: candidate, DSH_HARMONY_SHELL_OVERLAY: overlay, DSH_HARMONY_SOURCE_ROOT: root, DSH_TEST_CHROMIUM_EXECUTABLE_PATH: 'C:/Program Files/Google/Chrome/Application/chrome.exe', NO_COLOR: '1' })
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', config, '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = '', timedOut = false, spawnError = null
const redact = value => value.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[temporary-test-token]')
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes; for (const line of bytes.toString().split('\n')) if (line.startsWith('shell-check:')) console.log(redact(line)) })
const timer = setTimeout(() => { timedOut = true; child.kill() }, 300000)
const termination = await new Promise(accept => { child.once('error', error => { spawnError = error.code ?? 'spawn-failed' }); child.once('close', (code, signal) => accept({ code, signal, timedOut, spawnError })) }).finally(() => clearTimeout(timer))
await writeFile(join(world, 'test.log'), redact(log))
try { const raw = await readFile(report, 'utf8'); await writeFile(report, redact(raw)) } catch (error) { if (error.code !== 'ENOENT') throw error }
const result = await controlsTestResult(termination, report)
result.success &&= result.passed === 6
const observations = JSON.parse(await readFile(join(world, 'observed.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error }))
const findings = observations.observed?.filter(row => row.qualified === false) ?? []
const qualified = result.success && findings.length === 0
const builtFiles = ['apps/web/dist/index.html', 'packages/boot/app-boot/lib/index.js', 'packages/api/session-controller/lib/index.js', 'packages/client/ui-conversation/lib/client.js', 'packages/client/ui-user-questions/lib/client.js', 'packages/experimental/rich-inline/lib/client.js']
const builtInputs = await Promise.all(builtFiles.map(async path => ({ path, sha256: hash(await readFile(join(root, path))) })))
const evidence = 'evidence/control-panel-shell-rc216-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify({ at: new Date().toISOString(), ...result, expectedChecks: 6, completeDshShellQualified: qualified, findings, world, artifact: artifact.artifact, builtInputs, hostCommand: { implementation: 'desktop-plugin/src/device-binding-command.ts', identityProtection: 'fixed public fixture keys; unprotect substitute', confirmation: 'actual rich-inline client and normal Remote answerer' }, scaffold: { path: scaffold, sha256: hash(scaffoldSource), fixtureChanges: ['temporary profile name and directory: scaffold to desktop', 'candidate copy with a rich-inline dependency junction; all 108 package files retain their recorded hashes'] }, installed: false, physicalDeviceIo: false, realPairingAccess: false, realModels: 0 }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, completeDshShellQualified: qualified, findings, evidence, world })); if (!result.success) console.error(redact(log).slice(-12000)); process.exitCode = qualified ? 0 : 1

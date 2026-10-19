/** Sole local acceptance entry: all current client tests, fixed replay and bounded Chrome fixtures; no installation or live dispatch. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, readdir, copyFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const project = resolve('.'), source = JSON.parse(await readFile('source.json', 'utf8'))
const label = process.argv.includes('--baseline') ? 'baseline' : 'final'
await mkdir('.build', { recursive: true }); await mkdir('evidence', { recursive: true })
const world = await mkdtemp(join(project, '.build/regression-' + label + '-'))
const output = join(project, 'evidence', 'regression-' + label + '-' + world.split(/[\\/]/).at(-1)); await mkdir(output)
const env = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1' }
const prior = new Map(), checks = []
for (const name of await readdir('evidence')) if (!(await stat(join('evidence', name))).isDirectory()) prior.set(name, await readFile(join('evidence', name)))
const run = async (name, exe, args, options = {}) => {
  console.log('RUN: ' + name)
  const child = spawn(exe, args, { cwd: options.cwd ?? project, env: { ...env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let log = '', exceeded = false, timedOut = false
  const append = chunk => { if (Buffer.byteLength(log) + chunk.length > 2097152) { exceeded = true; child.kill(); return }; log += chunk.toString('utf8') }
  child.stdout.on('data', append); child.stderr.on('data', append)
  const timer = setTimeout(() => { timedOut = true; child.kill() }, 180000)
  let code
  try { code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }) } finally { clearTimeout(timer) }
  await writeFile(join(output, name + '.txt'), log.replace(/\r\n/g, '\n').trimEnd() + '\n')
  checks.push({ name, command: [exe, ...args], result: code === 0 && !exceeded && !timedOut ? 'pass' : 'fail', exitCode: code, timedOut, exceeded })
  if (code !== 0 || exceeded || timedOut) { process.stderr.write(log.slice(-16000)); throw new Error('Regression failed: ' + name) }
  console.log('PASS: ' + name)
  return log
}
let failure = null, result
const frozenInputs = {}
const collect = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { if (path.replaceAll('\\', '/').endsWith('/ets/generated')) continue; await collect(path); continue }
    frozenInputs[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
}
for (const directory of ['src', 'tests', 'integration', 'network-tests', 'native-network-tests', 'scripts']) await collect(directory)
await collect('harmony/entry/src/main/ets')
for (const path of ['AGENTS.md', 'package.json', 'source.json', 'harmony/platform.json', 'harmony/entry/src/main/module.json5']) frozenInputs[path] = createHash('sha256').update(await readFile(path)).digest('hex')
await writeFile(join(output, 'frozen-inputs.json'), JSON.stringify(frozenInputs, null, 2) + '\n')
try {
  await run('continuity-archives', 'pwsh', ['-NoProfile', '-File', join(project, 'scripts/audit-continuity.ps1')])
  await run('inventory', process.execPath, ['scripts/test-inventory.mjs'])
  const inventory = JSON.parse(await readFile('evidence/test-inventory.json', 'utf8')); await copyFile('evidence/test-inventory.json', join(output, 'test-inventory.json'))
  await run('strict', process.execPath, ['scripts/check.mjs', '--integration'])
  await run('assets', process.execPath, ['scripts/assets.mjs'])
  await run('phase5-assets', process.execPath, ['scripts/phase5-assets.mjs'])
  await run('native-adapters', process.execPath, ['scripts/native-adapter-build.mjs'])
  const node = await run('node', process.execPath, ['--test', '--test-reporter=tap', ...inventory.files.filter(file => file.layer === 'node').map(file => file.path)])
  if (!node.includes('# pass ' + inventory.counts.node) || !node.includes('# fail 0') || !node.includes('# skipped 0') || !node.includes('# cancelled 0')) throw new Error('Node inventory/report count differs')
  for (const [name, directory, layer] of [['source-replay', 'integration', 'source-replay'], ['bff-replay', 'network-tests', 'bff-replay']]) {
    const stageWorld = join(world, name); await mkdir(stageWorld)
    const report = join(output, name + '.json')
    await run(name, process.execPath, [join(source.dshRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, directory, 'vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: source.dshRoot, env: { DSH_HARMONY_INTEGRATION_WORLD: stageWorld } })
    const data = JSON.parse(await readFile(report, 'utf8'))
    await writeFile(report, JSON.stringify(data, null, 2) + '\n')
    if (!data.success || data.numPassedTests !== inventory.counts[layer] || data.numPendingTests !== 0) throw new Error('Vitest inventory/report count differs')
  }
  await run('inert-native-preview', process.execPath, ['scripts/phase5-native-preview.mjs'])
  await run('native-preflight', 'pwsh', ['-NoProfile', '-File', join(project, 'scripts/native-preflight.ps1')])
  await run('native-handoff', process.execPath, ['scripts/native-handoff-check.mjs'])
  await run('memory-demo', process.execPath, ['scripts/demo-link.mjs'])
  await run('legacy-chrome', process.execPath, ['scripts/browser-check.mjs'])
  if (inventory.files.some(file => file.path === 'network-tests/phase6.spec.ts')) await run('phase6-chrome', process.execPath, ['scripts/phase6-browser.mjs'])
  await run('native-offline-chrome', process.execPath, ['scripts/native-runtime-browser.mjs'])
  const guard = JSON.parse(await readFile('evidence/phase3-guard.json', 'utf8'))
  const network = await Promise.all(['phase4-network.json', 'phase5-network.json'].map(async file => JSON.parse(await readFile(join('evidence', file), 'utf8'))))
  if (guard.beforeFifthCallProbe.realCalls !== 0 || guard.beforeFifthCallProbe.replay[0].calls !== 4 || guard.afterFifthCallProbe.realCalls !== 0 || !guard.fifthCallRefused || guard.uploadExtensionCalls !== 0 || network.some(row => row.counts.realCalls !== 0 || row.modelRequests !== 4 || row.uploadExtensionCalls !== 0 || !row.listenerClosed || row.metrics.active !== 0)) throw new Error('Replay safety or teardown evidence failed')
  const chrome = JSON.parse(await readFile('evidence/browser-results.json', 'utf8'))
  const nativeChrome = JSON.parse(await readFile('evidence/phase9-browser.json', 'utf8'))
  if (!nativeChrome.passed || nativeChrome.realModelCalls !== 0 || nativeChrome.uploadCalls !== 0 || nativeChrome.externalRequests !== 0 || nativeChrome.arkWebQualified !== false) throw new Error('Native offline substitute/Chrome evidence failed')
  const phase6 = inventory.files.some(file => file.path === 'network-tests/phase6.spec.ts')
  let read, shared
  if (phase6) {
    read = JSON.parse(await readFile('evidence/phase6-network.json', 'utf8')); shared = JSON.parse(await readFile('evidence/phase6-browser.json', 'utf8'))
    if (!read.passed || read.modelRequests !== 0 || read.realModelCalls !== 0 || read.uploadCalls !== 0 || read.replayBudget !== 4 || !read.listenerClosed || read.metrics.active !== 0 || Object.values(read.resourceCounts).some(value => value !== 0) || !shared.passed || shared.realModelCalls !== 0 || shared.uploadCalls !== 0 || shared.comparisons.length !== 3) throw new Error('Read-only or shared Chrome acceptance evidence failed')
  }
  for (const [path, expected] of Object.entries(frozenInputs)) if (createHash('sha256').update(await readFile(path)).digest('hex') !== expected) throw new Error('Acceptance input changed during run: ' + path)
  await copyFile('.build/source-hashes.json', join(output, 'source-hashes.json'))
  result = { passed: true, label, generatedAt: new Date().toISOString(), output, checks, counts: inventory.counts, frozenInputs: 'frozen-inputs.json', inputsUnchangedDuringRun: true, retiredCases: inventory.retirements, previousCasesLost: 0, fixedResponsesPerExecutionContext: 4, readOnlyContextModelRequests: read?.modelRequests, realModelCalls: 0, uploadCalls: 0, sourceFifthCallRefused: true, loopbackListenersClosed: true, legacyChromeAssertions: chrome.assertions.length, phase5ChromeAssertions: network[1].phone.assertions.length, sharedMobileDesktopChromeAssertions: shared?.assertions.length, nativeOfflineSubstituteChromeAssertions: nativeChrome.assertions.length, arkTsCompiled: false, arkWebQualified: false, deviceQualified: false, supportedDshProfileQualified: false }
} catch (error) { failure = error; result = { passed: false, label, output, checks, error: error.message } }
finally {
  for (const name of await readdir('evidence')) {
    const path = join('evidence', name), info = await stat(path)
    if (info.isDirectory()) continue
    const bytes = await readFile(path), old = prior.get(name)
    if (old === undefined || !bytes.equals(old) || /^(phase[34569]-(network|guard|browser|native-preflight)|native-source-handoff|browser-results)/.test(name)) await writeFile(join(output, name), bytes)
    if (old !== undefined && !bytes.equals(old) && name !== 'test-inventory.json' && !name.startsWith('phase7-') && !name.startsWith('regression-')) await writeFile(path, old)
  }
  await writeFile(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n')
  await writeFile('evidence/regression-' + label + '.json', JSON.stringify(result, null, 2) + '\n')
}
if (failure !== null) throw failure
console.log('PASS: complete current client regression; ' + JSON.stringify(result.counts) + '; real/upload zero; old evidence retained')

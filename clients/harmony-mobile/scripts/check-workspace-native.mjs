/** Record actual ETS ownership/page regressions against synthetic SDK ports; no ArkWeb or device execution is claimed. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const run = promisify(execFile)
const sourceFiles = ['NativeWebRenderer', 'NativeWorkspaceProduct', 'NativeWorkspaceOwner', 'NativeWorkspaceCache', 'NativeWorkspaceRich', 'NativeWorkspaceRichGuest', 'WorkspaceSurface', 'WorkspaceRichSurface'].map(name => 'harmony/entry/src/main/ets/product/' + name + '.ets')
sourceFiles.push('harmony/entry/src/main/ets/pages/Index.ets', 'harmony/entry/src/main/resources/base/element/string.json', 'product.config.json', 'harmony/entry/src/main/ets/product/ProductCore.js', 'harmony/entry/src/main/ets/generated/NativeAssetIndex.ets')
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
const before = await hashes(), stamp = Date.now()
await run(process.execPath, ['scripts/product-native-substitute.mjs'], { windowsHide: true })
const args = ['--test', 'tests/workspace-native.test.mjs', 'tests/workspace-rich-native.test.mjs', 'tests/mvp-page.test.mjs', 'tests/product-layout.test.mjs']
let output = '', exitCode = 0
try { output = (await run(process.execPath, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout }
catch (error) { output = error.stdout + error.stderr; exitCode = error.code }
const count = key => Number(new RegExp('^# ' + key + ' ([0-9]+)$', 'm').exec(output)?.[1] ?? NaN)
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(await hashes())
const passed = exitCode === 0 && count('fail') === 0 && count('pass') > 0 && sourceUnchanged
const evidence = 'evidence/workspace-native-' + stamp + '.json', log = '.build/workspace-native-' + stamp + '.log'
await writeFile(log, output, { flag: 'wx' })
await writeFile(evidence, JSON.stringify({ passed, tests: { passed: count('pass'), failed: count('fail') }, command: [process.execPath, ...args], log,
  sourceUnchanged, sourceSha256: before, sdkSubstitute: true, arkWebExecuted: false, installed: false, models: 0 }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed, evidence, log, tests: count('tests') })); if (!passed) { console.error(output.slice(-5000)); process.exitCode = 1 }

/** Built artifact ESM and NodeNext consumer checks; no package-manager install or live activation. */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, mkdtemp, symlink } from 'node:fs/promises'
import { resolve, join, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), ts = require('typescript')
const stage = resolve('.build/phase32-package/package'), pkg = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'))
const aliases = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile).config.compilerOptions.paths
const runtimeLinks = join(dirname(stage), 'node_modules/@deepseek-ai'); await mkdir(runtimeLinks, { recursive: true })
for (const [name, expectedVersion] of Object.entries(pkg.peerDependencies)) {
  let directory = name === '@deepseek-ai/dsh' ? join(root, 'apps/cli') : resolve(root, aliases[name][0])
  while (true) {
    assert.ok(!relative(root, directory).startsWith('..'))
    try { const data = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); if (data.name === name) { assert.equal(data.version, expectedVersion); break } }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
    directory = dirname(directory)
  }
  const link = join(runtimeLinks, name.slice('@deepseek-ai/'.length))
  try { await symlink(directory, link, 'junction') }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error }
}
const entry = await import(pathToFileURL(join(stage, 'lib/index.js')).href)
assert.equal(entry.name, pkg.name); assert.equal(entry.version, pkg.version)
const calls = []
await entry.apply(new Proxy({}, { get(_target, key) { calls.push(String(key)); throw new Error('Disabled plugin touched Context') } }), {})
assert.equal(calls.length, 0)
assert.equal(entry.resolveOptions({}, () => 1000).enabled, false)
assert.throws(() => entry.resolveOptions({ enabled: true }, () => 1000))
const consumer = await mkdtemp(join(project, '.build/phase32-consumer-'))
await mkdir(join(consumer, 'node_modules/@deepseek-ai'), { recursive: true })
await symlink(stage, join(consumer, 'node_modules/@deepseek-ai/dsh-experimental-harmony-mobile'), 'junction')
await writeFile(join(consumer, 'package.json'), '{"type":"module"}\n')
const file = join(consumer, 'consumer.ts')
await writeFile(file, "import { resolveOptions, type Options, type Spec } from '@deepseek-ai/dsh-experimental-harmony-mobile';\nimport { ProfilePeerAdmission, type AuthenticatedDeviceProvider } from '@deepseek-ai/dsh-experimental-harmony-mobile/admission';\nimport { invokeProfile, followProfile } from '@deepseek-ai/dsh-experimental-harmony-mobile/transport';\nconst request: Options = {};\nconst spec: Spec = resolveOptions(request, Date.now);\nconst enabled: boolean = spec.enabled;\nvoid enabled; void ProfilePeerAdmission; void invokeProfile; void followProfile;\nexport type Provider = AuthenticatedDeviceProvider;\n")
const program = ts.createProgram({ rootNames: [file], options: { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: ['node'], typeRoots: [join(root, 'node_modules/@types')], skipLibCheck: false } })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => consumer, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
await writeFile('evidence/phase32-built-smoke.json', JSON.stringify({ passed: true, package: pkg.name, version: pkg.version, esmImport: true, disabledContextTouches: calls.length, nodeNext: true, sourcePathsUsed: false, installedByPackageManager: false, activated: false, models: 0, uploads: 0, listenerOpened: false }, null, 2) + '\n')
console.log('PASS: built ESM imports; disabled Context untouched; NodeNext consumer without source aliases')

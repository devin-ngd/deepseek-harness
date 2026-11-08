/** Overlay the rebuilt device entries onto the complete standard package. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const read = async file => JSON.parse(await readFile(file, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hash = async path => sha(await readFile(path))
const tar = (args) => promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), args, { windowsHide: true, timeout: 30000 })
const recovery = process.argv[2] === '--panel-recovery'
const reportPath = recovery ? process.argv[3] ?? 'evidence/workspace-desktop-panel-recovery-candidate.json'
  : process.argv[2] ?? 'evidence/workspace-desktop-command-complete-validation.json'
assert.ok(process.argv.length <= (recovery ? 4 : 3) && /^evidence\/workspace-desktop-[\w-]+\.json$/.test(reportPath))
const buildPath = 'evidence/workspace-desktop-build.json', build = await read(buildPath)
assert.match(relative(resolve('.build'), build.stage).replaceAll('\\', '/'), /^workspace-desktop-[\w-]+\/package$/)
assert.equal(build.typeDiagnostics, 0); assert.equal(build.defaultDisabled, true); assert.equal(build.installed, false)
assert.ok(build.sourceInputs.some(input => input.path === resolve('src/e2e-channel.ts')))
for (const input of build.sourceInputs) assert.equal(await hash(input.path), input.sha256, input.path)
const name = '@deepseek-ai/dsh-experimental-harmony-mobile'
let baseline, original
if (recovery) {
  const previous = await read('evidence/workspace-desktop-revocation-candidate.json')
  assert.equal(await hash(previous.path), previous.sha256)
  const sealed = await read(previous.path), field = await read('evidence/workspace-desktop-field-rc253-installed.json')
  assert.equal(sealed.passed, true)
  assert.equal(sealed.name, name)
  assert.equal(sealed.sha256, field.archiveSha256)
  assert.equal(sealed.deviceEntrySha256, field.deviceEntrySha256)
  assert.equal(sealed.inventory.length, field.packageFilesVerified[sealed.name])
  baseline = sealed
  original = sealed.archive
} else {
  const pointer = await read('evidence/workspace-review-bundle.json')
  const manifest = await read(join(pointer.destination, 'manifest.json'))
  baseline = manifest.artifacts.find(row => row.name === name); assert.ok(baseline)
  original = join(pointer.destination, baseline.file)
}
assert.equal(await hash(original), baseline.sha256)
const extract = async (archive, root) => {
  const { stdout } = await tar(['-tzf', archive])
  const files = stdout.trim().split(/\r?\n/)
  assert.ok(files.every(name => name.startsWith('package/') && !name.split('/').includes('..') && !name.includes('\\')))
  await tar(['-xzf', archive, '-C', root])
  return join(root, 'package')
}
const inventory = async directory => {
  const files = []
  const visit = async (path, prefix) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name), name = prefix + entry.name
      if (entry.isDirectory()) await visit(full, name + '/')
      else { assert.ok(entry.isFile(), name); files.push({ path: name, sha256: await hash(full) }) }
    }
  }
  await visit(directory, '')
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
const world = await mkdtemp(resolve('.build/workspace-desktop-complete-'))
const stage = await extract(original, world)
const baselineFiles = baseline.inventory.toSorted((a, b) => a.path.localeCompare(b.path))
assert.deepEqual(await inventory(stage), baselineFiles)
const entries = recovery ? [
  'lib/device.js', 'lib/client.js', 'lib/client.js.map',
  'lib/client-types/desktop-plugin/client/control-model.d.ts', 'lib/client-types/desktop-plugin/client/feedback.d.ts',
  'lib/types/desktop-plugin/src/workspace-access.d.ts',
] : ['device', 'paired-provider', 'pairing', 'product', 'relay-lifecycle'].map(name => `lib/${name}.js`)
const sources = recovery ? ['src/device-binding-command.ts', 'src/workspace-access.ts']
  : ['src/device-binding-command.ts', 'src/device-binding-relay.ts', 'src/workspace-access.ts', 'src/workspace-channel.ts']
const docs = ['README.md', 'README.zh.md', 'README.i18n.yaml']
const changed = [...entries, ...sources, ...docs, 'build-info.json'].sort()
for (const file of entries) {
  if (recovery && file.startsWith('lib/client')) assert.equal(await hash(join(build.stage, file)), build.client.files.find(row => row.path === file)?.sha256, file)
  await copyFile(join(build.stage, file), join(stage, file))
}
for (const file of [...sources, ...docs]) await copyFile(join('desktop-plugin', file), join(stage, file))
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ schema: 'harmony-workspace-offline-build/1', sourceInputs: build.sourceInputs, runtimeQualified: false, baselineSha256: baseline.sha256, rebuiltEntries: entries }, null, 2) + '\n')
const files = await inventory(stage)
assert.deepEqual(files.map(row => row.path), baselineFiles.map(row => row.path))
assert.deepEqual(files.filter((row, index) => row.sha256 !== baselineFiles[index].sha256).map(row => row.path).sort(), changed)
const pkg = await read(join(stage, 'package.json'))
const destination = await mkdtemp(resolve('evidence/workspace-desktop-complete-'))
const archive = join(destination, `harmony-mobile-${pkg.version}-workspace-${recovery ? 'panel-recovery' : 'command'}-candidate.tgz`)
await tar(['-czf', archive, '-C', world, 'package'])
const check = await extract(archive, await mkdtemp(resolve('.build/workspace-desktop-complete-check-')))
assert.deepEqual(await inventory(check), files)
await copyFile(buildPath, join(destination, 'build.json'))
const path = join(destination, 'validation.json')
await writeFile(path, JSON.stringify({ passed: true, archive, sha256: await hash(archive), name: pkg.name, version: pkg.version, inventory: files, changed,
  baselineSha256: baseline.sha256, deviceEntrySha256: files.find(row => row.path === 'lib/device.js').sha256, installed: false }, null, 2) + '\n', { flag: 'wx' })
await writeFile(reportPath, JSON.stringify({ path, sha256: await hash(path) }, null, 2) + '\n', recovery && process.argv[3] ? { flag: 'wx' } : undefined)
console.log(JSON.stringify({ archive, files: files.length, changed }))

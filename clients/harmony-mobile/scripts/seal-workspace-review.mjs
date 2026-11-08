/** Seal ordinary npm-format candidate archives and an unsigned HAP for review; no install, signing, activation or publication. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { readFile, writeFile, readdir, mkdir, mkdtemp, cp } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const run = promisify(execFile), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const desktop = await json('evidence/workspace-desktop-build.json'), rich = await json('evidence/workspace-rich-build.json')
for (const item of desktop.sourceInputs) assert.equal(sha(await readFile(item.path)), item.sha256, item.path)
for (const [path, hash] of Object.entries(rich.sourceInputs)) assert.equal(sha(await readFile(path)), hash, path)
const nativeFiles = (await readdir('evidence/native-build')).filter(path => path.endsWith('.json')).sort().reverse()
let nativePath, native
for (const file of nativeFiles) {
  const value = await json(join('evidence/native-build', file))
  if (value.cwd === resolve('.build/native-offline-product-project') && value.exitCode === 0) { nativePath = join('evidence/native-build', file); native = value; break }
}
assert.ok(native?.artifact?.type === 'unsigned HAP')
assert.equal(sha(await readFile(native.artifact.path)), native.artifact.sha256)
// Build records use the compile copy; match every app entry file against its owning source before sealing it.
const nativeHashes = native.sourceHashes ?? native.sourceSha256
assert.ok(nativeHashes, 'Native build must record source hashes')
for (const [path, hash] of Object.entries(nativeHashes)) {
  const relative = path.replaceAll('\\', '/').split('/native-offline-product-project/')[1]
  if (relative?.startsWith('entry/src/')) assert.equal(sha(await readFile(join('harmony', relative))), hash, relative)
}
const parent = resolve('handoff/standard-plugin-workspace'); await mkdir(parent, { recursive: true })
const destination = await mkdtemp(join(parent, 'review-')), staging = await mkdtemp(resolve('.build/workspace-review-'))
const tar = join(process.env.SystemRoot, 'System32/tar.exe'), artifacts = []
const files = async directory => {
  const result = []
  const visit = async (path, prefix) => { for (const entry of await readdir(path, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Review archives contain regular files only')
    const name = prefix + entry.name
    if (entry.isDirectory()) await visit(join(path, entry.name), name + '/')
    else { assert.ok(entry.isFile()); result.push({ path: name, sha256: sha(await readFile(join(path, entry.name))) }) }
  } }
  await visit(directory, ''); return result.sort((a, b) => a.path.localeCompare(b.path))
}
for (const item of [
  { id: 'harmony-mobile', source: desktop.stage, metadata: resolve('desktop-plugin') },
  { id: 'rich-inline', source: rich.stage, metadata: resolve('.build/workspace-core-checkout/packages/experimental/rich-inline') },
  { id: 'devflow', source: resolve('.build/workspace-devflow-checkout/dsh-devflow'), metadata: resolve('.build/workspace-devflow-checkout/dsh-devflow') },
]) {
  const stage = join(staging, item.id, 'package'); await mkdir(stage, { recursive: true })
  const manifest = await json(join(item.source, 'package.json')), original = JSON.stringify(manifest)
  const require = createRequire(join(item.metadata, 'package.json'))
  for (const section of ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (!version.startsWith('workspace:')) continue
      const protocol = version.slice(10); assert.ok(['*', '~', '^'].includes(protocol))
      const local = await json(require.resolve(name + '/package.json'))
      manifest[section][name] = (protocol === '*' ? '' : protocol) + local.version
    }
  }
  for (const directory of ['lib', 'locale', 'docs', 'src']) {
    const source = join(directory === 'lib' ? item.source : item.metadata, directory)
    try { await cp(source, join(stage, directory), { recursive: true, dereference: false, filter: file => !file.split(/[\\/]/).includes('node_modules') }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const file of ['cordis.patch.yml', 'README.md', 'README.zh.md', 'README.i18n.yaml', 'LICENSE']) {
    try { await cp(join(item.metadata, file), join(stage, file)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (item.id === 'harmony-mobile') {
    for (const file of ['pairing.enabled.example.json', 'test-session.enabled.example.json', 'device.enabled.example.json']) await cp(join(item.metadata, file), join(stage, file))
    await cp(join(root, 'apps/web/dist'), join(stage, 'workspace-shell'), { recursive: true, dereference: false })
    await writeFile(join(stage, 'workspace.enabled.example.json'), JSON.stringify({ workspace: { ttlMs: 1800000,
      channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
      wire: { maxChunkBytes: 65536, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: 2097152 },
      shell: { distIndex: '<absolute installed package path>/workspace-shell/index.html', limits: { maxFiles: 2000, maxFileBytes: 16777216, maxTotalBytes: 134217728 } },
    } }, null, 2) + '\n')
    manifest.files = [...new Set([...manifest.files, 'workspace-shell', 'workspace.enabled.example.json'])]
    await writeFile(join(stage, 'build-info.json'), JSON.stringify({ schema: 'harmony-workspace-offline-build/1', sourceInputs: desktop.sourceInputs, runtimeQualified: false }, null, 2) + '\n')
  }
  if (!(await readdir(stage)).includes('LICENSE')) await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'))
  await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  assert.ok(!JSON.stringify(manifest).includes('workspace:'), 'No monorepo-only dependency ranges in npm archives')
  const inventory = await files(stage), name = item.id + '-' + manifest.version + '-candidate.tgz'
  await run(tar, ['-czf', join(destination, name), '-C', dirname(stage), 'package'], { windowsHide: true })
  const listed = (await run(tar, ['-tzf', join(destination, name)], { windowsHide: true })).stdout.split(/\r?\n/).filter(Boolean)
  assert.ok(listed.every(path => path === 'package/' || path.startsWith('package/') && !path.split('/').includes('..')))
  const unpacked = await mkdtemp(join(staging, 'unpack-'))
  await run(tar, ['-xzf', join(destination, name), '-C', unpacked], { windowsHide: true })
  assert.deepEqual(await files(join(unpacked, 'package')), inventory)
  const bytes = await readFile(join(destination, name))
  artifacts.push({ file: name, name: manifest.name, version: manifest.version, bytes: bytes.byteLength, sha256: sha(bytes),
    sourceManifestSha256: sha(original), normalizedWorkspaceRanges: true, inventory, unpackedFilesMatch: true })
}
const hap = await readFile(native.artifact.path), hapName = 'harmony-workspace-offline-unsigned.hap'
await writeFile(join(destination, hapName), hap, { flag: 'wx' }); artifacts.push({ file: hapName, bytes: hap.byteLength, sha256: sha(hap), signed: false })
const sources = await json('evidence/workspace-source-candidates.json')
const evidence = ['evidence/workspace-desktop-build.json', 'evidence/workspace-rich-build.json', 'evidence/workspace-source-candidates.json', nativePath,
  'evidence/workspace-native-1793715061648.json',
  'evidence/workspace-installed-probe-1793706966530.json',
  'evidence/workspace-wire-1793699358664.json', 'evidence/workspace-access-1793700623359.json',
  'evidence/workspace-devflow-run-1793697050529.json', 'evidence/workspace-rich-1793700514411.json', 'evidence/workspace-prototype-1793700312182.json']
await mkdir(join(destination, 'evidence'))
for (const path of evidence) await cp(path, join(destination, 'evidence', path.replaceAll(/[\\/]/g, '_')))
const manifest = { schema: 'harmony-workspace-review/1', createdAt: new Date().toISOString(), artifacts,
  sourceCandidates: sources.destination, desktopRoot: root, nativeBuild: nativePath, evidence, installed: false, activated: false,
  runtimeQualified: false, versionsUnchangedFromSources: true, privateCandidates: true,
  limits: ['unsigned default-disabled product HAP; independent native acceptance uses a separate fixture app', 'no full installed profile/package activation qualification', 'no physical phone or public relay acceptance', 'no third-party fixed release execution'] }
await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-review-bundle.json', JSON.stringify({ destination, artifacts: artifacts.map(({ inventory, ...item }) => item), installed: false, runtimeQualified: false }, null, 2) + '\n')
console.log(JSON.stringify({ destination, artifacts: artifacts.length, installed: false, runtimeQualified: false }))

/** Prepare the sealed release's package and lock metadata from a detached Desktop snapshot. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, isAbsolute, join, relative, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const lab = resolve(fileURLToPath(new URL('..', import.meta.url)))
const yaml = createRequire(join(lab, '../../package.json'))('js-yaml')
const harmony = '@deepseek-ai/dsh-experimental-harmony-mobile'
const rich = '@deepseek-ai/dsh-experimental-rich-inline'
const indirect = ['@deepseek-ai/dsh-deque@0.2.1-rc.2', '@deepseek-ai/dsh-native-command@0.2.1-rc.2']
const proof = {
  path: 'evidence/workspace-desktop-lock-preflight-1794038319289.json',
  sha256: 'aeb02ab11832a54260ece85e02366902d4a0770f6466dad8f1dd3e44a67e7360',
}
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding)

function direct(lock) {
  assert.deepEqual(Object.keys(lock.importers), ['.'], 'Expected a single Desktop importer')
  return lock.importers['.'].dependencies
}

function fileRecord(lock, name) {
  const row = direct(lock)[name]
  assert.ok(row?.specifier.startsWith('file:'), name + ' must use a file archive')
  const snapshot = name + '@' + row.version
  const keys = Object.keys(lock.packages).filter(key => key.startsWith(name + '@file:') && (snapshot === key || snapshot.startsWith(key + '(')))
  assert.equal(keys.length, 1, name + ' must have one referenced file record')
  const [key] = keys
  const file = key.slice(name.length + 1)
  assert.equal(lock.packages[key].resolution.tarball, file, name + ' file record and tarball disagree')
  assert.ok(Object.hasOwn(lock.snapshots, snapshot), name + ' snapshot is missing')
  return { row, key, snapshot, file }
}

function verifyReachable(lock, expected, roots) {
  const visited = new Set()
  const packageKeys = Object.keys(expected.packages)
  function visit(key) {
    if (visited.has(key)) return
    visited.add(key)
    const snapshot = expected.snapshots[key]
    assert.ok(snapshot, 'Sealed dependency snapshot is missing: ' + key)
    assert.deepEqual(lock.snapshots[key], snapshot, 'Dependency snapshot differs from rehearsal: ' + key)
    const matches = packageKeys.filter(candidate => key === candidate || key.startsWith(candidate + '('))
    assert.equal(matches.length, 1, 'Expected one sealed dependency package for: ' + key)
    const [packageKey] = matches
    assert.deepEqual(lock.packages[packageKey], expected.packages[packageKey], 'Dependency package differs from rehearsal: ' + packageKey)
    for (const table of [snapshot.dependencies, snapshot.optionalDependencies]) {
      for (const [name, version] of Object.entries(table ?? {})) visit(name + '@' + version)
    }
  }
  for (const key of roots) visit(key)
  return visited.size
}

/** Build candidate metadata in memory, retaining unrelated records and verifying the sealed dependency closure. */
export function planWorkspaceDesktopRelease({ manifest, lock, before, after, archives, targetProfile }) {
  assert.match(targetProfile, /^[A-Za-z]:[\\/]/, 'Use an absolute drive-letter path for the target Desktop profile')
  assert.equal(lock.lockfileVersion, before.lockfileVersion, 'Desktop lockfile version differs from rehearsal')
  const nextManifest = structuredClone(manifest), nextLock = structuredClone(lock)
  const dependencies = direct(nextLock)
  const sourceOld = fileRecord(before, harmony), targetOld = fileRecord(lock, harmony)
  const sourceRich = fileRecord(after, rich), targetRich = fileRecord(lock, rich)
  for (const [name, target] of [[harmony, targetOld], [rich, targetRich]]) {
    assert.equal(manifest.dependencies[name], target.row.specifier, name + ' manifest and lock specifier disagree')
    assert.equal(win32.resolve(targetProfile, target.row.specifier.slice(5)).toLowerCase(),
      win32.resolve(targetProfile, target.file.slice(5)).toLowerCase(), name + ' manifest and lock archive paths disagree')
  }
  const replacements = new Map([[sourceOld.file, targetOld.file], [sourceRich.file, targetRich.file]])
  const candidates = archives.map(archive => {
    const { name, path, integrity } = archive
    for (const table of ['devDependencies', 'optionalDependencies']) {
      assert.ok(!Object.hasOwn(manifest[table] ?? {}, name) && !Object.hasOwn(lock.importers['.'][table] ?? {}, name), name + ' has a second direct declaration')
    }
    if (name !== harmony) assert.ok(!Object.hasOwn(dependencies, name) && !Object.hasOwn(manifest.dependencies, name), name + ' is already installed directly')
    const source = fileRecord(after, name)
    const specifier = 'file:' + path.replaceAll('\\', '/')
    assert.equal(source.row.specifier, specifier, name + ' archive path differs from rehearsal')
    assert.equal(after.packages[source.key].resolution.integrity, integrity, name + ' archive integrity differs from rehearsal')
    const file = 'file:' + win32.relative(targetProfile, path).replaceAll('\\', '/')
    assert.ok(!replacements.has(source.file), 'Duplicate source file reference')
    replacements.set(source.file, file)
    return { name, source, specifier }
  })
  const escaped = [...replacements.keys()].sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(escaped.join('|'), 'g')
  const relocateText = value => value.replace(pattern, match => replacements.get(match))
  const relocate = value => JSON.parse(relocateText(JSON.stringify(value)))
  assert.equal(targetOld.snapshot, relocateText(sourceOld.snapshot), 'Previous Harmony peer resolution differs from rehearsal')
  assert.deepEqual(lock.packages[targetOld.key], relocate(before.packages[sourceOld.key]), 'Previous Harmony package differs from rehearsal')
  assert.deepEqual(lock.snapshots[targetOld.snapshot], relocate(before.snapshots[sourceOld.snapshot]), 'Previous Harmony snapshot differs from rehearsal')
  assert.equal(targetRich.snapshot, relocateText(sourceRich.snapshot), 'Rich peer resolution differs from rehearsal')
  delete dependencies[harmony]
  delete nextLock.packages[targetOld.key]
  delete nextLock.snapshots[targetOld.snapshot]
  assert.ok(!JSON.stringify(nextLock).includes(targetOld.file), 'A retained lock record still references the previous Harmony archive')

  const expected = relocate(after)
  const roots = []
  function retainOrInsert(table, key) {
    const row = expected[table][key]
    assert.ok(row, 'Missing sealed ' + table + ' row: ' + key)
    if (Object.hasOwn(nextLock[table], key)) assert.deepEqual(nextLock[table][key], row, 'Existing ' + table + ' row differs from rehearsal: ' + key)
    else nextLock[table][key] = row
  }
  for (const { name, source, specifier } of candidates) {
    const key = relocateText(source.key), snapshot = relocateText(source.snapshot)
    dependencies[name] = { specifier, version: relocateText(source.row.version) }
    nextManifest.dependencies[name] = specifier
    retainOrInsert('packages', key)
    retainOrInsert('snapshots', snapshot)
    roots.push(snapshot)
  }
  for (const key of indirect) for (const table of ['packages', 'snapshots']) retainOrInsert(table, key)
  const snapshotsVerified = verifyReachable(nextLock, expected, roots)
  return { manifest: nextManifest, lock: nextLock, snapshotsVerified }
}

/** Load the byte-verified archives and metadata used by the isolated frozen-install rehearsal. */
export async function loadWorkspaceDesktopReleasePlanInputs() {
  async function verified({ path, sha256 }) {
    const file = await realpath(resolve(lab, path)), inside = relative(lab, file)
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Sealed inputs must stay in the lab')
    const bytes = await readFile(file)
    assert.equal(hash(bytes), sha256, 'Sealed input digest changed')
    return bytes
  }
  const report = JSON.parse(await verified(proof))
  assert.ok(report.passed && !report.dailyProfileUsed)
  const release = JSON.parse(await verified(report.release))
  const rehearsal = JSON.parse(await verified(report.rehearsal))
  const before = yaml.load(await verified({ path: join(rehearsal.world, 'archive-boundary/baseline/pnpm-lock.yaml'), sha256: report.originalLockSha256 }))
  const after = yaml.load(await verified(report.proposedMetadata[1]))
  const installed = JSON.parse(await verified(report.isolatedInstallReceipt))
  assert.equal(installed.rehearsal, true)
  const archives = await Promise.all(release.archives.map(async row => ({ name: row.name, path: await realpath(resolve(lab, row.archive.path)),
    integrity: 'sha512-' + hash(await verified(row.archive), 'sha512', 'base64') })))
  return { report, rehearsal, before, after, archives, backup: resolve(lab, installed.backup), proof, release }
}

async function main([snapshotArg, targetProfile]) {
  assert.ok(snapshotArg && targetProfile && process.argv.length === 4, 'Supply a detached snapshot directory and the absolute target profile path')
  const scratch = await realpath(join(lab, '.build'))
  const snapshot = await realpath(snapshotArg)
  assert.match(relative(scratch, snapshot), /^workspace-desktop-lock-input-[\w-]+$/, 'Use a detached snapshot in the lab')
  async function readSnapshot(name) {
    const file = join(snapshot, name)
    assert.equal(await realpath(file), file, 'The snapshot file must be local to the detached snapshot')
    return readFile(file)
  }
  const manifestBytes = await readSnapshot('package.json'), lockBytes = await readSnapshot('pnpm-lock.yaml')
  const inputs = await loadWorkspaceDesktopReleasePlanInputs()
  const plan = planWorkspaceDesktopRelease({ ...inputs, manifest: JSON.parse(manifestBytes), lock: yaml.load(lockBytes), targetProfile })
  const result = await mkdtemp(join(scratch, 'workspace-desktop-lock-plan-'))
  const plannedManifest = JSON.stringify(plan.manifest, null, 2) + '\n', plannedLock = yaml.dump(plan.lock, { noRefs: true, lineWidth: -1 })
  await writeFile(join(result, 'package.next.json'), plannedManifest, { flag: 'wx' })
  await writeFile(join(result, 'pnpm-lock.next.yaml'), plannedLock, { flag: 'wx' })
  await writeFile(join(result, 'plan.json'), JSON.stringify({ targetProfile: win32.normalize(targetProfile), release: inputs.report.release,
    snapshotsVerified: plan.snapshotsVerified, baselineManifestSha256: hash(manifestBytes), baselineLockSha256: hash(lockBytes),
    candidateManifestSha256: hash(plannedManifest), candidateLockSha256: hash(plannedLock), applied: false }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ prepared: true, plan: '.build/' + basename(result) + '/plan.json', snapshotsVerified: plan.snapshotsVerified }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))

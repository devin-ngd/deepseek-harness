/** Create and validate an exact npm tarball from the built staged package; no installation, registry access or lifecycle scripts. */
import { readFile, readdir, writeFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const stage = resolve('.build/phase32-package/package'), artifact = 'D:/Temp/dsh-experimental-harmony-mobile-0.0.0-phase32.1.tgz'
try { await access(artifact); throw new Error('Preserve existing artifact') } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
const pkg = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'))
assert.equal(pkg.name, '@deepseek-ai/dsh-experimental-harmony-mobile'); assert.equal(pkg.version, '0.0.0-phase32.1')
assert.equal(pkg.bin, undefined); assert.equal(pkg.scripts, undefined); assert.equal(pkg.private, true); assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
const patch = await readFile(join(stage, 'cordis.patch.yml'), 'utf8'); assert.match(patch, /disabled: true/); assert.match(patch, /enabled: false/)
const files = []
async function visit(directory, prefix) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false)
    if (entry.name === 'node_modules' || /\.env|credential|session\.v\d|\.hap$|\.pem$|\.key$/.test(entry.name)) throw new Error('Forbidden package file')
    const path = join(directory, entry.name), name = prefix + entry.name
    if (entry.isDirectory()) await visit(path, name + '/')
    else { assert.equal(entry.isFile(), true); const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
  }
}
await visit(stage, 'package/')
const run = args => { const result = spawnSync('C:/Windows/System32/tar.exe', args, { windowsHide: true, encoding: 'utf8', env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'D:/Temp', TMP: 'D:/Temp' } }); if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr); return result.stdout }
run(['-czf', artifact, '-C', resolve('.build/phase32-package'), 'package'])
const entries = run(['-tf', artifact]).trim().split(/\r?\n/).filter(name => !name.endsWith('/'))
assert.deepEqual([...entries].sort(), files.map(file => file.path).sort())
for (const file of files) {
  const output = spawnSync('C:/Windows/System32/tar.exe', ['-xOf', artifact, file.path], { windowsHide: true, env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'D:/Temp', TMP: 'D:/Temp' }, maxBuffer: 4194304 })
  assert.equal(output.status, 0); assert.equal(output.stdout.length, file.bytes); assert.equal(createHash('sha256').update(output.stdout).digest('hex'), file.sha256)
}
const bytes = await readFile(artifact)
const report = { artifact, package: pkg.name, version: pkg.version, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), files, verifiedEntries: files.length,
  npmTarball: true, installScripts: false, bin: false, defaultDisabledRow: true, defaultDisabledConfig: true, bundledDependency: 'zod 4.4.3 with license', externalPeers: pkg.peerDependencies, peerRuntimeCopiesBundled: false, installed: false, activated: false, installedDesktopCompatibilityVerified: false }
await writeFile('evidence/phase32-artifact.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ artifact, bytes: report.bytes, sha256: report.sha256, verifiedEntries: files.length, installed: false, activated: false }))

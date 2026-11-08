/** Associate executed offline checks with the sealed artifacts and refuse changed native/package inputs. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const pointer = await json('evidence/workspace-review-bundle.json'), manifest = await json(join(pointer.destination, 'manifest.json'))
for (const artifact of manifest.artifacts) assert.equal(sha(await readFile(join(pointer.destination, artifact.file))), artifact.sha256)
const checks = [
  ['native ownership', 'evidence/workspace-native-1793700066187.json'], ['wire', 'evidence/workspace-wire-1793699358664.json'],
  ['encrypted reconnect', 'evidence/workspace-access-1793701391927.json'], ['archived Rich actions', 'evidence/workspace-rich-1793701236047.json'],
  ['archived DevFlow workflow', 'evidence/workspace-devflow-run-1793701324945.json'], ['current native cache', 'evidence/workspace-prototype-1793701524870.json'],
]
const results = []
for (const [name, path] of checks) {
  const value = await json(path); assert.equal(value.passed, true, path)
  if (value.archivePackage !== undefined) assert.ok(manifest.artifacts.some(row => row.sha256 === value.archivePackage.sha256))
  if (name === 'encrypted reconnect') assert.equal(value.observed.encrypted.reconnectedWithFreshProof, true)
  if (value.sourceSha256 !== undefined) for (const [file, hash] of Object.entries(value.sourceSha256)) assert.equal(sha(await readFile(file)), hash, file)
  if (value.packageSha256 !== undefined) for (const [file, hash] of Object.entries(value.packageSha256)) {
    const absolute = /^[A-Za-z]:[\\/]/.test(file) ? file : join(manifest.desktopRoot, file)
    assert.equal(sha(await readFile(absolute)), hash, file)
  }
  results.push({ name, path, tests: value.tests, evidenceSha256: sha(await readFile(path)) })
}
const result = { schema: 'harmony-workspace-review-validation/1', at: new Date().toISOString(), passed: true,
  manifest: join(pointer.destination, 'manifest.json'), manifestSha256: sha(await readFile(join(pointer.destination, 'manifest.json'))),
  results, installed: false, activated: false, arkWebExecuted: false, realModelCalls: 0,
  remaining: ['installed runtime/package dependency qualification', 'emulator and physical device', 'public relay recovery and native memory', 'independent third-party fixed package', 'full doc-sync'] }
const path = join(pointer.destination, 'validation.json')
await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-review-validation.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, path, checks: results.length, installed: false }))

/** Refresh documented native inputs only after checking the previous successful unsigned build; never touches a sealed HAP. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), previous = JSON.parse(await readFile('evidence/phase69-unsigned-candidate.json', 'utf8')), build = JSON.parse(await readFile(previous.buildEvidence, 'utf8')), stage = resolve('.build/native-renewal-candidate-project'), core = JSON.parse(await readFile('evidence/phase69-core-build.json', 'utf8'))
assert.equal(hash(await readFile(previous.path)), previous.sha256)
for (const [path, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(path)), digest)
const changed = ['entry/src/main/ets/product/NativeProductOwner.ets']
for (const report of core.reports) { assert.equal(hash(await readFile(report.output)), report.sha256); changed.push(relative(resolve('harmony'), resolve(report.output))) }
for (const file of changed) await copyFile(join('harmony', file), join(stage, file))
await writeFile('evidence/phase69-documented-native-inputs.json', JSON.stringify({ at: new Date().toISOString(), previousUnsigned: previous, changed: await Promise.all(changed.map(async file => ({ file, sha256: hash(await readFile(join(stage, file))) }))), behaviorChange: false, signing: false, installation: false }, null, 2) + '\n', { flag: 'wx' }); console.log('PASS: native documentation/runtime staging; previous sealed HAP retained')

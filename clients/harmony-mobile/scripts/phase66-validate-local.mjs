/** Validate the latest packaged source inputs and native signer guard before any fresh real enrollment. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const source = await readFile('scripts/phase66-device.mjs', 'utf8')
assert.ok(source.includes("row.text === '确认并签署这次挑战'"), 'native signing attempt guard must match the actual visible control')
assert.ok(source.includes('native reply must match this fresh offer'))
const built = JSON.parse(await readFile('.build/field-interaction-alpha4-candidate/build-info.json', 'utf8'))
assert.equal(built.dshVersion, '0.2.1-alpha.4')
for (const input of built.sourceInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'runtime source input changed: ' + input.path)
const signed = JSON.parse(await readFile('evidence/phase65-signed-build.json', 'utf8'))
assert.equal(hash(await readFile(signed.artifact.path)), signed.artifact.sha256)
assert.equal(hash(await readFile(signed.inputArtifact.path)), signed.inputArtifact.sha256)
const payload = JSON.parse(await readFile('evidence/phase65-public-payload.json', 'utf8'))
const renderer = payload.inputEntries.find(value => value.path === 'resources/rawfile/product-rich-document.js')
assert.ok(renderer)
assert.equal(hash(await readFile('.build/field-interaction-alpha4-candidate/product-rich-document.js')), renderer.sha256)
const report = { at: new Date().toISOString(), runtimeInputsVerified: built.sourceInputs.length, dshVersion: built.dshVersion, nativeSignerGuardVerified: true, freshReplyOfferEqualityRequired: true, frozenHapUnchanged: true, rendererMatchesInstalledHap: true, realGrantCreated: false }
await writeFile('evidence/phase66-local-final-validation.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))

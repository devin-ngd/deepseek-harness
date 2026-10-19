/** Preserve the first review archive and seal corrected baseline-substitution metadata with the identical unsigned HAP. */
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, copyFile, mkdir } from 'node:fs/promises'
import { resolve, join, basename, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { sealZip } from './phase75-zip.mjs'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8')), original = await json('evidence/phase76-candidate.json'), stage = resolve('.build/phase76.1-control-review-candidate')
assert.equal(hash(await readFile(original.archive.path)), original.archive.sha256)
const before = await json('evidence/phase76-before-control-build.json'), socket = before.inputs.find(row => /NativeRelaySocket[.]ets$/.test(row.file))
assert.equal(socket.sourceFile, '.build/native-history-candidate-project/entry/src/main/ets/native/NativeRelaySocket.ets'); assert.equal(socket.sha256, hash(await readFile(socket.sourceFile)))
await mkdir(stage); await cp(original.stage, stage, { recursive: true, force: false, errorOnExist: false, filter: path => basename(path) !== 'files.sha256.json' })
const updated = ['scripts/phase76-control-build.mjs', 'scripts/phase76-metadata-successor.mjs', 'docs/phase76-control-diagnosis.md']
for (const file of updated) { const target = join(stage, 'source-overlay', file); await mkdir(dirname(target), { recursive: true }); await copyFile(file, target) }
for (const file of ['evidence/phase76-before-control-build.json', 'evidence/phase76-before-message-error.log', 'evidence/phase76-default-lint.log', 'evidence/phase76-doc-links.json']) { const target = join(stage, file); await mkdir(dirname(target), { recursive: true }); await copyFile(file, target) }
const core = { ...await json(join(stage, 'candidate-core.json')), metadataRevision: 1, reason: 'Before-fixture source inventory now names the sealed NativeRelaySocket substitution rather than hashing the overridden current filename. Runtime/HAP unchanged.', predecessorArchive: original.archive, beforeSocketSource: socket }
assert.equal(hash(await readFile(join(stage, 'native/entry-default-unsigned.hap'))), original.native.sha256)
await writeFile(join(stage, 'candidate-core.json'), JSON.stringify(core, null, 2) + '\n')
const sealed = await sealZip(stage, 'D:/Temp/dsh-harmony-mobile-phase76.1-control-review-candidate.zip')
await writeFile('evidence/phase76.1-candidate.json', JSON.stringify({ ...core, ...sealed }, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(sealed))

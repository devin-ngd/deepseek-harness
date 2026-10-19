/** Seal one successful unsigned diagnostic build and verify the previously installed artifact remains unchanged. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
const path = process.argv[2] ?? 'evidence/native-build/2026-10-16T14-23-56-684Z.json', tag = process.argv[3] ?? 'phase68'; assert.match(path, /^evidence\/native-build\/[0-9TZ-]+[.]json$/); assert.match(tag, /^phase68(?:[.][0-9]+)?$/); const build = JSON.parse(await readFile(path, 'utf8')), hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(build.exitCode, 0); assert.equal(build.sourceArkTsCompiled, true); assert.equal(build.inputsUnchangedDuringBuild, true); assert.equal(build.nativeJsImportAudit.passed, true)
for (const [file, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(file)), digest)
assert.equal(hash(await readFile(build.artifact.path)), build.artifact.sha256)
const old = JSON.parse(await readFile('evidence/phase65-signed-build.json', 'utf8')); assert.equal(hash(await readFile(old.artifact.path)), old.artifact.sha256)
const target = 'D:/Temp/dsh-harmony-mobile-20261016-' + tag + '-unsigned.hap'; await copyFile(build.artifact.path, target, constants.COPYFILE_EXCL)
const record = { at: new Date().toISOString(), path: target, bytes: build.artifact.bytes, sha256: build.artifact.sha256, buildEvidence: path, toolchain: build.toolchain, signed: false, installed: false, deviceValidated: false, previousSignedArtifactUnchanged: true, signingOrInstallationApprovalRequired: true, fieldGrantCreated: false }
await writeFile('evidence/' + tag + '-unsigned-candidate.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(record))

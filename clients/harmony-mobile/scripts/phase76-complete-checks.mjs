/** Scoped lint and unchanged official native-build evidence; never invokes a phone, signer, field owner or SSH. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async file => JSON.parse(await readFile(file, 'utf8'))
const buildPath = 'evidence/native-build/2026-10-17T08-52-07-717Z.json', build = await json(buildPath), plan = await json('operations/phase76/plan.json')
assert.equal(build.exitCode, 0); assert.equal(build.sourceArkTsCompiled && build.nativeJsImportAudit.passed && build.inputsUnchangedDuringBuild, true)
for (const [file, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(file)), digest)
assert.equal(hash(await readFile(plan.native.hap)), plan.native.sha256); assert.equal(plan.native.sha256, build.artifact.sha256)
assert.equal(hash(await readFile('D:/Temp/dsh-harmony-mobile-20261017-phase75-signed.hap')), '96976ba31de04e7acc6a49f3988eb1207c0111261b717e8a9832090d96a10767')
const operations = (await readdir('operations/phase76')).filter(file => file.endsWith('.mjs')).map(file => 'operations/phase76/' + file), scripts = (await readdir('scripts')).filter(file => file.startsWith('phase76-') && file.endsWith('.mjs')).map(file => 'scripts/' + file)
const files = ['replay-profile/src/connect-readiness.ts', 'replay-profile/src/field-config.ts', 'integration/phase76-epoch.spec.ts', 'tests/phase76-operations.test.mjs', ...operations, ...scripts]
const result = spawnSync(process.execPath, [resolve('../../node_modules/oxlint/bin/oxlint'), '--config', '.build/phase76-oxlint.json', '--format=default', ...files, '--threads=2', '--max-warnings=0'], { windowsHide: true, encoding: 'utf8', timeout: 30000 })
await writeFile('evidence/phase76-complete-lint.log', result.stdout + result.stderr); assert.equal(result.status, 0, result.stdout + result.stderr)
const report = { at: new Date().toISOString(), nativeBuildEvidence: buildPath, nativeBuildReused: true, nativeInputsUnchanged: true, unsignedHap: { path: plan.native.hap, bytes: plan.native.bytes, sha256: plan.native.sha256 }, lintFiles: files.length, lintPassed: true, originalSigned75Preserved: true, phoneIo: false, remoteIo: false, newSdkBuildClaimed: false }
await writeFile('evidence/phase76-complete-sdk-check.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ nativeBuildReused: true, nativeInputsUnchanged: true, lintFiles: files.length, lintPassed: true }))

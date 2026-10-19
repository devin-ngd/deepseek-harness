/** Seal a new unsigned review candidate; read only prior sealed code/artifacts, never field homes or credentials. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, cp, mkdir, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const stage = resolve('.build/phase75-review-candidate'), buildPath = 'evidence/native-build/2026-10-17T07-05-30-021Z.json', build = await json(buildPath), tests = await json('evidence/phase75-tests-latest.json')
assert.equal(build.exitCode, 0); assert.equal(build.historyCandidate, true); assert.equal(build.sourceArkTsCompiled, true); assert.equal(build.nativeJsImportAudit.passed, true); assert.equal(build.inputsUnchangedDuringBuild, true)
assert.equal(tests.code, 0); assert.equal(tests.tests, 56); assert.equal(tests.failed, 0)
for (const [file, digest] of Object.entries(build.sourceHashes)) assert.equal(hash(await readFile(file)), digest)
assert.equal(hash(await readFile(build.artifact.path)), build.artifact.sha256)
const frozen = await json('.build/phase69-review-candidate/files.sha256.json')
for (const row of frozen) assert.equal(hash(await readFile(join('.build/phase69-review-candidate', row.file))), row.sha256)
const predecessor = await json('.build/phase73.1-review-candidate/files.sha256.json')
for (const row of predecessor) assert.equal(hash(await readFile(join('.build/phase73.1-review-candidate', row.file))), row.sha256)
const oldHap = await json('evidence/phase73.1-unsigned-candidate.json'); assert.equal(hash(await readFile(oldHap.path)), oldHap.sha256)
assert.equal(hash(await readFile('D:/Temp/dsh-harmony-mobile-20261017-phase73.1-signed.hap')), '79c6079905cdf118efef7bdeca3e5bf474d0cdfce2bcfb69c2f2ab7ed4a21bbb')
assert.equal(hash(await readFile('D:/Temp/dsh-harmony-mobile-phase74.7-operation-plan.zip')), 'c1006fadb1b9253c2e898dfb3146dbb2b787a05c1184cdbf4e32cb353ff4a330')
const native = 'D:/Temp/dsh-harmony-mobile-20261017-phase75-unsigned.hap'; await copyFile(build.artifact.path, native, constants.COPYFILE_EXCL)
await mkdir(stage); await mkdir(join(stage, 'native')); await copyFile(native, join(stage, 'native/entry-default-unsigned.hap'), constants.COPYFILE_EXCL)
for (const file of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(build.cwd, file), join(stage, 'native-project', file), { recursive: true, errorOnExist: true, force: false })
const sources = ['src/public-trust-protocol.ts', 'src/native-product-facade.ts', 'integration/public-trust-verification.ts', 'integration/phase75-history.spec.ts', 'integration/phase75-history.vitest.config.mjs', 'integration/phase69-renewal.spec.ts', 'desktop-plugin/src/first-use.ts', 'desktop-plugin/README.md', 'harmony/entry/src/main/ets/product/NativeProductOwner.ets', 'harmony/entry/src/main/ets/product/ProductCore.d.ts', 'harmony/entry/src/main/ets/product/ProductCore.js', 'scripts/build-native.mjs', 'scripts/phase75-test.mjs', 'scripts/phase75-prepare-native.mjs', 'scripts/phase75-seal.mjs', 'tests/fixtures/phase75-history.expected.json', 'operations/phase75/continuation-plan.json', 'README.md', 'README.zh.md', 'README.i18n.yaml', 'docs/phase75-complete-history.md', 'docs/phase74-refusal-and-history-plan.md', 'docs/tasks.md', 'docs/acceptance.md']
for (const file of sources) { const path = join(stage, 'source-overlay', file); await mkdir(dirname(path), { recursive: true }); await copyFile(file, path, constants.COPYFILE_EXCL) }
const rollback = []
for (const file of ['src/public-trust-protocol.ts', 'src/native-product-facade.ts', 'desktop-plugin/src/first-use.ts', 'harmony/entry/src/main/ets/product/NativeProductOwner.ets', 'harmony/entry/src/main/ets/product/ProductCore.d.ts', 'harmony/entry/src/main/ets/product/ProductCore.js', 'scripts/build-native.mjs']) {
  const before = file.startsWith('harmony/') ? join('.build/native-data-channel-order-project', file.slice(8)) : file === 'scripts/build-native.mjs' ? join('.build/phase73.1-review-candidate/source-overlay', file) : join('.build/phase69-review-candidate/source', file)
  const path = join(stage, 'source-before', file); await mkdir(dirname(path), { recursive: true }); await copyFile(before, path, constants.COPYFILE_EXCL)
  rollback.push({ file, retainedBaseline: before, beforeSha256: hash(await readFile(before)), afterSha256: hash(await readFile(file)) })
}
const evidence = [buildPath, buildPath.replace(/json$/, 'log'), 'evidence/phase75-sdk-command.log', 'evidence/phase75-sdk-junction-eperm.log', 'evidence/phase75-core-build.json', 'evidence/phase75-native-inputs.json', 'evidence/phase75-tests-latest.json', tests.log, tests.report, 'evidence/phase75-strict-final.log', 'evidence/phase75-lint.log', 'evidence/phase75-readme-pair.log', 'evidence/phase74.7-field-closeout.json', 'evidence/phase74.7-review-rejections.json', 'evidence/phase74.7-readonly-pair-history-audit.json']
for (const file of evidence) { const path = join(stage, file); await mkdir(dirname(path), { recursive: true }); await copyFile(file, path, constants.COPYFILE_EXCL) }
await writeFile(join(stage, 'rollback.json'), JSON.stringify({ files: rollback, rule: 'Restore only matching after-hash runtime files from source-before after review. Retain new files and evidence. Never restore credentials, old epochs, phone data or remote state.' }, null, 2) + '\n', { flag: 'wx' })
const nativeReport = { path: native, bytes: (await stat(native)).size, sha256: hash(await readFile(native)), buildEvidence: buildPath, signed: false, installed: false }
await writeFile(join(stage, 'candidate.json'), JSON.stringify({ at: new Date().toISOString(), native: nativeReport, tests: tests.tests, frozen69FilesVerified: frozen.length, frozen73_1FilesVerified: predecessor.length, original73_1HapsAnd74_7PackagePreserved: true, phoneIo: false, remoteIo: false, realGrantCreated: false, realModels: 0, uploaded: false, signed: false, installed: false, fieldAcceptance: false }, null, 2) + '\n', { flag: 'wx' })
await writeFile(join(stage, 'README.md'), '# Phase75 unsigned history-recovery review\n\nThe native project is an independent default-disabled INTERNET-only build, without signing configuration. No phone, SSH, upload or real grant operation occurred. Source overlays require the existing repository dependencies; they are not an installed desktop replacement. Read source-overlay/docs/phase75-complete-history.md, candidate.json and rollback.json. The proposed operation plan is unapproved and non-executable; no live operator or approval record is included. Preserve every old signed/public generation and field record.\n', { flag: 'wx' })
const files = []
async function scan(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await scan(path); else { const bytes = await readFile(path); files.push({ file: path.slice(stage.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) }) } } }
await scan(stage); files.sort((a, b) => a.file.localeCompare(b.file)); const manifest = Buffer.from(JSON.stringify(files, null, 2) + '\n'); await writeFile(join(stage, 'files.sha256.json'), manifest, { flag: 'wx' })
const report = { at: new Date().toISOString(), stage, files: files.length, manifestSha256: hash(manifest), sourceFiles: sources.length, native: nativeReport, tests: tests.tests, realGrantCreated: false, phoneIo: false, remoteIo: false, signed: false, installed: false }
await writeFile('evidence/phase75-candidate.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))

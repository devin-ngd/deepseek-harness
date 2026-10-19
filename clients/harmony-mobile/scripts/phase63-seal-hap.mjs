/** Freeze the newly compiled unsigned candidate; no signing, installation or identity access. */
import { readFile, copyFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const project = resolve(import.meta.dirname, '..'), evidence = JSON.parse(await readFile(join(project, 'evidence/native-build/2026-10-16T10-23-01-338Z.json'), 'utf8'))
if (evidence.exitCode !== 0 || !evidence.artifact || !evidence.sourceArkTsCompiled || !evidence.inputsUnchangedDuringBuild || !evidence.nativeJsImportAudit.passed) throw new Error('Successful native compile and import audit required')
const bytes = await readFile(evidence.artifact.path), digest = createHash('sha256').update(bytes).digest('hex')
if (digest !== evidence.artifact.sha256 || digest !== 'e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858') throw new Error('Candidate hash mismatch')
const path = 'D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap'
await copyFile(evidence.artifact.path, path, constants.COPYFILE_EXCL)
await writeFile(join(project, 'evidence/phase63-unsigned-candidate.json'), JSON.stringify({ at: new Date().toISOString(), path, bytes: bytes.length, sha256: digest, nativeBuild: 'evidence/native-build/2026-10-16T10-23-01-338Z.json', sourceArkTsCompiled: true, sdkApi: evidence.toolchain.api, toolchain: evidence.toolchain, unsigned: true, signed: false, installed: false, installApprovalRequired: true, originalNativeInputsVerified: true, realModels: 0, deviceValidated: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ path, bytes: bytes.length, sha256: digest, signed: false, installed: false }))

/** Prepare an unsigned candidate from verified prior ArkTS inputs and newly built alpha.4 shared runtimes; never signs or installs. */
import { readFile, writeFile, mkdir, cp, copyFile, readdir, lstat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const project = resolve(import.meta.dirname, '..'), previous = join(project, '.build/native-huks-sign-purpose-project'), candidate = join(project, '.build/native-candidate-mobile-project'), rollback = 'D:/Temp/dsh-harmony-alpha4-phase63-preimages'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const reports = []
for (const name of await readdir(join(project, 'evidence/native-build'))) if (name.endsWith('.json')) {
  const record = JSON.parse(await readFile(join(project, 'evidence/native-build', name), 'utf8'))
  if (record.artifact?.sha256 === '14cd20fcb88d80c9fbde50ef61bb7d057debdee0950752deb28618f8eabee016') reports.push(record)
}
if (reports.length !== 1) throw new Error('Exact prior unsigned build evidence required')
for (const [path, hash] of Object.entries(reports[0].sourceHashes)) if (digest(await readFile(path)) !== hash) throw new Error('Prior staged input changed: ' + relative(previous, path))
const profile = JSON.parse(await readFile(join(previous, 'build-profile.json5'), 'utf8'))
const app = JSON.parse(await readFile(join(previous, 'AppScope/app.json5'), 'utf8'))
const module = JSON.parse(await readFile(join(previous, 'entry/src/main/module.json5'), 'utf8'))
if (profile.app.signingConfigs.length !== 0 || app.app.bundleName !== 'local.dsh.mobile.offlineproduct' || JSON.stringify(module.module.requestPermissions) !== JSON.stringify([{ name: 'ohos.permission.INTERNET' }])) throw new Error('Original unsigned identity/permission settings required')
await mkdir(candidate)
for (const path of ['AppScope', 'entry/src', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5', 'hvigor', 'platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5']) await cp(join(previous, path), join(candidate, path), { recursive: true, errorOnExist: true, force: false })
const runtime = JSON.parse(await readFile(join(project, 'evidence/phase63-core-build.json'), 'utf8'))
for (const record of runtime.reports) {
  const bytes = await readFile(join(project, record.output))
  if (digest(bytes) !== record.sha256) throw new Error('New alpha.4 runtime hash mismatch')
  for (const path of Object.keys(record.sourceHashes)) if (path.includes('dsh-harmony-upstream-v15')) throw new Error('Old projection input denied')
  const path = relative(join(project, 'harmony'), join(project, record.output))
  await copyFile(join(project, record.output), join(candidate, path))
}
await copyFile(join(project, 'harmony/entry/src/main/ets/generated/NativeAssetIndex.ets'), join(candidate, 'entry/src/main/ets/generated/NativeAssetIndex.ets'))
await writeFile(join(project, 'evidence/phase63-candidate-inputs.json'), JSON.stringify({ at: new Date().toISOString(), previousUnsignedHash: reports[0].artifact.sha256, candidate, rollback, originalInputsVerified: true, nativeSourceChanged: false, runtimeReport: 'phase63-core-build.json', bundleName: app.app.bundleName, versionCode: app.app.versionCode, permissions: module.module.requestPermissions, signingConfigs: [], signOrInstallExecuted: false, previousCompiledOutputsCopied: false }, null, 2) + '\n')
console.log(JSON.stringify({ candidate, originalInputsVerified: true, newRuntimes: runtime.reports.length, signing: false }))

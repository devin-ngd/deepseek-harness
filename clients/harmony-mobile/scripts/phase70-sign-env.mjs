/** Restore only the official SDK module search path used by the prior approved build; signer has not executed before this wrapper. */
import assert from 'node:assert/strict'
import { access, readFile, writeFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
for (const path of ['evidence/phase70-sign-attempt.json', '.build/phase70-signature-verification/exact-candidate-signed.hap']) { try { await access(path); throw new Error('existing signing attempt/output requires verification only') } catch (error) { if (error.code !== 'ENOENT') throw error } }
const modules = resolve('.build/native-renewal-candidate-project/node_modules'), official = 'D:/Program Files/HuaWei/DevEco Studio/tools/hvigor/hvigor', link = join(modules, '@ohos/hvigor'); assert.equal((await realpath(link)).replaceAll('\\', '/'), official); const metadata = JSON.parse(await readFile(join(official, 'package.json'), 'utf8')); assert.equal(metadata.version, '6.26.8'); const require = createRequire(resolve('package.json')); assert.ok(require.resolve('@ohos/hvigor', { paths: [modules] }).replaceAll('\\', '/').startsWith(official + '/'))
await writeFile('evidence/phase70-sign-helper-recovery.json', JSON.stringify({ at: new Date().toISOString(), priorStage: 'official-module-load', previousSignerExecutions: 0, previousAttemptRecordAbsent: true, SDKModuleSearchPath: modules, installedHvigor: metadata.version, SDKFilesChanged: false, candidateChanged: false }, null, 2) + '\n', { flag: 'wx' })
const child = spawn(process.execPath, ['scripts/phase70-sign.mjs'], { windowsHide: true, stdio: 'inherit', env: { ...process.env, NODE_PATH: modules } }); process.exitCode = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })

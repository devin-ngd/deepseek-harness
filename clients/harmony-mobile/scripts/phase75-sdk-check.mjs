/** Compile only the public SDK bitmap verifier and load helper exports without opening signing materials. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const ide = 'D:/Program Files/HuaWei/DevEco Studio', jar = join(ide, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar'), output = resolve('.build/phase75.1-sdk-check')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(await readFile(jar)), 'a434b6747e6c5d0b14e73837a46b39f4816ab25b42d1833d6f767bf867cf616d')
await mkdir(output, { recursive: true })
const compiler = spawnSync(join(ide, 'jbr/bin/javac.exe'), ['-cp', jar, '-d', output, resolve('operations/phase75/Phase74PageInfoVerify.java')], { windowsHide: true, encoding: 'utf8', timeout: 30000 })
assert.equal(compiler.status, 0, compiler.stderr)
const code = "process.env.NODE_PATH=process.env.PHASE74_SDK_NODE_PATH; require('node:module').Module._initPaths(); const assert=require('node:assert/strict'); const {DecipherUtil}=require(process.env.PHASE74_SDK_PLUGIN+'/src/utils/decipher-util.js'); const {SigningOptionsV2}=require(process.env.PHASE74_SDK_PLUGIN+'/src/builder/inner-java-command-builder/signing-options-v2.js'); assert.equal(typeof DecipherUtil.decryptPwd,'function'); assert.equal(typeof SigningOptionsV2,'function'); console.log('exports-only-loaded');"
const loaded = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, NODE_PATH: '', PHASE74_SDK_NODE_PATH: resolve('.build/native-history-candidate-project/node_modules'), HVIGOR_USER_HOME: join(output, 'sdk-user'), PHASE74_SDK_PLUGIN: join(ide, 'tools/hvigor/hvigor-ohos-plugin') }, windowsHide: true, encoding: 'utf8', timeout: 30000 })
assert.equal(loaded.status, 0, loaded.stderr); assert.match(loaded.stdout, /exports-only-loaded/)
const report = { observedAt: new Date().toISOString(), publicJavaVerifierCompiled: true, sdkHelperExportsLoaded: true, officialJarSha256: hash(await readFile(jar)), signingMaterialsRead: false, decryptInvoked: false, signingInvoked: false, deviceIo: false }
await writeFile('evidence/phase75.1-sdk-check.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))

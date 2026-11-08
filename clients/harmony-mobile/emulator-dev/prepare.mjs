/** Prepare isolated local TLS/desktop/native artifacts; no installed application is changed. */
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { projectionTsconfig } from '../scripts/projection-source.mjs'
const client = resolve(import.meta.dirname, '..'), root = resolve(client, '../..'), output = join(client, '.build/emulator-link')
await mkdir(output, { recursive: true })
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const ws = createRequire(join(root, 'packages/api/gateway/package.json')).resolve('ws')
const captured = new Map()
captured.set(join(client, 'product.config.json'), await readFile(join(client, 'product.config.json')))
await esbuild.build({ entryPoints: [join(client, 'emulator-dev/desktop.ts')], outfile: join(output, 'index.mjs'), bundle: true, alias: { ws }, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'], tsconfig: await projectionTsconfig(client, root), banner: { js: "import { createRequire as makeRequire } from 'node:module'; const require = makeRequire(import.meta.url);" }, plugins: [{ name: 'isolated-emulator-services', setup(build) { build.onLoad({ filter: /\.(?:ts|mjs)$/ }, async args => { const bytes = await readFile(args.path); captured.set(args.path, bytes); return { contents: bytes.toString().replaceAll('harmonyDesktop', 'harmonyEmulatorDesktop').replaceAll("'@deepseek-ai/dsh-experimental-harmony-mobile'", "'harmony-emulator-local'").replaceAll('harmonyAuthenticatedDevices', 'harmonyEmulatorAuthenticatedDevices').replaceAll("'harmony-device'", "'harmony-emulator-device'").replaceAll('"harmony-device"', '"harmony-emulator-device"').replaceAll('"@deepseek-ai/dsh-experimental-harmony-mobile"', '"harmony-emulator-local"').replaceAll('name: "harmony_mobile_admission"', 'name: "harmony_emulator_admission"').replaceAll("name: 'harmony_mobile_admission'", "name: 'harmony_emulator_admission'"), loader: args.path.endsWith('.ts') ? 'ts' : 'js' } }) } }] })
await writeFile(join(output, 'package.json'), JSON.stringify({ name: 'harmony-emulator-local', private: true, type: 'module', main: 'index.mjs' }, null, 2)+'\n')
if (process.argv.includes('--desktop-only')) {
  const hash=b=>createHash('sha256').update(b).digest('hex'), inputs=[]
  await mkdir(join(output,'inputs'),{recursive:true})
  for(const[path,bytes]of captured){assert.equal(hash(await readFile(path)),hash(bytes),'Source changed during build: '+path);await writeFile(join(output,'inputs',hash(bytes)+'.ts'),bytes);inputs.push({path,sha256:hash(bytes)})}
  await writeFile(join(output,'desktop-build.json'),JSON.stringify({at:new Date().toISOString(),inputs,bundleSha256:hash(await readFile(join(output,'index.mjs')))},null,2)+'\n')
  console.log('Desktop bundle rebuilt'); process.exit(0)
}
const cert=join(output,'localhost.crt')
try { await readFile(cert) } catch(error) { if(error.code!=='ENOENT')throw error; const r=spawnSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(output,'localhost.key'),'-out',cert,'-days','365','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,'Local TLS certificate generation failed') }
const source=join(client,'.build/native-controls-device-rc2-32'), target=join(client,'.build/native-controls-emulator-local')
await mkdir(target)
for(const d of ['AppScope','entry/src','hvigor'])await cp(join(source,d),join(target,d),{recursive:true,errorOnExist:true,force:false})
for(const f of ['platform.json','build-profile.json5','hvigorfile.ts','oh-package.json5','entry/hvigorfile.ts','entry/build-profile.json5','entry/oh-package.json5']){await mkdir(resolve(target,f,'..'),{recursive:true});await cp(join(source,f),join(target,f))}
await writeFile(join(target,'entry/src/main/ets/native/EmulatorLocalTrust.ets'),"/** Application-private CA path set by the native emulator owner before dialing. */\nexport class EmulatorLocalTrust { static caPath: string = '' }\n")
await cp(cert,join(target,'entry/src/main/resources/rawfile/emulator-ca.pem'))
const hash=b=>createHash('sha256').update(b).digest('hex'), inputs=[]
await mkdir(join(output,'inputs'),{recursive:true})
for(const[path,bytes]of captured){assert.equal(hash(await readFile(path)),hash(bytes),'Source changed during build: '+path);await writeFile(join(output,'inputs',hash(bytes)+'.ts'),bytes);inputs.push({path,sha256:hash(bytes)})}
await writeFile(join(output,'build.json'),JSON.stringify({inputs,namespace:'harmonyEmulatorDesktop',principal:'harmony-emulator-device',admissionDomain:'harmony_emulator_admission',certificateSha256:hash(await readFile(cert)),nativeProject:target},null,2)+'\n')
const shared = spawnSync(process.execPath, [join(client, 'emulator-dev/build-native.mjs')], { cwd: client, stdio: 'inherit', windowsHide: true })
if (shared.error !== undefined) throw shared.error
assert.equal(shared.status, 0, 'Shared emulator product build failed')
console.log(JSON.stringify({output,nativeProject:target,inputs:inputs.length}))

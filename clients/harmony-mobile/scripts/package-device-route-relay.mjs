/** Seal offline route candidates from current source and already verified dependencies; never deploys or opens a real authorization. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { readFile, writeFile, mkdir, copyFile, readdir, lstat, access, mkdtemp, rename } from 'node:fs/promises'
import { resolve, join, dirname, relative } from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const args = process.argv.slice(2)
const selectedVersion = args.find(value => value.startsWith('--version='))
const version = selectedVersion?.slice('--version='.length) ?? JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).version
assert.match(version, /^0\.0\.0-rc2\.[0-9]+$/)
const label = version.slice('0.0.0-'.length).replaceAll('.', '-')
const reports = args.filter(value => /^--native-report=evidence\/native-build\/[A-Za-z0-9T._-]+\.json$/.test(value))
if (reports.length !== 1 || args.length !== 1 + Number(selectedVersion !== undefined)) throw new Error('Select the exact successful unsigned native build report and optional local version')
const sdkPath = reports[0].slice('--native-report='.length), toolRoot = resolve('.build/public-tools-' + label)
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
await mkdir('.build/artifacts', { recursive: true })
const artifactPaths = { relay: resolve('.build/artifacts/harmony-relay-' + version + '.zip'), tools: resolve('.build/artifacts/harmony-public-relay-tools-' + version + '.zip'), phone: resolve('.build/artifacts/dsh-harmony-mobile-' + version + '-device-unsigned.hap') }
const receipt = 'evidence/relay-device-artifacts-' + version + '.json'
async function absent(path) { try { await access(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }; throw new Error('Preserve existing output: ' + path) }
for (const path of [...Object.values(artifactPaths), receipt]) await absent(path)
const stage = await mkdtemp(resolve('.build/route-archives-' + version + '-')), relay = join(stage, 'relay'), tools = join(stage, 'public-tools')
await mkdir(relay); await mkdir(tools)
async function inventory(directory, prefix = '') {
  const files = []
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false); const name = prefix + entry.name, path = join(directory, entry.name)
    assert.match(name, /^[a-zA-Z0-9_.\/-]+$/); assert.ok(!name.split('/').includes('..')); assert.doesNotMatch(name, /(?:^|\/)\.env|\.(?:p12|pfx|pem|key)$/)
    if (entry.isDirectory()) files.push(...await inventory(path, name + '/'))
    else { assert.ok((await lstat(path)).isFile()); const bytes = await readFile(path); files.push({ file: name, bytes: bytes.length, sha256: hash(bytes) }) }
  }
  return files
}
const oldFiles = await json('evidence/phase68-final-relay-files.json'), previous = resolve('.build/phase68.2-relay-candidate')
const dependencies = oldFiles.filter(row => row.file.startsWith('node_modules/ws/') || row.file === 'vendor/ws-8.21.3.tgz' || row.file === 'ws.verified.json')
assert.ok(dependencies.length > 10)
for (const entry of dependencies) {
  assert.ok((await lstat(join(previous, entry.file))).isFile()); const bytes = await readFile(join(previous, entry.file))
  assert.equal(bytes.length, entry.bytes); assert.equal(hash(bytes), entry.sha256)
  await mkdir(dirname(join(relay, entry.file)), { recursive: true }); await writeFile(join(relay, entry.file), bytes, { flag: 'wx' })
}
assert.equal((await json(join(relay, 'node_modules/ws/package.json'))).version, '8.21.3')
assert.equal(hash(await readFile(join(relay, 'vendor/ws-8.21.3.tgz'))), 'df3454ef205791ce50b5b9241762dcf9bfe1aa9f7f01d3057229be7dac0c2dc3')
const lock = await json(join(previous, 'package-lock.json')), oldLock = oldFiles.find(row => row.file === 'package-lock.json')
assert.equal(hash(await readFile(join(previous, 'package-lock.json'))), oldLock.sha256)
lock.version = version; lock.packages[''].version = version
await writeFile(join(relay, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n')
await writeFile(join(relay, 'package.json'), JSON.stringify({ name: 'local-harmony-light-relay', version, private: true, type: 'module', engines: { node: '^22.19.0 || >=24.0.0' }, dependencies: { ws: 'file:vendor/ws-8.21.3.tgz' } }, null, 2) + '\n')
const built = await esbuild.build({ entryPoints: [resolve('standalone-relay/src/main.ts')], outfile: join(relay, 'server.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['ws'], metafile: true, legalComments: 'linked' })
for (const output of Object.values(built.metafile.outputs)) for (const imported of output.imports) assert.ok(isBuiltin(imported.path) || imported.path === 'ws')
const sourceInputs = []
for (const path of Object.keys(built.metafile.inputs)) { assert.doesNotMatch(path, /fixture|p256-channel|windows-protection|credentials-provider|native-sdk|replay-host/); sourceInputs.push({ path, sha256: hash(await readFile(path)) }) }
const toolBuild = await json(join(toolRoot, 'build-info.json'))
assert.equal((await json(join(toolRoot, 'package.json'))).version, version)
assert.deepEqual(toolBuild.outputs.map(row => row.file).sort(), ['prepare-public-config.mjs','initialize-public-trust.mjs','revoke-public-trust.mjs','check-write-scope.mjs','device-route-maintenance.mjs','endpoint-timers.mjs'].sort())
for (const input of toolBuild.timerInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'Stale endpoint configuration: ' + input.path)
for (const output of toolBuild.outputs) {
  const bytes = await readFile(join(toolRoot, output.file)); assert.equal(hash(bytes), output.sha256)
  for (const input of output.inputs) { assert.equal(hash(await readFile(input.path)), input.sha256, 'Stale public tool input: ' + input.path); if (!sourceInputs.some(row => row.path === input.path)) sourceInputs.push(input) }
  await writeFile(join(tools, output.file), bytes, { flag: 'wx' })
}
for (const name of ['package.json','build-info.json','relay-endpoint-timers.json']) await copyFile(join(toolRoot, name), join(tools, name))
const proposal = await json('standalone-relay/config.first-use.proposal.json'); proposal.nativeOrigin = 'networkkit-v1'
const nginx = await readFile('standalone-relay/relay.nginx.conf.proposal', 'utf8')
for (const path of ['/harmony/relay/control/v1', '/harmony/relay/v1']) {
  const block = nginx.split('location = ' + path + ' {')[1]?.split('}')[0]
  const seconds = block?.match(/proxy_read_timeout\s+([0-9]+)s;/)?.[1]
  assert.ok(seconds !== undefined && Number(seconds) * 1000 > proposal.broker.roomTtlMs + proposal.broker.challengeTtlMs, 'Proxy timeout must outlast room issuance and lifetime: ' + path)
}
for (const directory of [relay, tools]) await copyFile('standalone-relay/relay.nginx.conf.proposal', join(directory, 'relay.nginx.conf.proposal'))
await writeFile(join(tools, 'config.first-use.proposal.json'), JSON.stringify(proposal, null, 2) + '\n')
await copyFile('standalone-relay/FIRST-USE-TOOLS.md', join(tools, 'LEGACY-FIRST-USE.md'))
const routeProposal = { ...proposal, publicTrust: { ...proposal.publicTrust, path: '/SELECT/retained/legacy-public-state.jsonl' }, deviceRoutes: { path: '/home/devin/harmony-relay/public-state/test-20261023/device-routes-rc2.7.jsonl', maxBytes: 1048576, maxRecords: 256 } }
for (const directory of [relay, tools]) {
  await writeFile(join(directory, 'config.device-routes.proposal.json'), JSON.stringify(routeProposal, null, 2) + '\n')
  await copyFile('docs/device-route-rc2.7.md', join(directory, 'ROUTE-RECOVERY.md'))
  await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'))
  await mkdir(join(directory, 'licenses')); await copyFile(join(root, 'node_modules/.pnpm/zod@4.4.3/node_modules/zod/LICENSE'), join(directory, 'licenses/zod-LICENSE'))
}
await writeFile(join(tools, 'README.md'), '# rc2.7 public maintenance tools\n\nFive closed commands are included: prepare-public-config, initialize-public-trust, revoke-public-trust, check-write-scope and device-route-maintenance. They need Node ^22.19 or >=24, use only builtins and start no service.\n\nRead [ROUTE-RECOVERY.md](ROUTE-RECOVERY.md) for the new device-route protocol. The legacy initializer must never be run over retained state. Both proposal JSON files deliberately have empty seed pairs and are not runnable service configuration. Preserve the existing seed pair, revoked epoch2 journal/head and verify its digest before initializing only the new route journal.\n\n[LEGACY-FIRST-USE.md](LEGACY-FIRST-USE.md) documents the older commands; it does not authorize using them on existing state. No private material, real pairing, listener or network operation was used to build this archive.\n')
await writeFile(join(relay, 'README.md'), '# rc2.7 strict device-route relay\n\nLocal candidate only; no service unit, port, firewall or runtime was changed. The pinned ws 8.21.3 runtime is included: no npm install is required. Node ^22.19 or >=24 is required.\n\n`node server.mjs --config config.disabled.json` exits without listening. Importing server.mjs is inert. The route proposal is deliberately incomplete; read [ROUTE-RECOVERY.md](ROUTE-RECOVERY.md) before any separately approved deployment. Exact networkkit-v1 Origin, role, Host, paths, signatures, dual-signed route and E2E checks remain mandatory.\n')
await writeFile(join(relay, 'config.disabled.json'), '{"enabled":false}\n')
const copyTree = async (from,to) => { await mkdir(to); for (const entry of await readdir(from,{withFileTypes:true})) { assert.equal(entry.isSymbolicLink(),false); if(entry.isDirectory()) await copyTree(join(from,entry.name),join(to,entry.name)); else await copyFile(join(from,entry.name),join(to,entry.name),constants.COPYFILE_EXCL) } }
await copyTree(tools, join(relay, 'public-tools'))
for (const path of ['scripts/package-device-route-relay.mjs','docs/device-route-rc2.7.md','standalone-relay/config.first-use.proposal.json','standalone-relay/relay.nginx.conf.proposal','standalone-relay/FIRST-USE-TOOLS.md']) sourceInputs.push({ path, sha256: hash(await readFile(path)) })
await writeFile(join(relay, 'build-info.json'), JSON.stringify({ version, sourceInputs, dependencies: { ws: '8.21.3', bundledZod: '4.4.3' }, routeProtocol: 'harmony-device-route/1', legacyHistoryMustBeRetained: true, nativeOrigin: 'networkkit-v1', defaultDisabled: true, deployed: false, activated: false }, null, 2) + '\n')

const tar = args => { const out = spawnSync('C:/Windows/System32/tar.exe', args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'D:/Temp', TMP: 'D:/Temp' } }); assert.equal(out.error, undefined); assert.equal(out.status, 0, out.stderr.toString()); return out.stdout }
const world = await mkdtemp(resolve('.build/relay-detached-')), archives = {}
for (const [name,directory] of [['relay',relay],['tools',tools]]) {
  const files = await inventory(directory), pending = join(stage, name + '.pending.zip'); await absent(pending)
  tar(['-a','-cf',pending,'-C',directory,...files.map(row=>row.file)])
  assert.deepEqual(tar(['-tf',pending]).toString().trim().split(/\r?\n/).sort(), files.map(row=>row.file).sort())
  for (const file of files) { const bytes = tar(['-xOf',pending,file.file]); assert.equal(bytes.length,file.bytes); assert.equal(hash(bytes),file.sha256) }
  const detached = join(world,name); await mkdir(detached); tar(['-xf',pending,'-C',detached]); assert.deepEqual(await inventory(detached),files)
  archives[name] = { path: artifactPaths[name], pending, files, detached }
}
// This script performs only disabled startup, fixed-public loopback admission, and no-TTY maintenance refusal in the detached world.
await writeFile(join(world,'smoke.mjs'), `import assert from 'node:assert/strict';import {readFile,writeFile,readdir} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createECDH,createPublicKey} from 'node:crypto';import {request} from 'node:http';import {spawnSync} from 'node:child_process';
const relay=join(import.meta.dirname,'relay'),tools=join(import.meta.dirname,'tools'),read=async path=>JSON.parse(await readFile(path,'utf8'));const lib=await import(pathToFileURL(join(relay,'server.mjs')));const maint=await import(pathToFileURL(join(tools,'device-route-maintenance.mjs')));assert.equal(typeof maint.maintainDeviceRoutes,'function');assert.equal(lib.createStandaloneRelay({enabled:false}),undefined);assert.equal(await lib.openRelayApplication({enabled:false}),undefined);
function run(path,args){const r=spawnSync(process.execPath,[path,...args],{cwd:import.meta.dirname,env:process.env,windowsHide:true,timeout:10000,encoding:'utf8'});assert.equal(r.error,undefined);return{code:r.status,output:r.stdout+r.stderr}}assert.equal(run(join(relay,'server.mjs'),['--config',join(relay,'config.disabled.json')]).code,0);assert.equal((await read(join(relay,'package.json'))).version,'${version}');assert.equal((await read(join(relay,'node_modules/ws/package.json'))).version,'8.21.3');assert.equal((await read(join(tools,'package.json'))).version,'${version}');
function spki(n){const e=createECDH('prime256v1'),d=Buffer.alloc(32);d[31]=n;e.setPrivateKey(d);const p=e.getPublicKey();return createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:p.subarray(1,33).toString('base64url'),y:p.subarray(33).toString('base64url')}}).export({type:'spki',format:'der'}).toString('base64url')};const pair={pairId:'fixed-rc27-detached-public',desktopPublicSpki:spki(2),phonePublicSpki:spki(6),epoch:1,expiresAt:Date.now()+60000,revoked:false};const pairPath=join(import.meta.dirname,'public-pair.json'),state=join(import.meta.dirname,'not-initialized.jsonl'),out=join(import.meta.dirname,'prepared.json');await writeFile(pairPath,JSON.stringify(pair));const args=['--config',join(tools,'config.first-use.proposal.json'),'--pair',pairPath,'--state',state,'--output',out,'--limits',join(tools,'relay-endpoint-timers.json')];let r=run(join(tools,'prepare-public-config.mjs'),args);assert.equal(r.code,0,r.output);const prepared=await read(out),before=await readFile(out);assert.equal(prepared.nativeOrigin,'networkkit-v1');assert.deepEqual(prepared.broker.pairs,[pair]);assert.equal(run(join(tools,'prepare-public-config.mjs'),args).code,1);assert.deepEqual(await readFile(out),before);assert.equal(run(join(tools,'initialize-public-trust.mjs'),['--config',out,'--pair',pairPath,'--limits',join(tools,'relay-endpoint-timers.json')]).code,1);
const routeCfg={...prepared,deviceRoutes:{path:join(import.meta.dirname,'not-created-routes.jsonl'),maxBytes:65536,maxRecords:64}},routePath=join(import.meta.dirname,'route-config.json');await writeFile(routePath,JSON.stringify(routeCfg));assert.equal(run(join(tools,'device-route-maintenance.mjs'),['initialize','--config',routePath]).code,1);assert.ok((await readdir(import.meta.dirname)).every(name=>!name.startsWith('not-initialized')&&!name.startsWith('not-created')));
const local={...prepared,port:0};delete local.publicTrust;const authority={},source={id:()=> 'fixed-detached-challenge-01',nonce:()=> 'A'.repeat(43),token:()=> 'a'.repeat(64)};const owner=lib.createStandaloneRelay(local,authority,Date.now,()=>{},source);assert.ok(owner);await owner.start();const checks=[];
async function probe(role,origin,extra={},path='/harmony/relay/control/v1',protocol='harmony-relay-control-v1'){const code=await new Promise((ok,no)=>{const headers={Host:prepared.publicHost,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==','Sec-WebSocket-Protocol':protocol,'x-dsh-relay-role':role,'x-dsh-relay-pair':pair.pairId,...(origin===undefined?{}:{Origin:origin}),...extra};const q=request({host:'127.0.0.1',port:owner.port(),path,headers},res=>{res.resume();ok(res.statusCode)});q.on('upgrade',(res,socket)=>{socket.destroy();ok(res.statusCode)});q.on('error',no);q.setTimeout(2000,()=>q.destroy(new Error('probe timeout')));q.end()});await new Promise(ok=>setTimeout(ok,5));return code}
try{for(const [label,role,origin,extra,path,protocol,expected] of [['canonical-phone','phone','https://'+prepared.publicHost,{},undefined,undefined,101],['originless-phone','phone',undefined,{},undefined,undefined,101],['foreign-origin','phone','https://foreign.example',{},undefined,undefined,403],['desktop-origin','desktop','https://'+prepared.publicHost,{},undefined,undefined,403],['fetch-metadata','phone','https://'+prepared.publicHost,{'Sec-Fetch-Mode':'cors'},undefined,undefined,403],['wrong-host','phone',undefined,{Host:'foreign.example'},undefined,undefined,403],['query-path','phone',undefined,{},'/harmony/relay/control/v1?x=1',undefined,403],['wrong-protocol','phone',undefined,{},undefined,'wrong',403],['cookie','phone',undefined,{Cookie:'synthetic=1'},undefined,undefined,403]]){const status=await probe(role,origin,extra,path,protocol);assert.equal(status,expected,label);checks.push({label,status})}}finally{await owner.close()}assert.throws(()=>lib.createStandaloneRelay({...local,nativeOrigin:'*'}));assert.throws(()=>lib.createStandaloneRelay(routeCfg));console.log(JSON.stringify({disabledStartup:true,detachedImports:true,publicPreparation:true,exclusiveOutput:true,noTtyInitRefused:true,noTtyRouteInitRefused:true,realStateFiles:0,loopbackAdmission:checks,roomsIssued:0,remoteNetwork:false,realModels:0}));
`)
const smoke = spawnSync(process.execPath, [join(world,'smoke.mjs')], { cwd: world, windowsHide:true, timeout:30000, encoding:'utf8', env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:world,TMP:world} })
await writeFile(join(stage,'detached-smoke.log'), smoke.stdout + smoke.stderr); assert.equal(smoke.error,undefined); assert.equal(smoke.status,0,smoke.stdout+smoke.stderr)
const detached = JSON.parse(smoke.stdout.trim())
const sdk = await json(sdkPath), nativeRoot=resolve('.build/native-controls-device-' + label), parity=[]
assert.equal(sdk.exitCode,0); assert.equal(sdk.inputsUnchangedDuringBuild,true); assert.equal(sdk.nativeJsImportAudit.passed,true)
for(const [path,digest] of Object.entries(sdk.sourceHashes)){assert.equal(hash(await readFile(path)),digest,'SDK input changed: '+path);const name=relative(nativeRoot,path).replaceAll('\\','/');assert.ok(!name.startsWith('../'));if(['AppScope/app.json5','entry/src/main/ets/product/ProductConfiguration.ets'].includes(name))continue;assert.equal(hash(await readFile(join('harmony',name))),digest,'Source parity: '+name);parity.push(name)}
assert.equal((await json(join(nativeRoot,'AppScope/app.json5'))).app.versionName,version)
const payload=await readFile(sdk.artifact.path);assert.equal(hash(payload),sdk.artifact.sha256)
const names=tar(['-tf',sdk.artifact.path]).toString().trim().split(/\r?\n/);assert.equal(new Set(names).size,names.length);for(const name of ['module.json','ets/modules.abc','resources/rawfile/product-rich-document.js','resources/rawfile/guest-sdk.js'])assert.ok(names.includes(name))
assert.equal(JSON.parse(tar(['-xOf',sdk.artifact.path,'module.json']).toString()).app.versionName,version)
for(const name of names.filter(name=>name.startsWith('resources/rawfile/')&&!name.endsWith('/'))) assert.equal(hash(tar(['-xOf',sdk.artifact.path,name])),hash(await readFile(join(nativeRoot,'entry/src/main',name))))
for(const [name,info] of Object.entries(archives)){await rename(info.pending,info.path);const bytes=await readFile(info.path);info.bytes=bytes.length;info.sha256=hash(bytes);delete info.pending}
await copyFile(sdk.artifact.path,artifactPaths.phone,constants.COPYFILE_EXCL);assert.equal(hash(await readFile(artifactPaths.phone)),sdk.artifact.sha256)
await writeFile(receipt,JSON.stringify({at:new Date().toISOString(),version,stage,archives,phone:{path:artifactPaths.phone,bytes:payload.length,sha256:hash(payload),signed:false},sdkEvidence:sdkPath,nativeSourceParity:parity,sourceInputs,detached,detachedWorld:world,oldDependencyEvidence:'evidence/phase68-final-relay-files.json',legacyHistoryChanged:false,realBindingChanged:false,installed:false,remoteIo:false,realModels:0},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({receipt,relay:{path:archives.relay.path,sha256:archives.relay.sha256},tools:{path:archives.tools.path,sha256:archives.tools.sha256},phone:{path:artifactPaths.phone,sha256:hash(payload)},detached}))

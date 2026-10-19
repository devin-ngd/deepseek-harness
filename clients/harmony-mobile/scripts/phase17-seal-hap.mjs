/** Seal the already compiled unsigned acceptance HAP; no signing, installation, emulator or forwarding command exists here. */
import {readFile,writeFile,copyFile,constants} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const build=JSON.parse(await readFile('evidence/native-build/2026-10-12T04-13-34-831Z.json','utf8'))
if(build.exitCode!==0||!build.sourceArkTsCompiled||!build.inputsUnchangedDuringBuild||build.toolchain.api!==26||build.signingConfigs.length!==0||JSON.stringify(build.requestPermissions)!=='[{"name":"ohos.permission.INTERNET"}]')throw Error('Exact official unsigned API26 build required')
for(const [path,expected]of Object.entries(build.sourceHashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==expected)throw Error('Compiled source changed: '+path)
const mode=await readFile('.build/native-network-project/entry/src/main/ets/generated/NativeBuildMode.ets','utf8')
if(!mode.includes('NATIVE_ACCEPTANCE_TEST: boolean = true'))throw Error('Acceptance diagnostics were not compiled')
const path='D:/Temp/dsh-harmony-mobile-20261012-v17-acceptance-unsigned.hap',bytes=await readFile(build.artifact.path)
if(createHash('sha256').update(bytes).digest('hex')!==build.artifact.sha256)throw Error('Official build artifact differs')
await copyFile(build.artifact.path,path,constants.COPYFILE_EXCL)
if(createHash('sha256').update(await readFile(path)).digest('hex')!==build.artifact.sha256)throw Error('Sealed artifact differs')
await writeFile('evidence/phase17-hap.json',JSON.stringify({path,bytes:bytes.length,sha256:build.artifact.sha256,build:'evidence/native-build/2026-10-12T04-13-34-831Z.json',toolchain:build.toolchain,bundle:'local.dsh.mobile.netreplay',requestPermissions:build.requestPermissions,signed:false,installed:false,nativeExecuted:false,forwardCreated:false,acceptanceDiagnostics:true,compiledInputsVerified:true,previousArtifactsModified:false},null,2)+'\n',{flag:'wx'})
console.log('PASS: official API26 unsigned acceptance HAP sealed; inputs verified; not installed or executed')

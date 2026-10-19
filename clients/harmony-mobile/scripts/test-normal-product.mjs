/** Focused real-service tests with scrubbed environment and test-only model injection; no live provider or installed resources. */
import {spawn,spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
const project=resolve('.'),root=JSON.parse(await readFile('source.json','utf8')).dshRoot
await mkdir('.build',{recursive:true});await mkdir('evidence',{recursive:true})
const world=await mkdtemp(join(project,'.build/normal-product-')),output=join(world,'report.json')
const require=createRequire(join(root,'package.json')),ts=require('typescript'),helper=await readFile(join(root,'vitest.shared.ts'),'utf8')
await writeFile('.build/normal-product-vitest-shared.js',ts.transpileModule(helper,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,rewriteRelativeImportExtensions:true},fileName:join(root,'vitest.shared.ts')}).outputText)
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','ComSpec'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));Object.assign(env,{TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_INTEGRATION_WORLD:world})
for(const args of [['scripts/build-product-core.mjs','--report=normal-product-native-build.json'],['scripts/product-native-substitute.mjs']]){const result=spawnSync(process.execPath,args,{cwd:project,env,windowsHide:true,stdio:'inherit'});if(result.error||result.status!==0)throw result.error??new Error('test-native source preparation failed')}
const child=spawn(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--configLoader','native','--config',join(project,'integration/normal-product.vitest.config.mjs'),'--reporter=default','--reporter=json','--outputFile='+output],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes.toString('utf8')})
const code=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept)});await writeFile('evidence/normal-product-tests.log',log.trimEnd()+'\n');const report=JSON.parse(await readFile(output,'utf8'));await writeFile('evidence/normal-product-tests.json',JSON.stringify({at:new Date().toISOString(),code,passed:report.numPassedTests,failed:report.numFailedTests,report:output,world,liveModels:0,phoneIo:false,remoteIo:false},null,2)+'\n');console.log(JSON.stringify({code,passed:report.numPassedTests,failed:report.numFailedTests,world}));if(code!==0)console.error(log.split('\n').slice(-75).join('\n'));process.exitCode=code??1

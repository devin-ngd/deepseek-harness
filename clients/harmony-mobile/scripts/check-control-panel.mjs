/** Build and test the fixed browser controls in an isolated directory; never opens a live profile. */
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {buildCommandFeedback} from './build-command-feedback.mjs'
const client=resolve('.'),root=JSON.parse(await readFile('source.json','utf8')).dshRoot,require=createRequire(join(root,'package.json'))
const version=JSON.parse(await readFile('desktop-plugin/package.json','utf8')).version,world=await mkdtemp(resolve('.build/control-panel-'+version+'-'))
const qualification=await buildCommandFeedback(join(world,'package'))
const esbuild=require(require.resolve('esbuild',{paths:[join(root,'node_modules/.pnpm')]})),model=join(world,'model.mjs')
await esbuild.build({entryPoints:[resolve('desktop-plugin/client/control-model.ts')],outfile:model,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning'})
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','ComSpec'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
Object.assign(env,{TEMP:'D:/Temp',TMP:'D:/Temp',NO_COLOR:'1',DSH_HARMONY_PANEL_MODEL:model,DSH_HARMONY_FEEDBACK_FACTORY:join(qualification.stage,'lib/client.js'),DSH_HARMONY_FEEDBACK_PACKAGE:qualification.stage})
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/command-feedback.test.mjs','tests/control-panel.test.mjs'],{cwd:client,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:262144})
const log=(result.stdout??'')+(result.stderr??'');await writeFile(join(world,'tests.tap'),log)
const count=name=>Number(log.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]??0)
const record={at:new Date().toISOString(),version,passed:result.status===0,tests:{passed:count('pass'),failed:count('fail'),exit:result.status},qualification,world,userProfileOpened:false,identityAccess:false,modelCalls:0,network:false,installed:false}
const file='evidence/control-panel-'+version+'-'+Date.now()+'.json';await writeFile(file,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:record.passed,tests:record.tests,typeDiagnostics:qualification.typeDiagnostics,evidence:file,world}));if(!record.passed)console.error(log.slice(-10000));process.exitCode=record.passed?0:1

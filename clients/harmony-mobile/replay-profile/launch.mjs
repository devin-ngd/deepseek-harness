/** Isolated launcher for the public dsh profile; no ambient model/auth environment or user home is inherited. */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
if (process.argv.length !== 2) throw new Error('This fixed replay launcher accepts no overrides')
const home = await mkdtemp(join(tmpdir(), 'dsh-harmony-replay-')), cwd=join(home,'invocation'), profile=join(home,'profiles/harmony-mobile-replay')
await mkdir(cwd); await mkdir(profile,{recursive:true}); await mkdir(join(home,'agents')); await mkdir(join(home,'tmp'))
await writeFile(join(profile,'package.json'),JSON.stringify({name:'dsh-profile-harmony-mobile-replay',private:true,dependencies:{},dsh:{profile:{bundles:['@local/dsh-harmony-replay']}}},null,2)+'\n')
for(const name of ['cordis.yml','cordis.snapshot.yml'])await writeFile(join(profile,name),'[]\n')
await writeFile(join(profile,'cordis.patch.yml'),'[]\n')
const runtime=new URL('./runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url)
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,ComSpec:process.env.ComSpec,TEMP:join(home,'tmp'),TMP:join(home,'tmp'),DSH_HOME:home,DSH_AGENTS_HOME:join(home,'agents'),DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_OFFLINE_PROFILE:'fixed-four-v1',DSH_TELEMETRY_DISABLED:'1',NO_COLOR:'1'}
const child=spawn(process.execPath,[fileURLToPath(runtime),'--profile','harmony-mobile-replay'],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes.toString();process.stdout.write(bytes)})
const code=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept)})
await writeFile(join(home,'launch.log'),log.trimEnd()+'\n')
if(code!==0)throw new Error('Fixed replay profile failed with exit '+code+'; isolated diagnostics: '+home)
const result=JSON.parse(await readFile(join(home,'result.json'),'utf8'))
console.log(JSON.stringify({isolatedHome:home,...result}));process.exitCode=code

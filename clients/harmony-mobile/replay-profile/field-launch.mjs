/** Explicit isolated field launcher. Only dsh launches the replay app; no credentials/grant/network action occurs until its local UI decision. */
import { mkdir, readFile, writeFile, lstat, realpath, readdir } from 'node:fs/promises'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
if(process.argv.length!==4||process.argv[2]!=='--home')throw new Error('Use --home with an explicitly approved isolated absolute directory')
const supplied=process.argv[3];if(!isAbsolute(supplied)||resolve(supplied)!==supplied)throw new Error('absolute isolated home required');const home=supplied,personal=join(homedir(),'.dsh'),delta=relative(personal,home);if(delta===''||(!delta.startsWith('..')&&!isAbsolute(delta)))throw new Error('installed DSH home denied')
const metadata=await lstat(home);if(!metadata.isDirectory()||metadata.isSymbolicLink()||await realpath(home)!==home)throw new Error('existing isolated real directory required')
const configStat=await lstat(join(home,'field.json'));if(!configStat.isFile()||configStat.isSymbolicLink()||configStat.size>32768)throw new Error('field configuration denied');const raw=await readFile(join(home,'field.json'),'utf8'),config=JSON.parse(raw);if(Buffer.byteLength(raw)>32768||!(config.enabled===false&&['harmony-replay-field/1','harmony-replay-field/2'].includes(config.schema)||config.enabled===true&&config.schema==='harmony-replay-field/2'))throw new Error('field configuration version required')
const entries=await readdir(home);if(!entries.includes('.harmony-field-home')&&entries.some(name=>!['field.json','phone-public.json','phone-reply.json'].includes(name)))throw new Error('first field home must contain only selected public input files')
try{await writeFile(join(home,'.harmony-field-home'),'harmony-mobile-replay/1\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST'||await readFile(join(home,'.harmony-field-home'),'utf8')!=='harmony-mobile-replay/1\n')throw error}
const cwd=join(home,'invocation'),profile=join(home,'profiles/harmony-mobile-replay');await mkdir(cwd,{recursive:true});await mkdir(profile,{recursive:true});await mkdir(join(home,'agents'),{recursive:true});await mkdir(join(home,'tmp'),{recursive:true})
await writeFile(join(profile,'package.json'),JSON.stringify({name:'dsh-profile-harmony-mobile-replay',private:true,dependencies:{},dsh:{profile:{bundles:['@local/dsh-harmony-replay']}}},null,2)+'\n')
for(const name of ['cordis.yml','cordis.snapshot.yml','cordis.patch.yml'])await writeFile(join(profile,name),'[]\n')
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,ComSpec:process.env.ComSpec,TEMP:join(home,'tmp'),TMP:join(home,'tmp'),DSH_HOME:home,DSH_AGENTS_HOME:join(home,'agents'),DSH_SNAPSHOT:'replay',DSH_SNAPSHOT_REPLAY_ONLY:'1',DSH_HARMONY_OFFLINE_PROFILE:'paired-four-v1',DSH_TELEMETRY_DISABLED:'1',NO_COLOR:'1'}
const child=spawn(process.execPath,[fileURLToPath(new URL('./runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url)),'--profile','harmony-mobile-replay'],{cwd,env,windowsHide:true,stdio:'inherit'});process.exitCode=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept)})

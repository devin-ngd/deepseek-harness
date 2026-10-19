/** Preserve only staged compiler inputs which differ from the ordinary client source, without SDK/dependency directories. */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,relative,join,dirname} from 'node:path'
import {createHash} from 'node:crypto'
const build=JSON.parse(await readFile('evidence/native-build/2026-10-12T04-13-34-831Z.json','utf8')),root=resolve('.build/native-network-project'),output=resolve('evidence/phase17-compiled-input-overrides')
await mkdir(output)
const files={}
for(const [path,expected]of Object.entries(build.sourceHashes)){
  const name=relative(root,path).replaceAll('\\','/');if(name.startsWith('../')||name.includes('node_modules'))throw Error('Compiler source path outside owned staging')
  const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==expected)throw Error('Compiled input changed: '+name)
  let source
  try{source=await readFile(join('harmony',name))}catch(error){if(error.code!=='ENOENT')throw error}
  if(source&&createHash('sha256').update(source).digest('hex')===hash)continue
  const destination=join(output,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx'});files[name]={sha256:hash,bytes:bytes.length}
}
await writeFile('evidence/phase17-compiled-inputs.json',JSON.stringify({schema:'native-compiled-input-overrides/1',build:'evidence/native-build/2026-10-12T04-13-34-831Z.json',root:'evidence/phase17-compiled-input-overrides',purpose:'Overlay only these paths onto reconstructed harmony source to recover the exact compiler inputs; no dependency/toolchain files',files,dependenciesCopied:false,installed:false,nativeExecuted:false},null,2)+'\n',{flag:'wx'})
console.log('PASS: exact compiled input overrides preserved: '+Object.keys(files).length+'; no SDK/dependency copy')

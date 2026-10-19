/** Exercise the frozen ETS method and an in-memory one-line proposal against a documented algorithm guard; this is a Node SDK substitute, never native qualification. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const source='.build/phase69-review-candidate/source/harmony/entry/src/main/ets/native/NativeTransientAgreement.ets',text=await readFile(source,'utf8'),root=JSON.parse(await readFile('source.json','utf8')).dshRoot,require=createRequire(join(root,'package.json')),esbuild=require(require.resolve('esbuild',{paths:[join(root,'node_modules/.pnpm')]})),reports=[]
assert.equal(text.split("createKeyAgreement('ECDH')").length,2)
for(const proposal of [false,true]){
  const output=resolve('.build/phase72-agreement-'+(proposal?'proposal':'frozen')+'.js')
  await esbuild.build({stdin:{contents:"export { NativeTransientAgreement } from './"+source+"'; export { cryptoFramework, state, reset, fixturePublic } from './tests/helpers/phase35-native-sdk.mjs';",resolveDir:resolve('.')},outfile:output,bundle:true,format:'esm',platform:'node',target:'es2022',loader:{'.ets':'ts'},resolveExtensions:['.ets','.ts','.mjs','.js'],plugins:[{name:'documented-sdk-substitute',setup(build){build.onResolve({filter:/^@kit\./},()=>({path:resolve('tests/helpers/phase35-native-sdk.mjs')}));if(proposal)build.onLoad({filter:/NativeTransientAgreement[.]ets$/},()=>({contents:text.replace("createKeyAgreement('ECDH')","createKeyAgreement('ECC256')"),loader:'ts',resolveDir:resolve('.build/phase69-review-candidate/source/harmony/entry/src/main/ets/native')}))}}]})
  const module=await import(pathToFileURL(output).href);module.reset();const original=module.cryptoFramework.createKeyAgreement,calls=[]
  module.cryptoFramework.createKeyAgreement=algorithm=>{calls.push(algorithm);if(algorithm!=='ECC256')throw Object.assign(new Error('DOCUMENTED_ALGORITHM_REQUIRED'),{code:401});return original(algorithm)}
  const authority={},agreement=new module.NativeTransientAgreement(authority);await agreement.initialize(authority)
  try{if(proposal){const secret=await agreement.derive(authority,module.fixturePublic);assert.equal(secret.length,32);secret.fill(0)}else await assert.rejects(agreement.derive(authority,module.fixturePublic),error=>error.code==='agreement-derive-failed')}
  finally{agreement.close();module.cryptoFramework.createKeyAgreement=original}
  assert.deepEqual(calls,[proposal?'ECC256':'ECDH']);assert.equal(module.state.aliases.size,0);assert.equal(module.state.calls.includes('create'),false);reports.push({kind:proposal?'in-memory one-line proposal':'exact frozen ETS',requestedAlgorithm:calls[0],result:proposal?'32-byte synthetic agreement':'documented-parameter rejection',nativeDeviceQualified:false})
}
assert.equal(await readFile(source,'utf8'),text)
const report={at:new Date().toISOString(),officialReference:'https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/CryptoArchitectureKit/crypto-key-agreement-overview.md',officialTableParameter:'ECC256',frozenSourceSha256:createHash('sha256').update(text).digest('hex'),passed:2,failed:0,layer:'actual frozen ETS compiled by esbuild with a strict Node SDK substitute',realDevice:false,realIdentitiesUsed:false,network:false,frozenSourceChanged:false,applicationSourceChanged:false,proposalApplied:false,causedPhysicalFailure:'not established',reports};await writeFile('evidence/phase72-agreement-contract.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))

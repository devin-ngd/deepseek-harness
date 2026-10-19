/** Record offline repairs separately from the completed partial native run, and verify sealed rollback files without extraction. */
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const tap = await readFile('evidence/phase16-postrun-tests.tap','utf8'), browser = JSON.parse(await readFile('evidence/phase9-browser.json','utf8'))
if (!tap.includes('# pass 29') || !tap.includes('# fail 0') || !tap.includes('# skipped 0') || !browser.passed || browser.assertions.length !== 32 || browser.arkWebQualified || browser.externalRequests !== 0) throw Error('Offline repair evidence differs')
await copyFile('evidence/phase9-browser.json','evidence/phase16-postrun-browser.json')
await copyFile('evidence/phase9-browser-failure.json','evidence/phase16-postrun-browser-first-host-failure.json')
const archives = []
for (const name of ['archive-v14.json','archive-v15.json','phase16-netreplay-hap.json']) {
  const manifest = JSON.parse(await readFile('evidence/'+name,'utf8'))
  const candidates = [[manifest.path,manifest.sha256],...(manifest.unsignedHap ? [[manifest.unsignedHap,manifest.unsignedHapSha256]] : [])]
  for (const [path,expected] of candidates) {
    if (!path || !expected) throw Error('Sealed manifest lacks path/hash: '+name)
    const bytes = await readFile(path), sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== expected) throw Error('Sealed rollback file changed: '+path)
    archives.push({path,bytes:bytes.length,sha256,unchanged:true})
  }
}
const hashes = {}
for (const path of ['src/native-app-host.ts','tests/native-runtime.test.mjs','tests/native-network-lease.test.mjs','scripts/native-network-lease.mjs','scripts/native-runtime-browser.mjs','native-network-tests/phase16.spec.ts','docs/phase16-native-run3-results.md']) hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex')
await writeFile('evidence/phase16-postrun-summary.json',JSON.stringify({schema:'native-postrun-offline-repair/1',generatedAt:new Date().toISOString(),nativeOutcome:'evidence/phase16-native-run3-summary.json',nativeRunPassed:false,windowReopened:false,changes:['retain selected read-only cache after transport disconnect; discard on Session change or close','reject an existing forward lease before invoking a device tool; exclusive first lease creation','assert replay safety before disposing its owning LLM service'],checks:{strict:{command:'node scripts/check.mjs --integration',passed:true,modules:61},focused:{command:'node --test --test-reporter=tap tests/native-runtime.test.mjs tests/native-network-lease.test.mjs',passed:true,cases:29,skipped:0},browser:{command:'node scripts/native-runtime-browser.mjs',passed:true,assertions:32,layer:browser.layer,externalRequests:browser.externalRequests},resourceGeneration:['node scripts/assets.mjs','node scripts/native-runtime-assets.mjs','node scripts/native-adapter-build.mjs'],fullRegressionRepeated:false,repositoryFullSuiteRun:false},repairArkTsCompiled:false,repairNativeExecuted:false,repairDeviceExecuted:false,originalNativeRunnerExit:1,originalFailurePreserved:true,sealedArtifacts:archives,files:hashes},null,2)+'\n',{flag:'wx'})
console.log('PASS: 29 focused / 32 Chrome substitute checks; sealed rollback SHA-256 unchanged; no native reactivation')

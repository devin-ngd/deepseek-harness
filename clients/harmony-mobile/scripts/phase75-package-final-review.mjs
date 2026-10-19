/** Seal the full unsigned native/desktop review before binding its hash into the separate executable operator. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, copyFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { sealZip } from './phase75-zip.mjs'
const json=async p=>JSON.parse(await readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex'),stage=resolve('.build/phase75-complete-review-candidate'),old=resolve('.build/phase75-review-candidate')
const operator=await json('evidence/phase75-operator-tests-latest.json'),history=await json('evidence/phase75-tests-latest.json'),desktop=await json('evidence/phase75.1-desktop-closure.json'),candidate=await json('evidence/phase75-candidate.json'),build=await json(candidate.native.buildEvidence)
assert.equal(operator.code,0);assert.equal(operator.passed,119);assert.equal(history.tests,56);assert.equal(history.code,0);assert.equal((await json('evidence/phase75.1-sdk-check.json')).sdkHelperExportsLoaded,true)
assert.match(await readFile('evidence/phase75.1-strict.log','utf8'),/178 modules/);assert.match(await readFile('evidence/phase75.1-lint.log','utf8'),/0 warnings and 0 errors/)
const frozen=[]
for(const [directory,label]of[['.build/phase69-review-candidate','69'],['.build/phase73.1-review-candidate','73.1'],['.build/phase75-review-candidate','75']]){const rows=await json(join(directory,'files.sha256.json'));for(const row of rows)assert.equal(hash(await readFile(join(directory,row.file))),row.sha256);frozen.push({label,files:rows.length})}
for(const [file,digest]of Object.entries(build.sourceHashes))assert.equal(hash(await readFile(file)),digest)
assert.equal(hash(await readFile(candidate.native.path)),candidate.native.sha256)
await mkdir(stage)
for(const directory of ['native','native-project','source-before'])await cp(join(old,directory),join(stage,directory),{recursive:true,errorOnExist:true,force:false})
await cp(desktop.target,join(stage,'desktop'),{recursive:true,errorOnExist:true,force:false})
const sources=[]
async function copySource(file){const path=join(stage,'source-overlay',file);await mkdir(dirname(path),{recursive:true});await copyFile(file,path);sources.push(file)}
async function oldSources(directory,prefix=''){for(const row of await readdir(directory,{withFileTypes:true})){const file=prefix+row.name;if(file.startsWith('operations/'))continue;if(row.isDirectory())await oldSources(join(directory,row.name),file+'/');else await copySource(file)}}
await oldSources(join(old,'source-overlay'))
for(const file of ['replay-profile/src/field.ts','replay-profile/src/grant-deadline.ts','docs/phase75-operation-candidate.md','tests/phase75-operations.test.mjs','tests/phase75-operation-security.test.mjs','scripts/phase75-build-desktop.mjs','scripts/phase75-verify-desktop.mjs','scripts/phase75-build-operations.mjs','scripts/phase75-operations-test.mjs','scripts/phase75-detached-profile-test.mjs','scripts/phase75-sdk-check.mjs','scripts/phase75-zip.mjs','scripts/phase75-package-complete-review.mjs','scripts/phase75-package-final-review.mjs'])if(!sources.includes(file))await copySource(file)
for(const name of await readdir('operations/phase75'))if(name!=='plan.json')await copySource('operations/phase75/'+name)
await mkdir(join(stage,'source-before/replay-profile/src'),{recursive:true});await copyFile('.build/phase69-review-candidate/source/replay-profile/src/field.ts',join(stage,'source-before/replay-profile/src/field.ts'))
const plan=await json('operations/phase75/plan.json');delete plan.native.zip;delete plan.native.zipSha256;plan.finalPlanLocation='The separately sealed operation ZIP pins this review ZIP after its creation; this review snapshot is not executable.'
await writeFile(join(stage,'review-plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'})
const evidence=[candidate.native.buildEvidence,candidate.native.buildEvidence.replace(/json$/,'log'),'evidence/phase75-core-build.json','evidence/phase75-native-inputs.json','evidence/phase75-tests-latest.json',history.log,history.report,'evidence/phase75-operator-tests-latest.json',operator.log,'evidence/phase75.1-desktop-closure.json','evidence/phase75.1-detached-profile.json','evidence/phase75.1-detached-command.log','evidence/phase75.1-strict.log','evidence/phase75.1-lint.log','evidence/phase75.1-sdk-check.json','evidence/phase74.7-field-closeout.json','evidence/phase74.7-review-rejections.json','evidence/phase74.7-readonly-pair-history-audit.json']
for(const file of evidence){const path=join(stage,file);await mkdir(dirname(path),{recursive:true});await copyFile(file,path)}
await writeFile(join(stage,'README.md'),'# Phase75.1 complete unsigned review\n\nContains the unchanged unsigned HAP, official SDK source project, new closed alpha4 desktop, source overlay, tests and rollback preimages. The final executable plan and approval gates are in the separate operation ZIP, which pins this review ZIP; the plan cannot recursively contain its own ZIP hash. Do not upload this ZIP or its source plan to the relay. No field action is authorized by either artifact. Source overlays require the existing repository dependencies; the closed desktop remains launched only by its dsh profile. Restore only individually reviewed matching after-hash source files, never credentials, old epochs, phone data, locks or journals.\n',{flag:'wx'})
const sealed=await sealZip(stage,'D:/Temp/dsh-harmony-mobile-phase75-complete-review-candidate.zip'),result={at:new Date().toISOString(),status:'COMPLETE_REVIEW_SEALED_PENDING_HUMAN_APPROVAL',...sealed,native:candidate.native,desktop:{path:desktop.target,manifestSha256:desktop.manifestSha256,files:desktop.files},operatorTests:119,historyTests:56,frozenVerified:frozen,phoneIo:false,remoteIo:false,realGrantCreated:false,signed:false,installed:false}
await writeFile('evidence/phase75-complete-review.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'})
const exact=await json('operations/phase75/plan.json');exact.native.zip=result.archive.path;exact.native.zipSha256=result.archive.sha256;await writeFile('operations/phase75/plan.json',JSON.stringify(exact,null,2)+'\n')
console.log(JSON.stringify(result))

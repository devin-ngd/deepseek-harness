/** A pre-grant-only continuation preserves the closed attempt and all frozen artifacts; only local receipt paths and the existing remote plan anchor differ. */
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, mkdir, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const json = async p => JSON.parse(await readFile(p, 'utf8')), hash = b => createHash('sha256').update(b).digest('hex'), previous = resolve('.build/phase76-complete-operation-plan'), stage = resolve('.build/phase76.2-continuation-operation'), oldRun = 'D:/Temp/dsh-harmony-phase76-operation'
const manifest = await readFile(join(previous, 'files.sha256.json')); assert.equal(hash(manifest), '5d65b6054007d449f2e2a4b4a38abf314a535b07c7df4c56a831939d7bf1fd24')
for (const row of JSON.parse(manifest)) assert.equal(hash(await readFile(join(previous, row.file))), row.sha256)
const oldPlan = await readFile(join(previous, 'plan.json')); assert.equal(hash(oldPlan), '61b0cb2b74a33d7c47df3424314a3867602b181acedc6580f30d228e9270ab76')
const closeoutPath = 'evidence/phase76-field-closeout.json', closeout = await json(closeoutPath); assert.equal(closeout.grant.committed, false); assert.equal(closeout.grant.final, 8); assert.equal(closeout.grant.active, 0)
await mkdir(stage); await cp(previous, stage, { recursive: true, force: false, errorOnExist: true, filter: p => p !== join(previous, 'files.sha256.json') })
const plan = JSON.parse(oldPlan); plan.local.run = 'D:/Temp/dsh-harmony-phase76.2-operation'
plan.continuation = { previousRun: oldRun, previousOperator: previous, previousManifestSha256: hash(manifest), closeoutPath: resolve(closeoutPath), closeoutSha256: hash(await readFile(closeoutPath)), remotePlanSha256: hash(oldPlan), installedHapSha256: closeout.signed.sha256, specificHumanMessageId: 'Sentinel_fc1ca4c8662881918764f4f884bdc157', noGrantPreviouslyCommitted: true }
await writeFile(join(stage, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
let cli = await readFile(join(stage, 'cli.mjs'), 'utf8')
const anchor = "const planHash = hash(await bytes(join(directory, 'plan.json'), 65536)), prefix ="
assert.equal(cli.split(anchor).length, 2); cli = cli.replace(anchor, 'const planHash = PLAN.continuation.remotePlanSha256, prefix =')
cli = cli.replace("import { cleanupField } from './cleanup.mjs'", "import { cleanupField } from './cleanup.mjs'\nimport { checkPreviousAttemptClosed } from './continuation.mjs'")
cli = cli.replace("  const approved = await approval(command, approvalPath), p = PLAN.local", "  assert.equal(['sign', 'verify-sign', 'install', 'relay-prepare'].includes(command), false)\n  const approved = await approval(command, approvalPath), p = PLAN.local")
cli = cli.replace("if (command === 'init-run') { await newDirectory(p.run);", "if (command === 'init-run') { await checkPreviousAttemptClosed(location); await newDirectory(p.run);")
await writeFile(join(stage, 'cli.mjs'), cli)
const helper = `/** A closed pre-grant attempt may continue only with its original8 state and no phone proof. */
import assert from 'node:assert/strict'
import { PLAN, hash, reviewDesktop } from './policy.mjs'
import { json, bytes, absent } from './io.mjs'
import { desktopState } from './local.mjs'
/** @param value - prior closed operation summary. @returns after refusing any committed grant, unknown cleanup or changed original data. */
export function reviewPregrantCloseout(value) {
  assert.equal(value.status, 'INSTALLED_CLOSED_BEFORE_GRANT_AUTO_REVIEW_BLOCKED'); assert.equal(value.grant.committed, false); assert.equal(value.grant.final, 8); assert.equal(value.grant.active, 0)
  assert.equal(value.local.ownerCleanup.confirmedGrant, false); assert.equal(value.local.ownerCleanup.resourcesClosed && value.local.ownerCleanup.revocationSucceeded, true)
  assert.equal(value.local.integrity.originalSessionUnchanged && value.local.integrity.originalPublicConfigRestored, true); assert.equal(value.local.integrity.fieldOwnerLockPresent, false)
  assert.equal(value.local.cleanup.relayCleanup.restored, true); assert.equal(value.phoneFinal.value.pid, ''); assert.equal(value.reviewBlocker.signatureAttemptFilePresent, false)
}
/** @param location - frozen locators. @returns after immutable prior receipts plus current original8 and public field bytes are checked; never resets or restores credentials. */
export async function checkPreviousAttemptClosed(location) {
  const c = PLAN.continuation, raw = await bytes(c.closeoutPath, 1048576); assert.equal(hash(raw), c.closeoutSha256); reviewPregrantCloseout(JSON.parse(raw.toString('utf8')))
  for (const file of ['native-enrollment-sign-attempt.json']) await absent(c.previousRun + '/' + file)
  const previous = await json(c.previousRun + '/continuation.json'); assert.equal(previous.stage, 'closed-before-grant-auto-review-blocked'); assert.equal(previous.grantCommitted, false)
  for (const file of ['phone-reply.json', 'phone-pair.json', 'relay-pair.json', 'grant-lifetime.json']) await absent(previous.exchange + '/' + file)
  assert.equal((await json(c.previousRun + '/exit.json')).code, 1); assert.equal(hash(await bytes(PLAN.local.home + '/field.json', 65536)), PLAN.local.fieldBeforeSha256)
  reviewDesktop(await desktopState(location), 8, Date.now()); await absent(PLAN.local.world + '.field-owner.lock')
}
`
await writeFile(join(stage, 'continuation.mjs'), helper, { flag: 'wx' })
const rows = []; async function scan(dir) { for (const row of await readdir(dir, { withFileTypes: true })) { const p = join(dir, row.name); if (row.isDirectory()) await scan(p); else { const b = await readFile(p); rows.push({ file: p.slice(stage.length + 1).replaceAll('\\', '/'), bytes: b.length, sha256: hash(b) }) } } } await scan(stage); rows.sort((a,b) => a.file.localeCompare(b.file)); const output = Buffer.from(JSON.stringify(rows,null,2)+'\n'); await writeFile(join(stage,'files.sha256.json'),output,{flag:'wx'})
const approval = await json('evidence/phase76-execution-approval.json'); Object.assign(approval, { planSha256: hash(await readFile(join(stage,'plan.json'))), manifestSha256: hash(output), sourceHumanMessageId: 'Sentinel_fc1ca4c8662881918764f4f884bdc157', sourceHumanAt: '2026-10-17T12:28:15Z', replyToRequestMessageId: 'Sentinel_11c0f4ad4980819185514a3c1a2648f0', requestAt: '2026-10-17T12:25:47Z', originalScopeApprovalMessageId: 'Sentinel_b8bef134eae0819195934289dab80765', specificRequest: '是否明确允许用原手机既有的 HUKS 密钥，对下一份配对挑战签名，继续刚才批准、尚未开始的唯一一次30分钟测试？密钥仍留在手机内，不导出', humanReply: '允许' })
await writeFile('evidence/phase76.2-execution-approval.json',JSON.stringify(approval,null,2)+'\n',{flag:'wx'})
const result={at:new Date().toISOString(),stage,files:rows.length,planSha256:approval.planSha256,manifestSha256:approval.manifestSha256,originalArtifactsUnchanged:true,remoteRunnerUnchanged:hash(await readFile(join(stage,'relay-runner.mjs')))===hash(await readFile(join(previous,'relay-runner.mjs'))),newIdentity:false,installCommandsDisabled:true,priorAttemptRetained:true,grant9StillUnused:true,remotePlanAnchor:plan.continuation.remotePlanSha256}
await writeFile('evidence/phase76.2-continuation.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result))

/** Prepare the inactive successor from the existing operator; historical directories and approved records are never modified. */
import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), source = 'operations/phase75', target = 'operations/phase76'
await mkdir(target)
for (const file of await readdir(source)) { if (file === 'continuation-plan.json') continue; const raw = await readFile(join(source, file), 'utf8'); await writeFile(join(target, file), raw.replaceAll('phase75', 'phase76').replaceAll('Phase75', 'Phase76').replaceAll('PHASE75', 'PHASE76'), { flag: 'wx' }) }
const plan = JSON.parse(await readFile(join(target, 'plan.json'), 'utf8')), raw = await readFile('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-vQfb8Y/phone-pair.json', 'utf8'), publicDocument = JSON.parse(raw), native = JSON.parse(await readFile('evidence/phase76.1-candidate.json', 'utf8')).native
assert.equal(publicDocument.record.paired.grant.epoch, 7); assert.equal(publicDocument.history.length, 3)
plan.pairId = 'harmony-phase76-successor-20261017'; plan.epochs = { previousGrant: 7, previousRevokedFloor: 6, phoneGrant: 7, phoneRevokedFloor: 6, before: 8, grant: 9, after: 10, relayPair: 1 }
plan.limits.readyObservationMs = 60000
Object.assign(plan.local, { run: 'D:/Temp/dsh-harmony-phase76-operation', retainedPublicPath: 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-vQfb8Y/phone-pair.json', retainedPublicSha256: hash(raw), retainedCanonicalSha256: hash(JSON.stringify(publicDocument)), phoneCanonicalSha256: hash(JSON.stringify(publicDocument)), retainedExpiresAt: publicDocument.record.paired.grant.expiresAt, phoneHistoryLength: 3, retainedHistoryLength: 3, desktop: 'D:/workspace/agents/deepseek-harness/clients/harmony-mobile/.build/phase76-desktop-candidate', desktopInventorySha256: null })
Object.assign(plan.native, { hap: native.path, bytes: native.bytes, sha256: native.sha256, zip: null, zipSha256: null, signedOutput: 'D:/Temp/dsh-harmony-mobile-20261017-phase76-signed.hap' })
plan.relay.drop = '/etc/systemd/system/harmony-relay.service.d/76-phase76-successor.conf'
plan.relay.priorDrops.push('/etc/systemd/system/harmony-relay.service.d/75-phase75-successor.conf')
plan.relay.retainedPublicState = ['/home/devin/harmony-relay/phase75-successor/state/public.jsonl', '/home/devin/harmony-relay/phase75-successor/state/public.jsonl.head']
plan.confirmationScopes = plan.confirmationScopes.map(scope => scope.replace('one-epoch7-fixed-replay-window-and-epoch8-revocation', 'one-epoch9-fixed-replay-window-and-epoch10-revocation'))
plan.stopOn = plan.stopOn.map(value => value.replace('epoch-not-6', 'epoch-not-8')); plan.approved = false
await writeFile(join(target, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
for (const [file, from, to] of [['policy.mjs', 'phone.history.length, 1', 'phone.history.length, PLAN.local.phoneHistoryLength'], ['policy.mjs', 'retained.history.length, 2', 'retained.history.length, PLAN.local.retainedHistoryLength'], ['local.mjs', '.build/phase76.1-desktop-candidate', '.build/phase76-desktop-candidate'], ['native.mjs', '.build/native-history-candidate-project', '.build/native-control-diagnostics-project']]) { const path = join(target, file), text = await readFile(path, 'utf8'); if (text.includes(from)) await writeFile(path, text.replaceAll(from, to)) }
console.log(JSON.stringify({ directory: target, approved: false, epochs: plan.epochs, rawPreviousHash: plan.local.retainedPublicSha256, phoneIo: false, remoteIo: false, grantCreated: false }))

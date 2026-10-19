/** Offline operator tests use historical public fixtures, synthetic observations and memory-only maintenance adapters. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
const work = resolve(process.env.HARMONY_PHASE75_TEST_PACKAGE ?? '.build/phase75-operations-work'), load = file => import(pathToFileURL(join(work, file)).href)
const { PLAN, hash, fresh, reviewDesktop, reviewPhoneState, reviewPrevious, reviewNext, reviewNextFields, reviewPair, requireUnusedPair, statePath, dropIn, reviewDrop, relayConfig, reviewCleanup, reviewApprovalRecord } = await load('policy.mjs')
const { activateMaintenance, restoreMaintenance } = await load('maintenance.mjs'), { reviewPayload, originalSigningProfile, verifyNativeLaunch } = await load('native.mjs')
const { record, absent, noLinks, newDirectory, bytes: readBytes, json: readJson, verifyPinnedFile } = await load('io.mjs'), { canonicalPublicTrust, successorHistory } = await load('shared.mjs')
const { verifyPublicState, acknowledgePublicState } = await load('public-state-check.mjs')
const { fieldLaunchArguments, reviewPreExchangeExit } = await load('local.mjs')
const read = async file => JSON.parse(await readFile(join(work, file), 'utf8'))
const retainedRaw = await readFile(join(work, 'historical-v2.fixture.json'), 'utf8'), old = await read('historical-v2.fixture.json'), oldPair = await read('historical-relay.fixture.json'), phoneOld = await read('phone-anchor.fixture.json'), now = Math.max(Date.now(), old.record.paired.expiresAt + 1000)
const originalNginx = await readFile(join(work, 'nginx.before.fixture.conf')), duringNginx = await readFile(join(work, 'nginx.during.conf'))
function desktop(epoch = 6) { return { observedAt: now, identities: [{ fingerprint: PLAN.identity.desktopFingerprint, protectedBytesPresent: true }], grants: [{ ...structuredClone(old.record.paired.grant), revoked: true, epoch, expiresAt: epoch === 8 ? now + 600000 : old.record.paired.grant.expiresAt }], activeGrantCount: 0 } }
function phone() { return { observedAt: now, targetRef: PLAN.native.targetRef, originalIdentityMatched: true, publicReadSucceeded: true, existingLockObserved: false, ownTemporaryLockReleased: true, normalExitCompleted: true } }
function next() {
  const record = structuredClone(old.record); Object.assign(record.paired, { pairId: PLAN.pairId, expiresAt: now + 600000 }); Object.assign(record.paired.grant, { epoch: 7, expiresAt: now + 600000 })
  return { schema: 'harmony-product-public-trust/2', revoked: false, record, history: structuredClone(successorHistory(old)), previousDigest: hash(canonicalPublicTrust(old)), revokedEpoch: 6, signature: 'A'.repeat(86) }
}
test('sealed plan fixes epoch6 to7 to8 and grants no approval', () => { assert.equal(PLAN.approved, false); assert.deepEqual([PLAN.epochs.before, PLAN.epochs.grant, PLAN.epochs.after], [6, 7, 8]); assert.equal(PLAN.limits.replayResponses, 4); assert.equal(PLAN.limits.realModels + PLAN.limits.uploads + PLAN.limits.userProjects, 0) })
test('frozen Windows launcher receives its required canonical home spelling', () => { const args = fieldLaunchArguments('D:/fixture/desktop'); assert.equal(args[1], '--home'); assert.equal(args[2], 'D:\\Temp\\dsh-harmony-real-field-20261015-lEUAMM\\home') })
test('pre-exchange cleanup requires ended child, unchanged exchange set and revoked6', () => { reviewPreExchangeExit(desktop(), { code: 1, error: null }, ['old'], ['old'], now); assert.throws(() => reviewPreExchangeExit(desktop(8), { code: 1, error: null }, ['old'], ['old'], now)); assert.throws(() => reviewPreExchangeExit(desktop(), { code: 1, error: null }, ['old'], ['old', 'new'], now)); assert.throws(() => reviewPreExchangeExit(desktop(), { code: null, error: 'unknown' }, ['old'], ['old'], now)) })
test('approval metadata is tied to both the exact plan and complete file inventory without establishing human authority', () => {
  const approved = { schema: 'harmony-phase75-human-approval/1', approved: true, planSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), sourceHumanMessageId: 'synthetic-not-human-approval', scopes: PLAN.confirmationScopes }
  reviewApprovalRecord(approved, approved.planSha256, approved.manifestSha256)
  for (const key of ['approved', 'planSha256', 'manifestSha256', 'sourceHumanMessageId', 'scopes']) { const value = structuredClone(approved); value[key] = key === 'approved' ? false : key === 'scopes' ? [] : ''; assert.throws(() => reviewApprovalRecord(value, approved.planSha256, approved.manifestSha256)) }
})
test('historical complete v2 signature and original revoked6 scope validate without issuing a grant', async () => { assert.deepEqual(await reviewPrevious(JSON.stringify(phoneOld), desktop(), now, retainedRaw), old) })
test('fields-only grant7 successor retains the full grant1, grant3 and grant5 history', () => { assert.equal(reviewNextFields(JSON.stringify(next()), old, now, phoneOld).history.length, 3) })
test('fields-only result cannot bypass the required desktop signature', async () => { await assert.rejects(reviewNext(JSON.stringify(next()), old, now, phoneOld), /signature|digest/) })
for (const epoch of [1, 2, 3, 4, 5, 7, 8]) test('renewal preflight refuses tombstone epoch' + epoch, () => assert.throws(() => reviewDesktop(desktop(epoch), 6, now)))
for (const change of ['active', 'sessions', 'operations', 'identity', 'device', 'profile', 'revoked', 'freshness']) test('desktop original-owner observation refuses ' + change, () => {
  const state = desktop(); if (change === 'active') state.activeGrantCount = 1
  else if (change === 'sessions') state.grants[0].sessions = ['another-session']
  else if (change === 'operations') state.grants[0].operations.push('approval.respond')
  else if (change === 'identity') state.identities[0].fingerprint = 'other'
  else if (change === 'device') state.grants[0].deviceId = 'other'
  else if (change === 'profile') state.grants[0].profileId = 'other'
  else if (change === 'revoked') state.grants[0].revoked = false
  else state.observedAt -= 300001
  assert.throws(() => reviewDesktop(state, 6, now))
})
for (const change of ['signature', 'digest', 'history', 'old-receipt', 'old-revoked', 'grant-epoch', 'floor', 'scope', 'expiry']) test('full predecessor review refuses ' + change, async () => {
  const value = structuredClone(phoneOld)
  if (change === 'signature') value.signature = 'A'.repeat(86)
  else if (change === 'digest') value.previousDigest = '0'.repeat(64)
  else if (change === 'history') value.history = []
  else if (change === 'old-receipt') value.history[0].receipt = { previousDigest: '0'.repeat(64), revokedEpoch: 2, signature: 'AAA' }
  else if (change === 'old-revoked') value.history[0].localRevoked = true
  else if (change === 'grant-epoch') value.record.paired.grant.epoch = 1
  else if (change === 'floor') value.revokedEpoch = 4
  else if (change === 'scope') value.record.paired.grant.operations = ['task.submit']
  else value.record.paired.expiresAt = now + 1
  await assert.rejects(reviewPrevious(JSON.stringify(value), desktop(), now, retainedRaw))
})
for (const change of ['replay3', 'replay4', 'skip6', 'floor2', 'floor5', 'pair-reuse', 'trim-history', 'rewrite-history', 'digest', 'scope', 'expired', 'long-life']) test('grant7 receipt review refuses ' + change, () => {
  const value = next()
  if (change === 'replay3') value.record.paired.grant.epoch = 3
  else if (change === 'replay4') value.record.paired.grant.epoch = 4
  else if (change === 'skip6') value.record.paired.grant.epoch = 6
  else if (change === 'floor2') value.revokedEpoch = 2
  else if (change === 'floor5') value.revokedEpoch = 5
  else if (change === 'pair-reuse') value.record.paired.pairId = old.record.paired.pairId
  else if (change === 'trim-history') value.history.shift()
  else if (change === 'rewrite-history') value.history[0].record.paired.grant.epoch = 2
  else if (change === 'digest') value.previousDigest = '0'.repeat(64)
  else if (change === 'scope') value.record.paired.grant.operations.push('approval.respond')
  else if (change === 'expired') value.record.paired.grant.expiresAt = now
  else value.record.paired.expiresAt = now + 1800001
  assert.throws(() => reviewNextFields(JSON.stringify(value), old, now, phoneOld))
})
test('the previously used relay pair cannot be presented as the new pair', () => assert.throws(() => reviewPair(oldPair, now)))
test('a fresh six-field pair retains both original public fingerprints', () => assert.equal(reviewPair({ ...oldPair, pairId: PLAN.pairId, expiresAt: now + 60000 }, now).epoch, 1))
test('an existing new pair in any retained history is refused', () => assert.throws(() => requireUnusedPair([oldPair.pairId, PLAN.pairId]), /pair-already-exists/))
test('another retained old pair does not authorize or block an unused new pair', () => assert.equal(requireUnusedPair([oldPair.pairId]), undefined))
for (const key of ['existingLockObserved', 'publicReadSucceeded', 'ownTemporaryLockReleased', 'normalExitCompleted', 'originalIdentityMatched']) test('native observation stops for ' + key, () => { const value = phone(); value[key] = !value[key]; assert.throws(() => reviewPhoneState(value, now)) })
test('native missing or future observation remains unknown', () => { const value = phone(); delete value.ownTemporaryLockReleased; assert.throws(() => reviewPhoneState(value, now)); assert.throws(() => fresh(now + 30001, now)) })
for (const path of ['/home/devin/harmony-relay', PLAN.relay.state + '-other', PLAN.relay.state + '/../state', PLAN.relay.state + '/', '/tmp/state', '../state']) test('state path refuses ' + path, () => assert.throws(() => statePath(path)))
test('ReadWritePaths resets inherited entries and admits only the exact new state directory', () => { const text = dropIn(); assert.match(text, /ReadWritePaths=\nReadWritePaths=\/home\/devin\/harmony-relay\/phase75-successor\/state\n$/); assert.throws(() => reviewDrop(text + 'ReadWritePaths=/home/devin\n')); assert.throws(() => reviewDrop(text.replace('ReadWritePaths=\n', ''))) })
test('relay configuration changes only the pair and independent journal path', async () => { const template = await read('config.template.json'), pair = { ...oldPair, pairId: PLAN.pairId, expiresAt: now + 60000 }, configured = relayConfig(template, pair); const expected = structuredClone(template); expected.broker.pairs = [pair]; expected.publicTrust.path = PLAN.relay.journal; assert.deepEqual(configured, expected); assert.deepEqual(template.broker.pairs, []) })
test('confirmed grant7 requires durable revoked8 and complete resource cleanup', () => { assert.equal(reviewCleanup(desktop(8), { confirmedGrant: true, revocationSucceeded: true, resourcesClosed: true }, now).credentialsMayRestore, false); assert.throws(() => reviewCleanup(desktop(6), { confirmedGrant: true, revocationSucceeded: true, resourcesClosed: true }, now)); assert.throws(() => reviewCleanup(desktop(8), { confirmedGrant: true, revocationSucceeded: false, resourcesClosed: true }, now)); assert.throws(() => reviewCleanup(desktop(8), { confirmedGrant: true, revocationSucceeded: true, resourcesClosed: false }, now)) })
test('before-commit denial and internally revoked postcommit failure have distinct accepted tombstones', () => { for (const epoch of [6, 8]) assert.equal(reviewCleanup(desktop(epoch), { confirmedGrant: false, revocationSucceeded: true, resourcesClosed: true }, now).publicConfigMayRestore, true) })
function maintenance(failAt) {
  const files = new Map([[PLAN.relay.nginx, originalNginx], [PLAN.relay.run + '/rollback/nginx.before.conf', originalNginx]]), calls = [], counts = new Map(); let attempted = false, active = 'original'
  function step(name) { calls.push(name); const count = (counts.get(name) ?? 0) + 1; counts.set(name, count); if (failAt === name + ':' + count) { const e = new Error('synthetic failure'); e.code = 'synthetic-failure'; throw e } }
  const io = {
    exists: async path => files.has(path), read: async path => Buffer.from(files.get(path)), activationAttempted: async () => attempted,
    preflight: async () => { step('preflight'); assert.equal(files.has(PLAN.relay.drop), false) }, markAttempt: async () => { step('mark'); attempted = true },
    installDrop: async text => { step('install-drop'); files.set(PLAN.relay.drop, text) },
    moveDrop: async () => { step('move-drop'); files.set('retained-completed-drop', files.get(PLAN.relay.drop)); files.delete(PLAN.relay.drop) },
    installNginx: async () => { step('install-nginx'); files.set(PLAN.relay.nginx, duringNginx) }, restoreNginx: async () => { step('restore-nginx'); files.set(PLAN.relay.nginx, originalNginx) },
    command: async name => { step(name); if (name === 'stop') active = 'stopped'; if (name === 'start') active = files.has(PLAN.relay.drop) ? 'candidate' : 'original' },
    verifyCandidate: async () => { step('verify-candidate'); assert.equal(active, 'candidate') },
    verifyOriginal: async () => { step('verify-original'); assert.equal(active, 'original'); assert.equal(files.has(PLAN.relay.drop), false); assert.equal(hash(files.get(PLAN.relay.nginx)), PLAN.relay.originalNginxSha256) }
  }; return { io, files, calls }
}
test('successful temporary maintenance restores service/proxy while retaining completed override', async () => { const state = maintenance(); assert.equal((await activateMaintenance(state.io)).activated, true); assert.equal((await restoreMaintenance(state.io)).restored, true); assert.ok(state.files.has('retained-completed-drop')); assert.equal(state.calls.filter(value => value === 'install-drop').length, 1) })
test('restoration accepts exact file bytes after nginx already returned to its original content', async () => { const state = maintenance(); await activateMaintenance(state.io); await state.io.restoreNginx(); assert.ok(Buffer.isBuffer(await state.io.read(PLAN.relay.drop))); const result = await restoreMaintenance(state.io); assert.equal(result.restored, true); assert.equal(state.files.has(PLAN.relay.drop), false); assert.ok(state.files.has('retained-completed-drop')) })
test('invalid UTF8 or trailing data never admits a foreign override', async () => { for (const suffix of [Buffer.from([255]), Buffer.from('\0'), Buffer.from('foreign')]) { const state = maintenance(); state.files.set(PLAN.relay.drop, Buffer.concat([Buffer.from(dropIn()), suffix])); const result = await restoreMaintenance(state.io); assert.equal(result.restored, false); assert.equal(state.calls.includes('move-drop'), false); assert.equal(state.calls.includes('stop'), false) } })
for (const failure of ['install-drop:1', 'daemon-reload:1', 'stop:1', 'start:1', 'verify-candidate:1', 'install-nginx:1', 'nginx-test:1', 'nginx-reload:1', 'verify-candidate:2']) test('activation failure cleans only owned maintenance after ' + failure, async () => { const state = maintenance(failure), result = await activateMaintenance(state.io); assert.equal(result.activated, false); assert.equal(result.cleanup.restored, true); assert.equal(result.cleanup.credentialRollback, false); assert.equal(state.files.has(PLAN.relay.drop), false); assert.equal(hash(state.files.get(PLAN.relay.nginx)), PLAN.relay.originalNginxSha256); assert.equal(state.calls.filter(value => value === 'install-drop').length, 1) })
test('preflight rejection creates no maintenance attempt or cleanup action', async () => { const state = maintenance('preflight:1'); await assert.rejects(activateMaintenance(state.io)); assert.deepEqual(state.calls, ['preflight']) })
test('foreign unit and nginx content remain untouched and cleanup is visibly unknown', async () => { const state = maintenance(); state.files.set(PLAN.relay.drop, 'foreign'); state.files.set(PLAN.relay.nginx, Buffer.from('foreign')); const result = await restoreMaintenance(state.io); assert.equal(result.restored, false); assert.equal(state.files.get(PLAN.relay.drop), 'foreign'); assert.equal(state.files.get(PLAN.relay.nginx).toString(), 'foreign'); assert.equal(state.calls.includes('move-drop'), false); assert.equal(state.calls.includes('restore-nginx'), false) })
test('cleanup failure is independent of activation failure', async () => { const state = maintenance('start:1'), original = state.io.restoreNginx; state.io.verifyOriginal = async () => { throw new Error('unverified') }; const result = await activateMaintenance(state.io); assert.equal(result.activated, false); assert.equal(result.cleanup.restored, false); assert.ok(result.cleanup.errors.some(error => error.operation === 'verification')); assert.equal(typeof original, 'function') })
test('an installed exact override is cleaned even when its writer reports failure afterwards', async () => { const state = maintenance(), install = state.io.installDrop; state.io.installDrop = async text => { await install(text); throw new Error('write completion unknown') }; const result = await activateMaintenance(state.io); assert.equal(result.activated, false); assert.equal(result.cleanup.restored, true); assert.equal(state.files.has(PLAN.relay.drop), false) })
test('a changed exact nginx file is restored after a writer reports failure afterwards', async () => { const state = maintenance(), install = state.io.installNginx; state.io.installNginx = async () => { await install(); throw new Error('write completion unknown') }; const result = await activateMaintenance(state.io); assert.equal(result.activated, false); assert.equal(result.cleanup.restored, true); assert.equal(hash(state.files.get(PLAN.relay.nginx)), PLAN.relay.originalNginxSha256) })
test('a partial unit write remains retained with unknown cleanup rather than being deleted as foreign state', async () => { const state = maintenance(); state.io.installDrop = async () => { state.files.set(PLAN.relay.drop, '[Service]\npartial'); throw new Error('partial write') }; const result = await activateMaintenance(state.io); assert.equal(result.activated, false); assert.equal(result.cleanup.restored, false); assert.equal(state.files.get(PLAN.relay.drop), '[Service]\npartial') })
test('existing lock and operation directory remain intact after refusal', async () => { const directory = await mkdtemp(join(tmpdir(), 'harmony-phase75-offline-lock-')), lock = join(directory, 'mobile-product-public-trust.owner-lock'); await mkdir(lock); await assert.rejects(absent(lock), /path-already-exists/); await assert.rejects(newDirectory(directory), { code: 'EEXIST' }); assert.equal((await lstat(lock)).isDirectory(), true) })
test('a junction ancestor cannot redirect a state or public-file operation', async () => { const directory = await mkdtemp(join(tmpdir(), 'harmony-phase75-offline-link-')), target = join(directory, 'target'), link = join(directory, 'link'); await mkdir(target); await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(noLinks(join(link, 'state')), /symlink-denied/) })
test('exclusive start record cannot be overwritten or silently reused', async () => { const directory = await mkdtemp(join(tmpdir(), 'harmony-phase75-offline-')); const file = join(directory, 'attempt.json'); await record(file, { once: true }); await assert.rejects(record(file, { once: false }), { code: 'EEXIST' }); await assert.rejects(absent(directory), /path-already-exists/); assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { once: true }) })
test('only pinned manifest verification admits an empty dependency; ordinary bytes and JSON refuse it', async () => { const directory = await mkdtemp(join(tmpdir(), 'harmony-phase75-offline-empty-')), file = join(directory, 'empty'); await writeFile(file, '', { flag: 'wx' }); await verifyPinnedFile(file, { bytes: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }, 1); await assert.rejects(readBytes(file, 1), /public-file-empty/); await assert.rejects(readJson(file), /public-file-empty/); await assert.rejects(verifyPinnedFile(file, { bytes: 0, sha256: '0'.repeat(64) }, 1), /manifest-file-mismatch/) })
for (const empty of ['journal', 'head']) test('empty ' + empty + ' cannot acknowledge initialization or pass activation preflight', async () => {
  const read = async path => Buffer.from((empty === 'head') === path.endsWith('.head') ? '' : '{}'), writes = []
  await assert.rejects(acknowledgePublicState({ read, record: async (...args) => { writes.push(args) } }, '/fixture/public.jsonl', '/fixture/result.json', now))
  assert.equal(writes.length, 0); const state = maintenance(); state.io.preflight = () => verifyPublicState(read, '/fixture/public.jsonl'); await assert.rejects(activateMaintenance(state.io)); assert.equal(state.calls.includes('mark'), false)
})
test('nonempty journal and head produce one initialization completion receipt', async () => { const writes = [], result = await acknowledgePublicState({ read: async () => Buffer.from('{}'), record: async (...args) => { writes.push(args) } }, '/fixture/public.jsonl', '/fixture/result.json', now); assert.equal(result.completed, true); assert.equal(writes.length, 1) })
function payload() { const bitmap = Buffer.from('synthetic SDK metadata'); return { bitmap, report: { metadata: { bundleName: PLAN.native.bundle, versionCode: 1, versionName: '0.0.0', permissions: PLAN.native.permissions }, inputEntries: [{ path: 'module.json', bytes: 1, sha256: 'a' }], signedEntries: [{ path: 'module.json', bytes: 1, sha256: 'a' }, { path: '.pages.info', bytes: bitmap.length, sha256: hash(bitmap) }] } } }
test('signing verification admits only exact application entries and independently derived metadata', () => { const { report, bitmap } = payload(); reviewPayload(report, bitmap); report.signedEntries[0].sha256 = 'changed'; assert.throws(() => reviewPayload(report, bitmap)) })
test('original signing public profile is resolved beside home rather than inside the Session world', () => { const profile = originalSigningProfile(); assert.equal(profile.path.replaceAll('\\', '/'), 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/phase59-signature-verification/profile.p7b'); assert.equal(profile.path.replaceAll('\\', '/').startsWith(PLAN.local.world + '/'), false); assert.equal(profile.sha256, 'b1bde9b3aa532b1236fe99684edeed466bb7efee7798781c24757bd93490c1aa') })
test('AA exit0 cannot mask keyguard rejection or an absent native process', () => { verifyNativeLaunch('start ability successfully', '123'); assert.throws(() => verifyNativeLaunch('Error Code: 10106102', ''), /native-launch-refused-10106102/); assert.throws(() => verifyNativeLaunch('start ability successfully', ''), /native-launch-refused-no-process/); assert.throws(() => verifyNativeLaunch('failed to start ability', '123'), /native-launch-refused/) })
test('signing verification refuses added permission, duplicate entry and unverified metadata', () => { for (const change of ['permission', 'duplicate', 'bitmap']) { const { report, bitmap } = payload(); if (change === 'permission') report.metadata.permissions = ['ohos.permission.INTERNET', 'other']; else if (change === 'duplicate') report.signedEntries.push(report.signedEntries[0]); else report.signedEntries[1].sha256 = 'other'; assert.throws(() => reviewPayload(report, bitmap)) } })
test('live CLI cannot use a canned approval record from a noninteractive test process', () => { const result = spawnSync(process.execPath, [join(work, 'cli.mjs'), 'start-field', 'not-an-approval.json'], { encoding: 'utf8' }); assert.equal(result.status, 1); assert.match(result.stderr, /automaticRetryAllowed.*false/) })
test('the default offline package verifier preserves both native sealed deliverables', () => { const result = spawnSync(process.execPath, [join(work, 'cli.mjs'), 'verify'], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).liveOperations, 0) })

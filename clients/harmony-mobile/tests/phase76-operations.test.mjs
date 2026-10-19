/** Public historical fixtures, closed desktop modules and synthetic IO only; no field credentials, phone or SSH. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const work = resolve(process.env.HARMONY_PHASE76_TEST_PACKAGE ?? '.build/phase76-operations-work'), load = file => import(pathToFileURL(join(work, file)).href)
const { PLAN, hash, reviewDesktop, reviewPrevious, reviewNext, reviewNextFields, reviewPair, reviewCleanup, reviewApprovalRecord, requireUnusedPair } = await load('policy.mjs')
const { canonicalPublicTrust, successorHistory } = await load('shared.mjs'), { reviewConnectReadyUi } = await load('ready-ui.mjs'), { selectedControl } = await load('exercise.mjs')
const desktopRoot = resolve('.build/phase76-desktop-candidate'), lib = join(desktopRoot, 'runtime/node_modules/@local/dsh-harmony-replay/lib')
const { fieldConfigSchema, consumePhoneConnectReady, reviewPhoneConnectReady, GrantDeadline } = await import(pathToFileURL(join(lib, 'history-verification.mjs')).href)
const read = async file => JSON.parse(await readFile(join(work, file), 'utf8')), raw = await readFile(join(work, 'historical-v2.fixture.json'), 'utf8'), prior = JSON.parse(raw), phone = await read('phone-anchor.fixture.json'), pair = await read('historical-relay.fixture.json'), now = Math.max(Date.now(), prior.record.paired.expiresAt + 1)
const document = (() => { const record = structuredClone(prior.record); record.paired.pairId = PLAN.pairId; record.paired.expiresAt = now + 1800000; Object.assign(record.paired.grant, { epoch: 9, expiresAt: now + 1800000 }); return { schema: 'harmony-product-public-trust/2', revoked: false, record, history: successorHistory(prior), previousDigest: hash(canonicalPublicTrust(prior)), revokedEpoch: 8, signature: 'A'.repeat(86) } })()
const documentSha256 = hash(JSON.stringify(document)), policy = { path: 'D:/Temp/synthetic/phone-ready.json', planSha256: 'a'.repeat(64), targetRef: PLAN.native.targetRef, bundle: PLAN.native.bundle, maxAgeMs: 60000 }
const ready = () => ({ schema: 'harmony-phone-connect-ready/1', observedAt: now, pairId: PLAN.pairId, grantEpoch: 9, expiresAt: document.record.paired.expiresAt, documentSha256, planSha256: policy.planSha256, targetRef: policy.targetRef, bundle: policy.bundle, phonePid: 1234, state: 'paired-connect-ready' })
function state(epoch = 8) { return { observedAt: now, identities: [{ fingerprint: PLAN.identity.desktopFingerprint, protectedBytesPresent: true }], grants: [{ ...prior.record.paired.grant, revoked: true, epoch, expiresAt: epoch === 8 ? prior.record.paired.grant.expiresAt : document.record.paired.grant.expiresAt }], activeGrantCount: 0 } }
test('plan binds the original identity, Session, ten operations, one9→10 window and four replay responses', () => { assert.equal(PLAN.approved, false); assert.deepEqual(PLAN.epochs, { previousGrant: 7, previousRevokedFloor: 6, phoneGrant: 7, phoneRevokedFloor: 6, before: 8, grant: 9, after: 10, relayPair: 1 }); assert.equal(PLAN.operations.length, 10); assert.equal(PLAN.limits.grantMs, 1800000); assert.equal(PLAN.limits.replayResponses, 4); assert.equal(PLAN.limits.readyObservationMs, 60000); assert.equal(PLAN.limits.realModels + PLAN.limits.uploads + PLAN.limits.userProjects, 0) })
test('original complete7 and revoked8 validate without creating a grant', async () => assert.deepEqual(await reviewPrevious(JSON.stringify(phone), state(), now, raw), prior))
test('fields-only final9 retains1,3,5,7 but fabricated signatures cannot activate it', async () => { assert.equal(reviewNextFields(JSON.stringify(document), prior, now, phone).history.length, 4); await assert.rejects(reviewNext(JSON.stringify(document), prior, now, phone), /signature|digest/) })
for (const epoch of [2, 4, 6, 7, 9, 10]) test('preflight rejects revoked' + epoch + ' instead of8', () => assert.throws(() => reviewDesktop(state(epoch), 8, now)))
for (const change of ['old-pair', 'scope', 'floor', 'history', 'expiry', 'epoch', 'digest']) test('fields-only final9 rejects ' + change, () => {
  const next = structuredClone(document)
  if (change === 'old-pair') next.record.paired.pairId = prior.record.paired.pairId
  if (change === 'scope') next.record.paired.grant.operations.push('approval.respond')
  if (change === 'floor') next.revokedEpoch = 6
  if (change === 'history') next.history.pop()
  if (change === 'expiry') next.record.paired.expiresAt = now + 1800001
  if (change === 'epoch') next.record.paired.grant.epoch = 7
  if (change === 'digest') next.previousDigest = '0'.repeat(64)
  assert.throws(() => reviewNextFields(JSON.stringify(next), prior, now, phone))
})
test('relay permits exactly six public fields and refuses every extra desktop or capability field', () => {
  const selected = { ...pair, pairId: PLAN.pairId, expiresAt: now + 60000 }; reviewPair(selected, now)
  for (const key of ['session', 'deviceId', 'profileId', 'credentialId', 'token', 'roomCapability', 'privatePkcs8']) assert.throws(() => reviewPair({ ...selected, [key]: 'synthetic-never-upload' }, now))
  assert.throws(() => requireUnusedPair([PLAN.pairId])); assert.ok(PLAN.relay.run.endsWith('/phase76-successor')); assert.equal(PLAN.relay.code, '/home/devin/harmony-relay/phase69-successor')
})
test('old approval cannot authorize this plan or incomplete scopes', () => { const a = { schema: 'harmony-phase76-human-approval/1', approved: true, planSha256: 'a', manifestSha256: 'b', sourceHumanMessageId: 'synthetic-test-only', scopes: PLAN.confirmationScopes }; reviewApprovalRecord(a, 'a', 'b'); for (const value of [{ ...a, schema: 'harmony-phase75-human-approval/1' }, { ...a, scopes: [] }, { ...a, planSha256: 'old' }, { ...a, approved: false }]) assert.throws(() => reviewApprovalRecord(value, 'a', 'b')) })
test('closed desktop config rejects missing readiness before any key or grant IO', async () => { const config = JSON.parse(await readFile('replay-profile/field.enabled.example.json', 'utf8')); fieldConfigSchema.parse(config); delete config.connectReady; assert.throws(() => fieldConfigSchema.parse(config)); fieldConfigSchema.parse({ schema: 'harmony-replay-field/2', enabled: false }) })
test('exact ready9 matches the canonical final document and unchanged expiry', () => assert.deepEqual(reviewPhoneConnectReady(ready(), { paired: document.record.paired, documentSha256, policy }, now), ready()))
for (const key of ['observedAt-stale', 'observedAt-future', 'pairId', 'grantEpoch', 'expiresAt', 'documentSha256', 'planSha256', 'targetRef', 'bundle', 'phonePid', 'state', 'extra']) test('closed readiness refuses ' + key, () => {
  const value = ready()
  if (key === 'observedAt-stale') value.observedAt = now - 60001
  else if (key === 'observedAt-future') value.observedAt = now + 1
  else if (key === 'phonePid') value.phonePid = 0
  else if (key === 'expiresAt') value.expiresAt++
  else if (key === 'grantEpoch') value.grantEpoch = 7
  else if (key === 'extra') value.extra = 'denied'
  else value[key] = key.endsWith('Sha256') ? '0'.repeat(64) : 'foreign'
  assert.throws(() => reviewPhoneConnectReady(value, { paired: document.record.paired, documentSha256, policy }, now))
})
const strings = new Map([['product_paired', 'paired'], ['product_disconnected', 'disconnected'], ['product_operation_failed', 'failed']]), ui = () => [{ type: 'Button', id: 'product-connect', enabled: 'true', visible: 'true' }, { text: 'paired', visible: 'true' }, { text: 'disconnected', visible: 'true' }]
test('ready UI requires paired plus disconnected and one visible enabled original Connect button', () => assert.equal(reviewConnectReadyUi(ui(), strings).id, 'product-connect'))
for (const variant of ['hidden', 'disabled', 'duplicate', 'failed', 'connected', 'not-paired']) test('ready UI refuses ' + variant, () => { const nodes = ui(); if (variant === 'hidden') nodes[0].visible = 'false'; if (variant === 'disabled') nodes[0].enabled = 'false'; if (variant === 'duplicate') nodes.push(nodes[0]); if (variant === 'failed') nodes.push({ text: 'failed', visible: 'true' }); if (variant === 'connected') nodes[2].text = 'connected'; if (variant === 'not-paired') nodes[1].text = 'unpaired'; assert.throws(() => reviewConnectReadyUi(nodes, strings)) })
async function fixture() { const root = await mkdtemp('D:/Temp/harmony-phase76-offline-ready-'); return { root, p: { ...policy, path: join(root, 'phone-ready.json') } } }
test('slow phone preparation consumes no desktop attempts before readiness and preserves the original deadline', async () => {
  const f = await fixture(); let dials = 0, clock = now
  const start = async () => { await consumePhoneConnectReady(f.p, document.record, document, () => clock); dials++ }
  await assert.rejects(start(), { code: 'ENOENT' }); clock += 155143; assert.equal(dials, 0)
  await writeFile(f.p.path, JSON.stringify({ ...ready(), observedAt: clock })); await start(); assert.equal(dials, 1)
  const consumed = JSON.parse(await readFile(join(f.root, 'phone-ready-consumed.json'), 'utf8')); assert.equal(consumed.at, clock); assert.equal(consumed.documentSha256, documentSha256); assert.equal(document.record.paired.grant.expiresAt, now + 1800000)
  await assert.rejects(start(), { code: 'EEXIST' }); assert.equal(dials, 1)
})
test('expiry during exclusive readiness consumption prevents the first desktop dial', async () => { const f = await fixture(); await writeFile(f.p.path, JSON.stringify(ready())); let reads = 0, dials = 0; await assert.rejects(async () => { await consumePhoneConnectReady(f.p, document.record, document, () => ++reads < 3 ? now : document.record.paired.grant.expiresAt); dials++ }); assert.equal(dials, 0); JSON.parse(await readFile(join(f.root, 'phone-ready-consumed.json'), 'utf8')) })
test('readiness cannot survive revoked or expired original authorization', () => { const revoked = structuredClone(document.record.paired); revoked.grant.revoked = true; assert.throws(() => reviewPhoneConnectReady(ready(), { paired: revoked, documentSha256, policy }, now)); assert.throws(() => reviewPhoneConnectReady(ready(), { paired: document.record.paired, documentSha256, policy }, document.record.paired.grant.expiresAt)) })
test('oversized readiness and linked directories are refused without dialing', async () => { const f = await fixture(); await writeFile(f.p.path, 'x'.repeat(8193)); await assert.rejects(consumePhoneConnectReady(f.p, document.record, document, () => now), /file denied/); const child = join(f.root, 'real'); await mkdir(child); await writeFile(join(child, 'phone-ready.json'), JSON.stringify(ready())); const link = join(f.root, 'link'); await symlink(child, link, 'junction'); await assert.rejects(consumePhoneConnectReady({ ...f.p, path: join(link, 'phone-ready.json') }, document.record, document, () => now), /path denied/) })
test('deadline aborts pending phone readiness at the original30minutes; cleanup requires revoked10', () => { let clock = now, callback, cancelled = 0; const deadline = new GrantDeadline(now + 1800000, new AbortController().signal, () => clock, { after(ms, fn) { assert.equal(ms, 1800000); callback = fn; return () => cancelled++ } }); clock += 155143; assert.equal(deadline.signal.aborted, false); clock = now + 1800000; callback(); assert.equal(deadline.signal.aborted, true); deadline.close(); deadline.close(); assert.equal(cancelled, 1); reviewCleanup(state(10), { confirmedGrant: true, revocationSucceeded: true, resourcesClosed: true }, now); assert.throws(() => reviewCleanup(state(8), { confirmedGrant: true, revocationSucceeded: true, resourcesClosed: true }, now)) })
test('synthetic phone exercise requires an empty composer, exact original Session and unique enabled controls', () => { const node = { type: 'TextInput', id: 'product-composer', text: '', visible: 'true', enabled: 'true' }; selectedControl([node], 'input-task', strings); assert.throws(() => selectedControl([{ ...node, text: 'user draft' }], 'input-task', strings)); assert.throws(() => selectedControl([{ ...node, enabled: 'false' }], 'input-task', strings)); assert.throws(() => selectedControl([], 'arbitrary-host-command', strings)) })
test('the closed desktop and HAP use identical controller sources while original bindings and assets remain unchanged', async () => {
  const update = JSON.parse(await readFile(join(desktopRoot, 'control-update.json'), 'utf8')), core = JSON.parse(await readFile('evidence/phase76-core-build.json', 'utf8')).reports.find(row => row.entry === 'src/native-paired-bridge.ts')
  assert.equal(update.originalBindingOwnersRetained && update.mandatoryOneUseReadinessBeforePlugin, true); assert.equal(update.assetsChanged, false)
  for (const file of update.nativeMatched) { assert.equal(hash(await readFile(file)), core.sourceHashes[file]); assert.equal(update.inputs.find(row => row.file === file).sha256, core.sourceHashes[file]) }
  const rows = JSON.parse(await readFile(join(desktopRoot, 'files.sha256.json'), 'utf8')), old = JSON.parse(await readFile('.build/phase75.1-desktop-candidate/files.sha256.json', 'utf8')), changed = old.filter(row => rows.find(next => next.file === row.file)?.sha256 !== row.sha256)
  assert.deepEqual(changed.map(row => row.file).sort(), ['runtime/node_modules/@local/dsh-harmony-replay/lib/history-verification.mjs', 'runtime/node_modules/@local/dsh-harmony-replay/lib/index.js']); assert.equal(rows.length, old.length + 1)
  const entry = await readFile(join(lib, 'index.js'), 'utf8'); assert.ok(entry.indexOf('await consumePhoneConnectReady(') < entry.indexOf('firstUse.install(authority)')); assert.match(entry, /DSH_CONTROL_STAGE=desktop-/)
})
test('operator preserves old75 public state and refuses live actions without a new verified human approval', async () => {
  const relay = await readFile(join(work, 'relay.mjs'), 'utf8'), cli = await readFile(join(work, 'cli.mjs'), 'utf8'); assert.match(relay, /retainedPublicState/); assert.match(relay, /assert\.deepEqual\(current/)
  assert.deepEqual(PLAN.relay.retainedPublicState, ['/home/devin/harmony-relay/phase75-successor/state/public.jsonl', '/home/devin/harmony-relay/phase75-successor/state/public.jsonl.head']); assert.match(cli, /PLAN\.assemblyReady/)
  const { main } = await load('cli.mjs'); await assert.rejects(main(['start-field'])); await assert.rejects(main(['native-ui', undefined, 'connect'])); await assert.rejects(main(['native-exercise', undefined, 'send-task']))
})

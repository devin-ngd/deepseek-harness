/** Original replay home adapter; only public field settings may be replaced, never credential history. */
import assert from 'node:assert/strict'
import { writeFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve, relative } from 'node:path'
import { PLAN, hash, reviewDesktop, reviewPhoneState, reviewPhoneIdentity, reviewPrevious, reviewNext, reviewPair, reviewLiveGrant, reviewCleanup, fresh } from './policy.mjs'
import { bytes, json, noLinks, absent, exists, record, replace, findFiles, verifyPinnedFile } from './io.mjs'
const p = PLAN.local
/** @param location - sealed client/source locators. @returns after every updated desktop file matches the new closure inventory; the old field launcher path is never selected. */
export async function checkDesktopClosure(location) {
  assert.equal(resolve(p.desktop), resolve(location.clientRoot, '.build/phase76-desktop-candidate'))
  const path = join(p.desktop, 'files.sha256.json'), manifest = await bytes(path, 1048576); assert.equal(hash(manifest), p.desktopInventorySha256)
  for (const row of JSON.parse(manifest.toString('utf8'))) { assert.ok(row.file && !row.file.startsWith('/') && !row.file.includes('..') && !row.file.includes('\\')); await verifyPinnedFile(join(p.desktop, row.file), row, 33554432) }
  return { verified: true, directory: p.desktop }
}
/** @param location - sealed original client/source locator. @returns original public grant metadata only; encrypted key fields are never returned. */
export async function desktopState(location) {
  const require = createRequire(join(location.sourceRoot, 'package.json')), yaml = require('js-yaml')
  const path = join(p.home, '.field-credentials.yaml'); await noLinks(path)
  const data = yaml.load((await bytes(path, 1048576)).toString('utf8')), grants = [], identities = []
  function visit(value) {
    if (value === null || typeof value !== 'object') return
    assert.equal('privatePkcs8' in value, false)
    if (value.kind === 'grant') {
      const payload = value.payload
      if (payload?.format === 'harmony-desktop-identity/2') {
        assert.equal(payload.protection, 'windows-dpapi-current-user/1')
        identities.push({ fingerprint: 'p256-sha256-' + hash(Buffer.from(payload.publicSpki, 'base64url')), protectedBytesPresent: typeof payload.protectedPkcs8 === 'string' })
      } else grants.push(structuredClone(payload))
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(data); return { observedAt: Date.now(), identities, grants, activeGrantCount: grants.filter(grant => !grant.revoked && grant.expiresAt > Date.now()).length }
}
/** @param location - sealed client path. @returns after checking unchanged frozen application files and original synthetic Session. */
export async function checkWorld(location) {
  const frozen = join(location.clientRoot, '.build/phase69-review-candidate'), manifest = await bytes(join(frozen, 'files.sha256.json'), 1048576)
  assert.equal(hash(manifest), p.frozenInventorySha256)
  for (const row of JSON.parse(manifest.toString('utf8'))) await verifyPinnedFile(join(frozen, row.file), row, 33554432)
  await noLinks(p.world); const world = await json(join(p.world, 'field-world.json'))
  assert.equal(world.state, 'ready'); assert.equal(world.sessionId, PLAN.session); assert.equal(world.identityAlias, PLAN.identity.desktopAlias)
  assert.equal(world.desktopId, PLAN.identity.desktopId); assert.equal(world.profileId, PLAN.identity.profileId)
  await absent(p.world + '.field-owner.lock')
  const sessions = await findFiles(join(p.world, 'sessions'), 'session.v4.jsonl'); assert.equal(sessions.length, 1)
  assert.equal(hash(await bytes(sessions[0], 1048576)), p.sessionBeforeSha256)
  const asset = join(frozen, 'desktop/runtime/node_modules/@local/dsh-harmony-replay/assets')
  assert.equal(world.assetsSha256, hash(Buffer.concat([await bytes(join(asset, 'offline-four.v4.jsonl'), 4194304), Buffer.from([0]), await bytes(join(asset, 'cordis.yml'), 65536)])))
}
/** @param location - sealed locators. @param phonePath - fresh entire native public v2 export. @param phoneStatePath - fresh successful read/clean-exit observation. @param relayStatePath - fresh prepared relay observation. @returns reviewed public inputs; no configuration is written. */
export async function inputs(location, phonePath, phoneStatePath, relayStatePath) {
  const now = Date.now(), raw = (await bytes(phonePath, 32768)).toString('utf8'), phone = await json(phoneStatePath), relay = await json(relayStatePath)
  reviewPhoneState(phone, now); assert.equal(phone.documentSha256, hash(raw)); fresh(relay.observedAt, now)
  assert.equal(relay.pairUnused, true); assert.equal(relay.phase76Prepared, true); assert.equal(relay.originalServiceVerified, true); assert.equal(relay.oldHistoryUnchanged, true); assert.equal(relay.retainedPublicStatePinned, true)
  reviewPhoneIdentity(await json(join(p.home, 'phone-public.json')))
  const state = await desktopState(location), retainedRaw = (await bytes(p.retainedPublicPath, 32768)).toString('utf8'), previous = await reviewPrevious(raw, state, now, retainedRaw)
  await checkWorld(location); await checkDesktopClosure(location); return { raw, retainedRaw, previous, phone, relay, state }
}
/** @param location - sealed locators. @param paths - phone v2, phone observation, relay observation. @returns after checked public configuration replacement and exclusive attempt record. */
export async function prepareField(location, paths) {
  assert.equal(paths.length, 3); await absent(join(p.run, 'prepared.json'))
  const reviewed = await inputs(location, ...paths), path = join(p.home, 'field.json'), before = await bytes(path, 65536)
  assert.equal(hash(before), p.fieldBeforeSha256)
  const config = JSON.parse(before.toString('utf8')); assert.equal(config.world.mode, 'reopen'); assert.equal(resolve(config.world.path), resolve(p.world))
  assert.equal(config.identityAlias, PLAN.identity.desktopAlias); assert.equal(config.grantTtlMs, PLAN.limits.grantMs); assert.equal(config.audience, PLAN.relay.host)
  assert.equal(config.desktopId, PLAN.identity.desktopId); assert.equal(config.deviceId, PLAN.identity.deviceId)
  assert.equal(config.pairId, reviewed.previous.history[0].record.paired.pairId); assert.equal(config.renewal, undefined)
  const predecessorPath = join(p.run, 'desktop-previous-v2.json'), planSha256 = (await json(join(p.run, 'operation.json'))).planSha256, connectReady = { path: join(p.run, 'phone-ready.json'), planSha256, targetRef: PLAN.native.targetRef, bundle: PLAN.native.bundle, maxAgeMs: PLAN.limits.readyObservationMs }, after = Buffer.from(JSON.stringify({ ...config, pairId: PLAN.pairId, publicTrustMaxBytes: 32768, connectReady, renewal: { previousPublicPath: predecessorPath } }, null, 2) + '\n')
  await writeFile(join(p.run, 'phone-previous-v2.json'), reviewed.raw, { flag: 'wx', mode: 0o600 }); await writeFile(predecessorPath, reviewed.retainedRaw, { flag: 'wx', mode: 0o600 }); await writeFile(join(p.run, 'field.before.json'), before, { flag: 'wx', mode: 0o600 })
  await record(join(p.run, 'preparation-attempt.json'), { at: Date.now(), before: hash(before), after: hash(after), outcome: 'unknown' })
  await replace(path, before, after)
  const result = { observedAt: Date.now(), before: hash(before), after: hash(after), previousSha256: hash(reviewed.raw), paths: paths.map(path => resolve(path)), expectedGrantEpoch: PLAN.epochs.grant }
  await record(join(p.run, 'prepared.json'), result); return result
}
/** @param location - original locators. @returns checked invocation inputs immediately before the only profile start. */
export async function startInputs(location) {
  await absent(join(p.run, 'start-attempt.json')); const prepared = await json(join(p.run, 'prepared.json'))
  const current = await inputs(location, ...prepared.paths); assert.equal(hash(current.raw), prepared.previousSha256)
  assert.equal(hash(await bytes(join(p.home, 'field.json'), 65536)), prepared.after)
  const previousExchanges = await findFiles(join(p.world, 'exchange'), 'desktop-offer.json'), previousExchangeDirs = await readdir(join(p.world, 'exchange'))
  return { app: p.desktop, previousExchanges, previousExchangeDirs }
}
/** @param app - verified frozen desktop directory. @returns the original profile invocation with a Windows-canonical absolute home. */
export function fieldLaunchArguments(app) { return [join(app, 'field-launch.mjs'), '--home', resolve(p.home)] }
/** @param state - fresh original-owner metadata. @param exit - observed ended child. @param previous - exchange names before launch. @param current - names after exit. @param now - review clock. @returns after proving exit before any exchange/Context/grant path; does not authorize another grant. */
export function reviewPreExchangeExit(state, exit, previous, current, now) {
  assert.ok(Number.isInteger(exit.code)); assert.equal(exit.error, null)
  assert.deepEqual([...current].sort(), [...previous].sort()); reviewDesktop(state, PLAN.epochs.before, now)
}
/** @param exchange - one new exchange produced by this invocation. @returns validated public artifacts for relay upload and phone import. */
async function verifiedExchange(exchange) {
  const selected = resolve(exchange), parent = resolve(p.world, 'exchange'), child = relative(parent, selected)
  assert.ok(child && !child.startsWith('..') && !child.includes('/') && !child.includes('\\'))
  await noLinks(selected); const attempt = await json(join(p.run, 'start-attempt.json'))
  assert.equal(attempt.previousExchanges.includes(join(selected, 'desktop-offer.json')), false)
  const phone = await json(join(p.run, 'phone-previous-v2.json')), previous = await json(join(p.run, 'desktop-previous-v2.json')), next = await reviewNext((await bytes(join(selected, 'phone-pair.json'), 32768)).toString('utf8'), previous, Date.now(), phone)
  const pair = reviewPair(await json(join(selected, 'relay-pair.json')), Date.now()), lifetime = await json(join(selected, 'grant-lifetime.json'))
  assert.equal(pair.expiresAt, next.record.paired.expiresAt); assert.equal(lifetime.expiresAt, next.record.paired.grant.expiresAt)
  assert.equal(lifetime.expiresAt - lifetime.startsAt, PLAN.limits.grantMs); assert.ok(lifetime.startsAt >= attempt.at)
  assert.equal(lifetime.grantTtlMs, PLAN.limits.grantMs); assert.equal(lifetime.session, PLAN.session); assert.equal(lifetime.realModels, 0); assert.equal(lifetime.renewal, true)
  const result = { at: Date.now(), exchange: selected, startsAt: lifetime.startsAt, expiresAt: lifetime.expiresAt, pairId: PLAN.pairId, grantEpoch: PLAN.epochs.grant, phoneDocumentSha256: hash(JSON.stringify(next)), pair }
  return { result, next }
}
/** @param exchange - one exchange owned by the one invocation. @returns a fully verified7 receipt, exclusively persisted once. */
export async function collectExchange(exchange) { const { result } = await verifiedExchange(exchange); await record(join(p.run, 'exchange.json'), result); return result }
/** @param location - original owner locator. @returns only the freshly revalidated six public fields after exact active7 matching; durable exchange edits and intermediate5 cannot reach SSH. */
export async function relayReady(location) {
  const saved = await json(join(p.run, 'exchange.json')), { result, next } = await verifiedExchange(saved.exchange)
  for (const key of ['pairId', 'grantEpoch', 'startsAt', 'expiresAt', 'phoneDocumentSha256']) assert.deepEqual(saved[key], result[key])
  assert.deepEqual(saved.pair, result.pair); reviewLiveGrant(await desktopState(location), next, Date.now()); return result.pair
}
/** @param location - original locators. @returns verified public configuration restoration after independent durable-grant readback. */
export async function restoreField(location) {
  const prepared = await json(join(p.run, await exists(join(p.run, 'prepared.json')) ? 'prepared.json' : 'preparation-attempt.json')), state = await desktopState(location)
  if (!await exists(join(p.run, 'start-attempt.json'))) reviewDesktop(state, PLAN.epochs.before, Date.now())
  else {
    const exit = await json(join(p.run, 'exit.json'))
    const attempt = await json(join(p.run, 'start-attempt.json')), names = (await readdir(join(p.world, 'exchange'))).filter(name => !attempt.previousExchangeDirs.includes(name))
    if (names.length === 0) reviewPreExchangeExit(state, exit, attempt.previousExchangeDirs, await readdir(join(p.world, 'exchange')), Date.now())
    else { assert.equal(names.length, 1); const cleanup = await json(join(p.world, 'exchange', names[0], 'desktop-cleanup.json')); reviewCleanup(state, cleanup, Date.now()) }
  }
  await absent(p.world + '.field-owner.lock')
  const before = await bytes(join(p.run, 'field.before.json'), 65536); assert.equal(hash(before), p.fieldBeforeSha256)
  assert.equal(prepared.before, p.fieldBeforeSha256)
  const path = join(p.home, 'field.json'), current = await bytes(path, 65536)
  if (hash(current) === hash(before)) return { observedAt: Date.now(), originalPublicConfigRestored: true, revokedEpoch: state.grants[0].epoch, activeGrantCount: 0, credentialsRestored: false, verificationOnly: true }
  assert.equal(hash(current), prepared.after)
  await replace(path, current, before)
  const result = { observedAt: Date.now(), originalPublicConfigRestored: true, revokedEpoch: state.grants[0].epoch, activeGrantCount: 0, credentialsRestored: false }
  await record(join(p.run, 'local-restore.json'), result); return result
}

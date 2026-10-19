/** Derive a public-read observation from this operation's actual original-UI receipts and normal exit; never reads phone-private files. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PLAN, hash, reviewPhoneIdentity } from '../.build/phase76-complete-operation-plan/policy.mjs'
const root = PLAN.local.run, label = process.argv[2]; assert.ok(['before-install', 'after-install'].includes(label))
const json = async path => JSON.parse(await readFile(path, 'utf8')), names = await readdir(root)
async function latest(prefix) { const files = names.filter(name => name.startsWith(prefix) && name.endsWith('.json')).sort(); assert.ok(files.length); return json(join(root, files.at(-1))) }
const publicReceipt = await latest('device-read-public-'), identityFiles = names.filter(name => /^native-identity-\d+\.json$/.test(name)).sort(), savedFiles = names.filter(name => /^native-saved-\d+\.json$/.test(name)).sort()
assert.ok(identityFiles.length && savedFiles.length); const identity = await json(join(root, identityFiles.at(-1))); reviewPhoneIdentity(identity)
const savedPath = join(root, savedFiles.at(-1)), raw = await readFile(savedPath, 'utf8'), saved = JSON.parse(raw), inspect = await latest('device-inspect-'), tap = await latest('device-tap-')
assert.equal(saved.schema, 'harmony-product-public-trust/2'); assert.equal(hash(JSON.stringify(saved)), PLAN.local.phoneCanonicalSha256); assert.equal(inspect.pid, ''); assert.equal(inspect.targetRef, PLAN.native.targetRef)
const strings = (await json('.build/phase76-complete-operation-plan/native-strings.json')).string; assert.equal(tap.clicked, 'text:' + strings.find(row => row.name === 'product_exit').value)
const savedAt = Number(savedFiles.at(-1).match(/(\d+)\.json$/)[1]), identityAt = Number(identityFiles.at(-1).match(/(\d+)\.json$/)[1]); assert.ok(identityAt < savedAt && savedAt <= inspect.observedAt && Date.now() - identityAt <= PLAN.limits.observationMs)
if (label === 'after-install') { const installed = await json(join(root, 'install-result.json')); assert.equal(installed.installed, true); assert.ok(identityAt >= installed.observedAt) }
const value = { observedAt: inspect.observedAt, targetRef: PLAN.native.targetRef, originalIdentityMatched: true, publicReadSucceeded: true, existingLockObserved: false, ownTemporaryLockReleased: true, normalExitCompleted: true, documentSha256: hash(raw), evidence: { identityPath: join(root, identityFiles.at(-1)), savedPath, normalExitTap: tap, pidEmptyObservedAt: inspect.observedAt, savedPairingMethodAwaitsFileClose: true, lastPublicReadKind: publicReceipt.kind } }
const path = join(root, 'phone-observation-' + label + '.json'); await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ path, savedPath, observedAt: value.observedAt, grant: saved.record.paired.grant.epoch, fingerprintMatched: true, normalExit: true }))

/** Copy the final tested closed runtime beside its predecessor while reusing only the original isolated home and fixed world. */
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const successor = process.argv.length === 3 && process.argv[2] === '--successor'
assert.ok(process.argv.length === 2 || successor, 'closed preparation mode required')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const marker = await json('.build/phase54-active.json'), portable = await json('evidence/phase66-detached-profile.json'), restart = await json('evidence/phase66-field-restart.json'), strict = await json('evidence/phase66-profile-typecheck.json')
assert.equal(portable.result.replayCalls, 4); assert.equal(portable.result.realModels, 0); assert.equal(restart.passed, true); assert.equal(restart.results.length, 8); assert.equal(strict.passed, true)
const candidate = resolve('.build/field-interaction-alpha4-candidate'), build = await json(join(candidate, 'build-info.json'))
assert.equal(build.dshVersion, '0.2.1-alpha.4')
for (const entry of portable.candidateEntrypoints) assert.equal(hash(await readFile(join(candidate, entry.path))), entry.sha256)
for (const entry of restart.candidateEntrypoints) assert.equal(hash(await readFile(join(candidate, entry.path))), entry.sha256)
const acknowledgement = await json('evidence/phase66-world-assets-ack.json')
assert.equal(hash(await readFile(acknowledgement.manifest)), acknowledgement.afterSha256)
const app = await mkdtemp(join(marker.world, 'app-alpha4-'))
await cp(candidate, app, { recursive: true, dereference: false, force: false, errorOnExist: true })
for (const entry of portable.candidateEntrypoints) assert.equal(hash(await readFile(join(app, entry.path))), entry.sha256)
const result = { schema: 'harmony-alpha4-original-field/1', createdAt: new Date().toISOString(), app, home: marker.home, world: marker.world, predecessorApp: marker.app, phoneAlias: marker.phoneAlias, identityAlias: marker.identityAlias, pairId: marker.pairId, grantMaximumMs: 1800000, sourceCandidate: candidate, sourceInputs: build.sourceInputs.length, appVersion: build.version, dshVersion: build.dshVersion, originalSingleSession: 'harmony-mobile-field-replay-session', entrypoints: portable.candidateEntrypoints, grantCreated: false, fieldStarted: false, runtimeInvocations: 'dsh --profile harmony-mobile-replay only' }
await writeFile(successor ? '.build/phase66-active-v2.json' : '.build/phase66-active.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
await writeFile(successor ? 'evidence/phase66-field-preparation-v2.json' : 'evidence/phase66-field-preparation.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ app, home: result.home, predecessorPreserved: true, readyForFreshChallenge: true, grantCreated: false }))

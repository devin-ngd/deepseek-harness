/** Acknowledge the sole validated local composition delta under the original world lock, preserving every Session byte and rollback input. Requires the existing built atomic-write utility. */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, copyFile, constants } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planWorldAssetsMigration } from './phase66-world-migration.mjs'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const marker = await json('.build/phase54-active.json'), config = await json(join(marker.home, 'field.json'))
assert.equal(marker.world, 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM')
assert.equal(resolve(config.world.path), resolve(marker.world, 'fixed-world')); assert.equal(config.world.mode, 'reopen')
assert.equal(config.auth.maxSessions, 1); assert.equal(config.auth.maxDevices, 1); assert.equal(config.grantTtlMs, 1800000)
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const { withFileLock, writeFileAtomic } = await import(pathToFileURL(join(root, 'packages/util/atomic-write/lib/index.js')).href)
const world = config.world.path, suffix = 'runtime/node_modules/@local/dsh-harmony-replay/assets'
const oldAssets = join(marker.app, suffix), newAssets = resolve('.build/field-interaction-alpha4-candidate', suffix)
async function sessionFiles(directory) { const rows = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); assert.equal(entry.isSymbolicLink(), false); if (entry.isDirectory()) rows.push(...await sessionFiles(path)); else { const bytes = await readFile(path); rows.push({ path, sha256: hash(bytes) }); if (entry.name === 'session.v4.jsonl') { const events = bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse); assert.ok(events.every(event => ['session', 'session/end-seed'].includes(event.type ?? event.event?.type)), 'only original seed may precede this acknowledgement') } } }; return rows.sort((a, b) => a.path.localeCompare(b.path)) }
await withFileLock(world + '.field-owner', async () => {
  const path = join(world, 'field-world.json'), before = await readFile(path), original = JSON.parse(before.toString('utf8'))
  const successor = planWorldAssetsMigration({ manifest: original, desktopId: config.desktopId, identityAlias: marker.identityAlias, oldFixture: await readFile(join(oldAssets, 'offline-four.v4.jsonl')), newFixture: await readFile(join(newAssets, 'offline-four.v4.jsonl')), oldConfig: await readFile(join(oldAssets, 'cordis.yml'), 'utf8'), newConfig: await readFile(join(newAssets, 'cordis.yml'), 'utf8') })
  const sessionsBefore = await sessionFiles(join(world, 'sessions')); assert.ok(sessionsBefore.some(row => row.path.endsWith('session.v4.jsonl')))
  const proofPath = join(marker.home, 'phone-reply.json'), oldProofHash = hash(await readFile(proofPath))
  const backup = resolve('.build/phase66-preimages/field-world.before.json')
  await copyFile(path, backup, constants.COPYFILE_EXCL)
  await writeFile('evidence/phase66-world-ack-attempt.json', JSON.stringify({ at: new Date().toISOString(), target: path, beforeSha256: hash(before), backup, oldAssetsSha256: original.assetsSha256, newAssetsSha256: successor.assetsSha256, sessionFiles: sessionsBefore, unknownUntilVerified: true }, null, 2) + '\n', { flag: 'wx' })
  await writeFileAtomic(path, JSON.stringify(successor, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
  assert.deepEqual(await json(path), successor)
  assert.deepEqual(await sessionFiles(join(world, 'sessions')), sessionsBefore)
  assert.equal(hash(await readFile(proofPath)), oldProofHash)
  const report = { at: new Date().toISOString(), world, manifest: path, backup, beforeSha256: hash(before), afterSha256: hash(await readFile(path)), oldAssetsSha256: original.assetsSha256, newAssetsSha256: successor.assetsSha256, soleDelta: 'register existing remoteAccess service for the alpha.4 device principal', replayFixtureUnchanged: true, sessionFilesUnchanged: sessionsBefore, oldProofPreserved: true, canonicalSessionId: successor.sessionId, credentialsOrPermissionsChanged: false, grantCreated: false, realModels: 0, userProjectOperations: 0, rollbackRequiresExactSuccessorHash: true }
  await writeFile('evidence/phase66-world-assets-ack.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ acknowledged: true, sessionFilesUnchanged: sessionsBefore.length, backup, grantCreated: false }))
}, { waitMs: 2000 })

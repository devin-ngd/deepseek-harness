/** Verify immutable phase53 deliverables and prepare only one fresh isolated approved field home; creates no identity or grant. */
import { readFile, writeFile, cp, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
if (process.env.COMPUTERNAME?.toUpperCase() !== 'DEVIN-MATEBOOK') throw new Error('approved computer required')
const hash = value => createHash('sha256').update(value).digest('hex'), source = JSON.parse(await readFile('evidence/phase53-deliverables.json', 'utf8')), sealed = JSON.parse(await readFile('evidence/phase53-sealed-candidates.json', 'utf8'))
for (const row of [source.runtime, source.publicTools, source.source]) { const bytes = await readFile(row.path); assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256) }
for (const [directory, rows] of [[sealed.extractedCandidate, sealed.runtimeFiles], [sealed.extractedTools, sealed.toolFiles]]) for (const row of rows) assert.equal(hash(await readFile(join(directory, row.path))), row.sha256)
const world = await mkdtemp('D:/Temp/dsh-harmony-real-field-20261015-'), app = join(world, 'app'), home = join(world, 'home'), tools = join(world, 'public-tools')
await cp(sealed.extractedCandidate, app, { recursive: true, dereference: false }); await cp(sealed.extractedTools, tools, { recursive: true, dereference: false }); await mkdir(home)
const config = JSON.parse(await readFile(join(app, 'field.enabled.example.json'), 'utf8')); config.world.path = join(world, 'fixed-world'); config.identityAlias = 'harmony-phase54-desktop'; config.pairId = 'harmony-phase54-' + randomUUID()
await writeFile(join(home, 'field.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
assert.equal((await readdir(home)).length, 1)
const result = { schema: 'harmony-approved-real-field/1', createdAt: new Date().toISOString(), authorization: 'Sentinel_8dcca9e84ab88191aa8537f5e2c9e695', computer: process.env.COMPUTERNAME, engine: process.version, world, app, home, tools, phoneAlias: 'harmony-phase54-phone', identityAlias: config.identityAlias, pairId: config.pairId, grantMaximumMs: config.grantTtlMs, grantCreated: false, artifacts: [source.runtime, source.publicTools, source.source], currentDesktopChanged: false, modelCalls: 0, userProjectOperations: 0 }
await writeFile('.build/phase54-active.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); await writeFile('evidence/phase54-preflight.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ world, computer: result.computer, hashesVerified: true, currentDesktopChanged: false, grantCreated: false }))

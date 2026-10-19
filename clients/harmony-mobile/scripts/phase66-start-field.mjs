/** Start the tested successor through its guarded dsh profile once, retaining the original home, world, identities and bounded decisions. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const marker = JSON.parse(await readFile('.build/phase66-active-v2.json', 'utf8'))
assert.ok(process.stdin.isTTY && process.stdout.isTTY, 'real local terminal required')
assert.equal(marker.grantMaximumMs, 1800000)
assert.equal(marker.originalSingleSession, 'harmony-mobile-field-replay-session')
assert.equal(marker.dshVersion, '0.2.1-alpha.4')
for (const entry of marker.entrypoints) assert.equal(createHash('sha256').update(await readFile(join(marker.app, entry.path))).digest('hex'), entry.sha256)
const startedAt = new Date().toISOString()
await writeFile('evidence/phase66-field-start-attempt.json', JSON.stringify({ at: startedAt, app: marker.app, home: marker.home, world: marker.world, originalIdentitiesOnly: true, fixedSession: marker.originalSingleSession, maximumGrantMs: marker.grantMaximumMs, grantCreated: false, unknownUntilObserved: true }, null, 2) + '\n', { flag: 'wx' })
const child = spawn(process.execPath, [join(marker.app, 'field-launch.mjs'), '--home', marker.home], { windowsHide: true, stdio: 'inherit' })
await writeFile('.build/phase66-field-process.json', JSON.stringify({ at: startedAt, launcherPid: child.pid, app: marker.app, home: marker.home, onlyOwnedRuntime: true }, null, 2) + '\n', { flag: 'wx' })
const result = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) })
await writeFile('evidence/phase66-field-exit.json', JSON.stringify({ startedAt, completedAt: new Date().toISOString(), ...result }, null, 2) + '\n', { flag: 'wx' })
process.exitCode = result.code ?? 1

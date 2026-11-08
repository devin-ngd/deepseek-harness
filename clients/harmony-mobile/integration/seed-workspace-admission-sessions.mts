/** Write a fresh cold Session corpus before the isolated installed Host starts. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { logPath, toHeaderLine } from '../../../packages/session/session-persistence-jsonl/src/format.ts'
import { id } from '../src/protocol.ts'

const world = process.argv[2]
assert.ok(world && isAbsolute(world) && /^probe-[a-zA-Z0-9]+$/.test(basename(world)))
const local = relative(resolve('clients/harmony-mobile/.build'), world)
assert.match(local, /^workspace-installed-[a-zA-Z0-9]+[/\\]probe-[a-zA-Z0-9]+$/)
const root = join(world, 'sessions'), count = 312
await mkdir(root)
const started = performance.now()
let bytes = 0
for (let offset = 0; offset < count; offset += 16) {
  const batch = await Promise.all(Array.from({ length: Math.min(16, count - offset) }, async (_, i) => {
    const sessionId = id<'SessionId'>('workspace-cold-' + (offset + i))
    const path = logPath(root, world, sessionId, 'none')
    const header = toHeaderLine({ version: SESSION_FORMAT_VERSION, id: sessionId, cwd: world, createdAt: 1700000000000 + offset + i,
      isSeeded: false, delegationDepth: 0, agentPreset: 'standard' })
    const body = JSON.stringify(header) + '\n'
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, body, { flag: 'wx' })
    return Buffer.byteLength(body)
  }))
  bytes += batch.reduce((sum, value) => sum + value, 0)
}
await writeFile(join(world, 'cold-corpus.json'), JSON.stringify({ count, bytes, version: SESSION_FORMAT_VERSION, eventsPerSession: 0,
  generatedBeforeHost: true, seedMs: Math.round(performance.now() - started) }) + '\n', { flag: 'wx' })

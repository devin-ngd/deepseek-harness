/** Place one authorized history snapshot in an isolated Host. Only its working directory is rebased. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { z } from 'zod'
import { logPath } from '../../../packages/session/session-persistence-jsonl/src/format.ts'
import { compressZstdFrame, decompressZstdFrame, scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { id } from '../src/protocol.ts'

const [world, source, sessionId, expectedSha256] = process.argv.slice(2)
assert.ok(world && source && sessionId && expectedSha256)
const lab = resolve('clients/harmony-mobile/.build')
assert.match(relative(lab, world), /^workspace-installed-[a-zA-Z0-9]+[/\\]probe-[a-zA-Z0-9]+$/)
assert.match(relative(lab, source), /^workspace-pinned-read-[\w-]+[/\\]session\.v4\.jsonl\.zstd$/)
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const bytes = await readFile(source)
assert.equal(hash(bytes), expectedSha256)
const { frames, tornStart } = scanZstdFrames(bytes)
assert.ok(tornStart === undefined && frames.length > 1)
const first = frames[0]!
const headerText = (await decompressZstdFrame(bytes.subarray(first.start, first.end))).toString('utf8')
assert.match(headerText, /^[^\r\n]+\r?\n$/)
const header = z.object({ type: z.literal('session'), version: z.literal(4), id: z.literal(sessionId), cwd: z.string().min(1) })
  .passthrough().parse(JSON.parse(headerText))
const work = resolve(world, 'pinned-read-workspace')
const path = logPath(resolve(world, 'sessions'), work, id<'SessionId'>(sessionId), 'zstd')
await mkdir(work)
await mkdir(dirname(path), { recursive: true })
const history = bytes.subarray(first.end)
const journal = Buffer.concat([await compressZstdFrame(JSON.stringify({ ...header, cwd: work }) + '\n'), history])
await writeFile(path, journal, { flag: 'wx' })
await writeFile(resolve(world, 'pinned-read.json'), JSON.stringify({ sessionId, sha256: hash(journal), historySha256: hash(history),
  historyFrames: frames.length - 1, workspaceRebased: true }) + '\n', { flag: 'wx' })

/** Run with Node 24 and built workspace packages. Each sample measures one in-memory Session. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpus, release } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SESSION_FORMAT_VERSION, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { PrepareSessionOptions, Session } from '@deepseek-ai/dsh-session'
import ProjectionRegistry, { type ProjectionCheckpoint } from '@deepseek-ai/dsh-session-projection'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { PARENT_ID, syntheticHistory, TIME_ZERO, WORKLOAD } from '../../../../benchmarks/agent-continuation/workload.ts'
import { compactionEntryProjection } from '../src/entry-projection.ts'

const modes = ['rebuild', 'checkpoint', 'hot-load'] as const
type Mode = typeof modes[number]

function memory() {
  assert.ok(global.gc, 'sample workers require --expose-gc')
  global.gc()
  const { heapUsed, rss, external } = process.memoryUsage()
  return { heapUsed, rss, external, lifetimePeakRss: process.resourceUsage().maxRSS * 1024 }
}

async function measure(mode: Mode, turns: number) {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(ProjectionRegistry)
    const seed = syntheticHistory(turns)
    const completedEvents = seed.length
    const openTurn = turns + 1
    seed.push({ type: 'turn/start', seq: SessionSeq(seed.length), time: TIME_ZERO + seed.length, data: { turn: openTurn } })
    const lock = SessionSeq(seed.length)
    seed.push({ type: 'compaction/start', seq: lock, time: TIME_ZERO + lock, data: { turn: openTurn, compactionId: CompactionId('pending') } })
    const inputBytes = seed.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event)) + 1, 0)
    const options: PrepareSessionOptions = {
      seed, eventState: 'detached', inheritedEventCount: SessionLogOffset(0),
      meta: { id: PARENT_ID, version: SESSION_FORMAT_VERSION, createdAt: TIME_ZERO, isSeeded: false, delegationDepth: 0 },
    }
    // The completed prefix contains neither a seed marker nor a compaction. Restore appends a resume marker.
    const checkpoint: ProjectionCheckpoint = mode === 'checkpoint' ? {
      basicCompactionEntry: { ver: 1, seq: SessionSeq(completedEvents - 1),
        val: { turn: { kind: 'closed' }, unmatchedStart: null, latestSeed: null } },
    } : {}
    let foldMs: number | undefined
    let session: Session
    let before
    let latencyMs
    if (mode === 'hot-load') {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(TokenMeter)
      session = ctx.sessions.prepare(PARENT_ID, options)
      ctx.effect(() => ctx.sessions.enter(session))
      ctx.sessions.announce(session)
      before = memory()
      const start = performance.now()
      await ctx.plugin(BasicCompaction)
      latencyMs = performance.now() - start
      assert.ok(ctx.compaction instanceof BasicCompaction)
    } else {
      await ctx.sessionProjections.registerPrepared(compactionEntryProjection)
      before = memory()
      const start = performance.now()
      session = ctx.sessions.prepare(PARENT_ID, options, (subject, cut) => {
        const foldStart = performance.now()
        ctx.sessionProjections.prepare(subject, checkpoint, cut)
        foldMs = performance.now() - foldStart
      })
      latencyMs = performance.now() - start
    }
    const after = memory()
    const row = ctx.sessionProjections.checkpoint(session).basicCompactionEntry
    assert.deepEqual(row, { ver: 1, seq: seed.length, val: {
      turn: { kind: 'open', value: openTurn }, unmatchedStart: lock, latestSeed: seed.length,
    } })
    return { mode, turns, inputEvents: seed.length, inputJsonlBytes: inputBytes, readyEvents: session.seq,
      latencyMs, foldMs, before, after, retainedHeapDelta: after.heapUsed - before.heapUsed, row }
  } finally {
    await ctx.fiber.dispose()
  }
}

if (process.argv[2] === '--sample') {
  const mode = modes.find(value => value === process.argv[3])
  const turns = Number(process.argv[4])
  assert.ok(mode && Number.isSafeInteger(turns) && turns > 0)
  console.log(JSON.stringify(await measure(mode, turns)))
} else {
  const samples = []
  for (let replicate = 0; replicate < 5; replicate++) {
    for (const turns of [WORKLOAD.requestTurns, WORKLOAD.historyTurns]) {
      for (const mode of modes) {
        const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--sample', mode, String(turns)],
          { encoding: 'utf8', timeout: 120_000 })
        if (child.error) throw child.error
        assert.equal(child.status, 0, child.stderr)
        samples.push({ replicate: replicate + 1, ...JSON.parse(child.stdout) })
      }
    }
  }
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    osRelease: release(), cpu: cpus()[0]?.model, node: process.version, v8: process.versions.v8, samples }, null, 2))
}

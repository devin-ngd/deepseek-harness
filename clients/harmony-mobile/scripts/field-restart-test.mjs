/** Kill/reopen two independent guarded dsh processes per case. Uses only synthetic worlds and the fixed four-response provider. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
const project = resolve('.'), candidate = resolve('.build/protected-world-candidate'), world = await mkdtemp(join(project, '.build/field-restart-world-')), cli = join(candidate, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'), results = []
const candidateEntrypoints=await Promise.all(['runtime/node_modules/@deepseek-ai/dsh/lib/bin.js','runtime/node_modules/@local/dsh-harmony-replay/lib/index.js'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(candidate,path))).digest('hex')})))
async function homeFor(directory, point, phase, selectedWorld) {
  const profile = join(directory, 'profiles/harmony-mobile-replay'); await mkdir(profile, { recursive: true }); await mkdir(join(directory, 'agents')); await mkdir(join(directory, 'tmp')); await mkdir(join(directory, 'invocation'))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'dsh-profile-harmony-mobile-replay', private: true, dependencies: {}, dsh: { profile: { bundles: ['@local/dsh-harmony-replay'] } } }) + '\n')
  for (const name of ['cordis.yml', 'cordis.snapshot.yml', 'cordis.patch.yml']) await writeFile(join(profile, name), '[]\n')
  await writeFile(join(directory, 'restart-fixture.json'), JSON.stringify({ schema: 'harmony-restart-fixture/1', fixture: 'public-fixed-replay-only', phase, point, world: selectedWorld, checkpointWaitMs: 30000 }) + '\n')
  return directory
}
function start(home) {
  const child = spawn(process.execPath, [cli, '--profile', 'harmony-mobile-replay'], { cwd: join(home, 'invocation'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: join(home, 'tmp'), TMP: join(home, 'tmp'), DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_OFFLINE_PROFILE: 'restart-four-v1', DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' } })
  let log = '', exited = false
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { if (log.length + bytes.length > 2097152) child.kill('SIGKILL'); else log += bytes.toString('utf8') })
  const done = new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => { exited = true; clearTimeout(timer); void writeFile(join(home, 'process.log'), log.trimEnd() + '\n').then(() => accept({ code, signal }), reject) }) })
  void done.catch(() => {})
  return { child, done, get exited() { return exited } }
}
async function checkpoint(home, process) { const until = Date.now() + 30000; while (Date.now() < until) { try { return JSON.parse(await readFile(join(home, 'checkpoint.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }; if (process.exited) throw new Error('writer exited before checkpoint: ' + home); await delay(50) }; throw new Error('checkpoint deadline: ' + home) }
try {
  for (const point of ['before-claim', 'after-claim', 'before-flush', 'flush-failed', 'after-ack', 'after-canonical', 'completed', 'rich-reopen']) {
    const directory = join(world, point); await mkdir(directory); const selectedWorld = join(directory, 'stable-world'), aHome = await homeFor(join(directory, 'process-a'), point, 'write', selectedWorld), bHome = await homeFor(join(directory, 'process-b'), point, 'read', selectedWorld), a = start(aHome)
    let b
    try {
      const before = await checkpoint(aHome, a); assert.equal(before.pid, a.child.pid); assert.equal(before.realModels, 0); assert.equal(before.expectedReplayBudget, 4)
      if(point === 'rich-reopen'){const probeHome=await homeFor(join(directory,'process-contender'),point,'read',selectedWorld),probe=start(probeHome);const probeExit=await probe.done;assert.notEqual(probeExit.code,0);const failure=JSON.parse(await readFile(join(probeHome,'failure.json'),'utf8'));assert.ok(failure.messages.some(message=>message.includes('timed out waiting for the writer lock')))}
      if(['before-flush','flush-failed'].includes(point))assert.ok(before.blockedWrites>0)
      a.child.kill('SIGKILL'); const killed = await a.done; assert.notEqual(killed.code, 0)
      b = start(bHome); const exited = await b.done
      if (exited.code !== 0) throw new Error('reopen failed; inspect ' + join(bHome, 'failure.json'))
      const after = JSON.parse(await readFile(join(bHome, 'result.json'), 'utf8')); assert.notEqual(before.pid, after.pid); assert.equal(after.realModels, 0); assert.equal(after.expectedReplayBudget, 4)
      const uncertain = ['after-claim', 'before-flush', 'flush-failed'].includes(point), expected = uncertain ? 0 : 1
      assert.equal(after.duplicate.accepted, !uncertain); assert.equal(after.duplicate.state, uncertain ? 'unknown' : 'accepted')
      if (point !== 'before-claim') assert.equal(after.originalTaskPrompts, 0)
      if (uncertain) { assert.equal(after.journalRecordState, 'submitting'); assert.equal(after.assistantMessages, 0); assert.equal(after.originalMessages, 0); assert.equal(before.durableOriginalMessages + before.durableOriginalInbox, 0) }
      else { assert.equal(before.originalTaskPrompts + after.originalTaskPrompts, expected); if(point !== 'after-ack')assert.equal(after.originalMessages, expected) }
      if(point === 'after-ack')assert.ok(before.durableOriginalMessages + before.durableOriginalInbox >= 1)
      if(point === 'rich-reopen'){assert.equal(after.replayPosition,1);assert.equal(before.replayCalls + after.replayCalls,4);assert.equal(after.richCompleted,true);assert.equal(after.richDuplicate,true);assert.equal(after.cancellation,true)}
      if (point === 'completed' || point === 'after-canonical') { assert.ok(after.assistantMessages > 0); assert.equal(after.historicalRich, true); assert.equal(after.receiptBefore.state, 'accepted') }
      assert.ok(before.replayCalls <= 4 && after.replayCalls <= 4)
      results.push({ point, killed, before, after }); console.log(JSON.stringify({ point, pass: true, originalMessages: after.originalMessages, totalPromptCalls: before.promptCalls + after.promptCalls, processA: before.pid, processB: after.pid, replayCalls: [before.replayCalls, after.replayCalls], realModels: 0 }))
    } finally { if (!a.exited) a.child.kill('SIGKILL'); await a.done; if (b && !b.exited) b.child.kill('SIGKILL'); if (b) await b.done }
  }
} finally { await writeFile('evidence/phase52-field-restart.json', JSON.stringify({ schema: 'harmony-field-two-process-recovery/1', world, candidate, candidateEntrypoints, results, passed: results.length === 8, supportedProfileOnly: true, independentProcesses: true, realModels: 0, identitiesCreated: false, networkListeners: 0, installedChanged: false }, null, 2) + '\n') }

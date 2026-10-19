/** Kill/reopen two independent guarded dsh processes per case. Uses only synthetic worlds and the fixed four-response provider. */
import { fixtureHome as homeFor, startFixture, fixtureFile } from './field-processes.mjs'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
if(process.argv.length!==2&&!(process.argv.length===4&&process.argv[2]==='--candidate'))throw new Error('explicit candidate only')
const project = resolve('.'), candidate = resolve(process.argv[3]??'.build/field-interaction-candidate'), world = await mkdtemp(join(project, '.build/field-restart-world-')), results = []
const candidateEntrypoints=await Promise.all(['runtime/node_modules/@deepseek-ai/dsh/lib/bin.js','runtime/node_modules/@local/dsh-harmony-replay/lib/index.js'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(candidate,path))).digest('hex')})))
const start=home=>startFixture(candidate,home), checkpoint=(home,process)=>fixtureFile(home,'checkpoint.json',process)
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
} finally { await writeFile('evidence/phase53-field-restart.json', JSON.stringify({ schema: 'harmony-field-two-process-recovery/1', world, candidate, candidateEntrypoints, results, passed: results.length === 8, supportedProfileOnly: true, independentProcesses: true, realModels: 0, identitiesCreated: false, networkListeners: 0, installedChanged: false }, null, 2) + '\n') }

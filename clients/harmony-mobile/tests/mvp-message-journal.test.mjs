import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mvpMessageJournal } from '../operations/mvp-message-journal.mjs'
import { mvpFixture } from './helpers/mvp-message-fixture.mjs'

async function world(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mvp-journal-'))
  t.after(async () => { assert.equal(dirname(directory), tmpdir()); await rm(directory, { recursive: true, force: true }) })
  return directory
}

test('preparation, issuing and acknowledged clicks have distinct exclusive records', async t => {
  const directory = await world(t), f = mvpFixture(); f.options.journal = mvpMessageJournal(directory)
  await f.flow().run()
  const record = async name => JSON.parse(await readFile(join(directory, name), 'utf8'))
  assert.equal((await record('flow.claim.json')).state, 'started-not-sent')
  assert.equal((await record('send1.issuing.json')).state, 'issuing-outcome-unknown')
  assert.equal((await record('send1.issued.json')).state, 'UI-click-acknowledged-not-model-acceptance')
  assert.equal((await record('complete.json')).phoneReplyVerified, true)
  await assert.rejects(mvpMessageJournal(directory).begin({}), { code: 'EEXIST' })
  assert.throws(() => mvpMessageJournal(directory).issued('../other'), /invalid/)
})

test('a preexisting issuing record blocks sending without overwriting it', async t => {
  const directory = await world(t), journal = mvpMessageJournal(directory), f = mvpFixture()
  await journal.claim('send1'); f.options.journal = journal
  await assert.rejects(f.flow().run(), e => e.code === 'journal-failed' && e.effects.send1 === 'not-issued')
  assert.equal(f.sends(), 0); assert.equal((await readdir(directory)).includes('send1.issued.json'), false)
})

test('two independent processes contend for one flow while separate worlds remain isolated', async t => {
  const a = await world(t), b = await world(t), run = promisify(execFile)
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
  const worker = directory => run(process.execPath, ['tests/helpers/mvp-journal-worker.mjs', directory], { cwd: process.cwd(), windowsHide: true, shell: false, timeout: 5000, env }).then(r => r.stdout)
  const same = await Promise.all([worker(a), worker(a)])
  assert.deepEqual(same.sort(), ['claimed', 'exists']); assert.equal(await worker(b), 'claimed')
  assert.deepEqual(await readdir(a), ['flow.claim.json']); assert.deepEqual(await readdir(b), ['flow.claim.json'])
})

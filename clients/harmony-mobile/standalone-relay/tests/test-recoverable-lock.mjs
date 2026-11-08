import { strict as assert } from 'node:assert'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, open, readFile, writeFile, readdir, rm, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { RecoverableLock } from './recoverable-lock.mjs'

process.env.HARMONY_RELAY_LOCAL_LOCK_RECOVERY = '1'
async function syncDir(path) { const fd = await open(path, 'r'); try { await fd.sync() } finally { await fd.close() } }
const args = process.argv.slice(2)
if (args[0] === 'hold') {
  const lock = await RecoverableLock.acquire(args[1], syncDir)
  if (args[2] === 'dirty') await lock.beginWrite()
  console.log('ready')
  setInterval(() => {}, 1000)
} else {
  const directory = await mkdtemp(join(tmpdir(), 'relay-lock-isolated-'))
  const file = join(directory, 'state')
  async function owner(phase) {
    const child = spawn(process.execPath, [process.argv[1], 'hold', file, phase], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    let data = '', errors = ''
    child.stderr.on('data', bytes => { errors += bytes })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('owner timeout: ' + errors)), 5000)
      child.stdout.on('data', bytes => { data += bytes; if (data.includes('ready')) { clearTimeout(timer); resolve() } })
      child.on('exit', code => { clearTimeout(timer); reject(new Error('owner exited: ' + code + ' ' + errors)) })
    })
    return child
  }
  async function kill(child) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited }
  async function clean(lock) { await lock.close(); await unlink(file + '.lock') }
  try {
    let child = await owner('clean')
    await assert.rejects(RecoverableLock.acquire(file, syncDir))
    await kill(child)
    const attempts = await Promise.allSettled([RecoverableLock.acquire(file, syncDir), RecoverableLock.acquire(file, syncDir)])
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1)
    await clean(attempts.find(x => x.status === 'fulfilled').value)
    assert.equal((await readdir(directory)).filter(x => x.includes('.recovered-')).length, 1)
    const previousBoot = { schema: 'harmony-relay-lock/1', boot: '00000000-0000-0000-0000-000000000000', pid: 12345, phase: 'clean' }
    await writeFile(file + '.lock', JSON.stringify(previousBoot), { mode: 0o600 })
    await clean(await RecoverableLock.acquire(file, syncDir))
    await writeFile(file + '.lock', JSON.stringify({ ...previousBoot, phase: 'dirty' }), { mode: 0o600 })
    await assert.rejects(RecoverableLock.acquire(file, syncDir))
    await unlink(file + '.lock')
    child = await owner('dirty'); await kill(child)
    await assert.rejects(RecoverableLock.acquire(file, syncDir))
    assert.equal(JSON.parse(await readFile(file + '.lock', 'utf8')).phase, 'dirty')
    await unlink(file + '.lock')
    await writeFile(file + '.lock', '', { mode: 0o600 })
    await assert.rejects(RecoverableLock.acquire(file, syncDir))
    await unlink(file + '.lock')
    const missing = spawnSync(process.execPath, [join(dirname(process.argv[1]), 'server.mjs'), '--config', join(directory, 'private-secret')], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /stage=config reason=missing/)
    assert.doesNotMatch(missing.stderr, /private-secret/)
    console.log('PASS active, clean-crash, previous-boot, concurrent recovery, dirty, legacy, redacted CLI')
  } finally { await rm(directory, { recursive: true, force: true }) }
}

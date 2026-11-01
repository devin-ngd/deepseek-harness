import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createHdcUiPort } from '../operations/connection-hdc-port.mjs'
import { Clock } from './helpers/connection-ui-fixture.mjs'

function fixture(t, maxBytes = 1024) {
  const clock = new Clock(), calls = [], children = []
  const port = createHdcUiPort({ file: 'synthetic-hdc.exe', server: '127.0.0.1:8710', timeoutMs: 100, maxBytes, scheduler: clock,
    spawnProcess(file, args, options) {
      calls.push({ file, args, options })
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kills = 0; child.kill = () => { child.kills++; return true }; children.push(child); return child
    },
  })
  t.after(() => { for (const child of children) { child.emit('close', 1); child.stdout.destroy(); child.stderr.destroy() }; assert.equal(clock.pending.size, 0) })
  return { clock, calls, children, port }
}

test('HDC driver uses exact argv and preserves Chinese across stream chunk boundaries', async t => {
  const f = fixture(t), pending = f.port.run(['-t', 'synthetic', 'shell', 'pidof', 'synthetic.mobile'])
  assert.equal(f.calls[0].options.shell, false); assert.equal(f.calls[0].options.windowsHide, true)
  assert.deepEqual(f.calls[0].args, ['-p', '-s', '127.0.0.1:8710', '-t', 'synthetic', 'shell', 'pidof', 'synthetic.mobile'])
  const bytes = Buffer.from('已配对'), child = f.children[0]
  child.stdout.write(bytes.subarray(0, 2)); child.stdout.write(bytes.subarray(2)); child.emit('close', 0)
  assert.equal(await pending, '已配对'); assert.equal(f.clock.pending.size, 0)
})

test('HDC abort requests termination but does not settle until child close', async t => {
  const f = fixture(t), controller = new AbortController()
  let settled = false
  const pending = f.port.run(['list', 'targets'], controller.signal).finally(() => { settled = true })
  controller.abort(); await Promise.resolve()
  assert.equal(f.children[0].kills, 1); assert.equal(settled, false)
  f.children[0].emit('close', null); await assert.rejects(pending, /outcome unknown/); assert.equal(f.calls.length, 1)
})

test('HDC command timeout waits for close and never reports a successful late exit', async t => {
  const f = fixture(t); let settled = false
  const pending = f.port.run(['list', 'targets']).finally(() => { settled = true })
  f.clock.advance(100); await Promise.resolve()
  assert.equal(f.children[0].kills, 1); assert.equal(settled, false)
  f.children[0].emit('close', 0); await assert.rejects(pending, /outcome unknown/)
})

test('HDC output overflow and reported errors remain failures without exposing raw output', async t => {
  const f = fixture(t, 4), pending = f.port.run(['list', 'targets'])
  f.children[0].stdout.write('private-output-too-large'); assert.equal(f.children[0].kills, 1)
  f.children[0].emit('close', 0); await assert.rejects(pending, error => !error.message.includes('private-output'))
  const g = fixture(t), reported = g.port.run(['list', 'targets'])
  g.children[0].stderr.write('[Fail] private-detail'); g.children[0].emit('close', 0)
  await assert.rejects(reported, /outcome unknown/)
})

test('pre-cancelled HDC command never starts a process', async t => {
  const f = fixture(t), controller = new AbortController(); controller.abort()
  await assert.rejects(f.port.run(['list', 'targets'], controller.signal), /cancelled/); assert.deepEqual(f.calls, [])
})

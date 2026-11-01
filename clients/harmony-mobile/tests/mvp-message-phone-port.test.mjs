import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createHdcUiPort } from '../operations/connection-hdc-port.mjs'
import { createMvpMessagePhonePort } from '../operations/mvp-message-phone-port.mjs'
import { targetReference } from '../scripts/connection-deployment-lib.mjs'
import { mvpFixture } from './helpers/mvp-message-fixture.mjs'

function fixture(t, fault = () => {}) {
  const f = mvpFixture(), processes = [], calls = [], files = new Map(), timers = new Set()
  const hdc = createHdcUiPort({ file: 'synthetic-hdc.exe', server: '127.0.0.1:8710', timeoutMs: 1000, maxBytes: 128000,
    scheduler: { after(ms, cb) { timers.add(cb); return () => timers.delete(cb) } },
    spawnProcess(file, args, options) {
      calls.push({ file, args, options })
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { child.emit('close', null); return true }; processes.push(child)
      queueMicrotask(async () => {
        try {
          const cmd = args.slice(6)
          await fault(cmd)
          let output = ''
          if (cmd[0] === 'pidof') output = f.target.pid
          else if (cmd[0] === 'cat') { if (!files.has(cmd[1])) throw Error('missing synthetic dump'); output = files.get(cmd[1]) }
          else if (cmd[0] === 'rm') files.delete(cmd[1])
          else if (cmd[1] === 'dumpLayout') {
            const path = cmd.at(-1), coverage = cmd.includes('-i') ? 'complete' : 'viewport', view = f.layout(coverage)
            files.set(path, JSON.stringify({ children: view.nodes.map(attributes => ({ attributes })) })); output = 'DumpLayout saved to:' + path
          }
          else if (cmd[2] === 'inputText') { assert.equal(cmd.length, 6); await f.ui.input(cmd.slice(3, 5), cmd[5]) }
          else if (cmd[2] === 'click') await f.ui.click(cmd.slice(3, 5))
          else if (cmd[2] === 'swipe') { assert.equal(cmd.at(-1), '500'); await f.ui.scroll(cmd.slice(3, 7)) }
          else throw Error('unexpected synthetic HDC command')
          child.stdout.write(output); child.emit('close', 0)
        } catch (error) { child.stderr.write(String(error)); child.emit('close', 1) }
      })
      return child
    },
  })
  const options = { hdc, target: 'synthetic-original', targetRef: targetReference('synthetic-original'), bundle: f.target.bundle, dumpPrefix: '/data/local/tmp/synthetic_mvp_port', clock: () => f.s.now, pause: f.ui.pause }
  f.options.ui = createMvpMessagePhonePort(options)
  t.after(() => { for (const child of processes) { child.stdout.destroy(); child.stderr.destroy() }; assert.equal(timers.size, 0); assert.equal(files.size, 0) })
  return { ...f, calls, options }
}

test('the complete flow traverses shell-free HDC argv with no quote bytes or shared dumps', async t => {
  const f = fixture(t), result = await f.flow().run()
  assert.equal(result.runningStopVerified, true); assert.equal(f.sends(), 2)
  const inputs = f.calls.filter(c => c.args.includes('inputText'))
  assert.deepEqual(inputs.map(c => c.args.at(-1)), f.plan.messages)
  assert.ok(f.calls.every(c => c.options.shell === false && c.options.windowsHide === true))
  assert.ok(f.calls.every(c => c.args.slice(0, 6).join('|') === '-p|-s|127.0.0.1:8710|-t|synthetic-original|shell'))
  const dumps = f.calls.filter(c => c.args.includes('dumpLayout')).map(c => c.args.at(-1))
  assert.equal(new Set(dumps).size, dumps.length)
  assert.equal(f.calls.some(c => c.args.includes('list') || c.args.includes('install')), false)
})

test('the raw HDC input adapter refuses quotes before creating any child', async t => {
  const f = fixture(t)
  const port = createMvpMessagePhonePort(f.options)
  assert.throws(() => port.input(['10', '20'], "'quoted'"), /invalid/)
  assert.equal(f.calls.length, 0)
})

test('a changed original target reference is rejected at construction without IO', () => {
  assert.throws(() => createMvpMessagePhonePort({ target: 'synthetic-original', targetRef: 'target-wrong', bundle: 'synthetic.mobile', dumpPrefix: '/data/local/tmp/synthetic_mvp_port' }), /invalid/)
})

test('a failed dump read still removes only the allocated temporary file and never inputs or clicks', async t => {
  const f = fixture(t, cmd => { if (cmd[0] === 'cat') throw Error('synthetic read failure') })
  await assert.rejects(f.flow().run(), e => e.code === 'ui-port-failed' && e.effects.send1 === 'not-issued')
  assert.equal(f.calls.filter(c => c.args.includes('rm')).length, 1)
  assert.equal(f.calls.some(c => c.args.includes('inputText') || c.args.includes('click')), false)
})

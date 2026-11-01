import test from 'node:test'
import assert from 'node:assert/strict'
import { AutomaticConnection } from '../.build/automatic-connection.js'

function fixture() {
  const timers = new Set(), state = { paired: false, online: false, attempts: 0, stops: 0 }
  const port = { available: () => state.paired, connected: () => state.online, connect: async () => { state.attempts++; state.online = true }, disconnect: async () => { state.stops++; state.online = false }, failed: () => {} }
  const scheduler = { after: (_ms, fn) => { timers.add(fn); return () => timers.delete(fn) } }
  const owner = new AutomaticConnection(port, scheduler, 5000)
  return { state, port, owner, timers, tick: async () => { const next = [...timers]; timers.clear(); for (const fn of next) fn(); await new Promise(resolve => setImmediate(resolve)) } }
}

test('saved pairing connects on opening, reconnects after loss and respects manual disconnect', async () => {
  const f = fixture()
  try {
    await f.owner.start(); assert.equal(f.state.attempts, 0)
    f.state.paired = true; await f.tick(); assert.equal(f.state.attempts, 1)
    f.state.online = false; await f.tick(); assert.equal(f.state.attempts, 2)
    await f.owner.stop(); await f.tick(); assert.equal(f.state.attempts, 2); assert.equal(f.timers.size, 0)
  } finally { await f.owner.stop() }
})

test('disconnect during a pending connection waits for cancellation and leaves no late retry', async () => {
  const f = fixture(); let release
  f.state.paired = true
  f.port.connect = async () => { f.state.attempts++; await new Promise(resolve => { release = resolve }); f.state.online = true }
  f.port.disconnect = async () => { release?.(); f.state.stops++; f.state.online = false }
  const pending = f.owner.start(); await new Promise(resolve => setImmediate(resolve))
  await f.owner.stop(); await pending; await f.tick()
  assert.equal(f.state.attempts, 1); assert.equal(f.state.online, false); assert.equal(f.timers.size, 0)
})

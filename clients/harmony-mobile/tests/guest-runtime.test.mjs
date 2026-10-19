/** Canonical guest JavaScript unit tests in a fake DOM, not browser or ArkWeb evidence. */
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { guestSdk } from '../.build/upstream-guest-sdk.js'
import { MockDesktop } from '../.build/mock.js'
import { GuestGate } from '../.build/bridge.js'

function setup() {
  const desktop = new MockDesktop('mock'), sid = desktop.sessions[0].sessionId, mount = desktop.mount(sid), source = {}
  const gate = new GuestGate(desktop, { source, sessionId: mount.snapshot.scope.sessionId, mountId: mount.mountId, renderRevision: 1, packetBytes: 131072, maxPackets: 64 })
  let listener, hostSeq = 0
  const events = [], sent = []
  const context = vm.createContext({
    crypto: webcrypto, TextEncoder, setTimeout, clearTimeout, performance,
    ResizeObserver: class { observe() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail } },
    document: { body: {}, querySelector: () => ({ scrollHeight: 120, getBoundingClientRect: () => ({ height: 120 }) }),
      documentElement: { style: { setProperty() {} } } },
    richGuest: {
      subscribe(callback) { listener = callback; return () => { listener = null } },
      send(packet) {
        const detached = JSON.parse(JSON.stringify(packet))
        sent.push(detached)
        const result = gate.receive(JSON.stringify(detached), source)
        if (['draft.save', 'action.invoke', 'action.status'].includes(packet.type)) {
          queueMicrotask(() => deliver('result', { requestId: packet.packetId, ...(packet.type === 'action.status' ? { result } : { receipt: result }) }))
        }
      },
    },
    dispatchEvent(event) { events.push(event) }, addEventListener() {},
  })
  vm.runInContext('window = globalThis', context)
  const deliver = (type, payload) => listener?.({ protocol: 'lumina-rich/1', mountId: mount.mountId, renderRevision: 1,
    seq: ++hostSeq, packetId: 'host-' + hostSeq, type, payload })
  vm.runInContext(guestSdk(mount.mountId, 1), context, { timeout: 1000 })
  deliver('init', { snapshot: mount.snapshot })
  return { desktop, sid, mount, context, sent, events, deliver, close: () => { deliver('dispose', {}); gate.close() } }
}

test('canonical guest SDK submits latest input through scoped mock gate and queries completion', async () => {
  const lab = setup()
  try {
    vm.runInContext("rich.setDraft({ title: '最后一个字', count: '5' });", lab.context)
    const receipt = await vm.runInContext('rich.submit()', lab.context)
    assert.equal(receipt.accepted, true)
    assert.equal(lab.desktop.admittedActions, 1)
    assert.deepEqual(lab.desktop.snapshotFor(lab.sid).draft.fields, { title: '最后一个字', count: '5' })
    lab.desktop.completeAction(lab.mount.mountId, receipt.actionId)
    lab.deliver('snapshot', { snapshot: lab.desktop.snapshotFor(lab.sid) })
    const result = await vm.runInContext(`rich.status(${JSON.stringify(receipt.actionId)})`, lab.context)
    assert.equal(result.state, 'completed')
    assert.equal(result.terminal, true)
  } finally { lab.close() }
})

test('guest state snapshots with older data/draft revisions cannot erase newer input', async () => {
  const lab = setup()
  try {
    vm.runInContext("rich.setDraft({ title: '保留草稿' });", lab.context)
    const receipt = await vm.runInContext('rich.submit()', lab.context)
    lab.desktop.completeAction(lab.mount.mountId, receipt.actionId)
    lab.deliver('snapshot', { snapshot: lab.desktop.snapshotFor(lab.sid) })
    const current = vm.runInContext('rich.getState().dataRevision', lab.context)
    lab.deliver('snapshot', { snapshot: lab.mount.snapshot })
    assert.equal(vm.runInContext('rich.getState().dataRevision', lab.context), current)
    assert.equal(vm.runInContext('rich.getDraft().title', lab.context), '保留草稿')
  } finally { lab.close() }
})

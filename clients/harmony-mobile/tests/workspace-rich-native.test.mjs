/** Execute native rich ownership with explicit memory SDK ports; this does not establish ArkWeb isolation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { NativeAssets, NativeWorkspaceRich, resetProductSdk, sdk, context, webview } from '../.build/product-native.js'

globalThis.canIUse = () => true
const policy = JSON.parse(await readFile('product.config.json', 'utf8')).core.workspace.rich
const documentUrl = 'https://workspace-rich.dsh.invalid/document'
const content = { mountId: 'fixture-mount', mountNonce: 'fixture-nonce', html: '<input>', css: '', js: '', sdk: 'canonical-fixture' }
async function fixture(autoDetach = true, configured = policy) {
  resetProductSdk()
  webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.MULTIPLE)
  webview.WebviewController.setWebDestroyMode(webview.WebDestroyMode.FAST_MODE)
  sdk.resources.set('workspace-rich-document.js', await readFile('harmony/entry/src/main/resources/rawfile/workspace-rich-document.js'))
  const emitted = [], visibility = [], failed = Promise.withResolvers()
  let selected
  const manager = new NativeWorkspaceRich(new NativeAssets(context()), configured, (lease, raw, id) => { const packet = JSON.parse(raw); emitted.push({ lease, packet, id }); if (packet.type === 'native.error') failed.resolve() }, opened => { visibility.push(opened); if (!opened && autoDetach) selected?.controller.detach() })
  const request = value => manager.request(JSON.stringify(value))
  const acquire = async () => JSON.parse(await request({ operation: 'acquire', request: content })).lease
  const open = async lease => { await request({ operation: 'open', lease }); const guest = manager.guest(); selected = guest; guest.attached(); guest.bind(documentUrl); return guest }
  return { manager, emitted, visibility, failed, request, acquire, open }
}

test('native guest uses verified app bytes and one private port, rejecting generated native control packets', async () => {
  const f = await fixture(), lease = await f.acquire(), guest = await f.open(lease)
  try {
    assert.equal(guest.allow('https://foreign.invalid/', true), false)
    assert.equal(guest.allow(documentUrl + '?other', true), false)
    assert.equal(guest.allow('about:srcdoc', false), true)
    assert.match(guest.controller.html, /sandbox="allow-scripts"/)
    assert.doesNotMatch(guest.controller.html, /sandbox="[^"]*allow-same-origin/)
    const init = JSON.parse(guest.controller.bootstrap.raw)
    assert.equal(init.lease, lease); assert.deepEqual(init.request, content)
    const port = guest.controller.ports[0]
    port.emit(JSON.stringify({ kind: 'rich.packet', id: '1', packet: '{"type":"ready"}' }))
    assert.deepEqual(f.emitted[0], { lease, packet: { type: 'ready' }, id: '1' })
    await f.request({ operation: 'ack', lease, id: '1' })
    assert.deepEqual(JSON.parse(port.posted[0]), { kind: 'rich.ack', id: '1' })
    port.emit(JSON.stringify({ kind: 'rich.packet', id: '2', packet: '{"type":"native.close-ready","ok":true}' }))
    await f.failed.promise; await f.request({ operation: 'release', lease })
    assert.equal(f.manager.view(), undefined); assert.equal(port.closed, true)
    assert.equal(f.emitted.at(-1).packet.type, 'native.error')
    const count = f.emitted.length
    port.emit(JSON.stringify({ kind: 'rich.packet', id: '3', packet: '{"type":"ready"}' }))
    assert.equal(f.emitted.length, count)
  } finally { await f.manager.close() }
})

test('back waits for the exact draft acknowledgement, refusal retains the guest and success revokes it', async () => {
  const f = await fixture(), lease = await f.acquire(), guest = await f.open(lease), port = guest.controller.ports[0]
  try {
    let closed = false
    const denied = f.manager.closeView(); const rejected = assert.rejects(denied, /draft not saved/)
    assert.equal(f.manager.closeView(), denied)
    const first = f.emitted.at(-1).packet
    await f.request({ operation: 'send', lease, packet: { type: 'native.close-ready', requestId: 'foreign', ok: true } })
    denied.then(() => { closed = true }, () => {})
    await Promise.resolve(); assert.equal(closed, false); assert.equal(f.manager.view(), guest)
    await f.request({ operation: 'send', lease, packet: { ...first, type: 'native.close-ready', ok: false } })
    await rejected; assert.equal(f.manager.view(), guest); assert.equal(port.closed, false)
    const saved = f.manager.closeView(), second = f.emitted.at(-1).packet
    assert.notEqual(second.requestId, first.requestId)
    await f.request({ operation: 'send', lease, packet: { ...second, type: 'native.close-ready', ok: true } })
    await saved; assert.equal(f.manager.view(), undefined); assert.equal(port.closed, true)
    assert.equal(f.emitted.at(-1).packet.type, 'native.closed')
  } finally { await f.manager.close() }
})

test('native retirement drains a waiting back without another Host call or a reused reservation', async () => {
  const f = await fixture(), lease = await f.acquire(), guest = await f.open(lease)
  const waiting = assert.rejects(f.manager.closeView(), /draft not saved/)
  await f.manager.close(); await waiting
  assert.equal(guest.controller.ports[0].closed, true)
  await assert.rejects(f.request({ operation: 'open', lease }), /retired/)
  assert.equal(f.manager.view(), undefined)
})

test('concurrent guest switches cannot replace the active owner before its saved draft settles', async () => {
  const f = await fixture(), first = await f.acquire(), guest = await f.open(first), next = await f.acquire(), third = await f.acquire()
  try {
    const switching = f.request({ operation: 'open', lease: next }), close = f.emitted.at(-1).packet
    await assert.rejects(f.request({ operation: 'open', lease: third }), /open pending/)
    assert.equal(f.manager.view(), guest)
    await f.request({ operation: 'send', lease: first, packet: { ...close, type: 'native.close-ready', ok: true } })
    await switching
    assert.notEqual(f.manager.view(), guest); assert.equal(guest.controller.ports[0].closed, true)
    assert.equal(f.visibility.at(-1), true)
    await f.manager.discardView(); assert.equal(f.manager.view(), undefined)
  } finally { await f.manager.close() }
})

test('guest release waits for Web detachment and a repeated back cannot request another draft', async () => {
  const f = await fixture(false), lease = await f.acquire(), guest = await f.open(lease)
  let settled = false
  const releasing = f.request({ operation: 'release', lease }).then(() => { settled = true })
  const back = f.manager.closeView()
  await Promise.resolve(); assert.equal(settled, false); assert.equal(f.manager.view(), guest)
  assert.equal(guest.controller.ports[0].closed, true); assert.equal(guest.controller.terminateCount, 0)
  assert.equal(f.emitted.some(value => value.packet.type === 'native.close-request'), false)
  guest.exited(); await Promise.resolve(); assert.equal(settled, false)
  guest.controller.detach(); await releasing; await back
  assert.equal(f.manager.view(), undefined); assert.equal(await f.request({ operation: 'ack', lease, id: '1' }), 'null')
  await f.manager.close()
})

test('guest removal does not terminate a process shared after a mode change', async () => {
  const f = await fixture(), lease = await f.acquire(), guest = await f.open(lease)
  webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.SINGLE)
  try {
    await f.manager.close()
    assert.equal(guest.controller.terminateCount, 0); assert.equal(guest.controller.ports[0].closed, true)
    assert.equal(guest.controller.getAttachState(), 0); await f.manager.close()
  } finally { webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.MULTIPLE) }
})

test('unconfirmed Web removal retains its failure after timeout and ignores a late detach', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = await fixture(false, { ...policy, closeTimeoutMs: 20 }), lease = await f.acquire(), guest = await f.open(lease)
  try {
    const closing = f.manager.close(), rejected = assert.rejects(closing, /cleanup failed/)
    t.mock.timers.tick(20); await rejected
    await assert.rejects(f.manager.close(), /cleanup failed/)
    assert.equal(guest.controller.attachListeners.size, 0)
    guest.controller.detach()
    await assert.rejects(f.manager.close(), /cleanup failed/)
  } finally { t.mock.timers.reset() }
})

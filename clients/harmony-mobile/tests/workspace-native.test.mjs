/** Execute the actual ETS workspace owner with explicit memory SDK ports; this does not establish ArkWeb isolation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { NativeDeviceProductFacade, NativeProductRichOwner, NativeWorkspaceOwner, NativeWorkspaceCache, resetProductSdk, sdk, context } from '../.build/product-native.js'
import { DeviceProductRpc } from '../.build/device-product-rpc.js'

class ResourceResponse {
  ready = true
  completed = Promise.withResolvers()
  setResponseCode(value) { this.status = value }
  setReasonMessage() {}
  setResponseData(value) { this.body = value }
  setResponseMimeType(value) { this.mime = value }
  setResponseEncoding() {}
  setResponseHeader(value) { this.headers = value }
  setResponseIsReady(value) { this.ready = value; if (value) this.completed.resolve() }
}
globalThis.WebResourceResponse = ResourceResponse
globalThis.canIUse = () => true
const { core: policy, relay } = JSON.parse(await readFile('product.config.json', 'utf8'))
const origin = 'https://d-fixture.desktop.workspace.dsh.invalid'
const request = (url, method = 'GET') => ({ getRequestUrl: () => url, getRequestMethod: () => method })

test('returning to native chat loads its Rich document after the Web controller reattaches', async t => {
  resetProductSdk()
  sdk.resources.set('product-rich-document.js', await readFile('harmony/entry/src/main/resources/rawfile/product-rich-document.js'))
  const owner = new NativeProductRichOwner({}, JSON.stringify(policy))
  owner.initialize(context())
  const load = t.mock.method(owner.controller, 'loadData', () => {
    assert.equal(owner.controller.getAttachState(), 1, 'a detached controller cannot load a document')
  })
  owner.attached()
  await owner.close()
  owner.controller.detach()
  await owner.foreground()
  assert.equal(load.mock.callCount(), 1)
  owner.controller.attachState = 1
  owner.attached()
  assert.equal(load.mock.callCount(), 2)
  await owner.close()
  await owner.foreground()
  assert.equal(load.mock.callCount(), 3)
  await owner.close()
})

test('native workspace boot diagnostics preserve rejection without exposing private fields', async t => {
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  const facade = new NativeDeviceProductFacade({}, JSON.stringify({ ...policy, enabled: true }), 'fixture-alias', 'relay.example', 5000, relay,
    {}, {}, { after: () => () => {} }, () => 1000, async () => { assert.fail('must not open a connection') }, () => {}, 100)
  const failure = new Error('private-cause')
  facade.device = { workspaceGeneration: () => 1, workspace: async () => { throw failure } }
  const raw = JSON.stringify({ operation: 'fetch', url: origin + '/api/richInline/appearance?key=private-query', method: 'POST', headers: [['authorization', 'private-header']] })
  await assert.rejects(facade.workspaceRequest('fixture-1', raw, 1), actual => actual === failure)
  await assert.rejects(facade.workspaceRequest('fixture-1', raw, 2), error => error.code === 'scope-denied')
  await assert.rejects(facade.workspaceRequest('fixture-1', 'not JSON private-content', 1), SyntaxError)
  assert.deepEqual(warnings, [
    'DSH_WORKSPACE_RPC operation=rich-appearance failure=unclassified',
    'DSH_WORKSPACE_RPC operation=rich-appearance failure=scope-denied',
    'DSH_WORKSPACE_RPC operation=invalid-request failure=invalid-packet',
  ])
})

async function fixture(workspace = policy.workspace) {
  resetProductSdk()
  sdk.resources.set('workspace-document.js', await readFile('harmony/entry/src/main/resources/rawfile/workspace-document.js'))
  const calls = [], cancelled = [], states = [], active = new Map()
  let generation = 1
  const product = {
    workspaceContext: async () => JSON.stringify({ origin, generation }), workspaceGeneration: () => generation,
    workspacePrepare: async () => JSON.stringify({ revision: 'a'.repeat(64), resources: [] }),
    async workspaceRequest(id, raw, selected) { calls.push({ id, value: JSON.parse(raw), selected }); return 'null' },
    async workspaceResource(id, url, selected) { calls.push({ id, url, selected }); return JSON.stringify({ status: 200, headers: [['content-type', 'image/png']], body: Buffer.from([0, 255, 32]).toString('base64url') }) },
    cancelWorkspaceRequest(id) { cancelled.push(id); active.get(id)?.resolve() },
  }
  const owner = new NativeWorkspaceOwner(product, JSON.stringify({ ...policy, workspace }))
  let remove = () => owner.controller.detach()
  owner.initialize(context(), state => { states.push(state); if (state === 'unmount') remove() })
  await owner.open('native-session'); owner.attached()
  return { owner, product, calls, cancelled, states, active, replace() { generation++ }, removing(fn) { remove = fn } }
}

test('workspace initialization failure leaves the configured entry usable as a local error', async t => {
  for (const cause of ['renderer', 'document']) {
    await t.test(cause, async t => {
      resetProductSdk()
      const product = {
        workspaceContext: () => assert.fail('an unavailable workspace must not acquire a Host context'),
        workspacePrepare: () => assert.fail('an unavailable workspace must not prepare a Host peer'),
      }
      const owner = new NativeWorkspaceOwner(product, JSON.stringify(policy)), states = [], warnings = []
      t.mock.method(console, 'warn', warning => warnings.push(warning))
      if (cause === 'renderer') {
        sdk.resources.set('workspace-document.js', Buffer.from('fixture'))
        t.mock.method(owner.controller.constructor, 'setRenderProcessMode', () => { throw new Error('private ArkWeb error') })
      }
      owner.initialize(context(), state => states.push(state))
      assert.equal(owner.supported(), true)
      await assert.rejects(owner.open('native-session', 'dsh-devflow'), error => owner.startupFailure(error) === 'native-init')
      assert.deepEqual(owner.scripts(), [])
      assert.deepEqual(states, ['failed'])
      assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=native-init'])
      await owner.close()
    })
  }
})

test('the actual native owner binds only its original origin, root document and private port', async () => {
  const f = await fixture()
  try {
    assert.deepEqual(f.owner.scripts()[0].scriptRules, [origin])
    assert.match(f.owner.scripts()[0].script, /^if\(window.top===window\)/)
    assert.equal(f.owner.allow('https://other.invalid/', true), false)
    assert.equal(f.owner.allow(origin + '/other', true), false)
    f.owner.bind(origin + '/other'); assert.equal(f.owner.controller.bootstrap, null)
    f.owner.bind(origin + '/')
    const init = JSON.parse(f.owner.controller.bootstrap.raw)
    assert.equal(init.sessionId, 'native-session'); assert.equal(init.limits.origin, origin)
    assert.equal(f.owner.controller.bootstrap.uri, origin)
    const port = f.owner.controller.ports[0]
    port.emit('{"kind":"workspace.selection","sessionId":"web-session"}')
    assert.equal(f.owner.selectedSession(), 'web-session')
    port.emit('{"kind":"workspace.request","id":"1","request":"{\\"operation\\":\\"bootstrap\\"}"}')
    await Promise.resolve(); await Promise.resolve()
    assert.deepEqual(f.calls[0].value, { operation: 'bootstrap' }); assert.equal(f.calls[0].selected, 1)
    assert.equal(JSON.parse(port.posted[0]).id, '1')
    await f.owner.close()
    assert.equal(port.closed, true)
    const count = f.calls.length
    port.emit('{"kind":"workspace.request","id":"2","request":"{}"}')
    assert.equal(f.calls.length, count)
  } finally { await f.owner.close() }
})

test('the native owner records a fixed first load failure for each document', async t => {
  const f = await fixture(), warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  try {
    f.owner.bind(origin + '/')
    const port = f.owner.controller.ports[0]
    port.emit('{"kind":"workspace.failed","stage":"navigation"}')
    port.emit('{"kind":"workspace.failed","stage":"script-error"}')
    port.emit('{"kind":"workspace.ready"}')
    assert.deepEqual(f.states, ['loading', 'failed'])
    assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=navigation'])

    await f.owner.open('retry-session')
    f.owner.attached(); f.owner.bind(origin + '/')
    f.owner.controller.ports[0].emit('{"kind":"workspace.failed","stage":"private-session"}')
    assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=navigation', 'DSH_WORKSPACE_LOAD stage=port-packet'])
    assert.ok(!f.states.includes('ready'))
  } finally { await f.owner.close() }
})

test('an unavailable root document distinguishes a response from a failed transfer', async t => {
  for (const stage of ['document-response', 'document-transfer']) {
    await t.test(stage, async t => {
      const f = await fixture(), warnings = []
      t.mock.method(console, 'warn', message => warnings.push(message))
      try {
        f.product.workspaceResource = async () => {
          if (stage === 'document-transfer') throw new Error('private-resource-url')
          return JSON.stringify({ status: 404, headers: [], body: '' })
        }
        const result = f.owner.intercept(request(origin + '/'))
        await result.completed.promise
        assert.equal(result.status, stage === 'document-response' ? 404 : 502)
        assert.deepEqual(f.states, ['loading', 'failed'])
        assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=' + stage])
      } finally { await f.owner.close() }
    })
  }
})

test('a controller load error retires the workspace and allows a clean retry', async t => {
  const f = await fixture(), warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  try {
    await f.owner.open('native-session', 'standard-fixture')
    const controller = f.owner.controller, view = f.owner.viewGeneration()
    t.mock.method(controller, 'loadUrl', () => { throw new Error('private SDK failure') })
    f.owner.attached(view)
    await f.owner.close()
    assert.equal(controller.getAttachState(), 0)
    assert.equal(controller.attachListeners.size, 0)
    assert.deepEqual(f.states.slice(-4), ['loading', 'failed', 'rich-closed', 'unmount'])
    assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=controller-attach'])
    assert.equal(f.owner.pluginTarget(), 'standard-fixture')
    await f.owner.open(f.owner.selectedSession(), f.owner.pluginTarget())
    f.owner.attached(); f.owner.bind(origin + '/')
    f.owner.controller.ports[0].emit('{"kind":"workspace.ready"}')
    assert.equal(f.states.at(-1), 'ready')
  } finally { await f.owner.close() }
})

test('a port handoff error closes both untransferred ports before reopening', async t => {
  const f = await fixture(), warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  try {
    const controller = f.owner.controller
    t.mock.method(controller, 'postMessage', () => { throw new Error('private port failure') })
    f.owner.bind(origin + '/')
    await f.owner.close()
    assert.equal(controller.getAttachState(), 0)
    assert.deepEqual(controller.ports.map(port => port.closed), [true, true])
    assert.deepEqual(f.states, ['loading', 'failed', 'rich-closed', 'unmount'])
    assert.deepEqual(warnings, ['DSH_WORKSPACE_LOAD stage=port-bind'])
    controller.ports[0].emit('{"kind":"workspace.ready"}')
    assert.ok(!f.states.includes('ready'))
    await f.owner.open('retry-session')
    f.owner.attached(); f.owner.bind(origin + '/')
    assert.equal(f.owner.controller.ports[1].closed, false)
    f.owner.controller.ports[0].emit('{"kind":"workspace.ready"}')
    assert.equal(f.states.at(-1), 'ready')
  } finally { await f.owner.close() }
})

test('an unconfirmed untransferred port close blocks reopening on a replacement connection', async t => {
  const f = await fixture(), controller = f.owner.controller
  t.mock.method(controller, 'postMessage', () => {
    t.mock.method(controller.ports[1], 'close', () => { throw new Error('private peer close failure') })
    throw new Error('private handoff failure')
  })
  f.owner.bind(origin + '/')
  await assert.rejects(f.owner.close(), /native workspace cleanup failed/)
  assert.equal(controller.ports[0].closed, true)
  assert.equal(controller.getAttachState(), 0)
  f.replace()
  await assert.rejects(f.owner.open('unsafe-retry'), /native workspace cleanup failed/)
  assert.equal(f.owner.controller, controller)
})

test('native workspace close awaits Web detachment before releasing the Host peer', async () => {
  const f = await fixture(), removed = Promise.withResolvers(), events = []
  const view = f.owner.viewGeneration()
  f.removing(() => { events.push('remove'); removed.resolve() })
  f.product.workspaceRequest = async (_id, raw) => { events.push(JSON.parse(raw).operation); return 'null' }
  let finished = false
  const closing = f.owner.close().then(() => { finished = true })
  await removed.promise
  assert.equal(finished, false); assert.deepEqual(events, ['remove'])
  f.owner.exited(view); await Promise.resolve(); assert.equal(finished, false)
  f.owner.controller.detach(); await closing
  assert.deepEqual(events, ['remove', 'close']); assert.equal(f.owner.controller.terminateCount, 0)
  assert.equal(f.owner.controller.attachListeners.size, 0)
})

test('a failed Host close blocks reopening until the native connection is replaced', async () => {
  const f = await fixture(), previous = f.owner.controller, closedGenerations = []
  const failure = new Error('encrypted close failed')
  f.product.workspaceRequest = async (_id, raw, generation) => {
    assert.equal(JSON.parse(raw).operation, 'close')
    closedGenerations.push(generation)
    if (generation === 1) throw failure
    return 'null'
  }
  await assert.rejects(f.owner.close(), error => error === failure)
  assert.equal(previous.getAttachState(), 0)
  await assert.rejects(f.owner.open('blocked-session'), error => error === failure)
  assert.deepEqual(closedGenerations, [1])
  f.replace()
  await f.owner.open('new-session', 'dsh-devflow')
  f.owner.attached(); f.owner.bind(origin + '/')
  const opened = JSON.parse(f.owner.controller.bootstrap.raw)
  assert.notEqual(f.owner.controller, previous)
  assert.equal(opened.plugin, 'dsh-devflow')
  assert.equal(opened.sessionId, 'new-session')
  await f.owner.close()
  assert.deepEqual(closedGenerations, [1, 2])
})

test('a replacement connection cannot reopen after native removal and Host close both fail', async () => {
  const f = await fixture(), previous = f.owner.controller
  f.removing(() => { throw new Error('cannot remove native Web') })
  f.product.workspaceRequest = async () => { throw new Error('encrypted close failed') }
  try {
    await assert.rejects(f.owner.close(), /encrypted close failed/)
    f.replace()
    await assert.rejects(f.owner.open('blocked-session'), /encrypted close failed/)
    assert.equal(f.owner.controller, previous)
  } finally { previous.detach() }
})

test('a replacement connection cannot reopen after the native message port fails to close', async t => {
  for (const replaceBeforeClose of [false, true]) {
    await t.test(replaceBeforeClose ? 'old connection already replaced' : 'Host confirms close', async t => {
      const f = await fixture(), previous = f.owner.controller
      f.owner.bind(origin + '/')
      const port = previous.ports[0]
      t.mock.method(port, 'close', () => { throw new Error('native port close failed') })

      if (replaceBeforeClose) f.replace()
      await assert.rejects(f.owner.close(), /native workspace cleanup failed/)
      assert.equal(previous.getAttachState(), 0)
      assert.deepEqual(f.calls.map(call => call.value.operation), replaceBeforeClose ? [] : ['close'])
      if (!replaceBeforeClose) f.replace()
      await assert.rejects(f.owner.open('blocked-session', 'dsh-devflow'), /native workspace cleanup failed/)
      assert.equal(f.owner.controller, previous)
    })
  }
})

test('switching an attached workspace to a plugin keeps the replacement attempt alive through its old component disappearance', async () => {
  const f = await fixture(), previous = f.owner.viewGeneration(), controller = f.owner.controller
  f.removing(() => { f.owner.retire(previous); controller.detach() })
  try {
    await f.owner.open('native-session', '')
    assert.ok(f.owner.viewGeneration() > previous)
    f.owner.attached(); f.owner.bind(origin + '/')
    assert.equal(JSON.parse(f.owner.controller.bootstrap.raw).plugin, '')
  } finally { f.removing(() => f.owner.controller.detach()); await f.owner.close() }
})

test('workspace retry creates a new renderer and ignores all old component callbacks', async () => {
  const f = await fixture(), old = f.owner.controller, previous = f.owner.viewGeneration()
  try {
    f.owner.bind(origin + '/')
    await f.owner.open('new-session')
    const current = f.owner.viewGeneration()
    assert.notEqual(current, previous); assert.notEqual(f.owner.controller, old); assert.equal(old.getAttachState(), 0); assert.equal(old.terminateCount, 0)
    f.owner.attached(previous); f.owner.bind(origin + '/', previous); f.owner.navigation('https://wrong.invalid', previous); f.owner.retire(previous); f.owner.exited(previous)
    assert.equal(f.owner.controller.bootstrap, null); assert.equal(f.owner.allow(origin + '/', true, previous), false)
    assert.equal(f.owner.intercept(request(origin + '/asset'), previous).status, 403); assert.deepEqual(f.owner.scripts(previous), [])
    f.owner.attached(current); f.owner.bind(origin + '/', current)
    assert.equal(JSON.parse(f.owner.controller.bootstrap.raw).sessionId, 'new-session'); assert.equal(f.owner.controller.terminateCount, 0)
  } finally { await f.owner.close() }
})

test('a failed plugin workspace retries the same public package and selected Session without carrying it into a fresh workspace', async () => {
  const f = await fixture(), plugin = '@example/standard-plugin'
  try {
    await f.owner.open('native-session', plugin); f.owner.attached(); f.owner.bind(origin + '/')
    const first = f.owner.controller, port = first.ports[0]
    port.emit('{"kind":"workspace.selection","sessionId":"selected-in-plugin"}')
    port.emit('{"kind":"workspace.failed"}')
    assert.equal(f.states.at(-1), 'failed')
    await f.owner.close()
    await f.owner.open(f.owner.selectedSession(), f.owner.pluginTarget()); f.owner.attached(); f.owner.bind(origin + '/')
    const retried = JSON.parse(f.owner.controller.bootstrap.raw)
    assert.notEqual(f.owner.controller, first)
    assert.equal(retried.plugin, plugin); assert.equal(retried.sessionId, 'selected-in-plugin')
    await f.owner.open('fresh-session'); f.owner.attached(); f.owner.bind(origin + '/')
    const fresh = JSON.parse(f.owner.controller.bootstrap.raw)
    assert.equal(Object.hasOwn(fresh, 'plugin'), false)
    assert.equal(f.owner.pluginTarget(), undefined); assert.equal(fresh.sessionId, 'fresh-session')
  } finally { await f.owner.close() }
})

test('background close also retires an open waiting for its native connection identity', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), identity = Promise.withResolvers()
  f.product.workspaceContext = async () => { entered.resolve(); return identity.promise }
  const opening = f.owner.open('late-session')
  const rejected = assert.rejects(opening, /startup retired/)
  await entered.promise; const current = f.owner.controller
  await f.owner.close(); identity.resolve(JSON.stringify({ origin, generation: 1 })); await rejected
  assert.equal(f.owner.controller, current); assert.equal(f.owner.allow(origin + '/', true), false)
  assert.equal(f.states.filter(value => value === 'loading').length, 1)
})

test('retiring a prepared workspace drains the old request without a cleanup failure', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), preparation = Promise.withResolvers()
  f.product.workspacePrepare = () => { entered.resolve(); return preparation.promise }
  const opening = f.owner.open('retiring-session')
  const rejected = assert.rejects(opening, /startup retired/)
  await entered.promise
  f.replace()
  const closing = f.owner.close()
  await new Promise(setImmediate)
  preparation.resolve(JSON.stringify({ revision: 'b'.repeat(64), resources: [] }))
  await rejected
  await closing
  assert.equal(f.cancelled.length, 1)
  assert.equal(f.owner.allow(origin + '/', true), false)
})

test('native resource interception returns binary bytes and denies external and unsupported requests locally', async () => {
  const f = await fixture()
  try {
    assert.equal(f.owner.intercept(request('https://other.invalid/asset')).status, 403)
    assert.equal(f.owner.intercept(request(origin + '/api/mutate', 'POST')).status, 403)
    assert.equal(f.calls.length, 0)
    const response = f.owner.intercept(request(origin + '/assets/icon.png'))
    assert.equal(response.ready, false)
    await response.completed.promise
    assert.equal(response.status, 200); assert.equal(response.mime, 'image/png')
    assert.deepEqual([...new Uint8Array(response.body)], [0, 255, 32])
    assert.deepEqual(response.headers, [{ headerKey: 'content-type', headerValue: 'image/png' }])
  } finally { await f.owner.close() }
})

test('empty resources stay usable without entering the native cache', async () => {
  const f = await fixture(), path = '/assets/empty.js'
  f.product.workspacePrepare = async () => JSON.stringify({ revision: 'a'.repeat(64), resources: [{ path, sha256: createHash('sha256').update('').digest('hex'), bytes: 0, mediaType: 'text/javascript' }] })
  f.product.workspaceResource = async () => JSON.stringify({ status: 200, headers: [['content-type', 'text/javascript']], body: '' })
  try {
    await f.owner.open('native-session')
    for (let i = 0; i < 2; i++) {
      const response = f.owner.intercept(request(origin + path)); assert.equal(response.ready, false)
      await response.completed.promise
      assert.equal(response.status, 200); assert.equal(response.body.byteLength, 0)
    }
    assert.equal(f.states.includes('failed'), false)
  } finally { await f.owner.close() }
})

test('an empty response for a nonempty manifest script is rejected until verified bytes arrive', async () => {
  const f = await fixture(), path = '/assets/expected.js', bytes = Buffer.from('fixture script')
  const resource = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mediaType: 'text/javascript' }
  f.product.workspacePrepare = async () => JSON.stringify({ revision: 'a'.repeat(64), resources: [resource] })
  let body = '', reads = 0
  f.product.workspaceResource = async () => {
    reads++
    return JSON.stringify({ status: 200, headers: [['content-type', 'text/javascript']], body })
  }
  try {
    await f.owner.open('native-session')
    const empty = f.owner.intercept(request(origin + path))
    await empty.completed.promise
    assert.equal(empty.status, 502)
    assert.equal(f.states.includes('failed'), false)

    body = bytes.toString('base64url')
    const fresh = f.owner.intercept(request(origin + path))
    await fresh.completed.promise
    assert.equal(fresh.status, 200)
    assert.deepEqual(Buffer.from(fresh.body), bytes)
    const cached = f.owner.intercept(request(origin + path))
    assert.equal(cached.ready, true)
    assert.deepEqual(Buffer.from(cached.body), bytes)
    assert.equal(reads, 2)
  } finally { await f.owner.close() }
})

test('a failed subresource returns 502 while the workspace port remains usable; a failed root fails the workspace', async () => {
  const f = await fixture()
  f.product.workspaceResource = async () => { throw new Error('resource unavailable') }
  try {
    f.owner.bind(origin + '/')
    const resource = f.owner.intercept(request(origin + '/optional.js')); await resource.completed.promise
    assert.equal(resource.status, 502); assert.equal(resource.body.byteLength, 0); assert.equal(f.states.includes('failed'), false)
    f.owner.controller.ports[0].emit('{"kind":"workspace.ready"}')
    assert.equal(f.states.at(-1), 'ready')
    const root = f.owner.intercept(request(origin + '/')); await root.completed.promise
    assert.equal(root.status, 502); assert.equal(f.states.at(-1), 'failed')
  } finally { await f.owner.close() }
})

test('renderer boot failure reports only the current generation resource outcomes', async t => {
  const f = await fixture({ ...policy.workspace, maxResourceRequests: 1, maxQueuedResources: 1 })
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  const expected = Buffer.from([1])
  const resources = ['/plugins/verified', '/plugins/private-cache'].map(path => ({ path, bytes: expected.length,
    sha256: createHash('sha256').update(expected).digest('hex'), mediaType: 'text/javascript' }))
  f.product.workspacePrepare = async () => JSON.stringify({ revision: 'a'.repeat(64), resources })
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  f.product.workspaceResource = async (_id, url) => {
    const path = new URL(url).pathname
    if (path === '/assets/private-transfer') throw new Error('private request content')
    if (path === '/assets/held') { entered.resolve(); await release.promise }
    const status = path === '/plugins/private-http' ? 404 : 200
    return JSON.stringify({ status, headers: [['content-type', 'text/javascript']],
      body: (path === '/plugins/private-cache' ? Buffer.from([2]) : expected).toString('base64url') })
  }
  try {
    await f.owner.open('native-session'); f.owner.attached(); f.owner.bind(origin + '/')
    for (const [path, status] of [['/plugins/verified', 200], ['/plugins/private-http', 404], ['/assets/private-transfer', 502], ['/plugins/private-cache', 502]]) {
      const response = f.owner.intercept(request(origin + path))
      await response.completed.promise
      assert.equal(response.status, status)
    }
    assert.equal(f.owner.intercept(request(origin + '/plugins/verified')).status, 200)
    const held = f.owner.intercept(request(origin + '/assets/held'))
    await entered.promise
    const queued = f.owner.intercept(request(origin + '/assets/queued'))
    assert.equal(f.owner.intercept(request(origin + '/plugins/private-queue')).status, 403)
    const failed = '{"kind":"workspace.failed","stage":"renderer-boot"}'
    f.owner.controller.ports[0].emit(failed)
    f.owner.controller.ports[0].emit(failed)
    const stage = 'DSH_WORKSPACE_LOAD stage=renderer-boot'
    const assets = 'DSH_WORKSPACE_BOOT_ASSETS '
    assert.deepEqual(warnings, [stage, assets + '{"loaded":1,"cacheHits":1,"httpErrors":1,"resourceErrors":1,"cacheErrors":1,"queueRejected":1,"pluginErrors":3}'])
    release.resolve()
    await Promise.all([held.completed.promise, queued.completed.promise])
    await f.owner.open('other-session'); f.owner.attached(); f.owner.bind(origin + '/')
    f.owner.controller.ports[0].emit(failed)
    assert.deepEqual(warnings.slice(2), [stage, assets + '{"loaded":0,"cacheHits":0,"httpErrors":0,"resourceErrors":0,"cacheErrors":0,"queueRejected":0,"pluginErrors":0}'])
  } finally { release.resolve(); await f.owner.close() }
})

test('native close cancels and drains resource consumers before closing the exact original Host workspace', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), events = []
  f.product.workspaceResource = async id => {
    const gate = Promise.withResolvers(); f.active.set(id, gate); entered.resolve()
    await gate.promise; events.push('asset-retired'); throw new Error('cancelled')
  }
  f.product.workspaceRequest = async (_id, raw) => { events.push(JSON.parse(raw).operation); return 'null' }
  const resource = f.owner.intercept(request(origin + '/asset'))
  await entered.promise; await f.owner.close(); await resource.completed.promise
  assert.equal(f.cancelled.length, 1)
  assert.deepEqual(events, ['asset-retired', 'close'])
  await f.owner.open('new-session'); f.owner.attached(); f.owner.bind(origin + '/')
  f.replace(); await f.owner.close()
  assert.deepEqual(events, ['asset-retired', 'close'])
})

test('native resource downloads queue behind their own concurrency budget and close retires the backlog', async () => {
  const f = await fixture(), started = Promise.withResolvers(), events = []
  f.product.workspaceResource = async id => {
    const gate = Promise.withResolvers(); f.active.set(id, gate); events.push(id)
    if (events.length === policy.workspace.maxResourceRequests) started.resolve()
    await gate.promise; throw new Error('cancelled')
  }
  const responses = Array.from({ length: policy.workspace.maxResourceRequests + 8 }, (_value, index) => f.owner.intercept(request(origin + '/assets/' + index)))
  await started.promise
  assert.equal(events.length, policy.workspace.maxResourceRequests)
  await f.owner.close(); await Promise.all(responses.map(response => response.completed.promise))
  assert.equal(events.length, policy.workspace.maxResourceRequests)
  assert.equal(f.cancelled.length, policy.workspace.maxResourceRequests)
  const next = await fixture()
  const late = next.owner.intercept(request(origin + '/asset'))
  await next.owner.close(); await late.completed.promise
  assert.deepEqual(next.calls.map(call => call.value?.operation), ['close'])
})

test('workspace waits have reserved capacity and cancellation cannot consume the native metadata reservation', async () => {
  const sent = [], stops = [], timers = []
  const rpc = new DeviceProductRpc({ request: async (id, raw) => { sent.push({ id, value: JSON.parse(raw) }) }, stop: async id => { stops.push(id) }, follow: async () => {} },
    { after: (_ms, callback) => { timers.push(callback); return () => {} } }, 100, 1, 'capacity', 1)
  const abort = new AbortController()
  const stream = rpc.call({ method: 'workspace', argument: { operation: 'stream-next', id: 'fixture' } }, abort.signal)
  const cancelled = assert.rejects(stream, { code: 'cancelled' })
  await assert.rejects(rpc.call({ method: 'workspace', argument: { operation: 'bootstrap' } }), { code: 'queue-full' })
  const metadata = rpc.call({ method: 'metadata', argument: null })
  assert.equal(timers.length, 1)
  rpc.receive(JSON.stringify({ kind: 'result', id: sent[1].id, value: { available: true } }))
  assert.deepEqual(await metadata, { available: true })
  abort.abort(); await cancelled; assert.deepEqual(stops, [sent[0].id])
  rpc.close()
})

test('native warm shell reads reuse verified bytes only after each fresh workspace preparation', async () => {
  const f = await fixture(), bytes = Buffer.from([0, 255, 32]), path = '/assets/cached.bin'
  let preparations = 0, revision = 'b'.repeat(64)
  f.product.workspacePrepare = async () => { preparations++; return JSON.stringify({ revision, resources: [{ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mediaType: 'application/octet-stream' }] }) }
  try {
    await f.owner.open('same-session')
    const cold = f.owner.intercept(request(origin + path)); await cold.completed.promise
    assert.equal(f.calls.filter(call => call.url).length, 1)
    const warm = f.owner.intercept(request(origin + path)); assert.equal(warm.ready, true); assert.equal(f.calls.filter(call => call.url).length, 1)
    assert.deepEqual([...new Uint8Array(warm.body)], [...bytes])
    await f.owner.close(); await f.owner.open('same-session')
    assert.equal(preparations, 2)
    assert.equal(f.owner.intercept(request(origin + path)).ready, true)
    assert.equal(f.calls.filter(call => call.url).length, 1)
    revision = 'c'.repeat(64); await f.owner.open('same-session')
    const changed = f.owner.intercept(request(origin + path)); assert.equal(changed.ready, true)
    assert.equal(f.calls.filter(call => call.url).length, 1)
  } finally { await f.owner.close() }
})

test('native cache excludes HTML and APIs, enforces its budgets and drops another desktop', () => {
  resetProductSdk()
  const bytes = Buffer.from('fixed script'), response = JSON.stringify({ status: 200, headers: [['content-type', 'text/javascript']], body: bytes.toString('base64url') })
  const resource = path => ({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mediaType: path === '/index.html' ? 'text/html' : 'text/javascript' })
  const manifest = JSON.stringify({ revision: 'a'.repeat(64), resources: ['/one.js', '/two.js', '/index.html'].map(resource) })
  const cache = new NativeWorkspaceCache({ maxEntries: 1, maxBytes: 1024 })
  cache.select(origin, manifest); cache.put(origin + '/one.js', response); assert.equal(cache.get(origin + '/one.js'), response)
  cache.put(origin + '/two.js', response); assert.equal(cache.get(origin + '/one.js'), undefined)
  cache.put(origin + '/index.html', response); cache.put(origin + '/api/list', response)
  assert.equal(cache.get(origin + '/index.html'), undefined); assert.equal(cache.get(origin + '/api/list'), undefined)
  assert.equal(cache.get(origin + '/two.js'), response)
  const corrupt = JSON.stringify({ status: 200, headers: [], body: Buffer.from('wrong script').toString('base64url') })
  assert.throws(() => cache.put(origin + '/two.js', corrupt), /digest changed/)
  cache.select('https://other.desktop.workspace.dsh.invalid', manifest); assert.equal(cache.get(origin + '/two.js'), undefined)
  const bounded = new NativeWorkspaceCache({ maxEntries: 2, maxBytes: 1 }); bounded.select(origin, manifest); bounded.put(origin + '/one.js', response)
  assert.equal(bounded.get(origin + '/one.js'), undefined)
})

test('a replacement connection must prepare a newly approved workspace before reusing cached plugin bytes', async () => {
  const f = await fixture(), bytes = Buffer.from([0, 255, 32]), path = '/assets/plugin.bin'
  const resource = { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mediaType: 'application/octet-stream' }
  const manifest = JSON.stringify({ revision: 'b'.repeat(64), resources: [resource] })
  const unavailable = Object.assign(new Error('desktop approval expired'), { code: 'workspace-grant-required' })
  const preparations = []
  let approved = true
  f.product.workspacePrepare = async (_id, generation) => {
    preparations.push(generation)
    if (!approved) throw unavailable
    return manifest
  }
  try {
    await f.owner.open('native-session', 'dsh-devflow')
    f.owner.attached(); f.owner.bind(origin + '/')
    const oldController = f.owner.controller, oldView = f.owner.viewGeneration()
    const downloaded = f.owner.intercept(request(origin + path))
    await downloaded.completed.promise
    assert.equal(downloaded.status, 200)
    assert.equal(f.calls.filter(call => call.url).length, 1)

    approved = false
    f.replace()
    await f.owner.close()
    assert.equal(oldController.getAttachState(), 0)
    assert.equal(oldController.ports[0].closed, true)
    await assert.rejects(f.owner.open('native-session', 'dsh-devflow'), error => error === unavailable)
    assert.equal(f.owner.allow(origin + '/', true), false)
    assert.equal(f.owner.intercept(request(origin + path)).status, 403)
    assert.equal(f.owner.intercept(request(origin + path), oldView).status, 403)
    assert.equal(f.calls.filter(call => call.url).length, 1)

    approved = true
    await f.owner.open('native-session', 'dsh-devflow')
    f.owner.attached(); f.owner.bind(origin + '/')
    const bootstrap = JSON.parse(f.owner.controller.bootstrap.raw)
    assert.equal(bootstrap.sessionId, 'native-session')
    assert.equal(bootstrap.plugin, 'dsh-devflow')
    const cached = f.owner.intercept(request(origin + path))
    assert.equal(cached.ready, true)
    assert.equal(cached.status, 200)
    assert.deepEqual(new Uint8Array(cached.body), Uint8Array.from(bytes))
    assert.deepEqual(preparations, [1, 2, 2])
    assert.equal(f.calls.filter(call => call.url).length, 1)
  } finally { await f.owner.close() }
})

test('native cache keeps unchanged revisioned plugin bytes across graph changes and removes changed or absent resources', () => {
  resetProductSdk()
  const bytes = Buffer.from('immutable plugin'), path = '/plugins/??fixture&rev=one'
  const row = { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mediaType: 'text/javascript' }
  const manifest = resources => JSON.stringify({ revision: 'a'.repeat(64), resources })
  const raw = JSON.stringify({ status: 200, headers: [['content-type', 'text/javascript']], body: bytes.toString('base64url') })
  const cache = new NativeWorkspaceCache({ maxEntries: 4, maxBytes: 1024 })
  cache.select(origin, manifest([row])); cache.put(origin + path, raw)
  cache.select(origin, manifest([row, { ...row, path: '/other.js' }])); assert.equal(cache.get(origin + path), raw)
  cache.select(origin, manifest([{ ...row, sha256: 'b'.repeat(64) }])); assert.equal(cache.get(origin + path), undefined)
  cache.select(origin, manifest([row])); cache.put(origin + path, raw)
  cache.select(origin, manifest([])); assert.equal(cache.get(origin + path), undefined)
})

test('native plugin navigation transfers a public package name through the same private workspace initialization', async () => {
  const f = await fixture()
  try {
    await f.owner.open('native-session', 'standard-fixture'); f.owner.attached(); f.owner.bind(origin + '/')
    const init = JSON.parse(f.owner.controller.bootstrap.raw)
    assert.equal(init.plugin, 'standard-fixture'); assert.equal(init.sessionId, 'native-session')
    assert.equal(f.calls.filter(call => call.value?.operation !== 'close').length, 0)
  } finally { await f.owner.close() }
})

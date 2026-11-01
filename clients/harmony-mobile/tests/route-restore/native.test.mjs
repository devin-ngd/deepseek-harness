/** Native owner and facade use memory SDK files and fixed P256 identities; no phone or relay access. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { productLayoutParser, productButtonActions, productParseOptions } from '../../scripts/product-layout-audit.mjs'
const api = await import(pathToFileURL(process.env.DSH_ROUTE_RESTORE_MODULE).href), base = JSON.parse(await readFile('product.config.json', 'utf8'))
const ts = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, productParseOptions)
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
const methods = ['refreshConnectionControls', 'receiveView', 'connectable'].map(name => page.members.find(member => member.name?.getText(file) === name).getText(file)).join('\n')
const javascript = ts.transpileModule('export class Page { ' + methods + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
const canConnect = Function('return ' + productButtonActions(ts, source).find(row => row.id === 'product-connect').enabled)
const bindingFile = '/app/mobile-device-binding-v1.json', historyFile = '/app/mobile-device-routes-v1.json'
async function fixture(t) {
  api.resetProductSdk()
  const p = api.nodeE2EPrimitives, value = { schema: 'harmony-device-binding/1', bindingId: 'fixture-binding', desktopId: 'fixture-desktop', profileId: 'desktop', deviceId: 'fixture-phone', identityAlias: 'fixture-original-phone', desktopPublicSpki: api.desktopKey.publicSpki, phonePublicSpki: api.phoneKey.publicSpki, desktopCredentialId: await p.credentialId(api.desktopKey.publicSpki), credentialId: await p.credentialId(api.phoneKey.publicSpki), audience: 'relay.example', scope: { kind: 'all-visible-sessions', profileId: 'desktop' }, operations: [...api.deviceGrantOperations], epoch: 1, createdAt: 1000, revoked: false }
  const binding = { ...value, signature: p.encode(await api.desktopKey.sign(api.deviceBindingBytes(value))) }, raw = JSON.stringify(binding)
  api.state.aliases.add(value.identityAlias); api.sdk.files.set(bindingFile, { bytes: Buffer.from(raw) })
  const config = { ...base, deviceBindingMode: true, deviceRoutingTtlMs: 86400000, deviceCatalogRefreshMs: 5000, core: undefined, corePolicyJson: JSON.stringify({ ...base.core, enabled: true }) }
  const owner = new api.NativeDeviceProductOwner(config), views = [], pageState = new Page()
  Object.assign(pageState, { product: owner, networkApproved: false, connectionEnabled: false, connectionHost: '', view: { selected: '', richJson: '', connectionGeneration: 0 }, drafts: new Map(), draft: '', lastRequest: '', dismissedError: '', rich: { setMount() {} }, busy: false })
  const publish = text => { const view = JSON.parse(text); pageState.receiveView(view); views.push({ view, routeReadyAtPublish: owner.connectionEnabled() }) }
  t.after(async () => { await owner.close(); assert.equal(api.sdk.fds.size, 0); assert.equal(api.network.requests.length, 0); assert.equal(api.state.calls.includes('create'), false); assert.equal(api.sdk.files.get(bindingFile).bytes.toString(), raw) })
  await owner.initialize(api.context(), publish)
  const now = Date.now(), offer = { schema: 'harmony-device-route-offer/1', binding, routeId: 'fixture-current-route', routeEpoch: 1, nonce: Buffer.alloc(32).toString('base64url'), issuedAt: now, expiresAt: now + 600000 }
  const signedOffer = { ...offer, signature: p.encode(await api.desktopKey.sign(api.deviceRouteOfferBytes(offer))) }
  return { owner, views, pageState, sign: () => owner.signRoute(JSON.stringify(signedOffer), true), last: () => views.at(-1) }
}

test('foreground publishes restored route readiness after verifying retained signed history', async t => {
  const f = await fixture(t)
  await f.sign(); assert.equal(f.owner.connectionEnabled(), true)
  const retained = api.sdk.files.get(historyFile).bytes.toString()
  f.pageState.networkApproved = true
  await f.owner.close(); f.views.length = 0
  await f.owner.foreground()
  assert.equal(f.owner.connectionEnabled(), true)
  assert.equal(f.last().view.pairing, 'paired'); assert.equal(f.last().view.connection, 'disconnected')
  assert.equal(f.last().routeReadyAtPublish, true)
  assert.equal(f.pageState.connectionEnabled, true); assert.equal(f.pageState.networkApproved, false)
  assert.equal(f.pageState.connectionHost, 'relay.example'); assert.equal(canConnect.call(f.pageState), true)
  assert.equal(api.sdk.files.get(historyFile).bytes.toString(), retained)
})

test('a retired route remains unavailable after foreground and does not reconnect', async t => {
  const f = await fixture(t); await f.sign(); await f.owner.stopRoute()
  const retained = api.sdk.files.get(historyFile).bytes.toString()
  await f.owner.close(); f.views.length = 0; await f.owner.foreground()
  assert.equal(f.owner.connectionEnabled(), false); assert.equal(f.last().routeReadyAtPublish, false)
  assert.equal(canConnect.call(f.pageState), false)
  assert.equal(f.last().view.pairing, 'paired'); assert.equal(f.last().view.connection, 'disconnected')
  assert.equal(api.sdk.files.get(historyFile).bytes.toString(), retained)
})

test('invalid retained history never publishes a paired ready route', async t => {
  const f = await fixture(t); await f.sign(); await f.owner.close()
  api.sdk.files.set(historyFile, { bytes: Buffer.from('{invalid-history') }); f.views.length = 0
  await assert.rejects(f.owner.foreground())
  assert.equal(f.owner.connectionEnabled(), false); assert.equal(f.last().view.error, 'device-route-history-unavailable')
  assert.equal(f.views.some(v => v.routeReadyAtPublish), false)
  assert.equal(api.sdk.files.get(historyFile).bytes.toString(), '{invalid-history')
})

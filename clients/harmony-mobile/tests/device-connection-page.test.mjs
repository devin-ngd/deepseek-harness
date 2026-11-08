/** Execute the actual plain ETS page methods; ArkUI rendering and native identity remain separate SDK/device checks. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productLayoutParser, productButtonActions, productParseOptions } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, productParseOptions)
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
const names = ['refreshConnectionControls', 'receiveView', 'savePairing', 'aboutToDisappear', 'connectable', 'connectShownHost']
const methods = names.map(name => { const node = page.members.find(member => member.name?.getText(file) === name); assert.ok(node); return node.getText(file) }).join('\n')
const javascript = ts.transpileModule('export class Page { ' + methods + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
const actions = productButtonActions(ts, source), controls = ['product-connect', 'product-home-connect'].map(id => { const row = actions.find(item => item.id === id); assert.ok(row, id); return row })
const enabled = (control, value) => Function('return ' + control.enabled).call(value), click = (control, value) => Function('return ' + control.onClick).call(value)()
function fixture() {
  const calls = [], owner = { enabled: true, host: 'relay.example', connectionEnabled() { return this.enabled }, connectionHost() { return this.host }, async pairWithConnection(_raw, _compared, approved) { assert.equal(approved, true) }, async connect(approved) { calls.push(approved) }, async close() {} }
  const value = new Page(); Object.assign(value, { product: owner, networkApproved: false, connectionEnabled: false, connectionHost: '', view: { selected: '', richJson: '', connectionGeneration: 0 }, drafts: new Map(), draft: '', draftSessionId: '', lastRequest: '', dismissedError: '', rich: { setMount() {}, async close() {} }, workspaceOpening: false, workspace: { async close() {} }, preview: { audience: owner.host }, publicOffer: 'synthetic-public-receipt', compared: true, busy: false, run: operation => operation() })
  const view = (generation = 1, more = {}) => ({ selected: '', richJson: '', connectionGeneration: generation, pairing: 'paired', connection: 'disconnected', error: '', ...more })
  return { value, owner, calls, view }
}
test('a paired page offers one tap that names the verified host and connects there', async () => {
  for (const control of controls) {
    const f = fixture(); f.value.receiveView(f.view()); assert.equal(f.value.connectionEnabled, true); assert.equal(f.value.connectionHost, 'relay.example')
    assert.equal(f.value.networkApproved, false); assert.equal(enabled(control, f.value), true)
    await click(control, f.value); assert.deepEqual(f.calls, [true], control.id)
  }
  assert.equal(controls.find(row => row.id === 'product-home-connect').resource, 'app.string.product_connect_host')
  assert.match(source, /Button\(this\.connectable\(\) \? \$r\('app\.string\.product_connect_host', this\.connectionHost\) : \$r\('app\.string\.product_connect'\)\)\.id\('product-connect'\)/)
})
test('a host changed or withdrawn after rendering refuses the tap without connecting', async () => {
  const f = fixture(); f.value.receiveView(f.view())
  f.owner.host = 'different.example'; await assert.rejects(click(controls[0], f.value), /host changed/); assert.equal(f.value.connectionHost, 'different.example')
  f.owner.enabled = false; await assert.rejects(click(controls[0], f.value), /host changed/); assert.equal(enabled(controls[0], f.value), false)
  await assert.rejects(f.value.connectShownHost(''), /host changed/); assert.deepEqual(f.calls, [])
})
test('foreground generation or host change clears pairing-form network consent while ordinary view updates retain it', () => {
  const f = fixture(); f.value.receiveView(f.view()); f.value.networkApproved = true; f.value.receiveView(f.view(1, { selected: 'synthetic-session' })); assert.equal(f.value.networkApproved, true)
  f.value.receiveView(f.view(2)); assert.equal(f.value.networkApproved, false)
  f.value.networkApproved = true; f.owner.host = 'different.example'; f.value.refreshConnectionControls(); assert.equal(f.value.networkApproved, false)
})
test('saving a compared receipt preserves only that exact host decision and never connects', async () => {
  const f = fixture(); f.value.networkApproved = true; await f.value.savePairing(); assert.equal(f.value.networkApproved, true); assert.equal(f.calls.length, 0)
  f.owner.host = 'different.example'; f.value.networkApproved = true; await f.value.savePairing(); assert.equal(f.value.networkApproved, false); assert.equal(f.calls.length, 0)
})
test('manual retry permits ordinary connection failure but never bypasses cleanup, pairing refusal or a busy page', () => {
  const f = fixture(); f.value.receiveView(f.view())
  for (const [state, error, expected] of [['blocked', 'connection-unavailable', true], ['blocked', 'connection-cleanup-failed', false], ['blocked', 'selection-cleanup-failed', false], ['connecting', '', false], ['recovering', '', false], ['connected', '', false]]) { f.value.view = f.view(1, { connection: state, error }); for (const control of controls) assert.equal(enabled(control, f.value), expected, state + error) }
  f.value.view = f.view(1, { pairing: 'revoked' }); assert.equal(enabled(controls[0], f.value), false)
  f.value.view = f.view(1); f.value.busy = true; assert.equal(enabled(controls[0], f.value), false)
  f.value.aboutToDisappear(); assert.equal(f.value.networkApproved, false); assert.equal(f.value.connectionEnabled, false); assert.equal(f.value.connectionHost, '')
})

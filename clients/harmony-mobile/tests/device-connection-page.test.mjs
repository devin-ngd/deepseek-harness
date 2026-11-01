/** Execute the actual plain ETS page methods; ArkUI rendering and native identity remain separate SDK/device checks. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productLayoutParser, productButtonActions } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, { ets: { components: ['Scroll', 'Column', 'Row', 'Flex', 'Text', 'TextInput', 'TextArea', 'Checkbox', 'Button', 'ForEach', 'ProductRichSurface', 'TaskState'] } })
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
const names = ['refreshConnectionControls', 'receiveView', 'savePairing', 'aboutToDisappear']
const methods = names.map(name => { const node = page.members.find(member => member.name?.getText(file) === name); assert.ok(node); return node.getText(file) }).join('\n')
const javascript = ts.transpileModule('export class Page { ' + methods + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
const actions = productButtonActions(ts, source), connect = actions.find(row => row.resource === 'app.string.product_connect')
const enabled = Function('return ' + connect.enabled), clickFactory = Function('return ' + connect.onClick)
function fixture() {
  const calls = [], owner = { enabled: true, host: 'relay.example', connectionEnabled() { return this.enabled }, connectionHost() { return this.host }, async pairWithConnection(_raw, _compared, approved) { assert.equal(approved, true) }, async connect(approved) { calls.push(approved) }, async close() {} }
  const value = new Page(); Object.assign(value, { product: owner, networkApproved: false, connectionEnabled: false, connectionHost: '', view: { selected: '', richJson: '', connectionGeneration: 0 }, drafts: new Map(), draft: '', lastRequest: '', rich: { setMount() {}, async close() {} }, preview: { audience: owner.host }, publicOffer: 'synthetic-public-receipt', compared: true, busy: false, run: operation => operation() })
  const view = (generation = 1, more = {}) => ({ selected: '', richJson: '', connectionGeneration: generation, pairing: 'paired', connection: 'disconnected', error: '', ...more })
  return { value, owner, calls, view }
}
test('cold paired page exposes the verified host but needs an explicit current host decision', async () => {
  const f = fixture(); f.value.receiveView(f.view()); assert.equal(f.value.connectionEnabled, true); assert.equal(f.value.connectionHost, 'relay.example'); assert.equal(enabled.call(f.value), false); assert.equal(f.calls.length, 0)
  f.value.networkApproved = true; assert.equal(enabled.call(f.value), true); await clickFactory.call(f.value)(); assert.deepEqual(f.calls, [true])
})
test('foreground generation or host change clears consent while ordinary view updates retain it', () => {
  const f = fixture(); f.value.receiveView(f.view()); f.value.networkApproved = true; f.value.receiveView(f.view(1, { selected: 'synthetic-session' })); assert.equal(f.value.networkApproved, true)
  f.value.receiveView(f.view(2)); assert.equal(f.value.networkApproved, false); assert.equal(enabled.call(f.value), false)
  f.value.networkApproved = true; f.owner.host = 'different.example'; f.value.refreshConnectionControls(); assert.equal(f.value.networkApproved, false)
})
test('saving a compared receipt preserves only that exact host decision and never connects', async () => {
  const f = fixture(); f.value.networkApproved = true; await f.value.savePairing(); assert.equal(f.value.networkApproved, true); assert.equal(f.calls.length, 0)
  f.owner.host = 'different.example'; f.value.networkApproved = true; await f.value.savePairing(); assert.equal(f.value.networkApproved, false); assert.equal(f.calls.length, 0)
})
test('manual retry permits ordinary connection failure but never bypasses cleanup or pairing refusal', () => {
  const f = fixture(); f.value.receiveView(f.view()); f.value.networkApproved = true
  for (const [state, error, expected] of [['blocked', 'connection-unavailable', true], ['blocked', 'connection-cleanup-failed', false], ['blocked', 'selection-cleanup-failed', false], ['connecting', '', false]]) { f.value.view = f.view(1, { connection: state, error }); assert.equal(enabled.call(f.value), expected) }
  f.value.view = f.view(1, { pairing: 'revoked' }); assert.equal(enabled.call(f.value), false)
  f.value.aboutToDisappear(); assert.equal(f.value.networkApproved, false); assert.equal(f.value.connectionEnabled, false); assert.equal(f.value.connectionHost, '')
})

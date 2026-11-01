/** Evaluate the actual ETS page guards and methods; this does not substitute for ArkUI/device rendering. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productLayoutParser, productButtonActions } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, { ets: { components: ['Scroll', 'Column', 'Row', 'Flex', 'Text', 'TextInput', 'TextArea', 'Checkbox', 'Button', 'ForEach', 'ProductRichSurface', 'TaskState'] } })
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
const names = ['rows', 'selectedTitle', 'openSession', 'receiveView', 'refreshConnectionControls']
const methods = names.map(name => page.members.find(node => node.name?.getText(file) === name).getText(file)).join('\n')
const javascript = ts.transpileModule('export class Page {' + methods + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
const actions = productButtonActions(ts, source)
test('product page uses real-message labels without the offline demo wording', async () => {
  const strings = new Map(JSON.parse(await readFile('harmony/entry/src/main/resources/base/element/string.json', 'utf8')).string.map(row => [row.name, row.value]))
  for (const match of source.matchAll(/app\.string\.([a-zA-Z_0-9]+)/g)) {
    assert.equal(typeof strings.get(match[1]), 'string', match[1])
    assert.doesNotMatch(strings.get(match[1]), /演示|mock-desktop/, match[1])
  }
})
function fixture() {
  const value = new Page()
  Object.assign(value, { page: page.members.find(node => node.name?.getText(file) === 'page').initializer.text, showSetup: false, showDiagnostics: false, busy: false, failed: false, project: '', networkApproved: false, connectionEnabled: true, connectionHost: 'relay.invalid', scopeEntry: false, routeSummary: '', routeReply: '', logCheckState: '', revokePending: false, drafts: new Map(), draft: '', lastRequest: '', rich: { setMount() {} },
    view: { pairing: 'paired', connection: 'disconnected', selected: '', error: '', sessions: [], projects: [], messages: [], liveText: '', richJson: '', readOnly: false, connectionGeneration: 1 },
    product: { deviceBindingMode: () => true, connectionEnabled: () => true, connectionHost: () => 'relay.invalid', select: async () => {} },
  })
  return value
}
function visibleIds(value) {
  const ids = []
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'id' && ts.isStringLiteral(node.arguments[0])) {
      let visible = true
      const guards = []
      for (let parent = node.parent; parent; parent = parent.parent) if (ts.isIfStatement(parent)) guards.unshift(parent.expression)
      for (const guard of guards) visible &&= Boolean(Function('return (' + guard.getText(file) + ')').call(value))
      if (visible) ids.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(page.members.find(node => node.name?.getText(file) === 'build'))
  return ids
}
test('native launch opens sessions with a connect action and no technical forms', () => {
  const value = fixture(), ids = visibleIds(value)
  assert.equal(value.page, 'sessions'); assert.ok(ids.includes('product-home-connect'))
  for (const id of ['product-route-offer', 'product-log-selfcheck', 'product-startup-storage', 'product-composer']) assert.equal(ids.includes(id), false, id)
})
test('device screen keeps connect and stop available while setup and diagnostics require explicit expansion', () => {
  const value = fixture(); value.page = 'device'
  assert.ok(visibleIds(value).includes('product-connect')); assert.ok(visibleIds(value).includes('product-route-stop'))
  assert.equal(visibleIds(value).includes('product-route-offer'), false); assert.equal(visibleIds(value).includes('product-log-selfcheck'), false)
  value.showSetup = true; assert.ok(visibleIds(value).includes('product-route-offer'))
  value.showDiagnostics = true; assert.ok(visibleIds(value).includes('product-log-selfcheck'))
})
test('opening a real session enters conversation only after successful selection', async () => {
  const value = fixture(); value.product.select = async () => { throw Error('offline') }
  await assert.rejects(value.openSession('a'), /offline/); assert.equal(value.page, 'sessions')
  value.product.select = async id => { value.view.selected = id }; value.view.sessions = [{ sessionId: 'a', title: '真实会话' }]
  await value.openSession('a'); assert.equal(value.page, 'conversation'); assert.equal(value.selectedTitle(), '真实会话')
  assert.ok(visibleIds(value).includes('product-composer')); assert.equal(visibleIds(value).includes('product-route-offer'), false)
})
test('returning to the list and switching sessions preserves each unsent draft', () => {
  const value = fixture(); value.page = 'conversation'; value.view.selected = 'a'; value.draft = 'A draft'
  const back = actions.find(row => row.resource === 'app.string.mvp_back')
  Function('return ' + back.onClick).call(value)(); assert.equal(value.page, 'sessions'); assert.equal(value.draft, 'A draft')
  value.receiveView({ ...value.view, selected: 'b' }); value.draft = 'B draft'
  value.receiveView({ ...value.view, selected: 'a' }); assert.equal(value.draft, 'A draft'); assert.equal(value.drafts.get('b'), 'B draft')
})
test('offline or read-only conversation cannot submit or stop a task', () => {
  const value = fixture(); value.view.selected = 'a'; value.draft = 'message'
  for (const resource of ['app.string.product_send', 'app.string.product_stop']) {
    const enabled = Function('return ' + actions.find(row => row.resource === resource).enabled)
    assert.equal(enabled.call(value), false)
    value.view.connection = 'connected'; value.view.readOnly = true; assert.equal(enabled.call(value), false)
    value.view.readOnly = false; assert.equal(enabled.call(value), true); value.view.connection = 'disconnected'
  }
})

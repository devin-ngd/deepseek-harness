/** Actual native diagnostic and page methods, without a device, key, store or socket. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { productLayoutParser, productButtonActions, productParseOptions } from '../scripts/product-layout-audit.mjs'

const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), ts = require('typescript')
const native = await readFile('harmony/entry/src/main/ets/native/NativeDiagnostics.ets', 'utf8')
function diagnostics(console) {
  const exports = {}
  runInNewContext(ts.transpileModule(native, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, console })
  return new exports.NativeDiagnostics()
}
test('self-check emits one fixed INFO marker with no inputs or product references', () => {
  const events = [], d = diagnostics({ info: value => events.push(value), warn: value => events.push(value) })
  assert.equal(d.localSelfCheck(), true); assert.deepEqual(events, ['DSH_LOG_PROBE=local-only']); assert.equal(d.failures, 0)
  assert.equal(d.localSelfCheck(), true); assert.deepEqual(events, ['DSH_LOG_PROBE=local-only', 'DSH_LOG_PROBE=local-only'])
})
test('sink failure stays visible without reflecting the private exception', () => {
  const events = [], secret = 'SYNTHETIC_SECRET_DO_NOT_ECHO', d = diagnostics({ info() { throw Error(secret) }, warn: value => events.push(value) })
  assert.equal(d.localSelfCheck(), false); assert.equal(d.failures, 1); assert.deepEqual(events, ['DSH native diagnostic failed: native-diagnostic-log-failed']); assert.equal(JSON.stringify(events).includes(secret), false)
})
test('an unavailable fallback cannot turn a failed INFO call into success', () => {
  const d = diagnostics({ info() { throw Error('synthetic') }, warn() { throw Error('synthetic') } })
  assert.equal(d.localSelfCheck(), false); assert.equal(d.failures, 1)
})
const ets = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ets.createSourceFile('Index.ets', source, ets.ScriptTarget.Latest, true, ets.ScriptKind.ETS, productParseOptions)
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ets.isStructDeclaration(node) && node.name.text === 'Index'), method = page.members.find(node => node.name?.getText(file) === 'logSelfCheck')
assert.ok(method)
const exports = {}
runInNewContext(ts.transpileModule('export class Page { ' + method.getText(file) + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports })
test('page self-check changes only its local status and never accesses identity, pairing, network or drafts', () => {
  for (const success of [true, false]) {
    const page = new exports.Page(), denied = new Proxy({}, { get() { assert.fail('Product state must not be accessed') } }), draft = 'synthetic unsent draft'
    let calls = 0
    Object.assign(page, { product: denied, rich: denied, view: denied, networkApproved: false, connectionEnabled: false, publicOffer: 'synthetic', draft, logCheckState: '', logDiagnostics: { localSelfCheck() { calls++; return success } } })
    page.logSelfCheck(); assert.equal(calls, 1); assert.equal(page.logCheckState, success ? 'requested' : 'failed'); assert.equal(page.draft, draft); assert.equal(page.networkApproved, false); assert.equal(page.connectionEnabled, false); assert.equal(page.publicOffer, 'synthetic')
  }
})
test('resource-owned self-check button only invokes the local method and respects the busy guard', () => {
  const button = productButtonActions(ets, source).find(row => row.resource === 'app.string.product_log_selfcheck')
  assert.ok(button)
  const enabled = Function('return ' + button.enabled)
  assert.equal(enabled.call({ busy: false }), true); assert.equal(enabled.call({ busy: true }), false)
  let calls = 0
  Function('return ' + button.onClick).call({ logSelfCheck() { calls++ } })()
  assert.equal(calls, 1)
})

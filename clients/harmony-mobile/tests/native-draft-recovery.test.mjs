/** Exercise the native page's actual view receiver without ArkUI rendering or network access. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../package.json', import.meta.url)), ts = require('typescript')
const source = await readFile(new URL('../harmony/entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8')
const start = source.indexOf('private receiveView('), end = source.indexOf('private async savePairing(', start)
assert.ok(start > 0 && end > start)
const compiled = ts.transpileModule('export class Page { ' + source.slice(start, end) + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
function fixture() {
  const value = { view: { selected: '', connectionGeneration: 1 }, draft: '', draftSessionId: '', drafts: new Map(), lastRequest: '', dismissedError: '', newSheet: false, refreshConnectionControls() {}, rich: { setMount() {} } }
  return { value, publish: (selected, connection = 'connected') => Page.prototype.receiveView.call(value, { selected, connection, connectionGeneration: 1, error: '', richJson: '' }) }
}

test('typing across disconnect and reconnect preserves the complete draft and the pending request identity', () => {
  const f = fixture(); f.publish('session-a'); f.value.draft = 'Do not use tools. Reply exactly '; f.value.lastRequest = 'accepted-once'
  f.publish('', 'disconnected'); f.value.draft += 'COMPLETE_TOKEN.'; f.publish('session-a')
  assert.equal(f.value.draft, 'Do not use tools. Reply exactly COMPLETE_TOKEN.')
  assert.equal(f.value.lastRequest, 'accepted-once')
  assert.equal(f.value.draftSessionId, 'session-a')
})

test('switching Sessions retains separate drafts while temporary loss of selection retains the current draft', () => {
  const f = fixture(); f.publish('session-a'); f.value.draft = 'draft a'; f.publish('session-b'); assert.equal(f.value.draft, '')
  f.value.draft = 'draft b'; f.publish('', 'disconnected'); assert.equal(f.value.draft, 'draft b')
  f.publish('session-b'); assert.equal(f.value.draft, 'draft b'); f.publish('session-a'); assert.equal(f.value.draft, 'draft a')
  assert.equal(f.value.drafts.get('session-b'), 'draft b')
})

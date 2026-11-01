/** Native device chat presentation excludes model-context messages while retaining canonical semantic history. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../package.json', import.meta.url)), ts = require('typescript')
const source = await readFile(new URL('../src/native-device-product.ts', import.meta.url), 'utf8')
const file = ts.createSourceFile('native-device-product.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const owner = file.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'NativeDeviceProductFacade')
const method = owner.members.find(node => node.name?.getText(file) === 'sessionView').getText(file)
const compiled = ts.transpileModule('export class Presentation { ' + method + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Presentation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

test('native chat displays user and assistant text without presenting model context as an assistant reply', () => {
  const messages = [
    { id: 'human', role: 'user', parts: [{ kind: 'text', text: 'Hello' }] },
    { id: 'context', role: 'context', parts: [{ kind: 'text', text: 'context '.repeat(5000) }] },
    { id: 'assistant', role: 'assistant', parts: [{ kind: 'text', text: 'Reply' }] },
  ]
  const view = { transcript: { task: 'completed', readOnly: false, messages, liveText: '' }, rich: null, error: '' }
  const native = JSON.parse(Presentation.prototype.sessionView(view))
  assert.deepEqual(native.messages.map(message => message.id), ['human', 'assistant'])
  assert.deepEqual(native.messages.map(message => message.text), ['Hello', 'Reply'])
  assert.equal(messages.length, 3)
  assert.equal(native.readOnly, false)
})

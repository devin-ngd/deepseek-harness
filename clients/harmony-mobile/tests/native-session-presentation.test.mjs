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
const rows = await readFile(new URL('../src/native-chat-presentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(rows + '\nexport class Presentation { ' + method + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Presentation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
Presentation.prototype.policy = { pagedHistory: true }

test('native chat displays user and assistant text without presenting model context as an assistant reply', () => {
  const messages = [
    { id: 'human', role: 'user', parts: [{ kind: 'text', text: 'Hello' }], rich: [] },
    { id: 'context', role: 'context', parts: [{ kind: 'text', text: 'context '.repeat(5000) }], rich: [] },
    { id: 'assistant', role: 'assistant', parts: [{ kind: 'text', text: 'Reply' }], rich: [] },
  ]
  const view = { transcript: { task: 'completed', readOnly: false, messages, liveText: '' }, rich: null, error: '' }
  const native = JSON.parse(Presentation.prototype.sessionView(view))
  assert.deepEqual(native.messages.map(message => message.id), ['human', 'assistant'])
  assert.deepEqual(native.messages.map(message => message.text), ['Hello', 'Reply'])
  assert.equal(messages.length, 3)
  assert.equal(native.readOnly, false)
})

test('native chat keeps task process behind a disclosure and shows the rich or plain final result', () => {
  const messages = [
    { id: 'started', role: 'assistant', turn: 7, parts: [{ kind: 'text', text: 'Collecting data' }, { kind: 'tool-call' }], rich: [] },
    { id: 'report', role: 'assistant', turn: 7, parts: [{ kind: 'reasoning', text: 'Checking the entries' }], rich: [{ fallback: 'Briefing fallback' }] },
    { id: 'prompt', role: 'user', parts: [{ kind: 'text', text: 'Next task' }], rich: [] },
    { id: 'plain', role: 'assistant', turn: 8, parts: [{ kind: 'reasoning', text: 'Private process' }, { kind: 'text', text: 'Final plain result' }], rich: [] },
  ]
  const view = { transcript: { task: 'completed', readOnly: false, messages, liveText: '' }, rich: null, error: '' }
  const rows = JSON.parse(Presentation.prototype.sessionView(view)).messages
  assert.deepEqual(rows, [
    { id: 'report', role: 'assistant', text: 'Briefing fallback', processKey: 'turn-7', processText: 'Collecting data\n\nChecking the entries' },
    { id: 'prompt', role: 'user', text: 'Next task' },
    { id: 'plain', role: 'assistant', text: 'Final plain result', processKey: 'turn-8', processText: 'Private process' },
  ])
  const mounted = JSON.parse(Presentation.prototype.sessionView({ ...view, rich: { snapshot: { scope: { messageId: 'report' } } } }))
  assert.equal(mounted.messages[0].text, '')
  assert.equal(mounted.messages[0].processText, rows[0].processText)
  assert.equal(messages[0].parts[0].text, 'Collecting data')
})

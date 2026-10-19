/** Closed acceptance controls cannot select identity creation, a foreign Session or arbitrary task text. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectedControl } from '../scripts/phase75-phone-exercise.mjs'
const strings = new Map([['cancel', '取消演示']]), row = { id: 'product-session-harmony-mobile-field-replay-session', type: 'Button', visible: 'true', enabled: 'true' }
test('selects only the exact fixed Session', () => assert.equal(selectedControl([row], 'select', strings), row))
test('refuses a foreign Session', () => assert.throws(() => selectedControl([{ ...row, id: 'product-session-foreign' }], 'select', strings)))
test('refuses identity and arbitrary click commands', () => { for (const command of ['create', 'tap', 'product-identity-confirm', 'upload']) assert.throws(() => selectedControl([row], command, strings)) })
test('refuses duplicate, disabled, hidden and wrong-type controls', () => { for (const rows of [[row, row], [{ ...row, enabled: 'false' }], [{ ...row, visible: 'false' }], [{ ...row, type: 'Text' }]]) assert.throws(() => selectedControl(rows, 'select', strings)) })
test('requires an empty native composer', () => { const input = { ...row, type: 'TextInput', id: 'product-composer', text: '' }; assert.equal(selectedControl([input], 'input-task', strings), input); assert.throws(() => selectedControl([{ ...input, text: 'user private draft' }], 'input-task', strings)) })

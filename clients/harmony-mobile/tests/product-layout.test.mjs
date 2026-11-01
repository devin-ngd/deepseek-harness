/** Source containment regressions use the official ETS parser; device pixel layout and IME execution remain separate. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auditProductLayout, productButtonActions, productLayoutParser } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), page = (await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')).replaceAll('\r\n', '\n')

test('native history uses remaining height above a conversation footer in the resized page', () => {
  assert.deepEqual(auditProductLayout(ts, page), { nativeScrollOwners: 1, pageHeight: '100%', viewportHeight: 'remaining', contentHeight: 'intrinsic', keyboardAvoidance: 'RESIZE', wrappedButtonGroups: 6, composerOutsideScroll: true, taskActionsOutsideScroll: true })
})

test('the recorded clipped predecessor is rejected before a candidate can be built', async () => {
  const previous = await readFile('tests/fixtures/product-clipped-page.ets', 'utf8')
  assert.throws(() => auditProductLayout(ts, previous), /page must contain history and conditional conversation controls/)
})

test('scroll content cannot regain a viewport-sized height or a nested fixed catalogue viewport', () => {
  assert.throws(() => auditProductLayout(ts, page.replace("}.padding(16).width('100%')", "}.padding(16).width('100%').height('100%')")), /intrinsic height/)
  assert.throws(() => auditProductLayout(ts, page.replace('Column({ space: 6 }) {\n        Button', 'Scroll() {\n        Button')), /independent scroll heights/)
})

test('long history cannot own the composer or consume space reserved for its controls', () => {
  assert.throws(() => auditProductLayout(ts, page.replace(".width('100%').layoutWeight(1)", ".width('100%').height('100%')")), /remaining viewport height/)
  assert.throws(() => auditProductLayout(ts, page.replace("Column() {\n    Scroll()", "Scroll() {\n    Scroll()")), /reserve space for fixed conversation controls/)
  assert.throws(() => auditProductLayout(ts, page.replace("}.id('product-conversation-controls').padding(16).width('100%')", "}.id('product-conversation-controls').padding(16).width('100%').layoutWeight(1)")), /controls must retain intrinsic height/)
  const input = page.match(/^      TextInput\(\{ text: this\.draft,.*$/m)[0]
  assert.throws(() => auditProductLayout(ts, page.replace(input, '').replace('      ProductRichSurface', input + '\n      ProductRichSurface')), /controls must stay outside history scrolling/)
})

test('keyboard occlusion and nonwrapping button rows fail the native layout gate', () => {
  assert.throws(() => auditProductLayout(ts, page.replace('KeyboardAvoidMode.RESIZE', 'KeyboardAvoidMode.NONE')), /keyboard must resize/)
  assert.throws(() => auditProductLayout(ts, page.replace('Flex({ wrap: FlexWrap.Wrap, space:', 'Row({ wrap: FlexWrap.Wrap, space:')), /Button groups must wrap/)
})

test('native MVP controls match their reviewed actions and authorization guards', async () => {
  const expected = JSON.parse(await readFile('tests/fixtures/product-button-actions.expected.json', 'utf8'))
  assert.deepEqual(productButtonActions(ts, page), expected)
})

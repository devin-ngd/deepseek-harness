/** Source containment regressions use the official ETS parser; device pixel layout and IME execution remain separate. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auditProductLayout, productButtonActions, productLayoutParser } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), page = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')

test('native page puts forms, history, composer and actions under one resized vertical scroll', () => {
  assert.deepEqual(auditProductLayout(ts, page), { nativeScrollOwners: 1, viewportHeight: '100%', contentHeight: 'intrinsic', keyboardAvoidance: 'RESIZE', wrappedButtonGroups: 5, composerInRootScroll: true, taskActionsInRootScroll: true })
})

test('the recorded clipped predecessor is rejected before a candidate can be built', async () => {
  const previous = await readFile('tests/fixtures/product-clipped-page.ets', 'utf8')
  assert.throws(() => auditProductLayout(ts, previous), /page root must scroll/)
})

test('scroll content cannot regain a viewport-sized height or a nested fixed catalogue viewport', () => {
  assert.throws(() => auditProductLayout(ts, page.replace("}.padding(16).width('100%')", "}.padding(16).width('100%').height('100%')")), /intrinsic height/)
  assert.throws(() => auditProductLayout(ts, page.replace('Column({ space: 6 }) {\n        Button', 'Scroll() {\n        Button')), /independent scroll heights/)
})

test('keyboard occlusion and nonwrapping button rows fail the native layout gate', () => {
  assert.throws(() => auditProductLayout(ts, page.replace('KeyboardAvoidMode.RESIZE', 'KeyboardAvoidMode.NONE')), /keyboard must resize/)
  assert.throws(() => auditProductLayout(ts, page.replace('Flex({ wrap: FlexWrap.Wrap, space:', 'Row({ wrap: FlexWrap.Wrap, space:')), /Button groups must wrap/)
})

test('scroll repair retains every resource-owned button guard and action from the installed candidate', async () => {
  const expected = JSON.parse(await readFile('tests/fixtures/product-button-actions.expected.json', 'utf8'))
  assert.deepEqual(productButtonActions(ts, page), expected)
})

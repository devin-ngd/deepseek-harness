/** Source containment regressions use the official ETS parser; device pixel layout and IME execution remain separate. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auditProductLayout, productButtonActions, productLayoutParser } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), page = (await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')).replaceAll('\r\n', '\n')
const replace = (from, to) => { assert.ok(page.includes(from), from); return page.replace(from, to) }

test('native history uses remaining height between a fixed header and a conversation footer in the resized page', () => {
  assert.deepEqual(auditProductLayout(ts, page), { nativeScrollOwners: 1, pageHeight: '100%', headerHeight: 'intrinsic', viewportHeight: 'remaining', contentHeight: 'intrinsic', keyboardAvoidance: 'RESIZE', wrappedButtonGroups: 7, iconButtons: 6, errorBannerInHeader: true, composerOutsideScroll: true, sendOutsideScroll: true, taskActionsOutsideScroll: true })
})

test('the recorded clipped predecessor is rejected before a candidate can be built', async () => {
  const previous = await readFile('tests/fixtures/product-clipped-page.ets', 'utf8')
  assert.throws(() => auditProductLayout(ts, previous), /fixed header, history and conditional conversation controls/)
})

test('scroll content cannot regain a viewport-sized height or a nested fixed catalogue viewport', () => {
  assert.throws(() => auditProductLayout(ts, replace("}.padding({ left: 16, right: 16, top: 12, bottom: 20 }).width('100%')", "}.padding({ left: 16, right: 16, top: 12, bottom: 20 }).width('100%').height('100%')")), /intrinsic height/)
  assert.throws(() => auditProductLayout(ts, replace("Column({ space: 10 }) {\n            Button($r('app.string.product_log_selfcheck'))", "Scroll() {\n            Button($r('app.string.product_log_selfcheck'))")), /independent scroll heights/)
})

test('the header stays fixed and long history cannot own or displace the conversation controls', () => {
  assert.throws(() => auditProductLayout(ts, replace("}.id('product-header').width('100%')", "}.id('product-header').width('100%').height(56)")), /header must retain intrinsic height/)
  assert.throws(() => auditProductLayout(ts, replace("    }.width('100%').layoutWeight(1)\n    if (this.page === 'conversation') {", "    }.width('100%').height('100%')\n    if (this.page === 'conversation') {")), /remaining viewport height/)
  assert.throws(() => auditProductLayout(ts, replace("}.id('product-page-scroll').scrollable(ScrollDirection.Vertical).align(Alignment.Top).width('100%').height('100%')", "}.id('product-page-scroll').scrollable(ScrollDirection.Vertical).align(Alignment.Top).width('100%').layoutWeight(1)")), /fill exactly its remaining viewport/)
  assert.throws(() => auditProductLayout(ts, replace('.scrollable(ScrollDirection.Vertical).align(Alignment.Top)', '.scrollable(ScrollDirection.Vertical)')), /start below the header/)
  assert.throws(() => auditProductLayout(ts, replace('build() {\n    Column() {', 'build() {\n    Scroll() {')), /reserve space for fixed conversation controls/)
  assert.throws(() => auditProductLayout(ts, replace("}.id('product-conversation-controls').padding(", "}.id('product-conversation-controls').layoutWeight(1).padding(")), /controls must retain intrinsic height/)
  const input = page.match(/^ *TextArea\(\{ text: this\.draft,.*$/m)[0]
  assert.throws(() => auditProductLayout(ts, page.replace(input, '').replace('        ProductRichSurface', input.trim() + '\n        ProductRichSurface')), /controls must stay outside history scrolling/)
})

test('the error banner stays in the fixed header so a reader at the latest message still sees it', () => {
  const banner = page.slice(page.indexOf('      if (this.errorVisible()) {'), page.indexOf("    }.id('product-header')"))
  assert.ok(banner.includes("id('product-error')"))
  const top = "    Column({ space: 12 }) {\n      if (this.page === 'sessions') {"
  assert.throws(() => auditProductLayout(ts, page.replace(banner, '').replace(top, "    Column({ space: 12 }) {\n" + banner + "      if (this.page === 'sessions') {")), /error banner must stay visible outside history scrolling/)
  assert.throws(() => auditProductLayout(ts, page.replace(banner, '')), /error banner, composer/)
})

test('the composer accepts multiple lines and icon-only controls keep a name and touch target', () => {
  assert.throws(() => auditProductLayout(ts, replace("TextArea({ text: this.draft, placeholder: this.composerHint() }).id('product-composer').areaField()", "TextInput({ text: this.draft, placeholder: this.composerHint() }).id('product-composer').inputField()")), /accept multiple lines/)
  assert.throws(() => auditProductLayout(ts, replace(".accessibilityText($r('app.string.product_send'))", '')), /accessible name/)
  assert.throws(() => auditProductLayout(ts, replace(".id('product-send').width(44).height(44)", ".id('product-send')")), /fixed touch target/)
})

test('keyboard occlusion and nonwrapping button rows fail the native layout gate', () => {
  assert.throws(() => auditProductLayout(ts, replace('KeyboardAvoidMode.RESIZE)', 'KeyboardAvoidMode.NONE)')), /keyboard must resize/)
  assert.throws(() => auditProductLayout(ts, replace('Flex({ wrap: FlexWrap.Wrap, space:', 'Row({ wrap: FlexWrap.Wrap, space:')), /Button groups must wrap/)
})

test('native MVP controls match their reviewed actions and authorization guards', async () => {
  const expected = JSON.parse(await readFile('tests/fixtures/product-button-actions.expected.json', 'utf8'))
  assert.deepEqual(productButtonActions(ts, page), expected)
})

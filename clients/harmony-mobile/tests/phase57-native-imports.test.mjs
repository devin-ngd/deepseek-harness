/** Actual compiled import syntax is checked independently from SDK-substitute runtime behavior. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auditNativeCoreImports, verifyNativeJsImports } from '../scripts/native-js-imports.mjs'
test('default native util import is admitted', () => { assert.deepEqual(auditNativeCoreImports('import util from "@ohos:util"; export const probe = 1;', 'ProductCore.js'), { file: 'ProductCore.js', module: '@ohos:util', binding: 'default' }) })
test('native URL parser requires its own default SDK import', () => {
  assert.deepEqual(auditNativeCoreImports('import util from "@ohos:util"; import url from "@ohos:url";', 'ProductCore.js').additionalImports, [{ module: '@ohos:url', binding: 'default' }])
  for (const source of ['import util from "@ohos:util"; import { URL } from "@ohos:url";', 'import util from "@ohos:util"; import a from "@ohos:url"; import b from "@ohos:url";', 'import url from "@ohos:url";']) assert.throws(() => auditNativeCoreImports(source, 'ProductCore.js'), /Compiled native core/)
})
for (const [label, source] of [['unexpanded Kit', 'import {util} from "@ohos:ArkTS";'], ['source Kit', 'import {util} from "@kit.ArkTS";'], ['wrong named export', 'import {util} from "@ohos:util";'], ['missing runtime module', 'export const probe = 1;'], ['unexpected external', 'import util from "node:util";']]) test(label + ' is refused', () => { assert.throws(() => auditNativeCoreImports(source, 'ProductCore.js'), /Compiled native core/) })
test('the previous official compiled candidate is rejected for its actual wrong SDK binding', async () => { await assert.rejects(verifyNativeJsImports('.build/native-enrollment-parser-project', ['ProductCore.js', 'PairedCore.js']), /default @ohos:util/) })
test('the current official compiler output matches the owner-local runtime import snapshot', async () => { const actual = await verifyNativeJsImports('.build/native-util-binding-project', ['ProductCore.js', 'PairedCore.js']), expected = JSON.parse(await readFile(new URL('./fixtures/native-core-sdk-imports.expected.json', import.meta.url), 'utf8')); assert.deepEqual(actual.records.sort((left, right) => left.file.localeCompare(right.file)), expected) })

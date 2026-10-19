/** Native util adapter bytes are compared with protocol UTF-8 expectations, without a device or persistent state. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { TextEncoder as NativeEncoder, TextDecoder as NativeDecoder, state } from '../.build/phase57-native-codecs.mjs'
test('nonempty native adapter output matches UTF-8 for JSON, Chinese and supplementary characters', () => { for (const text of ['{}', 'ASCII', '汉字🙂', '{"text":"表单✓"}']) assert.deepEqual(new NativeEncoder().encode(text), new TextEncoder().encode(text)); assert.equal(state.encodings.length, 4); assert.ok(state.encodings.every(value => value === 'utf-8')) })
test('empty input yields an empty byte array without native undefined escaping', () => { const before = state.encodeCalls; assert.deepEqual(new NativeEncoder().encode(''), new Uint8Array()); assert.deepEqual(new NativeEncoder().encode(), new Uint8Array()); assert.equal(state.encodeCalls, before) })
test('native text codecs round-trip protocol Unicode', () => { const text = '设备消息🙂'; assert.equal(new NativeDecoder().decode(new NativeEncoder().encode(text)), text) })
test('fatal decoding retains rejection of malformed bytes', () => { assert.throws(() => new NativeDecoder('utf-8', { fatal: true }).decode(Uint8Array.of(255)), TypeError) })

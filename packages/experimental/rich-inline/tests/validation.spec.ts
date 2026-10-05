/** Reserved typed data and strict event selectors are checked independently of the browser. */
import { describe, expect, it } from 'vitest'
import { canonicalRichJson, isRichJson, parseActionRequest, parseInvokeRequest, parseSaveDraftRequest, richMarkerIds, typedRichValuesValid } from '../src/shared/validate.ts'

describe('rich shared validation', () => {
  it('accepts arbitrary JSON and rejects depth, nonfinite numbers, and prototype selectors', () => {
    expect(isRichJson({ labels: ['a', 2, true, null], arbitrary: { style: 'free' } })).toBe(true)
    expect(isRichJson({ invalid: Infinity })).toBe(false)
    expect(isRichJson(JSON.parse('{"__proto__":{"target":1}}'))).toBe(false)
    let nested: unknown = null
    for (let index = 0; index < 18; index++) nested = [nested]
    expect(isRichJson(nested)).toBe(false)
  })
  it('validates actual calendar dates and decimal precision', () => {
    expect(typedRichValuesValid({ day: { type: 'date', value: '2024-02-29' }, precise: { type: 'decimal', value: '123456789123456789.1234' } })).toBe(true)
    expect(typedRichValuesValid({ day: { type: 'date', value: '2026-02-29' } })).toBe(false)
    expect(typedRichValuesValid({ day: { type: 'date', value: '2026-13-01' } })).toBe(false)
    expect(typedRichValuesValid({ number: { type: 'number', value: '3' } })).toBe(false)
    expect(typedRichValuesValid({ precise: { type: 'decimal', value: '1e9999' } })).toBe(false)
    expect(typedRichValuesValid({ object: { type: 'object', value: [] } })).toBe(false)
    expect(typedRichValuesValid({ list: { type: 'list', value: {} } })).toBe(false)
  })
  it('validates complex tables by column identities, cell types, and unique row keys', () => {
    const table = { type: 'table', columns: [{ id: 'price', label: 'Price', valueType: 'decimal' }], rows: [{ rowId: 'first', cells: { price: { type: 'decimal', value: '12.50' } } }] }
    expect(typedRichValuesValid({ table })).toBe(true)
    expect(typedRichValuesValid({ table: { ...table, rows: [...table.rows, ...table.rows] } })).toBe(false)
    expect(typedRichValuesValid({ table: { ...table, rows: [{ rowId: 'first', cells: { price: { type: 'text', value: '12' } } }] } })).toBe(false)
    expect(typedRichValuesValid({ table: { ...table, columns: [...table.columns, ...table.columns] } })).toBe(false)
  })
  it('rejects malformed assets and session/block injection in event payloads', () => {
    expect(typedRichValuesValid({ asset: { type: 'asset', ref: { grantId: 'grant-a', assetId: 'asset-a', sha256: 'bad', sizeBytes: 3, purpose: 'agent-input' } } })).toBe(false)
    const draft = { baseRevision: 0, stateSchemaVersion: 1, fields: { input: 'last' }, dirty: ['input'] }
    const invoke = { mountId: 'mount-a', actionId: 'action-a', actionName: 'submit', targetActionId: null, expectedDataRevision: 0, values: {}, fileGrants: [], draft }
    expect(parseInvokeRequest(invoke)).not.toBeNull()
    expect(parseInvokeRequest({ ...invoke, sessionId: 'foreign' })).toBeNull()
    expect(parseInvokeRequest({ ...invoke, actionName: 'shell' })).toBeNull()
    expect(parseInvokeRequest({ ...invoke, actionName: 'cancel', targetActionId: 'action-old' })).not.toBeNull()
    expect(parseInvokeRequest({ ...invoke, actionName: 'cancel', targetActionId: null })).toBeNull()
    expect(parseSaveDraftRequest({ mountId: 'mount-a', draft })).not.toBeNull()
    expect(parseSaveDraftRequest({ mountId: 'mount-a', draft: { ...draft, fields: { day: { type: 'date', value: '2026-' } } } })).not.toBeNull()
    expect(parseInvokeRequest({ ...invoke, values: { day: { type: 'date', value: '2026-' } } })).toBeNull()
    expect(parseSaveDraftRequest({ mountId: 'mount-a', draft, blockId: 'foreign' })).toBeNull()
    expect(parseActionRequest({ mountId: 'mount-a', actionId: 'action-a', confirmed: true })).toBeNull()
  })
  it('recognizes only fenced one-field markers and canonicalizes retries deterministically', () => {
    expect(richMarkerIds('```rich-inline\n{"blockId":"block-a"}\n```')).toEqual(['block-a'])
    expect(richMarkerIds('```rich-inline\n{"blockId":"block-a","sessionId":"other"}\n```')).toEqual([])
    expect(richMarkerIds('```html\n<div>block-a</div>\n```')).toEqual([])
    expect(canonicalRichJson({ b: { y: 2, x: 1 }, a: [1, true] })).toBe(canonicalRichJson({ a: [1, true], b: { x: 1, y: 2 } }))
  })
})

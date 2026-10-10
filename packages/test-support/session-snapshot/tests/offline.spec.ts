/** Preflight rejects invalid input before the runner callback; no SDK is imported. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { prepareOfflineSnapshot, startPreparedOfflineSnapshot } from '../src/offline.ts'
import type { OfflineSnapshotPlan, PreparedOfflineSnapshot } from '../src/offline.ts'
import { startOfflineSnapshotEntry } from '../src/offline-entry.ts'
import type { OfflineSnapshotEntry, OfflineSnapshotMarkers } from '../src/offline-entry.ts'

const fixture = readFileSync(fileURLToPath(new URL('../../llm-replay/tests/fixtures/offline-four.v4.jsonl', import.meta.url)), 'utf8')
function plan(): OfflineSnapshotPlan {
  return { fixtures: [fixture], cwd: 'D:\\Temp\\offline-work', provider: 'rich-inline-replay', model: 'rich-inline-fixed', expectedCalls: 4 }
}

function entry(): OfflineSnapshotEntry {
  return { composition: 'in-memory-only', mode: 'replay', plan: plan(), markers: {
    sdkReplay: true, replayOffline: true, uploadDisabled: true, dispatchBlocked: true,
  } }
}

function deferredEffects() {
  const importFixture = vi.fn()
  const constructSdk = vi.fn()
  const loadRealAdapter = vi.fn()
  const network = vi.fn()
  const upload = vi.fn()
  const start = vi.fn(() => {
    importFixture(); constructSdk(); loadRealAdapter(); network(); upload()
  })
  return { start, all: [start, importFixture, constructSdk, loadRealAdapter, network, upload] }
}

describe('mandatory offline snapshot entry', () => {
  it('refuses all missing offline inputs before any deferred effect', () => {
    const effects = deferredEffects()
    expect(() => startOfflineSnapshotEntry({ composition: 'ordinary-sdk', mode: undefined, plan: undefined, markers: undefined },
      effects.start)).toThrow('explicit replay or refresh')
    for (const effect of effects.all) expect(effect).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'record', 'other'])('refuses mode %s before loading', (mode: string | undefined) => {
    const effects = deferredEffects()
    expect(() => startOfflineSnapshotEntry({ ...entry(), mode }, effects.start)).toThrow('explicit replay or refresh')
    for (const effect of effects.all) expect(effect).not.toHaveBeenCalled()
  })

  it.each(['sdkReplay', 'replayOffline', 'uploadDisabled', 'dispatchBlocked'] as const)(
    'requires marker %s even when the remaining plan is valid', (key: keyof OfflineSnapshotMarkers) => {
      const { [key]: _marker, ...missing } = entry().markers ?? {}
      for (const markers of [{ ...entry().markers, [key]: false },
        missing]) {
        const effects = deferredEffects()
        expect(() => startOfflineSnapshotEntry({ ...entry(), markers }, effects.start)).toThrow('every offline marker')
        for (const effect of effects.all) expect(effect).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    ['missing markers', { markers: undefined }],
    ['missing plan', { plan: undefined }],
    ['missing provider', { plan: { ...plan(), provider: '' } }],
    ['missing model', { plan: { ...plan(), model: '' } }],
    ['missing budget', { plan: { ...plan(), expectedCalls: 0 } }],
    ['fractional budget', { plan: { ...plan(), expectedCalls: 1.5 } }],
  ] satisfies readonly [string, Partial<OfflineSnapshotEntry>][])('refuses %s before effects', (_name: string, overrides: Partial<OfflineSnapshotEntry>) => {
    const effects = deferredEffects()
    expect(() => startOfflineSnapshotEntry({ ...entry(), ...overrides }, effects.start)).toThrow()
    for (const effect of effects.all) expect(effect).not.toHaveBeenCalled()
  })

  it.each(['replay', 'refresh'])('admits an explicitly guarded synthetic replay in %s mode without a module inventory', (mode: string) => {
    const start = vi.fn(() => 'in-memory-only')
    expect(startOfflineSnapshotEntry({ ...entry(), mode }, start)).toBe('in-memory-only')
    expect(start).toHaveBeenCalledTimes(1)
  })
})

describe('offline snapshot preflight', () => {
  it.each(['D:\\Temp\\offline-work', '\\\\server\\share\\offline-work', '/tmp/offline-work'])('materializes %s with valid JSON before constructing a runner', (cwd: string) => {
    const start = vi.fn((prepared: PreparedOfflineSnapshot) => prepared)
    const result = startPreparedOfflineSnapshot<PreparedOfflineSnapshot>({ ...plan(), cwd }, start)
    expect(start).toHaveBeenCalledTimes(1)
    expect(result.expectedCalls).toBe(4)
    const header = JSON.parse(result.fixtures[0]!.split('\n')[0]!) as { cwd: string }
    expect(header.cwd).toBe(cwd)
    for (const line of result.fixtures[0]!.trim().split('\n')) expect(() => { JSON.parse(line) }).not.toThrow()
  })

  it.each([
    ['missing fixture', { fixtures: [] }],
    ['missing provider', { provider: '' }],
    ['wrong provider', { provider: 'deepseek-official' }],
    ['wrong model', { model: 'other' }],
    ['missing call counter', { expectedCalls: 0 }],
    ['extra calls', { expectedCalls: 3 }],
    ['incomplete calls', { expectedCalls: 5 }],
    ['relative cwd', { cwd: 'relative' }],
    ['invalid Windows header', { fixtures: [fixture.replaceAll('{{cwd}}', 'D:\\Temp\\invalid')] }],
    ['bad JSON', { fixtures: ['{"type":'] }],
    ['bad Session schema', { fixtures: [fixture.replace('"version":4', '"version":9999')] }],
    ['bad lifecycle', { fixtures: [fixture.split('\n').filter(line => !line.includes('"type":"step/start"')).join('\n')] }],
  ] satisfies readonly [string, Partial<OfflineSnapshotPlan>][])('stops %s before a runner exists', (_name: string, overrides: Partial<OfflineSnapshotPlan>) => {
    const start = vi.fn(() => { throw new Error('a runner must not be constructed') })
    expect(() => startPreparedOfflineSnapshot({ ...plan(), ...overrides }, start)).toThrow()
    expect(start).not.toHaveBeenCalled()
  })

  it('retains JSON validity for nested tool arguments containing cwd', () => {
    const modified = fixture.replaceAll('Mnemo synthetic rows', '{{cwd}}')
    const result = prepareOfflineSnapshot({ ...plan(), fixtures: [modified] })
    const rows = result.fixtures[0]!.trim().split('\n').map(line => JSON.parse(line) as { type: string; data: { message?: { content: { type: string; arguments: string }[] } } })
    const args = rows.find(row => row.type === 'assistant/message')!.data.message!.content.find(part => part.type === 'tool-call')!.arguments
    const parsed = JSON.parse(args) as { html: string }
    expect(parsed.html).toContain('D:\\Temp\\offline-work')
  })
})

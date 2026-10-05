import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// All native APIs and I/O are doubles; these tests never load or start Electron.
const lifecycle = vi.hoisted(() => ({
  ready: Promise.resolve(),
  resolveReady: (): void => {},
  rejectReady: (_error: Error): void => {},
  writes: [] as { path: string; data: string }[],
  exits: [] as number[],
  stages: [] as string[],
  windowCount: 0,
  readyCalls: 0,
  closed: false,
  failWrite: false,
}))

vi.mock('electron', () => ({
  app: {
    setPath: (_name: string, _path: string): void => { lifecycle.stages.push('setPath') },
    on: (): void => {},
    whenReady: (): Promise<void> => { lifecycle.readyCalls++; return lifecycle.ready },
    exit: (code: number): void => { lifecycle.exits.push(code) },
  },
  protocol: { registerSchemesAsPrivileged: (): void => { lifecycle.stages.push('registerScheme') } },
  BrowserWindow: vi.fn(function () {
    lifecycle.windowCount++
    throw new Error('lifecycle seam reached; no native window is created')
  }),
  ipcMain: {},
}))
vi.mock('../src/rich-guests.ts', () => ({ DesktopRichGuests: vi.fn() }))
vi.mock('../src/browser-guests.ts', () => ({ DesktopBrowserGuests: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  mkdir: async (): Promise<void> => {},
  writeFile: async (path: string, data: string): Promise<void> => {
    if (lifecycle.failWrite) throw new Error('fixture result write failed')
    lifecycle.writes.push({ path, data })
  },
}))
vi.mock('node:http', () => ({
  createServer: () => ({
    listen: (_port: number, _host: string, resolve: () => void): void => { resolve() },
    address: () => ({ port: 42424 }),
    close: (): void => { lifecycle.closed = true },
  }),
}))

const originalArgv = process.argv.slice()

beforeEach(() => {
  vi.resetModules()
  lifecycle.ready = new Promise<void>((resolve, reject) => {
    lifecycle.resolveReady = resolve
    lifecycle.rejectReady = reject
  })
  lifecycle.writes = []
  lifecycle.exits = []
  lifecycle.stages = []
  lifecycle.windowCount = 0
  lifecycle.readyCalls = 0
  lifecycle.closed = false
  lifecycle.failWrite = false
  process.argv = [...originalArgv, `--rich-native-output=${join(tmpdir(), 'rich-lifecycle-only')}`]
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.argv = originalArgv.slice()
  vi.restoreAllMocks()
})

it('finishes ESM entry evaluation while app readiness is still pending', async () => {
  await import('./fixtures/rich-native-runner.ts')
  expect(lifecycle.stages).toEqual(['registerScheme', 'setPath'])
  expect(lifecycle.windowCount).toBe(0)
  expect(lifecycle.exits).toEqual([])
  lifecycle.resolveReady()
  await vi.waitFor(() => { expect(lifecycle.exits).toEqual([1]) })
  expect(lifecycle.windowCount).toBe(1)
  expect(lifecycle.closed).toBe(true)
  expect(lifecycle.writes[0]?.data).toContain('lifecycle seam reached')
})

it('persists readiness failure and closes the receiver without creating a window', async () => {
  await import('./fixtures/rich-native-runner.ts')
  await vi.waitFor(() => { expect(lifecycle.readyCalls).toBe(1) })
  lifecycle.rejectReady(new Error('ready rejected by lifecycle double'))
  await vi.waitFor(() => { expect(lifecycle.exits).toEqual([1]) })
  expect(lifecycle.windowCount).toBe(0)
  expect(lifecycle.closed).toBe(true)
  expect(lifecycle.writes[0]?.data).toContain('ready rejected by lifecycle double')
})

it('terminates with failure when result reporting itself rejects', async () => {
  lifecycle.failWrite = true
  await import('./fixtures/rich-native-runner.ts')
  lifecycle.resolveReady()
  await vi.waitFor(() => { expect(lifecycle.exits).toEqual([1]) })
  expect(console.error).toHaveBeenCalledWith('native fixture could not finish', expect.any(Error))
})

it('rejects a missing output argument before starting asynchronous work', async () => {
  process.argv = originalArgv.slice()
  await expect(import('./fixtures/rich-native-runner.ts')).rejects.toThrow('absolute private output directory')
  expect(lifecycle.readyCalls).toBe(0)
  expect(lifecycle.windowCount).toBe(0)
  expect(lifecycle.writes).toEqual([])
})

it('contains no module-level await, including inside a top-level try block', () => {
  const moduleAwaits = (source: string): number => {
    const file = ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let count = 0
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) return
      if (ts.isAwaitExpression(node)) count++
      ts.forEachChild(node, visit)
    }
    visit(file)
    return count
  }
  expect(moduleAwaits('try { await app.whenReady() } finally {}')).toBe(1)
  const source = readFileSync(new URL('./fixtures/rich-native-runner.ts', import.meta.url), 'utf8')
  expect(moduleAwaits(source)).toBe(0)
})

/** Runs the real controller with RPC and Native transport doubles; no Electron security claim. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RichActionStatus, RichBlockId, RichMountId, RichSnapshot } from '../src/shared/types.ts'
import type { NativeRichBridge } from '../src/client/native.ts'
import { RichBlockController } from '../src/client/controller.ts'
import type { RichRpc } from '../src/client/controller.ts'
import { RICH_CYBER_CSS, RICH_DARK_CSS, richThemeCss } from '../src/shared/theme.ts'
import type { RichAppearance } from '../src/shared/theme.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const sessionId = 'session-one' as SessionId
const messageId = 'message-one' as MessageId
const blockId = 'block-one' as RichBlockId

function snapshot(): RichSnapshot {
  return {
    protocol: 'lumina-rich/1', scope: { sessionId, messageId, blockId, renderRevision: 1 },
    manifest: { blockId, renderRevision: 1,
      html: '<div>Content</div>', css: '', js: '', fallbackText: 'Fallback', stateSchemaVersion: 1, contentHash: 'a'.repeat(64) },
    pendingManifest: null, readOnly: false, dataRevision: 0, values: {},
    draft: { draftRevision: 0, stateSchemaVersion: 1, fields: {}, dirty: [] },
    archivedDrafts: [], actions: [], files: [],
  }
}

function harness(initial: RichAppearance = { theme: 'cyber', accent: 'auto' }) {
  let appearance = initial
  let mounts = 0
  const listeners = new Map<string, (packet: Record<string, unknown>) => void>()
  const rpc: RichRpc = {
    mount: vi.fn(async () => ({ mountId: `mount-${++mounts}` as RichMountId, snapshot: snapshot() })),
    snapshot: vi.fn(async () => snapshot()),
    reportRender: vi.fn(async () => ({ code: 'RENDER_REPAIR_QUEUED', repairQueued: true })),
    dispose: vi.fn(async () => {}),
    saveDraft: vi.fn(async () => { throw new Error('unused draft endpoint') }),
    invoke: vi.fn(async () => { throw new Error('unused action endpoint') }),
    status: vi.fn(async () => null),
    registerFile: vi.fn(async () => { throw new Error('unused file endpoint') }),
    applyUpdate: vi.fn(async () => snapshot()),
  }
  const native: NativeRichBridge = {
    limits: { documentBytes: 2097152 + 65536, sdkBytes: 65536, guestPacketBytes: 131072, hostPacketBytes: 16777216 },
    acquire: vi.fn<NativeRichBridge['acquire']>(async request => ({ lease: `lease-${request.mountId}`, partition: `partition-${request.mountId}`, src: 'about:blank' })),
    subscribe: vi.fn<NativeRichBridge['subscribe']>((lease, listener) => { listeners.set(lease, listener); return () => { listeners.delete(lease) } }),
    send: vi.fn(async () => {}), release: vi.fn(async () => {}),
  }
  const copy = { text: '复制这部分', image: '复制图片', copied: '已复制', failed: '复制失败' }
  const controller = new RichBlockController(sessionId, rpc, native, 250, () => appearance, () => copy)
  const emit = (lease: string, mountId: string, seq: number, type: string, payload: Record<string, unknown>) => listeners.get(lease)?.({
    protocol: 'lumina-rich/1', mountId, renderRevision: 1, packetId: `${mountId}-packet-${seq}`, seq, type, payload,
  })
  const select = (next: RichAppearance): void => { appearance = next }
  return { controller, rpc, native, emit, select }
}

function lastPacket(native: NativeRichBridge): { type: string; payload: Record<string, unknown> } {
  return vi.mocked(native.send).mock.calls.at(-1)![1] as { type: string; payload: Record<string, unknown> }
}

async function settle(): Promise<void> { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('real rich controller async lifetimes', () => {
  it('delivers data refresh to the current guest without replacing its code or unsent draft', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: 'light', getPropertyValue: () => '' }))
    vi.stubGlobal('document', { documentElement: {} })
    const h = harness()
    const initial = snapshot()
    const current = { ...initial, draft: { ...initial.draft, fields: { note: 'unsent' }, dirty: ['note'] } }
    vi.mocked(h.rpc.mount).mockResolvedValue({ mountId: 'mount-1' as RichMountId, snapshot: current })
    const updated = { ...current, dataRevision: 1, values: { progress: 'checked' },
      manifest: { ...current.manifest, fallbackText: 'Checked one item' } }
    vi.mocked(h.rpc.snapshot).mockResolvedValue(updated)
    h.controller.open(messageId, blockId); await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    await vi.advanceTimersByTimeAsync(250); await settle()
    expect(h.native.acquire).toHaveBeenCalledTimes(1)
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].copy).toEqual({ text: '复制这部分', image: '复制图片', copied: '已复制', failed: '复制失败' })
    expect(h.native.release).not.toHaveBeenCalled()
    expect(h.rpc.applyUpdate).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot().snapshot).toEqual(updated)
    expect(lastPacket(h.native).payload).toMatchObject({ snapshot: { dataRevision: 1, values: updated.values, draft: current.draft } })
    await h.controller.close()
  })
  it('applies Host cyber appearance before authored CSS and includes it in the native document budget', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = harness()
    const authored = { ...snapshot(), manifest: { ...snapshot().manifest, css: ':root{--rich-accent:#79d9ca}' } }
    vi.mocked(h.rpc.mount).mockResolvedValue({ mountId: 'mount-1' as RichMountId, snapshot: authored })
    h.controller.open(messageId, blockId); await settle()
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe(RICH_CYBER_CSS + authored.manifest.css)
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    expect(vi.mocked(h.native.send).mock.calls[0]?.[1].payload).toMatchObject({ theme: { mode: 'dark' } })
    expect(h.controller.getSnapshot().snapshot?.manifest.css).toBe(authored.manifest.css)
    await h.controller.close()
    Object.defineProperty(h.native.limits, 'documentBytes', { value: RICH_CYBER_CSS.length })
    h.controller.open(messageId, blockId); await settle()
    expect(h.native.acquire).toHaveBeenCalledTimes(1)
    expect(h.controller.getSnapshot().error).toBe('Error: RICH_DOCUMENT_TOO_LARGE')
    await h.controller.close()
  })

  it('injects the graphite sheet and dark guest mode when the profile selects the dark theme', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = harness({ theme: 'dark', accent: 'blue' })
    h.controller.open(messageId, blockId); await settle()
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe(RICH_DARK_CSS)
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    expect(vi.mocked(h.native.send).mock.calls[0]?.[1].payload).toMatchObject({ theme: { mode: 'dark' } })
    await h.controller.close()
  })

  it('does not inject a sheet when the profile disables the built-in theme', async () => {
    const h = harness({ theme: 'none', accent: 'blue' })
    h.controller.open(messageId, blockId); await settle()
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe('')
    await h.controller.close()
  })

  it('restyles a ready guest after it saves its draft and keeps the Host mount', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = harness()
    h.controller.open(messageId, blockId); await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    await h.controller.restyle()
    expect(h.native.send).toHaveBeenCalledTimes(1)
    const aurora = { theme: 'aurora', accent: 'auto' } as const
    h.select(aurora)
    const restyled = h.controller.restyle(); await settle()
    const prepare = lastPacket(h.native)
    expect(prepare.type).toBe('prepare.update')
    expect(h.native.release).not.toHaveBeenCalled()
    h.emit('lease-mount-1', 'mount-1', 2, 'update.ready', { requestId: prepare.payload.requestId })
    await restyled
    expect(h.native.release).toHaveBeenCalledWith('lease-mount-1')
    expect(h.rpc.snapshot).toHaveBeenCalledWith({ mountId: 'mount-1' })
    expect(h.rpc.dispose).not.toHaveBeenCalled()
    expect(vi.mocked(h.native.acquire).mock.calls[1]?.[0]).toMatchObject({ mountId: 'mount-1', css: richThemeCss(aurora) })
    expect(h.controller.getSnapshot()).toMatchObject({ error: null, reservation: { lease: 'lease-mount-1' } })
    await h.controller.close()
  })

  it('keeps the old guest and its input when the draft cannot be saved before a restyle', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = harness()
    h.controller.open(messageId, blockId); await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    h.select({ theme: 'neon', accent: 'auto' })
    const restyled = h.controller.restyle(); await settle()
    const prepare = lastPacket(h.native)
    h.emit('lease-mount-1', 'mount-1', 2, 'update.ready', { requestId: prepare.payload.requestId, error: 'DRAFT_NOT_SAVED' })
    await expect(restyled).rejects.toThrow('DRAFT_NOT_SAVED')
    expect(lastPacket(h.native).type).toBe('update.cancel')
    expect(h.native.release).not.toHaveBeenCalled()
    expect(h.native.acquire).toHaveBeenCalledTimes(1)
    expect(h.controller.getSnapshot()).toMatchObject({ inputWarning: true, reservation: { lease: 'lease-mount-1' } })
    await h.controller.close()
  })

  it('applies a theme switch that lands while the guest document is being built', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = harness()
    const acquired = deferred<Awaited<ReturnType<NativeRichBridge['acquire']>>>()
    vi.mocked(h.native.acquire).mockImplementationOnce(async () => acquired.promise)
    h.controller.open(messageId, blockId); await settle()
    const terminal = { theme: 'terminal', accent: 'auto' } as const
    h.select(terminal)
    await h.controller.restyle()
    acquired.resolve({ lease: 'lease-mount-1', partition: 'partition-mount-1', src: 'about:blank' })
    for (let i = 0; i < 4; i++) await settle()
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe(RICH_CYBER_CSS)
    expect(vi.mocked(h.native.acquire).mock.calls[1]?.[0].css).toBe(richThemeCss(terminal))
    expect(h.native.release).toHaveBeenCalledWith('lease-mount-1')
    expect(h.controller.getSnapshot().reservation?.lease).toBe('lease-mount-1')
    await h.controller.close()
  })
  it('does not send an unchanged polled manifest to the guest', async () => {
    const h = harness()
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: 'light', getPropertyValue: () => '' }))
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const poll = vi.fn(async () => ({ revision: 'r'.repeat(64), snapshot: null as RichSnapshot | null }))
    h.rpc.snapshotIfChanged = poll
    h.controller.open(messageId, blockId); await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    const sent = vi.mocked(h.native.send).mock.calls.length
    await vi.advanceTimersByTimeAsync(1000); await settle()
    expect(poll).toHaveBeenCalled()
    expect(poll.mock.calls.length).toBeGreaterThan(1)
    expect(h.rpc.snapshot).not.toHaveBeenCalled()
    expect(h.native.send).toHaveBeenCalledTimes(sent)
    await h.controller.close()
  })
  it('keeps a failed guest with unpersisted input and stages its repair for explicit application', async () => {
    const h = harness()
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: 'light', getPropertyValue: () => '' }))
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    h.controller.open(messageId, blockId); await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' }); await settle()
    h.emit('lease-mount-1', 'mount-1', 2, 'content.error', { message: 'bad code', draftPreserved: true }); await settle()
    vi.mocked(h.rpc.snapshot).mockResolvedValue({ ...snapshot(), pendingManifest: { ...snapshot().manifest, renderRevision: 2 } })
    await vi.advanceTimersByTimeAsync(250); await settle()
    expect(h.native.release).not.toHaveBeenCalled()
    expect(h.rpc.applyUpdate).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot()).toMatchObject({ error: 'CONTENT_ERROR', inputWarning: true, reservation: { lease: 'lease-mount-1' } })
    await h.controller.close()
  })
  it('retires a failed guest and applies a compatible repair without losing the mount or draft', async () => {
    const h = harness()
    vi.stubGlobal('getComputedStyle', () => ({ colorScheme: 'light', getPropertyValue: () => '' }))
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    h.controller.open(messageId, blockId)
    await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' })
    await settle()
    h.emit('lease-mount-1', 'mount-1', 2, 'content.error', { message: 'broken JS' })
    await settle()
    expect(h.rpc.reportRender).toHaveBeenCalledWith({ mountId: 'mount-1', state: 'failed', message: 'broken JS' })
    expect(h.native.release).toHaveBeenCalledWith('lease-mount-1')
    expect(h.rpc.dispose).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot()).toMatchObject({ error: 'CONTENT_ERROR', closed: false, repairing: true, reservation: null })
    const updated = { ...snapshot(), pendingManifest: { ...snapshot().manifest, renderRevision: 2 },
      draft: { draftRevision: 1, stateSchemaVersion: 1, fields: { last: 'unsent' }, dirty: ['last'] } }
    vi.mocked(h.rpc.snapshot).mockResolvedValue(updated)
    vi.mocked(h.rpc.mount).mockResolvedValue({ mountId: 'mount-2' as RichMountId,
      snapshot: { ...updated, manifest: updated.pendingManifest, pendingManifest: null } })
    await vi.advanceTimersByTimeAsync(250)
    await settle()
    expect(h.rpc.applyUpdate).toHaveBeenCalledWith({ mountId: 'mount-1', discardDraft: false })
    expect(h.controller.getSnapshot()).toMatchObject({ error: null, repairing: false, snapshot: { draft: { fields: { last: 'unsent' } } } })
    await h.controller.close()
  })
  it('mounts and restores large arbitrary HTML with the SDK reserve and complete snapshot', async () => {
    const h = harness()
    const dom = new JSDOM('<html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const initial = snapshot()
    const large: RichSnapshot = { ...initial,
      manifest: { ...initial.manifest, html: '<div>' + '\u754c'.repeat(690000) + '</div>' } }
    vi.mocked(h.rpc.mount).mockImplementation(async () => ({ mountId: `mount-${vi.mocked(h.rpc.mount).mock.calls.length}` as RichMountId, snapshot: large }))
    for (const mount of [1, 2]) {
      h.controller.open(messageId, blockId)
      await settle()
      const loaded = vi.mocked(h.native.acquire).mock.calls.at(-1)![0]
      expect(loaded.html).toBe(large.manifest.html)
      expect(new TextEncoder().encode(loaded.html + loaded.css + loaded.js + (loaded.sdk ?? '')).byteLength).toBeLessThanOrEqual(h.native.limits.documentBytes)
      expect(new TextEncoder().encode(loaded.sdk).byteLength).toBeLessThan(h.native.limits.sdkBytes)
      expect(loaded.js).toBe(large.manifest.js)
      h.emit(`lease-mount-${mount}`, `mount-${mount}`, 1, 'ready', { sdkVersion: '1' })
      await settle()
      const packet = vi.mocked(h.native.send).mock.calls.at(-1)![1]
      expect(new TextEncoder().encode(JSON.stringify(packet)).byteLength).toBeGreaterThan(131072)
      expect(packet.payload).toMatchObject({ snapshot: { manifest: { html: large.manifest.html } } })
      await h.controller.close()
      expect(h.controller.getSnapshot().snapshot?.manifest.html).toBe(large.manifest.html)
    }
    dom.window.close()
  })

  it('fails closed on an oversized restored snapshot while retaining the full data for fallback', async () => {
    const h = harness()
    const dom = new JSDOM('<html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const large: RichSnapshot = { ...snapshot(), values: { history: 'x'.repeat(16777216) } }
    vi.mocked(h.rpc.mount).mockResolvedValue({ mountId: 'mount-1' as RichMountId, snapshot: large })
    h.controller.open(messageId, blockId)
    await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' })
    await settle()
    expect(h.native.send).not.toHaveBeenCalled()
    expect(h.native.release).toHaveBeenCalledWith('lease-mount-1')
    expect(h.rpc.dispose).toHaveBeenCalledWith({ mountId: 'mount-1' })
    expect(h.rpc.invoke).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot()).toMatchObject({ closed: true, error: 'RICH_HOST_PACKET_TOO_LARGE', snapshot: { values: large.values } })
    dom.window.close()
  })

  it('rejects an over-budget executable before acquiring a guest without truncating its snapshot', async () => {
    const h = harness()
    const initial = snapshot()
    const large: RichSnapshot = { ...initial,
      manifest: { ...initial.manifest, html: 'x'.repeat(h.native.limits.documentBytes + 1) } }
    vi.mocked(h.rpc.mount).mockResolvedValue({ mountId: 'mount-1' as RichMountId, snapshot: large })
    h.controller.open(messageId, blockId)
    await settle()
    expect(h.native.acquire).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot()).toMatchObject({ error: 'Error: RICH_DOCUMENT_TOO_LARGE', snapshot: { manifest: { html: large.manifest.html } } })
    await h.controller.close()
  })
  it('does not dispose a fresh mount while the old guest release is still pending', async () => {
    const h = harness()
    const released = deferred<undefined>()
    vi.mocked(h.native.release).mockImplementation(async (lease) => {
      if (lease === 'lease-mount-1') await released.promise
    })
    h.controller.open(messageId, blockId)
    await settle()
    expect(h.controller.getSnapshot().reservation?.lease).toBe('lease-mount-1')
    const closing = h.controller.close()
    h.controller.open(messageId, blockId)
    await settle()
    expect(h.controller.getSnapshot().reservation?.lease).toBe('lease-mount-2')
    released.resolve(undefined)
    await closing
    expect(h.rpc.dispose).toHaveBeenCalledWith({ mountId: 'mount-1' })
    expect(h.rpc.dispose).not.toHaveBeenCalledWith({ mountId: 'mount-2' })
    expect(h.controller.getSnapshot()).toMatchObject({ closed: false, reservation: { lease: 'lease-mount-2' } })
    await h.controller.close()
  })

  it('ignores a stale refresh rejection after another lifetime has mounted', async () => {
    const h = harness()
    const oldRefresh = deferred<RichSnapshot>()
    vi.mocked(h.rpc.snapshot).mockImplementationOnce(async () => oldRefresh.promise)
    h.controller.open(messageId, blockId)
    await settle()
    await vi.advanceTimersByTimeAsync(251)
    expect(h.rpc.snapshot).toHaveBeenCalledWith({ mountId: 'mount-1' })
    await h.controller.close()
    h.controller.open(messageId, blockId)
    await settle()
    oldRefresh.reject(new Error('STALE_MOUNT'))
    await settle()
    expect(h.rpc.mount).toHaveBeenCalledTimes(2)
    expect(h.rpc.dispose).not.toHaveBeenCalledWith({ mountId: 'mount-2' })
    expect(h.native.release).not.toHaveBeenCalledWith('lease-mount-2')
    expect(h.controller.getSnapshot()).toMatchObject({ closed: false, error: null, reservation: { lease: 'lease-mount-2' } })
    await h.controller.close()
  })

  it('refreshes the new lifetime while the old RPC remains unresolved', async () => {
    const h = harness()
    const oldRefresh = deferred<RichSnapshot>()
    vi.mocked(h.rpc.snapshot).mockImplementationOnce(async () => oldRefresh.promise)
    h.controller.open(messageId, blockId)
    await settle()
    await vi.advanceTimersByTimeAsync(251)
    await h.controller.close()
    h.controller.open(messageId, blockId)
    await settle()
    await vi.advanceTimersByTimeAsync(251)
    // Resolve the old request before assertions so teardown always settles its owner.
    const requests = vi.mocked(h.rpc.snapshot).mock.calls.map(([request]) => request.mountId)
    oldRefresh.resolve(snapshot())
    await settle()
    await h.controller.close()
    expect(requests).toContain('mount-2')
  })

  it('initializes a new guest without waiting for an old status request to settle', async () => {
    const h = harness()
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const oldStatus = deferred<RichActionStatus | null>()
    vi.mocked(h.rpc.status).mockImplementationOnce(async () => oldStatus.promise)
    h.controller.open(messageId, blockId)
    await settle()
    h.emit('lease-mount-1', 'mount-1', 1, 'ready', { sdkVersion: '1' })
    await settle()
    h.emit('lease-mount-1', 'mount-1', 2, 'action.status', { actionId: 'old-action' })
    await settle()
    expect(h.rpc.status).toHaveBeenCalledTimes(1)
    await h.controller.close()
    h.controller.open(messageId, blockId)
    await settle()
    h.emit('lease-mount-2', 'mount-2', 1, 'ready', { sdkVersion: '1' })
    await settle()
    const initialized = vi.mocked(h.native.send).mock.calls.some(([lease, packet]) => lease === 'lease-mount-2' && packet.type === 'init')
    oldStatus.resolve(null)
    await settle()
    await h.controller.close()
    dom.window.close()
    expect(initialized).toBe(true)
  })
})

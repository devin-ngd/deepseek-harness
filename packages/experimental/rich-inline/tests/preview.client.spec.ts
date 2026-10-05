/** Preview timing and teardown with native transport doubles; native safety is tested in Electron. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { NativeRichBridge } from '../src/client/native.ts'
import { RichPreview } from '../src/client/preview.ts'
import { RICH_CYBER_CSS, RICH_DARK_CSS, RICH_THEMES, richThemeCss } from '../src/shared/theme.ts'
import type { RichAppearance } from '../src/shared/theme.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())
function harness(appearance: RichAppearance = { theme: 'cyber', accent: 'auto' }) {
  let receive: (value: Record<string, unknown>) => void = () => {}
  const native: NativeRichBridge = {
    limits: { documentBytes: 2162688, sdkBytes: 65536, guestPacketBytes: 131072, hostPacketBytes: 16777216 },
    acquire: vi.fn(async () => ({ lease: 'preview-lease', partition: 'preview-partition', src: 'about:blank' })),
    subscribe: vi.fn<NativeRichBridge['subscribe']>((_lease, listener) => { receive = listener; return vi.fn() }),
    send: vi.fn(async () => {}), release: vi.fn(async () => {}) }
  const preview = new RichPreview(native, appearance)
  return { preview, native, emit: (packet: Record<string, unknown>) => { receive(packet) } }
}
it('coalesces many appends and sends only new HTML/CSS without generated JS', async () => {
  const h = harness(); await h.preview.open(); h.emit({ type: 'preview.ready' })
  const source = JSON.stringify({ key: 'test', html: '<p>Hi</p>', css: 'p{color:red}', js: 'window.evilRan=true' })
  for (let n = 1; n <= source.length; n++) h.preview.update(source.slice(0, n))
  await vi.advanceTimersByTimeAsync(34)
  expect(h.native.send).toHaveBeenCalledTimes(1)
  expect(vi.mocked(h.native.send).mock.calls[0]?.[1]).toEqual({ type: 'preview.append', seq: 1, html: '<p>Hi</p>', css: 'p{color:red}' })
  expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0]).toMatchObject({ html: '', css: RICH_CYBER_CSS, js: '' })
  h.preview.update(source); await vi.advanceTimersByTimeAsync(34)
  expect(h.native.send).toHaveBeenCalledTimes(1)
  await h.preview.close()
})
it('revokes a pending update on close and retains amended source as a visible error', async () => {
  const h = harness(); await h.preview.open(); h.emit({ type: 'preview.ready' })
  h.preview.update('{"html":"old'); h.preview.update('{"html":"replacement')
  expect(h.preview.getSnapshot().error).toBe(true)
  await h.preview.close(); await vi.advanceTimersByTimeAsync(100)
  expect(h.native.send).not.toHaveBeenCalled()
  expect(h.native.release).toHaveBeenCalledWith('preview-lease')
  expect(h.preview.getSnapshot().closed).toBe(true)
})

it('uses Host accent preferences and allows opting out before streaming any content', async () => {
  const expected = { cyber: { violet: '#b28dff', teal: '#2ee8c6' }, dark: { violet: '#b49cff', teal: '#5cd4c0' } }
  for (const theme of ['cyber', 'dark'] as const) {
    for (const accent of ['violet', 'teal'] as const) {
      const h = harness({ theme, accent }); await h.preview.open()
      const css = vi.mocked(h.native.acquire).mock.calls[0]?.[0].css
      expect(css?.startsWith(theme === 'cyber' ? RICH_CYBER_CSS : RICH_DARK_CSS)).toBe(true)
      expect(css).toContain(`--rich-accent: ${expected[theme][accent]}`)
      await h.preview.close()
    }
  }
  const h = harness({ theme: 'none', accent: 'blue' }); await h.preview.open()
  expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe('')
  await h.preview.close()
})

it('streams every built-in theme with the same sheet as final rendering', async () => {
  for (const theme of RICH_THEMES) {
    const h = harness({ theme, accent: 'auto' }); await h.preview.open()
    expect(vi.mocked(h.native.acquire).mock.calls[0]?.[0].css).toBe(richThemeCss({ theme, accent: 'auto' }))
    await h.preview.close()
  }
})

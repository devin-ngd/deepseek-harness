/** The theme picker lives on the bundle's Plugins page while the Host serves the settings entry. */
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { ThemeSettings, ThemeToast } from '../src/client/ThemeSettings.tsx'
import type { ThemeSettingsInjected } from '../src/client/ThemeSettings.tsx'
import type { RichThemeSettings } from '../src/client/appearance.ts'
import type { RichInjected } from '../src/client/slots.ts'

vi.mock('@deepseek-ai/dsh-experimental-rich-inline/remote', () => ({
  default: { package: '@deepseek-ai/dsh-experimental-rich-inline', descriptors: [] },
}))

const PACKAGE = '@deepseek-ai/dsh-experimental-rich-inline'

async function fixture() {
  const ctx = new Context(), unmount = vi.fn(async () => {})
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount() { return unmount }
  }
  new Remote()
  ctx.provide('remote.richInline', { appearance: async () => ({ ok: true, value: { theme: 'cyber', accent: 'auto' } }) })
  ctx.provide('fileUpload', { upload: vi.fn() })
  ctx.provide('locale', new LocaleRuntime(ctx))
  const formState = createSnapshotStore<ConfigFormSnapshot<RichThemeSettings>>({
    status: 'ready', value: { theme: 'cyber' }, base: {}, user: {}, revision: 0, writable: true, mode: 'host',
  })
  const set = vi.fn(async () => true)
  const form: ConfigForm<RichThemeSettings> = {
    getSnapshot: () => formState.getSnapshot(), subscribe: listener => formState.subscribe(listener),
    set, unset: vi.fn(), mutate: vi.fn(),
  }
  let served = false, off: (() => void) | undefined, register: (() => () => void) | undefined
  const serve = (next: boolean): void => {
    served = next
    if (served && off === undefined && register !== undefined) off = register()
    else if (!served && off !== undefined) { off(); off = undefined }
  }
  const whileServed = vi.fn((namespaces: readonly string[], contribute: (served: ReadonlySet<string>) => () => void) => {
    register = () => contribute(new Set(namespaces))
    serve(served)
    return () => { off?.(); off = undefined; register = undefined }
  })
  ctx.provide('configForms', { get: vi.fn(() => form), whileServed })
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'conversation.chat.assistant-block': { kind: 'chain', scope: 'session' },
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'settings.general.item': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, unmount, formState, set, serve, whileServed }
}

it('registers the theme picker under its package key only while the Host serves the entry', async () => {
  const b = await fixture()
  try {
    const fiber = b.ctx.plugin({ inject, apply }, { pollIntervalMs: 1000 })
    await fiber
    await vi.waitFor(() => { expect(b.whileServed).toHaveBeenCalledWith(['rich-inline'], expect.any(Function)) })
    expect(b.ctx.slots.entries('plugins.bundle.config')).toHaveLength(0)
    expect(b.ctx.slots.entries('shell.overlay').map(entry => entry.component)).toEqual([ThemeToast])
    b.serve(true)
    const [entry] = b.ctx.slots.entries('plugins.bundle.config')
    expect(entry).toMatchObject({ component: ThemeSettings, locale: 'richInline', options: { key: PACKAGE } })
    expect(b.ctx.slots.entries('settings.general.item')).toHaveLength(0)
    const face = entry!.inject!() as ThemeSettingsInjected & Record<string, unknown>
    await face.choose('terminal')
    expect(b.set).toHaveBeenCalledWith('theme', 'terminal')
    expect(face.hooks.mutation.getSnapshot().notice).toBe('themeSaved')
    const toast = b.ctx.slots.entries('shell.overlay')[0]!.inject!() as ThemeSettingsInjected & Record<string, unknown>
    expect(toast.hooks.mutation).toBe(face.hooks.mutation)
    toast.dismiss()
    expect(face.hooks.mutation.getSnapshot().notice).toBeNull()
    b.serve(false)
    expect(b.ctx.slots.entries('plugins.bundle.config')).toHaveLength(0)
    await fiber.dispose()
    expect(b.ctx.slots.entries('shell.overlay')).toHaveLength(0)
    expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(0)
    expect(b.unmount).toHaveBeenCalledOnce()
  } finally { await b.ctx.fiber.dispose() }
})

it('restyles from each accepted profile theme shared by messages and the picker', async () => {
  const b = await fixture()
  try {
    const fiber = b.ctx.plugin({ inject, apply }, { pollIntervalMs: 1000 })
    await fiber
    await vi.waitFor(() => { expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(1) })
    b.serve(true)
    const message = b.ctx.slots.entries('conversation.chat.assistant-block')[0]!.inject!() as RichInjected & Record<string, unknown>
    const picker = b.ctx.slots.entries('plugins.bundle.config')[0]!.inject!() as ThemeSettingsInjected & Record<string, unknown>
    expect(picker.hooks.appearance).toBe(message.hooks.appearance)
    expect(message.hooks.appearance.getSnapshot()).toEqual({ theme: 'cyber', accent: 'auto' })
    b.formState.update((state) => { state.value = { theme: 'ember' } })
    expect(message.hooks.appearance.getSnapshot()).toEqual({ theme: 'ember', accent: 'auto' })
    await fiber.dispose()
  } finally { await b.ctx.fiber.dispose() }
})

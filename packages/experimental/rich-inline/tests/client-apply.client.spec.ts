// @vitest-environment jsdom
/** The theme picker lives on the bundle's Plugins page while the Host serves the settings entry. */
import { createElement, useSyncExternalStore } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SyncedConfig, SyncedConfigValues } from '@deepseek-ai/dsh-client-config/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SyncedConfigEntry } from '../../../client/modules/src/client/synced-config.ts'
import { syncedConfig } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import { afterEach, expect, it, vi } from 'vitest'
import * as client from '../src/client/index.ts'
import { RichMessage } from '../src/client/RichMessage.tsx'
import { ThemeSettings, ThemeToast } from '../src/client/ThemeSettings.tsx'
import type { ThemeSettingsInjected } from '../src/client/ThemeSettings.tsx'
import type { RichThemeSettings } from '../src/client/appearance.ts'
import { zh } from '../src/client/locales.ts'
import type { RichInjected, RichMessageProps } from '../src/client/slots.ts'
import type { RichBlockId, RichClientConfig, RichMountId, RichSnapshot } from '../src/shared/types.ts'
import { PendingQuestion } from '../../../client/ui-user-questions/src/client/contract/slots.ts'
import { RichQuestion, type RichQuestionInjected } from '../src/client/RichQuestion.tsx'

vi.mock('@deepseek-ai/dsh-rich-inline/remote', () => ({
  default: { package: '@deepseek-ai/dsh-rich-inline', descriptors: [] },
}))

afterEach(() => { cleanup() })

const PACKAGE = '@deepseek-ai/dsh-rich-inline'
const SID = SessionId('rich-composer')
const { apply, inject } = client

function liveSyncedConfig(values: SyncedConfigValues = { pollIntervalMs: 1000 }) {
  const entry = new SyncedConfigEntry(values)
  return { entry, config: entry.activate() as SyncedConfig<RichClientConfig> }
}

it('uses the Host-synchronized configuration without exporting a Client schema', () => {
  expect('Config' in client).toBe(false)
})

async function fixture(options?: {
  preset?: string
  appearance?: () => Promise<{ ok: true; value: { theme: 'cyber'; accent: 'auto' } }>
  remote?: Record<string, unknown>
}) {
  const ctx = new Context(), unmount = vi.fn(async () => {})
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount() { return unmount }
  }
  new Remote()
  ctx.provide('remote.richInline', {
    appearance: options?.appearance ?? (async () => ({ ok: true, value: { theme: 'cyber', accent: 'auto' } })),
    ...options?.remote,
  })
  ctx.provide('fileUpload', { upload: vi.fn() })
  ctx.provide('locale', new LocaleRuntime(ctx))
  const pendingInteractions = createSnapshotStore<ReadonlyMap<SessionId, SessionPendingInteraction>>(new Map())
  ctx.provide('uiSession', { pendingInteractions })
  const sessionList = createSnapshotStore({ byId: { [SID]: { projectionValues: { agentPreset: options?.preset ?? 'rich' } } } })
  class Sessions extends Service {
    list = sessionList
    constructor() { super(ctx, 'sessions') }
  }
  new Sessions()
  const formState = createSnapshotStore<ConfigFormSnapshot<RichThemeSettings>>({
    status: 'ready', value: { theme: 'cyber' }, base: {}, user: {}, revision: 0, writable: true,
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
    'conversation.composer': { kind: 'chain', scope: 'session' },
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'settings.general.item': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, unmount, formState, sessionList, set, serve, whileServed, pendingInteractions }
}

it('uses the official composer election and original question source only in enabled sessions', async () => {
  const b = await fixture()
  try {
    const fiber = b.ctx.plugin({ inject, apply }, syncedConfig<RichClientConfig>({ pollIntervalMs: 1000, activePresets: ['rich'] }))
    await fiber
    await vi.waitFor(() => { expect(b.ctx.slots.entries('conversation.composer')).toHaveLength(1) })
    const entry = b.ctx.slots.entries('conversation.composer')[0]!
    expect(entry).toMatchObject({ component: RichQuestion, options: { priority: -10 } })
    const pending = new PendingQuestion(SID, [{ id: 'one', question: 'Choose an approach' }])
    b.pendingInteractions.set(new Map([[SID, pending]]))
    expect(entry.select!({ pendingInteraction: pending } as never)).toBe(pending)
    expect(entry.select!({ pendingInteraction: undefined } as never)).toBeNull()
    expect(entry.select!({ pendingInteraction: { kind: 'approval', sessionId: SID } } as never)).toBeNull()
    const disabled = new PendingQuestion(SessionId('ordinary'), pending.questions)
    expect(entry.select!({ pendingInteraction: disabled } as never)).toBeNull()
    const face = entry.inject!(SID as never) as RichQuestionInjected & Record<string, unknown>
    expect(face.keyedHooks.questionCard(pending.key)).toBe(pending)
    expect(face.keyedHooks.questionCard('another-request')).toBeUndefined()
    await fiber.dispose()
    expect(b.ctx.slots.entries('conversation.composer')).toHaveLength(0)
  } finally { await b.ctx.fiber.dispose() }
})

it('leaves the official composer untouched when HTML questions are disabled and reacts to live updates', async () => {
  const b = await fixture()
  const synced = liveSyncedConfig({ pollIntervalMs: 1000, htmlQuestions: false })
  try {
    const fiber = b.ctx.plugin({ inject, apply }, synced.config)
    await fiber
    await vi.waitFor(() => { expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(1) })
    expect(b.ctx.slots.entries('conversation.composer')).toHaveLength(0)
    synced.entry.update({ pollIntervalMs: 1000, htmlQuestions: true })
    expect(b.ctx.slots.entries('conversation.composer')).toHaveLength(1)
    synced.entry.update({ pollIntervalMs: 1000, htmlQuestions: false })
    expect(b.ctx.slots.entries('conversation.composer')).toHaveLength(0)
    await fiber.dispose()
  } finally { await b.ctx.fiber.dispose() }
})

it('registers the theme picker under its package key only while the Host serves the entry', async () => {
  const b = await fixture()
  try {
    const fiber = b.ctx.plugin({ inject, apply }, syncedConfig<RichClientConfig>({ pollIntervalMs: 1000 }))
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

it('restyles from each accepted profile theme shared by messages, synced config and the picker', async () => {
  const b = await fixture()
  const synced = liveSyncedConfig({ pollIntervalMs: 1000, theme: 'cyber' })
  try {
    const fiber = b.ctx.plugin({ inject, apply }, synced.config)
    await fiber
    await vi.waitFor(() => { expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(1) })
    b.serve(true)
    const message = b.ctx.slots.entries('conversation.chat.assistant-block')[0]!.inject!(SID as never) as RichInjected & Record<string, unknown>
    const picker = b.ctx.slots.entries('plugins.bundle.config')[0]!.inject!() as ThemeSettingsInjected & Record<string, unknown>
    expect(picker.hooks.appearance).toBe(message.hooks.appearance)
    expect(message.hooks.appearance.getSnapshot()).toEqual({ theme: 'cyber', accent: 'auto' })
    b.formState.update((state) => { state.value = { theme: 'ember' } })
    expect(message.hooks.appearance.getSnapshot()).toEqual({ theme: 'ember', accent: 'auto' })
    synced.entry.update({ pollIntervalMs: 1000, theme: 'aurora' })
    expect(message.hooks.appearance.getSnapshot()).toEqual({ theme: 'aurora', accent: 'auto' })
    await fiber.dispose()
  } finally { await b.ctx.fiber.dispose() }
})

it('evaluates compact live-process presets through the injected sessions service and live synced updates', async () => {
  const b = await fixture()
  const synced = liveSyncedConfig({ pollIntervalMs: 1000, activePresets: ['rich'], compactLiveProcess: true })
  try {
    type Presentation = { enabled(sessionId: SessionId): boolean; subscribe(listener: () => void): () => void }
    let registration: Presentation | undefined
    let changedFiles: Presentation | undefined
    b.ctx.provide('chatChangedFiles', {
      register: (entry: Presentation) => {
        changedFiles = entry
        return () => { changedFiles = undefined }
      },
    })
    b.ctx.provide('chatLiveProcess', {
      register: (entry: { enabled(sessionId: SessionId): boolean; subscribe(listener: () => void): () => void }) => {
        registration = entry
        return () => { registration = undefined }
      },
    })
    const fiber = b.ctx.plugin({ inject, apply }, synced.config)
    await fiber
    await vi.waitFor(() => { expect(registration).toBeDefined(); expect(changedFiles).toBeDefined() })
    const listener = vi.fn()
    const unsubscribe = registration!.subscribe(listener)
    expect(registration!.enabled(SID)).toBe(true)
    expect(registration!.enabled(SessionId('ordinary'))).toBe(false)
    expect(changedFiles!.enabled(SID)).toBe(true)
    expect(changedFiles!.enabled(SessionId('ordinary'))).toBe(false)
    synced.entry.update({ pollIntervalMs: 1000, activePresets: ['lumina'], compactLiveProcess: true })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(registration!.enabled(SID)).toBe(false)
    expect(changedFiles!.enabled(SID)).toBe(false)
    unsubscribe()
    synced.entry.update({ pollIntervalMs: 1000, activePresets: ['rich'], compactLiveProcess: false })
    expect(registration).toBeUndefined()
    expect(changedFiles!.enabled(SID)).toBe(true)
    await fiber.dispose()
    expect(changedFiles).toBeUndefined()
  } finally { await b.ctx.fiber.dispose() }
})

it('renders RichMessage with SyncedConfig references when a session preset is selected and polls with numeric delay', async () => {
  const messageId = MessageId('assistant-msg-1')
  const blockId = brandString<RichBlockId>('block-demo-1')
  const mountId = brandString<RichMountId>('mount-demo-1')
  const snapshot: RichSnapshot = {
    protocol: 'lumina-rich/1',
    scope: { sessionId: SID, messageId, blockId, renderRevision: 1 },
    manifest: {
      blockId, renderRevision: 1, html: '<p>Hello</p>', css: '', js: '',
      fallbackText: 'Fallback summary', stateSchemaVersion: 1, contentHash: 'hash-1',
    },
    pendingManifest: null, readOnly: false, dataRevision: 1, values: {},
    draft: { draftRevision: 0, stateSchemaVersion: 1, fields: {}, dirty: [] },
    archivedDrafts: [], actions: [], files: [], renderRepair: null,
  }
  const mount = vi.fn(async () => ({ ok: true as const, value: { mountId, snapshot } }))
  const snapshotIfChanged = vi.fn(async () => ({ ok: true as const, value: { revision: 'r1', snapshot: null } }))
  const dispose = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const b = await fixture({
    preset: 'devin',
    remote: { mount, snapshotIfChanged, dispose },
  })
  // Simulate an absent initial field as well as subsequent live updates from SyncedConfigEntry.
  const synced = liveSyncedConfig({})
  const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
  try {
    const fiber = b.ctx.plugin({ inject, apply }, synced.config)
    await fiber
    await vi.waitFor(() => { expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(1) })
    const slotEntry = b.ctx.slots.entries('conversation.chat.assistant-block')[0]!
    const text = `Intro\n\n\`\`\`rich-inline\n{"blockId":"${blockId}"}\n\`\`\`\n`
    const matched = slotEntry.select!({ block: { kind: 'text', text }, streaming: false, interrupted: false } as never)
    expect(matched).not.toBeNull()
    const injected = slotEntry.inject!(SID as never) as RichInjected & Record<string, unknown>

    function Harness() {
      const props = {
        sessionId: SID,
        messageId,
        block: { kind: 'text', text },
        streaming: false,
        interrupted: false,
        matched: matched!,
        open: (key: string, msgId: MessageId, blkId: RichBlockId) => injected.open(key, msgId, blkId),
        close: (key: string) => injected.close(key),
        addFile: (key: string, file: File) => injected.addFile(key, file),
        update: (key: string, discardDraft: boolean) => injected.update(key, discardDraft),
        cancel: (key: string, actionId: Parameters<typeof injected.cancel>[1]) => injected.cancel(key, actionId),
        useSessions: (selector: (s: ReturnType<typeof b.sessionList.getSnapshot>) => unknown) =>
          selector(useSyncExternalStore(listener => b.sessionList.subscribe(listener), () => b.sessionList.getSnapshot())),
        useAppearance: (selector: (a: ReturnType<typeof injected.hooks.appearance.getSnapshot>) => unknown) => selector(
          useSyncExternalStore(listener => injected.hooks.appearance.subscribe(listener), () => injected.hooks.appearance.getSnapshot()),
        ),
        useActivePresets: (selector: (p: ReturnType<typeof injected.hooks.activePresets.getSnapshot>) => unknown) => {
          const active = injected.hooks.activePresets
          return selector(useSyncExternalStore(listener => active.subscribe(listener), () => active.getSnapshot()))
        },
        useRich: (key: string, selector: (v: ReturnType<ReturnType<typeof injected.keyedHooks.rich>['getSnapshot']>) => unknown) => {
          const source = injected.keyedHooks.rich(key)
          return selector(useSyncExternalStore(listener => source.subscribe(listener), () => source.getSnapshot()))
        },
        t: (key: string) => (zh as Record<string, string>)[key] ?? key,
      }
      // The framework supplies unused Session hooks in composition; this unit fixture supplies only consumed hooks.
      return createElement(RichMessage, props as Partial<RichMessageProps> as RichMessageProps)
    }

    const view = render(createElement(Harness))
    await waitFor(() => {
      expect(mount).toHaveBeenCalledWith({ sessionId: SID, messageId, blockId })
      expect(view.container.querySelector(`[data-rich-inline-block="${blockId}"]`)).not.toBeNull()
      expect(view.container.textContent).toContain('Fallback summary')
    })
    const pollDelays = setTimeoutSpy.mock.calls.map(call => call[1]).filter((ms): ms is number => ms === 1000)
    expect(pollDelays.length).toBeGreaterThan(0)
    expect(setTimeoutSpy.mock.calls.some(call => Number.isNaN(Number(call[1])))).toBe(false)

    act(() => {
      synced.entry.update({ activePresets: ['lumina'], pollIntervalMs: 2500, theme: 'ember' })
    })
    expect(view.container.querySelector(`[data-rich-inline-block="${blockId}"]`)?.getAttribute('data-rich-theme')).toBe('ember')
    expect(injected.hooks.activePresets.getSnapshot()).toEqual(['lumina'])

    view.unmount()
    await waitFor(() => { expect(dispose).toHaveBeenCalledWith({ sessionId: SID, mountId }) })
    await fiber.dispose()
  } finally {
    setTimeoutSpy.mockRestore()
    await b.ctx.fiber.dispose()
  }
})

it('unmounts cleanly without touching inactive context if disposed during async startup', async () => {
  let resolveAppearance!: (value: { ok: true; value: { theme: 'cyber'; accent: 'auto' } }) => void
  const b = await fixture({
    appearance: () => new Promise((resolve) => { resolveAppearance = resolve }),
  })
  try {
    const fiber = b.ctx.plugin({ inject, apply }, syncedConfig<RichClientConfig>({ pollIntervalMs: 1000 }))
    await vi.waitFor(() => { expect(resolveAppearance).toBeTypeOf('function') })
    const disposing = fiber.dispose()
    resolveAppearance({ ok: true, value: { theme: 'cyber', accent: 'auto' } })
    await disposing
    expect(b.unmount).toHaveBeenCalledOnce()
    expect(b.ctx.slots.entries('conversation.chat.assistant-block')).toHaveLength(0)
  } finally { await b.ctx.fiber.dispose() }
})

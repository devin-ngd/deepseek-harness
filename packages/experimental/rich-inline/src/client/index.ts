/** Opt-in rich message plugin: scoped durable RPC plus native generic HTML rendering. */
import type { Context } from '@deepseek-ai/cordis'
import type { SyncedConfig } from '@deepseek-ai/dsh-client-config/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import richRemote from '@deepseek-ai/dsh-experimental-rich-inline/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-file-upload/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import { RichBlockController } from './controller.ts'
import type { RichRpc } from './controller.ts'
import { nativeRich } from './native.ts'
import { richParts } from './markers.ts'
import { RichMessage } from './RichMessage.tsx'
import { en, zh } from './locales.ts'
import type { RichInjected } from './slots.ts'
import { RICH_SETTINGS_ENTRY, RichAppearanceSource, RichThemeChoice } from './appearance.ts'
import type { RichThemeSettings } from './appearance.ts'
import { ThemeSettings, ThemeToast } from './ThemeSettings.tsx'
import { RichQuestion, type RichQuestionInjected } from './RichQuestion.tsx'
import { createRichQuestionDraftStore } from './question-drafts.ts'
import type { ThemeSettingsInjected } from './ThemeSettings.tsx'
import type { RichAppearance } from '../shared/theme.ts'
import type { RichClientConfig } from '../shared/types.ts'

/** Refresh cadence while the Host sends none. */
const ABSENT_POLL_INTERVAL_MS = 1000
const EMPTY_PRESETS: readonly string[] = []

/** Client integration waits on the generated Host namespace and trusted UI services. */
export const inject = ['slots', 'locale', 'remote', 'fileUpload']

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * @param ctx - browser Cordis context.
 * @param config - Host-synced presentation and refresh preferences.
 * @returns disposer withdrawing UI contributions before unmounting the Remote namespace.
 */
export async function apply(ctx: Context, config: SyncedConfig<RichClientConfig>): Promise<() => Promise<void>> {
  const lifecycle = { active: true }
  ctx.effect(() => () => { lifecycle.active = false }, 'rich-inline: active guard')
  const disposeRemote = await ctx.remote.$mount(richRemote)
  if (!lifecycle.active) { await disposeRemote(); return async () => {} }
  ctx.effect(() => ctx.locale.register('richInline', { zh, en }), 'rich-inline: dictionaries')
  const ui = ctx.inject(['remote.richInline'], scope => activate(scope, config))
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}

/** Plugins page key of this bundle's own detail page. */
const RICH_PACKAGE_NAME = '@deepseek-ai/dsh-experimental-rich-inline'

/**
 * Follow the profile theme through the shared settings mirror and offer it on this bundle's Plugins page while the
 * Host serves the entry. Without the settings provider, rendering keeps the theme read at activation.
 */
function followSettings(ctx: Context, appearance: RichAppearanceSource): void {
  const form = ctx.configForms.get<RichThemeSettings>(RICH_SETTINGS_ENTRY)
  const sync = (): void => {
    const snapshot = form.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) appearance.accept(snapshot.value.theme)
  }
  ctx.effect(() => form.subscribe(sync), 'rich-inline: profile theme')
  sync()
  const choice = new RichThemeChoice(form)
  const face = (): ThemeSettingsInjected => ({
    hooks: { form, appearance, mutation: choice.state },
    choose: theme => choice.choose(theme),
    dismiss: () => { choice.dismiss() },
  })
  ctx.effect(() => ctx.configForms.whileServed([RICH_SETTINGS_ENTRY], () => ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register({ name: 'plugins.bundle.config', key: RICH_PACKAGE_NAME, locale: 'richInline', inject: face }, ThemeSettings))),
  'rich-inline: theme setting')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'rich-inline-theme-toast', locale: 'richInline', inject: face,
  }, ThemeToast))
}

async function activate(ctx: Context, config: SyncedConfig<RichClientConfig>): Promise<void> {
  const lifecycle = { active: true }
  ctx.effect(() => () => { lifecycle.active = false }, 'rich-inline: activation guard')
  const remote = ctx.remote.richInline
  let initial: RemoteResult<RichAppearance>
  try {
    initial = await remote.appearance()
  } catch (error) {
    if (!lifecycle.active) return
    throw error
  }
  if (!lifecycle.active) return
  const appearance = new RichAppearanceSource(unwrap(initial))
  ctx.effect(() => config.theme.subscribe(() => {
    const next = config.theme.get()
    if (next !== undefined) appearance.accept(next)
  }), 'rich-inline: synced theme')
  const enabled = (sessions: Context['sessions'], sessionId: SessionId): boolean => {
    const presets = config.activePresets.get() ?? EMPTY_PRESETS
    if (presets.length === 0) return true
    const selected = sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset
    return typeof selected === 'string' && presets.includes(selected)
  }
  const modePresentation = (sessions: Context['sessions']) => ({
    enabled: (sessionId: SessionId) => enabled(sessions, sessionId),
    subscribe: (listener: () => void) => {
      const offSessions = sessions.list.subscribe(listener)
      const offPresets = config.activePresets.subscribe(listener)
      return () => { offSessions(); offPresets() }
    },
  })
  ctx.inject(['chatChangedFiles', 'sessions'], (scope) => {
    scope.effect(() => scope.chatChangedFiles.register(modePresentation(scope.sessions)), 'rich-inline: compact changed files')
  })
  ctx.inject(['chatLiveProcess', 'sessions'], (scope) => {
    scope.effect(() => {
      let offProcess: (() => void) | undefined
      const syncProcess = (): void => {
        const activeProcess = config.compactLiveProcess.get() !== false
        if (activeProcess && offProcess === undefined) {
          offProcess = scope.chatLiveProcess.register(modePresentation(scope.sessions))
        } else if (!activeProcess && offProcess !== undefined) {
          offProcess()
          offProcess = undefined
        }
      }
      const offConfig = config.compactLiveProcess.subscribe(syncProcess)
      syncProcess()
      return () => { offConfig(); offProcess?.(); offProcess = undefined }
    }, 'rich-inline: compact live process')
  })
  ctx.inject(['uiSession', 'sessions'], (scope) => {
    scope.effect(() => {
      let offComposer: (() => void) | undefined
      const syncComposer = (): void => {
        const activeQuestions = config.htmlQuestions.get() !== false
        if (activeQuestions && offComposer === undefined) {
          offComposer = scope.slots.inject('conversation.composer', () => scope.slots.register({
            name: 'conversation.composer', locale: 'richInline', priority: -10,
            select: ({ pendingInteraction }: ComposerChainProps): PendingQuestion | null =>
              (pendingInteraction?.kind === 'question' || pendingInteraction?.kind === 'plan-review')
                && enabled(scope.sessions, pendingInteraction.sessionId) ? pendingInteraction : null,
            store: createRichQuestionDraftStore(),
            inject: (sessionId): RichQuestionInjected => ({
              hooks: { appearance },
              keyedHooks: { questionCard: (key) => {
                const pending = scope.uiSession.pendingInteractions.getSnapshot().get(sessionId)
                return (pending?.kind === 'question' || pending?.kind === 'plan-review') && pending.key === key ? pending : undefined
              } },
            }),
          }, RichQuestion))
        } else if (!activeQuestions && offComposer !== undefined) {
          offComposer()
          offComposer = undefined
        }
      }
      const offConfig = config.htmlQuestions.subscribe(syncComposer)
      syncComposer()
      return () => { offConfig(); offComposer?.(); offComposer = undefined }
    }, 'rich-inline: html questions')
  })
  const rpc: RichRpc = {
    mount: async request => unwrap(await remote.mount(request)),
    snapshot: async request => unwrap(await remote.snapshot(request)),
    snapshotIfChanged: async request => unwrap(await remote.snapshotIfChanged(request)),
    reportRender: async request => unwrap(await remote.reportRender(request)),
    saveDraft: async request => unwrap(await remote.saveDraft(request)),
    invoke: async request => unwrap(await remote.invoke(request)),
    status: async request => unwrap(await remote.status(request)),
    registerFile: async request => unwrap(await remote.registerFile(request)),
    applyUpdate: async request => unwrap(await remote.applyUpdate(request)),
    dispose: async (request) => { unwrap(await remote.dispose(request)) },
  }
  const native = nativeRich()
  const copyText = ctx.locale.bind('richInline')
  const sessions = new Map<SessionId, Map<string, RichBlockController>>()
  const controllers = (sessionId: SessionId): Map<string, RichBlockController> => {
    let existing = sessions.get(sessionId)
    if (existing === undefined) { existing = new Map(); sessions.set(sessionId, existing) }
    return existing
  }
  const controller = (sessionId: SessionId, key: string): RichBlockController => {
    const items = controllers(sessionId)
    let existing = items.get(key)
    if (existing === undefined) {
      existing = new RichBlockController(sessionId, rpc, native,
        () => config.pollIntervalMs.get() ?? ABSENT_POLL_INTERVAL_MS,
        appearance.getSnapshot,
        () => ({ text: copyText('copyPart'), image: copyText('copyImage'), copied: copyText('copied'), failed: copyText('copyFailed'),
          ...native?.contentActions === 1 ? { menu: { plain: copyText('copyPlain'), markdown: copyText('copyMarkdown'), copyLink: copyText('copyLink'),
            openLink: copyText('openLink'), more: copyText('moreActions'), selectAll: copyText('selectContent'), openFailed: copyText('openLinkFailed') } } : {} }))
      items.set(key, existing)
    }
    return existing
  }
  ctx.effect(() => appearance.subscribe(() => {
    for (const items of sessions.values()) {
      for (const item of items.values()) void item.restyle().catch((error: unknown) => { console.error('rich-inline restyle failed', error) })
    }
  }), 'rich-inline: restyle open blocks')
  ctx.inject(['configForms'], (scope) => { followSettings(scope, appearance) })
  ctx.effect(() => async () => {
    const outcomes = await Promise.allSettled([...sessions.values()].flatMap(items => [...items.values()].map(item => item.close())))
    sessions.clear()
    for (const result of outcomes) if (result.status === 'rejected') console.error('rich-inline disposal failed', result.reason)
  }, 'rich-inline: lifetimes')
  ctx.slots.inject('conversation.chat.assistant-block', () => ctx.slots.register({
    name: 'conversation.chat.assistant-block', locale: 'richInline',
    select: owner => owner.block.kind !== 'text' ? null : richParts(owner.block.text, owner.streaming || owner.interrupted === true),
    inject: (sessionId): RichInjected => ({
      hooks: { appearance, activePresets: config.activePresets },
      keyedHooks: { rich: key => controller(sessionId, key) },
      open: (key, messageId, blockId) => controller(sessionId, key).open(messageId, blockId),
      close: key => controller(sessionId, key).close(),
      update: (key, discardDraft) => controller(sessionId, key).applyUpdate(discardDraft),
      cancel: (key, actionId) => controller(sessionId, key).cancelAction(actionId),
      addFile: async (key, file) => {
        const uploaded = unwrap(await ctx.fileUpload.upload(sessionId, file, file.name))
        await controller(sessionId, key).registerFile(uploaded.receiptId)
      },
    }),
  }, RichMessage))
}

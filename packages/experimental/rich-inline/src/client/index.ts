/** Opt-in rich message plugin: scoped durable RPC plus native generic HTML rendering. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
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
import type { ThemeSettingsInjected } from './ThemeSettings.tsx'

/** Deployment-configurable durable status refresh cadence. */
export interface Config { readonly pollIntervalMs: number }
/** Validated polling bounds avoid hidden per-deployment timers. */
export const Config = z.object({ pollIntervalMs: z.number().min(250).max(60000).default(1000) })
/** Client integration waits on the generated Host namespace and trusted UI services. */
export const inject = ['slots', 'locale', 'remote', 'fileUpload']

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** @param ctx - browser Cordis context. @param config - validated refresh cadence. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(richRemote)
  ctx.effect(() => disposeRemote, 'rich-inline: remote namespace')
  ctx.effect(() => ctx.locale.register('richInline', { zh, en }), 'rich-inline: dictionaries')
  await ctx.inject(['remote.richInline'], scope => activate(scope, config))
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

async function activate(ctx: Context, config: Config): Promise<void> {
  const remote = ctx.remote.richInline
  const appearance = new RichAppearanceSource(unwrap(await remote.appearance()))
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
      existing = new RichBlockController(sessionId, rpc, native, config.pollIntervalMs, appearance.getSnapshot)
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
      hooks: { appearance },
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

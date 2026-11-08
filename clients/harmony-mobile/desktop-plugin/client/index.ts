/** Session-addressed feedback and fixed controls; mounting dispatches no commands. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { publicFeedback } from './feedback.ts'
import { registerControlPanel } from './control-panel-entry.ts'
import { registerWorkspaceNavigation } from './workspace-navigation.ts'

const zh = { failed: 'Harmony 命令未完成。请先核对本机会话和授权状态，再决定是否重试。', unavailable: 'Harmony 命令已返回，但结果格式无法安全显示。请检查此会话的命令记录。' }
type FeedbackKey = keyof typeof zh
const en: Record<FeedbackKey, string> = { failed: 'The Harmony command did not complete. Check this local Session and its authorization state before deciding whether to retry.', unavailable: 'The Harmony command returned a result that cannot be displayed safely. Inspect this Session’s command record.' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'harmony-feedback': FeedbackKey } }

/** Browser entry owned by the private Harmony package. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile/client'
/** Established client services only; no remote method is added. */
export const inject = ['sessions', 'commandUi', 'locale', 'slots', 'remote', 'remote.commands']
/** @param ctx - browser plugin lifetime. @returns after registering one owned, Session-addressed observer. */
export function apply(ctx: Context): void {
  registerWorkspaceNavigation(ctx)
  registerControlPanel(ctx)
  ctx.effect(() => ctx.locale.register('harmony-feedback', { zh, en }))
  const t = ctx.locale.bind('harmony-feedback')
  ctx.on('command/executed', (sessionId, command, result) => {
    if (command !== 'harmony-pair' && command !== 'harmony-device') return
    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) return
    const conversation = actx.get('conversation')
    if (conversation === undefined) return
    const text = result.kind === 'error' ? t('failed') : publicFeedback(result.text, sessionId) ?? t('unavailable')
    conversation.input.for(actx).notify(result.kind === 'error' ? 'error' : 'info', text)
  })
}

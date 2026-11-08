/** Register plugin settings with controls bound to the retained Session. */
import type { Context } from '@deepseek-ai/cordis'
type SessionId = Parameters<Context['sessions']['scope']>[0]
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ControlModel } from './control-model.ts'
import { ControlPanel, ControlSettings } from './control-panel.tsx'

const zh = {
  tab: '手机连接', noSession: '请先打开一个会话，再管理手机连接',
  title: '手机连接控制', scope: '管理当前会话的手机连接，使用已有配对',
  status: '配对状态', 'route-status': '窗口状态', 'route-start': '准备临时窗口', 'route-confirm': '确认手机公开回执', connect: '连接', reconnect: '手动重连', stop: '停止本地连接',
  workspaceTitle: '手机标准插件工作区', workspaceScope: '独立限时授权，包含本桌面的插件配置、项目路径和可见会话。允许后手机可使用标准插件界面；停止后原生聊天连接仍可继续。', 'workspace-status': '工作区授权状态', 'workspace-allow': '允许手机工作区', 'workspace-stop': '停止工作区授权',
  workspaceDeadline: '上次授权回执的截止时间', workspaceDeadlineReached: '已到截止时间，请查询工作区授权状态。',
  reply: '手机签署的公开回执 JSON', result: '经过过滤的公开结果', pending: '等待命令或正常产品确认，请勿重复提交。', idle: '没有进行中的面板请求。',
  rejected: '命令未完成，请先核对公开状态。', unknown: '请求结果不确定；不会自动重试，请检查状态并完成本地停止。', invalidInput: '公开回执无效或不属于当前窗口，未提交。', unavailable: '结果未通过公开字段校验，不显示原文。', stale: '原会话已结束，未转交其他会话。',
  uncertain: '后续变更已锁定，请检查状态并停止对应的工作区授权或本地连接', firstFailure: '本面板首个失败：', cleanup: '本地停止不等于中转撤销；临时路由仍需独立撤销并核验。',
}
type ControlLocaleKey = keyof typeof zh
const en: Record<ControlLocaleKey, string> = {
  tab: 'Phone connection', noSession: 'Open a conversation to manage the phone connection',
  title: 'Phone connection controls', scope: 'Manage the phone connection for the current conversation using its existing pairing',
  status: 'Binding status', 'route-status': 'Window status', 'route-start': 'Prepare temporary window', 'route-confirm': 'Confirm public phone reply', connect: 'Connect', reconnect: 'Reconnect manually', stop: 'Stop local connection',
  workspaceTitle: 'Standard plugin workspace on phone', workspaceScope: 'A separate temporary grant includes this desktop’s plugin settings, project paths and visible Sessions. Allow it to use standard plugin interfaces on the phone. Stopping this grant keeps the native chat connection available.', 'workspace-status': 'Workspace grant status', 'workspace-allow': 'Allow phone workspace', 'workspace-stop': 'Stop workspace grant',
  workspaceDeadline: 'Last reported workspace grant deadline', workspaceDeadlineReached: 'The reported deadline has passed. Check workspace grant status.',
  reply: 'Public phone-signed reply JSON', result: 'Filtered public result', pending: 'Waiting for the command or its normal confirmation; do not submit again.', idle: 'No panel request is pending.',
  rejected: 'The command did not complete. Check public status first.', unknown: 'The request outcome is unknown. No retry is automatic; inspect status and stop locally.', invalidInput: 'The public reply is invalid or belongs to another window; nothing was submitted.', unavailable: 'The result failed public-field validation; raw output is hidden.', stale: 'The original Session ended; no other Session received the request.',
  uncertain: 'Further changes are locked. Check status and stop the affected workspace grant or local connection.', firstFailure: 'First panel failure:', cleanup: 'Local stop does not revoke relay registration; revoke and verify the temporary route separately.',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'harmony-controls': ControlLocaleKey }
  interface SlotMap {
    /** Session-bound controls inside the Harmony plugin settings tab. */
    'harmony.controls': { kind: 'single'; scope: 'session' }
  }
}
export interface ControlInjection {
  readonly hooks: { readonly control: ControlModel['source'] }
  readonly run: ControlModel['run']
}

/** @param ctx - existing browser plugin context; never creates a credential, Session or connection on mount. */
export function registerControlPanel(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('harmony-controls', { zh, en }))
  const owners = new WeakMap<Context, ControlInjection>()
  const models = new Set<ControlModel>()
  ctx.effect(() => () => { for (const model of models) model.dispose(); models.clear() })
  const t = ctx.locale.bind('harmony-controls')
  ctx.effect(() => ctx.slots.inject('settings.plugins.tab', function* () {
    yield ctx.slots.register({
      name: 'settings.plugins.tab', id: 'harmony-phone', order: 40,
      label: () => t('tab'), locale: 'harmony-controls',
      children: { 'harmony.controls': { kind: 'single', scope: 'session' } },
    }, ControlSettings)
    yield ctx.slots.register({
      name: 'harmony.controls', locale: 'harmony-controls',
      inject: (sessionId: SessionId): ControlInjection => {
        const actx = ctx.sessions.scope(sessionId)
        if (actx === undefined) throw new Error('Harmony controls require a retained Session')
        const session = ctx.sessions.sessionOf(actx)
        if (session === undefined) throw new Error('Harmony controls require the original Session')
        const existing = owners.get(actx)
        if (existing !== undefined) return existing
        const model = new ControlModel({ sessionId, isCurrent: () => ctx.sessions.scope(sessionId) === actx && ctx.sessions.sessionOf(actx) === session, execute: async line => {
          const result = await ctx.remote.commands.execute(sessionId, line, [])
          if (!result.ok) throw result.error
          return result.value?.result
        } })
        models.add(model)
        actx.effect(() => () => { model.dispose(); models.delete(model) })
        const face: ControlInjection = { hooks: { control: model.source }, run: (command, input) => model.run(command, input) }
        owners.set(actx, face)
        return face
      },
    }, ControlPanel)
  }))
}

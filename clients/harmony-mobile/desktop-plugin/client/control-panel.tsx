/** Fixed Session controls; the renderer owns all external subscriptions. */
import { useState } from 'react'
import { closeTopModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ControlInjection } from './control-panel-entry.ts'
import { controlCommands, type ControlSnapshot } from './control-model.ts'
import css from './control-panel.module.css'

type ControlSettingsProps = PropsRuntime<'settings.section'> & PropsLocale<'harmony-controls'> & PropsRenderSlots<'harmony.controls'>
type ControlPanelProps = PropsRuntime<'harmony.controls'> & PropsLocale<'harmony-controls'> & InjectFace<ControlInjection>

/** @param props - settings navigation and the current retained Session binding. @returns controls or guidance without creating a Session. */
export function ControlSettings({ SessionProvider, renderSlot, t }: ControlSettingsProps) {
  return <SessionProvider empty={() => <p>{t('noSession')}</p>}>
    {renderSlot('harmony.controls', {})}
  </SessionProvider>
}

/** @param props - exact Session callbacks, fixed locale and framework-bound transaction snapshot. @returns an inert-until-clicked panel. */
export function ControlPanel({ useControl, run, t }: ControlPanelProps) {
  const state = useControl((value: ControlSnapshot) => value)
  const [reply, setReply] = useState('')
  const busy = state.phase === 'pending'
  const deadline = state.workspaceExpiresAt === null ? null : new Date(state.workspaceExpiresAt)
  return <section className={css.root} data-testid="harmony-controls">
    <h3 className={css.heading}>{t('title')}</h3>
    <div className={css.body}>
      <p>{t('scope')}</p>
      <div className={css.buttons}>
        {controlCommands.filter(command => command !== 'route-confirm' && !command.startsWith('workspace-')).map(command => <button key={command} type="button" data-harmony-action={command} disabled={!state.allowed.includes(command)} onClick={event => {
          if (command === 'route-start' || command === 'connect' || command === 'reconnect') closeTopModal(event.currentTarget.ownerDocument)
          void run(command)
        }}>{t(command)}</button>)}
      </div>
      <label>{t('reply')}<textarea aria-label={t('reply')} autoComplete="off" spellCheck={false} disabled={busy} value={reply} onChange={event => { setReply(event.target.value) }} /></label>
      <button type="button" data-harmony-action="route-confirm" disabled={!state.allowed.includes('route-confirm') || reply.trim() === ''} onClick={() => { void run('route-confirm', reply).then(ok => { if (ok) setReply('') }) }}>{t('route-confirm')}</button>
      <h4>{t('workspaceTitle')}</h4><p>{t('workspaceScope')}</p>
      {state.workspaceState === 'workspace-enabled' && deadline === null && <p role="status">{t('workspaceRemembered')}</p>}
      {deadline !== null && <p role="status">{t('workspaceDeadline')} <time dateTime={deadline.toISOString()}>{deadline.toLocaleString()}</time>
        {state.workspaceState === 'workspace-expired' && <> {t('workspaceDeadlineReached')}</>}
      </p>}
      <div className={css.buttons}>
        {controlCommands.filter(command => command.startsWith('workspace-')).map(command => <button key={command} type="button" data-harmony-action={command} disabled={!state.allowed.includes(command)} onClick={event => {
          if (command === 'workspace-allow' || command === 'workspace-remember') closeTopModal(event.currentTarget.ownerDocument)
          void run(command)
        }}>{t(command)}</button>)}
      </div>
      <p role="status" aria-live="polite">{busy ? t('pending') : t('idle')}</p>
      {state.notice !== null && <p role="alert">{t(state.notice)}</p>}
      {state.uncertain && <p role="alert">{t('uncertain')}</p>}
      {state.firstFailure !== null && <p>{t('firstFailure')} {t(state.firstFailure)}</p>}
      {state.publicText !== '' && <label>{t('result')}<textarea aria-label={t('result')} readOnly value={state.publicText} /></label>}
      <p>{t('cleanup')}</p>
    </div>
  </section>
}

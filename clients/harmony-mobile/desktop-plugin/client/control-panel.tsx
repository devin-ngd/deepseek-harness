/** Fixed Session controls; the renderer owns all external subscriptions. */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ControlInjection } from './control-panel-entry.ts'
import { controlCommands, type ControlSnapshot } from './control-model.ts'
import css from './control-panel.module.css'

type ControlPanelProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'harmony-controls'> & InjectFace<ControlInjection>

/** @param props - exact Session callbacks, fixed locale and framework-bound transaction snapshot. @returns an inert-until-clicked panel. */
export function ControlPanel({ useControl, run, t }: ControlPanelProps) {
  const state = useControl((value: ControlSnapshot) => value)
  const [reply, setReply] = useState('')
  const busy = state.phase === 'pending'
  return <details className={css.root} data-testid="harmony-controls">
    <summary>{t('title')}</summary>
    <div className={css.body}>
      <p>{t('scope')}</p>
      <div className={css.buttons}>
        {controlCommands.filter(command => command !== 'route-confirm').map(command => <button key={command} type="button" data-harmony-action={command} disabled={!state.allowed.includes(command)} onClick={() => { void run(command) }}>{t(command)}</button>)}
      </div>
      <label>{t('reply')}<textarea aria-label={t('reply')} autoComplete="off" spellCheck={false} disabled={busy} value={reply} onChange={event => { setReply(event.target.value) }} /></label>
      <button type="button" data-harmony-action="route-confirm" disabled={!state.allowed.includes('route-confirm') || reply.trim() === ''} onClick={() => { void run('route-confirm', reply).then(ok => { if (ok) setReply('') }) }}>{t('route-confirm')}</button>
      <p role="status" aria-live="polite">{busy ? t('pending') : t('idle')}</p>
      {state.notice !== null && <p role="alert">{t(state.notice)}</p>}
      {state.uncertain && <p role="alert">{t('uncertain')}</p>}
      {state.firstFailure !== null && <p>{t('firstFailure')} {t(state.firstFailure)}</p>}
      {state.publicText !== '' && <label>{t('result')}<textarea aria-label={t('result')} readOnly value={state.publicText} /></label>}
      <p>{t('cleanup')}</p>
    </div>
  </details>
}

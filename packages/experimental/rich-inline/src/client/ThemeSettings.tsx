/** Plugin page section choosing the built-in theme of message-inline interactive content, plus its write notice. */
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { CSSProperties } from 'react'
import { RICH_THEMES, richPaletteProperties } from '../shared/theme.ts'
import type { RichAppearance } from '../shared/theme.ts'
import type { RichThemeMutation, RichThemeSettings } from './appearance.ts'
import type { RichLocaleKey } from './locales.ts'
import css from './ThemeSettings.module.css'

/** Accepted settings, live appearance and write callbacks supplied by the plugin. */
export interface ThemeSettingsInjected {
  hooks: {
    form: ObservableSnapshot<ConfigFormSnapshot<RichThemeSettings>>
    appearance: ObservableSnapshot<RichAppearance>
    mutation: ObservableSnapshot<RichThemeMutation>
  }
  /** @param theme - requested theme. @returns completion after the Host write settles. */
  choose(theme: RichAppearance['theme']): Promise<void>
  dismiss(): void
}

type Face = InjectFace<ThemeSettingsInjected> & PropsLocale<'richInline'>

const LABELS: Readonly<Record<RichAppearance['theme'], RichLocaleKey>> = {
  cyber: 'themeCyber', aurora: 'themeAurora', neon: 'themeNeon', terminal: 'themeTerminal', ember: 'themeEmber', dark: 'themeDark',
  none: 'themeNone',
}
const CHOICES = [...RICH_THEMES, 'none'] as const

/**
 * Render one tile per theme; the selection follows the accepted Host value, never the pending request.
 * @param props - settings hooks, writer and localized copy.
 * @returns the theme section of the plugin's own page.
 */
export function ThemeSettings({ useForm, useAppearance, useMutation, choose, t }: PropsRuntime<'plugins.bundle.config'> & Face) {
  const form = useForm(value => value)
  const accent = useAppearance(value => value.accent)
  const busy = useMutation(value => value.busy)
  const selected = form.status === 'ready' ? form.value?.theme : undefined
  const disabled = form.status !== 'ready' || !form.writable
  return <div className={css.group}>
    <div>
      <h4 className={css.title}>{t('themeTitle')}</h4>
      <p className={css.description}>{t('themeDescription')}</p>
    </div>
    <div className={css.grid} role="group" aria-label={t('themeTitle')} aria-busy={busy}>
      {CHOICES.map(theme => <button key={theme} type="button" className={css.tile} aria-pressed={selected === theme}
        disabled={disabled} onClick={() => { void choose(theme) }}>
        <span className={css.swatch} data-theme={theme} aria-hidden="true"
          style={theme === 'none' ? undefined : richPaletteProperties({ theme, accent }) as CSSProperties}>
          <span className={css.heading}/><span className={css.line}/><span className={css.pill}/>
        </span>
        <span className={css.name}>{t(LABELS[theme])}</span>
      </button>)}
    </div>
  </div>
}

/**
 * Keep the write outcome visible after the user leaves the plugin page.
 * @param props - mutation hook, dismissal and localized copy.
 * @returns the current notice, or nothing.
 */
export function ThemeToast({ useMutation, dismiss, t }: PropsRuntime<'shell.overlay'> & Face) {
  const state = useMutation(value => value)
  if (state.notice === null) return null
  return <Toast key={state.sequence} text={t(state.notice)} onDone={dismiss}
    {...state.notice === 'themeSaved' ? { tone: 'success' as const } : {}} />
}

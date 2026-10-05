/** Live profile appearance shared by previews, guests, trusted chrome and the plugin page theme picker. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RichAppearance } from '../shared/theme.ts'

/** Host profile entry whose volatile `theme` field the plugin page edits. */
export const RICH_SETTINGS_ENTRY = 'rich-inline'

/** Volatile Host fields exposed by the settings form. */
export interface RichThemeSettings { readonly theme: RichAppearance['theme'] }

/** Starts from the Host value read at activation and follows each accepted settings value. */
export class RichAppearanceSource implements ObservableSnapshot<RichAppearance> {
  private value: RichAppearance
  private readonly listeners = new Set<() => void>()

  /** @param initial - Host appearance read when the Client activated. */
  constructor(initial: RichAppearance) { this.value = initial }

  /** @returns the current appearance; the reference changes only when the theme changes. */
  getSnapshot = (): RichAppearance => this.value

  /** @param listener - invoked after each theme change. @returns unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Adopt a theme and notify subscribers; an unchanged theme keeps the snapshot and notifies nobody.
   * @param theme - theme accepted by the Host settings document.
   */
  accept(theme: RichAppearance['theme']): void {
    if (theme === this.value.theme) return
    this.value = { ...this.value, theme }
    for (const listener of this.listeners) {
      try { listener() } catch (error) { console.error('Rich appearance subscriber failed', error) }
    }
  }
}

/** Write state shared by the theme picker and the notice that outlives the plugin page. */
export interface RichThemeMutation {
  busy: boolean
  notice: 'themeSaved' | 'themeFailed' | null
  sequence: number
}

/** Writes the profile theme without publishing an optimistic selection; the picker follows the accepted form value. */
export class RichThemeChoice {
  /** Observable write outcome. */
  readonly state = createSnapshotStore<RichThemeMutation>({ busy: false, notice: null, sequence: 0 })

  /** @param form - Host-owned settings form of the rich-inline entry. */
  constructor(private readonly form: ConfigForm<RichThemeSettings>) {}

  /**
   * Persist one theme; a refusal or transport failure leaves the accepted value selected.
   * @param theme - requested built-in theme, or `none`.
   * @returns completion after the write settles.
   */
  async choose(theme: RichAppearance['theme']): Promise<void> {
    if (this.state.getSnapshot().busy) return
    this.state.update((state) => { state.busy = true; state.notice = null })
    let accepted = false
    try {
      accepted = await this.form.set('theme', theme)
    } catch (_error) {
      // The notice reports the failed write while the form keeps the accepted theme.
    }
    this.state.update((state) => {
      state.busy = false
      state.notice = accepted ? 'themeSaved' : 'themeFailed'
      state.sequence++
    })
  }

  /** Clear the displayed write notice. */
  dismiss(): void {
    this.state.update((state) => { state.notice = null })
  }
}

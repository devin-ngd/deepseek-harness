// @vitest-environment jsdom
/** The plugin page theme picker follows the accepted Host value, including refused and unavailable writes. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ComponentProps } from 'react'
import { ThemeSettings, ThemeToast } from '../src/client/ThemeSettings.tsx'
import { RichAppearanceSource, RichThemeChoice } from '../src/client/appearance.ts'
import type { RichThemeSettings } from '../src/client/appearance.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function fixture(snapshot: Partial<ConfigFormSnapshot<RichThemeSettings>> = {}) {
  const formState = createSnapshotStore<ConfigFormSnapshot<RichThemeSettings>>({
    status: 'ready', value: { theme: 'cyber' }, base: {}, user: {}, revision: 0, writable: true, ...snapshot,
  })
  const set = vi.fn(async (_field: string, theme: unknown) => {
    formState.update((state) => { state.value = { theme: theme as RichThemeSettings['theme'] } })
    return true
  })
  const form: ConfigForm<RichThemeSettings> = {
    getSnapshot: () => formState.getSnapshot(), subscribe: listener => formState.subscribe(listener),
    set, unset: vi.fn(), mutate: vi.fn(),
  }
  const choice = new RichThemeChoice(form)
  const appearance = new RichAppearanceSource({ theme: 'cyber', accent: 'auto' })
  const face = {
    useForm: bindSnapshotSelector(formState), useAppearance: bindSnapshotSelector(appearance),
    useMutation: bindSnapshotSelector(choice.state),
    choose: (theme: RichThemeSettings['theme']) => choice.choose(theme), dismiss: () => { choice.dismiss() },
    t: (key: keyof typeof en) => en[key],
  }
  return {
    set, choice,
    picker: { ...face, view: 'page' } as ComponentProps<typeof ThemeSettings>,
    toast: face as ComponentProps<typeof ThemeToast>,
  }
}

const tile = (name: string) => within(screen.getByRole('group', { name: en.themeTitle })).getByRole('button', { name })

it('heads its plugin page section and offers every built-in theme plus off', () => {
  render(<ThemeSettings {...fixture().picker} />)
  expect(screen.getByRole('heading', { name: en.themeTitle })).toBeTruthy()
  expect(screen.getByText(en.themeDescription)).toBeTruthy()
  const names = within(screen.getByRole('group', { name: en.themeTitle })).getAllByRole('button').map(button => button.textContent)
  expect(names).toEqual([en.themeCyber, en.themeAurora, en.themeNeon, en.themeTerminal, en.themeEmber, en.themeDark, en.themeNone])
  expect(tile(en.themeCyber).getAttribute('aria-pressed')).toBe('true')
})

it('selects a theme only after the Host accepts it and keeps the notice after the page unmounts', async () => {
  const { picker, toast, set } = fixture()
  const page = render(<ThemeSettings {...picker} />)
  render(<ThemeToast {...toast} />)
  fireEvent.click(tile(en.themeAurora))
  await waitFor(() => { expect(tile(en.themeAurora).getAttribute('aria-pressed')).toBe('true') })
  expect(set).toHaveBeenCalledWith('theme', 'aurora')
  expect(tile(en.themeCyber).getAttribute('aria-pressed')).toBe('false')
  page.unmount()
  expect(screen.getByText(en.themeSaved)).toBeTruthy()
})

it.each(['refused', 'rejected'] as const)('keeps the accepted theme after a %s write', async (failure) => {
  const { picker, toast, set } = fixture()
  if (failure === 'refused') set.mockResolvedValue(false)
  else set.mockRejectedValue(new Error('Disconnected'))
  render(<><ThemeSettings {...picker} /><ThemeToast {...toast} /></>)
  fireEvent.click(tile(en.themeNeon))
  await screen.findByText(en.themeFailed)
  expect(tile(en.themeCyber).getAttribute('aria-pressed')).toBe('true')
  expect(tile(en.themeNeon).getAttribute('aria-pressed')).toBe('false')
})

it('marks the picker busy while a write is pending and clears the notice on dismissal', async () => {
  const { picker, toast, set, choice } = fixture()
  const pending = Promise.withResolvers<boolean>()
  set.mockReturnValue(pending.promise)
  render(<><ThemeSettings {...picker} /><ThemeToast {...toast} /></>)
  fireEvent.click(tile(en.themeEmber))
  await waitFor(() => { expect(screen.getByRole('group', { name: en.themeTitle }).getAttribute('aria-busy')).toBe('true') })
  pending.resolve(true)
  await screen.findByText(en.themeSaved)
  expect(screen.getByRole('group', { name: en.themeTitle }).getAttribute('aria-busy')).toBe('false')
  choice.dismiss()
  await waitFor(() => { expect(screen.queryByText(en.themeSaved)).toBeNull() })
})

it.each([
  ['read-only', { writable: false }, en.themeCyber],
  ['loading', { status: 'loading' as const, value: undefined }, undefined],
])('disables every tile while the form is %s', (_name, snapshot, pressed) => {
  render(<ThemeSettings {...fixture(snapshot).picker} />)
  const buttons = within(screen.getByRole('group', { name: en.themeTitle })).getAllByRole('button')
  expect(buttons.every(button => (button as HTMLButtonElement).disabled)).toBe(true)
  expect(buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent))
    .toEqual(pressed === undefined ? [] : [pressed])
})

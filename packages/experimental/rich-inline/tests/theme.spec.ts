import { describe, expect, it } from 'vitest'
import {
  RICH_CYBER_ACCENTS, RICH_CYBER_ACCENTS_2, RICH_CYBER_CSS, RICH_CYBER_PALETTE, RICH_DARK_CSS, RICH_PALETTE, RICH_THEMES,
  richAccent, richPaletteProperties, richThemeCss,
} from '../src/shared/theme.ts'

describe('built-in theme set', () => {
  it('defines every palette token for every theme so authored CSS follows a theme switch', () => {
    for (const theme of RICH_THEMES) {
      const properties = richPaletteProperties({ theme, accent: 'auto' })
      const css = richThemeCss({ theme, accent: 'auto' })
      for (const name of Object.keys(RICH_PALETTE)) {
        expect(properties[`--rich-${name}`]).toMatch(/^#[0-9a-f]{6}$/u)
        expect(css).toContain(`--rich-${name}: ${properties[`--rich-${name}`]};`)
      }
      expect(css).toContain(`--rich-accent: ${properties['--rich-accent']}; --rich-accent-2: ${properties['--rich-accent-2']};`)
    }
    expect(new Set(RICH_THEMES.map(theme => richThemeCss({ theme, accent: 'auto' }))).size).toBe(RICH_THEMES.length)
  })

  it('keeps each theme accent pair under auto and switches glowing themes to the electric overrides', () => {
    expect(RICH_THEMES.map(theme => richAccent({ theme, accent: 'auto' })))
      .toEqual(['#3dd0ff', '#4ee3b0', '#ff4fd8', '#3dff7a', '#ff9a3d', '#7aaaff'])
    for (const theme of ['aurora', 'neon', 'terminal', 'ember'] as const) {
      expect(richThemeCss({ theme, accent: 'auto' })).not.toContain('\n:root { --rich-accent:')
      const css = richThemeCss({ theme, accent: 'teal' })
      expect(css.trimEnd().endsWith(`:root { --rich-accent: ${RICH_CYBER_ACCENTS.teal}; --rich-accent-2: ${RICH_CYBER_ACCENTS_2.teal}; }`)).toBe(true)
    }
  })

  it('leaves the answer wrapper unframed because the trusted block already draws the card', () => {
    for (const theme of RICH_THEMES) {
      const css = richThemeCss({ theme, accent: 'auto' })
      expect(css).toContain('.rich-answer { position: relative; min-width: 0; }')
      expect(css).not.toMatch(/\.rich-answer(?:::?[a-z-]+)?\s*(?:,[^{]*)?\{[^}]*(?:border|background|box-shadow|padding)/u)
    }
  })

  it('gives terminal a monospace body and cyber its corner brackets outside any card', () => {
    expect(richThemeCss({ theme: 'terminal', accent: 'auto' })).toContain('--rich-font: var(--rich-mono);')
    expect(RICH_CYBER_CSS).toContain(') right 10px top 10px / 14px 2px no-repeat')
    expect(RICH_CYBER_CSS).toContain(') right 10px bottom 10px / 2px 14px no-repeat')
  })

  it('meets WCAG AA contrast for text, filled buttons and input borders under every theme and accent', () => {
    const channel = (value: number): number => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const luminance = (hex: string): number => {
      const [r = 0, g = 0, b = 0] = (hex.slice(1).match(/../gu) ?? []).map(part => channel(Number.parseInt(part, 16)))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: string | undefined, b: string | undefined): number => {
      const x = luminance(a ?? ''), y = luminance(b ?? '')
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    for (const theme of RICH_THEMES) {
      for (const accent of ['auto', 'blue', 'violet', 'teal'] as const) {
        const p = richPaletteProperties({ theme, accent })
        const label = `${theme}/${accent}`
        expect(ratio(p['--rich-text'], p['--rich-bg']), label).toBeGreaterThanOrEqual(7)
        expect(ratio(p['--rich-muted'], p['--rich-surface-raised']), label).toBeGreaterThanOrEqual(4.5)
        expect(ratio(p['--rich-accent-ink'], p['--rich-accent']), label).toBeGreaterThanOrEqual(4.5)
        expect(ratio(p['--rich-accent-ink'], p['--rich-accent-2']), label).toBeGreaterThanOrEqual(4.5)
        expect(ratio(p['--rich-accent'], p['--rich-surface-raised']), label).toBeGreaterThanOrEqual(4.5)
        expect(ratio(p['--rich-control-border'], p['--rich-surface-sunken']), label).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('built-in dark palette', () => {
  it('gives trusted controls the same custom properties that the guest sheet declares', () => {
    const properties = richPaletteProperties({ theme: 'dark', accent: 'teal' })
    expect(properties['--rich-accent']).toBe('#5cd4c0')
    expect(richThemeCss({ theme: 'dark', accent: 'teal' })).toContain('--rich-accent: #5cd4c0')
    for (const [name, value] of Object.entries(RICH_PALETTE)) {
      expect(properties[`--rich-${name}`]).toBe(value)
      expect(RICH_DARK_CSS).toContain(`--rich-${name}: ${value};`)
    }
  })

  it('keeps the graphite sheet free of the cyber overlay', () => {
    expect(richThemeCss({ theme: 'dark', accent: 'blue' })).toBe(RICH_DARK_CSS)
    expect(RICH_DARK_CSS).not.toContain('background-clip: text')
    expect(RICH_DARK_CSS).toContain('--rich-radius: 12px;')
  })
})

describe('built-in cyber palette', () => {
  it('shares every palette token with the graphite sheet so authored CSS works under either theme', () => {
    expect(Object.keys(RICH_CYBER_PALETTE)).toEqual(Object.keys(RICH_PALETTE))
    const properties = richPaletteProperties({ theme: 'cyber', accent: 'blue' })
    for (const [name, value] of Object.entries(RICH_CYBER_PALETTE)) {
      expect(properties[`--rich-${name}`]).toBe(value)
      expect(RICH_CYBER_CSS).toContain(`--rich-${name}: ${value};`)
    }
    expect(properties['--rich-accent']).toBe(RICH_CYBER_ACCENTS.blue)
    expect(properties['--rich-accent-2']).toBe(RICH_CYBER_ACCENTS_2.blue)
  })

  it('applies the profile accent pair and lets the last authored declaration win', () => {
    expect(richThemeCss({ theme: 'cyber', accent: 'blue' })).toBe(RICH_CYBER_CSS)
    for (const accent of ['violet', 'teal'] as const) {
      const css = richThemeCss({ theme: 'cyber', accent })
      expect(css.startsWith(RICH_CYBER_CSS)).toBe(true)
      expect(css.trimEnd().endsWith(`:root { --rich-accent: ${RICH_CYBER_ACCENTS[accent]}; --rich-accent-2: ${RICH_CYBER_ACCENTS_2[accent]}; }`)).toBe(true)
      expect(richAccent({ theme: 'cyber', accent })).toBe(RICH_CYBER_ACCENTS[accent])
    }
  })

  it('layers the tech overlay on the shared structure and keeps body text without glow', () => {
    expect(RICH_CYBER_CSS).toContain('.rich-steps > li:last-child::after { display: none; }')
    expect(RICH_CYBER_CSS).toContain('--rich-radius: 10px;')
    expect(RICH_CYBER_CSS).toContain(':where(h1:not(:has(*)))')
    expect(RICH_CYBER_CSS).toContain('@media (forced-colors: active)')
    expect(RICH_CYBER_CSS).not.toMatch(/(?:^|\n)(?:body|:where\(p\))[^{]*\{[^}]*text-shadow/)
  })

  it('disables built-in CSS for none while lookups keep valid graphite colors', () => {
    expect(richThemeCss({ theme: 'none', accent: 'violet' })).toBe('')
    expect(richAccent({ theme: 'none', accent: 'violet' })).toBe('#b49cff')
    expect(richPaletteProperties({ theme: 'none', accent: 'blue' })['--rich-bg']).toBe(RICH_PALETTE.bg)
  })
})

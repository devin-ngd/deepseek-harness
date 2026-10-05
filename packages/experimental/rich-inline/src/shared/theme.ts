/**
 * Browser-safe appearance shared by authoring guidance, inert previews and executable guests.
 * Every built-in theme is a dark sheet over the same token and class names; `cyber` is the default and `none` disables
 * built-in styling.
 */
export const RICH_THEMES = ['cyber', 'aurora', 'neon', 'terminal', 'ember', 'dark'] as const

/** One built-in dark sheet. */
export type RichThemeName = typeof RICH_THEMES[number]

/** Profile appearance; `accent: auto` keeps the accent pair designed for the selected theme. */
export interface RichAppearance {
  readonly theme: RichThemeName | 'none'
  readonly accent: 'auto' | 'blue' | 'violet' | 'teal'
}

/** Profile accent override that replaces a theme's own accent pair. */
export type RichAccentOverride = Exclude<RichAppearance['accent'], 'auto'>

/** Graphite accents keep dark ink readable on filled buttons and accent text readable on every palette surface. */
export const RICH_ACCENTS = {
  blue: '#7aaaff', violet: '#b49cff', teal: '#5cd4c0',
} satisfies Record<RichAccentOverride, string>

/** Graphite secondary hues, so content authored with `--rich-accent-2` keeps a sensible pair under `dark`. */
export const RICH_ACCENTS_2 = {
  blue: '#b49cff', violet: '#7aaaff', teal: '#7aaaff',
} satisfies Record<RichAccentOverride, string>

/** Electric accent overrides for every glowing theme; dark ink stays readable on fills and accent text on their surfaces. */
export const RICH_CYBER_ACCENTS = {
  blue: '#3dd0ff', violet: '#b28dff', teal: '#2ee8c6',
} satisfies Record<RichAccentOverride, string>

/** Secondary hue paired with each electric accent for gradients and edge light; dark ink stays readable on it. */
export const RICH_CYBER_ACCENTS_2 = {
  blue: '#8b7bff', violet: '#4cc2ff', teal: '#4d9bff',
} satisfies Record<RichAccentOverride, string>

/** Graphite palette shared by guest documents and the trusted controls around them; each key names a `--rich-<key>` custom property. */
export const RICH_PALETTE = {
  'bg': '#121317', 'surface': '#191b20', 'surface-raised': '#22252c', 'surface-sunken': '#0d0e11',
  'text': '#e3e5ea', 'text-strong': '#f6f7f9', 'muted': '#9a9fab',
  'border': '#2a2d35', 'border-strong': '#3a3e48', 'control-border': '#61687a',
  'accent-ink': '#0b0f19', 'positive': '#6dd3a0', 'warning': '#f0c46c', 'danger': '#ff8f9a',
  'chart-2': '#5cd4c0', 'chart-3': '#b49cff', 'chart-4': '#f0c46c',
} as const

/** Token values for one built-in theme; every theme defines the same keys so authored CSS follows a theme switch. */
export type RichPalette = Readonly<Record<keyof typeof RICH_PALETTE, string>>

/** Deep-space cyber palette. */
export const RICH_CYBER_PALETTE = {
  'bg': '#070b14', 'surface': '#0c1220', 'surface-raised': '#141c2e', 'surface-sunken': '#04070d',
  'text': '#d6e2f3', 'text-strong': '#f3f8ff', 'muted': '#8494b0',
  'border': '#1b2740', 'border-strong': '#2a3a5c', 'control-border': '#4d6898',
  'accent-ink': '#020d16', 'positive': '#3ee8a5', 'warning': '#ffc857', 'danger': '#ff6b8b',
  'chart-2': '#2ee8c6', 'chart-3': '#a98bff', 'chart-4': '#ffc857',
} as const satisfies RichPalette

/** Polar-night aurora palette: teal-black surfaces under green and violet light. */
export const RICH_AURORA_PALETTE = {
  'bg': '#071318', 'surface': '#0c1b22', 'surface-raised': '#13262f', 'surface-sunken': '#040c10',
  'text': '#d5e7e6', 'text-strong': '#f1fbfa', 'muted': '#86a3a4',
  'border': '#173039', 'border-strong': '#24444f', 'control-border': '#44707a',
  'accent-ink': '#021412', 'positive': '#5ee6a8', 'warning': '#f3cd6b', 'danger': '#ff7d96',
  'chart-2': '#7c9cff', 'chart-3': '#c08bff', 'chart-4': '#f3cd6b',
} as const satisfies RichPalette

/** Synthwave neon palette: violet-black surfaces with magenta and cyan tubes. */
export const RICH_NEON_PALETTE = {
  'bg': '#0d0718', 'surface': '#150c24', 'surface-raised': '#1f1433', 'surface-sunken': '#080410',
  'text': '#e6dcf5', 'text-strong': '#fbf7ff', 'muted': '#9c8fb8',
  'border': '#2a1c42', 'border-strong': '#3d2a5e', 'control-border': '#6a4f96',
  'accent-ink': '#1a0414', 'positive': '#4df0b0', 'warning': '#ffd36b', 'danger': '#ff6b6b',
  'chart-2': '#36e4ff', 'chart-3': '#ffb86b', 'chart-4': '#b6ff5c',
} as const satisfies RichPalette

/** Phosphor terminal palette: green-black surfaces and monospace text. */
export const RICH_TERMINAL_PALETTE = {
  'bg': '#050a06', 'surface': '#09120b', 'surface-raised': '#0f1d12', 'surface-sunken': '#030604',
  'text': '#c6e8cc', 'text-strong': '#ecfff0', 'muted': '#7fa088',
  'border': '#16301c', 'border-strong': '#22472b', 'control-border': '#3e7a4c',
  'accent-ink': '#031207', 'positive': '#5ef08a', 'warning': '#ffcf5c', 'danger': '#ff6e6e',
  'chart-2': '#2ee6d6', 'chart-3': '#ffcf5c', 'chart-4': '#c49bff',
} as const satisfies RichPalette

/** Ember palette: warm charcoal surfaces with amber and rose light. */
export const RICH_EMBER_PALETTE = {
  'bg': '#110b08', 'surface': '#19110c', 'surface-raised': '#241912', 'surface-sunken': '#0a0604',
  'text': '#ece0d6', 'text-strong': '#fff8f2', 'muted': '#a8978a',
  'border': '#2e2119', 'border-strong': '#433026', 'control-border': '#7a5d4a',
  'accent-ink': '#1a0a02', 'positive': '#7ed99b', 'warning': '#ffd166', 'danger': '#ff7070',
  'chart-2': '#ffd166', 'chart-3': '#7ed6c4', 'chart-4': '#c3a6ff',
} as const satisfies RichPalette

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", '
  + '"Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'
/** CJK fonts replace the generic `monospace` family, which Windows maps to SimSun for Chinese code text. */
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, "PingFang SC", "Microsoft YaHei"'
const declarations = (palette: Readonly<Record<string, string>>): string => Object.entries(palette).map(([name, value]) => `--rich-${name}: ${value};`).join(' ')
const TEXT_FIELDS = ['input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=hidden], [type=button], [type=submit], [type=reset], [type=image])', 'select', 'textarea']
const BUTTONS = ['button', 'input[type=button]', 'input[type=submit]', 'input[type=reset]']
/** State pseudo-classes stay inside `:where()` so any authored selector overrides the base sheet. */
const each = (selectors: readonly string[], state = ''): string => `:where(${selectors.map(selector => selector + state).join(', ')})`

/** Shared structural sheet; each built-in theme supplies its palette and default accent pair. */
const baseSheet = (palette: Readonly<Record<string, string>>, accent: string, accent2: string): string => String.raw`
:root {
  color-scheme: dark;
  ${declarations(palette)}
  --rich-accent: ${accent}; --rich-accent-2: ${accent2};
  --rich-radius: 12px; --rich-radius-sm: 8px; --rich-gap: 16px;
  --rich-font: ${FONT};
  --rich-mono: ${MONO};
  --dsw-alias-label-primary: var(--rich-text); --dsw-alias-label-secondary: var(--rich-muted);
  --dsw-alias-interactive-bg-hover: var(--rich-surface-raised); --dsw-radius-sm: var(--rich-radius);
  scrollbar-color: var(--rich-border-strong) transparent; scrollbar-width: thin;
}
:where(*, *::before, *::after) { box-sizing: border-box; }
body {
  margin: 0; color: var(--rich-text); color-scheme: dark;
  background: radial-gradient(720px 220px at 0 0, color-mix(in srgb, var(--rich-accent) 6%, transparent), transparent 72%) no-repeat, var(--rich-bg);
  font: 14px/1.65 var(--rich-font); letter-spacing: .005em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow-wrap: anywhere;
}
::selection { background: color-mix(in srgb, var(--rich-accent) 34%, transparent); color: var(--rich-text-strong); }
[data-rich-content-root] { padding: clamp(16px, 3vw, 22px); min-width: 0; display: flow-root; }
[hidden] { display: none !important; }
:where(h1, h2, h3, h4, h5, h6) { margin: 0 0 10px; color: var(--rich-text-strong); font-weight: 600; line-height: 1.35; letter-spacing: -.01em; text-wrap: balance; }
:where(h1) { font-size: 22px; line-height: 1.3; letter-spacing: -.02em; }
:where(h2) { font-size: 18px; }
:where(h3) { font-size: 15px; }
:where(h4, h5, h6) { font-size: 14px; }
:where(p, ul, ol, dl, blockquote, pre, figure, table, fieldset, details, .rich-answer, .rich-callout, .rich-table-wrap, .rich-list, .rich-steps, .rich-grid) { margin: 0 0 12px; }
:where(:not(h1, h2, h3, h4, h5, h6) + :is(h2, h3, h4)) { margin-top: 24px; }
:where(.rich-grid, .rich-form, .rich-row, .rich-actions, .rich-tabs) > * { margin-block: 0; }
:where(body *) > :where(:first-child) { margin-top: 0; }
:where(body *) > :where(:last-child) { margin-bottom: 0; }
:where(ul, ol) { padding-inline-start: 1.4em; }
:where(li + li) { margin-top: 4px; }
:where(li)::marker { color: var(--rich-muted); }
:where(strong, b) { font-weight: 600; color: var(--rich-text-strong); }
:where(dt) { font-weight: 600; color: var(--rich-text-strong); }
:where(dd) { margin: 2px 0 10px; color: var(--rich-muted); }
:where(small, figcaption, caption) { color: var(--rich-muted); font-size: 12.5px; }
:where(figcaption) { margin-top: 8px; }
:where(a) { color: var(--rich-accent); text-decoration: underline 1px color-mix(in srgb, var(--rich-accent) 40%, transparent); text-underline-offset: 3px; }
:where(a:hover) { text-decoration-color: currentColor; }
:where(hr) { height: 1px; border: 0; margin: 20px 0; background: var(--rich-border); }
:where(blockquote) { margin-inline: 0; padding: 10px 16px; border-inline-start: 2px solid var(--rich-accent); border-radius: 0 var(--rich-radius-sm) var(--rich-radius-sm) 0; background: var(--rich-surface); color: var(--rich-muted); }
:where(code, kbd, samp, pre) { font-family: var(--rich-mono); font-size: .9em; }
:where(:not(pre) > code, kbd, samp) { padding: .1em .4em; border: 1px solid var(--rich-border); border-radius: 5px; background: var(--rich-surface-raised); color: var(--rich-text-strong); }
:where(kbd) { border-bottom-width: 2px; font-size: .82em; }
:where(pre) { padding: 14px 16px; border: 1px solid var(--rich-border); border-radius: 10px; background: var(--rich-surface-sunken); overflow: auto; white-space: pre; overflow-wrap: normal; font-size: 12.5px; line-height: 1.6; tab-size: 2; }
:where(pre code, pre kbd, pre samp) { font-size: inherit; }
:where(mark) { padding: 0 .2em; border-radius: 3px; background: color-mix(in srgb, var(--rich-warning) 28%, transparent); color: var(--rich-text-strong); }
:where(img, video, canvas, svg) { max-width: 100%; }
:where(img, video) { height: auto; border-radius: var(--rich-radius-sm); }
:where(figure) { min-width: 0; }
:where(output) { color: var(--rich-text-strong); font-variant-numeric: tabular-nums; }
:where(button, input, select, textarea) { font: inherit; color: inherit; letter-spacing: inherit; }
${each(TEXT_FIELDS)} {
  width: 100%; min-width: 0; min-height: 38px; padding: 8px 12px; border: 1px solid var(--rich-control-border); border-radius: var(--rich-radius-sm);
  background-color: var(--rich-surface-sunken); color: var(--rich-text-strong); font-size: 14px; font-weight: 400;
  transition: border-color .15s, box-shadow .15s;
}
${each(TEXT_FIELDS, ':hover')} { border-color: color-mix(in srgb, var(--rich-control-border), var(--rich-text) 25%); }
:where(select) {
  appearance: none; padding-inline-end: 34px; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--rich-muted) 50%), linear-gradient(135deg, var(--rich-muted) 50%, transparent 50%);
  background-position: calc(100% - 18px) 52%, calc(100% - 13px) 52%; background-size: 5px 5px; background-repeat: no-repeat;
}
:where(option, optgroup) { background: var(--rich-surface); color: var(--rich-text); }
:where(textarea) { min-height: 96px; resize: vertical; line-height: 1.55; }
:where(input, textarea)::placeholder { color: var(--rich-muted); opacity: .75; }
:where(input[type=checkbox], input[type=radio]) { width: 16px; height: 16px; margin: 0; accent-color: var(--rich-accent); cursor: pointer; }
:where(input[type=range], progress, meter) { accent-color: var(--rich-accent); }
:where(input[type=range]) { width: 100%; }
:where(progress) { appearance: none; width: 100%; height: 6px; border: 0; border-radius: 999px; background: var(--rich-surface-raised); overflow: hidden; vertical-align: middle; }
:where(progress)::-webkit-progress-bar { background: var(--rich-surface-raised); }
:where(progress)::-webkit-progress-value { border-radius: 999px; background: var(--rich-accent); }
:where(label) { display: block; color: var(--rich-text-strong); font-size: 13px; font-weight: 500; }
:where(label:has(> input[type=checkbox], > input[type=radio])) { display: flex; align-items: center; gap: 8px; color: var(--rich-text); font-size: 14px; font-weight: 400; cursor: pointer; }
:where(label > input, label > select, label > textarea) { margin-top: 6px; }
:where(label > input[type=checkbox], label > input[type=radio]) { margin-top: 0; }
:where(fieldset) { min-width: 0; padding: 12px 16px 16px; border: 1px solid var(--rich-border); border-radius: var(--rich-radius); }
:where(legend) { padding: 0 6px; color: var(--rich-muted); font-size: 12px; font-weight: 600; }
${each(BUTTONS)} {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 6px 14px;
  border: 1px solid var(--rich-border-strong); border-radius: var(--rich-radius-sm); background: var(--rich-surface-raised); color: var(--rich-text-strong);
  font-size: 13.5px; font-weight: 500; line-height: 1.3; text-align: center; cursor: pointer;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--rich-text-strong) 4%, transparent);
}
:where(input[type=file])::file-selector-button {
  margin-inline-end: 10px; padding: 6px 12px; border: 1px solid var(--rich-border-strong); border-radius: var(--rich-radius-sm);
  background: var(--rich-surface-raised); color: var(--rich-text-strong); font: inherit; cursor: pointer;
}
${each(BUTTONS, ':hover:not(:disabled)')} { background: color-mix(in srgb, var(--rich-surface-raised), var(--rich-text-strong) 7%); border-color: color-mix(in srgb, var(--rich-border-strong), var(--rich-text-strong) 12%); }
${each(BUTTONS, ':active:not(:disabled)')} { background: var(--rich-surface); }
${each(['button', 'input', 'select', 'textarea'], ':disabled')} { opacity: .5; cursor: not-allowed; }
:where(:focus-visible) { outline: 2px solid var(--rich-accent); outline-offset: 2px; }
${each(TEXT_FIELDS, ':focus-visible')} { outline: 2px solid transparent; outline-offset: 0; border-color: var(--rich-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--rich-accent) 24%, transparent); }
:where(details) { padding: 0 16px; border: 1px solid var(--rich-border); border-radius: var(--rich-radius); background: var(--rich-surface); }
:where(details[open]) { padding-bottom: 14px; }
:where(summary) {
  display: flex; align-items: center; gap: 10px; margin: 0 -16px; padding: 11px 16px; border-radius: calc(var(--rich-radius) - 1px);
  color: var(--rich-text-strong); font-weight: 500; list-style: none; cursor: pointer;
}
:where(summary)::-webkit-details-marker { display: none; }
:where(summary)::before {
  content: ''; flex: none; width: 6px; height: 6px; margin-inline: 2px 1px;
  border-inline-end: 1.5px solid var(--rich-muted); border-bottom: 1.5px solid var(--rich-muted); transform: rotate(-45deg); transition: transform .15s;
}
:where(summary:hover) { background: color-mix(in srgb, var(--rich-text) 4%, transparent); }
:where(details[open] > summary) { margin-bottom: 12px; border-bottom: 1px solid var(--rich-border); border-end-start-radius: 0; border-end-end-radius: 0; }
:where(details[open] > summary)::before { transform: rotate(45deg); }
:where(table) { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
:where(caption) { padding-bottom: 8px; text-align: start; }
:where(th, td) { padding: 10px 14px; border-bottom: 1px solid var(--rich-border); text-align: start; vertical-align: top; }
:where(thead th) { background: color-mix(in srgb, var(--rich-text) 3%, transparent); color: var(--rich-muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; }
:where(tbody th) { color: var(--rich-text-strong); font-weight: 600; }
:where(tbody tr:hover) > :where(th, td) { background: color-mix(in srgb, var(--rich-text) 3%, transparent); }
:where(tbody tr:last-child) > :where(th, td) { border-bottom: 0; }
:where([data-rich-content-root] > header, [data-rich-content-root] > .rich-answer > header) { margin-bottom: 20px; }
.rich-stack > * + * { margin-top: var(--rich-gap); }
.rich-row, .rich-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.rich-row { justify-content: space-between; gap: 12px; }
.rich-grid, .rich-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--rich-gap); }
.rich-form { gap: 14px var(--rich-gap); }
.rich-card { position: relative; min-width: 0; padding: 16px 18px; border: 1px solid var(--rich-border); border-radius: var(--rich-radius); background-color: var(--rich-surface); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--rich-text-strong) 3%, transparent); }
.rich-answer { position: relative; min-width: 0; }
.rich-callout::before { content: ''; position: absolute; inset-block: 14px; inset-inline-start: -1px; width: 3px; border-radius: 0 3px 3px 0; background: var(--rich-accent); }
.rich-section { margin-top: 24px; }
.rich-eyebrow { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--rich-accent); font-size: 12px; font-weight: 600; line-height: 1.4; letter-spacing: .06em; text-transform: uppercase; }
.rich-eyebrow::before { content: ''; flex: none; width: 14px; height: 2px; border-radius: 2px; background: currentColor; }
.rich-lead { font-size: 15.5px; line-height: 1.7; }
.rich-muted { color: var(--rich-muted); font-size: 13px; }
.rich-sources { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--rich-border); color: var(--rich-muted); font-size: 12.5px; }
.rich-sources :where(a) { color: inherit; }
.rich-sources :where(a:hover) { color: var(--rich-accent); }
.rich-value { margin: 4px 0; color: var(--rich-text-strong); font-size: 28px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.rich-badge {
  display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border: 1px solid var(--rich-border-strong); border-radius: 999px;
  background: color-mix(in srgb, var(--rich-text) 5%, transparent); color: var(--rich-muted); font-size: 11.5px; font-weight: 500; line-height: 1; white-space: nowrap; vertical-align: middle;
}
.rich-badge:where(.rich-success, .rich-warning, .rich-danger) { border-color: color-mix(in srgb, var(--rich-accent) 36%, transparent); background: color-mix(in srgb, var(--rich-accent) 12%, transparent); color: var(--rich-accent); }
.rich-badge + :where(h1, h2, h3, h4, p, div) { margin-top: 10px; }
.rich-primary { border-color: transparent; background: var(--rich-accent); color: var(--rich-accent-ink); font-weight: 600; box-shadow: inset 0 1px 0 color-mix(in srgb, white 28%, transparent), 0 6px 16px -8px color-mix(in srgb, var(--rich-accent) 70%, transparent); }
.rich-primary:hover:not(:disabled) { border-color: transparent; background: color-mix(in srgb, var(--rich-accent), white 14%); }
.rich-primary:active:not(:disabled) { background: color-mix(in srgb, var(--rich-accent), black 8%); }
.rich-tabs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--rich-border); border-radius: 10px; background: var(--rich-surface-sunken); }
.rich-tabs > :where(button, [role=tab]) { min-height: 30px; padding: 4px 12px; border-color: transparent; border-radius: 7px; background: transparent; box-shadow: none; color: var(--rich-muted); }
.rich-tabs > :where(button:hover:not(:disabled), [role=tab]:hover) { border-color: transparent; background: color-mix(in srgb, var(--rich-text) 6%, transparent); color: var(--rich-text-strong); }
.rich-tabs > :where([aria-selected=true], [aria-pressed=true]) {
  border-color: var(--rich-border-strong); background: var(--rich-surface-raised); color: var(--rich-text-strong); font-weight: 600; box-shadow: 0 1px 2px color-mix(in srgb, black 40%, transparent);
}
.rich-callout { position: relative; padding: 12px 16px 12px 18px; border: 1px solid color-mix(in srgb, var(--rich-accent) 28%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--rich-accent) 8%, var(--rich-bg)); }
.rich-callout::before { inset-block: 10px; }
.rich-warning { --rich-accent: var(--rich-warning); }
.rich-danger { --rich-accent: var(--rich-danger); }
.rich-success { --rich-accent: var(--rich-positive); }
.rich-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid var(--rich-border); border-radius: var(--rich-radius); background: var(--rich-surface); }
.rich-table-wrap > table { min-width: 32rem; margin: 0; }
.rich-list { padding: 0; overflow: hidden; border: 1px solid var(--rich-border); border-radius: var(--rich-radius); background: var(--rich-surface); list-style: none; }
.rich-list > li { margin: 0; padding: 12px 16px; }
.rich-list > li:not([hidden]) ~ li { border-top: 1px solid var(--rich-border); }
.rich-list > li:hover { background: color-mix(in srgb, var(--rich-text) 3%, transparent); }
.rich-steps { padding: 0; list-style: none; counter-reset: rich-step; }
.rich-steps > li { position: relative; min-height: 26px; margin: 0; padding: 1px 0 18px; padding-inline-start: 40px; counter-increment: rich-step; }
.rich-steps > li::before {
  content: counter(rich-step); position: absolute; inset-inline-start: 0; top: 0; display: grid; place-items: center; width: 26px; height: 26px;
  border: 1px solid color-mix(in srgb, var(--rich-accent) 42%, transparent); border-radius: 50%; background: color-mix(in srgb, var(--rich-accent) 14%, var(--rich-bg));
  color: var(--rich-accent); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
}
.rich-steps > li::after { content: ''; position: absolute; inset-inline-start: 12.5px; top: 32px; bottom: 6px; width: 1px; background: var(--rich-border-strong); }
.rich-steps > li:last-child { padding-bottom: 0; }
.rich-steps > li:last-child::after { display: none; }
@media (max-width: 480px) {
  :where(h1) { font-size: 20px; }
  .rich-card { padding: 14px 16px; }
  .rich-actions > :where(button) { flex: 1 1 auto; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
`

/** Calm graphite CSS for `theme: dark`. Generated CSS follows this sheet and may override tokens or rules. */
export const RICH_DARK_CSS = baseSheet(RICH_PALETTE, RICH_ACCENTS.blue, RICH_ACCENTS_2.blue)

/** Translucent tint of one `--rich-*` token; glows read the live accent so tone classes and per-block overrides follow. */
const tint = (token: string, percent: number): string => `color-mix(in srgb, var(--rich-${token}) ${percent}%, transparent)`
const EDGE_LIGHT = `linear-gradient(90deg, transparent, ${tint('accent', 85)} 30%, ${tint('accent-2', 75)} 70%, transparent)`
const BRACKET = `linear-gradient(${tint('accent', 60)}, ${tint('accent', 60)})`

/**
 * Accent light shared by every glowing theme. Rules keep the base selectors' low specificity and fill backgrounds with a
 * color plus a translucent image, so authored `background-color`, tokens and rules still win. Body text never glows.
 */
const GLOW_OVERLAY = String.raw`
:root { scrollbar-color: color-mix(in srgb, var(--rich-accent) 30%, var(--rich-border-strong)) transparent; }
::selection { background: ${tint('accent', 30)}; }
:where(a:hover) { text-shadow: 0 0 12px ${tint('accent', 55)}; }
:where(hr) { background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--rich-accent) 45%, var(--rich-border-strong)), transparent); }
:where(blockquote) { background-color: var(--rich-surface); background-image: linear-gradient(90deg, ${tint('accent', 8)}, transparent 60%); }
:where(:not(pre) > code) { border-color: color-mix(in srgb, var(--rich-accent) 24%, var(--rich-border)); background: color-mix(in srgb, var(--rich-accent) 9%, var(--rich-surface-raised)); color: color-mix(in srgb, var(--rich-accent) 45%, var(--rich-text-strong)); }
:where(pre) {
  border-color: color-mix(in srgb, var(--rich-accent) 18%, var(--rich-border)); background-color: var(--rich-surface-sunken);
  background-image: linear-gradient(180deg, ${tint('accent', 6)}, transparent 56px); box-shadow: inset 0 1px 0 ${tint('accent', 16)};
}
:where(progress)::-webkit-progress-value { background: linear-gradient(90deg, var(--rich-accent), var(--rich-accent-2)); box-shadow: 0 0 10px ${tint('accent', 60)}; }
${each(TEXT_FIELDS)} { box-shadow: inset 0 1px 2px color-mix(in srgb, black 35%, transparent); }
${each(TEXT_FIELDS, ':hover')} { border-color: color-mix(in srgb, var(--rich-control-border), var(--rich-accent) 35%); }
${each(TEXT_FIELDS, ':focus-visible')} { box-shadow: 0 0 0 3px ${tint('accent', 22)}, 0 0 20px -4px ${tint('accent', 55)}; }
:where(fieldset) { border-color: color-mix(in srgb, var(--rich-accent) 16%, var(--rich-border)); }
:where(legend) { color: color-mix(in srgb, var(--rich-accent) 55%, var(--rich-muted)); }
${each(BUTTONS)} {
  border-color: color-mix(in srgb, var(--rich-accent) 24%, var(--rich-border-strong));
  background-image: linear-gradient(180deg, ${tint('accent', 8)}, transparent);
  box-shadow: inset 0 1px 0 ${tint('accent', 14)};
  transition: border-color .15s, box-shadow .15s, background-color .15s;
}
${each(BUTTONS, ':hover:not(:disabled)')} {
  border-color: color-mix(in srgb, var(--rich-accent) 55%, var(--rich-border-strong));
  background-color: color-mix(in srgb, var(--rich-accent) 10%, var(--rich-surface-raised));
  box-shadow: inset 0 1px 0 ${tint('accent', 22)}, 0 0 16px -4px ${tint('accent', 50)};
}
:where(details) { border-color: color-mix(in srgb, var(--rich-accent) 16%, var(--rich-border)); }
:where(summary)::before { border-color: var(--rich-accent); }
:where(summary:hover) { background: ${tint('accent', 6)}; }
:where(details[open] > summary) { border-bottom-color: color-mix(in srgb, var(--rich-accent) 18%, var(--rich-border)); }
:where(thead th) { border-bottom-color: color-mix(in srgb, var(--rich-accent) 30%, var(--rich-border)); background: ${tint('accent', 6)}; color: color-mix(in srgb, var(--rich-accent) 55%, var(--rich-muted)); }
:where(tbody tr:hover) > :where(th, td) { background: ${tint('accent', 6)}; }
.rich-card, .rich-table-wrap, .rich-list { border-color: color-mix(in srgb, var(--rich-accent) 18%, var(--rich-border)); }
.rich-card {
  background-image: linear-gradient(160deg, ${tint('accent', 7)}, transparent 55%);
  box-shadow: inset 0 1px 0 ${tint('accent', 10)}, 0 14px 32px -22px ${tint('accent', 45)};
}
.rich-card::after { content: ''; position: absolute; inset-inline: 18px; top: -1px; height: 1px; background: ${EDGE_LIGHT}; pointer-events: none; }
.rich-callout::before { box-shadow: 0 0 12px ${tint('accent', 75)}; }
.rich-eyebrow { text-shadow: 0 0 14px ${tint('accent', 45)}; }
.rich-eyebrow::before { width: 18px; background: linear-gradient(90deg, var(--rich-accent), var(--rich-accent-2)); box-shadow: 0 0 8px ${tint('accent', 70)}; }
.rich-value { text-shadow: 0 0 22px ${tint('accent', 45)}; }
.rich-badge {
  border-color: color-mix(in srgb, var(--rich-accent) 32%, var(--rich-border-strong)); background: ${tint('accent', 10)};
  color: color-mix(in srgb, var(--rich-accent) 70%, var(--rich-text));
}
.rich-primary {
  border-color: transparent; background-color: var(--rich-accent); background-image: linear-gradient(120deg, transparent 15%, ${tint('accent-2', 75)});
  color: var(--rich-accent-ink); box-shadow: inset 0 1px 0 color-mix(in srgb, white 35%, transparent), 0 0 0 1px ${tint('accent', 35)}, 0 8px 24px -8px ${tint('accent', 75)};
}
.rich-primary:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--rich-accent), white 12%); background-image: linear-gradient(120deg, transparent 15%, ${tint('accent-2', 75)});
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 40%, transparent), 0 0 0 1px ${tint('accent', 50)}, 0 0 26px -4px ${tint('accent', 75)};
}
.rich-primary:active:not(:disabled) { background-color: color-mix(in srgb, var(--rich-accent), black 8%); }
.rich-tabs { border-color: color-mix(in srgb, var(--rich-accent) 18%, var(--rich-border)); }
.rich-tabs > :where([aria-selected=true], [aria-pressed=true]) {
  border-color: ${tint('accent', 55)}; background: color-mix(in srgb, var(--rich-accent) 16%, var(--rich-surface-raised));
  box-shadow: inset 0 0 12px -6px ${tint('accent', 70)}, 0 0 14px -4px ${tint('accent', 55)};
}
.rich-callout { border-color: ${tint('accent', 36)}; background-color: color-mix(in srgb, var(--rich-accent) 9%, var(--rich-bg)); }
.rich-list > li:hover { background: ${tint('accent', 5)}; }
.rich-steps > li::before { box-shadow: 0 0 0 3px ${tint('accent', 8)}, 0 0 14px -2px ${tint('accent', 55)}; }
.rich-steps > li::after { background: linear-gradient(180deg, ${tint('accent', 55)}, var(--rich-border-strong)); }
.rich-sources { border-top-color: color-mix(in srgb, var(--rich-accent) 18%, var(--rich-border)); }
`

/** Console labels: monospace, tracked uppercase legends, table headers, eyebrows, metrics and badges. */
const CONSOLE_LABELS = String.raw`
:where(legend) { font-family: var(--rich-mono); letter-spacing: .1em; text-transform: uppercase; }
:where(thead th) { font-family: var(--rich-mono); font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; }
.rich-eyebrow { font-family: var(--rich-mono); font-size: 11.5px; letter-spacing: .12em; }
.rich-value { font-family: var(--rich-mono); letter-spacing: -.01em; }
.rich-badge { border-radius: 4px; font-family: var(--rich-mono); font-size: 11px; letter-spacing: .06em; }
.rich-steps > li::before { font-family: var(--rich-mono); }
`

/**
 * Accent-to-accent-2 title text. It needs `color: transparent`, which would hide `currentColor` icons and authored child
 * colors, so only plain-text h1 elements get it.
 */
const GRADIENT_TITLE = String.raw`
:where(h1:not(:has(*))) {
  background: linear-gradient(100deg, var(--rich-text-strong), color-mix(in srgb, var(--rich-accent) 80%, var(--rich-text-strong)) 6em,
    color-mix(in srgb, var(--rich-accent-2) 85%, var(--rich-text-strong)) 16em);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
@media (forced-colors: active) { :where(h1) { background: none; color: CanvasText; } }
`

/** Cyber: deep-space console with a faint top grid and corner brackets on the right edge of the content. */
const CYBER_OVERLAY = GLOW_OVERLAY + CONSOLE_LABELS + String.raw`
:root { --rich-radius: 10px; --rich-radius-sm: 6px; }
body {
  background:
    ${BRACKET} right 10px top 10px / 14px 2px no-repeat, ${BRACKET} right 10px top 10px / 2px 14px no-repeat,
    ${BRACKET} right 10px bottom 10px / 14px 2px no-repeat, ${BRACKET} right 10px bottom 10px / 2px 14px no-repeat,
    radial-gradient(760px 260px at 0 0, ${tint('accent', 16)}, transparent 72%) no-repeat,
    radial-gradient(600px 240px at 100% 0, ${tint('accent-2', 13)}, transparent 72%) no-repeat,
    linear-gradient(transparent, var(--rich-bg) 560px) no-repeat,
    linear-gradient(${tint('accent', 9)} 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, ${tint('accent', 9)} 1px, transparent 1px) 0 0 / 24px 24px,
    var(--rich-bg);
}
` + GRADIENT_TITLE

/** Aurora: soft green and violet light bands above rounded, slightly translucent cards. */
const AURORA_OVERLAY = GLOW_OVERLAY + String.raw`
:root { --rich-radius: 14px; --rich-radius-sm: 9px; }
body {
  background:
    radial-gradient(900px 300px at 12% -60px, ${tint('accent', 18)}, transparent 70%) no-repeat,
    radial-gradient(700px 280px at 88% -40px, ${tint('accent-2', 16)}, transparent 72%) no-repeat,
    radial-gradient(520px 220px at 50% -90px, ${tint('chart-2', 10)}, transparent 70%) no-repeat,
    var(--rich-bg);
}
.rich-card, .rich-list, .rich-table-wrap { background-color: color-mix(in srgb, var(--rich-surface) 84%, transparent); }
.rich-eyebrow { letter-spacing: .08em; }
.rich-tabs { border-radius: 999px; }
.rich-tabs > :where(button, [role=tab]) { border-radius: 999px; }
` + GRADIENT_TITLE

/** Neon: synthwave glow with a magenta-cyan horizon; only the title text glows. */
const NEON_OVERLAY = GLOW_OVERLAY + CONSOLE_LABELS + String.raw`
:root { --rich-radius: 8px; --rich-radius-sm: 5px; }
body {
  background:
    radial-gradient(900px 260px at 50% -120px, ${tint('accent', 22)}, transparent 70%) no-repeat,
    radial-gradient(600px 240px at 100% 0, ${tint('accent-2', 14)}, transparent 72%) no-repeat,
    linear-gradient(transparent, var(--rich-bg) 480px) no-repeat,
    linear-gradient(90deg, ${tint('accent-2', 8)} 1px, transparent 1px) 0 0 / 40px 40px,
    var(--rich-bg);
}
:where(h1) { color: var(--rich-text-strong); text-shadow: 0 0 2px ${tint('accent', 80)}, 0 0 18px ${tint('accent', 55)}; }
:where(h2) { color: color-mix(in srgb, var(--rich-accent-2) 30%, var(--rich-text-strong)); }
.rich-card, .rich-table-wrap, .rich-list { border-color: color-mix(in srgb, var(--rich-accent) 30%, var(--rich-border)); }
.rich-card { box-shadow: inset 0 1px 0 ${tint('accent', 14)}, 0 0 0 1px ${tint('accent', 6)}, 0 16px 36px -22px ${tint('accent', 60)}; }
.rich-primary { background-image: linear-gradient(110deg, transparent 10%, ${tint('accent-2', 85)}); }
.rich-primary:hover:not(:disabled) { background-image: linear-gradient(110deg, transparent 10%, ${tint('accent-2', 85)}); }
@media (forced-colors: active) { :where(h1) { text-shadow: none; } }
`

/** Terminal: phosphor monospace screen with scanlines, square corners and flat cards. */
const TERMINAL_OVERLAY = GLOW_OVERLAY + CONSOLE_LABELS + String.raw`
:root { --rich-radius: 4px; --rich-radius-sm: 3px; --rich-font: var(--rich-mono); }
body {
  background:
    repeating-linear-gradient(180deg, transparent 0 2px, ${tint('accent', 4)} 2px 3px),
    radial-gradient(900px 320px at 0 0, ${tint('accent', 10)}, transparent 70%) no-repeat,
    var(--rich-bg);
}
:where(h1, h2, h3) { color: color-mix(in srgb, var(--rich-accent) 72%, var(--rich-text-strong)); letter-spacing: 0; }
:where(h1) { text-shadow: 0 0 14px ${tint('accent', 40)}; }
.rich-card { background-image: none; box-shadow: none; }
.rich-card::after { display: none; }
.rich-eyebrow::before { content: '>' / ''; width: auto; height: auto; border-radius: 0; background: none; box-shadow: none; }
.rich-badge { border-radius: 2px; }
.rich-primary, .rich-primary:hover:not(:disabled) { background-image: none; }
@media (forced-colors: active) { :where(h1) { text-shadow: none; } }
`

/** Ember: warm amber-to-rose light over charcoal surfaces. */
const EMBER_OVERLAY = GLOW_OVERLAY + String.raw`
:root { --rich-radius: 12px; --rich-radius-sm: 8px; }
body {
  background:
    radial-gradient(820px 280px at 0 0, ${tint('accent', 15)}, transparent 72%) no-repeat,
    radial-gradient(620px 260px at 100% 0, ${tint('accent-2', 11)}, transparent 72%) no-repeat,
    var(--rich-bg);
}
.rich-eyebrow { letter-spacing: .08em; }
` + GRADIENT_TITLE

/** Default tech dark CSS for `theme: cyber`: the shared structure, cyber palette and overlay. Generated CSS follows it. */
export const RICH_CYBER_CSS = baseSheet(RICH_CYBER_PALETTE, RICH_CYBER_ACCENTS.blue, RICH_CYBER_ACCENTS_2.blue) + CYBER_OVERLAY

interface BuiltInSheet {
  readonly css: string
  readonly palette: RichPalette
  /** Accent pair designed for the theme and used by `accent: auto`. */
  readonly accent: readonly [string, string]
  readonly overrides: Readonly<Record<RichAccentOverride, readonly [string, string]>>
}

const pairs = (first: Readonly<Record<RichAccentOverride, string>>, second: Readonly<Record<RichAccentOverride, string>>) => ({
  blue: [first.blue, second.blue], violet: [first.violet, second.violet], teal: [first.teal, second.teal],
} as const)
const GLOW_OVERRIDES = pairs(RICH_CYBER_ACCENTS, RICH_CYBER_ACCENTS_2)
const glowing = (palette: RichPalette, accent: readonly [string, string], overlay: string): BuiltInSheet => ({
  css: baseSheet(palette, accent[0], accent[1]) + overlay, palette, accent, overrides: GLOW_OVERRIDES,
})

const SHEETS: Readonly<Record<RichThemeName, BuiltInSheet>> = {
  cyber: { css: RICH_CYBER_CSS, palette: RICH_CYBER_PALETTE, accent: GLOW_OVERRIDES.blue, overrides: GLOW_OVERRIDES },
  aurora: glowing(RICH_AURORA_PALETTE, ['#4ee3b0', '#a77bff'], AURORA_OVERLAY),
  neon: glowing(RICH_NEON_PALETTE, ['#ff4fd8', '#36e4ff'], NEON_OVERLAY),
  terminal: glowing(RICH_TERMINAL_PALETTE, ['#3dff7a', '#2ee6d6'], TERMINAL_OVERLAY),
  ember: glowing(RICH_EMBER_PALETTE, ['#ff9a3d', '#ff5e7a'], EMBER_OVERLAY),
  dark: { css: RICH_DARK_CSS, palette: RICH_PALETTE, accent: [RICH_ACCENTS.blue, RICH_ACCENTS_2.blue],
    overrides: pairs(RICH_ACCENTS, RICH_ACCENTS_2) },
}

/** `none` reports graphite values, so palette and accent lookups always return valid colors. */
const sheet = (appearance: RichAppearance): BuiltInSheet => SHEETS[appearance.theme === 'none' ? 'dark' : appearance.theme]
const accentPair = (appearance: RichAppearance): readonly [string, string] => {
  const selected = sheet(appearance)
  return appearance.accent === 'auto' ? selected.accent : selected.overrides[appearance.accent]
}

/**
 * Select the built-in sheet for one profile appearance.
 * @param appearance - Host-validated profile preferences.
 * @returns built-in CSS placed before authored CSS; empty when disabled.
 */
export function richThemeCss(appearance: RichAppearance): string {
  if (appearance.theme === 'none') return ''
  const { css, accent } = sheet(appearance)
  const [first, second] = accentPair(appearance)
  return first === accent[0] && second === accent[1] ? css : css + `\n:root { --rich-accent: ${first}; --rich-accent-2: ${second}; }\n`
}

/**
 * Resolve the profile accent for the selected built-in sheet.
 * @param appearance - Host-validated profile preferences.
 * @returns accent color; disabled themes report the graphite value.
 */
export function richAccent(appearance: RichAppearance): string {
  return accentPair(appearance)[0]
}

/**
 * List the guest palette as inline custom properties so trusted controls match the dark block they surround.
 * @param appearance - Host-validated profile preferences.
 * @returns every `--rich-*` palette property plus the profile accent pair.
 */
export function richPaletteProperties(appearance: RichAppearance): Record<`--rich-${string}`, string> {
  const [accent, accent2] = accentPair(appearance)
  const properties: Record<`--rich-${string}`, string> = { '--rich-accent': accent, '--rich-accent-2': accent2 }
  for (const [name, value] of Object.entries(sheet(appearance).palette)) properties[`--rich-${name}`] = value
  return properties
}

/**
 * Map legacy Host token names for dark guests.
 * @returns legacy Host token names mapped to overridable rich tokens, without following the outer app's light theme.
 */
export function richThemeTokens(): Record<string, string> {
  return { '--dsw-alias-label-primary': 'var(--rich-text)', '--dsw-alias-label-secondary': 'var(--rich-muted)',
    '--dsw-alias-interactive-bg-hover': 'var(--rich-surface-raised)', '--dsw-radius-sm': 'var(--rich-radius)' }
}

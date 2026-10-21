// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { richCopyMarkdown, richCopySelection, richCopyTarget, richCopyText } from '../src/rich-copy-content.ts'
import { richExternalUrl } from '../src/rich-links.ts'

afterEach(() => { getSelection()?.removeAllRanges(); document.body.replaceChildren() })
const content = (html: string): HTMLElement => {
  document.body.innerHTML = html
  const element = document.body.firstElementChild
  if (!(element instanceof HTMLElement)) throw new Error('missing content')
  return element
}

it('opens only bounded web and email destinations, not local files or executable schemes', () => {
  for (const url of ['https://example.com/a?q=中文#b', 'http://localhost:57017/', 'mailto:user@example.com?subject=Hello']) {
    expect(richExternalUrl(url)).toBe(new URL(url).href)
  }
  for (const url of ['file:///C:/secret', 'C:\\secret', '../source.ts', 'javascript:alert(1)', 'data:text/html,test',
    'dsh-app://app/', 'https://user:password@example.com/', 'https://example.com/\npath', 'https://example.com/' + 'x'.repeat(8192)]) {
    expect(richExternalUrl(url)).toBeUndefined()
  }
})

it('resolves semantic regions without requiring markers and preserves explicit scopes', () => {
  content('<article data-rich-copy><p id="prose">Review <strong>finding</strong></p><pre id="code">x</pre>'
    + '<p><a id="link" href="https://example.com">Source</a></p></article><table id="table"><tr><td id="cell">A</td></tr></table>'
    + '<div data-rich-copy="off"><p id="off">No automatic action</p></div>')
  const at = (id: string): HTMLElement => document.getElementById(id)!
  expect(richCopyTarget(at('prose'))).toBe(at('prose').parentElement)
  expect(richCopyTarget(at('code'))).toBe(at('code'))
  expect(richCopyTarget(at('link'))).toBe(at('link'))
  expect(richCopyTarget(at('cell'))).toBe(at('table'))
  expect(richCopyTarget(at('off'))).toBeUndefined()
  expect(richCopyTarget(content('<p>Ordinary paragraph</p>'))?.tagName).toBe('P')
})

it('copies Markdown headings, emphasis, links, nested lists, tables and fenced code', () => {
  const element = content('<section><h2>Title</h2><p><strong>Bold</strong> and <em>soft</em> '
    + '<a href="https://example.com/a">source</a></p><ul><li>First<ul><li>Nested</li></ul></li><li>Second</li></ul>'
    + '<table><tr><th>A</th><th>B</th></tr><tr><td>x|y</td><td>z</td></tr></table>'
    + '<pre><code class="language-ts">  run(`value`);\n</code></pre><button>Ignore</button><p hidden>Secret</p></section>')
  const markdown = richCopyMarkdown(element)
  expect(markdown).toContain('## Title')
  expect(markdown).toContain('**Bold** and *soft* [source](https://example.com/a)')
  expect(markdown).toMatch(/-\s+Nested/)
  expect(markdown).toContain('| A | B |\n| --- | --- |\n| x\\|y | z |')
  expect(markdown).toContain('```ts\n  run(`value`);\n```')
  expect(markdown).not.toMatch(/Ignore|Secret/)
})

it('retains Markdown syntax when the copy region itself is a heading, link, table or code block', () => {
  expect(richCopyMarkdown(content('<h2>Standalone</h2>'))).toBe('## Standalone')
  expect(richCopyMarkdown(content('<a href="https://example.com">Source</a>'))).toBe('[Source](https://example.com)')
  expect(richCopyMarkdown(content('<pre>  run();\n</pre>'))).toBe('```\n  run();\n```')
  expect(richCopyMarkdown(content('<table><tr><th>A</th></tr><tr><td>B</td></tr></table>'))).toBe('| A |\n| --- |\n| B |')
})

it('retains exact selected boundaries and excludes concealed and opted-out content in both formats', () => {
  const element = content('<section><p>Before <strong>selected words</strong><span hidden>secret</span>'
    + '<span data-rich-copy-ignore>badge</span><span data-rich-copy="off">private</span> after</p><p>Next line</p></section>')
  const strong = element.querySelector('strong')!
  const range = document.createRange()
  range.setStart(strong.firstChild!, 2)
  range.setEnd(element.lastElementChild!.firstChild!, 4)
  getSelection()!.addRange(range)
  const selection = richCopySelection()
  expect(selection).toBeDefined()
  expect(richCopyText(selection!)).toBe('lected words after\n\nNext')
  expect(richCopyMarkdown(selection!)).toBe('**lected words** after\n\nNext')
})

it('never copies a password and keeps ignored content out of a larger explicit scope', () => {
  const element = content('<section>Visible<span data-rich-copy="off"> excluded</span></section>')
  expect(richCopyText(element)).toBe('Visible')
  expect(richCopyText(content('<input type="password" value="secret">'))).toBe('')
})

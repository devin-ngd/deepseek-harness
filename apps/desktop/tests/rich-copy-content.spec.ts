// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { richCopyText } from '../src/rich-copy-content.ts'

afterEach(() => { document.body.replaceChildren() })

function region(html: string): HTMLElement {
  document.body.innerHTML = html
  const element = document.body.firstElementChild
  if (!(element instanceof HTMLElement)) throw new Error('missing fixture region')
  return element
}

it('copies a complete review item without controls, hidden evidence or decorations', () => {
  const element = region('<article><h3>[P1] Retry creates another order</h3><p>checkout.ts:84</p>'
    + '<p>Keep the same request key.</p><button>Copy</button><span hidden>hidden</span>'
    + '<span style="display:none">concealed</span><span aria-hidden="true">icon</span>'
    + '<span data-rich-copy-ignore>badge</span><input value="draft"><script>danger()</script></article>')
  expect(richCopyText(element)).toBe('[P1] Retry creates another order\n\ncheckout.ts:84\n\nKeep the same request key.')
})

it('preserves code indentation and trailing newline while excluding line numbers', () => {
  const element = region('<pre><code><span data-rich-copy-ignore>1 </span>  const x = 1;\n\n  run(x);\n</code></pre>')
  expect(richCopyText(element)).toBe('  const x = 1;\n\n  run(x);\n')
})

it('separates list items, line breaks and table cells without copying markup', () => {
  const element = region('<section><p>First<br>Second</p><ul><li>One</li><li>Two</li></ul>'
    + '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table></section>')
  expect(richCopyText(element)).toBe('First\nSecond\n\n- One\n\n- Two\n\nA\tB')
})

it('reads edited text fields and updated prose at activation time', () => {
  const field = region('<textarea>original</textarea>')
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('missing textarea')
  field.value = '  revised\ntext\n'
  expect(richCopyText(field)).toBe('  revised\ntext\n')
  const element = region('<section>old</section>')
  element.textContent = 'updated'
  expect(richCopyText(element)).toBe('updated')
})

it('keeps whitespace in wrapped prompts and in code nested inside a report', () => {
  const prompt = region('<section style="white-space:pre-wrap">  First\n\n\n  Second\n</section>')
  expect(richCopyText(prompt)).toBe('  First\n\n\n  Second\n')
  const report = region('<article><h3>Fix</h3><pre>  if (ready) {\n    run()\n  }\n</pre><p>Then retry.</p></article>')
  expect(richCopyText(report)).toBe('Fix\n\n  if (ready) {\n    run()\n  }\n\n\nThen retry.')
})

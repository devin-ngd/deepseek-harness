/** Trusted presentation of previously settled prose; no model call or generated script. */
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { RootContent, TableCell } from 'mdast'
import type { AuthoredContent } from '../shared/authored.ts'

/** Reading styles layered over the built-in sheet; fallbacks keep the view legible when the profile disables built-in appearance. */
const LEGACY_CSS = [
  'body{font:15px/1.75 var(--rich-font,system-ui,sans-serif);color:var(--rich-text,light-dark(#20232b,#e7e9ee))}',
  '[data-rich-content-root]{padding:clamp(16px,3vw,24px)}',
  'article{max-width:760px;margin:0 auto;overflow-wrap:anywhere}',
  'article>*{margin:0 0 14px}article>:last-child{margin-bottom:0}',
  'h1,h2,h3,h4{color:var(--rich-text-strong,inherit);font-weight:600;line-height:1.35}',
  'h1{font-size:24px;letter-spacing:-.02em}h2{font-size:18px}h3{font-size:16px}h4{font-size:15px}',
  'article>:not(:first-child):is(h2,h3,h4){margin-top:28px}article>:is(h1,h2,h3,h4){margin-bottom:10px}',
  'a{color:var(--rich-accent,#638bff);text-underline-offset:3px}',
  'ul,ol{padding-inline-start:1.4em}li{margin:.3em 0}li::marker{color:var(--rich-muted,#888)}',
  ':is(li,blockquote)>p{margin:0}:is(li,blockquote)>p+p{margin-top:8px}',
  'blockquote{padding:10px 16px;border-inline-start:3px solid var(--rich-accent,#638bff);border-radius:0 8px 8px 0;background:var(--rich-surface,#8881);color:var(--rich-muted,#888)}',
  'code,pre{font-family:var(--rich-mono,ui-monospace,Consolas,monospace)}',
  ':not(pre)>code{padding:.1em .4em;border-radius:5px;background:var(--rich-surface-raised,#8882);font-size:.88em}',
  'pre{padding:14px 16px;border:1px solid var(--rich-border,#8883);border-radius:10px;background:var(--rich-surface-sunken,#8881);overflow:auto;font-size:13px;line-height:1.6}',
  'hr{height:1px;border:0;background:var(--rich-border,#8883)}',
  '.table{overflow:auto;border:1px solid var(--rich-border,#8883);border-radius:var(--rich-radius,10px)}',
  'table{width:100%;margin:0;border-collapse:collapse;font-size:14px}',
  'th,td{padding:10px 14px;border-bottom:1px solid var(--rich-border,#8883);text-align:start;vertical-align:top}',
  'th{background:var(--rich-surface,#8881);color:var(--rich-muted,inherit);font-size:13px;font-weight:600}',
  'tbody tr:last-child>td{border-bottom:0}',
].join('')

function escape(text: string): string {
  return text.replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}
function cell(node: TableCell, tag: 'th' | 'td'): string {
  return `<${tag}>${node.children.map(render).join('')}</${tag}>`
}
function render(node: RootContent): string {
  const children = (): string => 'children' in node ? node.children.map(child => render(child as RootContent)).join('') : ''
  switch (node.type) {
    case 'text': return escape(node.value)
    case 'paragraph': return `<p>${children()}</p>`
    case 'heading': return `<h${node.depth}>${children()}</h${node.depth}>`
    case 'strong': return `<strong>${children()}</strong>`
    case 'emphasis': return `<em>${children()}</em>`
    case 'delete': return `<del>${children()}</del>`
    case 'inlineCode': return `<code>${escape(node.value)}</code>`
    case 'code': return `<pre><code>${escape(node.value)}</code></pre>`
    case 'link': return /^https?:\/\//iu.test(node.url) ? `<a href="${escape(node.url)}" title="${escape(node.url)}">${children()}</a>` : children()
    case 'image': return escape(node.alt ?? '')
    case 'list': return node.ordered ? `<ol start="${node.start ?? 1}">${children()}</ol>` : `<ul>${children()}</ul>`
    case 'listItem': return `<li>${children()}</li>`
    case 'blockquote': return `<blockquote>${children()}</blockquote>`
    case 'table': {
      const rows = node.children.map((row, index) => `<tr>${row.children.map(item => cell(item, index === 0 ? 'th' : 'td')).join('')}</tr>`)
      return `<div class="table"><table><thead>${rows.slice(0, 1).join('')}</thead><tbody>${rows.slice(1).join('')}</tbody></table></div>`
    }
    case 'break': return '<br>'
    case 'thematicBreak': return '<hr>'
    case 'html': return `<pre>${escape(node.value)}</pre>`
    default: return children()
  }
}

/** Convert durable Markdown to isolated HTML without changing its persisted text or facts.
 * @param text - settled assistant prose read by the Host.
 * @returns a local presentation with its original text as the recoverable fallback.
 */
export function legacyContent(text: string): AuthoredContent {
  const root = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  return { key: 'legacy', html: `<article>${root.children.map(render).join('')}</article>`, js: '', fallbackText: text, stateSchemaVersion: 1, css: LEGACY_CSS }
}

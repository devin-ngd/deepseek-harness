/** Content extraction for isolated copy controls; concealed content and controls are omitted. */
import TurndownService from 'turndown'

const excluded = 'script,style,button,input,textarea,select,[hidden],[inert],[aria-hidden="true"],[data-rich-copy-ignore],[data-rich-copy-ui],[data-rich-copy="off"]'
const semantic = 'pre,table,blockquote,li,p,h1,h2,h3,h4,h5,h6,section,article,div'

const omitted = (node: HTMLElement): boolean => node.matches(excluded)
  || getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden'

/** @param node - hovered or right-clicked element. @returns its innermost useful copy region, respecting explicit scopes. */
export function richCopyTarget(node: Element): HTMLElement | undefined {
  if (node.closest('[data-rich-copy="off"],[data-rich-copy-ignore],[data-rich-copy-ui],[hidden],[inert],input,textarea,select,button,[contenteditable]:not([contenteditable="false"])')) return undefined
  const target = node.closest<HTMLElement>('a[href],img') ?? node.closest<HTMLElement>('[data-rich-copy],pre,table,blockquote')
    ?? node.closest<HTMLElement>('table,blockquote,li') ?? node.closest<HTMLElement>(semantic)
  return target === null || target === document.body || omitted(target) ? undefined : target
}

function cloneVisible(node: Node, range?: Range): Node | undefined {
  if (range !== undefined && !range.intersectsNode(node)) return undefined
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return document.createTextNode(text.slice(range?.startContainer === node ? range.startOffset : 0,
      range?.endContainer === node ? range.endOffset : text.length))
  }
  if (!(node instanceof HTMLElement) || omitted(node)) return undefined
  const clone = node.cloneNode(false) as HTMLElement
  const style = getComputedStyle(node)
  clone.style.display = style.display
  clone.style.whiteSpace = node.tagName === 'PRE' ? 'pre' : style.whiteSpace
  for (const child of node.childNodes) {
    const copied = cloneVisible(child, range)
    if (copied !== undefined) clone.append(copied)
  }
  return clone
}

/** @returns a sanitized snapshot of the current free selection, or no content for a collapsed/hidden selection. */
export function richCopySelection(): HTMLElement | undefined {
  const selection = document.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return undefined
  const range = selection.getRangeAt(0)
  const source = range.commonAncestorContainer
  const parent = source instanceof Element ? source : source.parentElement
  if (parent === null || parent.closest(excluded)) return undefined
  const clone = cloneVisible(source, range)
  if (clone === undefined) return undefined
  const wrapper = document.createElement('div')
  wrapper.style.whiteSpace = getComputedStyle(parent).whiteSpace
  wrapper.append(clone)
  return richCopyText(wrapper).length > 0 ? wrapper : undefined
}

/** @param element - region or sanitized selection. @returns readable Markdown with links, lists, tables and fenced code. */
export function richCopyMarkdown(element: HTMLElement): string {
  const clone = cloneVisible(element)
  if (!(clone instanceof HTMLElement)) return ''
  for (const pre of [...clone.matches('pre') ? [clone] : [], ...clone.querySelectorAll<HTMLElement>('pre')]) {
    if (pre.childNodes.length === 1 && pre.firstElementChild?.tagName === 'CODE') continue
    const code = document.createElement('code')
    code.className = pre.querySelector('code')?.className ?? pre.className
    code.textContent = pre.textContent
    pre.replaceChildren(code)
  }
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  converter.addRule('strike', { filter: ['del', 's'], replacement: text => `~~${text}~~` })
  converter.addRule('table', {
    filter: 'table',
    replacement: (_text, node) => {
      const rows = Array.from(node.querySelectorAll('tr')).filter(row => row.closest('table') === node)
        .map(row => Array.from(row.children).filter(cell => cell.matches('th,td'))
          .map(cell => converter.turndown(cell.innerHTML).replace(/\|/gu, '\\|').replace(/\n/gu, '<br>')))
      const first = rows.at(0)
      if (first === undefined) return ''
      const columns = Math.max(...rows.map(row => row.length))
      const line = (row: string[]): string => '| ' + Array.from({ length: columns }, (_, index) => row[index] ?? '').join(' | ') + ' |'
      return '\n\n' + [line(first), line(Array<string>(columns).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n'
    },
  })
  const wrapper = document.createElement('div')
  wrapper.append(clone)
  return converter.turndown(wrapper)
}

/**
 * Read visible prose with paragraph breaks, or the exact contents of a code block or text field.
 * @param element - the copy region in the current document.
 * @returns text without copy controls, hidden content or line-number decorations.
 */
export function richCopyText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement && element.type === 'password') return ''
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value
  const segments: { text: string; literal: boolean }[] = []
  const append = (text: string, literal = false): void => {
    const last = segments.at(-1)
    if (last?.literal === literal) last.text += text
    else segments.push({ text, literal })
  }
  const read = (node: Node, whitespace: string): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const literal = /^(pre|pre-wrap|break-spaces)$/u.test(whitespace)
      append(literal ? text : whitespace === 'pre-line' ? text.replace(/[^\S\n]+/gu, ' ') : text.replace(/\s+/gu, ' '), literal)
      return
    }
    if (!(node instanceof HTMLElement)) return
    const style = getComputedStyle(node)
    if (omitted(node)) return
    const mode = node.tagName === 'PRE' ? 'pre' : style.whiteSpace || whitespace
    if (node.tagName === 'BR') { append('\n', /^(pre|pre-wrap|break-spaces)$/u.test(mode)); return }
    const block = node !== element && /^(block|flex|grid|table-row|list-item|flow-root)$/u.test(style.display)
    if (block) append('\n')
    if (node.tagName === 'LI') append('- ')
    for (const child of node.childNodes) read(child, mode)
    if (node.tagName === 'TD' || node.tagName === 'TH') append('\t')
    if (block) append('\n')
  }
  read(element, 'normal')
  return segments.map((segment, index) => {
    if (segment.literal) return segment.text
    let text = segment.text.replace(/[ \t]+\n/gu, '\n').replace(/\n[ \t]+/gu, '\n').replace(/\n{3,}/gu, '\n\n')
    if (index === 0) text = text.trimStart()
    if (index === segments.length - 1) text = text.trimEnd()
    return text
  }).join('')
}

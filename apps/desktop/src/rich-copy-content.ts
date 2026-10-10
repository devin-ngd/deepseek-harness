/** Plain-text extraction for a user-selected rich region; controls and concealed content are omitted. */

/**
 * Read visible prose with paragraph breaks, or the exact contents of a code block or text field.
 * @param element - the copy region in the current document.
 * @returns text without copy controls, hidden content or line-number decorations.
 */
export function richCopyText(element: HTMLElement): string {
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
    if (node.matches('script,style,button,input,textarea,select,[hidden],[aria-hidden="true"],[data-rich-copy-ignore],[data-rich-copy-ui]')
      || style.display === 'none' || style.visibility === 'hidden') return
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

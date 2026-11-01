/** Line-oriented Markdown subset for transcript display. Unrecognized syntax stays literal text; no links, HTML or images are interpreted. */
export class MdSpan {
  text: string = ''
  bold: boolean = false
  code: boolean = false
  constructor(text: string, bold: boolean, code: boolean) { this.text = text; this.bold = bold; this.code = code }
}

/** `kind` is paragraph, heading, bullet, ordered, quote, code, table or rule; `marker` holds an ordered-list number or a code language. */
export class MdBlock {
  kind: string = 'paragraph'
  text: string = ''
  level: number = 0
  marker: string = ''
  spans: MdSpan[] = []
  plain: boolean = true
  constructor(kind: string, text: string, level: number, marker: string) { this.kind = kind; this.text = text; this.level = level; this.marker = marker }
}

/** @param text - One inline run. @returns Literal, bold and inline-code spans; an unmatched delimiter stays literal. */
export function parseInline(text: string): MdSpan[] {
  const spans: MdSpan[] = []
  let buffer = '', index = 0
  const flush = (): void => { if (buffer.length > 0) { spans.push(new MdSpan(buffer, false, false)); buffer = '' } }
  while (index < text.length) {
    const char = text.charAt(index)
    if (char === '`') {
      const end = text.indexOf('`', index + 1)
      if (end > index + 1) { flush(); spans.push(new MdSpan(text.substring(index + 1, end), false, true)); index = end + 1; continue }
    }
    if (char === '*' && text.charAt(index + 1) === '*') {
      const end = text.indexOf('**', index + 2)
      if (end > index + 2) { flush(); spans.push(new MdSpan(text.substring(index + 2, end), true, false)); index = end + 2; continue }
    }
    buffer += char
    index++
  }
  flush()
  return spans
}

function indentOf(line: string): number { let count = 0; while (count < line.length && line.charAt(count) === ' ') count++; return count }
function isDigit(char: string): boolean { return char.length === 1 && char >= '0' && char <= '9' }
function isRule(trimmed: string): boolean {
  const compact = trimmed.split(' ').join('')
  if (compact.length < 3) return false
  const first = compact.charAt(0)
  if (first !== '-' && first !== '*' && first !== '_') return false
  for (let i = 1; i < compact.length; i++) if (compact.charAt(i) !== first) return false
  return true
}
function headingLevel(trimmed: string): number {
  let level = 0
  while (level < trimmed.length && trimmed.charAt(level) === '#') level++
  return level >= 1 && level <= 6 && trimmed.charAt(level) === ' ' ? level : 0
}
function orderedMarker(rest: string): number {
  let digits = 0
  while (digits < rest.length && isDigit(rest.charAt(digits))) digits++
  if (digits === 0 || digits > 9) return 0
  const close = rest.charAt(digits)
  return (close === '.' || close === ')') && rest.charAt(digits + 1) === ' ' ? digits : 0
}
function withInline(block: MdBlock): MdBlock {
  block.spans = parseInline(block.text)
  block.plain = block.spans.length === 0 || block.spans.length === 1 && !block.spans[0].bold && !block.spans[0].code
  return block
}

/** @param source - Complete or still-streaming Markdown text. @returns Display blocks in source order; an unclosed fence runs to the end. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.split('\r\n').join('\n').split('\n'), blocks: MdBlock[] = []
  let paragraph: string[] = [], index = 0
  const flush = (): void => { if (paragraph.length > 0) { blocks.push(withInline(new MdBlock('paragraph', paragraph.join('\n'), 0, ''))); paragraph = [] } }
  while (index < lines.length) {
    const line = lines[index], trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      flush()
      const fence = trimmed.substring(0, 3), body: string[] = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith(fence)) { body.push(lines[index]); index++ }
      index++
      blocks.push(new MdBlock('code', body.join('\n'), 0, trimmed.substring(3).trim()))
      continue
    }
    if (trimmed.length === 0) { flush(); index++; continue }
    const level = headingLevel(trimmed)
    if (level > 0) { flush(); blocks.push(withInline(new MdBlock('heading', trimmed.substring(level + 1).trim(), level, ''))); index++; continue }
    if (isRule(trimmed)) { flush(); blocks.push(new MdBlock('rule', '', 0, '')); index++; continue }
    if (trimmed.startsWith('|')) {
      flush()
      const rows: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) { rows.push(lines[index].trim()); index++ }
      blocks.push(new MdBlock('table', rows.join('\n'), 0, ''))
      continue
    }
    if (trimmed.startsWith('>')) {
      flush()
      const quoted: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) { const value = lines[index].trim().substring(1); quoted.push(value.startsWith(' ') ? value.substring(1) : value); index++ }
      blocks.push(withInline(new MdBlock('quote', quoted.join('\n'), 0, '')))
      continue
    }
    const indent = indentOf(line), rest = line.substring(indent), depth = Math.min(Math.floor(indent / 2), 4)
    if ((rest.startsWith('- ') || rest.startsWith('* ') || rest.startsWith('+ ')) && rest.trim().length > 1) { flush(); blocks.push(withInline(new MdBlock('bullet', rest.substring(2).trim(), depth, ''))); index++; continue }
    const digits = orderedMarker(rest)
    if (digits > 0) { flush(); blocks.push(withInline(new MdBlock('ordered', rest.substring(digits + 2).trim(), depth, rest.substring(0, digits) + '.'))); index++; continue }
    paragraph.push(line)
    index++
  }
  flush()
  return blocks
}

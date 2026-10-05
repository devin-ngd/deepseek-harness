/** Code-only publications and incremental inert preview parsing. */
import { describe, it, expect } from 'vitest'
import { authoredContent, authoredFences, PreviewDecoder } from '../src/shared/authored.ts'
import { richParts } from '../src/client/markers.ts'

const code = { key: 'news', html: '<h1>中文</h1><p title="ok">News</p>', css: 'p{color:red}', js: 'window.ran=true', fallbackText: 'News', stateSchemaVersion: 1 }
describe('assistant code publication', () => {
  it('decodes every split including JSON escapes without projecting JS', () => {
    const source = '  ' + JSON.stringify({ ...code, html: code.html + '\n\t😀', values: { html: 'nested ignored' } }).replace('中文', '\\u4e2d\\u6587')
    const decoder = new PreviewDecoder()
    for (let end = 1; end <= source.length; end++) {
      const preview = decoder.append(source.slice(0, end))
      expect(preview.failed).toBe(false)
      expect(preview).not.toHaveProperty('js')
    }
    expect(decoder.append(source)).toEqual({ html: code.html + '\n\t😀', css: code.css, failed: false })
  })
  it('resets an amended prefix rather than mixing previous source', () => {
    const decoder = new PreviewDecoder()
    decoder.append(JSON.stringify(code))
    expect(decoder.append(JSON.stringify({ ...code, html: '<p>replacement</p>' })).html).toBe('<p>replacement</p>')
  })
  it('requires valid complete code and refuses forged authority', () => {
    expect(authoredContent(JSON.stringify(code))).toEqual(code)
    for (const invalid of [{ ...code, confirmed: true }, { ...code, key: '../bad' }, { ...code, stateSchemaVersion: 0 }, { ...code, fallbackText: '' }])
      expect(authoredContent(JSON.stringify(invalid))).toBeNull()
    expect(authoredContent(JSON.stringify(code).slice(0, -1))).toBeNull()
  })
  it('keeps multiple fences and ordinary prose in order while previewing only the unfinished tail', () => {
    const first = '```rich-html\n' + JSON.stringify(code) + '\n```'
    const value = `Before\n${first}\nBetween\n\`\`\`rich-html\n{"key":"second","html":"<p>partial`
    expect(authoredFences(value)).toHaveLength(1)
    expect(richParts(value, true)?.map(part => part.kind)).toEqual(['text', 'authored', 'text', 'authored'])
    expect(richParts(value, true)?.at(-1)).toMatchObject({ complete: false })
    expect(richParts('```html\n<script>window.ran=true</script>\n```')).toBeNull()
  })
  it('selects long settled reports without claiming their streaming prefix', () => {
    const source = '# Report\n<script>window.ran=true</script>\n\n[bad](javascript:alert(1))\n\n' + '- News item\n'.repeat(65)
    expect(richParts(source)).toEqual([{ kind: 'legacy', text: source }])
    expect(richParts(source, true)).toBeNull()
  })
})

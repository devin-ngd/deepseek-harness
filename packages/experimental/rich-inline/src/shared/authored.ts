/** Code-only assistant publication and incremental, non-executable preview decoding. */
import type { RichBlockId, RichValues } from './types.ts'
import { isRichValues, typedRichValuesValid } from './validate.ts'
import { RICH_MAX_CONTENT_BYTES } from './limits.ts'

/** Complete rich-html JSON; the key is unique within its assistant message. */
export interface AuthoredContent {
  readonly key: string
  readonly html: string
  readonly css: string
  readonly js: string
  readonly fallbackText: string
  readonly stateSchemaVersion: number
  readonly values?: RichValues
}

/** Validate the whole publication before permitting executable rendering.
 * @param source - complete JSON from a closed rich-html fence.
 * @returns validated code, or null without accepting partial or extra authority fields.
 */
export function authoredContent(source: string): AuthoredContent | null {
  if (new TextEncoder().encode(source).byteLength > RICH_MAX_CONTENT_BYTES) return null
  let value: unknown
  try { value = JSON.parse(source) } catch { return null } // Incomplete code has no publication authority.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Partial<AuthoredContent>
  if (Object.keys(value).some(key => !['key', 'html', 'css', 'js', 'fallbackText', 'stateSchemaVersion', 'values'].includes(key))
    || typeof item.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/u.test(item.key)
    || typeof item.html !== 'string' || typeof item.css !== 'string' || typeof item.js !== 'string'
    || typeof item.fallbackText !== 'string' || item.fallbackText.trim() === ''
    || !Number.isSafeInteger(item.stateSchemaVersion) || Number(item.stateSchemaVersion) < 1
    || item.values !== undefined && (!isRichValues(item.values) || !typedRichValuesValid(item.values))) return null
  return item as AuthoredContent
}

/** Derive an identity from a durable message, never from a generated session selector.
 * @param messageId - Host-verified settled assistant identity.
 * @param key - unique author key in that message.
 * @returns the independent block identity.
 */
export function authoredBlockId(messageId: string, key: string): RichBlockId {
  return `inline-${messageId}-${key}` as RichBlockId
}

/** Closed author fences with their source offsets; ordinary code fences stay ordinary code.
 * @param text - one assistant text part.
 * @returns complete publications without executing them.
 */
export function authoredFences(text: string): { source: string; start: number; end: number }[] {
  return [...text.matchAll(/^```rich-html\r?\n([\s\S]*?)\r?\n```[ \t]*(?=\r?\n|$)/gmu)]
    .map(match => ({ source: match[1] ?? '', start: match.index, end: match.index + match[0].length }))
}

/** Incremental JSON string decoder. Only HTML and CSS are projected; JS is never exposed to preview.
 * Each append is scanned once. Invalid prefixes stop preview but remain available for final validation.
 */
export class PreviewDecoder {
  private source = ''
  private offset = 0
  private phase: 'key' | 'colon' | 'value' | 'separator' = 'key'
  private inString = false
  private token = ''
  private field = ''
  private escape = false
  private unicode: string | null = null
  private nesting = 0
  private html = ''
  private css = ''
  private failed = false
  private started = false

  /** Decode newly appended JSON string bytes without projecting JavaScript.
   * @param source - growing raw JSON prefix.
   * @returns inert code and whether preview decoding stopped.
   */
  append(source: string): { html: string; css: string; failed: boolean } {
    if (!source.startsWith(this.source)) this.reset()
    this.source = source
    if (source.length > RICH_MAX_CONTENT_BYTES) this.failed = true
    for (; !this.failed && this.offset < source.length; this.offset++) {
      const ch = source[this.offset] ?? ''
      if (this.inString) {
        if (this.unicode !== null) {
          if (!/[0-9a-f]/iu.test(ch)) { this.failed = true; break }
          this.unicode += ch
          if (this.unicode.length === 4) { this.emit(String.fromCharCode(parseInt(this.unicode, 16))); this.unicode = null }
        } else if (this.escape) {
          this.escape = false
          if (ch === 'u') this.unicode = ''
          else {
            const decoded = ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' } as Record<string, string>)[ch]
            if (decoded === undefined) { this.failed = true; break }
            this.emit(decoded)
          }
        } else if (ch === '\\') this.escape = true
        else if (ch === '"') {
          this.inString = false
          if (this.phase === 'key') { this.field = this.token; this.phase = 'colon' }
          else this.phase = 'separator'
        } else if (ch.charCodeAt(0) < 32) { this.failed = true; break }
        else this.emit(ch)
        continue
      }
      if (this.nesting > 0) {
        if (ch === '"') { this.inString = true; this.token = '' }
        else if (ch === '{' || ch === '[') this.nesting++
        else if (ch === '}' || ch === ']') { if (--this.nesting === 0) this.phase = 'separator' }
        continue
      }
      if (/\s/u.test(ch)) continue
      if (!this.started) { if (ch !== '{') { this.failed = true; break }; this.started = true; continue }
      if (this.phase === 'key' && ch === '"') { this.inString = true; this.token = '' }
      else if (this.phase === 'colon' && ch === ':') this.phase = 'value'
      else if (this.phase === 'value') {
        if (ch === '"') { this.inString = true; this.token = '' }
        else if (ch === '{' || ch === '[') this.nesting = 1
        else if (ch === ',') this.phase = 'key'
        // Numbers and JSON literals are ignored; final parsing validates them.
      } else if (this.phase === 'separator' && ch === ',') this.phase = 'key'
      else if (ch !== '}') this.failed = true
    }
    return { html: this.html, css: this.css, failed: this.failed }
  }

  private emit(ch: string): void {
    if (this.nesting > 0) return
    if (this.phase === 'key') this.token += ch
    else if (this.phase === 'value' && this.field === 'html') this.html += ch
    else if (this.phase === 'value' && this.field === 'css') this.css += ch
  }

  private reset(): void {
    this.source = ''; this.offset = 0; this.phase = 'key'; this.inString = false; this.token = ''; this.field = ''
    this.escape = false; this.unicode = null; this.nesting = 0; this.html = ''; this.css = ''; this.failed = false; this.started = false
  }
}

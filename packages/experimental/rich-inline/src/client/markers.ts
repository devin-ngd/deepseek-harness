/** Complete settled markers select rich content without executing partial HTML. */
import type { RichBlockId } from '../shared/types.ts'
import { authoredFences } from '../shared/authored.ts'
import { legacyEligible } from '../shared/legacy.ts'

/** Ordinary message prose and independently addressable rich blocks preserve their order. */
export type MessagePart = { kind: 'text'; text: string } | { kind: 'rich'; blockId: RichBlockId }
  | { kind: 'authored'; source: string; complete: boolean }
  | { kind: 'legacy'; text: string }

/**
 * Parse complete markers; malformed or repeated markers retain their original text.
 * @param text - settled assistant text.
 * @param streaming - suppress legacy publication and prose conversion until settlement.
 * @returns ordered parts, or null when ordinary Markdown should handle the whole block.
 */
export function richParts(text: string, streaming = false): readonly MessagePart[] | null {
  const parts: MessagePart[] = []
  const seen = new Set<string>()
  let end = 0
  const fences = authoredFences(text)
  const matches: { start: number; end: number; part: MessagePart }[] = fences.map(fence => ({
    start: fence.start, end: fence.end, part: { kind: 'authored', source: fence.source, complete: true },
  }))
  const last = fences.at(-1)?.end ?? 0
  const prefix = /^```rich-html\r?\n/gmu
  prefix.lastIndex = last
  const pending = prefix.exec(text)
  if (pending !== null) matches.push({ start: pending.index, end: text.length,
    part: { kind: 'authored', source: text.slice(pending.index + pending[0].length), complete: false } })
  for (const match of streaming ? [] : text.matchAll(/```rich-inline\r?\n([^`]+)\r?\n```/gu)) {
    let parsed: unknown
    try { parsed = JSON.parse(match[1] ?? '') }
    catch { continue } // Malformed authoring stays visible as Markdown.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    if (!('blockId' in parsed) || typeof parsed.blockId !== 'string') continue
    if (Object.keys(parsed).length !== 1 || !/^[\w-]{8,128}$/u.test(parsed.blockId) || seen.has(parsed.blockId)) continue
    seen.add(parsed.blockId)
    matches.push({ start: match.index, end: match.index + match[0].length, part: { kind: 'rich', blockId: parsed.blockId as RichBlockId } })
  }
  for (const match of matches.sort((a, b) => a.start - b.start)) {
    const index = match.start
    if (index < end) continue
    if (index > end) parts.push({ kind: 'text', text: text.slice(end, index) })
    parts.push(match.part)
    end = match.end
  }
  if (matches.length === 0) return !streaming && legacyEligible(text) ? [{ kind: 'legacy', text }] : null
  if (end < text.length) parts.push({ kind: 'text', text: text.slice(end) })
  return parts
}

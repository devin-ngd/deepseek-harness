/** Input, URL, and presentation rules applied before external access. @module dsh-experimental-safe-external-research/policy */

import { z } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ResearchRequest } from './types.ts'

/** Expected refusal without echoing rejected input or remote response bodies. */
export class ResearchError extends HarnessError {
  constructor(code: string) {
    super(`Public research stopped: ${code}. Check the public sources and research configuration.`, code)
  }
}

const requestSchema = z.strictObject({
  question: z.string().trim().min(1).max(1600),
  sources: z.array(z.string().min(1).max(2048)).min(1).max(12),
  search: z.boolean(),
  budget: z.strictObject({ reads: z.number().int().min(1), steps: z.number().int().min(1) }),
})

/**
 * Validate the wire request without copying parent state. Callers still own semantic public-data selection.
 * @param value - tool JSON.
 * @param reads - deployment read ceiling.
 * @param steps - deployment step ceiling.
 * @returns normalized minimal request.
 */
export function parseRequest(value: unknown, reads: number, steps: number): ResearchRequest {
  const parsed = requestSchema.safeParse(value)
  if (!parsed.success) throw new ResearchError('RESEARCH_INVALID_INPUT')
  const request = parsed.data
  if (request.budget.reads > reads || request.budget.steps > steps) throw new ResearchError('RESEARCH_BUDGET')
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 16_384) throw new ResearchError('RESEARCH_INPUT_SIZE')
  // These are explicit unsupported carriers, not a claim to detect arbitrary private prose.
  const localCarrier = /(?:[a-z]:[\\/]|\\\\|file:|\/(?:home|Users|etc|proc)\/|-----BEGIN )/iu
  const credentialCarrier = /\b(?:Bearer|api[_-]?key|password|secret)\s*[:=]\s*\S+/iu
  if (localCarrier.test(request.question) || credentialCarrier.test(request.question)) {
    throw new ResearchError('RESEARCH_PRIVATE_INPUT')
  }
  return request
}

/**
 * Admit canonical anonymous HTTPS URLs without query, fragment, credentials or alternate ports.
 * @param input - public source URL.
 * @returns canonical URL; DNS policy is enforced by the pinned transport.
 */
export function sourceUrl(input: string): URL {
  let url: URL
  try { url = new URL(input) } catch (_error: unknown) {
    throw new ResearchError('RESEARCH_URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || input.length > 2048 || /[\\\s]/u.test(input) || /%(?:2f|5c|2e|25)/iu.test(url.pathname)) {
    throw new ResearchError('RESEARCH_URL')
  }
  return url
}

/**
 * Check an origin and path-segment prefix without admitting sibling repositories or paths.
 * @param url - canonical target.
 * @param prefix - canonical authorized prefix.
 * @returns whether the exact target is inside this prefix.
 */
export function withinSource(url: URL, prefix: URL): boolean {
  const path = prefix.pathname.replace(/\/$/u, '')
  return url.origin === prefix.origin && (url.pathname === path || url.pathname.startsWith(`${path}/`))
}

/**
 * Render untrusted text without active HTML, Markdown embeds or formatting delimiters.
 * @param value - untrusted text, including decoded remote HTML text.
 * @returns inert Unicode text; semantic instructions remain untrusted.
 */
export function inertText(value: string): string {
  const replacements: Record<string, string> = { '<': '＜', '>': '＞', '[': '［', ']': '］', '!': '！', '`': '｀', '&': '＆', '\\': '＼' }
  return value.replace(/[<>[\]!`&\\]/gu, char => replacements[char] ?? char)
}

/**
 * Present untrusted JSON as a code block with no possible closing fence or HTML resource.
 * @param value - validated JSON data.
 * @returns inert text content for model and generic tool rendering.
 */
export function renderResearchJson(value: unknown): ContentBlock[] {
  const text = JSON.stringify(value).replace(/[<>&`]/gu, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return [{ type: 'text', text: `\`\`\`json\n${text}\n\`\`\`` }]
}

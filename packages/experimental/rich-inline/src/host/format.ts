/** Logged, bounded correction of final output; formatting cannot execute business tools. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { authoredContent, authoredFences } from '../shared/authored.ts'
import { richMarkerIds } from '../shared/validate.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** The complete correction is in content; core replay preserves unknown kinds. This producer reads the kind only to bound
     * correction and deny business tools; it never grants authority or changes model roles.
     * @persistenceAttribution
     */
    'rich-inline-format': { kind: 'rich-inline-format' }
  }
}

function humanTextRequest(text: string): boolean {
  for (const clause of text.split(/[，,。.!！?？;；\n]/u)) {
    for (const match of clause.matchAll(/纯文本|纯文字|markdown|plain\s*text|源码|源代码|source\s*code/giu)) {
      const before = clause.slice(0, match.index)
      const after = clause.slice(match.index + match[0].length)
      // Mentioning a format in a complaint, analysis task or negative instruction is not an opt-out.
      if (/(?:不要|别|不用|无需|不需要|禁止|避免|\b(?:no|not|without|avoid|do not|don't)\b).{0,24}$/iu.test(before)
        || /为什么|怎么|为何|\b(?:why|how)\b/iu.test(before)) continue
      const requestBefore = before.replace(/\s+(?:the|a|an)\s*$/iu, '')
      const requested = /(?:仅|只|只要|只用|只输出|仅输出|使用|用|以|按|改成|换成|输出|返回|提供|给我|我要|请)\s*$/u.test(before)
        || /\b(?:in|as|use|using|return|output|give me|show me|want|need|prefer|provide|only)\s*$/iu.test(requestBefore)
      const suffix = /^\s*(?:only\b|please\b|即可|就好|就可以|(?:格式|形式)(?:输出|返回|回答|呈现|展示))/iu.test(after)
      if (requested || suffix || clause.trim().toLowerCase() === match[0].toLowerCase()) return true
    }
  }
  return false
}

/** Detect an explicitly requested text or source answer, excluding generated context.
 * @param events - committed transcript before the assistant response.
 * @returns whether the most recent substantive human prompt opted out of HTML.
 */
export function explicitTextRequested(events: readonly SessionEvent[]): boolean {
  for (const event of events.toReversed()) {
    if (event.type !== 'user/message' || event.data.source.kind !== 'user') continue
    const text = event.data.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n').trim()
    if (/^(go on|continue|继续)[。.!！\s]*$/iu.test(text) || /^(Interactive input|Render feedback) /u.test(text)) continue
    return humanTextRequest(text)
  }
  return false
}

/** Require valid, independently keyed publications; brief conversational text remains readable.
 * @param text - one settled assistant answer.
 * @returns a format diagnostic, or null when no correction is needed.
 */
export function outputFormatProblem(text: string): string | null {
  const fences = authoredFences(text)
  if (fences.length > 0 || text.includes('```rich-html')) {
    const codes = fences.map(fence => authoredContent(fence.source))
    if (codes.length === 0 || codes.some(code => code === null)) return 'Invalid or incomplete rich-html JSON publication.'
    if (new Set(codes.map(code => code?.key)).size !== codes.length) return 'Duplicate block keys in the same message.'
    let end = 0
    for (const fence of fences) {
      if (text.slice(end, fence.start).trim() !== '') return 'Explanatory prose appears outside the HTML result.'
      end = fence.end
    }
    return text.slice(end).trim() === '' ? null : 'Explanatory prose appears after the HTML result.'
  }
  if (richMarkerIds(text).length > 0) return null
  return text.trim().length >= 160 ? 'The substantive result is plain text or Markdown, not generated HTML/CSS/JavaScript.' : null
}

/** Install a turn-boundary format check without replaying old results or authoring hidden model input.
 * @param ctx - plugin lifetime and existing Host services.
 * @param maxAttempts - bounded extra model requests for formatting each live turn; zero disables correction.
 * @param enabled - whether this Agent's selected mode requires rich output; history presentation stays independent.
 */
export function installFormatCheck(ctx: Context, maxAttempts: number, enabled: (agent: Agent) => boolean = () => true): void {
  const formatting = new Set<Agent>()
  const humanClaimed = new Set<Agent>()
  ctx.effect(() => () => { formatting.clear(); humanClaimed.clear() }, 'rich-inline.format-lifetime')
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (message.source.kind === 'rich-inline-format') { formatting.add(agent); humanClaimed.delete(agent) }
    // Restore the next human step's tool schemas, but keep the in-flight correction guarded until admission commits.
    if (message.source.kind === 'user' && formatting.has(agent)) humanClaimed.add(agent)
  })
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' || event.type === 'user/message' && event.data.source.kind === 'user') {
      for (const agent of formatting) if (agent.id === session.id) { formatting.delete(agent); humanClaimed.delete(agent) }
    }
  })
  ctx.on('agent/disposed', ({ agent }) => { formatting.delete(agent); humanClaimed.delete(agent) })
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const result = await next()
    if (context.agent !== undefined && formatting.has(context.agent) && !humanClaimed.has(context.agent)) return { ...result, tools: [] }
    return result
  })
  ctx.tools.guard(execution => execution.agent !== undefined && formatting.has(execution.agent)
    ? 'Output formatting may only generate code; business tools are disabled. Use the existing transcript without repeating operations.' : undefined)
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    if (!enabled(agent)) return
    signal.throwIfAborted()
    const { events } = await ctx.sessionController.inspect(agent.id, signal)
    signal.throwIfAborted()
    const start = events.findLast(event => event.type === 'turn/start' && event.data.turn === turn)
    if (start === undefined) return
    const own = events.filter(event => event.seq > start.seq)
    const final = own.findLast(event => event.type === 'assistant/message')
    if (final?.type !== 'assistant/message' || final.data.interrupted === true || explicitTextRequested(events)) return
    // An existing block may already have been updated by a tool; no duplicate result is required.
    if (own.some(event => event.type === 'tool/result' && event.data.message.isError !== true
      && typeof event.data.meta === 'object' && event.data.meta !== null && 'richInline' in event.data.meta)) return
    const text = final.data.message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
    const problem = outputFormatProblem(text)
    if (problem === null) return
    const attempts = own.filter(event => event.type === 'user/message' && event.data.source.kind === 'rich-inline-format').length
    if (attempts >= maxAttempts) return
    formatting.add(agent)
    agent.steer(createUserMessage({ source: { kind: 'rich-inline-format' },
      content: [{ type: 'text', text: `Rich inline output format check: ${problem}\nThe work above is already done. Correct only the presentation of the existing result, in the user's language. Do not repeat any tool call or external operation; tools are disabled for this correction. Return only a valid rich-html fenced JSON object with key, html, css, js, fallbackText and stateSchemaVersion. Create an actual styled webpage fragment with a clear layout and appropriate local controls (for example search or filtering for a list), not Markdown copied into a pre, article or text box. Put all explanations inside the HTML. Preserve the existing facts and sources. If necessary facts are missing, show that limitation in the HTML. 不要再输出 Markdown。只生成 HTML/CSS/JavaScript 代码，渲染由插件完成。` }] }))
  })
}

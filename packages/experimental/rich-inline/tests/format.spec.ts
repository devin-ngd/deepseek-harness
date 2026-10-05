/** Format classification preserves opt-outs and rejects invalid executable publications. */
import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import { Context } from '@deepseek-ai/cordis'
import { explicitTextRequested, outputFormatProblem } from '../src/host/format.ts'

const code = { key: 'result', html: '<h1>Result</h1>', css: 'h1{color:CanvasText}', js: '', fallbackText: 'Result', stateSchemaVersion: 1 }
const fence = (value: object) => '```rich-html\n' + JSON.stringify(value) + '\n```'
describe('final output contract', () => {
  it('requires complete independent publications and keeps short conversation text', () => {
    expect(outputFormatProblem(fence(code))).toBeNull()
    expect(outputFormatProblem(fence(code) + '\n' + fence({ ...code, key: 'other' }))).toBeNull()
    expect(outputFormatProblem('好的。')).toBeNull()
    expect(outputFormatProblem('# Desktop files\n' + '- A file\n'.repeat(25))).toContain('Markdown')
    expect(outputFormatProblem(fence({ ...code, confirmed: true }))).toContain('Invalid')
    expect(outputFormatProblem('```rich-html\n{"key":"partial"')).toContain('incomplete')
    expect(outputFormatProblem(fence(code) + '\n' + fence(code))).toContain('Duplicate')
    expect(outputFormatProblem('Introduction\n' + fence(code))).toContain('prose')
    expect(outputFormatProblem(fence(code) + '\nExplanation')).toContain('prose')
  })
  it('reads the human opt-out before runtime context, format notices and continuation prompts', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    try {
      const session = ctx.sessions.create(SessionId('format-opt-out'))
      const events: import('@deepseek-ai/dsh-session').SessionEvent[] = []
      ctx.on('session/event', (_session, event) => { events.push(event) })
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '用 Markdown 列出结果' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Use HTML by default' }], source: { kind: 'rich-inline-format' } }), { surfaceOp: 'append' })
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'go on' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      expect(explicitTextRequested(events)).toBe(true)
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '帮我整理桌面文件' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      expect(explicitTextRequested(events)).toBe(false)
      for (const text of ['不要用 Markdown，只输出 HTML 网页', '原文怎么还是 Markdown，应该用 HTML',
        'Do not use Markdown; return HTML.', 'Analyze this source code.', '不用源码，给我交互界面']) {
        session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        expect(explicitTextRequested(events), text).toBe(false)
      }
      for (const text of ['只输出纯文本', '请提供源码', 'Use Markdown for the answer.', 'Plain text only.', 'source code', 'Give me the source code.']) {
        session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        expect(explicitTextRequested(events), text).toBe(true)
      }
    } finally { await ctx.fiber.dispose() }
  })
})

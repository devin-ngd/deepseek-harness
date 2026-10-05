/** Read-only fork restoration is restricted to inherited, paired publication facts. */
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { RichBlockId } from '../src/shared/types.ts'
import { restoreForkBlock } from '../src/host/fork.ts'

function fixture() {
  const session = Session.create(SessionId('fork-unit-parent'))
  const blockId = brandString<RichBlockId>('block-fork-unit')
  const marker = `\`\`\`rich-inline\n${JSON.stringify({ blockId })}\n\`\`\``
  const callId = ToolCallId('fork-publication')
  const args = { html: '<div>Inherited</div>', css: '', js: '', fallbackText: 'Inherited', stateSchemaVersion: 1, values: { inherited: true } }
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'rich_inline_publish', arguments: JSON.stringify(args) })
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: `Interactive block ${blockId}, revision 1. Place this marker in your reply:\n${marker}` }] }) }, { surfaceOp: 'append' })
  const message = createAssistantMessage({ content: [{ type: 'text', text: marker }], source: { provider: 'unit', model: 'unit' } })
  session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
  const events = session.snapshotEvents()
  const sessionId = SessionId('fork-unit-child')
  return { session, events, args, blockId, message, request: { sessionId, messageId: message.id, blockId },
    inspection: { meta: { id: sessionId, parentSession: session.id }, inheritedEventCount: events.length, events } }
}

describe('rich fork restoration', () => {
  it('preserves confirmed values when inherited code repairs omit values', () => {
    const f = fixture()
    const callId = ToolCallId('code-repair')
    const { values: _values, ...code } = f.args
    f.session.append('tool/call', { turn: 2, step: 1, callId, name: 'rich_inline_publish', arguments: JSON.stringify({ ...code, blockId: f.blockId, expectedRenderRevision: 1 }) })
    f.session.append('tool/result', { turn: 2, step: 1, message: createToolResultMessage({ callId, isError: false,
      content: [{ type: 'text', text: `Interactive block ${f.blockId}, revision 2. Stored; the plugin executes and checks rendering.\n\`\`\`rich-inline\n${JSON.stringify({ blockId: f.blockId })}\n\`\`\`` }] }) }, { surfaceOp: 'append' })
    const events = f.session.snapshotEvents()
    expect(restoreForkBlock({ ...f.inspection, events, inheritedEventCount: events.length }, f.request, 2_097_152))
      .toMatchObject({ values: { inherited: true }, manifest: { renderRevision: 2 }, readOnly: true })
  })
  it('copies only immutable publication values and clears drafts, grants, and side-effect state', () => {
    const f = fixture()
    const restored = restoreForkBlock(f.inspection, f.request, 2_097_152)
    expect(restored).toMatchObject({ readOnly: true, values: { inherited: true }, files: [], archivedDrafts: [],
      draft: { fields: {}, dirty: [] } })
    expect(restored).not.toHaveProperty('actions')
    expect(restored).not.toHaveProperty('outbox')
  })
  it('rejects foreign targets, unrelated sessions, missing lineage, and markers after the inherited cut', () => {
    const f = fixture()
    expect(restoreForkBlock(f.inspection, { ...f.request, sessionId: SessionId('foreign') }, 2_097_152)).toBeNull()
    expect(restoreForkBlock({ ...f.inspection, meta: { id: f.request.sessionId } }, f.request, 2_097_152)).toBeNull()
    expect(restoreForkBlock({ ...f.inspection, inheritedEventCount: f.events.length - 1 }, f.request, 2_097_152)).toBeNull()
    expect(restoreForkBlock(f.inspection, { ...f.request, blockId: brandString<RichBlockId>('foreign-block') }, 2_097_152)).toBeNull()
  })
  it('does not import later publication data from outside the inherited prefix', () => {
    const f = fixture()
    const callId = ToolCallId('later-parent-publication')
    f.session.append('tool/call', { turn: 1, step: 2, callId, name: 'rich_inline_publish', arguments: JSON.stringify({ ...f.args, blockId: f.blockId, values: { future: 'private' } }) })
    f.session.append('tool/result', { turn: 1, step: 2, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: `Interactive block ${f.blockId}, revision 2. Place this marker in your reply:\n\`\`\`rich-inline\n${JSON.stringify({ blockId: f.blockId })}\n\`\`\`` }] }) }, { surfaceOp: 'append' })
    const restored = restoreForkBlock({ ...f.inspection, events: f.session.snapshotEvents() }, f.request, 2_097_152)
    expect(restored?.values).toEqual({ inherited: true })
    expect(restored?.manifest.renderRevision).toBe(1)
  })
})

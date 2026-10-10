/** Read-only fork restoration is restricted to inherited, paired publication facts. */
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { RichBlockId } from '../src/shared/types.ts'
import { restoreForkBlock } from '../src/host/fork.ts'

function fixture(format: 'legacy' | 'current' = 'legacy', renderRevision = 1, dataRevision = 7) {
  const session = Session.create(SessionId('fork-unit-parent'))
  const blockId = brandString<RichBlockId>('block-fork-unit')
  const marker = `\`\`\`rich-inline\n${JSON.stringify({ blockId })}\n\`\`\``
  const callId = ToolCallId('fork-publication')
  const args = { html: '<div>Inherited</div>', css: '', js: '', fallbackText: 'Inherited', stateSchemaVersion: 1, values: { inherited: true } }
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'rich_inline_publish', arguments: JSON.stringify(args) })
  const text = format === 'legacy'
    ? `Interactive block ${blockId}, revision ${renderRevision}. Place this marker in your reply:\n${marker}`
    : `Interactive block ${blockId}, render revision ${renderRevision}, data revision ${dataRevision}. Stored; the plugin executes and checks rendering.\n${marker}`
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text }] }) }, { surfaceOp: 'append' })
  const message = createAssistantMessage({ content: [{ type: 'text', text: marker }], source: { provider: 'unit', model: 'unit' } })
  session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
  const events = session.snapshotEvents()
  const sessionId = SessionId('fork-unit-child')
  return { session, events, args, blockId, message, request: { sessionId, messageId: message.id, blockId },
    inspection: { meta: { id: sessionId, parentSession: session.id }, inheritedEventCount: events.length, events } }
}

describe('rich fork restoration', () => {
  it('restores successful confirmed state replacements only inside the fork prefix', () => {
    const f = fixture('current', 1, 7)
    const update = (callId: string, expectedDataRevision: number, dataRevision: number, isError = false) => {
      const id = ToolCallId(callId)
      f.session.append('tool/call', { turn: 2, step: 1, callId: id, name: 'rich_inline_update',
        arguments: JSON.stringify({ blockId: f.blockId, expectedRenderRevision: 1, expectedDataRevision,
          values: { state: callId }, fallbackText: callId }) })
      f.session.append('tool/result', { turn: 2, step: 1,
        message: createToolResultMessage({ callId: id, isError, content: [{ type: 'text', text: 'state stored' }] }),
        meta: { richInline: { kind: 'data', blockId: f.blockId, dataRevision } } }, { surfaceOp: 'append' })
    }
    update('confirmed', 7, 8)
    update('stale', 7, 9)
    update('failed', 8, 9, true)
    const cut = f.session.snapshotEvents().length
    update('later-parent', 8, 9)
    const restored = restoreForkBlock({ ...f.inspection, events: f.session.snapshotEvents(), inheritedEventCount: cut },
      f.request, 2_097_152)
    expect(restored).toMatchObject({ values: { state: 'confirmed' }, dataRevision: 8,
      manifest: { renderRevision: 1, fallbackText: 'confirmed' }, readOnly: true, files: [], draft: { fields: {}, dirty: [] } })
  })
  it('restores the current publication result with independent render and data revisions', () => {
    const f = fixture('current')
    expect(restoreForkBlock(f.inspection, f.request, 2_097_152))
      .toMatchObject({ manifest: { renderRevision: 1 }, dataRevision: 7, readOnly: true, values: { inherited: true } })
  })
  it.each([[0, 7], [1, 0], [Number.MAX_SAFE_INTEGER + 1, 7], [1, Number.MAX_SAFE_INTEGER + 1]])(
    'rejects invalid current render revision %s and data revision %s', (renderRevision, dataRevision) => {
      const f = fixture('current', renderRevision, dataRevision)
      expect(restoreForkBlock(f.inspection, f.request, 2_097_152)).toBeNull()
    },
  )
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

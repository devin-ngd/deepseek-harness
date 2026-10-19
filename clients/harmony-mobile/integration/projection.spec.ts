/** Isolated Host extraction and browser digest provider retain the existing model-visible projection. */
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionLogOffset } from '@deepseek-ai/dsh-session/types'
import { SurfaceManager } from '@deepseek-ai/dsh-session/surface'
import { createAssistantMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { offloadRichSources, readRichSource, richSourceProjection } from '@local/rich-source-host'
import { offloadRichToolSources, richToolSourceProjection } from '@local/rich-tool-source-host'
import { offloadRichSources as baselineOffload, richSourceProjection as baselineProjection } from '../../../packages/experimental/rich-inline/src/host/source.ts'
import { createRichSourceProjection, createRichToolSourceProjection, sha256, bytesToHex } from '../src/upstream-domain.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { id } from '../src/protocol.ts'
import { jsonPayload } from '../src/wire.ts'
const digest = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)))
const defs = [createRichSourceProjection(digest), createRichToolSourceProjection(digest)]
const content = { key: 'mobile', html: '<p>鸿蒙🎨 fixed rows</p>'.repeat(80), css: 'p{color:CanvasText}', js: 'window.rich.setDraft({},[])', fallbackText: 'Fixed rich source', stateSchemaVersion: 1, values: { count: 7 } }

it('extracted Host selection matches existing Host bytes and browser surface projection preserves source identity', () => {
  const baseline = Session.create(SessionId('v15-source'), undefined, undefined, undefined, [baselineProjection])
  const original = baseline.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'before\n```rich-html\n' + JSON.stringify(content) + '\n```\nafter' }], source: { provider: 'fixed', model: 'fixed' } }) }, { surfaceOp: 'append' })
  const extracted = Session.create(baseline.id, [original], undefined, undefined, [richSourceProjection])
  expect(baselineOffload(baseline, baseline.snapshotEvents(), 1)).toBe(1)
  expect(offloadRichSources(extracted, extracted.snapshotEvents(), 1)).toBe(1)
  const decision = extracted.snapshotEvents().findLast(event => event.type === 'rich-inline/source-offload')!
  expect(decision.data).toEqual(baseline.snapshotEvents().findLast(event => event.type === 'rich-inline/source-offload')!.data)
  const browser = new SurfaceManager(extracted.snapshotEvents(), SessionLogOffset(0), defs)
  expect(browser.deriveEventMessage(original)).toEqual(extracted.deriveMessages()[0])
  expect(extracted.snapshotEvents()[0]).toEqual(original)
  if (decision.type !== 'rich-inline/source-offload') throw new Error('Missing decision')
  const target = decision.data.targets[0]!
  expect(readRichSource(extracted.snapshotEvents(), { sourceRef: target.sourceRef, field: 'html', offset: 0, length: 32 }, 32).text).toBe(content.html.slice(0, 32))
  expect(digest(JSON.stringify(content))).toBe(createHash('sha256').update(JSON.stringify(content)).digest('hex'))
})
function toolFixture() {
  const session = Session.create(SessionId('v15-tool'), undefined, undefined, undefined, [richSourceProjection, richToolSourceProjection])
  const callId = ToolCallId('v15-publish'), name = 'rich_inline_publish', args = JSON.stringify({ ...content, key: undefined })
  const original = session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'Original rich result' }, { type: 'tool-call', id: callId, name, arguments: args }], source: { provider: 'fixed', model: 'fixed' } }) }, { surfaceOp: 'append' })
  session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: args })
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'stored' }], isError: false }), meta: { richInline: { kind: 'publish', blockId: 'v15-rich', renderRevision: 1, dataRevision: 1, marker: '[[rich-inline:v15-rich]]' } } }, { surfaceOp: 'append' })
  expect(offloadRichToolSources(session, session.snapshotEvents(), 1)).toBe(1)
  return { session, original }
}
it('confirmed tool projection uses the same successful invocation association on Host and browser', () => {
  const { session, original } = toolFixture(), events = session.snapshotEvents()
  const browser = new SurfaceManager(events, SessionLogOffset(0), defs)
  expect(browser.deriveEventMessage(original)).toEqual(session.deriveMessages()[0])
  expect(JSON.stringify(browser.deriveEventMessage(original))).toContain('sourceRef')
  expect(JSON.stringify(events)).toContain(content.html)
  const phone = new SemanticPhone({ desktopId: id<'mobile-desktop'>('d'), deviceId: id<'mobile-device'>('p'), sessionId: session.id }, { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 256)
  phone.accept({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...phone.owner, instance: id<'mobile-wire-instance'>('tool-fixture'), relayCursor: 0, kind: 'reset', payload: jsonPayload({ type: 'snapshot', header: { version: 4, id: session.id, createdAt: 0, isSeeded: false }, cursor: events.at(-1)!.seq, records: events.map(event => ({ type: 'event', event })), hasMore: false, projections: { asOfSeq: events.at(-1)!.seq, values: {} } }) })
  expect(phone.view.readOnly).toBe(false)
})
it('browser confirmed-tool replay refuses changed result associations and projection decisions', () => {
  const { session } = toolFixture(), events = session.snapshotEvents()
  const changedResult = events.map(event => event.type === 'tool/result' ? { ...event, data: { ...event.data, message: { ...event.data.message, toolCallId: ToolCallId('foreign') } } } : event)
  expect(() => new SurfaceManager(changedResult, SessionLogOffset(0), defs).nodes).toThrow(/association/u)
  const decision = events.at(-1)!
  if (decision.type !== 'rich-inline/tool-offload') throw new Error('Missing decision')
  const changedHash = [...events.slice(0, -1), { ...decision, data: { targets: decision.data.targets.map(target => ({ ...target, sourceHash: '0'.repeat(64) })) } }]
  expect(() => new SurfaceManager(changedHash, SessionLogOffset(0), defs).nodes).toThrow(/hash/u)
})

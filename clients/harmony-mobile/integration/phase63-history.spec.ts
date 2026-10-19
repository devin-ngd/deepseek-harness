/** Historical projection restore uses current shared interpreters; incomplete or altered audit data never becomes interactive. */
import { expect, it } from 'vitest'
import { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { SurfaceManager } from '@deepseek-ai/dsh-session/surface'
import { offloadRichSources, richSourceProjection } from '@local/rich-source-host'
import { createRichSourceProjection, createRichToolSourceProjection, richProjectionHistoryStart, sha256, bytesToHex } from '../src/upstream-domain.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { id } from '../src/protocol.ts'
import { jsonPayload } from '../src/wire.ts'
import type { WireItem } from '../src/wire.ts'
const digest = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text))), definitions = [createRichSourceProjection(digest), createRichToolSourceProjection(digest)]
function fixture() {
  const session = Session.create(SessionId('phase63-history'), undefined, undefined, undefined, [richSourceProjection])
  const content = { key: 'history', html: '<p>Historic rich input</p>', css: '', js: '', fallbackText: 'Historical input', stateSchemaVersion: 1, values: { count: 7 } }
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: '```rich-html\n' + JSON.stringify(content) + '\n```' }], source: { provider: 'fixed', model: 'fixed' } }) }, { surfaceOp: 'append' })
  expect(offloadRichSources(session, session.snapshotEvents(), 1)).toBe(1)
  const events = session.snapshotEvents(), owner = { desktopId: id<'mobile-desktop'>('fixed'), deviceId: id<'mobile-device'>('phone'), sessionId: session.id }, limits = { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
  const phone = () => new SemanticPhone(owner, limits, 256)
  const frame = (records = events, hasMore = false): WireItem => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance: id<'mobile-wire-instance'>('history'), relayCursor: 0, kind: 'reset', payload: jsonPayload({ type: 'snapshot', header: { version: 4, id: session.id, createdAt: 0, isSeeded: false }, cursor: events.at(-1)!.seq, records: records.map(event => ({ type: 'event', event })), hasMore, projections: { asOfSeq: events.at(-1)!.seq, values: {} } }) })
  return { session, events, phone, frame }
}
it('current Host and browser projections agree, and offline cache restore preserves historical content without execution', () => {
  const f = fixture(), surface = new SurfaceManager(f.events, SessionLogOffset(0), definitions)
  const original = f.events[0]!
  expect(surface.deriveEventMessage(original)).toEqual(f.session.deriveMessages()[0])
  const phone = f.phone(); phone.accept(f.frame()); expect(phone.view.readOnly).toBe(false)
  const cached = phone.cache(), restored = f.phone(); restored.restore(cached)
  expect(restored.view.messages).toEqual(phone.view.messages); expect(restored.view.readOnly).toBe(true); expect(restored.view.notices).toContain('offline-cache')
})
it('missing original projection history remains read-only until the source records are present', () => {
  const f = fixture(), phone = f.phone()
  expect(richProjectionHistoryStart(f.events)).toBe(f.events[0]!.seq)
  phone.accept(f.frame(f.events.slice(1), true))
  expect(phone.view.readOnly).toBe(true); expect(phone.view.notices).toContain('message-projection-history-incomplete')
})
it('a changed source hash or undeclared decision field is rejected by the shared interpreter', () => {
  const f = fixture(), decision = f.events.at(-1)!
  if (decision.type !== 'rich-inline/source-offload') throw new Error('Offload decision missing')
  const badHash = [...f.events.slice(0, -1), { ...decision, data: { targets: decision.data.targets.map(target => ({ ...target, sourceHash: '0'.repeat(64) })) } }]
  expect(() => new SurfaceManager(badHash, SessionLogOffset(0), definitions).nodes).toThrow()
  const badField = [...f.events.slice(0, -1), { ...decision, data: { ...decision.data, permission: 'forged' } }]
  expect(() => new SurfaceManager(badField, SessionLogOffset(0), definitions).nodes).toThrow()
})

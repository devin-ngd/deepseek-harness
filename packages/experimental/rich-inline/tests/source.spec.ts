/** Source references reduce derived requests without replacing immutable publication facts. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionSeq, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { RichSourceTarget } from '../src/host/source.ts'
import { offloadRichSources, readRichSource, richSourceProjection } from '../src/host/source.ts'

const code = { key: 'result', html: '<div>Mnemo synthetic rows</div>'.repeat(80), css: 'div{color:CanvasText}',
  js: 'window.localFilter = value => value', fallbackText: 'Mnemo rows', stateSchemaVersion: 1,
  values: { rows: ['synthetic', 'only'] } }
function fixture() {
  const session = Session.create(SessionId('source-fixed'), undefined, undefined, undefined, [richSourceProjection])
  const text = 'before\n```rich-html\n' + JSON.stringify(code) + '\n```\nafter'
  const message = createAssistantMessage({ content: [{ type: 'text', text }, { type: 'text', text: 'unchanged' }],
    source: { provider: 'fixed', model: 'fixed' } })
  const event = session.append('assistant/message', { turn: 1, step: 1, message, stream: [] }, { surfaceOp: 'append' })
  const declared = () => {
    const decision = session.snapshotEvents().findLast(item => item.type === 'rich-inline/source-offload')
    if (decision?.type !== 'rich-inline/source-offload' || decision.data.targets[0] === undefined) throw new Error('missing selection')
    return decision.data.targets[0]
  }
  return { session, message, event, text, declared }
}

describe('authored source offload', () => {
  it('refuses duplicate authored keys during selection and durable replay', () => {
    const f = fixture()
    offloadRichSources(f.session, f.session.snapshotEvents(), 1)
    const duplicate = { ...f.event, data: { ...f.event.data, message: { ...f.message,
      content: [{ type: 'text' as const, text: f.text + '\n' + f.text }] } } }
    const session = Session.create(f.session.id, [duplicate], undefined, undefined, [richSourceProjection])
    expect(offloadRichSources(session, session.snapshotEvents(), 1)).toBe(0)
    expect(() => session.append('rich-inline/source-offload', { targets: [f.declared()] })).toThrow(/duplicate authored/u)
  })
  it('refuses an existing cached Session after the owning interpreter is revoked', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      const revoke = ctx.sessions.registerMessageProjection(richSourceProjection)
      const f = fixture()
      const session = ctx.sessions.create(f.session.id, { seed: [f.event] })
      offloadRichSources(session, session.snapshotEvents(), 1)
      expect(session.deriveMessages()[0]).not.toEqual(f.message)
      await revoke()
      expect(() => session.deriveMessages()).toThrow(/interpreter|projection/u)
    } finally { await ctx.fiber.dispose() }
  })
  it('retains another projection on adjacent content and refuses conflicting changes', () => {
    const f = fixture()
    offloadRichSources(f.session, f.session.snapshotEvents(), 1)
    const target = f.declared()
    const prior = { ...f.message, content: [f.message.content[0]!, { type: 'text' as const, text: 'another projection' }] }
    const context = { nodes: [f.event.seq], events: [f.event], baseSeq: SessionLogOffset(0), messages: new Map([[f.event.seq, prior]]) }
    const event = { type: 'rich-inline/source-offload' as const, seq: SessionSeq(1), time: 0, data: { targets: [target] } }
    expect(richSourceProjection.project(event, context).get(f.event.seq)?.content[1]).toEqual(prior.content[1])
    const conflict = { ...prior, content: [{ type: 'text' as const, text: 'different' }, prior.content[1]!] }
    expect(() => richSourceProjection.project(event, { ...context, messages: new Map([[f.event.seq, conflict]]) }))
      .toThrow(/another projection/u)
  })
  it('preserves audit, message identity and adjacent content; replay reproduces shorter requests', () => {
    const f = fixture()
    const before = JSON.stringify(f.session.deriveMessages())
    expect(offloadRichSources(f.session, f.session.snapshotEvents(), 1)).toBe(1)
    const after = JSON.stringify(f.session.deriveMessages())
    expect(after.length).toBeLessThan(before.length)
    expect(after).not.toContain(code.html)
    expect(after).toContain('sourceRef')
    expect(after).toContain('before')
    expect(after).toContain('after')
    expect(f.session.deriveMessages()[0]?.id).toBe(f.message.id)
    expect(f.session.deriveMessages()[0]?.content[1]).toEqual(f.message.content[1])
    expect(JSON.stringify(f.session.snapshotEvents())).toContain(code.html)
    expect(offloadRichSources(f.session, f.session.snapshotEvents(), 1)).toBe(0)
    const replay = Session.create(f.session.id, f.session.snapshotEvents(), undefined, undefined, [richSourceProjection])
    expect(replay.deriveMessages()).toEqual(f.session.deriveMessages())
    expect(() => Session.create(f.session.id, f.session.snapshotEvents())).toThrow(/interpreter|projection/u)
  })
  it('reads exact bounded fragments before mount and refuses foreign references, fields and ranges', () => {
    const f = fixture()
    offloadRichSources(f.session, f.session.snapshotEvents(), 1)
    const request = { sourceRef: f.declared().sourceRef, field: 'html', offset: 2, length: 10 }
    const value = readRichSource(f.session.snapshotEvents(), request, 10)
    expect(value).toMatchObject({ text: code.html.slice(2, 12), nextOffset: 12, totalChars: code.html.length })
    expect(readRichSource(f.session.snapshotEvents(), { ...request, field: 'values', offset: 0 }, 10).text).toBe(JSON.stringify(code.values).slice(0, 10))
    expect(() => readRichSource([], request, 10)).toThrow(/not declared/u)
    for (const invalid of [{ field: 'draft' }, { offset: -1 }, { offset: code.html.length + 1 }, { length: 11 }, { length: 0 }]) {
      expect(() => readRichSource(f.session.snapshotEvents(), { ...request, ...invalid }, 10)).toThrow()
    }
  })
  it.each(['sourceHash', 'start', 'partIndex', 'seq', 'sourceRef', 'blockId', 'renderRevision', 'dataRevision'] as const)(
    'refuses tampered %s without changing the original message', (field) => {
      const f = fixture()
      offloadRichSources(f.session, f.session.snapshotEvents(), 1)
      const original = f.declared()
      const bad = { ...original, [field]: typeof original[field] === 'number' ? Number(original[field]) + 1 : 'invalid' }
      const base = f.session.snapshotEvents().filter(event => event.type !== 'rich-inline/source-offload')
      const clean = Session.create(f.session.id, base, undefined, undefined, [richSourceProjection])
      expect(() => clean.append('rich-inline/source-offload', { targets: [bad as RichSourceTarget] })).toThrow()
      expect(clean.deriveMessages()[0]).toEqual(f.message)
    },
  )
  it('refuses duplicate targets, interrupted or replay-state messages and respects the threshold', () => {
    const f = fixture()
    expect(offloadRichSources(f.session, f.session.snapshotEvents(), 10_000)).toBe(0)
    offloadRichSources(f.session, f.session.snapshotEvents(), 1)
    const target = f.declared()
    const clean = Session.create(f.session.id, [f.event], undefined, undefined, [richSourceProjection])
    expect(() => clean.append('rich-inline/source-offload', { targets: [target, target] })).toThrow(/duplicate/u)
    for (const data of [{ ...f.event.data, interrupted: true as const },
      { ...f.event.data, message: createAssistantMessage({ content: f.message.content, source: { provider: 'fixed', model: 'fixed', replayState: {} } }) }]) {
      const session = Session.create(SessionId('ineligible'), undefined, undefined, undefined, [richSourceProjection])
      session.append('assistant/message', data, { surfaceOp: 'append' })
      expect(offloadRichSources(session, session.snapshotEvents(), 1)).toBe(0)
    }
  })
  it('keeps multiple complete fences independent and rejects absent surface nodes', () => {
    const f = fixture()
    const second = createAssistantMessage({ content: [{ type: 'text', text: f.text + '\n```rich-html\n' + JSON.stringify({ ...code, key: 'second' }) + '\n```' }],
      source: { provider: 'fixed', model: 'fixed' } })
    f.session.append('assistant/message', { turn: 1, step: 2, message: second, stream: [] }, { surfaceOp: 'append' })
    expect(offloadRichSources(f.session, f.session.snapshotEvents(), 1)).toBe(3)
    const target = f.declared()
    expect(() => richSourceProjection.project({ type: 'rich-inline/source-offload', seq: SessionSeq(5), time: 0, data: { targets: [target] } },
      { nodes: [], events: f.session.snapshotEvents(), baseSeq: SessionLogOffset(0), messages: new Map() })).toThrow(/absent/u)
  })
})

/** Success-only argument offload and immutable confirmed-state recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { imageOffloadProjection } from '../../../compaction/compaction-image-offload/src/projection.ts'
import { offloadRichToolSources, richToolSourceProjection } from '../src/host/tool-source.ts'
import { readRichSource, richSourceProjection } from '../src/host/source.ts'

const code = { html: '<p>Mnemo synthetic rows</p>'.repeat(80), css: 'p{color:CanvasText}', js: 'window.localFilter = value => value',
  fallbackText: 'Mnemo rows', stateSchemaVersion: 1, values: { rows: ['synthetic', 'only'] } }
function fixture() {
  const session = Session.create(SessionId('tool-source-fixed'), undefined, undefined, undefined, [richToolSourceProjection, richSourceProjection, imageOffloadProjection])
  function add(name = 'rich_inline_publish', input: object = code, options: { isError?: boolean; settled?: boolean; interrupted?: true } = {}) {
    const callId = ToolCallId(`call-${session.snapshotEvents().length}`)
    const part = { type: 'tool-call' as const, id: callId, name, arguments: JSON.stringify(input) }
    const message = createAssistantMessage({ content: [{ type: 'text', text: 'keep text' }, part], source: { provider: 'fixed', model: 'fixed' } })
    const event = session.append('assistant/message', { turn: 1, step: 1, message, stream: [], ...options.interrupted === undefined ? {} : { interrupted: true as const } }, { surfaceOp: 'append' })
    session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: part.arguments })
    if (options.settled !== false) session.append('tool/result', { turn: 1, step: 1,
      message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'stored' }], isError: options.isError ?? false }),
      meta: { richInline: name === 'rich_inline_publish' ? { kind: 'publish', blockId: 'rich-fixed', renderRevision: 1, dataRevision: 1, marker: '[[rich-inline:rich-fixed]]' }
        : { kind: 'data', blockId: 'rich-fixed', dataRevision: 2 } } }, { surfaceOp: 'append' })
    return { event, message, part }
  }
  const declare = () => offloadRichToolSources(session, session.snapshotEvents(), 1)
  const targets = () => session.snapshotEvents().flatMap(event => event.type === 'rich-inline/tool-offload' ? event.data.targets : [])
  return { session, add, declare, targets }
}
describe('successful tool source selections', () => {
  it('reduces actual Assistant arguments while retaining complete tool audit and associations', () => {
    const f = fixture()
    const original = f.add()
    const before = JSON.stringify(f.session.snapshotEvents())
    expect(f.declare()).toBe(1)
    expect(f.declare()).toBe(0)
    const projected = f.session.deriveMessages()[0]
    expect(projected?.id).toBe(original.message.id)
    expect(projected?.content[0]).toEqual(original.message.content[0])
    expect(projected?.content[1]).toMatchObject({ type: 'tool-call', id: original.part.id, name: original.part.name })
    expect(JSON.stringify(projected)).not.toContain(code.html)
    expect(JSON.stringify(projected)).toContain('richSource')
    expect(JSON.stringify(f.session.snapshotEvents().slice(0, 3))).toBe(before)
    expect(readRichSource(f.session.snapshotEvents(), { sourceRef: f.targets()[0]!.sourceRef, field: 'js', offset: 0, length: 100 }, 100).text).toBe(code.js)
  })
  it('retains failed, interrupted, incomplete, completion-fragment and replay-state calls', () => {
    for (const options of [{ isError: true }, { settled: false }, { interrupted: true as const }]) {
      const f = fixture(); const original = f.add('rich_inline_publish', code, options)
      expect(f.declare()).toBe(0)
      expect(f.session.deriveMessages()[0]).toEqual(original.message)
    }
    const f = fixture(); f.add('rich_inline_complete', { actionId: 'fixed', state: 'completed', values: code.values })
    expect(f.declare()).toBe(0)
    const events = f.session.snapshotEvents().map(event => event.type === 'assistant/message' ? { ...event,
      data: { ...event.data, message: { ...event.data.message, source: { ...event.data.message.source, replayState: {} } } } } : event)
    const replay = Session.create(f.session.id, events, undefined, undefined, [richToolSourceProjection])
    expect(offloadRichToolSources(replay, events, 1)).toBe(0)
  })
  it('keeps confirmed state revisions immutable across restore and inherited history', () => {
    const f = fixture(); f.add(); f.declare()
    const input = { blockId: 'rich-fixed', expectedRenderRevision: 1, expectedDataRevision: 1, values: { rows: ['new state'] }, fallbackText: 'new state' }
    f.add('rich_inline_update', input); f.declare()
    const [first, latest] = f.targets()
    const read = (events: readonly SessionEvent[], sourceRef: string) => readRichSource(events, { sourceRef, field: 'values', offset: 0, length: 200 }, 200)
    expect(read(f.session.snapshotEvents(), first!.sourceRef).text).toBe(JSON.stringify(code.values))
    expect(read(f.session.snapshotEvents(), latest!.sourceRef).text).toBe(JSON.stringify(input.values))
    expect(latest).toMatchObject({ renderRevision: 1, dataRevision: 2 })
    for (const id of [f.session.id, SessionId('inherited-fork')]) {
      const recovered = Session.create(id, f.session.snapshotEvents(), undefined, undefined, [richToolSourceProjection])
      expect(recovered.deriveMessages()).toEqual(f.session.deriveMessages())
      expect(read(recovered.snapshotEvents(), latest!.sourceRef)).toEqual(read(f.session.snapshotEvents(), latest!.sourceRef))
    }
    expect(() => read([], latest!.sourceRef)).toThrow(/not declared/u)
    expect(() => readRichSource(f.session.snapshotEvents(), { sourceRef: latest!.sourceRef, field: 'html', offset: 0, length: 1 }, 1)).toThrow(/not present/u)
  })
  it('does not invent values when publication retained prior confirmed state', () => {
    const f = fixture(); const withoutValues = { ...code }; delete (withoutValues as Partial<typeof code>).values
    f.add('rich_inline_publish', withoutValues); f.declare()
    expect(() => readRichSource(f.session.snapshotEvents(), { sourceRef: f.targets()[0]!.sourceRef, field: 'values', offset: 0, length: 1 }, 1)).toThrow(/not present/u)
  })
  it.each(['seq', 'partIndex', 'resultSeq', 'sourceHash', 'sourceRef', 'blockId', 'renderRevision', 'dataRevision'] as const)('refuses a tampered %s', (field) => {
    const f = fixture(); const original = f.add(); f.declare()
    const target = f.targets()[0]!
    const bad = { ...target, [field]: typeof target[field] === 'number' ? Number(target[field]) + 1 : 'invalid' }
    const session = Session.create(f.session.id, f.session.snapshotEvents().slice(0, 3), undefined, undefined, [richToolSourceProjection])
    expect(() => session.append('rich-inline/tool-offload', { targets: [bad] })).toThrow()
    expect(session.deriveMessages()[0]).toEqual(original.message)
  })
  it('refuses missing, revoked or conflicting interpreters and duplicate targets', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      const revoke = ctx.sessions.registerMessageProjection(richToolSourceProjection)
      const f = fixture(); f.add(); f.declare()
      const recovered = ctx.sessions.create(f.session.id, { seed: f.session.snapshotEvents() })
      expect(recovered.deriveMessages()).toEqual(f.session.deriveMessages())
      await revoke()
      expect(() => recovered.deriveMessages()).toThrow(/interpreter|projection/u)
      expect(() => Session.create(f.session.id, f.session.snapshotEvents())).toThrow(/interpreter|projection/u)
      const target = f.targets()[0]!
      const clean = Session.create(f.session.id, f.session.snapshotEvents().slice(0, 3), undefined, undefined, [richToolSourceProjection])
      expect(() => clean.append('rich-inline/tool-offload', { targets: [target, target] })).toThrow(/duplicate/u)
    } finally { await ctx.fiber.dispose() }
  })
  it('combines with the real image interpreter in either decision order', () => {
    for (const imageFirst of [true, false]) {
      const f = fixture()
      const user = createUserMessage({ content: [{ type: 'text', text: 'image context' }, { type: 'image',
        attachment: { attachmentId: `sha256:${'a'.repeat(64)}` as never, mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }],
      source: { kind: 'user' } })
      const image = f.session.append('user/message', user, { surfaceOp: 'append' })
      const selectImage = () => f.session.append('image/offload', { targets: [{ seq: image.seq, imageIndexes: [0] }] })
      f.add()
      if (imageFirst) selectImage()
      f.declare()
      if (!imageFirst) selectImage()
      const actual = f.session.deriveMessages()
      expect(JSON.stringify(actual)).not.toContain(code.html)
      expect(actual[0]?.content[1]).toMatchObject({ type: 'image', offloaded: true })
      expect(actual[1]?.content[1]).toMatchObject({ type: 'tool-call', id: ToolCallId('call-1') })
      const replay = Session.create(f.session.id, f.session.snapshotEvents(), undefined, undefined,
        [imageOffloadProjection, richToolSourceProjection])
      expect(replay.deriveMessages()).toEqual(actual)
    }
  })
})

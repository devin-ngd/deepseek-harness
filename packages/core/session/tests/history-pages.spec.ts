import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { getEventListeners } from 'node:events'
import SessionStore, { SESSION_FORMAT_VERSION, Session, SessionHistoryCopyError, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

describe('Session asynchronous history pages', () => {
  it.each(['detached', 'live'] as const)('keeps the %s Session cut captured when reading starts', async (mode) => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    onTestFinished(() => ctx.fiber.dispose())
    const session = mode === 'live'
      ? ctx.sessions.create(SessionId('history-live'))
      : Session.create(SessionId('history-detached'))
    const initial = Array.from({ length: 5 }, (_, turn) => session.append('turn/start', { turn }))
    const snapshot = vi.spyOn(session, 'snapshotEvents')
    const eventAt = vi.spyOn(session, 'eventAt')
    const pages = session.readHistoryPages({ pageSize: 2 })
    const afterCut = session.append('turn/start', { turn: 5 })

    const received: (readonly SessionEvent[])[] = []
    let appendedDuringRead: SessionEvent | undefined
    for await (const page of pages) {
      received.push(page)
      if (received.length === 1) appendedDuringRead = session.append('turn/start', { turn: 6 })
    }

    expect(received.map(page => page.length)).toEqual([2, 2, 1])
    expect(received.every(Object.isFrozen)).toBe(true)
    expect(received.flat()).toEqual(initial)
    expect(received[0]?.[0]).not.toBe(initial[0])
    expect(Object.isFrozen(received[0]?.[0])).toBe(true)
    expect(Object.isFrozen(received[0]?.[0]?.data)).toBe(true)
    expect(received.flat()).not.toContain(afterCut)
    expect(appendedDuringRead).toBeDefined()
    expect(received.flat()).not.toContain(appendedDuringRead)
    expect(snapshot).not.toHaveBeenCalled()
    expect(eventAt).not.toHaveBeenCalled()
  })

  it('yields to the event loop between bounded pages', async () => {
    const session = Session.create(SessionId('history-yield'))
    for (let turn = 0; turn < 3; turn++) session.append('turn/start', { turn })
    const iterator = session.readHistoryPages({ pageSize: 1 })[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toHaveLength(1)
    const eventLoopTurn = new Promise<'event-loop'>((resolve) => { setImmediate(() => { resolve('event-loop') }) })
    const nextPage = iterator.next()
    expect(await Promise.race([eventLoopTurn, nextPage.then(() => 'page' as const)])).toBe('event-loop')
    expect((await nextPage).value).toHaveLength(1)
    await iterator.return?.()
  })

  it('returns the requested half-open range and rejects invalid bounds', async () => {
    const session = Session.create(SessionId('history-range'))
    const events = Array.from({ length: 5 }, (_, turn) => session.append('turn/start', { turn }))
    const actual = []
    for await (const page of session.readHistoryPages({ pageSize: 2, fromSeq: SessionLogOffset(1), toSeqExclusive: SessionLogOffset(4) })) {
      actual.push(...page)
    }
    expect(actual).toEqual(events.slice(1, 4))
    const empty = session.readHistoryPages({ pageSize: 2, fromSeq: SessionLogOffset(2), toSeqExclusive: SessionLogOffset(2) })
    const emptyPages = []
    for await (const page of empty) emptyPages.push(page)
    expect(emptyPages).toEqual([])
    expect(() => { session.readHistoryPages({ pageSize: 0 }) }).toThrow(/pageSize/)
    expect(() => { session.readHistoryPages({ pageSize: 1.5 }) }).toThrow(/pageSize/)
    expect(() => {
      session.readHistoryPages({ pageSize: 1, fromSeq: SessionLogOffset(4), toSeqExclusive: SessionLogOffset(3) })
    }).toThrow(/range/)
    expect(() => { session.readHistoryPages({ pageSize: 1, toSeqExclusive: SessionLogOffset(6) }) }).toThrow(/range/)
    expect(() => { session.readHistoryPages({ pageSize: 1, fromSeq: -1 as never }) }).toThrow(/SessionLogOffset/)
    expect(() => { session.readHistoryPages({ pageSize: 1, toSeqExclusive: Number.NaN as never }) }).toThrow(/SessionLogOffset/)
  })

  it('stops between pages with the original abort reason', async () => {
    const session = Session.create(SessionId('history-cancel'))
    session.append('turn/start', { turn: 0 })
    session.append('turn/start', { turn: 1 })
    const controller = new AbortController()
    const iterator = session.readHistoryPages({ pageSize: 1, signal: controller.signal })[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toHaveLength(1)
    const pending = iterator.next()
    const reason = new Error('stop reading')
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    expect(() => { session.readHistoryPages({ pageSize: 1, signal: controller.signal }) }).toThrow(reason)
  })

  it('detaches and freezes restored event copies without mutating their owned originals', async () => {
    const id = SessionId('history-owned')
    const data = { turn: 1 }
    Object.defineProperty(data, '__proto__', { value: { marker: 'kept' }, enumerable: true })
    const source: SessionEvent<'turn/start'> = { type: 'turn/start', seq: SessionSeq(0), time: 1, data }
    const session = Session.fromRestore(id, [source], {
      id, version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: false,
    }, SessionLogOffset(0), 'detached')
    let event: SessionEvent | undefined
    for await (const page of session.readHistoryPages({ pageSize: 1 })) {
      event = page[0]
      break
    }
    const copied = event
    if (copied?.type !== 'turn/start') throw new Error('missing turn start')

    expect(copied).not.toBe(source)
    expect(Object.isFrozen(copied.data)).toBe(true)
    expect(Object.hasOwn(copied.data, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(copied.data)).toBe(Object.prototype)
    expect(() => { copied.data.turn = 99 }).toThrow(TypeError)
    expect(source.data.turn).toBe(1)
    expect(Object.isFrozen(source)).toBe(false)
  })

  it('rejects an event that cannot be copied losslessly', async () => {
    const id = SessionId('history-invalid-copy')
    const source: SessionEvent<'turn/start'> = {
      type: 'turn/start', seq: SessionSeq(0), time: 1, data: Object.assign({ turn: 1 }, { invalid: undefined }),
    }
    const session = Session.fromRestore(id, [source], {
      id, version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: false,
    }, SessionLogOffset(0), 'detached')
    const iterator = session.readHistoryPages({ pageSize: 1 })[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toBeInstanceOf(SessionHistoryCopyError)
  })
})

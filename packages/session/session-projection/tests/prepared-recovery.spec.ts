import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore, { Session, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionHistoryReadOptions, SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  onTestFinished(() => ctx.fiber.dispose())
  return ctx
}

function pauseFirstPage(session: Session) {
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const aborted = Promise.withResolvers<undefined>()
  const original = session.readHistoryPages.bind(session)
  let paused = false
  const pagesRead = vi.spyOn(session, 'readHistoryPages').mockImplementation((options: SessionHistoryReadOptions) => {
    options.signal?.addEventListener('abort', () => { aborted.resolve(undefined) }, { once: true })
    const pages = original(options)
    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<readonly SessionEvent[]> {
        for await (const page of pages) {
          if (!paused) {
            paused = true
            entered.resolve(undefined)
            await release.promise
          }
          yield page
        }
      },
    }
  })
  return { pagesRead, entered: entered.promise, aborted: aborted.promise, release: () => { release.resolve(undefined) } }
}

describe('prepared host projection recovery', () => {
  it('rejects a wire projection at the runtime registration boundary', async () => {
    const ctx = await harness()
    await expect(ctx.sessionProjections.registerPrepared({
      key: 'test/not-host-only', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: (count: number) => count,
      wire: { viewSchema: z.number(), view: (count: number) => count },
    } as never)).rejects.toThrow('host-only projections')
  })

  it.each(['live', 'independent'] as const)('catches up events appended during %s recovery', async (mode) => {
    const ctx = await harness()
    const session = mode === 'live' ? ctx.sessions.create(SessionId('prepared-live')) : Session.create(SessionId('prepared-independent'))
    session.append('turn/start', { turn: 1 })
    const subscribe = session.onCommit.bind(session)
    vi.spyOn(session, 'onCommit').mockImplementationOnce((listener, signal) => {
      subscribe(listener, signal)
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    })
    const readHistory = vi.spyOn(session, 'snapshotEvents')
    const readEvent = vi.spyOn(session, 'eventAt')
    const gate = pauseFirstPage(session)
    const folded: number[] = []
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-history', stateSchema: z.number(), stateVersion: 1,
      init: () => 0,
      apply: (count, event) => {
        folded.push(event.seq)
        return count + 1
      },
    })
    expect(() => { handle.stateOf(session) }).toThrow('requires Session preparation')
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    const preparing = handle.prepare(session, { pageSize: 1 })
    await gate.entered
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    session.append('turn/start', { turn: 2 })
    session.append([['turn/start', { turn: 3 }], ['turn/start', { turn: 4 }]])
    gate.release()
    await preparing
    expect(gate.pagesRead.mock.calls.map(([options]) => [options.fromSeq, options.toSeqExclusive, options.pageSize])).toEqual([[0, 2, 1]])
    expect(folded).toEqual([0, 1, 2, 3, 4])
    expect(handle.stateOf(session)).toBe(5)
    expect(handle.stateIfReady(session)).toEqual({ ready: true, state: 5 })
    expect(readHistory).not.toHaveBeenCalled()
    expect(readEvent).not.toHaveBeenCalled()
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    expect(handle.stateIfReady(session)).toEqual({ ready: true, state: 6 })
    expect(readHistory).not.toHaveBeenCalled()
    expect(readEvent).not.toHaveBeenCalled()
    await handle.dispose()
  })

  it('follows a prepared Session into the store and replaces its owner on hot reload', async () => {
    const ctx = await harness()
    const owner = await ctx.plugin(Object.assign(function projectionOwner() {}, { inject: ['sessionProjections'] }))
    const session = Session.create(SessionId('prepared-enter'))
    const apply = vi.fn((state: number) => state + 1)
    const definition = { key: 'test/enter', stateSchema: z.number(), stateVersion: 1, init: () => 0, apply }
    const handle = await owner.ctx.sessionProjections.registerPrepared(definition)
    await handle.prepare(session, { pageSize: 1 })
    const pages = vi.spyOn(session, 'readHistoryPages')
    session.append('turn/start', { turn: 1 })
    const detach = ctx.sessions.enter(session)
    onTestFinished(detach)
    ctx.sessions.announce(session)
    const observed: number[] = []
    const stop = ctx.on('session/event', () => { observed.push(handle.stateOf(session)) })
    session.append([['turn/start', { turn: 2 }], ['turn/start', { turn: 3 }]])
    expect(observed).toEqual([3, 3])
    expect(apply).toHaveBeenCalledTimes(3)
    expect(pages).not.toHaveBeenCalled()
    stop()
    await owner.dispose()
    const replacement = await ctx.sessionProjections.registerPrepared({ ...definition, stateVersion: 2, apply: n => n + 10 })
    expect(replacement.stateIfReady(session)).toEqual({ ready: false })
    await replacement.prepare(session, { pageSize: 1 })
    session.append('turn/start', { turn: 4 })
    expect(replacement.stateIfReady(session)).toEqual({ ready: true, state: 40 })
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    expect(apply).toHaveBeenCalledTimes(3)
  })

  it('isolates a failed independent batch fold and retries without duplicating its subscription', async () => {
    const ctx = await harness()
    const warn = vi.spyOn(ctx.logger, 'warn')
    const session = Session.create(SessionId('independent-failure'))
    const other = Session.create(session.id)
    const failure = new Error('fold interrupted')
    let fail = true
    const broken = await ctx.sessionProjections.registerPrepared({
      key: 'test/retry', stateSchema: z.number(), stateVersion: 1, init: () => 0,
      apply: (state, event) => {
        if (fail && event.seq === 1) throw failure
        return state + 1
      },
    })
    const healthy = await ctx.sessionProjections.registerPrepared({
      key: 'test/count', stateSchema: z.number(), stateVersion: 1, init: () => 0, apply: n => n + 1,
    })
    await Promise.all([
      broken.prepare(session, { pageSize: 1 }), broken.prepare(other, { pageSize: 1 }), healthy.prepare(session, { pageSize: 1 }),
    ])
    session.append([['turn/start', { turn: 1 }], ['turn/start', { turn: 2 }]])
    other.append('turn/start', { turn: 1 })
    expect(broken.stateOf(other)).toBe(1)
    expect(healthy.stateOf(session)).toBe(2)
    expect(() => broken.stateIfReady(session)).toThrow(failure)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test/retry'), failure)
    expect(ctx.sessionProjections.checkpoint(session)).not.toHaveProperty('test/retry')
    fail = false
    await broken.prepare(session, { pageSize: 1 })
    session.append('turn/start', { turn: 3 })
    expect(broken.stateOf(session)).toBe(3)
  })

  it('waits for the full prefix when a nonempty independent Session enters the store', async () => {
    const ctx = await harness()
    const definition = { key: 'count', stateSchema: z.number(), stateVersion: 1, init: () => 0, apply: (n: number) => n + 1 }
    const first = await ctx.sessionProjections.registerPrepared(definition)
    const shared = await ctx.sessionProjections.registerPrepared(definition)
    const sum = await ctx.sessionProjections.registerPrepared({
      ...definition, key: 'sequenceSum', apply: (n, event) => n + event.seq,
    })
    const session = Session.create(SessionId('enter-with-prefix'))
    session.append('turn/start', { turn: 1 })
    const detach = ctx.sessions.enter(session)
    onTestFinished(detach)
    ctx.sessions.announce(session)
    session.append('turn/start', { turn: 2 })
    expect(first.stateIfReady(session)).toEqual({ ready: false })
    expect(ctx.sessionProjections.checkpoint(session)).toEqual({})
    await Promise.all([first.prepare(session, { pageSize: 1 }), sum.prepare(session, { pageSize: 1 })])
    await first.dispose()
    const cuts: unknown[] = []
    ctx.on('session/event', () => { cuts.push(ctx.sessionProjections.checkpoint(session)) })
    session.append([['turn/start', { turn: 3 }], ['turn/start', { turn: 4 }]])
    const expected = { count: { ver: 1, seq: 3, val: 4 }, sequenceSum: { ver: 1, seq: 3, val: 6 } }
    expect(cuts).toEqual([expected, expected])
    expect(shared.stateIfReady(session)).toEqual({ ready: true, state: 4 })
  })

  it('uses only the valid checkpoint prefix during SessionStore preparation', async () => {
    const ctx = await harness()
    const apply = vi.fn((state: number) => state + 1)
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'count', stateSchema: z.number(), stateVersion: 1, init: () => 0, apply,
    })
    const seed = Session.create(SessionId('checkpoint-source')).append([
      ['turn/start', { turn: 1 }], ['turn/start', { turn: 2 }],
    ])
    for (const [row, prefix] of [
      [{ ver: 1, seq: SessionSeq(0), val: 1 }, 1],
      [undefined, 0],
      [{ ver: 2, seq: SessionSeq(0), val: 99 }, 0],
      [{ ver: 1, seq: SessionSeq(0), val: 'invalid' }, 0],
      [{ ver: 1, seq: SessionSeq(9), val: 99 }, 0],
    ] as const) {
      apply.mockClear()
      const session = ctx.sessions.prepare(undefined, { seed }, (subject, events) => {
        ctx.sessionProjections.prepare(subject, row === undefined ? {} : { count: row }, events)
      })
      const pages = vi.spyOn(session, 'readHistoryPages')
      await handle.prepare(session, { pageSize: 1 })
      expect(pages).not.toHaveBeenCalled()
      expect(handle.stateOf(session)).toBe(session.seq)
      expect(apply).toHaveBeenCalledTimes(session.seq - prefix)
    }
  })

  it('keeps a shared recovery alive when one waiter cancels', async () => {
    const ctx = await harness()
    const session = Session.create(SessionId('prepared-two-waiters'))
    session.append('turn/start', { turn: 1 })
    const gate = pauseFirstPage(session)
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-cancel', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const cancel = new AbortController()
    const first = handle.prepare(session, { pageSize: 1, signal: cancel.signal })
    const second = handle.prepare(session, { pageSize: 1 })
    await gate.entered
    const reason = new Error('caller cancelled')
    cancel.abort(reason)
    await expect(first).rejects.toBe(reason)
    gate.release()
    await second
    expect(handle.stateOf(session)).toBe(1)
    await handle.dispose()
  })

  it('does not share a key between legacy and explicitly prepared registrations', async () => {
    const ctx = await harness()
    const definition = {
      key: 'test/prepared-conflict', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: (count: number) => count,
    }
    const legacy = await ctx.sessionProjections.register(definition)
    await expect(ctx.sessionProjections.registerPrepared(definition)).rejects.toThrow('different preparation semantics')
    await legacy.dispose()
    const prepared = await ctx.sessionProjections.registerPrepared(definition)
    await expect(Promise.resolve(ctx.sessionProjections.register(definition))).rejects.toThrow('different preparation semantics')
    await prepared.dispose()
  })

  it.each(['handle', 'fiber'] as const)('drains recovery when its %s is disposed', async (release) => {
    const ctx = await harness()
    const owner = await ctx.plugin(Object.assign(function projectionOwner() {}, { inject: ['sessionProjections'] }))
    const session = Session.create(SessionId('prepared-disposed'))
    session.append('turn/start', { turn: 1 })
    const gate = pauseFirstPage(session)
    const apply = vi.fn((count: number) => count + 1)
    const subscribed = vi.spyOn(session, 'onCommit')
    const handle = await owner.ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-dispose', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply,
    })
    const preparing = handle.prepare(session, { pageSize: 1 })
    await gate.entered
    session.append('turn/start', { turn: 2 })
    const disposing = release === 'handle' ? handle.dispose() : owner.dispose()
    await gate.aborted
    expect(subscribed.mock.calls[0]?.[1].aborted).toBe(true)
    session.append('turn/start', { turn: 3 })
    gate.release()
    await expect(preparing).rejects.toThrow('registration disposed')
    await disposing
    expect(apply).not.toHaveBeenCalled()
    expect(subscribed).toHaveBeenCalledTimes(1)
  })

  it('waits for an abandoned recovery to stop before allowing a retry', async () => {
    const ctx = await harness()
    const session = Session.create(SessionId('prepared-abandoned'))
    session.append('turn/start', { turn: 1 })
    const gate = pauseFirstPage(session)
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-abandoned', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const cancel = new AbortController()
    const first = handle.prepare(session, { pageSize: 1, signal: cancel.signal })
    await gate.entered
    session.append('turn/start', { turn: 2 })
    const reason = new Error('stop the only waiter')
    cancel.abort(reason)
    await gate.aborted
    const retry = handle.prepare(session, { pageSize: 1 })
    gate.release()
    await expect(first).rejects.toBe(reason)
    await retry
    expect(handle.stateOf(session)).toBe(2)
    await handle.dispose()
  })

  it('contains a failed unit without interrupting other live projections', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('prepared-failure'))
    session.append('turn/start', { turn: 1 })
    const broken = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-failure', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: (): number => { throw new Error('cannot fold') },
    })
    const healthy = await ctx.sessionProjections.register({
      key: 'test/prepared-other', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    await expect(broken.prepare(session, { pageSize: 1 })).rejects.toThrow('cannot fold')
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(healthy.stateOf(session)).toBe(2)
    // oxlint-disable-next-line typescript/no-deprecated -- Existing legacy readers remain isolated from unprepared units.
    expect(ctx.sessionProjections.stateOf(session, 'test/prepared-other')).toBe(2)
    expect(() => { broken.stateOf(session) }).toThrow('cannot fold')
    expect(() => { broken.stateIfReady(session) }).toThrow('cannot fold')
    await broken.dispose()
    await healthy.dispose()
  })

  it('distinguishes a ready undefined state from an unprepared Session', async () => {
    const ctx = await harness()
    const session = Session.create(SessionId('prepared-undefined'))
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-undefined', stateSchema: z.undefined(), stateVersion: 1,
      init: () => undefined, apply: state => state,
    })
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    await handle.prepare(session, { pageSize: 1 })
    expect(handle.stateIfReady(session)).toEqual({ ready: true, state: undefined })
    await handle.dispose()
  })

  it('does not fold prepared-only units during an unrelated cold restore', async () => {
    const ctx = await harness()
    const session = Session.create(SessionId('prepared-cold-isolation'))
    session.append('turn/start', { turn: 1 })
    const events = session.snapshotEvents()
    const broken = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-cold-failure', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: (): number => { throw new Error('should stay isolated') },
    })
    expect(ctx.sessionProjections.restoreFloor({})).toBeUndefined()
    const healthy = await ctx.sessionProjections.register({
      key: 'test/prepared-cold-other', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const restored = ctx.sessionProjections.restore({}, events, SessionLogOffset(0), session.header, session.inheritedEventCount)
    expect(restored.checkpoint['test/prepared-cold-other']?.val).toBe(1)
    expect(restored.checkpoint).not.toHaveProperty('test/prepared-cold-failure')
    await broken.dispose()
    await healthy.dispose()
  })

  it('contains an initialization failure when a new Session is announced', async () => {
    const ctx = await harness()
    const broken = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-init-failure', stateSchema: z.number(), stateVersion: 1,
      init: (): number => { throw new Error('cannot initialize') }, apply: count => count,
    })
    const healthy = await ctx.sessionProjections.register({
      key: 'test/prepared-init-other', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const session = ctx.sessions.create(SessionId('prepared-init-failure'))
    session.append('turn/start', { turn: 1 })
    expect(healthy.stateOf(session)).toBe(1)
    expect(() => { broken.stateOf(session) }).toThrow('cannot initialize')
    await broken.dispose()
    await healthy.dispose()
  })

  it('reports a live fold failure without stopping later projection listeners', async () => {
    const ctx = await harness()
    const warn = vi.spyOn(ctx.logger, 'warn')
    const broken = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-live-failure', stateSchema: z.number(), stateVersion: 1,
      init: () => 0,
      apply: (count, event) => {
        if (event.type === 'turn/end') throw new Error('live fold failed')
        return count + 1
      },
    })
    const healthy = await ctx.sessionProjections.register({
      key: 'test/prepared-live-other', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const session = ctx.sessions.create(SessionId('prepared-live-failure'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(healthy.stateOf(session)).toBe(2)
    expect(() => { broken.stateOf(session) }).toThrow('live fold failed')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test/prepared-live-failure'), expect.any(Error))
    expect(ctx.sessionProjections.checkpoint(session)).not.toHaveProperty('test/prepared-live-failure')
    await broken.dispose()
    await healthy.dispose()
  })
})

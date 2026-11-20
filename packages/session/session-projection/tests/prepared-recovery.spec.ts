import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore, { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
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
  vi.spyOn(session, 'readHistoryPages').mockImplementation((options: SessionHistoryReadOptions) => {
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
  return { entered: entered.promise, aborted: aborted.promise, release: () => { release.resolve(undefined) } }
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
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const readHistory = vi.spyOn(session, 'snapshotEvents')
    const readEvent = vi.spyOn(session, 'eventAt')
    const gate = pauseFirstPage(session)
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-history', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    expect(() => { handle.stateOf(session) }).toThrow('requires Session preparation')
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    const preparing = handle.prepare(session, { pageSize: 1 })
    await gate.entered
    expect(handle.stateIfReady(session)).toEqual({ ready: false })
    session.append('turn/start', { turn: 2 })
    gate.release()
    await preparing
    expect(handle.stateOf(session)).toBe(3)
    expect(handle.stateIfReady(session)).toEqual({ ready: true, state: 3 })
    expect(readHistory).not.toHaveBeenCalled()
    expect(readEvent).not.toHaveBeenCalled()
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    if (mode === 'live') {
      expect(handle.stateOf(session)).toBe(4)
    } else {
      expect(() => { handle.stateOf(session) }).toThrow('requires Session preparation')
      expect(handle.stateIfReady(session)).toEqual({ ready: false })
      await handle.prepare(session, { pageSize: 1 })
      expect(handle.stateOf(session)).toBe(4)
    }
    await handle.dispose()
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

  it('cancels an in-flight recovery when its registration is disposed', async () => {
    const ctx = await harness()
    const session = Session.create(SessionId('prepared-disposed'))
    session.append('turn/start', { turn: 1 })
    const gate = pauseFirstPage(session)
    const handle = await ctx.sessionProjections.registerPrepared({
      key: 'test/prepared-dispose', stateSchema: z.number(), stateVersion: 1,
      init: () => 0, apply: count => count + 1,
    })
    const preparing = handle.prepare(session, { pageSize: 1 })
    await gate.entered
    const disposing = handle.dispose()
    gate.release()
    await expect(preparing).rejects.toThrow('registration disposed')
    await disposing
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
    const reason = new Error('stop the only waiter')
    cancel.abort(reason)
    await gate.aborted
    const retry = handle.prepare(session, { pageSize: 1 })
    gate.release()
    await expect(first).rejects.toBe(reason)
    await retry
    expect(handle.stateOf(session)).toBe(1)
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

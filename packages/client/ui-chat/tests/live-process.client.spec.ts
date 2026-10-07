/** Contribution removal restores ordinary Chat policy without mutating transcript preferences. */
import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ChatLiveProcess } from '../src/client/live-process.ts'

it('follows mode changes and unwinds contribution subscriptions idempotently', () => {
  const registry = new ChatLiveProcess(), source = registry.forSession(SessionId('live'))
  let enabled = false, invalidate: () => void = () => {}
  const offSubscription = vi.fn(), listener = vi.fn()
  const offListener = source.subscribe(listener)
  expect(source.getSnapshot()).toBe(false)
  const remove = registry.register({ enabled: () => enabled,
    subscribe: (callback) => { invalidate = callback; return offSubscription } })
  enabled = true
  invalidate()
  expect(source.getSnapshot()).toBe(true)
  expect(listener).toHaveBeenCalledTimes(2)
  remove(); remove()
  expect(source.getSnapshot()).toBe(false)
  expect(offSubscription).toHaveBeenCalledTimes(1)
  offListener()
})

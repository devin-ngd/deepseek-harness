/** Queue input in the retiring driver's final microtask. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'python-sdk-retiring-agent-fixture'

export function apply(ctx, config) {
  ctx.on('agent/created', ({ agent }) => {
    let queued = false
    agent.ctx.on('session/event', (session, event) => {
      if (session !== agent.session || event.type !== 'turn/end' || queued) return
      queued = true
      queueMicrotask(() => {
        agent[config.delivery](createUserMessage({
          content: [{ type: 'text', text: 'LATE_INPUT' }], source: { kind: 'test' },
        }))
      })
    })
  })
}

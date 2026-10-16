/** DevFlow task panel client entry: registers the turn-tail status card. */
import type { Context } from '@deepseek-ai/cordis'
import { DevflowTaskCard } from './DevflowTaskCard.tsx'

export const name = 'dsh-client-ui-devflow'
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  // The turn-tail card: a compact DevFlow status indicator rendered beneath
  // the conversation flow. Shows "ready" when no task is active and the task
  // summary when devflow tools have produced state.
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'devflow-task-card',
        order: 50,
        inject: (sessionId: string) => ({ sessionId }),
      },
      DevflowTaskCard,
    ),
  )
}

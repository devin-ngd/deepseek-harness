/** DevFlow task panel client entry: registers the turn-tail status card. */
import type { Context } from '@deepseek-ai/cordis'
import { DevflowTaskCard } from './DevflowTaskCard.tsx'

export const name = 'dsh-client-ui-devflow'
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'devflow-task-card',
        order: 50,
        select: (owner: unknown) => {
          const o = owner as { sessionId?: string } | undefined
          return o?.sessionId ?? undefined
        },
        inject: (sessionId: string) => ({ sessionId }),
      },
      DevflowTaskCard,
    ),
  )
}

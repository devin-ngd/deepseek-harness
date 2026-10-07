/** Per-invocation plans use resolved Conversation locations for final Turn artifacts. */
import type {} from '@deepseek-ai/dsh-tools/types'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { submittedPlan, type SubmittedPlan } from './plan.ts'

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Approved plan when recorded, otherwise the submission including rejected or dismissed reviews. */
    'submitted-plan': SubmittedPlan
  }
}

/** One card per invocation; approval results retain the original card position. */
export const planDefinition: ConversationNodeDefinition<SubmittedPlan> = {
  kind: 'submitted-plan',
  target: 'chat',
  match: (event) => {
    const plan = submittedPlan(event)
    return plan === undefined ? null : { id: plan.callId,
      role: event.type === 'tool/ptc-dispatch' || event.type === 'tool/result' ? 'update' : 'start' }
  },
  start: (_context, match) => submittedPlan(match.event) as SubmittedPlan,
  update: (context, match) => submittedPlan(match.event) ?? context.state,
  buildViewNode: (context) => {
    const start = context.start ?? context.matches[0]
    const data = context.state ?? (start === undefined ? undefined : submittedPlan(start.event))
    if (data === undefined || start === undefined) return null
    return {
      key: context.key, kind: 'submitted-plan', id: context.id, target: 'chat',
      anchorSeq: start.event.seq, location: start.location,
      visibility: 'hidden', data,
    } satisfies ChatNode<'submitted-plan'>
  },
}

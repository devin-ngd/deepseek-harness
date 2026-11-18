/** Session-list metadata projection definition registered by `SessionQueryEngine`. */

import type {} from '@deepseek-ai/dsh-commands/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { SessionListMetadata } from './types.ts'

const sessionListMetadataSchema: z.ZodType<SessionListMetadata> = z.object({
  blank: z.boolean(),
  lastPromptAt: z.number().nullable(),
})

/** Fold one committed event into Session-list metadata.
 * @param state - blankness and human-prompt recency before this event.
 * @param event - the next committed event.
 * @returns the original or updated metadata.
 */
export function applySessionListMetadata(
  state: SessionListMetadata,
  event: SessionEvent,
): SessionListMetadata {
  const blank = state.blank && event.type !== 'turn/start' && event.type !== 'command/run'
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  return blank === state.blank && lastPromptAt === state.lastPromptAt
    ? state
    : { blank, lastPromptAt }
}

/** Blankness and latest human-prompt time folded per Session; persisted at state version 2. */
export const sessionListMetadataDefinition = {
  key: 'sessionListMetadata',
  stateSchema: sessionListMetadataSchema,
  init: () => ({ blank: true, lastPromptAt: null }),
  apply: applySessionListMetadata,
  wire: { viewSchema: sessionListMetadataSchema, view: state => state },
  stateVersion: 2,
  // A blank version-1 row may have run a command and needs a log read.
  migrate: (state, version) => version === 1 && !state.blank ? state : undefined,
} satisfies ProjectionDefinition<'sessionListMetadata', SessionListMetadata>

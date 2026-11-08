/** Durable sequence of explicit selections for Host model comparison. */

import { SessionSeq, type SessionSeqCursor } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

/** Tracks the latest model-selection event independently of request consumption. */
export const modelSelectionRevisionProjection = {
  key: 'modelSelectionRevision',
  stateSchema: z.number().int().min(-1).transform(value => value === -1 ? -1 : SessionSeq(value)),
  init: (): SessionSeqCursor => -1,
  apply: (revision, event) => event.type === 'model/selection' ? event.seq : revision,
  stateVersion: 1,
} satisfies ProjectionDefinition<string, SessionSeqCursor>

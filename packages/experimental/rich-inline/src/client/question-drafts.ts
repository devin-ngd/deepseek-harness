/** Persisted HTML-form drafts remain independent of live Agent progress and page code. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { z } from 'zod'

/** Complete form draft associated with one immutable question batch. */
export interface RichQuestionDraft {
  signature: string
  answers: { id: string; selected: string[]; custom: string; skipped: boolean }[]
  plan: string
}

const draftSchema = z.object({ signature: z.string(), plan: z.string(), answers: z.array(z.object({
  id: z.string(), selected: z.array(z.string()), custom: z.string(), skipped: z.boolean(),
})) })

/**
 * Validate a browser-persisted draft against its immutable question batch.
 * @param value - untrusted local storage value.
 * @param signature - current question batch serialization.
 * @param ids - current question order.
 * @returns restored draft, or undefined for malformed or unrelated storage.
 */
export function restoreRichQuestionDraft(value: unknown, signature: string, ids: readonly string[]): RichQuestionDraft | undefined {
  const parsed = draftSchema.safeParse(value)
  return parsed.success && parsed.data.signature === signature && parsed.data.answers.length === ids.length
    && parsed.data.answers.every((answer, index) => answer.id === ids[index]) ? parsed.data : undefined
}

interface RichQuestionDraftState { byRequest: Record<string, RichQuestionDraft> }
type RichQuestionDraftActions = {
  save: (state: RichQuestionDraftState, key: string, value: RichQuestionDraft) => void
  prune: (state: RichQuestionDraftState, keep: readonly string[]) => void
}

/** Create an independent HTML-form store for each slot registration.
 * @returns a Session-scoped persisted form store owned by the slot registry.
 */
export function createRichQuestionDraftStore(): EngineStoreHandle<RichQuestionDraftState, RichQuestionDraftActions> {
  return defineStore({
    init: () => ({ byRequest: {} as Record<string, RichQuestionDraft> }),
    persist: 'dsh.rich-inline.questions.v1',
    actions: {
      save(state, key: string, value: RichQuestionDraft) { state.byRequest[key] = value },
      prune(state, keep: readonly string[]) {
        state.byRequest = Object.fromEntries(Object.entries(state.byRequest).filter(([key]) => keep.includes(key)))
      },
    },
  })
}

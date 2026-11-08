/** Public creation choices and explicit per-Session model selections from the paired desktop. */
import { z } from 'zod'
const text = z.string().min(1).max(256)
/** Explicit route, including an optional supported reasoning effort. */
export const creationModelSelectionSchema = z.object({
  provider: text, model: text, reasoningEffort: text.optional(),
}).strict()
/** Parsed Session-local model choice. */
export type CreationModelSelection = z.output<typeof creationModelSelectionSchema>
/** Sanitized catalogue used by the native new-task sheet. */
export const sessionCreationOptionsSchema = z.object({
  presets: z.array(z.object({ id: text, name: text, isDefault: z.boolean() }).strict()).max(256),
  models: z.array(z.object({
    provider: text, model: text, label: z.string().min(1).max(1024), efforts: z.array(text).max(32),
  }).strict()).max(2048),
  defaultModel: creationModelSelectionSchema,
}).strict()
/** Device-visible creation catalogue. */
export type SessionCreationOptions = z.output<typeof sessionCreationOptionsSchema>

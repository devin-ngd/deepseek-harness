/** Model-facing publication and explicit, causally correlated action settlement. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RichBlockId, RichActionId, RichValues } from '../shared/types.ts'
import { isRichValues, typedRichValuesValid } from '../shared/validate.ts'

/** Fully assembled publication; incomplete streamed arguments never execute this callback. */
export interface RichPublishInput {
  readonly blockId: string | undefined
  readonly html: string
  readonly css: string
  readonly js: string
  readonly fallbackText: string
  readonly stateSchemaVersion: number
  readonly values: RichValues | undefined
  readonly expectedRenderRevision?: number
}
/** Publication identity and the marker the model places in its assistant reply. */
export interface RichPublishValue { readonly blockId: RichBlockId; readonly renderRevision: number; readonly marker: string }
/** Capabilities captured by the owning Host; no ambient tool runtime reaches content. */
export interface RichToolOwner {
  publish(sessionId: SessionId, input: RichPublishInput): Promise<RichPublishValue>
  prepareCompletion(sessionId: SessionId, actionId: RichActionId, callId: ToolCallId): Promise<void>
}

function parsedValues(value: JsonValue | undefined, maxBytes: number): RichValues {
  const candidate = value ?? {}
  if (!isRichValues(candidate) || !typedRichValuesValid(candidate) || Buffer.byteLength(JSON.stringify(candidate)) > maxBytes) throw new TypeError('values must contain bounded JSON and valid typed values')
  return candidate
}

/** Register tools through reversible effects and preserve outcomes in existing tool-result metadata.
 * @param ctx - tool registration owner.
 * @param owner - private publication and ledger capabilities.
 * @param maxValueBytes - configured bound on complete structured tool results.
 * @returns nothing; registrations unwind with the plugin fiber.
 */
export function installRichTools(ctx: Context, owner: RichToolOwner, maxValueBytes: number): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_publish',
    description: 'Author complete HTML/CSS/JavaScript for an interactive block inside chat. The plugin owns validation, isolated execution, rendering, and bounded error feedback; publication is not runtime success. Do not render with browser/shell tools or deliver screenshots/files unless explicitly requested. For visual tasks, your final reply contains only the exact returned rich-inline marker(s), with essential instructions inside the HTML; no explanatory prose unless requested. The isolated SDK is window.rich: onState(callback), getState(), getDraft(), setDraft(fields), submit(values,{actionId,fileGrants}), status(actionId), cancel(actionId), bindForm(form). onState fires after initialization and updates. Keep filters, tabs, and animation local. Never access host files, credentials, or network. For render feedback, repair the existing blockId and preserve stateSchemaVersion and confirmed values. Existing block updates need no additional marker. Use rich_inline_complete only after processing a submitted business interaction.',
    parameters: {
      blockId: { type: 'string', description: 'Existing block owned by this session, omitted for a new block.' },
      expectedRenderRevision: { type: 'integer', description: 'Required when repairing Render feedback: use its renderRevision to refuse stale code replacement.' },
      html: { type: 'string', required: true }, css: { type: 'string', required: true }, js: { type: 'string', required: true },
      fallbackText: { type: 'string', required: true, description: 'Useful plain-text content if scripting or rendering is unavailable.' },
      stateSchemaVersion: { type: 'integer', required: true }, values: { type: 'json' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        blockId: { type: 'string', required: true }, renderRevision: { type: 'integer', required: true }, marker: { type: 'string', required: true },
      } },
      render: (args, value) => [{ type: 'text', text: `Interactive block ${value.blockId}, revision ${value.renderRevision}. Stored; the plugin executes and checks rendering. ${args.blockId === undefined ? 'Final visual result: return only this marker, unless explanation was requested:' : 'Existing block updated; no duplicate marker or explanatory reply is needed:'}\n${value.marker}` }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich publication requires an owning Agent')
      return owner.publish(exec.agent.id, { ...args, blockId: args.blockId,
        values: args.values === undefined ? undefined : parsedValues(args.values, maxValueBytes) })
    },
  })), 'rich-inline.publish-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_complete',
    description: 'Settle the exact actionId supplied in an interactive user input after its requested work is complete. Completed means the work succeeded; failed means its failure is known. This does not promise exactly-once external effects. Return structured values for the block. Do not settle another session or infer completion from being idle.',
    parameters: { actionId: { type: 'string', required: true }, state: { type: 'string', enum: ['completed', 'failed'], required: true }, values: { type: 'json' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        actionId: { type: 'string', required: true }, state: { type: 'string', enum: ['completed', 'failed'], required: true }, values: { type: 'json', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `rich-inline settlement ${JSON.stringify(value)}` }],
      presentationMeta: (_args, value) => ({ richInline: { kind: 'complete', ...value } }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich completion requires an owning Agent')
      const values = parsedValues(args.values, maxValueBytes)
      await owner.prepareCompletion(exec.agent.id, args.actionId as RichActionId, exec.callId)
      return { actionId: args.actionId, state: args.state, values }
    },
  })), 'rich-inline.complete-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_progress',
    description: 'Report progress for the exact actionId supplied in an interactive input. Progress is not completion. Use non-negative integer done and total, with done no larger than total; label describes the work already performed.',
    parameters: { actionId: { type: 'string', required: true }, done: { type: 'integer', required: true }, total: { type: 'integer', required: true }, label: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        actionId: { type: 'string', required: true }, done: { type: 'integer', required: true }, total: { type: 'integer', required: true }, label: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `rich-inline progress ${JSON.stringify(value)}` }],
      presentationMeta: (_args, value) => ({ richInline: { kind: 'progress', ...value } }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich progress requires an owning Agent')
      if (!Number.isSafeInteger(args.done) || !Number.isSafeInteger(args.total) || args.done < 0 || args.total < 0 || args.done > args.total || args.label.length > 512) throw new TypeError('Invalid progress values')
      await owner.prepareCompletion(exec.agent.id, args.actionId as RichActionId, exec.callId)
      return args
    },
  })), 'rich-inline.progress-tool')
}

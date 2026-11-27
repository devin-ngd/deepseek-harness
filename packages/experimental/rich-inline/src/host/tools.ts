/** Model-facing publication and explicit, causally correlated action settlement. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RichBlockId, RichActionId, RichValues } from '../shared/types.ts'
import { isRichValues, typedRichValuesValid } from '../shared/validate.ts'
import type { RichSourceRead, RichSourceValue } from './source.ts'

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
export interface RichPublishValue {
  readonly blockId: RichBlockId
  readonly renderRevision: number
  readonly dataRevision: number
  readonly marker: string
}
/** State replacement keeps the executable document and every unsent draft unchanged. */
export interface RichDataInput {
  readonly blockId: string
  readonly expectedRenderRevision: number
  readonly expectedDataRevision: number
  readonly values: RichValues
  readonly fallbackText: string
}
/** Capabilities captured by the owning Host; no ambient tool runtime reaches content. */
export interface RichToolOwner {
  readonly canRead: (agent: Agent) => boolean
  readonly canAuthor: (agent: Agent) => boolean
  publish(sessionId: SessionId, input: RichPublishInput): Promise<RichPublishValue>
  updateData(sessionId: SessionId, input: RichDataInput): Promise<{ blockId: RichBlockId; dataRevision: number }>
  prepareCompletion(sessionId: SessionId, actionId: RichActionId, callId: ToolCallId): Promise<void>
  readSource(sessionId: SessionId, request: RichSourceRead): Promise<RichSourceValue>
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
    name: 'rich_inline_read',
    description: 'Read one field of an immutable Rich block snapshot in this session. Returns a text fragment and nextOffset, or null at the end.',
    parameters: {
      sourceRef: { type: 'string', required: true, description: 'Exact reference from earlier Rich artifact context, including inherited references.' },
      field: { type: 'string', required: true, enum: ['html', 'css', 'js', 'fallbackText', 'values'], description: 'Snapshot field to read. Values are returned as JSON text.' },
      offset: { type: 'integer', required: true, description: 'Zero-based UTF-16 offset. Use the returned nextOffset to continue.' },
      length: { type: 'integer', required: true, description: 'Positive number of UTF-16 code units to read, subject to the per-call limit.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      sourceRef: { type: 'string', required: true }, sourceHash: { type: 'string', required: true }, field: { type: 'string', required: true },
      offset: { type: 'integer', required: true }, totalChars: { type: 'integer', required: true }, text: { type: 'string', required: true },
      nextOffset: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
    } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich source reading requires an owning Agent')
      return owner.readSource(exec.agent.id, args)
    },
  }), { when: ({ agent }) => owner.canRead(agent) }), 'rich-inline.read-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_publish',
    description: 'Replace the HTML, CSS, and JavaScript of an existing Rich block, including repairs requested by Render feedback. Returns the block ID and revisions. For a new block, emit a rich-html fenced result.',
    parameters: {
      blockId: { type: 'string', description: 'ID of the existing block in this session. Omission is supported for legacy tool callers creating a block.' },
      expectedRenderRevision: { type: 'integer', description: 'Required for Render feedback repairs. Copy the renderRevision from that feedback.' },
      html: { type: 'string', required: true }, css: { type: 'string', required: true }, js: { type: 'string', required: true },
      fallbackText: { type: 'string', required: true, description: 'Useful plain-text content if scripting or rendering is unavailable.' },
      stateSchemaVersion: { type: 'integer', required: true, description: 'State schema version. Keep the existing version when repairing a block.' },
      values: { type: 'json', description: 'Replacement confirmed values. Omit to preserve the existing values.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        blockId: { type: 'string', required: true }, renderRevision: { type: 'integer', required: true }, dataRevision: { type: 'integer', required: true }, marker: { type: 'string', required: true },
      } },
      render: (args, value) => [{ type: 'text', text: `Interactive block ${value.blockId}, render revision ${value.renderRevision}, data revision ${value.dataRevision}. Stored; the plugin executes and checks rendering. ${args.blockId === undefined ? 'Final visual result: return only this marker, unless explanation was requested:' : 'Existing block updated; no duplicate marker or explanatory reply is needed:'}\n${value.marker}` }],
      presentationMeta: (_args, value) => ({ richInline: { kind: 'publish', ...value } }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich publication requires an owning Agent')
      return owner.publish(exec.agent.id, { ...args, blockId: args.blockId,
        values: args.values === undefined ? undefined : parsedValues(args.values, maxValueBytes) })
    },
  }), { when: ({ agent }) => owner.canAuthor(agent) }), 'rich-inline.publish-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_update',
    description: 'Replace the confirmed values and fallback text of an existing Rich block. Keeps the code and unsent inputs. Returns the new data revision.',
    parameters: {
      blockId: { type: 'string', required: true, description: 'ID of the existing block in this session.' },
      expectedRenderRevision: { type: 'integer', required: true, description: 'Current render revision from the block publication or interactive input.' },
      expectedDataRevision: { type: 'integer', required: true, description: 'Current data revision. Use the new revision returned by a successful update for the next write.' },
      values: { type: 'json', required: true, description: 'Complete replacement values, including entries that should remain.' },
      fallbackText: { type: 'string', required: true, description: 'Readable text representing the new confirmed state.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        blockId: { type: 'string', required: true }, dataRevision: { type: 'integer', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `Interactive state updated: ${JSON.stringify(value)}` }],
      presentationMeta: (_args, value) => ({ richInline: { kind: 'data', ...value } }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined) throw new Error('Rich state update requires an owning Agent')
      return owner.updateData(exec.agent.id, { ...args, values: parsedValues(args.values, maxValueBytes) })
    },
  }), { when: ({ agent }) => owner.canAuthor(agent) }), 'rich-inline.update-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_complete',
    description: 'Settle a submitted Rich action once its outcome is known. Returns the settlement and structured values for the block.',
    parameters: {
      actionId: { type: 'string', required: true, description: 'Exact actionId from the submitted interactive input.' },
      state: { type: 'string', enum: ['completed', 'failed'], required: true, description: 'Use completed for confirmed success and failed for known failure.' },
      values: { type: 'json', description: 'Structured result values for the block.' },
    },
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
  }), { when: ({ agent }) => owner.canAuthor(agent) }), 'rich-inline.complete-tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rich_inline_progress',
    description: 'Report intermediate progress for a submitted Rich action that is still in progress.',
    parameters: {
      actionId: { type: 'string', required: true, description: 'Exact actionId from the submitted interactive input.' },
      done: { type: 'integer', required: true, description: 'Units completed, from zero through total.' },
      total: { type: 'integer', required: true, description: 'Total units of work, a non-negative integer.' },
      label: { type: 'string', required: true, description: 'Short description of work already performed.' },
    },
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
  }), { when: ({ agent }) => owner.canAuthor(agent) }), 'rich-inline.progress-tool')
}

/** Replay-only real service adapter; no SDK, network listener or user profile. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type { SessionFollowFrame as FollowFrame } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import type { DesktopServicePorts } from '../src/desktop-adapter.ts'
import type { MockOutboundRelay } from '../src/relay.ts'
import { route } from './source-composition.ts'

/** Fixed authored content; renderer execution remains synthetic and separately qualified. */
export const authored = ['phone-form', 'other-form'].map(key => ({ key,
  html: '<form><label>Title<input name="title"></label><label>Count<input name="count" type="number"></label><button>Submit</button></form>',
  css: 'form{display:grid;gap:12px}button,input{min-height:44px}',
  js: 'window.rich.bindForm(document.querySelector("form"))', fallbackText: 'Fixed mobile replay form', stateSchemaVersion: 1, values: {} }))

function textChunks(text: string): ReplayEntry {
  return { kind: 'chunks', chunks: [{ type: 'block-start', index: 0, blockType: 'text' },
    ...[text.slice(0, 24), text.slice(24)].map(text => ({ type: 'text-delta' as const, index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }] }
}

/**
 * Keep the upstream fixture validation, counted replay and upload skip; four explicit response slots are retained.
 * @param ctx - isolated real services, constructed with dispatch hard-block enabled.
 * @param world - test-owned storage directory.
 * @param publications - fixed authored rich content for this replay.
 * @param fixtureText - explicit packaged fixture; source tests may use the owned source file.
 * @param consumed - already completed durable responses from a quiescent fixed world; the remaining script cannot reset its four-call budget.
 * @returns handle and deterministic cancellation readiness marker; extra calls remain refusals.
 */
export async function installFourResponses(ctx: Context, world: string, publications: readonly typeof authored[number][] = authored, fixtureText?: string, consumed = 0) {
  const { prepareOfflineSnapshot } = await import('../../../packages/test-support/session-snapshot/src/offline.ts')
  const { installLlmReplay } = await import('@deepseek-ai/dsh-llm-replay')
  const { ToolCallId } = await import('@deepseek-ai/dsh-llm')
  const fixture = fixtureText ?? await readFile(new URL('../../../packages/test-support/llm-replay/tests/fixtures/offline-four.v4.jsonl', import.meta.url), 'utf8')
  const prepared = prepareOfflineSnapshot({ ...route, fixtures: [fixture], cwd: world })
  const file = join(world, 'replay.v4.jsonl'), overrideFile = join(world, 'four-responses.json'), readyFile = join(world, 'cancel-ready')
  const complete = JSON.stringify({ actionId: '{{fromRequest:Interactive input [{]"protocol":"lumina-rich/1","actionId":"([A-Za-z0-9_.:-]+)"}}', state: 'completed', values: { title: 'Final mobile input', count: '7' } })
  const entries: ReplayEntry[] = [
    textChunks(publications.map(content => '```rich-html\n' + JSON.stringify(content) + '\n```').join('\n\n')),
    { kind: 'chunks', chunks: [{ type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('phase3-complete'), name: 'rich_inline_complete', arguments: complete } },
      { type: 'finish', reason: { kind: 'tool-calls' } }] },
    textChunks('Mobile action completed by the real rich-inline service.'),
    { kind: 'hang', readyFile },
  ]
  if (entries.length !== prepared.expectedCalls || prepared.expectedCalls !== 4) throw new Error('Exact four-response replay required')
  await writeFile(file, prepared.fixtures[0]!)
  if (!Number.isInteger(consumed) || consumed < 0 || consumed >= entries.length) throw new Error('fixed replay position unavailable or exhausted')
  await writeFile(overrideFile, JSON.stringify(entries.slice(consumed), null, 2) + '\n')
  const handle = installLlmReplay(ctx, { file, overrideFile, offline: true, paceMs: 1,
    providers: [{ id: route.provider, models: [{ id: route.model, defaultMaxTokens: 4096, contextWindow: 1000000 }] }] })
  ctx.llm.assertOfflineReplayReady(route.provider, route.model)
  return { handle, readyFile, consumed, remaining: entries.length - consumed }
}

/** @param ctx - passive canonical reader before Agent activation. @param sessionId - exact fixed world Session. @returns completed replay position; unfinished turns or foreign routes refuse activation. */
export async function fixedReplayPosition(ctx: Context, sessionId: SessionId): Promise<number> {
  const inspection = await ctx.sessionController.inspect(sessionId)
  let activeTurn = false, requests = 0, completed = 0
  for (const event of inspection.events) {
    if (event.type === 'turn/start') activeTurn = true
    else if (event.type === 'turn/end') activeTurn = false
    else if (event.type === 'request/context') {
      if (event.data.provider !== route.provider || event.data.model !== route.model) throw new Error('fixed replay foreign route refused')
      requests++
    } else if (event.type === 'assistant/message') completed++
  }
  if (activeTurn || requests !== completed || completed >= route.expectedCalls) throw new Error('fixed replay unfinished or exhausted world; retained without activation')
  return completed
}

/** @param ctx - guarded real context. @returns canonical ports calling production services, without replacing Session or Rich implementations. */
export function realReplayPorts(ctx: Context): DesktopServicePorts {
  if (process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('Dispatch hard-block required')
  const counts = ctx.llm.getOfflineReplayCounts()
  if (counts.realCalls !== 0 || counts.replay.length !== 1 || counts.replay[0]?.expectedCalls !== 4) throw new Error('Counted offline route required')
  return { environment: 'synthetic-only', session: {
    prompt: (request, signal) => ctx.sessionController.prompt(request, signal),
    cancel: request => ctx.sessionController.cancel(request),
    follow: (request, signal) => ctx.sessionController.follow(request, signal),
    findPromptReceipt: async (sessionId, requestId) => {
      const matches = (message: UserMessage) => message.source.kind === 'user' && 'rpcId' in message.source && message.source.rpcId === requestId
      const agent = ctx.agents.get(sessionId)
      if (agent !== undefined && [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(matches)) return 'accepted'
      const inspection = await ctx.sessionController.inspect(sessionId)
      return inspection.events.some(event => event.type === 'user/message' && matches(event.data)) ? 'accepted' : 'absent'
    },
  }, rich: {
    mount: request => ctx.richInline.mount(request), snapshot: request => ctx.richInline.snapshot(request),
    saveDraft: request => ctx.richInline.saveDraft(request), invoke: request => ctx.richInline.invoke(request),
    status: request => ctx.richInline.status(request), dispose: async request => { await ctx.richInline.dispose(request) },
  }, approvals: { list: async () => [] } }
}

/** Forward the real canonical follow stream; each pump has one abort owner and awaits quiescence. */
export class RealFollowPump {
  private readonly controller = new AbortController()
  private readonly task: Promise<void>
  private failure: unknown
  readonly seen: FollowFrame[] = []
  readonly opened: Promise<void>

  /** @param ctx - real guarded Session controller. @param sessionId - isolated fixture owner. @param relay - memory-only sink. */
  constructor(ctx: Context, sessionId: SessionId, relay: Pick<MockOutboundRelay, 'publish'>) {
    let opened!: () => void
    let rejectOpening!: (error: unknown) => void, didOpen = false
    this.opened = new Promise((resolve, reject) => { opened = resolve; rejectOpening = reject })
    this.task = (async () => {
      try {
        for await (const frame of ctx.sessionController.follow({ address: { kind: 'session', sessionId }, assistantStream: true }, this.controller.signal)) {
          this.seen.push(structuredClone(frame))
          if (frame.type === 'snapshot') { didOpen = true; opened() }
          else relay.publish(sessionId, frame)
        }
        if (!didOpen) throw new Error('Real follow ended before its opening snapshot')
      } catch (error) {
        if (!didOpen) rejectOpening(error)
        if (!this.controller.signal.aborted) this.failure = error
      }
    })()
  }
  /** Abort the owned follower and surface any earlier unexpected failure. */
  async close(): Promise<void> { this.controller.abort(); await this.task; if (this.failure !== undefined) throw this.failure }
}

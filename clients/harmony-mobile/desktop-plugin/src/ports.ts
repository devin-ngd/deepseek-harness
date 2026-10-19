/** Actual same-profile SessionController/RichInline binding; contains no fixture label or copied rich/session implementation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-experimental-rich-inline'
import type {} from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { DesktopOperationPorts, DesktopCommandAuthorizer } from '../../src/desktop-adapter.ts'
import { ScopedDesktopExecutor } from '../../src/desktop-adapter.ts'
import type { DesktopId } from '../../src/protocol.ts'
import type { LinkConfig } from '../../src/link-protocol.ts'
import { LinkError } from '../../src/link-protocol.ts'
import type { AdmissionJournal } from '../../src/admission-journal.ts'

/** Production service ports retain a distinct type from synthetic fixtures. */
export interface ProfileServicePorts extends DesktopOperationPorts { readonly environment: 'profile-service' }
/** @param ctx - existing same-profile service Context. @returns canonical ports; accepted receipts require a Session durability barrier and missing approval support rejects explicitly. */
export function profileServicePorts(ctx: Context): ProfileServicePorts {
  return { environment: 'profile-service', session: {
    prompt: async (request, signal) => { const result = await ctx.sessionController.prompt(request, signal); await ctx.sessionPersistence.flush(); return result },
    cancel: request => ctx.sessionController.cancel(request),
    follow: (request, signal) => ctx.sessionController.follow(request, signal),
    findPromptReceipt: async (sessionId, requestId) => {
      const matches = (message: UserMessage) => message.source.kind === 'user' && 'rpcId' in message.source && message.source.rpcId === requestId
      const agent = ctx.agents.get(sessionId)
      let found = agent !== undefined && [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(matches)
      if (!found) { const inspection = await ctx.sessionController.inspect(sessionId); found = inspection.events.some(event => event.type === 'user/message' && matches(event.data) || event.type === 'agent/inbox/spliced' && event.data.inserted.some(message => message.role === 'user' && matches(message))) }
      if (!found) return 'absent'
      try { await ctx.sessionPersistence.flush() } catch (error) { void error; return 'unavailable' }
      return 'accepted'
    },
  }, rich: {
    mount: request => ctx.richInline.mount(request), snapshot: request => ctx.richInline.snapshot(request),
    saveDraft: request => ctx.richInline.saveDraft(request), invoke: request => ctx.richInline.invoke(request), status: request => ctx.richInline.status(request),
    dispose: async request => { await ctx.richInline.dispose(request) },
  }, approvals: { list: async () => { throw new LinkError('read-disabled') } } }
}
/** Production executor shares the established journal/lease implementation and requires an independent peer-bound authorizer. */
export class ProfileDesktopExecutor extends ScopedDesktopExecutor {
  /** @param desktopId - actual execution owner. @param ports - same-profile canonical services. @param authorizer - authenticated invocation peer. @param limits - validated explicit policy. @param journal - durable intent writer. */
  constructor(desktopId: DesktopId, ports: ProfileServicePorts, authorizer: DesktopCommandAuthorizer, limits: LinkConfig, journal: AdmissionJournal) { super(desktopId, ports, authorizer, limits, journal) }
}

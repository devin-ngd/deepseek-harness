/** In-memory typed ports for negotiation/binding tests; SyntheticHost owns all task and rich state. */
import { SyntheticHost } from './host-fixture.ts'
import type { SessionId } from './protocol.ts'
import type { ProfileApproval, ProfileApprovalPorts, ProfileApprovalResponse, ProfileApprovalReceipt,
  MobilePendingApprovalId, SyntheticProfileHost } from './profile-binding.ts'

/** Synthetic pending-owner failures; these do not claim an installed approval endpoint exists. */
export type FixtureApprovalFailure = 'approval-not-found' | 'approval-stale' | 'approval-expired' | 'approval-cancelled' | 'approval-conflict'
/** Expected fixture failure, with no ticket summary or execution payload in its message. */
export class FixtureApprovalError extends Error {
  /** @param code - pending lifecycle rejection category. */
  constructor(readonly code: FixtureApprovalFailure) { super(code); this.name = 'FixtureApprovalError' }
}
/** Volatile pending-event owner; it models one-shot host settlement without a Session audit, Context or real waterfall. */
export class SyntheticPendingApprovals implements ProfileApprovalPorts {
  private readonly rows = new Map<MobilePendingApprovalId, ProfileApproval>()
  private readonly receipts = new Map<MobilePendingApprovalId, { readonly request: ProfileApprovalResponse; readonly receipt: ProfileApprovalReceipt }>()
  decisions = 0
  responses = 0
  /** @param clock - virtual host clock. @param pending - explicit synthetic lifecycle rows, never user Session data. */
  constructor(private readonly clock: () => number, pending: readonly ProfileApproval[]) {
    for (const row of pending) this.rows.set(row.pendingId, structuredClone(row))
  }
  async list(sessionId: SessionId): Promise<readonly ProfileApproval[]> {
    return [...this.rows.values()].filter(row => row.sessionId === sessionId).map(row => structuredClone({ ...row,
      state: row.state === 'pending' && row.expiresAt <= this.clock() ? 'expired' : row.state }))
  }
  async respond(request: ProfileApprovalResponse): Promise<ProfileApprovalReceipt> {
    this.responses++
    const row = this.rows.get(request.pendingId)
    if (row === undefined || row.sessionId !== request.sessionId) throw new FixtureApprovalError('approval-not-found')
    if (row.generation !== request.generation || row.revision !== request.revision) throw new FixtureApprovalError('approval-stale')
    const old = this.receipts.get(request.pendingId)
    if (old !== undefined) {
      if (old.request.decision !== request.decision) throw new FixtureApprovalError('approval-conflict')
      return { ...old.receipt, duplicate: true }
    }
    if (row.state === 'cancelled') throw new FixtureApprovalError('approval-cancelled')
    if (row.state === 'expired' || row.expiresAt <= this.clock()) throw new FixtureApprovalError('approval-expired')
    if (row.state === 'answered') throw new FixtureApprovalError('approval-stale')
    const receipt: ProfileApprovalReceipt = { pendingId: row.pendingId, decision: request.decision, duplicate: false }
    this.decisions++
    this.rows.set(row.pendingId, { ...row, state: 'answered' })
    this.receipts.set(row.pendingId, { request: structuredClone(request), receipt })
    return { ...receipt }
  }
  /** @param pendingId - synthetic request to withdraw; an already answered request keeps its settled outcome. */
  cancel(pendingId: MobilePendingApprovalId): void {
    const row = this.rows.get(pendingId)
    if (row === undefined) throw new FixtureApprovalError('approval-not-found')
    if (row.state === 'pending') this.rows.set(pendingId, { ...row, state: 'cancelled' })
  }
}
/**
 * Compose typed fake ports without loading any DSH runtime or changing the original rich action implementation.
 * @param clock - explicit virtual host clock.
 * @param pending - fixed synthetic approval rows.
 * @returns typed ports and their fixture owners for lifecycle assertions.
 */
export function syntheticProfileFixture(clock: () => number, pending: readonly ProfileApproval[]) {
  const host = new SyntheticHost({ sessionFormatVersion: 4, clock, publish: () => {}, beforePrompt: async () => {}, losePromptReply: () => false })
  const approvals = new SyntheticPendingApprovals(clock, pending)
  const ports: SyntheticProfileHost = { environment: 'synthetic-only', session: host.session, rich: host.rich, approvals }
  return { ports, host, approvals }
}

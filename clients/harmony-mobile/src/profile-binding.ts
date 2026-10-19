/** Synthetic typed binding for a narrow profile plugin; creates no Context, listener, credentials or runtime. */
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import type { DesktopServicePorts, ApprovalView } from './desktop-adapter.ts'
import type { Branded, RichMountRequestId } from './upstream.ts'
import type { DesktopId, SessionId } from './protocol.ts'
import type { DeviceId } from './link-protocol.ts'
import type { MobileProfileId, ProfileGeneration, ProfileCapability, ProfilePlan } from './profile-capabilities.ts'
import { ProfileBindingError } from './profile-capabilities.ts'

/** Ephemeral host-owned pending event reference; it is not a persisted ApprovalRequestId or a rich action id. */
export type MobilePendingApprovalId = Branded<'mobile-pending-approval'>
/** Only the existing canonical one-shot approval outcomes can be requested. */
export type NativeApprovalDecision = Extract<ApprovalOutcome, 'allowed-once' | 'rejected'>
/** Sanitized host projection; no Agent object, tool arguments, credential question or arbitrary event channel. */
export interface ProfileApproval {
  readonly pendingId: MobilePendingApprovalId
  readonly sessionId: SessionId
  readonly generation: ProfileGeneration
  readonly revision: number
  readonly summary: string
  readonly expiresAt: number
  readonly state: 'pending' | 'expired' | 'cancelled' | 'answered'
}
/** Native reply preserves the exact host ticket; revision/expiry/one-shot admission belongs to the host owner. */
export interface ProfileApprovalResponse {
  readonly pendingId: MobilePendingApprovalId
  readonly sessionId: SessionId
  readonly generation: ProfileGeneration
  readonly revision: number
  readonly decision: NativeApprovalDecision
}
/** Host receipt distinguishes duplicate delivery from another permission grant. */
export interface ProfileApprovalReceipt {
  readonly pendingId: MobilePendingApprovalId
  readonly decision: NativeApprovalDecision
  readonly duplicate: boolean
}
/** Port required from a future scoped waterfall bridge; this module implements no approval ledger or event registration. */
export interface ProfileApprovalPorts {
  /** @param sessionId - explicit selected owner. @returns sanitized pending lifecycle projections for that Session only. */
  list(sessionId: SessionId): Promise<readonly ProfileApproval[]>
  /** @param request - displayed current ticket and one-shot decision. @returns idempotent receipt; stale/cancelled/expired/conflicting replies reject before deciding the original waterfall. */
  respond(request: ProfileApprovalResponse): Promise<ProfileApprovalReceipt>
}
/** Fake device admission differs structurally from the operator peer; neither JSON identity nor a cookie constructs it. */
export type SyntheticProfilePeer = { readonly kind: 'operator' } | {
  readonly kind: 'synthetic-device'
  readonly desktopId: DesktopId
  readonly profileId: MobileProfileId
  readonly generation: ProfileGeneration
  readonly deviceId: DeviceId
  readonly grantEpoch: number
  readonly sessions: readonly SessionId[]
  readonly capabilities: readonly ProfileCapability[]
  readonly expiresAt: number
  readonly revoked: boolean
}
/** Consumer selection is compared with current host-owned admission before each operation. */
export interface SyntheticBindingSelection {
  readonly desktopId: DesktopId
  readonly profileId: MobileProfileId
  readonly generation: ProfileGeneration
  readonly deviceId: DeviceId
  readonly grantEpoch: number
  readonly sessionId: SessionId
}
/** All lifetime and permission inputs are explicit; this is never an authentication or pairing implementation. */
export interface SyntheticBindingConfig {
  readonly selection: SyntheticBindingSelection
  readonly plan: ProfilePlan
  readonly peer: () => SyntheticProfilePeer
  readonly clock: () => number
  readonly nativeSource: object
}
/** Existing canonical Session/rich owners and a future approval owner are injected, never copied. */
export interface SyntheticProfileHost {
  readonly environment: 'synthetic-only'
  readonly session: DesktopServicePorts['session']
  readonly rich: DesktopServicePorts['rich']
  readonly approvals: ProfileApprovalPorts
}
/** Adapter-compatible canonical ports plus an independent trusted-native approval entry. */
export interface SyntheticProfileBinding {
  readonly services: DesktopServicePorts
  /** Release all owned host mounts after the caller has closed its adapter/followers and awaited in-flight operations. Failed releases stay owned and may be retried; this never cancels accepted desktop work. */
  release(): Promise<void>
  readonly approvals: {
    /** @param sessionId - selected Session. @returns host-owned sanitized lifecycle views after current device authorization. */
    list(sessionId: SessionId): Promise<readonly ProfileApproval[]>
    /** @param request - host ticket selected by native UI. @param source - actual receiver object, never a JSON field. @returns original host receipt; no rich guest or old mobile command can call this entry. */
    respond(request: ProfileApprovalResponse, source: object): Promise<ProfileApprovalReceipt>
  }
}

/**
 * Check current host-owned fixture admission independently of a command envelope or operator cookie.
 * @param config - explicit selection, negotiated plan, current admission reader and clock.
 * @param capability - operation about to disclose data or call its owner.
 * @param sessionId - requested Session, which must be the selected owner.
 * @returns current admitted fake device; this is not a credential or a real authentication result.
 */
export function authorizeSyntheticProfile(config: SyntheticBindingConfig, capability: ProfileCapability, sessionId: SessionId): Extract<SyntheticProfilePeer, { kind: 'synthetic-device' }> {
  const peer = currentProfilePeer(config, capability, sessionId)
  config.plan.require(capability)
  if (!peer.capabilities.includes(capability)) throw new ProfileBindingError('scope-denied', capability)
  return peer
}

function currentProfilePeer(config: SyntheticBindingConfig, subject: string, sessionId: SessionId): Extract<SyntheticProfilePeer, { kind: 'synthetic-device' }> {
  const peer = config.peer(), selection = config.selection
  if (peer.kind === 'operator') throw new ProfileBindingError('operator-not-device', subject)
  if (peer.generation !== selection.generation) throw new ProfileBindingError('generation-changed', subject)
  if (peer.desktopId !== selection.desktopId || peer.profileId !== selection.profileId || peer.deviceId !== selection.deviceId
    || peer.grantEpoch !== selection.grantEpoch || sessionId !== selection.sessionId || !peer.sessions.includes(sessionId)) throw new ProfileBindingError('scope-denied', subject)
  if (peer.revoked) throw new ProfileBindingError('grant-revoked', subject)
  if (peer.expiresAt <= config.clock()) throw new ProfileBindingError('grant-expired', subject)
  return peer
}

/**
 * Bind injected fake services to one selected Session and current device scope. Existing adapter journals own task deduplication.
 * @param host - canonical synthetic ports; it owns task/rich/approval state and failures.
 * @param config - negotiated plan, trusted admission reader, clock, selection and native receiver.
 * @returns bounded ports; caller must close the RestrictedDesktopAdapter and followers before release(), then release host services. Read/follow failures disclose no later frames; a failed mutation may already have committed and must use existing receipts.
 */
export function bindSyntheticProfile(host: SyntheticProfileHost, config: SyntheticBindingConfig): SyntheticProfileBinding {
  const selection = { ...config.selection }
  if (config.plan.desktopId !== selection.desktopId || config.plan.profileId !== selection.profileId) throw new ProfileBindingError('scope-denied', 'profile')
  if (config.plan.generation !== selection.generation) throw new ProfileBindingError('generation-changed', 'profile')
  const mounts = new Set<RichMountRequestId['mountId']>()
  let closed = false
  const scope = (subject: string, sessionId: SessionId): Extract<SyntheticProfilePeer, { kind: 'synthetic-device' }> => {
    if (closed) throw new ProfileBindingError('binding-closed', subject)
    return currentProfilePeer({ ...config, selection }, subject, sessionId)
  }
  const authorize = (capability: ProfileCapability, sessionId: SessionId): void => {
    if (closed) throw new ProfileBindingError('binding-closed', capability)
    authorizeSyntheticProfile({ ...config, selection }, capability, sessionId)
  }
  scope('profile', selection.sessionId)
  const mounted = (request: RichMountRequestId): void => {
    if (request.sessionId !== selection.sessionId) throw new ProfileBindingError('scope-denied', 'rich.inline')
    authorize('rich.inline', selection.sessionId)
    if (!mounts.has(request.mountId)) throw new ProfileBindingError('mount-unowned', 'rich.inline')
  }
  const dispose = async (request: RichMountRequestId): Promise<void> => {
    if (request.sessionId !== selection.sessionId) throw new ProfileBindingError('scope-denied', 'rich.dispose')
    if (!mounts.has(request.mountId)) throw new ProfileBindingError('mount-unowned', 'rich.dispose')
    // Release remains possible after grant revocation; only mounts issued to this binding can be addressed.
    await host.rich.dispose(request); mounts.delete(request.mountId)
  }
  const list = async (sessionId: SessionId): Promise<readonly ProfileApproval[]> => {
    authorize('approval.list', sessionId)
    const rows = await host.approvals.list(sessionId)
    authorize('approval.list', sessionId)
    return rows
  }
  const services: DesktopServicePorts = { environment: 'synthetic-only', session: {
    prompt: async (request, signal) => { authorize('session.prompt', request.sessionId); return host.session.prompt(request, signal) },
    cancel: async request => { authorize('session.cancel', request.sessionId); return host.session.cancel(request) },
    follow: async function* (request, signal) {
      if (request.address.kind !== 'session') throw new ProfileBindingError('scope-denied', 'session.follow')
      const sessionId = request.address.sessionId
      authorize('session.follow', sessionId)
      for await (const frame of host.session.follow(request, signal)) { authorize('session.follow', sessionId); yield frame }
    },
    findPromptReceipt: async (sessionId, requestId) => {
      authorize('session.receipt', sessionId)
      const receipt = await host.session.findPromptReceipt(sessionId, requestId)
      authorize('session.receipt', sessionId); return receipt
    },
  }, rich: {
    mount: async request => {
      authorize('rich.inline', request.sessionId)
      const result = await host.rich.mount(request); mounts.add(result.mountId)
      try { authorize('rich.inline', request.sessionId) }
      catch (error) {
        try { await dispose({ sessionId: selection.sessionId, mountId: result.mountId }) }
        catch (cleanup) { throw new ProfileBindingError('mount-cleanup-failed', 'rich.mount', { cause: new AggregateError([error, cleanup]) }) }
        throw error
      }
      return result
    },
    snapshot: async request => { mounted(request); const result = await host.rich.snapshot(request); mounted(request); return result },
    saveDraft: async request => { mounted(request); return host.rich.saveDraft(request) },
    invoke: async request => { mounted(request); return host.rich.invoke(request) },
    status: async request => { mounted(request); const result = await host.rich.status(request); mounted(request); return result },
    dispose,
  }, approvals: { list: async sessionId => (await list(sessionId)).filter(row => row.state !== 'answered').map((row): ApprovalView => ({
    approvalId: row.pendingId, revision: row.revision, summary: row.summary, expiresAt: row.expiresAt,
    state: row.state === 'answered' ? 'cancelled' : row.state,
  })) } }
  return { services, release: async () => {
    closed = true
    const results = await Promise.allSettled([...mounts].map(mountId => dispose({ sessionId: selection.sessionId, mountId })))
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (failures.length > 0) throw new ProfileBindingError('mount-cleanup-failed', 'release', { cause: new AggregateError(failures) })
  }, approvals: { list, respond: async (request, source) => {
    if (source !== config.nativeSource) throw new ProfileBindingError('native-confirmation-required', 'approval.respond')
    authorize('approval.respond', request.sessionId)
    if (request.generation !== selection.generation) throw new ProfileBindingError('approval-stale', 'approval.respond')
    return host.approvals.respond(request)
  } } }
}

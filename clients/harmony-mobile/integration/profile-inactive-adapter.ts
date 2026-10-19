/** Default-disabled source adapter; Remote metadata/codecs remain unpublished and approvals delegate to the existing answerer. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent/types'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import { MobileBffCore } from './mobile-bff.ts'
import type { FollowJournal } from './mobile-bff.ts'
import { RestrictedDesktopAdapter } from '../src/desktop-adapter.ts'
import { bindSyntheticProfile, authorizeSyntheticProfile } from '../src/profile-binding.ts'
import type { SyntheticProfileHost, SyntheticProfileBinding, SyntheticBindingConfig } from '../src/profile-binding.ts'
import { resolveProfileCapabilities } from '../src/profile-capabilities.ts'
import type { ProfileAdvertisement, ProfileRequirements, ProfileCapability } from '../src/profile-capabilities.ts'
import { ProfileBindingError } from '../src/profile-capabilities.ts'
import type { AdmissionJournal } from '../src/admission-journal.ts'
import type { MockDeviceRegistry, LinkConfig, MobileOperation } from '../src/link-protocol.ts'
import { parseCommand, text } from '../src/link-protocol.ts'
import { id } from '../src/protocol.ts'
import type { JsonValue } from '../src/upstream.ts'
import type { WireItem, WireInstance } from '../src/wire.ts'

export { PROFILE_RPC_CODEC, profileRpcCodec as inactiveProfileCodec } from '../src/profile-rpc-codec.ts';
import { PROFILE_RPC_CODEC, profileRpcCodec as inactiveProfileCodec } from '../src/profile-rpc-codec.ts';
import type { ProfileRpcCodec as InactiveProfileCodec } from '../src/profile-rpc-codec.ts';
const operationCapabilities: Readonly<Record<MobileOperation, ProfileCapability | null>> = {
  'task.submit': 'session.prompt', 'task.receipt': 'session.receipt', 'session.sync': 'session.follow', 'session.cancel': 'session.cancel',
  'rich.mount': 'rich.inline', 'rich.invoke': 'rich.inline', 'rich.saveDraft': 'rich.inline', 'rich.status': 'rich.inline', 'rich.snapshot': 'rich.inline', 'rich.dispose': 'rich.inline',
  'approval.list': 'approval.list', 'read.projects': null, 'read.sessions': null, 'read.history': null, 'image.open': null, 'image.read': null, 'image.close': null,
}
/** Explicit enable request; omission resolves to disabled in this owner. */
export interface InactiveProfileRequest { readonly enabled?: boolean }
/** Resolved source configuration, without a network endpoint or installation instruction. */
export interface InactiveProfileSpec { readonly enabled: boolean }
/** @param request - typed source configuration. @returns explicit disabled-by-default spec; this does not enable a product plugin. */
export function resolveInactiveProfile(request: InactiveProfileRequest): InactiveProfileSpec { return { enabled: request.enabled ?? false } }
/** Expected rejection from the inactive wrapper. */
export class InactiveProfileError extends Error {
  /** @param code - unavailable lifecycle or invalid codec category. @param options - local cause. */
  constructor(readonly code: 'adapter-disabled' | 'adapter-closed' | 'codec-version' | 'codec-invalid' | 'listener-limit', options?: ErrorOptions) { super(code, options); this.name = 'InactiveProfileError' }
}
/** All source dependencies and bounds are injected; advertised approvals are limited to display. */
export interface InactiveProfileDependencies {
  readonly spec: InactiveProfileSpec
  readonly advertisement: ProfileAdvertisement
  readonly requirements: ProfileRequirements
  readonly host: SyntheticProfileHost
  readonly binding: Omit<SyntheticBindingConfig, 'plan'>
  readonly registry: MockDeviceRegistry
  readonly admission: AdmissionJournal
  readonly limits: LinkConfig
  readonly journal: FollowJournal
  readonly instance: WireInstance
  readonly maxEnvelopeBytes: number
  readonly maxScopedListeners: number
  /** Read-only native presentation; no pending ticket, answer permit or credential event is produced. */
  readonly observe: (view: { readonly sessionId: Agent['id']; readonly toolName: string }) => void
}
/** In-memory source adapter; creating it does not register a service, effect, listener, Gateway descriptor or runtime. */
export class InactiveProfileAdapter {
  private readonly codec: InactiveProfileCodec
  private readonly scopes = new Map<Agent['id'], Scope>()
  private readonly advertisement: ProfileAdvertisement | null
  private readonly binding: SyntheticProfileBinding | null
  private readonly bindingConfig: SyntheticBindingConfig | null
  private readonly adapter: RestrictedDesktopAdapter | null
  private readonly core: MobileBffCore | null
  private closed = false
  private disposing: Promise<void> | null = null
  private scopeDrops = 0
  private observerFailures = 0
  /** @param dependencies - explicit fake host ports, negotiated metadata, admission owners and limits. */
  constructor(private readonly dependencies: InactiveProfileDependencies) {
    this.codec = inactiveProfileCodec(dependencies.maxEnvelopeBytes)
    if (!Number.isSafeInteger(dependencies.maxScopedListeners) || dependencies.maxScopedListeners < 1) throw new InactiveProfileError('listener-limit')
    if (!dependencies.spec.enabled) { this.advertisement = null; this.bindingConfig = null; this.binding = null; this.adapter = null; this.core = null; return }
    if (dependencies.journal.owner !== dependencies.binding.selection.sessionId) throw new ProfileBindingError('scope-denied', 'session.follow')
    const capabilities = { ...dependencies.advertisement.capabilities }
    // No original waterfall bridge is implemented, so even a fixture's respond port cannot advertise that capability.
    delete capabilities['approval.respond']
    this.advertisement = { ...dependencies.advertisement, protocols: { ...dependencies.advertisement.protocols }, capabilities }
    const plan = resolveProfileCapabilities(this.advertisement, dependencies.requirements)
    this.bindingConfig = { ...dependencies.binding, selection: { ...dependencies.binding.selection }, plan }
    this.binding = bindSyntheticProfile(dependencies.host, this.bindingConfig)
    this.adapter = new RestrictedDesktopAdapter(dependencies.binding.selection.desktopId, this.binding.services, dependencies.registry, dependencies.limits, dependencies.admission)
    this.core = new MobileBffCore({ adapter: this.adapter, registry: dependencies.registry, journal: dependencies.journal,
      desktopId: dependencies.binding.selection.desktopId, deviceId: dependencies.binding.selection.deviceId, instance: dependencies.instance })
  }
  /** @returns detached source metadata; disabled/closed instances disclose no advertised capabilities. */
  metadata(): { readonly enabled: boolean; readonly codec: typeof PROFILE_RPC_CODEC; readonly advertisement: ProfileAdvertisement | null } {
    return { enabled: this.dependencies.spec.enabled && !this.closed, codec: PROFILE_RPC_CODEC, advertisement: this.closed ? null : structuredClone(this.advertisement) }
  }
  /** @returns bounded local lifecycle counters without user content. */
  get diagnostics() { return { attachedScopes: this.scopes.size, scopeDrops: this.scopeDrops, observerFailures: this.observerFailures, closed: this.closed } }
  private current(): MobileBffCore {
    if (this.closed) throw new InactiveProfileError('adapter-closed')
    if (this.core === null) throw new InactiveProfileError('adapter-disabled')
    return this.core
  }
  private admit(packet: string): void {
    if (this.bindingConfig === null) throw new InactiveProfileError('adapter-disabled')
    const command = parseCommand(packet, this.dependencies.limits), selection = this.bindingConfig.selection
    if (command.desktopId !== selection.desktopId || command.deviceId !== selection.deviceId || command.grantEpoch !== selection.grantEpoch) throw new ProfileBindingError('scope-denied', command.operation)
    const capability = operationCapabilities[command.operation]
    if (capability === null) throw new ProfileBindingError('capability-missing', command.operation)
    const sessionId = 'sessionId' in command.payload ? id<'SessionId'>(text(command.payload.sessionId)) : selection.sessionId
    authorizeSyntheticProfile(this.bindingConfig, capability, sessionId)
  }
  /** @param candidate - bounded versioned JSON parameter. @param signal - caller wait lifetime. @returns existing BFF result; no transport or real execution is created. */
  async request(candidate: unknown, signal: AbortSignal): Promise<JsonValue> {
    const core = this.current(), argument = this.codec.schema.parse(candidate)
    this.admit(argument.packet)
    return core.request(argument.packet, signal)
  }
  /** @param candidate - versioned session.sync parameter. @param resume - existing relay generation/cursor hint. @param signal - subscriber lifetime. @returns original shared BFF reset/retained frames. */
  async *follow(candidate: unknown, resume: unknown, signal: AbortSignal): AsyncIterable<WireItem> {
    const core = this.current(), argument = this.codec.schema.parse(candidate)
    this.admit(argument.packet)
    for await (const item of core.follow(argument.packet, resume, signal)) {
      if (this.bindingConfig === null) throw new InactiveProfileError('adapter-disabled')
      authorizeSyntheticProfile(this.bindingConfig, 'session.follow', this.dependencies.journal.owner)
      yield item
    }
  }
  /**
   * Attach only an in-memory read-only approval observer. It always delegates the original waterfall with next().
   * @param owner - existing caller-owned Cordis context; no Context or application runtime is created.
   * @param agent - original scope key with canonical Agent identity; tests use a fake id-only handle.
   * @returns whether a scope was attached; disabled sources attach nothing. Revocation and owner disposal release it.
   */
  attach(owner: Context, agent: Pick<Agent, 'id'>): boolean {
    if (this.closed) throw new InactiveProfileError('adapter-closed')
    if (this.bindingConfig === null) return false
    authorizeSyntheticProfile(this.bindingConfig, 'approval.list', agent.id)
    if (this.scopes.has(agent.id) || this.scopes.size >= this.dependencies.maxScopedListeners) throw new InactiveProfileError('listener-limit')
    const scope = createScope(owner, agent)
    this.scopes.set(agent.id, scope)
    owner.effect(() => () => this.close())
    scope.ctx.effect(() => () => { this.scopes.delete(agent.id) })
    scope.ctx.effect(() => this.dependencies.registry.onRevoke(async deviceId => {
      if (deviceId === this.dependencies.binding.selection.deviceId) await this.close()
    }))
    scope.ctx.on('approval/request', async (request, next) => {
      if (request.signal?.aborted) return next()
      if (!this.closed && this.bindingConfig !== null) {
        try {
          authorizeSyntheticProfile(this.bindingConfig, 'approval.list', request.agent.id)
          try { this.dependencies.observe({ sessionId: request.agent.id, toolName: request.toolName }) }
          catch (error) { this.observerFailures++; void error }
        } catch (error) { this.scopeDrops++; void error }
      }
      return next()
    })
    return true
  }
  /** Stop observers first, await adapter quiescence and release remaining mounts. Accepted desktop work is not cancelled; failed cleanup can be retried. */
  close(): Promise<void> {
    this.closed = true
    if (this.core !== null) this.dependencies.journal.close()
    if (this.disposing !== null) return this.disposing
    const attempt = (async () => {
      const results = await Promise.allSettled([...this.scopes.values()].map(scope => scope.dispose()))
      const rejected = results.find(result => result.status === 'rejected')
      if (rejected?.status === 'rejected') throw rejected.reason
      await this.adapter?.close()
      await this.binding?.release()
    })()
    this.disposing = attempt
    void attempt.catch(error => { void error; this.disposing = null })
    return attempt
  }
}

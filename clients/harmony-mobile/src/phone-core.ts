/** Native-owned orchestration connects decoded BFF traffic to semantic state and scoped rich mounts. */
import type { JsonValue, RichMountValue } from './upstream.ts'
import type { MobileCommand, MobileOperation, CommandId } from './link-protocol.ts'
import { MOBILE_LINK_PROTOCOL } from './link-protocol.ts'
import { SemanticPhone } from './semantic-phone.ts'
import type { RichReference, PhoneView } from './semantic-phone.ts'
import type { WireItem, WireResume } from './wire.ts'
import { jsonPayload, TransportError } from './wire.ts'
import { boolean, decodeAction, decodeReceipt, integer, object, string } from './domain.ts'
import { canonical, id } from './protocol.ts'
import type { FollowPolicy } from './follow-policy.ts'
import { followPause, validateFollowPolicy } from './follow-policy.ts'

/** ArkWeb implementation must keep this port in trusted native code; it has no arbitrary endpoint selector. */
export interface NativeProvider {
  /** @param command - native-minted scoped operation. @param signal - wait lifetime only. @returns bounded JSON for subsequent domain admission. */
  request(command: MobileCommand, signal?: AbortSignal): Promise<JsonValue>
  /** @param command - native-selected session.sync. @param resume - previously admitted transport cut. @param signal - foreground lifetime. @returns owner-bound frames requiring semantic admission. */
  follow(command: MobileCommand, resume: WireResume, signal?: AbortSignal): AsyncIterable<WireItem>
  /** @returns after owned network waits stop; accepted desktop actions continue independently. */
  close(): Promise<void>
}
/** Explicit trusted command identity/expiry owner; diagnostic callback failures are counted separately and never change command admission. */
export interface PhoneCoreConfig { readonly grantEpoch: number; readonly ttlMs: number; readonly clock: () => number; readonly nextCommandId: () => CommandId; readonly maxMounts: number; readonly maxIntents: number; readonly follow: FollowPolicy; readonly observeCommand?: (value: CommandGeneration) => void }
/** Local generation diagnostic; no payload, credential or additional wire field is included. */
export interface CommandGeneration { readonly commandId: CommandId; readonly operation: MobileOperation; readonly generatedAt: number; readonly expiresAt: number; readonly ttlMs: number }
/** Useful fallback stays on a persisted native reference; unrecognized response HTML is never rendered. */
export type RichDisplay = { readonly kind: 'ready'; readonly mount: RichMountValue } | { readonly kind: 'fallback'; readonly text: string; readonly reason: string }
/** Connected core shares normalization with native fixtures and Chrome; transport loss never dispatches a new task. */
export class PhoneCore {
  private commandObservationFailures = 0
  /** @returns sticky count of diagnostic callback failures; these do not describe product success. */
  get diagnosticFailures(): number { return this.commandObservationFailures }
  private readonly mounts = new Map<string, { readonly reference: RichReference; readonly instance: WireResume['instance'] }>()
  private readonly tasks = new Map<string, { readonly fingerprint: string; readonly cut: number; readonly result: Promise<JsonValue> }>()
  /** @param provider - default-disabled production adapter or explicit replay transport. @param model - native-selected projection. @param config - identity and bounded lifetime policy. */
  constructor(private readonly provider: NativeProvider, readonly model: SemanticPhone, private readonly config: PhoneCoreConfig) {
    for (const value of [config.grantEpoch, config.ttlMs, config.maxMounts, config.maxIntents]) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
    validateFollowPolicy(config.follow)
  }
  private command(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): MobileCommand {
    const commandId = this.config.nextCommandId(), generatedAt = this.config.clock(), expiresAt = generatedAt + this.config.ttlMs
    try { this.config.observeCommand?.({ commandId, operation, generatedAt, expiresAt, ttlMs: this.config.ttlMs }) }
    catch (error) { void error; this.commandObservationFailures++ } // Only the optional diagnostic sink is contained; the clock and provider remain product owners.
    return { protocol: MOBILE_LINK_PROTOCOL, desktopId: this.model.owner.desktopId, deviceId: this.model.owner.deviceId, commandId, grantEpoch: this.config.grantEpoch, expiresAt, operation, payload }
  }
  /** @param signal - foreground lifetime. @returns admitted views; bounded recovery mints fresh session.sync reads at the last admitted cursor. Task, action and cancellation commands are never retried here. */
  async *follow(signal: AbortSignal): AsyncIterable<PhoneView> {
    const policy = this.config.follow
    let segments = 0, failures = 0
    try {
      while (!signal.aborted) {
        if (policy.mode === 'bounded' && segments >= policy.maxSegments) throw new TransportError('follow-budget-exhausted')
        segments++
        try {
          for await (const item of this.provider.follow(this.command('session.sync', { sessionId: this.model.owner.sessionId, afterSeq: this.model.view.cursor }), this.model.resume, signal)) if (this.model.accept(item)) yield this.model.view
          if (policy.mode === 'once' || signal.aborted) return
        } catch (error) {
          if (signal.aborted) return
          if (policy.mode === 'once' || !(error instanceof TransportError) || !['timeout', 'transport-lost'].includes(error.code)) throw error
          if (++failures >= policy.maxFailures) throw new TransportError('follow-recovery-exhausted', { cause: error })
        }
        if (policy.mode === 'bounded') await followPause(policy.retryDelayMs, signal)
      }
    } catch (error) {
      if (!signal.aborted) { this.model.failFollow(error instanceof TransportError ? error.code : 'follow-failed'); throw error }
    }
    finally { this.model.disconnect() }
  }
  /** @param operation - trusted native method; guest callers pass through RelayGuestGate first. @param payload - scoped parameters. @returns normalized and admitted response. */
  async request(operation: MobileOperation, payload: Readonly<Record<string, unknown>>): Promise<JsonValue> {
    if (['read.projects', 'read.sessions', 'read.history', 'image.open', 'image.read', 'image.close'].includes(operation)) {
      if (['read.history', 'image.open'].includes(operation) && payload.sessionId !== this.model.owner.sessionId) throw new TransportError('scope-denied')
      // PhoneLibrary owns response admission before any UI or cache publication.
      const reply = object(await this.provider.request(this.command(operation, payload)))
      if (Object.keys(reply).length !== 1 || reply.mobileRead === undefined) throw new TransportError('domain-invalid')
      return reply.mobileRead
    }
    if (operation === 'rich.mount') {
      if (this.model.view.readOnly) throw new TransportError('read-only')
      const reference = this.model.view.messages.flatMap(message => message.rich).find(item => item.sessionId === payload.sessionId && item.messageId === payload.messageId && item.blockId === payload.blockId)
      if (reference === undefined) throw new TransportError('scope-denied')
      if (this.mounts.size >= this.config.maxMounts) throw new TransportError('queue-full')
      const response = object(await this.provider.request(this.command(operation, payload))), mountId = id<'rich-inline-mount'>(string(response.mountId, 128))
      let snapshot: RichMountValue['snapshot']
      try { snapshot = this.model.richSnapshot(response.snapshot!, reference) }
      catch (error) {
        // The owner-bound mount reply created this lease; release it before exposing a domain failure.
        const disposed = object(await this.provider.request(this.command('rich.dispose', { mountId })))
        if (disposed.disposed !== true) throw new TransportError('mount-cleanup-unknown', { cause: error })
        throw error
      }
      this.mounts.set(mountId, { reference, instance: this.model.resume.instance })
      this.model.verifiedConnection()
      return jsonPayload({ mountId, snapshot } satisfies RichMountValue)
    }
    if (operation.startsWith('rich.')) {
      const mountId = string(payload.mountId, 128), lease = this.mounts.get(mountId)
      if (lease === undefined) throw new TransportError('stale-mount')
      // A new BFF generation revokes old guest routing; teardown cannot send an old lease to the replacement service.
      if (lease.instance !== this.model.resume.instance) {
        if (operation !== 'rich.dispose') throw new TransportError('stale-mount')
        this.mounts.delete(mountId); return { disposed: true }
      }
      if (operation === 'rich.dispose') {
        const disposed = object(await this.provider.request(this.command(operation, payload)))
        if (disposed.disposed !== true) throw new TransportError('domain-invalid')
        this.mounts.delete(mountId); return disposed
      }
      const reference = lease.reference
      if (!this.model.view.messages.some(message => message.rich.some(item => item.messageId === reference.messageId && item.blockId === reference.blockId))) throw new TransportError('stale-mount')
      if (['rich.invoke', 'rich.saveDraft'].includes(operation) && (this.model.view.readOnly || this.model.view.rich.find(item => item.scope.blockId === reference.blockId)?.readOnly)) throw new TransportError('read-only')
      const result = await this.provider.request(this.command(operation, payload))
      if (operation === 'rich.snapshot') return jsonPayload(this.model.richSnapshot(result, reference))
      if (operation === 'rich.status') {
        if (result === null) return null
        const status = decodeAction(result)
        if (status.actionId !== payload.actionId) throw new TransportError('scope-denied')
        return jsonPayload(status)
      }
      if (operation === 'rich.invoke' || operation === 'rich.saveDraft') {
        const receipt = decodeReceipt(result)
        if (operation === 'rich.invoke' && receipt.actionId !== null && receipt.actionId !== payload.actionId) throw new TransportError('scope-denied')
        return jsonPayload(receipt)
      }
      throw new TransportError('native-method-required')
    }
    if (operation === 'approval.list') {
      if (payload.sessionId !== this.model.owner.sessionId) throw new TransportError('scope-denied')
      const result = await this.provider.request(this.command(operation, payload))
      if (!Array.isArray(result) || result.length > this.config.maxIntents) throw new TransportError('domain-invalid')
      for (const candidate of result) { const item = object(candidate); string(item.approvalId, 128); integer(item.revision); string(item.summary, this.model.limits.maxText); integer(item.expiresAt); if (!['pending', 'expired', 'cancelled'].includes(String(item.state))) throw new TransportError('domain-invalid') }
      return result
    }
    throw new TransportError('native-method-required')
  }
  /** @param requestId - stable native intent identity. @param text - user task. @returns one accepted receipt or visible uncertainty; repeated IDs never redispatch. */
  submit(requestId: string, text: string): Promise<JsonValue> {
    if (this.model.view.readOnly) return Promise.reject(new TransportError('read-only'))
    const payload = { sessionId: this.model.owner.sessionId, requestId: id<'session-request-id'>(requestId), text }, fingerprint = canonical(payload), old = this.tasks.get(requestId)
    if (old !== undefined) return old.fingerprint === fingerprint ? old.result : Promise.reject(new TransportError('id-conflict'))
    if (this.tasks.size >= this.config.maxIntents) return Promise.reject(new TransportError('queue-full'))
    const cut = this.model.view.cursor
    const result = this.provider.request(this.command('task.submit', payload)).then(value => {
      this.admission(value, requestId); this.model.admissionState(object(value).accepted === true ? 'accepted' : 'outcome_unknown', null, cut); this.model.verifiedConnection(); return value
    }).catch((error: unknown) => { this.model.admissionState('outcome_unknown', error instanceof TransportError ? error.code : 'transport-lost', cut); throw error })
    this.tasks.set(requestId, { fingerprint, cut, result }); return result
  }
  private admission(value: JsonValue, requestId: string): void {
    const receipt = object(value)
    if (receipt.requestId !== requestId || !['accepted', 'unknown'].includes(String(receipt.state)) || boolean(receipt.accepted) !== (receipt.state === 'accepted')) throw new TransportError('domain-invalid')
  }
  /** @param requestId - existing stable intent. @returns read-only receipt reconciliation; absence cannot dispatch. */
  async receipt(requestId: string): Promise<JsonValue> {
    const value = await this.provider.request(this.command('task.receipt', { sessionId: this.model.owner.sessionId, requestId }))
    this.admission(value, requestId)
    this.model.admissionState(object(value).accepted === true ? 'accepted' : 'outcome_unknown', null, this.tasks.get(requestId)?.cut ?? this.model.view.cursor); this.model.verifiedConnection(); return value
  }
  /** Cancel is a native user operation, never a side effect of losing the stream. @returns acknowledgement separate from terminal turn evidence. */
  async cancel(): Promise<void> {
    if (this.model.view.readOnly) throw new TransportError('read-only')
    const value = object(await this.provider.request(this.command('session.cancel', { sessionId: this.model.owner.sessionId })))
    if (value.accepted !== true) throw new TransportError('domain-invalid')
    this.model.admissionState('cancel_requested')
  }
  /** @param reference - trusted persisted block. @returns fresh mount; history restoration never resubmits a task. */
  async mount(reference: RichReference): Promise<RichMountValue> {
    const result = object(await this.request('rich.mount', { sessionId: reference.sessionId, messageId: reference.messageId, blockId: reference.blockId, guestProtocol: 'lumina-rich/1' }))
    return { mountId: id<'rich-inline-mount'>(string(result.mountId, 128)), snapshot: this.model.richSnapshot(result.snapshot!, reference) }
  }
  /** @param reference - persisted native-selected block. @returns admitted mount or original readable fallback on incompatible/invalid domain data; unknown transport outcomes still throw. */
  async mountDisplay(reference: RichReference): Promise<RichDisplay> {
    try { return { kind: 'ready', mount: await this.mount(reference) } }
    catch (error) {
      if (!(error instanceof TransportError) || !['rich-protocol-mismatch', 'domain-invalid', 'rich-conflict', 'rich-rollback', 'read-only'].includes(error.code)) throw error
      return { kind: 'fallback', text: reference.fallback, reason: error.code }
    }
  }
  /** Stop owned transport waits; rich dispose and iterator teardown remain explicit owners. */
  async close(): Promise<void> { await this.provider.close() }
  /** Retire old connection mounts locally before a new authenticated peer can receive rich operations; retained task intents are unchanged. */
  retireMounts(): void { this.mounts.clear() }
}

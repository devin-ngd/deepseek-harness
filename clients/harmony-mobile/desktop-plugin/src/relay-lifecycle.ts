/** Desktop paired relay provider/consumer seam. It calls only the existing authenticated fixed profile carrier, and owns no listener, persistent key creation or model. */
import type { Context } from '@deepseek-ai/cordis'
import { PairedRelayEndpoint, validatePairedRelayPolicy, type PairedRelayPorts, type PairedRelayPolicy } from '../../src/paired-relay.ts'
import type { EndpointRelayTrust } from '../../src/relay-control-client.ts'
import { DeviceAuthorizationOwner, type DeviceTransportBinding } from '../../integration/device-auth.ts'
import { AuthenticatedDeviceChannel } from '../../integration/device-auth-carrier.ts'
import { carrierRequest } from '../../src/device-carrier-protocol.ts'
import { fields } from '../../src/link-protocol.ts'
import { jsonPayload } from '../../src/wire.ts'
import type { EncryptedRelayConnection } from '../../integration/e2e-socket.ts'
import { mountExpiryCleanup } from '../../integration/connection-lifetime.ts'
import type { CleanupScheduler } from '../../integration/connection-lifetime.ts'
import { ConnectionSupervisor, validateRecoveryPolicy, type ConnectionRecoveryPolicy } from '../../src/connection-supervisor.ts'
/** Host-paired ports are supplied locally; config or JSON cannot create a signer or authorization owner. */
export interface DesktopRelayPlan { readonly trust: EndpointRelayTrust; readonly policy: PairedRelayPolicy; readonly sweepIntervalMs: number; readonly deviceId: Parameters<DeviceAuthorizationOwner['challenge']>[0]; readonly recovery?: { readonly policy: ConnectionRecoveryPolicy; readonly scheduler: CleanupScheduler; readonly clock: () => number }; openPorts(): PairedRelayPorts }
/** Default-disabled desktop plugin consumes this explicit local provider. */
export interface DesktopRelayLifecycle { mount(ctx: Context): Promise<() => Promise<void>> }
/** Maintained host provider wires control, E2E, original device proof and fixed profile RPC. */
export class PairedDesktopRelay implements DesktopRelayLifecycle {
  /** @param owner - existing desktop authorization owner, cold starts denied. @param plan - locally confirmed pins and ports. */
  constructor(private readonly owner: DeviceAuthorizationOwner, private readonly plan: DesktopRelayPlan) {}
  /** @param ctx - actual current same-profile Gateway/session/rich owner. @returns effect disposer waiting for all requests/followers/keys/sockets; it never cancels accepted desktop tasks. */
  async mount(ctx: Context): Promise<() => Promise<void>> {
    if (this.plan.recovery === undefined) return this.mountOnce(ctx, () => {})
    validateRecoveryPolicy(this.plan.recovery.policy); validatePairedRelayPolicy(this.plan.policy)
    if (this.plan.trust.role !== 'desktop' || !Number.isSafeInteger(this.plan.sweepIntervalMs) || this.plan.sweepIntervalMs <= 0) throw new Error('desktop recovery policy denied')
    const lifetime = new AbortController(), recovery = this.plan.recovery, supervisor = new ConnectionSupervisor(recovery.policy, this.plan.trust.expiresAt, recovery.clock, recovery.scheduler, async ended => ({ close: await this.mountOnce(ctx, ended) }), state => { if (state === 'blocked') ctx.logger('harmony-relay').error('paired recovery stopped; local confirmation or reconnect is required') }, lifetime.signal)
    const stopRevoke = this.owner.onRevoke(async deviceId => { if (deviceId === this.plan.deviceId && !this.owner.hasLocalGrant(deviceId)) { lifetime.abort(); void supervisor.close().catch(error => { void error; ctx.logger('harmony-relay').error('paired revocation cleanup failed') }) } })
    try { await supervisor.start() } catch (error) { stopRevoke(); await supervisor.close(); throw error }
    return async () => { stopRevoke(); lifetime.abort(); await supervisor.close() }
  }
  private async mountOnce(ctx: Context, ended: () => void): Promise<() => Promise<void>> {
    if (this.plan.trust.role !== 'desktop') throw new Error('desktop relay role denied')
    validatePairedRelayPolicy(this.plan.policy)
    if (!Number.isSafeInteger(this.plan.sweepIntervalMs) || this.plan.sweepIntervalMs <= 0) throw new Error('invalid cleanup interval')
    const ports = this.plan.openPorts()
    const lifetime = new AbortController(), work = new Map<string, { controller: AbortController; done: Promise<void> }>(), pending = new Set<Promise<void>>(); let channel: AuthenticatedDeviceChannel | undefined, binding: DeviceTransportBinding | undefined, connection: EncryptedRelayConnection | undefined, proofPending = false, failure = false, closePromise: Promise<void> | undefined
    const track = (operation: Promise<void>) => { pending.add(operation); void operation.catch(error => { void error; failure = true; endpoint?.close() }).finally(() => pending.delete(operation)) }
    let endpoint: PairedRelayEndpoint | undefined, stopExpiry = async () => {}
    const close = () => { if (closePromise !== undefined) return closePromise; closePromise = (async () => { for (const action of [() => lifetime.abort(), () => endpoint?.close(), ...[...work.values()].map(item => () => item.controller.abort()), () => ports.control.terminate()]) { try { action() } catch (error) { void error; failure = true } }; const results = await Promise.allSettled([...pending, ...[...work.values()].map(item => item.done), Promise.resolve().then(() => channel?.close()), Promise.resolve().then(() => endpoint?.settled()), Promise.resolve().then(stopExpiry)]); if (failure || results.some(value => value.status === 'rejected')) throw new Error('desktop relay cleanup failed') })(); return closePromise }
    try {
    endpoint = new PairedRelayEndpoint(this.plan.trust, this.plan.policy, ports, async value => {
      if (binding === undefined || binding.signal.aborted || connection === undefined) throw new Error('device binding unavailable'); const outgoing = connection
      if (channel === undefined) { const proof = fields(value, ['kind', 'value']); if (proof.kind !== 'device-proof' || !proofPending) throw new Error('device proof required'); proofPending = false; const currentBinding = binding, lease = await this.owner.authenticate(proof.value, currentBinding, lifetime.signal); if (currentBinding.signal.aborted || binding !== currentBinding || lifetime.signal.aborted) { await lease.close(); return }; const currentChannel = new AuthenticatedDeviceChannel(ctx, lease, this.owner); channel = currentChannel; lease.signal.addEventListener('abort', () => { if (!currentBinding.signal.aborted) endpoint?.close() }, { once: true }); await outgoing.send({ kind: 'authorized' }); return }
      const request = carrierRequest(value)
      if (request.kind === 'stop') { work.get(request.id)?.controller.abort(); return }
      if (work.has(request.id) || work.size >= this.plan.policy.maxProofs) throw new Error('carrier request capacity')
      const admitted = channel, controller = new AbortController(), signal = AbortSignal.any([controller.signal, admitted.lifetime, lifetime.signal, binding.signal])
      const entry = { controller, done: Promise.resolve() }
      entry.done = (async () => { try { if (request.kind === 'request') { const result = await admitted.invoke(request.value, signal); if (!signal.aborted) await outgoing.send(jsonPayload({ kind: 'result', id: request.id, value: result })) } else { const stream = await admitted.follow(request.value, signal); for await (const frame of stream) { if (signal.aborted) return; await outgoing.send(jsonPayload({ kind: 'frame', id: request.id, value: frame })) }; if (!signal.aborted) await outgoing.send({ kind: 'end', id: request.id }) } } catch (error) { void error; if (!signal.aborted) await outgoing.send({ kind: 'error', id: request.id, code: 'profile-request-failed' }) } finally { if (work.get(request.id) === entry) work.delete(request.id) } })()
      work.set(request.id, entry); track(entry.done)
    }, (next, nextConnection) => {
      binding = next; connection = nextConnection; channel = undefined; proofPending = true
      next.signal.addEventListener('abort', () => { if (binding !== next) return; for (const item of work.values()) item.controller.abort(); track(channel?.close() ?? Promise.resolve()); channel = undefined }, { once: true })
      track((async () => { await nextConnection.send(jsonPayload({ kind: 'device-challenge', value: await this.owner.challenge(this.plan.deviceId, next) })) })())
    }, state => { if (state === 'failed') ctx.logger('harmony-relay').error('paired connection failed; pending request outcomes may be unknown'); ended() }, lifetime.signal, undefined, stage => { ctx.logger('harmony-relay').info('DSH_CONTROL_STAGE=desktop-' + stage + ' at=' + ports.clock()) })
    stopExpiry = mountExpiryCleanup(ports.scheduler, this.plan.sweepIntervalMs, () => this.owner.sweep(), async () => { endpoint?.close() })
    return close
    } catch (error) { void error; try { await close() } catch (cleanupError) { void cleanupError; throw new Error('desktop relay initialization cleanup failed') }; throw new Error('desktop relay initialization failed') }
  }
}
declare module '@deepseek-ai/cordis' { interface Context { /** Local provider owns paired ports; no remote method or implicit credential construction. */ harmonyRelayLifecycle: DesktopRelayLifecycle } }

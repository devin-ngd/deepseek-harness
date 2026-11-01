/** Device-binding encrypted carrier over the existing relay/control implementation; no public listener or model is owned here. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { PairedRelayEndpoint, validatePairedRelayPolicy, type PairedRelayPolicy, type PairedRelayPorts } from '../../src/paired-relay.ts'
import type { EndpointRelayTrust } from '../../src/relay-control-client.ts'
import type { EncryptedRelayConnection } from '../../integration/e2e-socket.ts'
import type { DeviceTransportBinding } from '../../integration/device-auth.ts'
import type { LinkConfig } from '../../src/link-protocol.ts'
import { fields } from '../../src/link-protocol.ts'
import { jsonPayload } from '../../src/wire.ts'
import { carrierRequest } from '../../src/device-carrier-protocol.ts'
import { deviceConnectionTicketSchema, deviceRelayPairId, type DeviceBinding } from '../../src/device-binding-protocol.ts'
import { profileRpcCodec } from '../../src/profile-rpc-codec.ts'
import { DeviceBoundProfileChannel, type DeviceBindingProfileProvider } from './device-binding-profile.ts'
import type { DeviceBindingOwner } from './device-binding.ts'
import type { DeviceSessionRoute } from '../../src/mobile-device-product.ts'
import type { DesktopRelayLifecycle } from './relay-lifecycle.ts'
import { verifyDeviceRoute, type DeviceRoute } from '../../src/device-route-protocol.ts'
import { nodeE2EPrimitives } from '../../integration/p256-channel.ts'
import { deviceCommandStep } from './device-command-step.ts'

/** Explicit local routing lease and original crypto ports; a relay directory lease never substitutes for a device ticket. */
export type DeviceBindingRelayPlan = { readonly desktopId: string; isRouteCurrent(): Promise<boolean>; readonly trust: EndpointRelayTrust; readonly policy: PairedRelayPolicy; readonly limits: LinkConfig; openPorts(): PairedRelayPorts } & ({ readonly route: DeviceRoute; readonly paired?: never } | { readonly paired: DeviceBinding; readonly route?: never })
const routeSchema = z.object({ desktopId: z.string().min(1).max(256), profileId: z.literal('desktop'), sessionId: z.string().min(1).max(256) }).strict()
/** Versioned device carrier installs only in an already enabled desktop profile. */
export class DeviceBindingDesktopRelay implements DesktopRelayLifecycle {
  private ended: 'closed' | 'failed' | undefined
  /** @returns actual terminal channel state, independently of the mounted plugin lifetime. */
  get terminalState(): 'closed' | 'failed' | undefined { return this.ended }
  /** @param owner - original persistent registration owner. @param provider - verified non-operator peer factory. @param plan - locally approved existing relay route and budgets. */
  constructor(private readonly owner: DeviceBindingOwner, private readonly provider: DeviceBindingProfileProvider, private readonly plan: DeviceBindingRelayPlan) {}
  /** @param ctx - same desktop profile's canonical executor. @returns awaited resource cleanup; persistent binding survives disconnect, while ticket leases are retired. */
  async mount(ctx: Context): Promise<() => Promise<void>> {
    if (ctx.get('profileContext')?.name !== 'desktop' || this.plan.trust.role !== 'desktop') throw new Error('device relay profile denied')
    validatePairedRelayPolicy(this.plan.policy)
    const route = this.plan.route === undefined ? undefined : await verifyDeviceRoute(this.plan.route, nodeE2EPrimitives, undefined, Date.now())
    const registration = this.plan.route === undefined ? this.plan.paired : this.plan.route.offer.binding
    const expiresAt = this.plan.trust.expiresAt
    const context = route === undefined ? undefined : { routeId: route.offer.routeId, routeEpoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt }
    if (registration.revoked || this.plan.desktopId !== registration.desktopId || this.plan.trust.pairId !== (route === undefined ? deviceRelayPairId(registration) : route.offer.routeId) || this.plan.trust.epoch !== (route?.offer.routeEpoch ?? registration.epoch) || route !== undefined && expiresAt !== route.offer.expiresAt || this.plan.trust.audience !== registration.audience || this.plan.trust.credentialId !== registration.desktopCredentialId || !await this.plan.isRouteCurrent()) throw new Error('device relay saved pairing denied')
    const ports = this.plan.openPorts(), lifetime = new AbortController(), work = new Map<string, { controller: AbortController; done: Promise<void> }>(), pending = new Set<Promise<void>>()
    let endpoint: PairedRelayEndpoint | undefined, connection: EncryptedRelayConnection | undefined, binding: DeviceTransportBinding | undefined, channel: DeviceBoundProfileChannel | undefined, proofPending = false, closing: Promise<void> | undefined, failed = false, stopRoute = () => {}
    const assertRoute = async () => { if (lifetime.signal.aborted || expiresAt <= Date.now() || !await this.plan.isRouteCurrent()) throw new Error('device route retired') }
    const track = (task: Promise<void>) => { pending.add(task); void task.catch(error => { void error; failed = true; endpoint?.close() }).finally(() => pending.delete(task)) }
    const close = () => {
      if (closing !== undefined) return closing
      stopRoute()
      for (const action of [() => lifetime.abort(), ...[...work.values()].map(item => () => item.controller.abort()), () => endpoint?.close(), () => ports.control.terminate()]) { try { action() } catch (error) { void error; failed = true } }
      closing = (async () => { const results = await Promise.allSettled([...pending, ...[...work.values()].map(item => item.done), Promise.resolve().then(() => channel?.close()), Promise.resolve().then(() => endpoint?.settled())]); if (failed || results.some(result => result.status === 'rejected')) throw new Error('device relay cleanup failed') })()
      return closing
    }
    const routeTimer = setTimeout(() => { void close().catch(error => { void error; failed = true }) }, expiresAt - Date.now()); stopRoute = () => clearTimeout(routeTimer)
    const argument = (value: unknown) => profileRpcCodec(this.plan.limits.maxPacketBytes).schema.parse(value)
    const request = async (candidate: unknown, signal: AbortSignal) => {
      const data = candidate !== null && typeof candidate === 'object' && 'method' in candidate ? candidate : null
      if (data === null || channel === undefined || binding === undefined) throw new Error('device carrier unavailable')
      if (data.method === 'metadata') {
        const value = fields(candidate, ['method', 'argument']); if (value.argument !== null) throw new Error('device metadata denied')
        return jsonPayload({ desktopId: this.plan.desktopId, profileId: 'desktop', sessions: await channel.catalog() })
      }
      if (data.method === 'select') { const value = fields(candidate, ['method', 'route']), route = routeSchema.parse(value.route); await channel.select(route); return jsonPayload({ selected: route }) }
      if (data.method === 'request') { const value = fields(candidate, ['method', 'route', 'argument']), route = routeSchema.parse(value.route); return jsonPayload(await channel.request(route, argument(value.argument), signal)) }
      throw new Error('device carrier method denied')
    }
    try {
      endpoint = new PairedRelayEndpoint(this.plan.trust, this.plan.policy, ports, async value => {
        await assertRoute()
        if (binding === undefined || binding.signal.aborted || connection === undefined) throw new Error('device carrier binding unavailable')
        const outgoing = connection, requestBinding = binding
        if (channel === undefined) {
          const packet = fields(value, ['kind', 'value']); if (packet.kind !== 'device-binding-proof' || !proofPending) throw new Error('device binding proof required')
          proofPending = false; const original = binding, ticket = deviceConnectionTicketSchema.parse(await this.owner.authenticate(original, packet.value, expiresAt)); if (ticket.desktopId !== this.plan.desktopId || ticket.bindingId !== registration.bindingId || ticket.epoch !== registration.epoch) throw new Error('device relay registration mismatch')
          if (binding !== original || original.signal.aborted || lifetime.signal.aborted) return
          channel = new DeviceBoundProfileChannel(ctx, this.owner, this.provider, original, ticket, this.plan.limits)
          const ticketLifetime = await this.owner.connectionLifetime(original, ticket)
          ticketLifetime.addEventListener('abort', () => endpoint?.close(), { once: true })
          await outgoing.send(jsonPayload({ kind: 'device-binding-authorized', value: ticket })); return
        }
        const packet = carrierRequest(value)
        if (packet.kind === 'stop') { work.get(packet.id)?.controller.abort(); return }
        if (work.has(packet.id) || work.size >= this.plan.policy.maxProofs) throw new Error('device carrier request capacity')
        const controller = new AbortController(), signal = AbortSignal.any([controller.signal, lifetime.signal, binding.signal]), current = channel, item = { controller, done: Promise.resolve() }
        item.done = (async () => {
          try {
            if (packet.kind === 'request') { const result = await request(packet.value, signal); await assertRoute(); if (!signal.aborted && current === channel) await outgoing.send(jsonPayload({ kind: 'result', id: packet.id, value: result })) }
            else {
              const value = fields(packet.value, ['route', 'argument', 'resume']), route: DeviceSessionRoute = routeSchema.parse(value.route)
              for await (const frame of current.follow(route, argument(value.argument), value.resume, signal)) { await assertRoute(); if (signal.aborted || current !== channel) return; await outgoing.send(jsonPayload({ kind: 'frame', id: packet.id, value: frame })) }
              if (!signal.aborted) await outgoing.send({ kind: 'end', id: packet.id })
            }
          } catch (error) { void error; if (!signal.aborted && !lifetime.signal.aborted && !requestBinding.signal.aborted) await outgoing.send({ kind: 'error', id: packet.id, code: 'unknown-outcome' }) }
          finally { work.delete(packet.id) }
        })()
        work.set(packet.id, item); track(item.done)
      }, (next, encrypted) => {
        binding = next; connection = encrypted; proofPending = true
        track((async () => { await assertRoute(); const challenge = await this.owner.challenge(next, context); if (!next.signal.aborted && binding === next) await encrypted.send(jsonPayload({ kind: 'device-binding-challenge', value: challenge })) })())
        next.signal.addEventListener('abort', () => { for (const item of work.values()) item.controller.abort(); track(Promise.resolve().then(() => channel?.close())); channel = undefined; binding = undefined; connection = undefined; proofPending = false }, { once: true })
      }, state => { if (this.ended !== 'failed') this.ended = state; binding = undefined; connection = undefined; proofPending = false }, lifetime.signal)
      return close
    } catch (error) { return deviceCommandStep('relay-mount', () => { throw error }, [close]) }
  }
}

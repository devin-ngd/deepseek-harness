/** Normal local desktop commands for explicit device-wide binding; disabled loading creates no identity, record or transport. */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-questions'
import { z } from 'zod'
import { randomUUID, randomBytes } from 'node:crypto'
import { DeviceBindingOwner, type DeviceBindingPolicy } from './device-binding.ts'
import { CredentialDeviceBindingStorage } from './device-binding-storage.ts'
import { DeviceBindingProfileProvider, deviceProfileSessionPorts } from './device-binding-profile.ts'
import { DeviceBindingDesktopRelay } from './device-binding-relay.ts'
import { DesktopIdentitySigner } from './identity.ts'
import { WindowsCurrentUserProtection } from './windows-protection.ts'
import { openDesktopWssPorts, validateDesktopWssPolicy } from '../../integration/desktop-wss.ts'
import { validatePairedRelayPolicy } from '../../src/paired-relay.ts'
import { deviceBindingSchema, deviceRelayPairId, type DeviceBinding } from '../../src/device-binding-protocol.ts'
import { id } from '../../src/protocol.ts'
import * as Desktop from './index.ts'
import { CredentialDeviceRouteStorage } from './device-route-storage.ts'
import { DeviceRouteOwner } from '../../src/device-route-owner.ts'
import { DeviceCommandPreparationError, deviceCommandFailure } from './device-command-error.ts'
import type { DeviceRoute } from '../../src/device-route-protocol.ts'
import { deviceCommandStep } from './device-command-step.ts'
import { nodeE2EPrimitives } from '../../integration/p256-channel.ts'
import { AutomaticConnection } from '../../src/automatic-connection.ts'

const positive = z.number().int().positive().max(0x7fffffff), identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/), alias = z.string().regex(/^[a-z][a-z0-9-]{0,126}$/)
const settings = z.object({ enabled: z.literal(true), desktopId: identifier, deviceId: identifier, identityAlias: alias, phoneIdentityAlias: alias, audience: z.string().max(253).regex(/^[a-z0-9.-]+$/), identityProtectionTimeoutMs: positive,
  connectionMode: z.enum(['paired', 'window']).default('paired'), reconnectMs: positive.default(5000),
  enrollmentTtlMs: positive.max(600000), connectionTtlMs: positive.max(1800000), challengeTtlMs: positive, maxChallenges: positive, maxCatalogRows: positive, maxPublicBytes: positive, routingTtlMs: positive, journalMode: z.enum(['create', 'reopen']),
  relay: z.object({ maxProofs: positive, maxQueuedBytes: positive, maxChallengeTtlMs: positive, maxRoomTtlMs: positive, handshakeMs: positive, e2e: z.object({ maxFrameBytes: positive, maxPlaintextBytes: positive, maxFrames: positive }).strict() }).strict(),
  wss: z.object({ host: z.string(), handshakeMs: positive, maxFrameBytes: positive, maxBufferedBytes: positive, maxControlFrames: positive }).strict(),
}).strict()
/** Explicit device-mode deployment settings; profile is fixed to desktop and legacy pairing is a separate entry. */
export type DeviceCommandOptions = z.infer<typeof settings>
/** Default-disabled normal product entry. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile/device'
const required = ['commands', 'userQuestions', 'connection', 'agents', 'sessionController', 'sessionPersistence', 'credentials', 'authorization', 'remoteAccess', 'profileContext', 'typert', 'typertGateway', 'richInline', 'workspaceRegistry', 'storageDomain'] as const
/** Wait for original services and isolated credentials before registering any command. */
export const inject = [...required]
interface Prepared { readonly context: Context; readonly owner: DeviceBindingOwner; readonly routes: DeviceRouteOwner; readonly signer: DesktopIdentitySigner; readonly storage: CredentialDeviceBindingStorage; dispose(): Promise<void> }
class DeviceCommand {
  private readonly authority = {}
  private readonly lifetime = new AbortController()
  private prepared: Prepared | undefined
  private product: (() => Promise<void>) | undefined
  private busy = false
  private offered = false
  private closed = false
  private relay: DeviceBindingDesktopRelay | undefined
  private readonly automatic: AutomaticConnection | undefined
  constructor(private readonly ctx: Context, private readonly options: DeviceCommandOptions) {
    if (options.connectionMode === 'paired') this.automatic = new AutomaticConnection({ available: () => !this.closed && !this.busy && !this.offered, connected: () => this.product !== undefined && this.relay?.terminalState === undefined, connect: async () => { this.busy = true; try { await this.connectSaved() } finally { this.busy = false } }, disconnect: () => this.clear(), failed: () => this.ctx.logger('harmony-device').warn('Saved phone connection unavailable; retrying') }, { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }, options.reconnectMs)
  }
  startAutomatic(): void { void this.automatic?.start().catch(error => { void error; this.ctx.logger('harmony-device').warn('Saved phone connection unavailable; retrying') }) }
  private async connectSaved(): Promise<boolean> {
    const raw = await new CredentialDeviceBindingStorage(this.ctx, this.options.desktopId, this.options.deviceId).read()
    if (raw === null || deviceBindingSchema.parse(JSON.parse(raw)).revoked) return false
    if (this.product !== undefined) await this.clear()
    try {
      const prepared = await this.prepare(), record = await prepared.owner.publicRecord(this.authority)
      if (record === null || record.revoked) return false
      await this.openProduct(prepared, record)
      return true
    } catch (error) { await this.clear(); throw error }
  }
  private async openProduct(prepared: Prepared, record: DeviceBinding, route?: DeviceRoute): Promise<void> {
    const provider = await deviceCommandStep('profile-provider', () => new DeviceBindingProfileProvider(prepared.context, Date.now)), options = { enabled: true, desktopId: record.desktopId, profileId: 'desktop', relayEnabled: true, journalMode: this.options.journalMode === 'create' ? 'create-or-reopen' as const : 'reopen' as const }, spec = await deviceCommandStep('transport-policy', () => Desktop.resolveOptions(options, Date.now))
    const trust = { pairId: route === undefined ? deviceRelayPairId(record) : id<'harmony-relay-pair'>(route.offer.routeId), epoch: route?.offer.routeEpoch ?? record.epoch, role: 'desktop' as const, audience: record.audience, credentialId: id<'harmony-device-credential'>(record.desktopCredentialId), expiresAt: route?.offer.expiresAt ?? Date.now() + this.options.routingTtlMs }
    const selection = route === undefined ? { paired: record } : { route }
    await deviceCommandStep('relay-provider', () => prepared.context.provide('harmonyRelayLifecycle', this.relay = new DeviceBindingDesktopRelay(prepared.owner, provider, { ...selection, desktopId: record.desktopId, isRouteCurrent: async () => route === undefined ? JSON.stringify(await prepared.owner.publicRecord(this.authority)) === JSON.stringify(record) : JSON.stringify(await prepared.routes.current(this.authority)) === JSON.stringify(route), trust, policy: this.options.relay, limits: spec.limits, openPorts: () => openDesktopWssPorts(this.options.wss, trust, prepared.signer, record.phonePublicSpki) })))
    let stopProduct: (() => Promise<void>) | undefined
    await deviceCommandStep('product-activate', async () => { const product = prepared.context.plugin(Desktop, options); stopProduct = () => product.dispose(); await product; if (this.closed) throw new Error('device startup cancelled'); this.product = stopProduct }, [() => stopProduct?.(), () => this.clear()])
  }
  private async approve(invocation: CommandInvocation, question: string): Promise<boolean> { const answer = await this.ctx.userQuestions.ask({ agent: invocation.agent, signal: invocation.signal, questions: [{ id: 'harmony-device', header: 'Harmony device', question, options: [{ label: 'Deny' }, { label: 'Allow' }] }] }); invocation.signal.throwIfAborted(); return !this.closed && answer.answers.length === 1 && answer.answers[0]?.id === 'harmony-device' && answer.answers[0].selected.length === 1 && answer.answers[0].selected[0] === 'Allow' && answer.answers[0].custom === undefined }
  private async prepare(): Promise<Prepared> {
    if (this.prepared !== undefined) return this.prepared
    let signer: DesktopIdentitySigner
    try { signer = await DesktopIdentitySigner.open(this.ctx, this.authority, this.authority, this.options.identityAlias, new WindowsCurrentUserProtection({ timeoutMs: this.options.identityProtectionTimeoutMs })) }
    catch (error) { throw new DeviceCommandPreparationError('identity-open', error) }
    let selected: Prepared | undefined
    const fork = this.ctx.plugin({ name: 'harmony-device-local-owner', inject: [...required], apply: inner => {
      const policy: DeviceBindingPolicy = { desktopId: this.options.desktopId, profileId: 'desktop', deviceId: this.options.deviceId, identityAlias: this.options.phoneIdentityAlias, audience: this.options.audience, enrollmentTtlMs: this.options.enrollmentTtlMs, connectionTtlMs: this.options.connectionTtlMs, challengeTtlMs: this.options.challengeTtlMs, maxChallenges: this.options.maxChallenges, maxCatalogRows: this.options.maxCatalogRows, maxPublicBytes: this.options.maxPublicBytes }
      const storage = new CredentialDeviceBindingStorage(inner, policy.desktopId, policy.deviceId), owner = new DeviceBindingOwner(this.authority, policy, storage, signer, deviceProfileSessionPorts(inner), Date.now, { id: randomUUID, nonce: () => randomBytes(32).toString('base64url') }, { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } })
      inner.effect(() => storage.onChange(() => owner.invalidate(this.authority))); inner.effect(() => () => owner.close())
      const routes = new DeviceRouteOwner(this.authority, 'desktop', async () => { const record = await owner.publicRecord(this.authority); if (record === null) throw new Error('device binding absent'); return record }, new CredentialDeviceRouteStorage(inner, policy.desktopId, policy.deviceId), signer, nodeE2EPrimitives, Date.now, { id: randomUUID, nonce: () => randomBytes(32).toString('base64url') })
      inner.effect(() => () => routes.close())
      selected = { context: inner, owner, routes, signer, storage, dispose: () => fork.dispose() }
    } })
    try { await fork; if (selected === undefined || this.closed) throw new Error('device owner unavailable'); this.prepared = selected; return selected }
    catch (error) { try { await fork.dispose() } finally { signer.close() }; throw new DeviceCommandPreparationError('owner-create', error) }
  }
  private pair(route: DeviceRoute) { return { pairId: route.offer.routeId, desktopPublicSpki: route.offer.binding.desktopPublicSpki, phonePublicSpki: route.offer.binding.phonePublicSpki, epoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt, revoked: false } }
  private async clear(): Promise<void> { const product = this.product, prepared = this.prepared; this.product = undefined; this.relay = undefined; this.prepared = undefined; this.offered = false; const results = await Promise.allSettled([product?.(), prepared?.dispose()]); prepared?.signer.close(); if (results.some(result => result.status === 'rejected')) throw new Error('device product cleanup failed') }
  async run(original: CommandInvocation): Promise<CommandResult> {
    const invocation = { ...original, signal: AbortSignal.any([original.signal, this.lifetime.signal]) }, peer = this.ctx.invocation?.peer
    if (this.closed || this.busy && !/^\s*(?:stop|route-stop)\s*$/.test(original.rawInput) || this.ctx.get('profileContext')?.name !== 'desktop' || peer !== undefined && peer !== this.ctx.connection.browserPeer || this.ctx.agents.get(invocation.agent.id) !== invocation.agent || !this.ctx.agents.roots().includes(invocation.agent)) return { kind: 'error', text: 'Device binding requires a live root conversation in the local desktop profile.' }
    const sessionId = invocation.agent.session.id, parts = invocation.rawInput.trim().match(/^(\S*)(?:\s+([\s\S]*))?$/), verb = parts?.[1] || 'status', raw = parts?.[2]?.trim() ?? ''
    const result = (state: string, publicResult?: unknown, relayPair?: unknown): CommandResult => ({ kind: 'success', text: JSON.stringify({ profileId: 'desktop', sessionId, state, ...(publicResult === undefined ? {} : { publicResult }), ...(relayPair === undefined ? {} : { relayPair }) }) })
    if (new TextEncoder().encode(raw).length > this.options.maxPublicBytes) return { kind: 'error', text: 'Public device input exceeds the configured capacity.' }
    this.busy = true
    try {
      invocation.signal.throwIfAborted()
      if (verb === 'status' && raw === '') { const store = this.prepared?.storage ?? new CredentialDeviceBindingStorage(this.ctx, this.options.desktopId, this.options.deviceId), value = await store.read(), record = value === null ? null : deviceBindingSchema.parse(JSON.parse(value)); return result(record?.revoked ? 'revoked' : this.product !== undefined ? this.relay?.terminalState === undefined ? 'transport-started' : 'transport-' + this.relay.terminalState : this.offered ? 'offered' : record === null ? 'not-bound' : 'bound') }
      if (verb === 'start') {
        const phone = z.object({ identityAlias: alias, publicSpki: z.string(), credentialId: z.string() }).strict().parse(JSON.parse(raw)); if (phone.identityAlias !== this.options.phoneIdentityAlias || !await this.approve(invocation, 'Use only the existing identities to prepare device binding for all current and future visible Sessions in desktop? Other profiles and arbitrary Host APIs remain denied.')) return { kind: 'error', text: 'Device binding was not approved or original phone alias did not match.' }
        const prepared = await this.prepare(), offer = await prepared.owner.offer(this.authority, phone); this.offered = true; return result('offered', offer)
      }
      if (verb === 'confirm') { const prepared = this.prepared; if (prepared === undefined || !this.offered) throw new Error('device offer absent'); const record = await prepared.owner.confirm(this.authority, JSON.parse(raw), async () => this.approve(invocation, 'Persist this original device binding for all current and future visible desktop Sessions, until explicit revocation? Connections still require fresh short-lived proofs and tickets; no model is invoked.')); this.offered = false; return result('bound', record) }
      if (verb === 'route-start' && raw === '') { if (this.product !== undefined) return { kind: 'error', text: 'Stop the previous transport before preparing another route window.' }; const prepared = await this.prepare(), ttl = Math.min(this.options.routingTtlMs, this.options.connectionTtlMs, 1800000); if (!await this.approve(invocation, 'Prepare one new original-key relay window for at most ' + ttl + 'ms? The phone must approve and sign the exact route separately. No network or model is started.')) return { kind: 'error', text: 'Route window was not approved.' }; return result('route-offered', await prepared.routes.offer(this.authority, ttl)) }
      if (verb === 'route-confirm') { const prepared = await this.prepare(), route = await prepared.routes.confirm(this.authority, JSON.parse(raw)); return result('route-ready', route, this.pair(route)) }
      if ((verb === 'directory' || verb === 'route-status') && raw === '') { const prepared = await this.prepare(), route = await prepared.routes.current(this.authority); return route === null ? result('route-required') : result('route-ready', route, this.pair(route)) }
      if ((verb === 'stop' || verb === 'route-stop') && raw === '') {
        if (this.automatic !== undefined) { await this.automatic.stop(); return result('stopped') }
        if (this.offered && this.prepared !== undefined) await this.prepared.owner.cancelOffer(this.authority)
        const raw = await new CredentialDeviceBindingStorage(this.ctx, this.options.desktopId, this.options.deviceId).read()
        let failure: unknown
        try { if (raw !== null) await (await this.prepare()).routes.retire(this.authority) } catch (error) { failure = error }
        await this.clear(); if (failure !== undefined) throw failure; return result('stopped')
      }
      if ((verb === 'connect' || verb === 'reconnect') && raw === '') {
        if (this.automatic !== undefined) { if (!await this.connectSaved()) return { kind: 'error', text: 'Pair this phone once before connecting.' }; this.startAutomatic(); return result('transport-started') }
        if (verb !== 'reconnect' && this.product !== undefined || !await this.approve(invocation, 'Open the current dual-signed finite route with fresh channel proofs and tickets? Reconnect first closes the prior local transport. It does not extend this window or submit a model task.')) return { kind: 'error', text: 'Device connection was not approved or is already active.' }
        if (verb === 'reconnect') await deviceCommandStep('transport-stop', () => this.clear())
        const prepared = await this.prepare(), record = await deviceCommandStep('binding-read', async () => { const value = await prepared.owner.publicRecord(this.authority); if (value === null || value.revoked) throw new Error('active device binding missing'); return value })
        const route = await deviceCommandStep('route-read', async () => { const value = await prepared.routes.current(this.authority); if (value === null) throw new Error('dual-signed relay route required'); return value })
        await this.openProduct(prepared, record, route)
        return result('transport-started')
      }
      if (verb === 'revoke' && raw === '') { if (!await this.approve(invocation, 'Durably revoke this device binding and all its current tickets? Publish the signed tombstone to the route journal separately before acknowledging relay revocation.')) return { kind: 'error', text: 'Device revocation was not approved.' }; const prepared = await this.prepare(); const retired = await Promise.allSettled([prepared.routes.retire(this.authority), prepared.owner.revoke(this.authority)]); if (retired.some(item => item.status === 'rejected')) { await this.clear(); throw new Error('device revocation outcome unknown') }; const record = await prepared.owner.publicRecord(this.authority); if (record === null) throw new Error('device tombstone unavailable'); await this.clear(); return result('revoked', record) }
      return { kind: 'error', text: 'Use status, start, confirm, route-start, route-confirm, route-status, directory, connect, reconnect, stop or revoke.' }
    } catch (error) { return { kind: 'error', text: deviceCommandFailure(error, invocation.signal.aborted) } }
    finally { this.busy = false }
  }
  async close(): Promise<void> { this.closed = true; this.lifetime.abort(); const first = await Promise.allSettled([this.automatic?.stop()]); const last = await Promise.allSettled([this.clear()]); if ([...first, ...last].some(value => value.status === 'rejected')) throw new Error('device connection shutdown failed') }
}
/** @param ctx - original local profile services. @param candidate - default-disabled explicit deployment. @returns after registering only the human command; does not open identities, storage, sockets or models. */
export async function apply(ctx: Context, candidate: unknown = { enabled: false }): Promise<void> {
  if (z.object({ enabled: z.literal(false).optional() }).strict().safeParse(candidate).success) return
  const options = settings.parse(candidate); validateDesktopWssPolicy(options.wss); validatePairedRelayPolicy(options.relay)
  if (options.audience !== options.wss.host || options.challengeTtlMs > options.relay.maxChallengeTtlMs) throw new Error('device command policy denied')
  await ctx.inject([...required], inner => { if (inner.profileContext.name !== 'desktop') throw new Error('device command requires desktop profile'); const command = new DeviceCommand(inner, options); inner.effect(() => () => command.close()); inner.effect(() => inner.commands.register({ name: 'harmony-device', description: 'Bind the original phone to visible desktop Sessions', input: { hint: 'status | start <public JSON> | confirm <signed JSON> | route-start | route-confirm <signed JSON> | route-status | connect | stop | revoke' }, recordInput: false, handler: invocation => command.run(invocation) })); command.startAutomatic() })
}

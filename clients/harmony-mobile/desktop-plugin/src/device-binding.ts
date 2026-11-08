/** Persistent desktop device registration and finite channel receipts; construction performs no IO or activation. */
import { z } from 'zod'
import { sessionCreationOptionsSchema, type SessionCreationOptions } from '../../src/session-creation.ts'
import type { CleanupScheduler } from '../../integration/connection-lifetime.ts'
import type { P256IdentitySigner } from '../../src/e2e-channel.ts'
import type { DeviceTransportBinding } from '../../integration/device-auth.ts'
import { p256CredentialId, verifyP256 } from '../../integration/p256-public.ts'
import { deviceGrantOperations } from '../../src/pairing-protocol.ts'
import { deviceRouteContextSchema, type DeviceRouteContext } from '../../src/device-binding-protocol.ts'
import { deviceSessionRowSchema, deviceProjectRowSchema, deviceSessionActionSchema, deviceSessionManagedSchema, type DeviceSessionRow, type DeviceProjectRow, type DeviceSessionAction } from '../../src/device-session-directory.ts'
import { deviceBindingSchema, deviceBindingOfferSchema, deviceBindingReplySchema, deviceConnectionChallengeSchema, deviceConnectionTicketSchema, deviceBindingBytes, deviceBindingOfferBytes, deviceBindingReplyBytes, deviceConnectionChallengeBytes, deviceConnectionProofBytes, deviceConnectionTicketBytes, type DeviceBinding, type DeviceBindingOffer, type DeviceConnectionChallenge, type DeviceConnectionTicket } from '../../src/device-binding-protocol.ts'

/** Atomic public-only persistence; implementations preserve old generations and reject compare conflicts or unknown writes. */
export interface DeviceBindingStorage { read(): Promise<string | null>; compareAndSet(previous: string | null, next: string): Promise<void> }
export type { DeviceSessionRow, DeviceProjectRow, DeviceSessionAction } from '../../src/device-session-directory.ts'
/** Host-owned catalogue and dispatch; only the existing ten mobile operations may enter dispatch. */
export interface DeviceBindingSessionPorts {
  list(signal: AbortSignal): Promise<readonly DeviceSessionRow[]>
  /** Optional desktop projects; absence publishes an empty project list. */
  projects?(signal: AbortSignal): Promise<readonly DeviceProjectRow[]>
  /** Optional current preset/model choices; an absent port retains desktop-default creation. */
  creationOptions?(signal: AbortSignal): Promise<SessionCreationOptions>
  /** Optional list management; absence rejects every phone management intent. */
  manage?(action: DeviceSessionAction, signal: AbortSignal): Promise<{ readonly sessionId: string }>
  /** Optional direct operation adapter; absence requires the existing profile wire dispatcher through run(). */
  dispatch?(sessionId: string, operation: typeof deviceGrantOperations[number], payload: unknown, signal: AbortSignal): Promise<unknown>
}
/** Explicit deployment budgets and original identity references; no key generation or network defaults. */
export interface DeviceBindingPolicy { readonly desktopId: string; readonly profileId: 'desktop'; readonly deviceId: string; readonly identityAlias: string; readonly audience: string; readonly enrollmentTtlMs: number; readonly connectionTtlMs: number; readonly challengeTtlMs: number; readonly maxChallenges: number; readonly maxCatalogRows: number; readonly maxPublicBytes: number }
interface PendingConnection { readonly challenge: DeviceConnectionChallenge; readonly transport: DeviceTransportBinding }
interface Connection { readonly ticket: DeviceConnectionTicket; readonly transport: DeviceTransportBinding; readonly controller: AbortController; readonly stopExpiry: () => void; readonly stopTransport: () => void }
/** Owns one original device's public registration. Cold starts reuse that registration, never an old Session grant or ticket. */
export class DeviceBindingOwner {
  private pending: DeviceBindingOffer | undefined
  private readonly challenges = new Map<string, PendingConnection>()
  private readonly tickets = new Map<string, Connection>()
  private readonly issued = new Set<string>()
  private readonly lifetime = new AbortController()
  private closed = false
  private blocked = false
  private revocationPending = false
  private tail: Promise<void> = Promise.resolve()
  /** @param authority - exact desktop-local enrollment/revocation capability. @param policy - fixed desktop profile and explicit capacities. @param storage - dedicated public registration namespace. @param signer - already-existing DPAPI identity. @param sessions - normal profile's filtered catalogue and narrow operations. @param clock - trusted epoch clock. @param identities - cryptographic random ids/nonces in product, fixed fixtures in tests. */
  constructor(private readonly authority: object, private readonly policy: DeviceBindingPolicy, private readonly storage: DeviceBindingStorage, private readonly signer: P256IdentitySigner, private readonly sessions: DeviceBindingSessionPorts, private readonly clock: () => number, private readonly identities: { id(): string; nonce(): string }, private readonly scheduler: CleanupScheduler) {
    if (policy.profileId !== 'desktop' || ![policy.enrollmentTtlMs, policy.connectionTtlMs, policy.challengeTtlMs, policy.maxChallenges, policy.maxCatalogRows, policy.maxPublicBytes].every(value => Number.isSafeInteger(value) && value > 0) || policy.connectionTtlMs > 1800000 || policy.enrollmentTtlMs > 600000) throw new Error('device binding policy denied')
    p256CredentialId(signer.publicSpki)
  }
  private available(): void { if (this.closed || this.blocked) throw new Error('device binding unavailable') }
  private local(authority: object): void { this.available(); if (authority !== this.authority) throw new Error('device binding local decision denied') }
  private bytes(raw: string): void { if (Buffer.byteLength(raw, 'utf8') > this.policy.maxPublicBytes) throw new Error('device binding capacity') }
  private next(): string { const value = this.identities.id(); if (this.issued.has(value) || this.issued.size >= this.policy.maxChallenges) throw new Error('device binding challenge capacity'); this.issued.add(value); return value }
  private async sign(bytes: Uint8Array): Promise<string> { const signature = Buffer.from(await this.signer.sign(bytes)).toString('base64url'); this.available(); return signature }
  private async registration(): Promise<{ raw: string; value: DeviceBinding }> {
    this.available(); const raw = await this.storage.read(); this.available(); if (raw === null) throw new Error('device is not bound'); this.bytes(raw)
    const value = deviceBindingSchema.parse(JSON.parse(raw)), { signature, ...unsigned } = value
    if (value.desktopId !== this.policy.desktopId || value.profileId !== this.policy.profileId || value.deviceId !== this.policy.deviceId || value.identityAlias !== this.policy.identityAlias || value.audience !== this.policy.audience || value.desktopPublicSpki !== this.signer.publicSpki || value.desktopCredentialId !== p256CredentialId(this.signer.publicSpki) || value.credentialId !== p256CredentialId(value.phonePublicSpki) || !verifyP256(this.signer.publicSpki, deviceBindingBytes(unsigned), signature)) throw new Error('device binding identity denied')
    return { raw, value }
  }
  private async active(): Promise<{ raw: string; value: DeviceBinding }> { this.available(); if (this.revocationPending) throw new Error('device binding revocation pending'); const result = await this.registration(); if (result.value.revoked) throw new Error('device binding revoked'); return result }
  private serialized<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => {}, () => {}); return result }
  /** @param authority - exact local status/connection owner. @returns verified public current registration, including a tombstone; no identity, ticket or network is created. */
  async publicRecord(authority: object): Promise<DeviceBinding | null> { this.local(authority); if (await this.storage.read() === null) return null; const value = (await this.registration()).value; this.local(authority); return structuredClone(value) }
  /** @param authority - desktop-local comparison owner. @param phone - original public identity only. @returns signed pending device offer; no registration, ticket or connection is created. */
  async offer(authority: object, phone: { readonly publicSpki: string; readonly credentialId: string }): Promise<DeviceBindingOffer> {
    this.local(authority)
    return this.serialized(async () => {
      this.local(authority); if (this.revocationPending || this.pending !== undefined || await this.storage.read() !== null || p256CredentialId(phone.publicSpki) !== phone.credentialId) throw new Error('device binding already exists or identity denied')
      const registration = { schema: 'harmony-device-binding/1' as const, bindingId: this.next(), desktopId: this.policy.desktopId, profileId: this.policy.profileId, deviceId: this.policy.deviceId, identityAlias: this.policy.identityAlias, desktopPublicSpki: this.signer.publicSpki, phonePublicSpki: phone.publicSpki, desktopCredentialId: p256CredentialId(this.signer.publicSpki), credentialId: phone.credentialId, audience: this.policy.audience, scope: { kind: 'all-visible-sessions' as const, profileId: this.policy.profileId }, operations: [...deviceGrantOperations], epoch: 1, createdAt: this.clock(), revoked: false }
      const unsigned = { schema: 'harmony-device-binding-offer/1' as const, registration, challengeId: this.next(), nonce: this.identities.nonce(), expiresAt: this.clock() + this.policy.enrollmentTtlMs }
      const value = deviceBindingOfferSchema.parse({ ...unsigned, signature: await this.sign(deviceBindingOfferBytes(unsigned)) }); this.local(authority); this.pending = value; return structuredClone(value)
    })
  }
  /** @param authority - exact local owner. @param reply - original phone's signed response. @param approve - normal desktop human confirmation, never a phone boolean. @returns after atomic public registration commit; unknown writes block this owner. */
  async confirm(authority: object, reply: unknown, approve: (record: DeviceBindingOffer) => Promise<boolean>): Promise<DeviceBinding> {
    this.local(authority)
    return this.serialized(async () => {
      this.local(authority); if (this.revocationPending) throw new Error('device binding revocation pending'); const parsed = deviceBindingReplySchema.parse(reply), pending = this.pending
      if (pending === undefined || pending.expiresAt <= this.clock() || JSON.stringify(parsed.offer) !== JSON.stringify(pending) || !verifyP256(pending.registration.phonePublicSpki, deviceBindingReplyBytes(pending), parsed.signature)) throw new Error('device binding proof denied')
      if (!await approve(structuredClone(pending))) throw new Error('device binding not approved')
      this.local(authority); if (pending.expiresAt <= this.clock() || this.pending !== pending) throw new Error('device binding offer expired')
      const value = deviceBindingSchema.parse({ ...pending.registration, signature: await this.sign(deviceBindingBytes(pending.registration)) }), raw = JSON.stringify(value); this.bytes(raw)
      try { await this.storage.compareAndSet(null, raw) } catch (error) { void error; this.blocked = true; throw new Error('device binding commit outcome unknown') }
      this.pending = undefined; this.local(authority); return value
    })
  }
  /** @param authority - local UI owner. @returns after discarding only an uncommitted offer; it never deletes registration history. */
  cancelOffer(authority: object): Promise<void> { this.local(authority); return this.serialized(async () => { this.local(authority); this.pending = undefined }) }
  /** @param transport - exact existing mutually authenticated encrypted channel. @returns fresh signed proof request bound to that object; no bearer credential or ticket is issued yet. */
  async challenge(transport: DeviceTransportBinding, route?: DeviceRouteContext): Promise<DeviceConnectionChallenge> {
    const { value } = await this.active(); transport.signal.throwIfAborted()
    if (transport.remoteCredentialId !== value.credentialId) throw new Error('device connection identity denied')
    const context = route === undefined ? undefined : deviceRouteContextSchema.parse(route)
    if (context !== undefined && context.expiresAt <= this.clock()) throw new Error('device route challenge expired')
    const unsigned = { schema: 'harmony-device-connection-challenge/1' as const, bindingId: value.bindingId, desktopId: value.desktopId, profileId: value.profileId, deviceId: value.deviceId, credentialId: value.credentialId, epoch: value.epoch, challengeId: this.next(), nonce: this.identities.nonce(), channelBindingId: transport.id, expiresAt: Math.min(this.clock() + this.policy.challengeTtlMs, context?.expiresAt ?? Number.MAX_SAFE_INTEGER), ...(context === undefined ? {} : { route: context }) }
    const challenge = deviceConnectionChallengeSchema.parse({ ...unsigned, signature: await this.sign(deviceConnectionChallengeBytes(unsigned)) }); transport.signal.throwIfAborted(); this.challenges.set(challenge.challengeId, { challenge, transport }); return structuredClone(challenge)
  }
  /** @param transport - same exact encrypted channel, never reconstructed from JSON. @param reply - single-use original-phone signature. @returns short-lived signed ticket scoped to this channel and persistent binding; cold starts require another proof, never another pairing. */
  async authenticate(transport: DeviceTransportBinding, reply: unknown, expiresAtCap = Number.MAX_SAFE_INTEGER): Promise<DeviceConnectionTicket> {
    const proof = z.object({ challengeId: z.string(), signature: z.string().max(192) }).strict().parse(reply), pending = this.challenges.get(proof.challengeId)
    if (pending === undefined || pending.transport !== transport) throw new Error('device connection challenge denied')
    this.challenges.delete(proof.challengeId)
    const { value } = await this.active(), challenge = pending.challenge; transport.signal.throwIfAborted()
    if (challenge.expiresAt <= this.clock() || challenge.bindingId !== value.bindingId || challenge.epoch !== value.epoch || transport.remoteCredentialId !== value.credentialId || !verifyP256(value.phonePublicSpki, deviceConnectionProofBytes(challenge), proof.signature)) throw new Error('device connection proof denied')
    if (!Number.isSafeInteger(expiresAtCap) || expiresAtCap <= this.clock()) throw new Error('device routing window expired')
    const now = this.clock(), unsigned = { schema: 'harmony-device-ticket/1' as const, ticketId: this.next(), bindingId: value.bindingId, desktopId: value.desktopId, profileId: value.profileId, deviceId: value.deviceId, credentialId: value.credentialId, epoch: value.epoch, channelBindingId: transport.id, scope: value.scope, operations: value.operations, issuedAt: now, expiresAt: Math.min(now + this.policy.connectionTtlMs, expiresAtCap, challenge.route?.expiresAt ?? Number.MAX_SAFE_INTEGER), ...(challenge.route === undefined ? {} : { route: challenge.route }) }
    const ticket = deviceConnectionTicketSchema.parse({ ...unsigned, signature: await this.sign(deviceConnectionTicketBytes(unsigned)) })
    const current = await this.active(); transport.signal.throwIfAborted(); if (challenge.expiresAt <= this.clock() || JSON.stringify(current.value) !== JSON.stringify(value)) throw new Error('device binding changed during proof')
    if (this.revocationPending) throw new Error('device binding revocation pending')
    for (const old of [...this.tickets.values()]) this.retire(old)
    const controller = new AbortController(), retire = () => { const value = this.tickets.get(ticket.ticketId); if (value !== undefined) this.retire(value) }
    const stopExpiry = this.scheduler.after(ticket.expiresAt - this.clock(), retire)
    transport.signal.addEventListener('abort', retire, { once: true })
    const connection = { ticket, transport, controller, stopExpiry, stopTransport: () => transport.signal.removeEventListener('abort', retire) }
    this.tickets.set(ticket.ticketId, connection)
    if (transport.signal.aborted || ticket.expiresAt <= this.clock()) { this.retire(connection); throw new Error('device connection retired') }
    return structuredClone(ticket)
  }
  private retire(connection: Connection): void {
    this.tickets.delete(connection.ticket.ticketId); connection.controller.abort()
    const outcomes = [connection.stopExpiry, connection.stopTransport].map(stop => { try { stop(); return true } catch (error) { void error; return false } })
    if (outcomes.includes(false)) { this.blocked = true; throw new Error('device connection cleanup failed') }
  }
  private async admitted(transport: DeviceTransportBinding, candidate: unknown): Promise<{ connection: Connection; registration: DeviceBinding; signal: AbortSignal }> {
    this.available(); const ticket = deviceConnectionTicketSchema.parse(candidate), connection = this.tickets.get(ticket.ticketId), { value } = await this.active()
    if (connection === undefined || connection.transport !== transport || JSON.stringify(ticket) !== JSON.stringify(connection.ticket) || ticket.bindingId !== value.bindingId || ticket.epoch !== value.epoch || ticket.expiresAt <= this.clock() || transport.remoteCredentialId !== value.credentialId) throw new Error('device ticket denied')
    const signal = AbortSignal.any([this.lifetime.signal, connection.controller.signal, transport.signal]); signal.throwIfAborted(); return { connection, registration: value, signal }
  }
  /** @param transport - exact authenticated channel. @param ticket - its short-lived public receipt. @returns current desktop-visible rows, including Sessions created after binding; no Agent is resumed. */
  async catalog(transport: DeviceTransportBinding, ticket: unknown): Promise<readonly DeviceSessionRow[]> {
    const { signal } = await this.admitted(transport, ticket), rows = await this.sessions.list(signal); signal.throwIfAborted()
    if (rows.length > this.policy.maxCatalogRows || rows.some(row => row.profileId !== 'desktop' || row.title.length > this.policy.maxPublicBytes) || new Set(rows.map(row => row.sessionId)).size !== rows.length) throw new Error('device catalogue scope or capacity denied')
    const parsed = z.array(deviceSessionRowSchema).parse(rows); await this.admitted(transport, ticket); return parsed
  }
  /** @param transport - exact authenticated channel. @param ticket - its short-lived public receipt. @returns current desktop projects without paths; empty when the profile adapter has no project port. */
  async projects(transport: DeviceTransportBinding, ticket: unknown): Promise<readonly DeviceProjectRow[]> {
    const { signal } = await this.admitted(transport, ticket), list = this.sessions.projects, rows = list === undefined ? [] : await list(signal); signal.throwIfAborted()
    if (rows.length > this.policy.maxCatalogRows || rows.some(row => row.title.length > this.policy.maxPublicBytes) || new Set(rows.map(row => row.projectId)).size !== rows.length) throw new Error('device project catalogue capacity denied')
    const parsed = z.array(deviceProjectRowSchema).parse(rows); await this.admitted(transport, ticket); return parsed
  }
  /** @param transport - original encrypted channel. @param ticket - current device receipt. @returns current creation choices after both admission checks, without starting a model. */
  async creationOptions(transport: DeviceTransportBinding, ticket: unknown): Promise<SessionCreationOptions> {
    const { signal } = await this.admitted(transport, ticket)
    if (this.sessions.creationOptions === undefined) throw new Error('device creation choices unavailable')
    const choices = sessionCreationOptionsSchema.parse(await this.sessions.creationOptions(signal))
    await this.admitted(transport, ticket)
    return choices
  }
  /**
   * Authorization is the registration's all-visible-sessions scope under a current ticket; these intents are separate from the signed mobile operations, so existing registrations need no new pairing.
   * @param transport - exact authenticated channel. @param ticket - current receipt. @param candidate - phone list-management intent naming a visible Session or project.
   * @returns the created or changed Session after admission still holds; a later admission failure leaves the outcome unknown and nothing is retried.
   */
  async manage(transport: DeviceTransportBinding, ticket: unknown, candidate: unknown): Promise<{ readonly sessionId: string }> {
    const action = deviceSessionActionSchema.parse(candidate), admission = await this.admitted(transport, ticket), manage = this.sessions.manage
    if (manage === undefined) throw new Error('device Session management unavailable')
    const visible = action.action === 'create' ? action.projectId === null || (await this.projects(transport, ticket)).some(row => row.projectId === action.projectId) : (await this.catalog(transport, ticket)).some(row => row.sessionId === action.sessionId)
    if (!visible) throw new Error('device Session management denied')
    const result = deviceSessionManagedSchema.parse(await manage(action, admission.signal))
    await this.admitted(transport, ticket); return result
  }
  /** @param transport - exact authenticated channel. @param ticket - current receipt. @param profileId - fixed route owner. @param sessionId - selected visible row. @param operation - existing narrow mobile operation. @param payload - existing operation-owned bounded parser input. @returns canonical result only if admission still holds after completion; accepted work is never retried. */
  dispatch(transport: DeviceTransportBinding, ticket: unknown, profileId: string, sessionId: string, operation: typeof deviceGrantOperations[number], payload: unknown): Promise<unknown> {
    const dispatch = this.sessions.dispatch
    if (dispatch === undefined) return Promise.reject(new Error('device direct dispatch unavailable; use the scoped profile channel'))
    return this.run(transport, ticket, profileId, sessionId, operation, signal => dispatch(sessionId, operation, payload, signal))
  }
  /** @param transport - exact encrypted channel. @param ticket - its current receipt. @returns host-only cancellation for expiry, replacement, disconnection and revocation; no access scope is created. */
  async connectionLifetime(transport: DeviceTransportBinding, ticket: unknown): Promise<AbortSignal> { return (await this.admitted(transport, ticket)).signal }
  /** @param transport - exact channel. @param ticket - current receipt. @param profileId - fixed desktop owner. @param sessionId - current visible row. @param operation - existing mobile operation. @param execute - same-process narrow profile callback, never supplied by JSON. @returns original result after fresh policy/visibility checks before dispatch and delivery; no retry occurs. */
  async run<T>(transport: DeviceTransportBinding, ticket: unknown, profileId: string, sessionId: string, operation: typeof deviceGrantOperations[number], execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const admission = await this.admitted(transport, ticket)
    if (profileId !== 'desktop' || !admission.registration.operations.includes(operation) || !(await this.catalog(transport, ticket)).some(row => row.sessionId === sessionId)) throw new Error('device Session operation denied')
    const result = await execute(admission.signal)
    await this.admitted(transport, ticket)
    if (!(await this.catalog(transport, ticket)).some(row => row.sessionId === sessionId)) throw new Error('device Session retired before delivery')
    return result
  }
  /** @param authority - same local registration owner. Synchronously retire all tickets/offers after a provider record update; fresh admission must reread and verify public storage. */
  invalidate(authority: object): void {
    if (authority !== this.authority) throw new Error('device binding local decision denied')
    const results = [...this.tickets.values()].map(connection => { try { this.retire(connection); return true } catch (error) { void error; return false } })
    this.challenges.clear(); this.pending = undefined
    if (results.includes(false)) { this.blocked = true; throw new Error('device binding invalidation cleanup failed') }
  }
  /** @param authority - explicit desktop-local revocation decision. @returns after immediate ticket denial and atomic signed tombstone; any uncertain persistence remains blocked. */
  revoke(authority: object): Promise<void> {
    this.local(authority); this.revocationPending = true
    const cleanup = [...this.tickets.values()].map(connection => { try { this.retire(connection); return true } catch (error) { void error; return false } })
    this.challenges.clear(); this.pending = undefined
    if (cleanup.includes(false)) return Promise.reject(new Error('device binding cleanup failed'))
    return this.serialized(async () => {
      this.local(authority); const { raw, value } = await this.registration(); if (value.revoked) return
      const { signature: _signature, ...old } = value, unsigned = { ...old, epoch: value.epoch + 1, revoked: true }, next = deviceBindingSchema.parse({ ...unsigned, signature: await this.sign(deviceBindingBytes(unsigned)) })
      try { await this.storage.compareAndSet(raw, JSON.stringify(next)) } catch (error) { void error; this.blocked = true; throw new Error('device binding revocation outcome unknown') }
    })
  }
  /** Terminally closes offers, tickets and subscriptions; persistent binding remains for a later fresh channel proof. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.lifetime.abort(); this.challenges.clear(); const failures = [...this.tickets.values()].map(connection => { try { this.retire(connection); return false } catch (error) { void error; return true } }); this.pending = undefined; await this.tail; if (failures.includes(true)) throw new Error('device binding close failed') }
}

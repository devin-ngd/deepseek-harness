/** Device-bound native navigation state; message/rich rendering remains an independently supplied Session owner. */
import { z } from 'zod'
import type { SessionCreationOptions } from './session-creation.ts'
import type { WorkspaceRequest } from './workspace-protocol.ts'
import { DeviceConnectionFailure, deviceConnectionFailure, type DeviceConnectionDiagnostic, type DeviceConnectionStage } from './device-connection-diagnostic.ts'
import type { DeviceTransportBinding } from '../integration/device-auth.ts'
import type { DeviceBindingClient } from './device-binding-client.ts'
import type { DeviceBinding, DeviceConnectionTicket, DeviceRouteContext } from './device-binding-protocol.ts'
import { deviceSessionRowSchema, deviceProjectRowSchema, deviceSessionActionSchema, type DeviceSessionRow, type DeviceProjectRow, type DeviceSessionDirectory, type DeviceSessionAction } from './device-session-directory.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'

/** An exact desktop/profile/Session route; desktop foreground selection never supplies any field. */
export interface DeviceSessionRoute { readonly desktopId: string; readonly profileId: 'desktop'; readonly sessionId: string }
/** Existing native message/rich owner for one Session. Closing must retire subscriptions, pending callbacks and rich mounts. */
export interface DeviceSessionSelection {
  richRequest(raw: string): Promise<string>
  close(): Promise<void>
}
/** Fixed encrypted-channel operations; neither a URL nor an arbitrary Host method is accepted. */
export interface DeviceProductSessionConnection {
  /** Optional native protocol owner supplies its first failure after channel cleanup; absent adapters use the fixed channel-closed fallback. */
  failure?(fallback: DeviceConnectionFailure): DeviceConnectionFailure
  readonly binding: DeviceTransportBinding
  readonly route?: DeviceRouteContext
  catalog(ticket: DeviceConnectionTicket): Promise<DeviceSessionDirectory>
  creationOptions?(ticket: DeviceConnectionTicket): Promise<SessionCreationOptions>
  /** Independently granted standard workspace; old device registrations alone cannot authorize it. */
  workspace?(request: WorkspaceRequest, ticket: DeviceConnectionTicket, signal?: AbortSignal): Promise<unknown>
  /** Optional list management; absent adapters, and desktops whose directory has no projects, reject management. @returns affected Session id. */
  manage?(action: DeviceSessionAction, ticket: DeviceConnectionTicket): Promise<string>
  select(route: DeviceSessionRoute, ticket: DeviceConnectionTicket, publish: (value: string) => void, lifetime: AbortSignal, row: DeviceSessionRow): Promise<DeviceSessionSelection>
  close(): Promise<void>
}
/** A caller-owned proof is used by isolated/native adapters; native-proof connections have already verified the same signed ticket in their crypto owner. */
export type DeviceProductConnection = DeviceProductSessionConnection & ({ readonly authentication: 'caller'; challenge(): Promise<string>; authenticate(proof: { readonly challengeId: string; readonly signature: string }): Promise<unknown> } | { readonly authentication: 'native'; readyTicket(): Promise<unknown> })
/** The native app alone opens the existing authenticated encrypted transport. */
export interface DeviceProductPorts {
  /** @param registration - verified original public binding. @param lifetime - current native attempt; cancellation retires acquisition and handshakes. @returns after acquisition; rejection follows cleanup and retains cleanupFailed on release failure. */
  connect(registration: DeviceBinding, lifetime: AbortSignal): Promise<DeviceProductConnection>
}
interface DeviceConnectionAttempt { readonly lifetime: AbortController; readonly settled: Promise<void>; close(): Promise<void>; cleanupFailed: boolean }
/** Safe UI state; signing keys, tickets and private channels are never published. `manageable` reports whether the connected desktop accepts list management. */
export interface DeviceMobileView { readonly state: 'disconnected' | 'connecting' | 'connected' | 'blocked' | 'closed'; readonly sessions: readonly DeviceSessionRow[]; readonly projects: readonly DeviceProjectRow[]; readonly manageable: boolean; readonly selected: DeviceSessionRoute | null; readonly content: string; readonly error: string; readonly diagnostic?: DeviceConnectionDiagnostic | undefined }
/** One native view owns its selection and callbacks. Persistent identity and registration belong to the separate proof client. */
export class DeviceBoundMobileProduct {
  private connection: DeviceProductConnection | undefined
  private ticket: DeviceConnectionTicket | undefined
  private selection: DeviceSessionSelection | undefined
  private selectionLifetime: AbortController | undefined
  private stopTicket = () => {}
  private stopTransport = () => {}
  private generation = 0
  private selecting = 0
  private tail: Promise<void> = Promise.resolve()
  private closed = false
  private failed = false
  private disconnecting: Promise<void> | undefined
  private connecting: DeviceConnectionAttempt | undefined
  private state: DeviceMobileView = { state: 'disconnected', sessions: [], projects: [], manageable: false, selected: null, content: '', error: '' }
  /** @param authority - native UI capability, never exported to a rich guest. @param proof - original HUKS proof client. @param ports - existing native encrypted transport adapter. @param clock - native expiry clock. @param scheduler - explicit native cleanup timer owner. @param publish - safe view callback. */
  constructor(private readonly authority: object, private readonly proof: DeviceBindingClient, private readonly ports: DeviceProductPorts, private readonly clock: () => number, private readonly scheduler: CleanupScheduler, private readonly publish: (value: DeviceMobileView) => void) {}
  private local(authority: object): void { if (authority !== this.authority || this.closed || this.failed) throw new Error('device mobile operation denied') }
  private emit(): void { try { this.publish(structuredClone(this.state)) } catch (error) { void error; this.failed = true; throw new Error('device mobile view failed') } }
  private current(connection: DeviceProductConnection, ticket: DeviceConnectionTicket): void { this.local(this.authority); connection.binding.signal.throwIfAborted(); if (this.connection !== connection || this.ticket !== ticket || ticket.expiresAt <= this.clock()) throw new Error('device mobile connection retired') }
  /** @returns a detached native view without ticket material. */
  get view(): DeviceMobileView { return structuredClone(this.state) }
  /** @param authority - native connect intent. @returns after a fresh channel proof and current catalogue; existing registration needs no pairing prompt. A local stop during identity loading prevents this attempt from opening a channel. */
  async connect(authority: object): Promise<void> {
    this.local(authority); await this.disconnecting; this.local(authority); if (this.connection !== undefined || this.state.state === 'connecting') throw new Error('device mobile connection already exists')
    const generation = ++this.generation; this.state = { ...this.state, state: 'connecting', error: '', diagnostic: undefined }; this.emit()
    let acquired: DeviceProductConnection | undefined, attempt: DeviceConnectionAttempt | undefined, stage: DeviceConnectionStage = 'identity-read', closing: Promise<void> | undefined
    let finish = () => {}
    const close = (): Promise<void> => { const value = acquired; return value === undefined ? Promise.resolve() : closing ??= (async () => { await value.close() })() }
    try {
      const registration = await this.proof.load(authority); this.local(authority)
      if (generation !== this.generation) throw new Error('device mobile connect retired')
      attempt = { lifetime: new AbortController(), settled: new Promise<void>(resolve => { finish = resolve }), close, cleanupFailed: false }; this.connecting = attempt
      stage = 'native-channel'; acquired = await this.ports.connect(registration, attempt.lifetime.signal); this.local(authority); if (generation !== this.generation) throw new Error('device mobile connect retired')
      stage = 'ticket'
      const candidate = acquired.authentication === 'native' ? await acquired.readyTicket() : await acquired.authenticate(await this.proof.connectionProof(authority, acquired.binding, await acquired.challenge(), acquired.route)), ticket = await this.proof.ticket(authority, acquired.binding, candidate, acquired.route)
      this.local(authority); if (generation !== this.generation) throw new Error('device mobile connect retired')
      this.connection = acquired; this.ticket = ticket
      const retire = () => { void this.disconnect(authority, new DeviceConnectionFailure('active-channel', 'closed')).catch(error => { void error; this.failed = true; this.state = { ...this.state, state: 'blocked', error: 'connection-cleanup-failed' }; this.emit() }) }
      acquired.binding.signal.addEventListener('abort', retire, { once: true }); const transport = acquired
      this.stopTransport = () => transport.binding.signal.removeEventListener('abort', retire)
      this.stopTicket = this.scheduler.after(ticket.expiresAt - this.clock(), () => { void this.disconnect(authority, new DeviceConnectionFailure('connection-expiry', 'timeout')).catch(error => { void error; this.failed = true }) })
      this.current(acquired, ticket); this.state = { ...this.state, state: 'connected' }; stage = 'first-catalog'; await this.refresh(authority)
    } catch (error) {
      const failure = deviceConnectionFailure(error, stage)
      if (generation === this.generation) {
        this.connection = undefined; this.ticket = undefined
        for (const stop of [this.stopTicket, this.stopTransport]) { try { stop() } catch (cleanup) { void cleanup; failure.cleanupFailed() } }
      }
      try { await close() } catch (cleanup) { void cleanup; failure.cleanupFailed() }
      if (failure.diagnostic.cleanupFailed) { this.failed = true; if (attempt !== undefined) attempt.cleanupFailed = true }
      if (generation !== this.generation) throw failure
      this.state = { ...this.state, state: 'blocked', error: failure.diagnostic.cleanupFailed ? 'connection-cleanup-failed' : 'connection-unavailable', diagnostic: failure.diagnostic }
      try { this.emit() } catch (cleanup) { void cleanup; failure.cleanupFailed() }
      throw failure
    } finally { if (this.connecting === attempt) this.connecting = undefined; finish() }
  }
  /** @param authority - native catalogue refresh intent. @returns current visible rows, including new desktop Sessions; does not change the selected route. */
  async refresh(authority: object): Promise<void> {
    this.local(authority); const connection = this.connection, ticket = this.ticket
    if (connection === undefined || ticket === undefined) throw new Error('device mobile connection required')
    this.current(connection, ticket)
    const directory = await connection.catalog(ticket), rows = z.array(deviceSessionRowSchema).parse(directory.sessions), projects = directory.projects === null ? null : z.array(deviceProjectRowSchema).parse(directory.projects)
    this.current(connection, ticket); if (new Set(rows.map(row => row.sessionId)).size !== rows.length) throw new Error('device mobile duplicate catalogue row')
    this.state = { ...this.state, sessions: rows, projects: projects ?? [], manageable: projects !== null && connection.manage !== undefined }; this.emit()
  }
  /** @param authority - native new-task intent. @returns fresh choices from this connection without changing selection or starting a model. */
  async creationOptions(authority: object): Promise<SessionCreationOptions> {
    this.local(authority)
    const connection = this.connection, ticket = this.ticket
    if (connection === undefined || ticket === undefined || connection.creationOptions === undefined) throw new Error('device creation choices unavailable')
    this.current(connection, ticket)
    const choices = await connection.creationOptions(ticket)
    this.current(connection, ticket)
    return choices
  }
  /** @param authority - trusted native workspace owner. @param request - standard workspace message. @param generation - captured native connection generation. @param signal - this request's wait. @returns acknowledged result only while the original device generation remains current. */
  async workspace(authority: object, request: WorkspaceRequest, generation: number, signal?: AbortSignal): Promise<unknown> {
    this.local(authority)
    const connection = this.connection, ticket = this.ticket
    if (connection === undefined || ticket === undefined || connection.workspace === undefined || generation !== this.generation) throw new Error('device workspace unavailable')
    this.current(connection, ticket)
    const result = await connection.workspace(request, ticket, signal)
    this.current(connection, ticket)
    return result
  }
  /** @param authority - native workspace owner. @returns the current local connection generation, never a remote authorization token. */
  workspaceGeneration(authority: object): number {
    this.local(authority)
    if (this.connection === undefined || this.ticket === undefined || this.connection.workspace === undefined) throw new Error('device workspace unavailable')
    this.current(this.connection, this.ticket)
    return this.generation
  }
  /** @param authority - native list-management intent. @param action - create, archive, unarchive, pin or unpin. @returns affected Session id after desktop acknowledgement and a catalogue refresh; the current selection is unchanged and nothing is retried. */
  async manage(authority: object, action: DeviceSessionAction): Promise<string> {
    this.local(authority); const connection = this.connection, ticket = this.ticket
    if (connection === undefined || ticket === undefined) throw new Error('device mobile connection required')
    this.current(connection, ticket); if (connection.manage === undefined || !this.state.manageable) throw new Error('device mobile management unavailable')
    const sessionId = await connection.manage(deviceSessionActionSchema.parse(action), ticket)
    this.current(connection, ticket); await this.refresh(authority); return sessionId
  }
  /** @param authority - native row selection. @param sessionId - current admitted row. @returns only after previous follow/rich owner retires; late old callbacks cannot update this view. */
  select(authority: object, sessionId: string): Promise<void> {
    this.local(authority); const selecting = ++this.selecting, generation = this.generation
    const result = this.tail.then(async () => {
      this.local(authority); const connection = this.connection, ticket = this.ticket
      if (connection === undefined || ticket === undefined) throw new Error('device mobile connection required')
      this.current(connection, ticket)
      let row = this.state.sessions.find(candidate => candidate.sessionId === sessionId)
      if (row === undefined) {
        await this.refresh(authority)
        row = this.state.sessions.find(candidate => candidate.sessionId === sessionId)
      }
      if (row === undefined) throw new Error('device mobile Session not visible')
      await this.retireSelection(); this.current(connection, ticket)
      if (selecting !== this.selecting || generation !== this.generation) throw new Error('device mobile selection retired')
      const route: DeviceSessionRoute = { desktopId: ticket.desktopId, profileId: 'desktop', sessionId }, controller = new AbortController()
      this.selectionLifetime = controller; this.state = { ...this.state, selected: route, content: '' }; this.emit()
      let value: DeviceSessionSelection
      try {
        value = await connection.select(route, ticket, content => {
          if (this.closed || controller.signal.aborted || selecting !== this.selecting || generation !== this.generation || this.state.selected?.sessionId !== route.sessionId || this.connection !== connection || this.ticket !== ticket || ticket.expiresAt <= this.clock()) return
          this.state = { ...this.state, content }; this.emit()
        }, controller.signal, row)
      } catch (error) {
        if (this.selectionLifetime === controller) await this.retireSelection()
        throw error
      }
      if (this.closed || controller.signal.aborted || selecting !== this.selecting || generation !== this.generation || this.connection !== connection || this.ticket !== ticket) { await value.close(); throw new Error('device mobile selection retired') }
      this.selection = value
    })
    this.tail = result.then(() => {}, () => {}); return result
  }
  /** @param raw - existing rich bridge request from this view's renderer. @returns only its selected Session's result; switching retires late results and never forwards into the new Session. */
  async richRequest(raw: string): Promise<string> {
    this.local(this.authority); const selection = this.selection, selecting = this.selecting, generation = this.generation, connection = this.connection, ticket = this.ticket
    if (selection === undefined || connection === undefined || ticket === undefined) throw new Error('device mobile selection required')
    this.current(connection, ticket); const value = await selection.richRequest(raw)
    this.current(connection, ticket); if (this.selection !== selection || selecting !== this.selecting || generation !== this.generation) throw new Error('device mobile rich owner retired')
    return value
  }
  private async retireSelection(): Promise<void> {
    const selection = this.selection; this.selection = undefined; this.selectionLifetime?.abort(); this.selectionLifetime = undefined
    this.state = { ...this.state, selected: null, content: '' }; this.emit()
    try { await selection?.close() } catch (error) { void error; this.failed = true; this.state = { ...this.state, state: 'blocked', error: 'selection-cleanup-failed' }; this.emit(); throw new Error('device mobile selection cleanup failed') }
  }
  /** @param authority - native disconnect/expiry owner. @param cause - unexpected closure or expiry; omission means an explicit local stop. @returns after pending native acquisition, Session/rich and channel cleanup; established Session consumers retire before their channel. Pending selection retains its bounded RPC wait. Cleanup failure blocks reconnect. Persistent binding remains, and no ticket is reused. */
  disconnect(authority: object, cause?: DeviceConnectionFailure): Promise<void> {
    if (authority !== this.authority) return Promise.reject(new Error('device mobile disconnect denied'))
    if (this.disconnecting !== undefined) return this.disconnecting
    this.generation++; this.selecting++; const generation = this.generation, connection = this.connection; this.connection = undefined; this.ticket = undefined; this.stopTicket(); this.stopTransport(); this.stopTicket = () => {}; this.stopTransport = () => {}
    const attempt = this.connecting; attempt?.lifetime.abort(); this.selectionLifetime?.abort()
    const operation = (async () => {
      const selectionClosed = this.tail.then(() => this.retireSelection()), release = () => connection?.close()
      // Session unsubscribe still uses the channel; a failed consumer also releases its provider.
      const channelClosed = attempt === undefined ? selectionClosed.then(release, release) : attempt.close()
      const results = await Promise.allSettled([selectionClosed, channelClosed, attempt?.settled])
      const failure = cause === undefined ? undefined : connection?.failure?.(cause) ?? cause, cleanupFailed = attempt?.cleanupFailed === true || results.some(result => result.status === 'rejected')
      if (cleanupFailed) failure?.cleanupFailed()
      if (generation === this.generation) { this.state = { state: this.closed ? 'closed' : cleanupFailed ? 'blocked' : 'disconnected', sessions: [], projects: [], manageable: false, selected: null, content: '', error: cleanupFailed ? 'connection-cleanup-failed' : failure === undefined ? '' : 'connection-unavailable', diagnostic: failure?.diagnostic ?? { stage: 'local-stop', category: 'closed', cleanupFailed } }; this.emit() }
      if (cleanupFailed) { this.failed = true; throw new Error('device mobile disconnect cleanup failed') }
    })()
    this.disconnecting = operation
    void operation.then(() => { if (this.disconnecting === operation) this.disconnecting = undefined }, () => { if (this.disconnecting === operation) this.disconnecting = undefined })
    return operation
  }
  /** Terminally close this view; its original identity and binding are retained for a future view. */
  async close(): Promise<void> { if (this.closed) return; this.closed = true; await this.disconnect(this.authority) }
}

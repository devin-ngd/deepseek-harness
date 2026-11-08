/** Session-owned transaction state for the fixed Harmony controls; no IO on construction. */
import type { CommandResult } from '@deepseek-ai/dsh-commands/types'
import { deviceRouteSchema, type DeviceRouteOffer } from '../../src/device-route-protocol.ts'
import { publicDeviceFeedback, publicWorkspaceFeedback } from './feedback.ts'

export const controlCommands = ['status', 'route-status', 'route-start', 'route-confirm', 'connect', 'reconnect', 'stop', 'workspace-status', 'workspace-allow', 'workspace-stop'] as const
export type ControlCommand = typeof controlCommands[number]
export type ControlFailure = 'rejected' | 'unknown' | 'invalidInput' | 'unavailable' | 'stale'
type MutationScope = 'connection' | 'workspace'
type WorkspaceState = 'workspace-enabled' | 'workspace-disabled' | 'workspace-expired' | null
export interface ControlSnapshot {
  readonly phase: 'idle' | 'pending' | 'settled' | 'disposed'
  readonly pending: ControlCommand | null
  readonly notice: ControlFailure | null
  readonly firstFailure: ControlFailure | null
  readonly uncertain: boolean
  readonly publicText: string
  readonly publicState: string | null
  readonly workspaceState: WorkspaceState
  readonly workspaceExpiresAt: number | null
  readonly allowed: readonly ControlCommand[]
}
export interface ControlPort {
  readonly sessionId: string
  readonly isCurrent: () => boolean
  readonly execute: (line: string) => Promise<CommandResult | undefined>
}

/** Owns one retained Session's requests; remounts share its lock and disposed scopes ignore late replies. */
export class ControlModel {
  private closed = false
  private busy = false
  private uncertainty: MutationScope | undefined
  private savedConnectionReady = false
  private firstFailure: ControlFailure | null = null
  private offer: DeviceRouteOffer | undefined
  private workspaceTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<() => void>()
  private value: ControlSnapshot = { phase: 'idle', pending: null, notice: null, firstFailure: null, uncertain: false, publicText: '', publicState: null, workspaceState: null, workspaceExpiresAt: null, allowed: ['status', 'route-status', 'stop', 'workspace-status', 'workspace-stop'] }
  readonly source = {
    getSnapshot: (): ControlSnapshot => this.value,
    subscribe: (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } },
  }
  /** @param port - adapter to the original authenticated Session command API. */
  constructor(private readonly port: ControlPort) {}

  private allowed(): readonly ControlCommand[] {
    if (this.closed || this.busy) return []
    const result: ControlCommand[] = ['status', 'route-status', 'stop', 'workspace-status', 'workspace-stop']
    if (this.uncertainty !== undefined) return result
    if (!this.savedConnectionReady && ['bound', 'route-required', 'stopped'].includes(this.value.publicState ?? '')) result.push('route-start')
    if (this.offer !== undefined && this.value.publicState === 'route-offered') result.push('route-confirm')
    if (this.savedConnectionReady || ['route-ready', 'transport-closed', 'transport-failed'].includes(this.value.publicState ?? '')) result.push('connect')
    if (this.value.publicState === 'transport-started') result.push('reconnect')
    if (this.value.workspaceState === 'workspace-disabled') result.push('workspace-allow')
    return result
  }
  private publish(patch: Partial<ControlSnapshot>): void {
    this.value = { ...this.value, ...patch, uncertain: this.uncertainty !== undefined, firstFailure: this.firstFailure, allowed: this.allowed() }
    // Eligibility reads the newly settled public state.
    this.value = { ...this.value, allowed: this.allowed() }
    for (const listener of this.listeners) listener()
  }
  private fail(code: ControlFailure, scope?: MutationScope): false {
    this.firstFailure ??= code
    if (scope === 'connection' || this.uncertainty === undefined) this.uncertainty = scope
    this.busy = false
    this.publish({ phase: 'settled', pending: null, notice: code })
    return false
  }

  private workspaceReceipt(state: WorkspaceState, expiresAt: number | null): Pick<ControlSnapshot, 'workspaceState' | 'workspaceExpiresAt'> {
    if (this.workspaceTimer !== undefined) clearTimeout(this.workspaceTimer)
    this.workspaceTimer = undefined
    if (state !== 'workspace-enabled' || expiresAt === null) return { workspaceState: state, workspaceExpiresAt: null }
    const delay = expiresAt - Date.now()
    if (delay <= 0) return { workspaceState: 'workspace-expired', workspaceExpiresAt: expiresAt }
    const refresh = () => {
      const remaining = expiresAt - Date.now()
      if (remaining > 0) { this.workspaceTimer = setTimeout(refresh, Math.min(remaining, 2147483647)); return }
      this.workspaceTimer = undefined
      this.publish({ workspaceState: 'workspace-expired' })
    }
    this.workspaceTimer = setTimeout(refresh, Math.min(delay, 2147483647))
    return { workspaceState: state, workspaceExpiresAt: expiresAt }
  }

  /** @param command - one fixed control. @param input - public phone reply for route-confirm only. @returns whether a reviewed success was received; never retries. */
  async run(command: ControlCommand, input = ''): Promise<boolean> {
    if (this.closed || this.busy) return false
    if (!this.port.isCurrent()) { this.dispose(); return false }
    if (!this.allowed().includes(command)) return false
    let line = '/harmony-device ' + command
    if (command === 'route-confirm') {
      if (new TextEncoder().encode(input).length > 16384) return this.fail('invalidInput')
      let candidate: unknown
      try { candidate = JSON.parse(input) } catch (error) { if (!(error instanceof SyntaxError)) throw error; return this.fail('invalidInput') }
      const route = deviceRouteSchema.safeParse(candidate)
      if (!route.success || this.offer === undefined || JSON.stringify(route.data.offer) !== JSON.stringify(this.offer)) return this.fail('invalidInput')
      line += ' ' + JSON.stringify(route.data)
    } else if (input !== '') return this.fail('invalidInput')
    const mutationScope: MutationScope | undefined = command === 'status' || command === 'route-status' || command === 'workspace-status'
      ? undefined : command.startsWith('workspace-') ? 'workspace' : 'connection'
    this.busy = true
    this.publish({ phase: 'pending', pending: command, notice: null })
    let reply: CommandResult | undefined
    try { reply = await this.port.execute(line) } catch (error) {
      // A lost response cannot establish whether the Host already changed state.
      if (this.closed) return false
      if (!this.port.isCurrent()) { this.dispose(); return false }
      return this.fail('unknown', mutationScope)
    }
    if (this.closed || !this.port.isCurrent()) { this.dispose(); return false }
    if (reply === undefined || reply.kind !== 'success') return this.fail('rejected', mutationScope)
    if (command.startsWith('workspace-')) {
      const result = publicWorkspaceFeedback(reply.text, this.port.sessionId)
      if (result === undefined) return this.fail('unavailable', mutationScope)
      if (command === 'workspace-stop' && this.uncertainty === 'workspace' && result.state === 'workspace-disabled' &&
        !result.publicResult.enabled && result.publicResult.expiresAt === null) this.uncertainty = undefined
      this.busy = false
      const workspace = this.workspaceReceipt(result.state, result.publicResult.enabled ? result.publicResult.expiresAt : null)
      this.publish({ phase: 'settled', pending: null, notice: null, publicText: JSON.stringify(result, null, 2), ...workspace })
      return true
    }
    const result = publicDeviceFeedback(reply.text, this.port.sessionId)
    if (result === undefined) return this.fail('unavailable', mutationScope)
    const body = result.publicResult
    if (body?.schema === 'harmony-device-route-offer/1') this.offer = body
    if (body?.schema === 'harmony-device-route/1') this.offer = body.offer
    if (result.state === 'stopped' || result.state === 'route-required') this.offer = undefined
    if (command === 'status') this.savedConnectionReady = result.state === 'bound' && result.savedConnectionReady === true
    else if (mutationScope !== undefined) this.savedConnectionReady = false
    const stopped = command === 'stop' && result.state === 'stopped'
    if (stopped) this.uncertainty = undefined
    this.busy = false
    this.publish({ phase: 'settled', pending: null, notice: null, publicText: JSON.stringify(result, null, 2), publicState: result.state,
      ...(stopped ? this.workspaceReceipt(null, null) : {}) })
    return true
  }

  /** Release local observers only; disposal does not claim to cancel or undo a Host request. */
  dispose(): void {
    if (this.closed) return
    this.closed = true
    if (this.workspaceTimer !== undefined) clearTimeout(this.workspaceTimer)
    this.workspaceTimer = undefined
    this.value = { ...this.value, phase: 'disposed', pending: null, allowed: [], publicText: '', workspaceState: null, workspaceExpiresAt: null }
    for (const listener of this.listeners) listener()
    this.listeners.clear()
  }
}

/** No sockets: a bounded volatile fixture of desktop-outbound relay routing. Plain synthetic content is relay-readable. */
import type { SessionId, DesktopId } from './protocol.ts'
import type { RestrictedDesktopAdapter, MobileResult } from './desktop-adapter.ts'
import type { SessionFollowFrame } from './upstream.ts'
import { LinkError } from './link-protocol.ts'
import type { DeviceId, MobileCommand, MockDeviceRegistry, OutboundEvent } from './link-protocol.ts'

/** Explicit memory and lifetime bounds; queueing executable offline intents is deliberately unavailable. */
export interface RelayConfig {
  readonly clock: () => number
  readonly eventTtlMs: number
  readonly maxEventsPerSession: number
  readonly maxEventBytes: number
  readonly maxSessions: number
}
/** Identity of a mock connection, supplied by trusted fixture code rather than guest JSON. */
export interface MockPeer { readonly deviceId: DeviceId; readonly desktopId: DesktopId; readonly epoch: number }
interface LinkState { generation: number; foreground: boolean }
interface Buffer { next: number; droppedThrough: number; events: OutboundEvent[] }

/** Inactive relay algorithm. Desktop and phone explicitly attach outbound mock links; no listener or access credential exists. */
export class MockOutboundRelay {
  private desktop: RestrictedDesktopAdapter | null = null
  private readonly phones = new Map<DeviceId, LinkState>()
  private readonly buffers = new Map<SessionId, Buffer>()
  private readonly stopRevoke: () => void
  private closed = false

  /** @param mode - must be mock. @param devices - volatile grant owner. @param config - explicit bounded retention. */
  constructor(mode: string, private readonly devices: MockDeviceRegistry, readonly config: RelayConfig) {
    if (mode !== 'mock') throw new LinkError('mock-only')
    this.stopRevoke = devices.onRevoke(async deviceId => {
      const state = this.phones.get(deviceId)
      if (state !== undefined) { state.foreground = false; state.generation++ }
    })
  }
  /** Attach only a caller-created synthetic adapter. @param adapter - mock desktop outbound endpoint. */
  attachDesktop(adapter: RestrictedDesktopAdapter): void {
    if (this.closed) throw new LinkError('closed')
    if (this.desktop !== null && this.desktop !== adapter) throw new LinkError('scope-denied')
    this.desktop = adapter
  }
  /** An unavailable desktop does not enqueue a future dispatch. */
  detachDesktop(): void { this.desktop = null }
  /** @param peer - fixture identity. @param foreground - false models suspension/disconnection without cancelling desktop work. */
  setForeground(peer: MockPeer, foreground: boolean): void {
    if (this.closed) throw new LinkError('closed')
    const state = this.phones.get(peer.deviceId)
    if (state === undefined) this.phones.set(peer.deviceId, { generation: 1, foreground })
    else { state.generation++; state.foreground = foreground }
  }
  /** @param peer - connection identity. @param command - complete untrusted envelope. @returns detached response or explicit unknown delivery; never retries. */
  async request(peer: MockPeer, command: MobileCommand): Promise<{ readonly value: MobileResult; readonly beforeRelayCursor: number }> {
    if (this.closed) throw new LinkError('closed')
    if (command.deviceId !== peer.deviceId || command.desktopId !== peer.desktopId || command.grantEpoch !== peer.epoch) throw new LinkError('scope-denied')
    this.devices.authorize(command)
    const state = this.phones.get(peer.deviceId)
    if (state === undefined || !state.foreground) throw new LinkError('phone-suspended')
    const desktop = this.desktop
    if (desktop === null) throw new LinkError('desktop-offline')
    if (desktop.desktopId !== peer.desktopId) throw new LinkError('scope-denied')
    const generation = state.generation
    // Capturing before the snapshot prevents events arriving during its read from being skipped.
    const sessionId = typeof command.payload.sessionId === 'string' ? command.payload.sessionId : null
    const beforeRelayCursor = sessionId === null ? -1 : [...this.buffers].find(([key]) => key === sessionId)?.[1].next ?? 0
    const value = await desktop.handle(JSON.stringify(command))
    this.devices.authorize(command)
    if (this.closed || this.desktop !== desktop || !state.foreground || state.generation !== generation) throw new LinkError('transport-lost')
    return { value, beforeRelayCursor: beforeRelayCursor === -1 ? -1 : beforeRelayCursor - 1 }
  }
  /** Append canonical synthetic host output. @param sessionId - desktop-selected owner. @param frame - typed same-process canonical frame. */
  publish(sessionId: SessionId, frame: SessionFollowFrame): void {
    if (this.closed) throw new LinkError('closed')
    if (new TextEncoder().encode(JSON.stringify(frame)).byteLength > this.config.maxEventBytes) throw new LinkError('queue-full')
    let buffer = this.buffers.get(sessionId)
    if (buffer === undefined) {
      if (this.buffers.size >= this.config.maxSessions) throw new LinkError('queue-full')
      buffer = { next: 0, droppedThrough: -1, events: [] }; this.buffers.set(sessionId, buffer)
    }
    this.prune(buffer)
    buffer.events.push({ sessionId, relaySeq: buffer.next++, frame: structuredClone(frame), expiresAt: this.config.clock() + this.config.eventTtlMs })
    while (buffer.events.length > this.config.maxEventsPerSession) buffer.droppedThrough = buffer.events.shift()!.relaySeq
  }
  /** @param peer - connected mock identity. @param authority - fresh session.sync command used only for scoped read authority. @param sessionId - selected owner. @param after - relay cursor. @returns retained suffix, or requires a fresh snapshot. */
  replay(peer: MockPeer, authority: MobileCommand, sessionId: SessionId, after: number): readonly OutboundEvent[] {
    if (this.closed) throw new LinkError('closed')
    if (peer.deviceId !== authority.deviceId || peer.desktopId !== authority.desktopId || peer.epoch !== authority.grantEpoch || authority.operation !== 'session.sync') throw new LinkError('scope-denied')
    this.devices.authorize(authority, sessionId)
    if (authority.expiresAt <= this.config.clock()) throw new LinkError('request-expired')
    if (!this.phones.get(peer.deviceId)?.foreground) throw new LinkError('phone-suspended')
    if (this.desktop === null) throw new LinkError('desktop-offline')
    const buffer = this.buffers.get(sessionId)
    if (!Number.isSafeInteger(after) || after < -1 || buffer !== undefined && after >= buffer.next) throw new LinkError('invalid-packet')
    if (buffer === undefined) { if (after !== -1) throw new LinkError('resync-needed'); return [] }
    this.prune(buffer)
    if (after < buffer.droppedThrough) throw new LinkError('resync-needed')
    return structuredClone(buffer.events.filter(event => event.relaySeq > after))
  }
  private prune(buffer: Buffer): void {
    while (buffer.events[0] !== undefined && buffer.events[0].expiresAt <= this.config.clock()) buffer.droppedThrough = buffer.events.shift()!.relaySeq
  }
  /** Release volatile endpoints and synthetic buffers; no task cancellation is implied. */
  close(): void { this.closed = true; this.stopRevoke(); this.desktop = null; this.phones.clear(); this.buffers.clear() }
}

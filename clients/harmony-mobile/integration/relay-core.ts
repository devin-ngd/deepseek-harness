/** Bounded, in-memory relay routing. Only trusted local provisioning creates rooms; relay payloads never authorize desktop execution. */
import { createHash, timingSafeEqual } from 'node:crypto'
import { id } from '../src/protocol.ts'
import type { RelayRoomId, E2ERole } from '../src/e2e-channel.ts'
/** Content-free relay failure; token, payload and routing values never enter its message. */
export class RelayError extends Error {
  /** @param code - stable failure category. */
  constructor(readonly code: 'invalid' | 'denied' | 'capacity' | 'closed') { super(code); this.name = 'RelayError' }
}
/** Explicit deployment budgets. Rooms and disconnected sockets are never persisted. */
export interface RelayLimits {
  readonly maxRooms: number; readonly maxRoomTtlMs: number; readonly pairTimeoutMs: number
  readonly maxFrameBytes: number; readonly maxBufferedBytes: number; readonly maxFrames: number; readonly idleTimeoutMs: number
}
/** Host-only room proposal. Digests refer to separate high-entropy, one-use join capabilities; no raw token is stored. */
export interface RelayRoomPlan { readonly room: RelayRoomId; readonly desktopDigest: string; readonly phoneDigest: string; readonly expiresAt: number }
/** Maintained WebSocket adapter or an in-memory substitute. Implementations contain event failures and report them through onEnd. */
export interface RelaySocket {
  readonly bufferedAmount: number
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void
  onEnd(callback: () => void): () => void
  ready(): void
  send(bytes: Uint8Array): void
  terminate(): void
}
interface Room { plan: RelayRoomPlan; readonly peers: Map<E2ERole, RelaySocket>; readonly claimed: Set<E2ERole>; readonly stops: (() => void)[]; readonly createdAt: number; lastAt: number; frames: number }
/** @param token - bounded untrusted bearer capability. @returns SHA-256 digest; generation/secure delivery belong to an explicitly approved local owner. */
export function relayTokenDigest(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new RelayError('denied')
  return createHash('sha256').update(token, 'ascii').digest('hex')
}
/** Relay state is independent of DSH accounts, Sessions, keys and execution grants. */
export class RelayRooms {
  private readonly rooms = new Map<RelayRoomId, Room>()
  private closed = false
  private failed = false
  /** @param authority - exact local capability, never HTTP JSON. @param limits - explicit validated resource limits. @param clock - injected clock. */
  constructor(private readonly authority: object, private readonly limits: RelayLimits, private readonly clock: () => number) {
    for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new RelayError('invalid')
    if (limits.maxBufferedBytes < limits.maxFrameBytes) throw new RelayError('invalid')
  }
  private available(): void { if (this.closed || this.failed) throw new RelayError('closed') }
  /** @param authority - local provisioning capability. @param plan - two unique public digests and an explicit expiry. @returns nothing; provisioning never issues a DSH grant. */
  provision(authority: object, plan: RelayRoomPlan): void {
    this.available(); if (authority !== this.authority) throw new RelayError('denied'); this.sweep()
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(plan.room) || !/^[a-f0-9]{64}$/.test(plan.desktopDigest) || !/^[a-f0-9]{64}$/.test(plan.phoneDigest)
      || plan.desktopDigest === plan.phoneDigest || !Number.isSafeInteger(plan.expiresAt) || plan.expiresAt <= this.clock() || plan.expiresAt - this.clock() > this.limits.maxRoomTtlMs) throw new RelayError('invalid')
    if (this.rooms.has(plan.room) || this.rooms.size >= this.limits.maxRooms) throw new RelayError('capacity')
    this.rooms.set(plan.room, { plan: { ...plan }, peers: new Map(), claimed: new Set(), stops: [], createdAt: this.clock(), lastAt: this.clock(), frames: 0 })
  }
  /** @param roomText - untrusted routing header. @param role - untrusted role header. @param token - one-use header capability. @returns single-use attachment; failed upgrade burns this room rather than restoring a token. */
  claim(roomText: string, role: string, token: string): { attach(socket: RelaySocket): void; abort(): void } {
    this.available(); this.sweep()
    const roomId = id<'harmony-relay-room'>(roomText), room = this.rooms.get(roomId)
    if (room === undefined || (role !== 'phone' && role !== 'desktop') || room.claimed.has(role)) throw new RelayError('denied')
    const expected = role === 'phone' ? room.plan.phoneDigest : room.plan.desktopDigest
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(relayTokenDigest(token), 'hex'))) throw new RelayError('denied')
    room.claimed.add(role)
    let consumed = false
    return { attach: socket => {
      if (consumed || this.closed || this.rooms.get(roomId) !== room) { socket.terminate(); throw new RelayError('denied') }
      consumed = true; this.sweep()
      if (this.rooms.get(roomId) !== room) { socket.terminate(); throw new RelayError('denied') }
      room.peers.set(role, socket)
      room.stops.push(socket.onEnd(() => { if (this.rooms.get(roomId) === room) this.drop(roomId) }), socket.onFrame((bytes, binary) => {
        if (this.closed || this.rooms.get(roomId) !== room) return
        this.sweep(); if (this.rooms.get(roomId) !== room) return
        const target = room.peers.get(role === 'phone' ? 'desktop' : 'phone')
        if (!binary || bytes.byteLength === 0 || bytes.byteLength > this.limits.maxFrameBytes || ++room.frames > this.limits.maxFrames
          || target === undefined || target.bufferedAmount + bytes.byteLength > this.limits.maxBufferedBytes) { this.drop(roomId); return }
        room.lastAt = this.clock()
        try { target.send(bytes) } catch (error) { void error; /* Socket implementations may fail synchronously; discard the complete room. */ this.drop(roomId) }
      }))
      if (room.peers.size === 2) {
        try { for (const peer of room.peers.values()) peer.ready() }
        catch (error) { void error; /* No endpoint proceeds after partial ready delivery. */ this.drop(roomId) }
      }
    }, abort: () => { consumed = true; if (this.rooms.get(roomId) === room) this.drop(roomId) } }
  }
  private drop(roomId: RelayRoomId): void {
    const room = this.rooms.get(roomId); if (room === undefined) return
    this.rooms.delete(roomId)
    for (const stop of [...room.stops, ...[...room.peers.values()].map(socket => () => socket.terminate())]) { try { stop() } catch (error) { void error; this.failed = true } }
    room.peers.clear(); room.claimed.clear(); if (this.failed) throw new RelayError('closed')
  }
  /** @param authority - local revocation capability. @param room - temporary routing identity. @returns nothing; both sockets stop synchronously. */
  revoke(authority: object, room: RelayRoomId): void { if (authority !== this.authority) throw new RelayError('denied'); this.drop(room) }
  /** @param room - local routing room. @returns whether it still exists after current expiry checks; no capability or Session metadata is exposed. */
  active(room: RelayRoomId): boolean { if (this.closed) return false; this.sweep(); return this.rooms.has(room) }
  /** @returns nothing; called by an explicitly mounted watchdog and every admission/forward operation. */
  sweep(): void {
    const now = this.clock()
    for (const [key, room] of this.rooms) if (room.plan.expiresAt <= now || (room.peers.size < 2 && room.createdAt + this.limits.pairTimeoutMs <= now) || room.lastAt + this.limits.idleTimeoutMs <= now) { try { this.drop(key) } catch (error) { void error; this.failed = true } }
    if (this.failed) throw new RelayError('closed')
  }
  /** @returns nothing; closes all rooms and clears their digests. */
  close(): void { this.closed = true; for (const key of this.rooms.keys()) { try { this.drop(key) } catch (error) { void error; this.failed = true } }; if (this.failed) throw new RelayError('closed') }
}

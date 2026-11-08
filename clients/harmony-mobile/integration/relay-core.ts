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
/** Socket adapter failures with a fixed vocabulary independent of exception text and close payloads. */
export type RelaySocketFailure = 'socket-error' | 'ws-message-limit' | 'ws-parts-limit' | 'control-frame-limit' | 'socket-send-failed'
/** Maintained WebSocket adapter or an in-memory substitute. Implementations contain event failures and report them through onEnd. */
export interface RelaySocket {
  readonly bufferedAmount: number
  /** Adapter failure observed before termination, if one is known. */
  readonly endFailure?: RelaySocketFailure | undefined
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void
  onEnd(callback: () => void): () => void
  ready(): void
  send(bytes: Uint8Array): void
  terminate(): void
}
/** Control socket whose loss revoked the room. */
export interface RelayControlEnd { readonly reason: 'control-ended'; readonly role: E2ERole; readonly socketFailure?: RelaySocketFailure | undefined }
type RoomEnd = RelayControlEnd
  | { readonly reason: 'data-ended'; readonly role: E2ERole; readonly socketFailure?: RelaySocketFailure | undefined }
  | { readonly reason: 'attach-aborted' | 'peer-missing'; readonly role: E2ERole }
  | { readonly reason: 'invalid-frame' | 'frame-size-limit' | 'frame-count-limit' | 'forward-failed'; readonly role: E2ERole; readonly frameBytes: number }
  | { readonly reason: 'forward-buffer-limit'; readonly role: E2ERole; readonly frameBytes: number; readonly bufferedBytes: number }
  | { readonly reason: 'ready-failed' | 'expired' | 'pair-timeout' | 'idle-timeout' | 'revoked' | 'shutdown' }
/** First terminal room cause and final frame count, without room identifiers or payloads. */
export type RelayRoomDiagnostic = RoomEnd & { readonly frames: number }
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
  /** @param authority - exact local capability, never HTTP JSON. @param limits - explicit validated resource limits. @param clock - injected clock. @param diagnostic - optional local closure report; omission emits nothing and sink failure leaves cleanup intact. */
  constructor(private readonly authority: object, private readonly limits: RelayLimits, private readonly clock: () => number, private readonly diagnostic?: (event: RelayRoomDiagnostic) => void) {
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
    const end = () => {
      if (this.rooms.get(roomId) !== room) return
      const peer = room.peers.get(role)
      this.drop(roomId, peer === undefined ? { reason: 'attach-aborted', role } : { reason: 'data-ended', role, socketFailure: peer.endFailure })
    }
    return { attach: socket => {
      if (consumed || this.closed || this.rooms.get(roomId) !== room) { socket.terminate(); throw new RelayError('denied') }
      consumed = true; this.sweep()
      if (this.rooms.get(roomId) !== room) { socket.terminate(); throw new RelayError('denied') }
      room.peers.set(role, socket)
      room.stops.push(socket.onEnd(end), socket.onFrame((bytes, binary) => {
        if (this.closed || this.rooms.get(roomId) !== room) return
        this.sweep(); if (this.rooms.get(roomId) !== room) return
        const frameBytes = bytes.byteLength
        if (!binary || frameBytes === 0) { this.drop(roomId, { reason: 'invalid-frame', role, frameBytes }); return }
        if (frameBytes > this.limits.maxFrameBytes) { this.drop(roomId, { reason: 'frame-size-limit', role, frameBytes }); return }
        if (++room.frames > this.limits.maxFrames) { this.drop(roomId, { reason: 'frame-count-limit', role, frameBytes }); return }
        const targetRole = role === 'phone' ? 'desktop' : 'phone', target = room.peers.get(targetRole)
        if (target === undefined) { this.drop(roomId, { reason: 'peer-missing', role: targetRole }); return }
        const bufferedBytes = target.bufferedAmount
        if (bufferedBytes + frameBytes > this.limits.maxBufferedBytes) { this.drop(roomId, { reason: 'forward-buffer-limit', role: targetRole, frameBytes, bufferedBytes }); return }
        room.lastAt = this.clock()
        try { target.send(bytes) } catch (error) { void error; this.drop(roomId, { reason: 'forward-failed', role: targetRole, frameBytes }) }
      }))
      if (room.peers.size === 2) {
        try { for (const peer of room.peers.values()) peer.ready() }
        catch (error) { void error; this.drop(roomId, { reason: 'ready-failed' }) }
      }
    }, abort: () => { consumed = true; end() } }
  }
  private drop(roomId: RelayRoomId, cause: RoomEnd): void {
    const room = this.rooms.get(roomId); if (room === undefined) return
    this.rooms.delete(roomId)
    for (const stop of [...room.stops, ...[...room.peers.values()].map(socket => () => socket.terminate())]) { try { stop() } catch (error) { void error; this.failed = true } }
    room.peers.clear(); room.claimed.clear()
    try { this.diagnostic?.({ ...cause, frames: room.frames }) } catch (error) { void error; /* The optional sink cannot interrupt room cleanup. */ }
    if (this.failed) throw new RelayError('closed')
  }
  /** @param authority - local revocation capability. @param room - temporary routing identity. @param controlEnd - observed control socket termination, if this revocation follows one. @returns nothing; both sockets stop synchronously. */
  revoke(authority: object, room: RelayRoomId, controlEnd?: RelayControlEnd): void { if (authority !== this.authority) throw new RelayError('denied'); this.drop(room, controlEnd ?? { reason: 'revoked' }) }
  /** @param room - local routing room. @returns whether it still exists after current expiry checks; no capability or Session metadata is exposed. */
  active(room: RelayRoomId): boolean { if (this.closed) return false; this.sweep(); return this.rooms.has(room) }
  /** @returns nothing; called by an explicitly mounted watchdog and every admission/forward operation. */
  sweep(): void {
    const now = this.clock()
    for (const [key, room] of this.rooms) {
      const reason = room.plan.expiresAt <= now ? 'expired' : room.peers.size < 2 && room.createdAt + this.limits.pairTimeoutMs <= now ? 'pair-timeout'
        : room.lastAt + this.limits.idleTimeoutMs <= now ? 'idle-timeout' : undefined
      if (reason !== undefined) { try { this.drop(key, { reason }) } catch (error) { void error; this.failed = true } }
    }
    if (this.failed) throw new RelayError('closed')
  }
  /** @returns nothing; closes all rooms and clears their digests. */
  close(): void { this.closed = true; for (const key of this.rooms.keys()) { try { this.drop(key, { reason: 'shutdown' }) } catch (error) { void error; this.failed = true } }; if (this.failed) throw new RelayError('closed') }
}

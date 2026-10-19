/** Local ephemeral room provisioning through the existing relay API. No public create-room endpoint, entropy source, persistence or DSH grant is added. */
import { relayTokenDigest, type RelayRoomPlan } from './relay-core.ts'
import type { RelayRoomId } from '../src/e2e-channel.ts'
/** Local relay owner, implemented by the existing RelayRooms/HarmonyRelay provider. */
export interface PairingRoomPublisher { publish(plan: RelayRoomPlan): void; revoke(room: RelayRoomId): void }
/** Approved memory-only capability source. Fixtures supply fixed public values; no production generator is provided or activated here. */
export interface PairingRoomMaterial { readonly room: RelayRoomId; readonly desktopToken: string; readonly phoneToken: string }
/** Only this exact local capability can create or clear the pending room lease. */
export class ShortPairingRooms {
  private readonly active = new Map<RelayRoomId, { readonly expiresAt: number; readonly stop: () => void }>()
  private closed = false
  private failed = false
  private readonly issued = new Set<RelayRoomId>()
  /** @param authority - local provisioning capability, never relay JSON. @param publisher - existing relay owner. @param clock - injected clock. @param maxTtlMs - explicitly approved room lifetime. @param maxRooms - explicit concurrency bound. @param maxIssues - owner-lifetime room issue budget. */
  constructor(private readonly authority: object, private readonly publisher: PairingRoomPublisher, private readonly clock: () => number, private readonly maxTtlMs: number, private readonly maxRooms: number, private readonly maxIssues: number) { if (![maxTtlMs, maxRooms, maxIssues].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('invalid short room policy') }
  /** @param authority - exact local capability. @param material - separate per-role one-use join capabilities held only in memory. @param ttlMs - shorter-than-policy lifetime. @param lifetime - pairing attempt lifetime, including cancellation/revocation. @returns public room/expiry plus role-local capability access; the relay stores digests only. */
  open(authority: object, material: PairingRoomMaterial, ttlMs: number, lifetime: AbortSignal): { readonly room: RelayRoomId; readonly expiresAt: number; desktopToken(): string; phoneToken(): string; close(): void } {
    if (authority !== this.authority || this.closed || lifetime.aborted || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > this.maxTtlMs) throw new Error('short room denied')
    this.sweep(); if (lifetime.aborted) throw new Error('short room denied'); if (this.failed || this.active.size >= this.maxRooms || this.issued.size >= this.maxIssues || this.issued.has(material.room)) throw new Error('short room capacity')
    let desktop: string | undefined = material.desktopToken, phone: string | undefined = material.phoneToken
    const expiresAt = this.clock() + ttlMs, plan = { room: material.room, desktopDigest: relayTokenDigest(desktop), phoneDigest: relayTokenDigest(phone), expiresAt }
    let active = true
    const close = () => { if (!active && !this.active.has(material.room)) return; active = false; desktop = undefined; phone = undefined; lifetime.removeEventListener('abort', aborted); try { this.publisher.revoke(material.room); this.active.delete(material.room) } catch (error) { void error; this.failed = true; throw new Error('short room cleanup failed') } }
    const aborted = () => { try { close() } catch (error) { void error; this.failed = true } }
    this.issued.add(material.room); this.active.set(material.room, { expiresAt, stop: close })
    try { this.publisher.publish(plan) } catch (error) { void error; close(); throw new Error('short room publication failed') }
    lifetime.addEventListener('abort', aborted, { once: true })
    if (lifetime.aborted) { close(); throw new Error('short room denied') }
    const token = (value: string | undefined) => { if (!active || this.clock() >= expiresAt || lifetime.aborted || value === undefined) { close(); throw new Error('short room expired') } return value }
    return { room: material.room, expiresAt, desktopToken: () => token(desktop), phoneToken: () => token(phone), close }
  }
  /** @returns nothing; clears expired capabilities and both associated relay sockets. */
  sweep(): void { for (const value of [...this.active.values()]) if (value.expiresAt <= this.clock()) { try { value.stop() } catch (error) { void error; this.failed = true } } if (this.failed) throw new Error('short room cleanup failed') }
  /** @param authority - local owner. @returns nothing; deny first and attempt every room cleanup before reporting a content-free failure. */
  close(authority: object): void { if (authority !== this.authority) throw new Error('short room local only'); this.closed = true; for (const value of [...this.active.values()]) { try { value.stop() } catch (error) { void error; this.failed = true } } if (this.failed) throw new Error('short room cleanup failed') }
}

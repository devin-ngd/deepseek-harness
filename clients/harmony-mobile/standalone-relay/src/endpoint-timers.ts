/** Offline relay issuance checks against explicitly selected desktop and phone timer limits. */
import { z } from 'zod'
import type { EnabledRelay } from './config.ts'
const positive = z.number().int().positive().max(0x7fffffff)
const timer = z.object({ maxChallengeTtlMs: positive, maxRoomTtlMs: positive }).strict()
const document = z.object({ schema: z.literal('harmony-relay-endpoint-timers/1'), desktop: timer, phone: timer }).strict()
const source = z.object({ relay: timer.loose() }).loose()
/** Public timer projection; source configuration hashes belong to the packaging manifest. */
export type RelayEndpointTimers = z.infer<typeof document>
/** Safe configuration rejection before any trust write or listener allocation. */
export class RelayTimerError extends Error {
  /** @param code - malformed endpoint limits or incompatible broker issuance lifetime. */
  constructor(readonly code: 'invalid-endpoint-timers' | 'challenge-exceeds-endpoint' | 'room-exceeds-endpoint') { super('relay timers: ' + code); this.name = 'RelayTimerError' }
}
/** @param candidate - operator-selected public timer document. @returns strict bounded limits; unknown fields and unsupported versions refuse. */
export function parseRelayEndpointTimers(candidate: unknown): RelayEndpointTimers { const parsed = document.safeParse(candidate); if (!parsed.success) throw new RelayTimerError('invalid-endpoint-timers'); return parsed.data }
/** @param desktop - full desktop configuration; only its declared relay timers are projected. @param phone - full phone configuration; only its declared relay timers are projected. @returns validated public timer document without changing either source policy. */
export function relayEndpointTimers(desktop: unknown, phone: unknown): RelayEndpointTimers {
  const a = source.safeParse(desktop), b = source.safeParse(phone)
  if (!a.success || !b.success) throw new RelayTimerError('invalid-endpoint-timers')
  return parseRelayEndpointTimers({ schema: 'harmony-relay-endpoint-timers/1', desktop: { maxChallengeTtlMs: a.data.relay.maxChallengeTtlMs, maxRoomTtlMs: a.data.relay.maxRoomTtlMs }, phone: { maxChallengeTtlMs: b.data.relay.maxChallengeTtlMs, maxRoomTtlMs: b.data.relay.maxRoomTtlMs } })
}
/** @param config - validated enabled public relay configuration. @param endpoints - parsed limits for both actual endpoint candidates. @returns nothing; refuses issuance longer than either endpoint accepts. */
export function assertRelayTimersCompatible(config: EnabledRelay, endpoints: RelayEndpointTimers): void {
  if (!config.broker.enabled) throw new RelayTimerError('invalid-endpoint-timers')
  if (config.broker.challengeTtlMs > Math.min(endpoints.desktop.maxChallengeTtlMs, endpoints.phone.maxChallengeTtlMs)) throw new RelayTimerError('challenge-exceeds-endpoint')
  if (config.broker.roomTtlMs > Math.min(endpoints.desktop.maxRoomTtlMs, endpoints.phone.maxRoomTtlMs)) throw new RelayTimerError('room-exceeds-endpoint')
}

/** Inactive mobile protocol with explicit fixture transport. It is not a network authentication scheme. */
import { id } from './protocol.ts'
import type { DesktopId, SessionId } from './protocol.ts'
import { isRichJson } from './upstream.ts'
import { isWireNatural, isWireText } from './wire-fields.ts'
import type { Branded, SessionFollowFrame } from './upstream.ts'

/** An authorized test device identity, unrelated to a phone number or account. */
export type DeviceId = Branded<'mobile-device'>
/** Retry correlation for one mobile transport request. */
export type CommandId = Branded<'mobile-command'>
/** Fixed application protocol; guest SDK remains on lumina-rich/1. */
export const MOBILE_LINK_PROTOCOL = 'dsh-mobile-lab/2'
/** Operations exposed to the phone's trusted layer; no arbitrary RPC endpoint or approval response. */
export type MobileOperation = 'task.submit' | 'task.receipt' | 'session.cancel' | 'session.sync'
  | 'rich.mount' | 'rich.saveDraft' | 'rich.invoke' | 'rich.status' | 'rich.snapshot' | 'rich.dispose' | 'approval.list'
  | 'read.projects' | 'read.sessions' | 'read.history' | 'image.open' | 'image.read' | 'image.close'
/** Expected failures carry no user content or credentials. */
export type LinkFailure = 'mock-only' | 'invalid-packet' | 'protocol-mismatch' | 'scope-denied' | 'revoked'
  | 'grant-expired' | 'request-expired' | 'id-conflict' | 'unknown-outcome' | 'stale-mount'
  | 'desktop-offline' | 'phone-suspended' | 'transport-lost' | 'resync-needed' | 'queue-full' | 'closed' | 'approval-expired' | 'read-disabled' | 'read-expired'
/** Failure owner must preserve admission uncertainty instead of assuming rollback. */
export class LinkError extends Error {
  constructor(readonly code: LinkFailure, options?: ErrorOptions) { super(code, options); this.name = 'LinkError' }
}
/** Desktop admission times are epoch milliseconds; this local diagnostic contains no request payload or identity. */
export interface CommandExpiry {
  readonly reason: 'elapsed' | 'future-limit'
  readonly expiresAt: number
  readonly checkedAt: number
  readonly maxCommandTtlMs: number
}
/** The wire code remains request-expired for both rejection reasons; only the trusted owner reads timing. */
export class CommandExpiryError extends LinkError {
  /** @param timing - one desktop clock observation and the unchanged admission limit. */
  constructor(readonly timing: CommandExpiry) { super('request-expired'); this.name = 'CommandExpiryError' }
}
/** Complete bounded JSON sent over the synthetic relay; identity must come from future authenticated transport. */
export interface MobileCommand {
  readonly protocol: typeof MOBILE_LINK_PROTOCOL
  readonly desktopId: DesktopId
  readonly deviceId: DeviceId
  readonly grantEpoch: number
  readonly commandId: CommandId
  /** Absolute epoch milliseconds, checked before desktop dispatch. */
  readonly expiresAt: number
  readonly operation: MobileOperation
  readonly payload: Readonly<Record<string, unknown>>
}
/** Fixture grant is volatile and only constructible through explicit mock configuration. */
export interface DeviceGrant {
  readonly deviceId: DeviceId
  readonly desktopId: DesktopId
  readonly epoch: number
  readonly sessions: readonly SessionId[]
  readonly operations: readonly MobileOperation[]
  readonly expiresAt: number
  readonly revoked: boolean
}
/** Typed canonical frame on the desktop's outbound link. */
export interface OutboundEvent {
  readonly sessionId: SessionId
  readonly relaySeq: number
  readonly frame: SessionFollowFrame
  readonly expiresAt: number
}
/** Clock injection is mandatory for bounded mock TTLs; no wall-clock sleeps are required by unit tests. */
export interface LinkConfig {
  readonly clock: () => number
  readonly maxPacketBytes: number
  readonly maxCommandTtlMs: number
  readonly maxCachedCommands: number
  readonly maxMountedBlocks: number
}

/**
 * Admit only lossless JSON objects with the exact operation fields.
 * @param candidate - untrusted JSON value.
 * @param expected - required names; extras and omissions are rejected.
 * @returns validated field map.
 */
export function fields(candidate: unknown, expected: readonly string[]): Record<string, unknown> {
  if (!isRichJson(candidate) || candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)
    || Object.keys(candidate).length !== expected.length || Object.keys(candidate).some(key => !expected.includes(key))) throw new LinkError('invalid-packet')
  return candidate
}
/** @param value - wire field. @returns finite nonnegative integer, or throws before dispatch. */
export function natural(value: unknown): number {
  if (typeof value !== 'number' || !isWireNatural(value)) throw new LinkError('invalid-packet')
  return value
}
/** @param value - wire field. @returns bounded nonempty string. */
export function text(value: unknown): string {
  if (typeof value !== 'string' || !isWireText(value)) throw new LinkError('invalid-packet')
  return value
}
function operation(value: unknown): MobileOperation {
  switch (value) {
    case 'task.submit': case 'task.receipt': case 'session.cancel': case 'session.sync':
    case 'rich.mount': case 'rich.saveDraft': case 'rich.invoke': case 'rich.status':
    case 'rich.snapshot': case 'rich.dispose': case 'approval.list':
    case 'read.projects': case 'read.sessions': case 'read.history': case 'image.open': case 'image.read': case 'image.close': return value
    default: throw new LinkError('scope-denied')
  }
}
/** @param raw - UTF-8 JSON from the synthetic connection. @param config - validated limits and epoch-millisecond clock. @returns bounded command; one clock observation admits only 0 < remaining TTL <= maxCommandTtlMs. Rejection precedes dispatch. */
export function parseCommand(raw: string, config: LinkConfig): MobileCommand {
  if (new TextEncoder().encode(raw).byteLength > config.maxPacketBytes) throw new LinkError('invalid-packet')
  let decoded: unknown
  try { decoded = JSON.parse(raw) } catch (error) { throw new LinkError('invalid-packet', { cause: error }) }
  const value = fields(decoded, ['protocol', 'desktopId', 'deviceId', 'grantEpoch', 'commandId', 'expiresAt', 'operation', 'payload'])
  if (value.protocol !== MOBILE_LINK_PROTOCOL) throw new LinkError('protocol-mismatch')
  const payload = value.payload
  if (!isRichJson(payload) || payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new LinkError('invalid-packet')
  const expiresAt = natural(value.expiresAt)
  const checkedAt = config.clock()
  if (expiresAt <= checkedAt || expiresAt - checkedAt > config.maxCommandTtlMs) {
    throw new CommandExpiryError({ reason: expiresAt <= checkedAt ? 'elapsed' : 'future-limit', expiresAt, checkedAt, maxCommandTtlMs: config.maxCommandTtlMs })
  }
  return { protocol: MOBILE_LINK_PROTOCOL, desktopId: id<'mobile-desktop'>(text(value.desktopId)),
    deviceId: id<'mobile-device'>(text(value.deviceId)), commandId: id<'mobile-command'>(text(value.commandId)),
    grantEpoch: natural(value.grantEpoch), expiresAt, operation: operation(value.operation), payload }
}

/** Volatile mock authorization owner. No keys, credentials, pairings or persistent grants are created. */
export class MockDeviceRegistry {
  private readonly grants = new Map<DeviceId, DeviceGrant>()
  private readonly listeners = new Set<(deviceId: DeviceId) => Promise<void>>()
  constructor(mode: string, private readonly clock: () => number) { if (mode !== 'mock') throw new LinkError('mock-only') }
  /** @param grant - test fixture consent record. Throws on identity reuse; this is not a real pairing API. */
  addFixtureGrant(grant: DeviceGrant): void {
    if (this.grants.has(grant.deviceId) || grant.revoked || grant.expiresAt <= this.clock()) throw new LinkError('invalid-packet')
    this.grants.set(grant.deviceId, structuredClone(grant))
  }
  /** @param command - admitted envelope. @param sessionId - optional execution scope. @returns matching active fixture grant. */
  authorize(command: MobileCommand, sessionId?: SessionId): DeviceGrant {
    const grant = this.grants.get(command.deviceId)
    if (grant === undefined || grant.desktopId !== command.desktopId || grant.epoch !== command.grantEpoch) throw new LinkError('scope-denied')
    if (grant.revoked) throw new LinkError('revoked')
    if (grant.expiresAt <= this.clock()) throw new LinkError('grant-expired')
    if (!grant.operations.includes(command.operation) || sessionId !== undefined && !grant.sessions.includes(sessionId)) throw new LinkError('scope-denied')
    return structuredClone(grant)
  }
  /** @param callback - lease/link cleanup owner. @returns explicit unsubscribe. */
  onRevoke(callback: (deviceId: DeviceId) => Promise<void>): () => void { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  /** @param deviceId - fixture device to revoke. Waits for all cleanup owners; errors remain visible. */
  async revoke(deviceId: DeviceId): Promise<void> {
    const grant = this.grants.get(deviceId)
    if (grant === undefined) throw new LinkError('scope-denied')
    this.grants.set(deviceId, { ...grant, revoked: true })
    const settled = await Promise.allSettled([...this.listeners].map(callback => callback(deviceId)))
    const rejected = settled.find(result => result.status === 'rejected')
    if (rejected?.status === 'rejected') throw rejected.reason
  }
}
